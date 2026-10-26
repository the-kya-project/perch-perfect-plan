/**
 * Universal Links / App Links: the allow list, the two association files, the
 * Android manifest and iOS entitlement staying in step with it, the in-app
 * handler, and which tracker host an email link gets.
 *
 *   npm run test:app-links
 *
 * Plain asserts, like the other scripts/*.test.ts. Exits non-zero on failure.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

process.env.CARE_PLAN_REMINDER_SECRET ||= "test-secret-not-real";

const L = await import("@/lib/appLinks");
const C = await import("@/lib/emailClicks.server");

let passed = 0;
async function check(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    passed++;
    console.log(`  ok   ${name}`);
  } catch (e) {
    console.log(`  FAIL ${name}`);
    console.log(`       ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`);
    process.exitCode = 1;
  }
}

const APP = "https://app.thekyaproject.com";
const LINKS = "https://links.thekyaproject.com";

// Paths that must never open the app.
const BROWSER_ONLY = [
  "/auth", "/welcome", "/invite/abc", "/handoff/abc", "/r/abc.def", "/api/public/unsubscribe/x/y/z",
  "/sitter/tok", "/get", "/get-app", "/review", "/reset-password", "/confirm-email", "/privacy", "/terms", "/delete-account",
];

console.log("allow list");
await check("home and every app screen open the app", () => {
  assert.ok(L.isAppLinkPath("/"));
  for (const p of ["/dashboard", "/birds/123", "/birds/new", "/birds/123/plan/editor", "/account/security", "/notifications/settings", "/scans/settings"]) {
    assert.ok(L.isAppLinkPath(p), p);
  }
});
await check("sign-in, invites, tracker, sitter and public pages stay in the browser", () => {
  for (const p of BROWSER_ONLY) assert.ok(!L.isAppLinkPath(p), p);
});
await check("a prefix only matches a whole segment (/birdsong is not /birds)", () => {
  assert.ok(!L.isAppLinkPath("/birdsong"));
  assert.ok(!L.isAppLinkPath("/accounting"));
});

console.log("apple-app-site-association");
const aasa = L.appleAppSiteAssociation();
const comps = aasa.applinks.details[0].components as Array<Record<string, unknown>>;
await check("one app id: team DT93FSYJ9C + bundle com.thekyaproject.app", () => {
  assert.deepEqual(aasa.applinks.details[0].appIDs, ["DT93FSYJ9C.com.thekyaproject.app"]);
});
await check("the ?code= exclusion comes first, so sign-in redirects never open the app", () => {
  assert.equal(comps[0].exclude, true);
  assert.deepEqual(comps[0]["?"], { code: "*" });
  assert.equal(comps[0]["/"], "*");
});
await check("lists home plus each prefix and its /* twin, nothing else", () => {
  const paths = comps.slice(1).map((c) => c["/"]);
  const want = ["/", ...L.APP_LINK_PREFIXES.flatMap((p) => [p, `${p}/*`])];
  assert.deepEqual(paths, want);
});
await check("no browser-only path appears", () => {
  const paths = comps.map((c) => String(c["/"]));
  for (const p of ["/auth", "/welcome", "/invite", "/handoff", "/r", "/sitter", "/api"]) {
    assert.ok(!paths.some((x) => x === p || x.startsWith(`${p}/`)), p);
  }
});
await check("links.thekyaproject.com lists only the tracker", () => {
  const linksComps = L.appleAppSiteAssociation(L.CLICK_LINK_HOST).applinks.details[0].components;
  assert.deepEqual(linksComps.map((c) => c["/"]), ["/r/*"]);
});
await check("is plain JSON with no webcredentials block", () => {
  const j = JSON.parse(JSON.stringify(aasa));
  assert.deepEqual(Object.keys(j), ["applinks"]);
});

console.log("assetlinks.json");
const FP = Array.from({ length: 32 }, (_, i) => i.toString(16).padStart(2, "0")).join(":");
await check("no fingerprint configured → []", () => assert.deepEqual(L.assetLinks(L.parseFingerprints(undefined)), []));
await check("fingerprints are trimmed, upper-cased, and junk is dropped", () => {
  assert.deepEqual(L.parseFingerprints(` ${FP} , nope, AB:CD`), [FP.toUpperCase()]);
});
await check("one statement for com.thekyaproject.app with handle_all_urls", () => {
  const s = L.assetLinks([FP.toUpperCase()]);
  assert.equal(s.length, 1);
  assert.deepEqual(s[0].relation, ["delegate_permission/common.handle_all_urls"]);
  assert.equal(s[0].target.package_name, "com.thekyaproject.app");
  assert.deepEqual(s[0].target.sha256_cert_fingerprints, [FP.toUpperCase()]);
});

console.log("native config matches the list");
const manifest = readFileSync("android/app/src/main/AndroidManifest.xml", "utf8");
const filters = [...manifest.matchAll(/<intent-filter android:autoVerify="true">([\s\S]*?)<\/intent-filter>/g)].map((m) => m[1]);
const attr = (block: string, name: string) => [...block.matchAll(new RegExp(`android:${name}="([^"]*)"`, "g"))].map((m) => m[1]);
const appFilter = filters.find((f) => attr(f, "host").includes(L.APP_LINK_HOST));
const linksFilter = filters.find((f) => attr(f, "host").includes(L.CLICK_LINK_HOST));
await check("Android: two autoVerify filters, one per host, https only", () => {
  assert.equal(filters.length, 2);
  for (const f of filters) {
    assert.deepEqual(attr(f, "scheme"), ["https"]);
    assert.ok(f.includes("android.intent.action.VIEW") && f.includes("category.BROWSABLE") && f.includes("category.DEFAULT"));
  }
});
await check("Android: app host paths are exactly / plus each prefix and prefix/", () => {
  assert.ok(appFilter);
  assert.deepEqual(attr(appFilter!, "path").sort(), ["/", ...L.APP_LINK_PREFIXES].sort());
  assert.deepEqual(attr(appFilter!, "pathPrefix").sort(), L.APP_LINK_PREFIXES.map((p) => `${p}/`).sort());
  assert.deepEqual(attr(appFilter!, "pathPattern"), []);
});
await check("Android: links host handles only /r/", () => {
  assert.ok(linksFilter);
  assert.deepEqual(attr(linksFilter!, "pathPrefix"), ["/r/"]);
  assert.deepEqual(attr(linksFilter!, "path"), []);
});
await check("iOS: Associated Domains lists both hosts", () => {
  const ent = readFileSync("ios/App/App/App.entitlements", "utf8");
  assert.ok(ent.includes("<key>com.apple.developer.associated-domains</key>"));
  assert.ok(ent.includes(`<string>applinks:${L.APP_LINK_HOST}</string>`));
  assert.ok(ent.includes(`<string>applinks:${L.CLICK_LINK_HOST}</string>`));
});
await check("Capacitor marks the app's requests with KyaApp", () => {
  assert.match(readFileSync("capacitor.config.ts", "utf8"), /appendUserAgent:\s*'KyaApp'/);
});

console.log("incoming links in the app");
await check("an app screen routes in-app, query and hash kept", () => {
  assert.deepEqual(L.incomingLink(`${APP}/birds/new?next=weight#top`), { kind: "route", href: "/birds/new?next=weight#top" });
  assert.deepEqual(L.incomingLink(`${APP}/`), { kind: "route", href: "/" });
});
await check("a tracked link on links. loads the same /r/ on the app origin", () => {
  assert.deepEqual(L.incomingLink(`${LINKS}/r/abc.def`), { kind: "load", href: `${APP}/r/abc.def` });
});
await check("a ?code= sign-in redirect is ignored", () => assert.equal(L.incomingLink(`${APP}/dashboard?code=xyz`), null));
await check("browser-only paths, other hosts, http and junk are ignored", () => {
  for (const p of BROWSER_ONLY) assert.equal(L.incomingLink(`${APP}${p}`), null, p);
  assert.equal(L.incomingLink(`${LINKS}/dashboard`), null);
  assert.equal(L.incomingLink(`${LINKS}/r/a/b`), null);
  assert.equal(L.incomingLink("https://evil.example/birds/1"), null);
  assert.equal(L.incomingLink("http://app.thekyaproject.com/birds/1"), null);
  assert.equal(L.incomingLink("not a url"), null);
});

console.log("tracker host for email links");
await check("unset → every tracked link stays on app.", () => {
  assert.equal(L.clickOriginFor(`${APP}/birds/new`, undefined), APP);
  assert.equal(L.clickOriginFor(`${APP}/birds/new`, ""), APP);
});
await check("set → app screens use it; blog, store and browser-only pages don't", () => {
  assert.equal(L.clickOriginFor(`${APP}/birds/new?next=weight`, `${LINKS}/`), LINKS);
  assert.equal(L.clickOriginFor(`${APP}/`, LINKS), LINKS);
  assert.equal(L.clickOriginFor("https://thekyaproject.com/blog/x", LINKS), APP);
  assert.equal(L.clickOriginFor(`${APP}/get-app`, LINKS), APP);
  assert.equal(L.clickOriginFor(`${APP}/welcome`, LINKS), APP);
});
await check("a malformed EMAIL_CLICK_ORIGIN is ignored", () => {
  assert.equal(L.clickOriginFor(`${APP}/birds/new`, "links.thekyaproject.com"), APP);
  assert.equal(L.clickOriginFor(`${APP}/birds/new`, "http://links.thekyaproject.com"), APP);
  assert.equal(L.clickOriginFor(`${APP}/birds/new`, "https://links.thekyaproject.com/x"), APP);
});
const payload = (d: string) => ({ u: "00000000-0000-0000-0000-000000000001", e: "welcome" as const, v: null, k: "cta_primary", d, t: 0 });
await check("trackedUrl follows EMAIL_CLICK_ORIGIN, and the token still verifies", async () => {
  const before = process.env.EMAIL_CLICK_ORIGIN;
  process.env.EMAIL_CLICK_ORIGIN = LINKS;
  try {
    const u = await C.trackedUrl(payload(`${APP}/dashboard`));
    assert.ok(u.startsWith(`${LINKS}/r/`), u);
    assert.ok(await C.readClickToken(u.slice(`${LINKS}/r/`.length)));
    assert.ok((await C.trackedUrl(payload("https://thekyaproject.com/blog/a"))).startsWith(`${APP}/r/`));
    assert.ok((await C.trackedUrl(payload(`${APP}/dashboard`), APP)).startsWith(`${APP}/r/`), "explicit base wins");
  } finally {
    if (before === undefined) delete process.env.EMAIL_CLICK_ORIGIN;
    else process.env.EMAIL_CLICK_ORIGIN = before;
  }
});

console.log("smart app banner");
await check("app screens get the banner, pointing at the same page", () => {
  assert.equal(L.smartAppBannerContent("/birds/new", "?next=weight"), "app-id=6795267221, app-argument=https://app.thekyaproject.com/birds/new?next=weight");
  assert.equal(L.smartAppBannerContent("/", ""), "app-id=6795267221, app-argument=https://app.thekyaproject.com/");
  assert.equal(L.smartAppBannerContent("/dashboard", "next=x"), "app-id=6795267221, app-argument=https://app.thekyaproject.com/dashboard?next=x");
});
await check("sitter, sign-in, invite and public pages get no banner", () => {
  for (const p of BROWSER_ONLY) assert.equal(L.smartAppBannerContent(p, ""), null, p);
});
await check("a ?code= sign-in redirect gets no banner", () => assert.equal(L.smartAppBannerContent("/dashboard", "?code=abc"), null));

console.log("open in the app (kyaco://)");
const O = await import("@/lib/openInApp");
await check("app screens open the same screen, query kept", () => {
  assert.equal(O.openInAppPath("/birds/new", "?next=weight"), "/birds/new?next=weight");
  assert.equal(O.openInAppPath("/dashboard", ""), "/dashboard");
  assert.equal(O.appSchemeUrl("/birds/new?next=weight"), "kyaco://open/birds/new?next=weight");
});
await check("/auth opens the screen the email was for", () => {
  assert.equal(O.openInAppPath("/auth", "?redirect=%2Fbirds%2Fnew%3Fnext%3Dweight"), "/birds/new?next=weight");
  assert.equal(O.openInAppPath("/auth", ""), null, "no redirect: nothing to open");
  assert.equal(O.openInAppPath("/auth", "?redirect=%2Fsitter%2Ftok"), null, "sitter link isn't an app screen");
  assert.equal(O.openInAppPath("/auth", "?redirect=%2F%2Fevil.example"), null, "no open redirect");
});
await check("sitter, sign-in, invite and public pages don't offer it", () => {
  for (const p of BROWSER_ONLY) if (p !== "/auth") assert.equal(O.openInAppPath(p, ""), null, p);
  assert.equal(O.openInAppPath("/dashboard", "?code=abc"), null);
});
await check("the app routes kyaco:// links to app screens only", () => {
  assert.deepEqual(L.incomingLink("kyaco://open/birds/new?next=weight"), { kind: "route", href: "/birds/new?next=weight" });
  assert.deepEqual(L.incomingLink("kyaco://open"), { kind: "route", href: "/" });
  assert.deepEqual(L.incomingLink("kyaco://open/sitter/tok"), { kind: "route", href: "/dashboard" });
  assert.deepEqual(L.incomingLink("kyaco://open/dashboard?code=x"), { kind: "route", href: "/dashboard" });
  assert.equal(L.incomingLink("kya://callback?code=x"), null, "the old OAuth scheme is ignored");
});
await check("Info.plist registers the scheme", () => {
  const plist = readFileSync("ios/App/App/Info.plist", "utf8");
  assert.ok(plist.includes(`<string>${O.APP_URL_SCHEME}</string>`));
});

console.log(`\n${passed} passed${process.exitCode ? ", some FAILED" : ""}`);
