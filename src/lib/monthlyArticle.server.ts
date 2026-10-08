// The newest blog post, for the monthly letter's "From the field notes" block.
//
// Reads The Kya Project's JSON Feed, the same source the Explore tab uses —
// see blogFeed.server.ts, which owns the URL, the timeout and the cache. This
// used to be a second Webflow client with its own token, its own collection id
// and its own guesses at field slugs, kept separate from the Explore tab's
// copy because neither was worth destabilising. The feed removes the reason
// for both: it is public, newest-first, and states read time and image alt
// itself, so there is one fetch policy and nothing left to guess.
//
// EVERY failure returns null and the letter drops the block: a timeout, a
// network error, bad JSON, an empty feed, a first item with no title or URL. A
// monthly recap of someone's birds is not worth withholding because a blog
// fetch failed, and a half-rendered article block is worse than none.
import { fetchBlogFeed, num, str } from "./blogFeed.server";

/** What the blog card needs. Declared here rather than imported: this module
 *  is the only producer, and the email layer only consumes it. */
export type MonthlyArticle = { title: string; intro: string; url: string; minutes: number; imageUrl?: string; imageAlt?: string };

/** Defensive: the summary comes from a CMS, and a stray tag would render as
 *  literal markup in an email client rather than being ignored. */
const stripHtml = (s: string) => s.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

export async function fetchLatestArticle(): Promise<MonthlyArticle | null> {
  const items = await fetchBlogFeed();
  if (!items || items.length === 0) return null;

  // The feed is newest-first, so the first item is the newest post.
  const item = items[0];

  const title = str(item.title);
  const url = str(item.url);
  // Without both, there is no card worth rendering — a headline with nowhere
  // to go, or a link with no label.
  if (!title || !url) return null;

  const intro = str(item.summary);
  const imageUrl = str(item.image);

  return {
    title: stripHtml(title),
    intro: intro ? stripHtml(intro) : "",
    url,
    // The feed states the real read time; 1 is the floor, never 0 minutes.
    minutes: num(item._kya?.read_minutes) ?? 1,
    imageUrl,
    imageAlt: str(item._kya?.image_alt) ?? "",
  };
}
