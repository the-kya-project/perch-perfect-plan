// Live blog pull for the owner Explore tab, from The Kya Project's JSON Feed.
//
// Replaces the Webflow CMS pull (webflow.functions.ts, deleted). The result
// shape is unchanged so the Explore tab did not have to be rewritten:
//
//   - connected:true, [...]  → render the cards
//   - connected:true, []     → no posts, or a transient fetch error
//
// `connected` is now always true and kept only so the UI contract holds. It
// existed to distinguish "env vars not set yet" from "wired but empty", and
// the feed needs no configuration — there is nothing left to be unconfigured.
// The Explore tab's "Stories are on the way" branch is therefore unreachable;
// it is left in place as a harmless fallback rather than ripped out.
//
// The fetch, the cache and the mapping all live in blogFeed.server.ts, which
// the monthly letter shares and which the test script exercises directly.

import { createServerFn } from "@tanstack/react-start";

export type { BlogPost, BlogResult } from "./blogFeed.server";
import type { BlogResult } from "./blogFeed.server";

export const getBlogPosts = createServerFn({ method: "GET" }).handler(async (): Promise<BlogResult> => {
  // Imported inside the handler so the feed module stays out of the client
  // bundle, as the other server-only helpers do.
  const { getBlogResult } = await import("./blogFeed.server");
  return getBlogResult();
});

export type { ExplorePost } from "./blogFeed.server";

/** The iPhone Duo's Explore: every post, with summaries and has-body flags. */
export const getExploreFeed = createServerFn({ method: "GET" }).handler(async () => {
  const { getExploreResult } = await import("./blogFeed.server");
  return getExploreResult();
});

/** One post's body for the Duo's reader, or null (then the post opens on the website). */
export const getBlogArticle = createServerFn({ method: "GET" })
  .inputValidator((d: { id: string }) => {
    if (!d || typeof d.id !== "string" || !d.id || d.id.length > 2000) throw new Error("Bad article id.");
    return { id: d.id };
  })
  .handler(async ({ data }) => {
    const { getArticleBody } = await import("./blogFeed.server");
    return getArticleBody(data.id);
  });
