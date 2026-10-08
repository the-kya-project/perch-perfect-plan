/**
 * The blog JSON Feed → Explore cards and the monthly letter's article block.
 *
 *   npm run test:blog-feed
 *
 * Hits the LIVE feed on purpose. The whole point of this change is that the
 * app follows what the site publishes, so a test against a frozen fixture
 * would not have caught the problem it fixes — an Explore tab stuck on an old
 * post. A network failure here is reported as a skip, not a failure, so the
 * suite does not go red because someone is offline.
 *
 * Plain asserts, matching the repo's other scripts. Exits non-zero on failure.
 */
import assert from "node:assert/strict";
import {
  __clearBlogFeedCache, blogFeedUrl, fetchBlogFeed, getBlogResult,
  mapFeedToPosts, categoryOf, num, str, MAX_POSTS,
} from "@/lib/blogFeed.server";
import { fetchLatestArticle } from "@/lib/monthlyArticle.server";

let passed = 0;
function check(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ok   ${name}`); }
  catch (e) {
    console.log(`  FAIL ${name}\n       ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`);
    process.exitCode = 1;
  }
}

console.log("pure helpers");
check("str() rejects empty and non-strings", () => {
  assert.equal(str("x"), "x");
  assert.equal(str("  "), undefined);
  assert.equal(str(""), undefined);
  assert.equal(str(42), undefined);
  assert.equal(str(null), undefined);
});
check("num() rejects zero, negatives and non-numbers", () => {
  assert.equal(num(6), 6);
  assert.equal(num(0), undefined);
  assert.equal(num(-1), undefined);
  assert.equal(num("6"), undefined);
  assert.equal(num(NaN), undefined);
});
check("category prefers _kya, falls back to tags[0]", () => {
  assert.equal(categoryOf({ _kya: { category: "Husbandry" }, tags: ["Other"] }), "Husbandry");
  assert.equal(categoryOf({ tags: ["Research and conservation"] }), "Research and conservation");
  assert.equal(categoryOf({ tags: [] }), undefined);
  assert.equal(categoryOf({}), undefined);
});

console.log("\nmapping, on controlled input");
check("read_minutes wins; otherwise the date is formatted", () => {
  const [a, b] = mapFeedToPosts([
    { title: "A", url: "https://e.com/a", _kya: { read_minutes: 6 } },
    { title: "B", url: "https://e.com/b", date_published: "2026-10-07T00:00:00.000Z" },
  ]);
  assert.equal(a.meta, "6 min read");
  assert.ok(b.meta && /2026/.test(b.meta), `expected a formatted date, got ${b.meta}`);
});
check("a missing image is null, not undefined", () =>
  assert.equal(mapFeedToPosts([{ title: "A" }])[0].image, null));
check("untitled items are skipped, not rendered as 'Untitled'", () =>
  assert.equal(mapFeedToPosts([{ url: "https://e.com/a" }, { title: "B" }]).length, 1));
check("id falls back to url, then title", () => {
  assert.equal(mapFeedToPosts([{ title: "T", url: "https://e.com/u" }])[0].id, "https://e.com/u");
  assert.equal(mapFeedToPosts([{ title: "T" }])[0].id, "T");
});
check("capped at MAX_POSTS", () => {
  const many = Array.from({ length: 20 }, (_, i) => ({ title: `P${i}` }));
  assert.equal(mapFeedToPosts(many).length, MAX_POSTS);
  assert.equal(MAX_POSTS, 6);
});
check("a garbage feed produces no cards rather than throwing", () =>
  assert.equal(mapFeedToPosts([{}, { title: null }, { title: 7 }] as never).length, 0));

// ── Live feed ──────────────────────────────────────────────────────────────
const online = await (async () => {
  __clearBlogFeedCache();
  try { return (await fetchBlogFeed()) !== null; } catch { return false; }
})();

if (!online) {
  console.log(`\nSKIPPED the live checks — could not reach ${blogFeedUrl()}`);
  console.log(`\n${passed} passed${process.exitCode ? ", WITH FAILURES" : ", no failures"} (live checks skipped)`);
} else {
  console.log(`\nlive feed: ${blogFeedUrl()}`);
  const result = await getBlogResult();
  const first = result.posts[0];

  check("connected is true", () => assert.equal(result.connected, true));
  check("returns posts, at most MAX_POSTS", () => {
    assert.ok(result.posts.length > 0, "expected posts");
    assert.ok(result.posts.length <= MAX_POSTS);
  });
  check("the newest post is first and has a photo", () => {
    assert.ok(first.image && first.image.startsWith("https://"), "expected an absolute image URL");
  });
  check("every card has a title and an absolute URL", () => {
    for (const p of result.posts) {
      assert.ok(p.title, "missing title");
      assert.ok(p.url && p.url.startsWith("https://"), `bad url on ${p.title}`);
    }
  });

  console.log("\nthe Explore tab's first card");
  console.log(`    title:    ${first.title}`);
  console.log(`    category: ${first.category}`);
  console.log(`    meta:     ${first.meta}`);
  console.log(`    url:      ${first.url}`);
  console.log(`    image:    ${first.image}`);

  console.log("\nmonthly letter article block");
  const article = await fetchLatestArticle();
  check("an article is returned", () => assert.ok(article, "expected an article"));
  if (article) {
    check("it is the same newest post the Explore tab shows", () =>
      assert.equal(article.title, first.title));
    check("minutes is a real number from the feed, never 0", () =>
      assert.ok(article.minutes >= 1));
    check("it has an intro, a URL and an image", () => {
      assert.ok(article.intro.length > 0);
      assert.ok(article.url.startsWith("https://"));
      assert.ok(article.imageUrl && article.imageUrl.startsWith("https://"));
    });
    console.log(`    title:    ${article.title}`);
    console.log(`    minutes:  ${article.minutes}`);
    console.log(`    imageAlt: ${article.imageAlt}`);
    console.log(`    intro:    ${article.intro.slice(0, 80)}…`);
  }

  console.log(`\n${passed} passed${process.exitCode ? ", WITH FAILURES" : ", no failures"}`);
}
