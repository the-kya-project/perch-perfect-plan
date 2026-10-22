/**
 * The email click tracker: signed links, what gets wrapped, link keys, and the
 * bot rules.
 *
 *   npm run test:email-clicks
 *
 * Plain asserts, like the other scripts/*.test.ts. Exits non-zero on failure.
 */
import assert from "node:assert/strict";

process.env.EMAIL_LINK_SECRET ||= "test-secret-not-real";

const C = await import("@/lib/emailClicks.server");
const { prepareContent } = await import("@/lib/brevoEmail.server");
const { buildSeriesWeighingEmail, buildAddFirstBirdEmail, buildFlockReportEmail } = await import("@/lib/flockEmails");
const { unsubUrl } = await import("@/lib/unsubscribe");

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
const USER = "11111111-2222-3333-4444-555555555555";
const P = { u: USER, e: "series_weighing" as const, v: "no_bird" as const, k: "cta_primary", d: `${APP}/birds/new?next=weight`, t: 1_790_000_000_000 };

console.log("signed links");
await check("round-trips", async () => assert.deepEqual(await C.readClickToken(await C.clickToken(P)), P));
await check("a changed payload is rejected", async () => {
  const [body, sig] = (await C.clickToken(P)).split(".");
  const evil = Buffer.from(JSON.stringify({ ...P, d: `${APP}/account` })).toString("base64url");
  assert.equal(await C.readClickToken(`${evil}.${sig}`), null);
  assert.ok(body);
});
await check("a truncated token is rejected", async () => assert.equal(await C.readClickToken((await C.clickToken(P)).slice(0, -3)), null));
await check("garbage is rejected without throwing", async () => assert.equal(await C.readClickToken("not-a-token"), null));
await check("even a validly signed link can't point off our hosts", async () =>
  assert.equal(await C.readClickToken(await C.clickToken({ ...P, d: "https://evil.example/phish" })), null));
await check("the redirect URL is /r/<token>", async () => assert.match(await C.trackedUrl(P), /^https:\/\/app\.thekyaproject\.com\/r\/[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/));

console.log("\nwhat is never wrapped");
for (const [label, url] of [
  ["unsubscribe", unsubUrl(APP, USER, "onboarding")],
  ["any /api/ link", `${APP}/api/public/chart/x/y/z`],
  ["a sitter token link", `${APP}/sitter/abc123`],
  ["a household invite", `${APP}/invite/abc123`],
  ["a handoff", `${APP}/handoff/abc123`],
  ["password reset", `${APP}/reset-password`],
  ["a ?token= param", `${APP}/birds/x?token=abc`],
  ["a ?code= param", `${APP}/auth?code=abc`],
  ["a stylesheet", `${APP}/fonts/fonts.css`],
  ["an image", `${APP}/brand/email/juno.jpg`],
  ["mailto", "mailto:brittany@thekyaproject.com"],
  ["another site", "https://example.com/"],
  ["an existing /r/ link", `${APP}/r/abc.def`],
] as const) {
  await check(label, async () => assert.equal(C.shouldTrack(url), false));
}
await check("app pages are wrapped", async () => assert.equal(C.shouldTrack(`${APP}/birds/123/weight?utm_source=email`), true));
await check("the blog is wrapped", async () => assert.equal(C.shouldTrack("https://www.thekyaproject.com/blog/weigh"), true));

console.log("\nlink keys");
for (const [url, key] of [
  [`${APP}`, "open_app"],
  [`${APP}/birds/new?next=weight`, "add_bird"],
  [`${APP}/birds/abc`, "bird_record"],
  [`${APP}/birds/abc/weight`, "bird_weight"],
  [`${APP}/birds/abc/vet-summary`, "bird_vet_summary"],
  [`${APP}/scans/settings`, "settings"],
  [`${APP}/dashboard`, "dashboard"],
  ["https://www.thekyaproject.com/blog/weigh", "blog_article"],
] as const) {
  await check(`${url.replace(APP, "") || "/"} → ${key}`, async () => assert.equal(C.linkKeyFor(url), key));
}

console.log("\nbot rules");
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const later = P.t + 5 * 60_000;
await check("a person on an iPhone, minutes later → human", async () => assert.deepEqual(C.classifyClick({ userAgent: IPHONE, method: "GET", sentAt: P.t, now: later }), { isBot: false, reason: null }));
await check("HEAD → bot", async () => assert.equal(C.classifyClick({ userAgent: IPHONE, method: "HEAD", sentAt: P.t, now: later }).reason, "head_request"));
await check("no user agent → bot", async () => assert.equal(C.classifyClick({ userAgent: "", method: "GET", sentAt: P.t, now: later }).reason, "no_user_agent"));
await check("crawler UA → bot", async () => assert.equal(C.classifyClick({ userAgent: "Googlebot/2.1", method: "GET", sentAt: P.t, now: later }).reason, "user_agent"));
await check("headless Chrome scanner → bot", async () => assert.equal(C.classifyClick({ userAgent: "Mozilla/5.0 HeadlessChrome/120.0", method: "GET", sentAt: P.t, now: later }).reason, "user_agent"));
await check("python-requests → bot", async () => assert.equal(C.classifyClick({ userAgent: "python-requests/2.31", method: "GET", sentAt: P.t, now: later }).reason, "user_agent"));
await check("a click 5 seconds after the send → bot (scanner on delivery)", async () => assert.equal(C.classifyClick({ userAgent: IPHONE, method: "GET", sentAt: P.t, now: P.t + 5_000 }).reason, "too_fast"));

console.log("\nwrapping a real email");
const sentAt = Date.now();
const weighing = buildSeriesWeighingEmail({ link: `${APP}/birds/new?next=weight`, hasBird: false, addBirdLink: `${APP}/birds/new?next=weight`, unsubscribeUrl: unsubUrl(APP, USER, "onboarding") });
const prepared = await prepareContent({ htmlContent: weighing.html, textContent: weighing.text, tag: "series_weighing", clicks: { userId: USER, variant: "no_bird" } }, sentAt);
const hrefs = [...prepared.html.matchAll(/<a\b[^>]*\bhref="([^"]*)"/g)].map((m) => m[1].replace(/&amp;/g, "&"));
await check("every <a> link is either /r/ or unsubscribe", async () => {
  for (const h of hrefs) assert.ok(h.startsWith(`${APP}/r/`) || h.includes("/api/public/unsubscribe/"), h);
});
await check("the unsubscribe link is untouched", async () => assert.ok(hrefs.includes(unsubUrl(APP, USER, "onboarding"))));
await check("the stylesheet <link href> is untouched", async () => assert.ok(prepared.html.includes(`href="${APP}/fonts/fonts.css"`)));
await check("no data-link attribute is left in the sent HTML", async () => assert.ok(!prepared.html.includes("data-link")));
const decoded = (await Promise.all(hrefs.filter((h) => h.startsWith(`${APP}/r/`)).map((h) => C.readClickToken(h.slice(`${APP}/r/`.length))))).map((d) => d!);
const cta = decoded.find((d) => d.k === "cta_primary");
await check("the button is cta_primary, no_bird, series_weighing, with the send time", async () => {
  assert.ok(cta);
  assert.equal(cta!.v, "no_bird");
  assert.equal(cta!.e, "series_weighing");
  assert.equal(cta!.u, USER);
  assert.equal(cta!.t, sentAt);
});
await check("…and sends the reader to exactly the link they'd have had (utm params and all)", async () =>
  assert.equal(cta!.d, `${APP}/birds/new?next=weight&utm_source=email&utm_medium=email&utm_campaign=series_weighing`));
await check("the footer Settings link is its own key", async () => assert.ok(decoded.some((d) => d.k === "settings")));
await check("plain text: the button URL is wrapped and keyed cta_primary too", async () => {
  const urls = [...(prepared.text ?? "").matchAll(/https:\/\/\S+/g)].map((m) => m[0]);
  const r = await Promise.all(urls.filter((u) => u.startsWith(`${APP}/r/`)).map((u) => C.readClickToken(u.slice(`${APP}/r/`.length).replace(/[.,;:!?]+$/, ""))));
  assert.ok(r.some((d) => d?.k === "cta_primary" && d.d === cta!.d));
  assert.ok(urls.some((u) => u.includes("/api/public/unsubscribe/")), "text unsubscribe left alone");
});
await check("a test send carries the test flag and counts against the real stage", async () => {
  const t = await prepareContent({ htmlContent: weighing.html, textContent: weighing.text, tag: "qa_preview", clicks: { userId: USER, variant: "standard", email: "welcome", test: true } });
  const h = [...t.html.matchAll(/<a\b[^>]*\bhref="([^"]*)"/g)].map((m) => m[1].replace(/&amp;/g, "&")).find((x) => x.includes("/r/"))!;
  const d = await C.readClickToken(h.slice(`${APP}/r/`.length))!;
  assert.equal(d.x, 1);
  assert.equal(d.e, "welcome");
  assert.ok(d.d.includes("utm_campaign=qa_preview"), "utm stays qa_preview so PostHog keeps it out too");
});
await check("real sends carry no test flag", async () => assert.equal(cta!.x, undefined));
await check("without `clicks`, nothing is wrapped (other emails are unchanged)", async () => {
  const plain = await prepareContent({ htmlContent: weighing.html, textContent: weighing.text, tag: "series_weighing" });
  assert.ok(!plain.html.includes("/r/"));
});

const nudge = buildAddFirstBirdEmail({ firstName: "Sam", link: `${APP}/birds/new`, reminder: true, unsubscribeUrl: unsubUrl(APP, USER, "onboarding") });
const nudgePrep = await prepareContent({ htmlContent: nudge.html, textContent: nudge.text, tag: "add_first_bird_reminder", clicks: { userId: USER, variant: "no_bird" } });
await check("the reminder's button is tracked and still lands on /birds/new", async () => {
  const h = [...nudgePrep.html.matchAll(/<a\b[^>]*\bhref="([^"]*)"/g)].map((m) => m[1].replace(/&amp;/g, "&")).find((x) => x.includes("/r/"))!;
  const d = await C.readClickToken(h.slice(`${APP}/r/`.length))!;
  assert.equal(d.k, "cta_primary");
  assert.ok(d.d.startsWith(`${APP}/birds/new?`), d.d);
});

const report = buildFlockReportEmail({
  firstName: "Sam", month: 9, year: 2026, link: APP, unsubscribeUrl: unsubUrl(APP, USER, "monthly"),
  article: { title: "Weigh", url: "https://www.thekyaproject.com/blog/weigh", minutes: 4 },
  birds: [{ name: "Juno", species: "Blue-throated macaw", href: `${APP}/birds/b1`, weighIns: [{ day: 2, g: 750 }], checks: 3, journal: 1, planUpdated: null }],
});
const reportPrep = await prepareContent({ htmlContent: report.html, textContent: report.text, tag: "flock_report", clicks: { userId: USER, variant: null } });
await check("Flock Report: every link wrapped except unsubscribe, with no variant", async () => {
  const hs = [...reportPrep.html.matchAll(/<a\b[^>]*\bhref="([^"]*)"/g)].map((m) => m[1].replace(/&amp;/g, "&"));
  for (const h of hs) assert.ok(h.startsWith(`${APP}/r/`) || h.includes("/api/public/unsubscribe/"), h);
  const ds = (await Promise.all(hs.filter((h) => h.startsWith(`${APP}/r/`)).map((h) => C.readClickToken(h.slice(`${APP}/r/`.length))))).map((d) => d!);
  assert.ok(ds.every((d) => d.v === null && d.e === "flock_report"));
  assert.ok(ds.some((d) => d.k === "blog_article"), "blog article keyed");
  assert.ok(ds.some((d) => d.k.startsWith("bird_")), "bird chips keyed");
});

console.log(`\n${passed} passed${process.exitCode ? ", with failures" : ""}`);
