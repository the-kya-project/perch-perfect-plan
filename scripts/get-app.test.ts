/**
 * /get-app campaign attribution — URL building and UA classification.
 *
 *   npm run test:get-app
 *
 * Pure functions only; the route itself is exercised over HTTP separately.
 * Plain asserts, since the repo carries no test runner. Exits non-zero on
 * failure so it can gate a merge.
 *
 * TEST_PT_0000 is a DUMMY provider token. The real one is an account credential
 * and lives only in Vercel (Production + Preview) and a local, gitignored .env.
 */
import assert from "node:assert/strict";
import {
  appStoreUrl, campaignToken, detectInAppBrowser, detectPlatform, isBot,
  playStoreUrl, readUtms, resolveTarget, withUtms, STORE, UTM_MAX_LENGTH,
} from "@/lib/storeRedirect.server";

let passed = 0;
function check(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ok   ${name}`); }
  catch (e) {
    console.log(`  FAIL ${name}\n       ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`);
    process.exitCode = 1;
  }
}

const UA = {
  iphone: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
  android: "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36",
  desktop: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
  tiktokIos: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 BytedanceWebview/d8a21c musical_ly_34.1.0",
  instagram: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Instagram 300.0.0.0",
  facebook: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 [FBAN/FBIOS;FBAV/450.0]",
  bytespider: "Mozilla/5.0 (compatible; Bytespider; https://zhanzhang.toutiao.com/)",
  fbExternal: "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
  slack: "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)",
};
const u = (qs: string) => new URL(`https://app.thekyaproject.com/get-app${qs}`);
const TIKTOK = readUtms(u("?utm_source=tiktok&utm_campaign=app_launch&utm_content=morning"));
const NONE = readUtms(u(""));

console.log("campaign token");
check("source_content, lowercased", () => assert.equal(campaignToken(TIKTOK), "tiktok_morning"));
check("disallowed characters fold to underscore", () =>
  assert.equal(campaignToken({ utm_source: "Tik Tok!", utm_content: "morning+v2" }), "tik_tok_morning_v2"));
check("hyphens are kept — Apple accepts them", () =>
  assert.equal(campaignToken({ utm_source: "tiktok", utm_content: "ad-1" }), "tiktok_ad-1"));
check("the spec's example: tiktok + ad1", () =>
  assert.equal(campaignToken({ utm_source: "tiktok", utm_content: "ad1" }), "tiktok_ad1"));
check("falls back to utm_campaign when there is no source", () =>
  assert.equal(campaignToken({ utm_campaign: "launch", utm_medium: "paid_social" }), "launch"));
check("source wins over campaign", () =>
  assert.equal(campaignToken({ utm_source: "tiktok", utm_campaign: "launch" }), "tiktok"));
check("never ends on a separator after the 40-char cap", () => {
  const t = campaignToken({ utm_source: "x".repeat(39), utm_content: "y" })!;
  assert.equal(t, "x".repeat(39));
  assert.ok(!/[_-]$/.test(t));
});
check("capped at Apple's 40 characters", () => {
  const t = campaignToken({ utm_source: "x".repeat(30), utm_content: "y".repeat(30) })!;
  assert.equal(t.length, 40);
});
check("no UTMs -> null", () => assert.equal(campaignToken(NONE), null));
check("source alone still builds a token", () =>
  assert.equal(campaignToken({ utm_source: "tiktok" }), "tiktok"));

console.log("\nUTM validation");
check("each value is capped at 100 characters", () => {
  const long = "a".repeat(250);
  const utms = readUtms(u(`?utm_source=${long}&utm_campaign=${long}`));
  assert.equal(utms.utm_source!.length, UTM_MAX_LENGTH);
  assert.equal(utms.utm_campaign!.length, UTM_MAX_LENGTH);
});
check("unexpected query params are ignored, not carried", () => {
  const utms = readUtms(u("?utm_source=tiktok&redirect=https://evil.example&fbclid=xyz"));
  assert.deepEqual(utms, { utm_source: "tiktok" });
});
check("all four UTMs are read, and only those", () => {
  const utms = readUtms(u("?utm_source=a&utm_medium=b&utm_campaign=c&utm_content=d&utm_term=e"));
  assert.deepEqual(utms, { utm_source: "a", utm_medium: "b", utm_campaign: "c", utm_content: "d" });
});
check("a crafted param cannot reach the Play referrer", () => {
  const utms = readUtms(u("?utm_source=tiktok&referrer=https://evil.example"));
  const url = new URL(playStoreUrl(utms));
  assert.equal(url.searchParams.get("referrer"), "utm_source=tiktok");
  assert.equal(url.origin + url.pathname, "https://play.google.com/store/apps/details");
});

console.log("\nthe only two destinations are the stores");
check("App Store URL is always an apple.com URL", () => {
  process.env.APPLE_PROVIDER_TOKEN = "TEST_PT_0000";
  for (const qs of ["", "?utm_source=tiktok", "?utm_source=//evil.example", "?utm_content=%2F%2Fevil"]) {
    assert.equal(new URL(appStoreUrl(readUtms(u(qs)))).origin, "https://apps.apple.com");
  }
});
check("Play URL is always a play.google.com URL", () => {
  for (const qs of ["", "?utm_source=tiktok", "?utm_source=//evil.example"]) {
    assert.equal(new URL(playStoreUrl(readUtms(u(qs)))).origin, "https://play.google.com");
  }
});

console.log("\nApp Store URL");
check("with token set: pt, ct and mt=8", () => {
  process.env.APPLE_PROVIDER_TOKEN = "TEST_PT_0000";
  assert.equal(appStoreUrl(TIKTOK),
    `${STORE.ios}?pt=TEST_PT_0000&ct=tiktok_morning&mt=8`);
});
check("token unset -> plain URL, no crash", () => {
  delete process.env.APPLE_PROVIDER_TOKEN;
  assert.equal(appStoreUrl(TIKTOK), STORE.ios);
});
check("no UTMs -> plain URL even with the token set", () => {
  process.env.APPLE_PROVIDER_TOKEN = "TEST_PT_0000";
  assert.equal(appStoreUrl(NONE), STORE.ios);
});

console.log("\nPlay Store URL");
check("referrer is one encoded value", () =>
  assert.equal(playStoreUrl(TIKTOK),
    `${STORE.android}&referrer=${encodeURIComponent("utm_source=tiktok&utm_campaign=app_launch&utm_content=morning")}`));
check("only the params present are included", () =>
  assert.equal(playStoreUrl({ utm_source: "tiktok" }),
    `${STORE.android}&referrer=${encodeURIComponent("utm_source=tiktok")}`));
check("no UTMs -> unchanged URL", () => assert.equal(playStoreUrl(NONE), STORE.android));
check("the encoded referrer decodes back to the original", () => {
  const url = new URL(playStoreUrl(TIKTOK));
  assert.equal(url.searchParams.get("referrer"), "utm_source=tiktok&utm_campaign=app_launch&utm_content=morning");
});

console.log("\nstore override still forces the store");
check("?store=ios on Android -> ios", () => assert.equal(resolveTarget(UA.android, "ios"), "ios"));
check("?store=android on iPhone -> android", () => assert.equal(resolveTarget(UA.iphone, "android"), "android"));
check("no override: iPhone -> ios", () => assert.equal(resolveTarget(UA.iphone, null), "ios"));
check("no override: Android -> android", () => assert.equal(resolveTarget(UA.android, null), "android"));
check("no override: desktop -> chooser", () => assert.equal(resolveTarget(UA.desktop, null), "chooser"));
check("TikTok in-app on iOS still resolves to ios", () => assert.equal(resolveTarget(UA.tiktokIos, null), "ios"));

console.log("\nthe email's existing links are unchanged");
check("utm_content=button on iPhone -> App Store", () =>
  assert.equal(resolveTarget(UA.iphone, null), "ios"));
check("badge-ios forces the App Store from Android", () =>
  assert.equal(resolveTarget(UA.android, "ios"), "ios"));
check("badge-android forces Play from iPhone", () =>
  assert.equal(resolveTarget(UA.iphone, "android"), "android"));
check("email links gain pt/ct too — ct=email_button", () => {
  process.env.APPLE_PROVIDER_TOKEN = "TEST_PT_0000";
  // The email carries utm_source=email, so it DOES build a token. Asserted
  // explicitly because these links are already in people's inboxes.
  const emailUtms = readUtms(u("?utm_source=email&utm_campaign=app-launch&utm_content=button"));
  assert.equal(appStoreUrl(emailUtms), `${STORE.ios}?pt=TEST_PT_0000&ct=email_button&mt=8`);
});

console.log("\nthe bio link's sample URL, end to end");
{
  const sample = readUtms(u("?utm_source=tiktok&utm_medium=paid_social&utm_campaign=launch&utm_content=ad1"));
  check("ct is tiktok_ad1", () => assert.equal(campaignToken(sample), "tiktok_ad1"));
  check("App Store link carries pt, ct and mt=8", () => {
    process.env.APPLE_PROVIDER_TOKEN = "TEST_PT_0000";
    assert.equal(appStoreUrl(sample), `${STORE.ios}?pt=TEST_PT_0000&ct=tiktok_ad1&mt=8`);
  });
  check("Play referrer round-trips all four UTMs", () => {
    const got = new URL(playStoreUrl(sample)).searchParams.get("referrer");
    assert.equal(got, "utm_source=tiktok&utm_medium=paid_social&utm_campaign=launch&utm_content=ad1");
  });
}

console.log("\nplatform");
check("iPhone", () => assert.equal(detectPlatform(UA.iphone), "ios"));
check("Android", () => assert.equal(detectPlatform(UA.android), "android"));
check("desktop", () => assert.equal(detectPlatform(UA.desktop), "desktop"));
check("empty UA -> other", () => assert.equal(detectPlatform(""), "other"));

console.log("\nin-app browser");
check("TikTok (BytedanceWebview/musical_ly)", () => assert.equal(detectInAppBrowser(UA.tiktokIos), "tiktok"));
check("Instagram", () => assert.equal(detectInAppBrowser(UA.instagram), "instagram"));
check("Facebook (FBAN/FBAV)", () => assert.equal(detectInAppBrowser(UA.facebook), "facebook"));
check("plain Safari -> null", () => assert.equal(detectInAppBrowser(UA.iphone), null));

console.log("\nbots are flagged, not dropped");
check("Bytespider (TikTok's crawler)", () => assert.equal(isBot(UA.bytespider), true));
check("facebookexternalhit", () => assert.equal(isBot(UA.fbExternal), true));
check("Slackbot", () => assert.equal(isBot(UA.slack), true));
check("generic crawler", () => assert.equal(isBot("SomeCrawler/2.0"), true));
check("a real iPhone is not a bot", () => assert.equal(isBot(UA.iphone), false));
check("TikTok's in-app browser is NOT a bot", () => assert.equal(isBot(UA.tiktokIos), false));

console.log("\nchooser badge links carry the UTMs");
check("ios badge", () =>
  assert.equal(withUtms("/get-app?store=ios", TIKTOK),
    "/get-app?store=ios&utm_source=tiktok&utm_campaign=app_launch&utm_content=morning"));
check("android badge", () =>
  assert.equal(withUtms("/get-app?store=android", TIKTOK),
    "/get-app?store=android&utm_source=tiktok&utm_campaign=app_launch&utm_content=morning"));
check("no UTMs -> path untouched", () => assert.equal(withUtms("/get-app?store=ios", NONE), "/get-app?store=ios"));

console.log(`\n${passed} passed${process.exitCode ? ", WITH FAILURES" : ", no failures"}`);
