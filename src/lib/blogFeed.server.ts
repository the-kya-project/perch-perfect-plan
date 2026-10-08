/**
 * The Kya Project's JSON Feed — the single source of blog posts for the app.
 *
 * Replaces the Webflow CMS API. Webflow is being cancelled, and its API needed
 * a token, a collection id and per-collection field-slug guesswork that went
 * stale the moment the collection changed — which is why the Explore tab was
 * sitting on an out-of-date post. This feed is public, needs no auth, is
 * already sorted newest-first, and states its own read time and category, so
 * there is nothing left to guess at.
 *
 * Shared by both consumers so the URL and the fetch policy exist once:
 *   - blogFeed.functions.ts  → the owner Explore tab (a server fn)
 *   - monthlyArticle.server.ts → the monthly letter's "From the field notes"
 *
 * Server-only. There are no secrets here — the feed is public — but there is
 * no reason to ship a feed parser to the browser either, so the Explore tab's
 * server fn imports this lazily inside its handler.
 */

/**
 * Overridable via BLOG_FEED_URL, which exists for pointing a preview deploy at
 * a staging feed. Unset in Vercel today, and nothing needs to be set for this
 * to work.
 *
 * Note this is the apex domain, which 308s to www. fetch follows that, and the
 * feed's own item URLs are apex too, so we stay consistent with what it
 * publishes rather than rewriting its links.
 */
export const BLOG_FEED_URL = "https://thekyaproject.com/feed.json";

/** Short: the Explore tab waits on this before it can render its blog cards. */
const FETCH_TIMEOUT_MS = 5_000;

/** Posts change a few times a month; a stale minute costs nothing. */
const CACHE_TTL_MS = 10 * 60_000;

/**
 * A failed fetch is cached too, briefly. Without this, a feed outage means
 * every single Explore tab render pays the full timeout — the slowest possible
 * version of a section that is supposed to degrade quietly.
 */
const FAILURE_TTL_MS = 60_000;

/** One item, as the feed publishes it. Everything is optional on purpose: this
 *  is someone else's document and we validate rather than assume. */
export type BlogFeedItem = {
  id?: unknown;
  url?: unknown;
  title?: unknown;
  summary?: unknown;
  image?: unknown;
  date_published?: unknown;
  tags?: unknown;
  _kya?: {
    read_minutes?: unknown;
    category?: unknown;
    image_alt?: unknown;
  };
};

type CacheEntry = { at: number; items: BlogFeedItem[] | null };

/**
 * Per-instance, like the other caches here: a warm serverless instance reuses
 * it, a cold one refetches. That is the right trade for a feed read — no
 * shared store to run, and the worst case is one extra fetch.
 */
let cache: CacheEntry | null = null;

/** Visible for tests; nothing in the app needs to clear this. */
export function __clearBlogFeedCache(): void {
  cache = null;
}

export function blogFeedUrl(): string {
  return process.env.BLOG_FEED_URL || BLOG_FEED_URL;
}

/**
 * The feed's items, newest first, or null if we could not get them.
 *
 * Never throws. A timeout, a network error, a non-200, HTML where JSON was
 * expected, or a body that is not a JSON Feed all come back as null, and each
 * caller decides what to show instead — an empty Explore section, or a letter
 * without the article block. Neither is worth an error.
 */
export async function fetchBlogFeed(): Promise<BlogFeedItem[] | null> {
  const now = Date.now();
  if (cache) {
    const ttl = cache.items ? CACHE_TTL_MS : FAILURE_TTL_MS;
    if (now - cache.at < ttl) return cache.items;
  }

  let items: BlogFeedItem[] | null = null;
  try {
    const res = await fetch(blogFeedUrl(), {
      headers: { accept: "application/feed+json, application/json" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (res.ok) {
      const data: unknown = await res.json();
      const maybe = (data as { items?: unknown } | null)?.items;
      // Only an actual array counts. A JSON body of the wrong shape is a
      // failure, not an empty feed, so it gets the short retry window rather
      // than being cached for ten minutes as "no posts".
      if (Array.isArray(maybe)) items = maybe as BlogFeedItem[];
    }
  } catch {
    items = null; // timeout, network, bad JSON
  }

  cache = { at: now, items };
  return items;
}

/** A non-empty string, or undefined. The feed is external input. */
export function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() !== "" ? v : undefined;
}

/** A positive finite number, or undefined. */
export function num(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : undefined;
}

/** The post's category: the feed's own field, else its first tag. */
export function categoryOf(item: BlogFeedItem): string | undefined {
  const fromKya = str(item._kya?.category);
  if (fromKya) return fromKya;
  const tags = item.tags;
  return Array.isArray(tags) ? str(tags[0]) : undefined;
}

// ── The Explore tab's view of the feed ──────────────────────────────────────
// Lives here, beside the fetch, so it can be exercised directly against the
// live feed by scripts/blog-feed.test.ts. The server fn in
// blogFeed.functions.ts is a thin wrapper over getBlogResult().

export type BlogPost = {
  id: string;
  title: string;
  url: string | null;
  image: string | null;
  category: string | null;
  meta: string | null; // read time or published date
};

export type BlogResult = { connected: boolean; posts: BlogPost[] };

/** How many cards the Explore tab shows. */
export const MAX_POSTS = 6;

function formatDate(iso: string | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

/** Feed items → Explore cards, newest first, capped at `limit`. Pure. */
export function mapFeedToPosts(items: BlogFeedItem[], limit = MAX_POSTS): BlogPost[] {
  const posts: BlogPost[] = [];
  for (const item of items) {
    const title = str(item.title);
    // A post with no title is not renderable; skip it rather than print
    // "Untitled" into the Explore tab.
    if (!title) continue;

    const url = str(item.url);
    const minutes = num(item._kya?.read_minutes);
    posts.push({
      // The feed's id is the post URL, which is stable and unique. Fall back to
      // the URL, then the title, so a React key always exists.
      id: str(item.id) ?? url ?? title,
      title,
      url: url ?? null,
      image: str(item.image) ?? null,
      category: categoryOf(item) ?? null,
      meta: minutes ? `${minutes} min read` : formatDate(str(item.date_published)),
    });
    if (posts.length === limit) break;
  }
  return posts;
}

/**
 * What the Explore tab renders. `connected` is always true: it existed to
 * distinguish "Webflow env vars not set yet" from "wired but empty", and a
 * public feed has nothing to configure. Kept so the UI contract is unchanged.
 */
export async function getBlogResult(): Promise<BlogResult> {
  const items = await fetchBlogFeed();
  // Could not read the feed → an empty section, never a broken one.
  if (!items) return { connected: true, posts: [] };
  return { connected: true, posts: mapFeedToPosts(items) };
}
