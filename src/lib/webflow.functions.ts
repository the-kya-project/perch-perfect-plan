// Live blog pull from the Webflow CMS for the owner Explore tab.
//
// Runs server-side (createServerFn) so the Webflow API token never reaches the
// client. Returns a { connected, posts } shape so the UI can tell three states
// apart and never look broken:
//   - connected:false        → not yet wired (env vars missing) → "coming soon"
//   - connected:true, []     → wired but no posts (or a transient fetch error)
//   - connected:true, [...]  → render the cards
//
// REQUIRED ENV VARS (set in Vercel; see flag in the PR / chat):
//   WEBFLOW_API_TOKEN          — a Webflow API token with CMS read scope
//   WEBFLOW_BLOG_COLLECTION_ID — the blog posts collection id
//   WEBFLOW_BLOG_BASE_URL      — public base for a post, e.g.
//                                https://www.thekyaproject.com/blog  (post URL = base + "/" + slug)
//
// Webflow field SLUGS vary per collection, so the field mapping below is
// best-effort across common names. The owner must confirm the real slugs for:
// title, slug, featured image, category, and read-time/date.

import { createServerFn } from "@tanstack/react-start";

export type BlogPost = {
  id: string;
  title: string;
  url: string | null;
  image: string | null;
  category: string | null;
  meta: string | null; // read time or published date
};

export type BlogResult = { connected: boolean; posts: BlogPost[] };

function pick(obj: Record<string, any>, keys: string[]): any {
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null && obj[k] !== "") return obj[k];
  }
  return undefined;
}

// Resolve a single value to an image URL. Webflow image fields come back as an
// object { fileId, url, alt } (or an array of them for galleries); we also
// accept a bare image-looking URL string.
function imageUrlFrom(v: any): string | null {
  if (!v) return null;
  if (Array.isArray(v)) {
    for (const x of v) {
      const u = imageUrlFrom(x);
      if (u) return u;
    }
    return null;
  }
  if (typeof v === "object") {
    const u = v.url ?? v.src;
    return typeof u === "string" ? u : null;
  }
  if (typeof v === "string" && /\.(jpe?g|png|webp|gif|avif)(\?|#|$)/i.test(v)) return v;
  return null;
}

// Find the post's image WITHOUT hard-coding the field slug (it varies per
// collection). Prefer fields whose slug looks image-ish; otherwise fall back to
// the first field that resolves to an image URL.
const IMAGE_KEY_HINTS = ["featured", "thumbnail", "hero", "cover", "main-image", "image", "photo"];
function findImage(f: Record<string, any>): string | null {
  const entries = Object.entries(f);
  for (const [k, v] of entries) {
    if (IMAGE_KEY_HINTS.some((h) => k.toLowerCase().includes(h))) {
      const u = imageUrlFrom(v);
      if (u) return u;
    }
  }
  for (const [, v] of entries) {
    const u = imageUrlFrom(v);
    if (u) return u;
  }
  return null;
}

function formatDate(iso?: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export const getBlogPosts = createServerFn({ method: "GET" }).handler(async (): Promise<BlogResult> => {
  const token = process.env.WEBFLOW_API_TOKEN;
  const collectionId = process.env.WEBFLOW_BLOG_COLLECTION_ID;
  const blogBase = (process.env.WEBFLOW_BLOG_BASE_URL ?? "").replace(/\/+$/, "");

  // Not configured yet → render the tasteful "coming soon" state, not an error.
  if (!token || !collectionId) return { connected: false, posts: [] };

  try {
    const res = await fetch(
      `https://api.webflow.com/v2/collections/${collectionId}/items?limit=5&sortBy=lastPublished&sortOrder=desc`,
      { headers: { Authorization: `Bearer ${token}`, "accept-version": "2.0.0" } },
    );
    // Connected but the call failed → empty, never a broken section.
    if (!res.ok) return { connected: true, posts: [] };
    const data = await res.json();
    const items: any[] = Array.isArray(data?.items) ? data.items : [];

    const posts: BlogPost[] = items
      .filter((it) => !it.isDraft && !it.isArchived)
      .slice(0, 5)
      .map((it) => {
        const f: Record<string, any> = it.fieldData ?? {};
        const slug = f.slug ?? it.slug ?? null;
        const readTime = pick(f, ["read-time", "read-time-minutes", "reading-time"]);
        const category = pick(f, ["category-name", "tag", "category"]);
        const dateMeta = formatDate(pick(f, ["published-on", "publish-date", "date"]) ?? it.lastPublished);
        return {
          id: String(it.id),
          title: pick(f, ["name", "title", "post-title"]) ?? "Untitled",
          url: blogBase && slug ? `${blogBase}/${slug}` : null,
          image: findImage(f),
          // Only show a category when it's a plain string. In Webflow v2 a
          // reference field returns an id, not a name — that needs the owner to
          // confirm the field and (if a reference) a follow-up resolve.
          category: typeof category === "string" ? category : null,
          meta: readTime ? `${readTime} min read` : dateMeta,
        };
      });

    return { connected: true, posts };
  } catch {
    return { connected: true, posts: [] };
  }
});
