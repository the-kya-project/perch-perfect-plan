// The newest blog post, for the monthly letter's "From the field notes" block.
//
// A server-only sibling of src/lib/webflow.functions.ts, which is a
// createServerFn for the owner Explore tab and so cannot be called from a cron
// route. Same env vars, same collection, deliberately not a refactor of that
// file: the Explore tab works and is not worth destabilising for this.
//
//   WEBFLOW_API_TOKEN          — CMS read scope
//   WEBFLOW_BLOG_COLLECTION_ID — the blog posts collection
//   WEBFLOW_BLOG_BASE_URL      — e.g. https://www.thekyaproject.com/blog
//
// EVERY failure returns null and the letter drops the block: unset vars, a bad
// token, a Webflow outage, a collection whose field slugs don't match. A
// monthly recap of someone's birds is not worth withholding because a blog
// fetch failed, and a half-rendered article block is worse than none.
//
// FIELD SLUGS ARE UNCONFIRMED. docs/email-redesign/README.md names them as
// `name`, `blog-intro`, `blog-image`, `slug` and `blog-summary`, but nobody has
// verified those against the live collection — the Explore tab hedges the same
// way. The candidates below are tried in order, so confirming the real slugs is
// a matter of deleting the wrong guesses, not rewriting this.
import type { MonthlyArticle } from "./emailTemplates";

const WORDS_PER_MINUTE = 230;

function pick(f: Record<string, any>, keys: string[]): any {
  for (const k of keys) {
    const v = f?.[k];
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return undefined;
}

function imageUrl(v: any): string | undefined {
  if (!v) return undefined;
  if (Array.isArray(v)) return imageUrl(v[0]);
  if (typeof v === "object") return typeof v.url === "string" ? v.url : undefined;
  return typeof v === "string" && /^https?:\/\//.test(v) ? v : undefined;
}

const stripHtml = (s: string) => s.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

/** Minutes to read, from the summary, rounded up and never zero. */
function readMinutes(summary: string | undefined): number {
  const words = summary ? stripHtml(summary).split(" ").filter(Boolean).length : 0;
  return Math.max(1, Math.round(words / WORDS_PER_MINUTE) || 1);
}

export async function fetchLatestArticle(): Promise<MonthlyArticle | null> {
  const token = process.env.WEBFLOW_API_TOKEN;
  const collection = process.env.WEBFLOW_BLOG_COLLECTION_ID;
  const base = (process.env.WEBFLOW_BLOG_BASE_URL || "").replace(/\/+$/, "");
  if (!token || !collection || !base) return null;

  try {
    const res = await fetch(`https://api.webflow.com/v2/collections/${collection}/items/live?limit=20`, {
      headers: { authorization: `Bearer ${token}`, accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const items = ((await res.json()) as { items?: any[] }).items ?? [];

    // Newest first: the collection's own date field, else Webflow's timestamps.
    const dateOf = (it: any) =>
      Date.parse(pick(it?.fieldData ?? {}, ["date", "published-date", "publish-date"]) ?? "") ||
      Date.parse(it?.lastPublished ?? it?.createdOn ?? "") ||
      0;
    const newest = items
      .filter((it) => !it?.isDraft && !it?.isArchived)
      .sort((a, b) => dateOf(b) - dateOf(a))[0];
    if (!newest) return null;

    const f = (newest.fieldData ?? {}) as Record<string, any>;
    const title = pick(f, ["name", "title", "post-title"]);
    const slug = pick(f, ["slug"]);
    if (typeof title !== "string" || typeof slug !== "string") return null;

    const intro = pick(f, ["blog-intro", "intro", "excerpt", "summary", "post-summary"]);
    const summary = pick(f, ["blog-summary", "post-body", "body", "content"]);

    return {
      title: stripHtml(title),
      intro: intro ? stripHtml(String(intro)) : "",
      url: `${base}/${slug}`,
      minutes: readMinutes(typeof summary === "string" ? summary : undefined),
      imageUrl: imageUrl(pick(f, ["blog-image", "image", "main-image", "thumbnail"])),
      imageAlt: "",
    };
  } catch {
    return null; // timeout, network, bad JSON — the letter goes without it
  }
}
