/**
 * Per-email measurement — Brevo tag + utm params on app links.
 *
 *   npm run test:email-tracking
 *
 * Pure functions plus two real templates, so a template change that slips a
 * link past tagging (or tags an image) shows up here. Plain asserts, since the
 * repo carries no test runner. Exits non-zero on failure.
 */
import assert from "node:assert/strict";
import { tagHtmlLinks, tagTextLinks } from "@/lib/emailTracking";
import { buildWelcomeEmail, buildSeriesWeighingEmail } from "@/lib/flockEmails";
import { buildAppLaunchEmail } from "@/lib/appLaunchEmail";

let passed = 0;
function check(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ok   ${name}`);
  } catch (e) {
    console.log(
      `  FAIL ${name}\n       ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`,
    );
    process.exitCode = 1;
  }
}

const APP = "https://app.thekyaproject.com";
const UTM = "utm_source=email&amp;utm_medium=email&amp;utm_campaign=welcome";

check("adds params to a bare app link", () => {
  assert.equal(
    tagHtmlLinks(`<a href="${APP}/dashboard">x</a>`, "welcome"),
    `<a href="${APP}/dashboard?${UTM}">x</a>`,
  );
});

check("appends to an existing query string", () => {
  assert.equal(
    tagHtmlLinks(`<a href="${APP}/birds/new?step=1">x</a>`, "welcome"),
    `<a href="${APP}/birds/new?step=1&amp;${UTM}">x</a>`,
  );
});

check("keeps a #fragment after the params", () => {
  assert.equal(
    tagHtmlLinks(`<a href="${APP}/plan#food">x</a>`, "welcome"),
    `<a href="${APP}/plan?${UTM}#food">x</a>`,
  );
});

check("bare origin gets params", () => {
  assert.equal(tagHtmlLinks(`<a href="${APP}">x</a>`, "welcome"), `<a href="${APP}?${UTM}">x</a>`);
});

check("leaves images, unsubscribe and other sites alone", () => {
  const html = [
    `<img src="${APP}/brand/logo.png">`,
    `<a href="${APP}/email/hero.jpg">`,
    `<a href="${APP}/api/public/unsubscribe/onboarding/u/sig">`,
    `<a href="https://apps.apple.com/app/id1">`,
    `<a href="mailto:brittany@thekyaproject.com">`,
  ].join("");
  assert.equal(tagHtmlLinks(html, "welcome"), html);
});

check("never overrides a link's own campaign", () => {
  const html = `<a href="${APP}/get-app?utm_source=email&utm_campaign=app-launch&utm_content=button">`;
  assert.equal(tagHtmlLinks(html, "app_launch"), html);
});

check("text part: bare URLs, sentence punctuation stays outside", () => {
  assert.equal(
    tagTextLinks(`Open ${APP}/dashboard. Or ${APP}/api/public/unsubscribe/x`, "series_weighing"),
    `Open ${APP}/dashboard?utm_source=email&utm_medium=email&utm_campaign=series_weighing. Or ${APP}/api/public/unsubscribe/x`,
  );
});

// Real templates: every app link a reader can click carries the campaign, and
// no image or unsubscribe link does.
function appHrefs(html: string): string[] {
  return (
    [...html.matchAll(/href="([^"]+)"/g)]
      .map((m) => m[1])
      // <link href> stylesheets (the web-font CSS) are fetched, not clicked.
      .filter((u) => u.startsWith(APP) && !/\.(css|png|jpe?g|svg)$/.test(u.split("?")[0]))
  );
}

check("welcome email: every clickable app link tagged, unsubscribe untouched", () => {
  const built = buildWelcomeEmail({
    firstName: "Marta",
    link: `${APP}/dashboard`,
    unsubscribeUrl: `${APP}/api/public/unsubscribe/onboarding/u/sig`,
  });
  const hrefs = appHrefs(tagHtmlLinks(built.html, "welcome"));
  assert.ok(hrefs.length > 0, "no app links found");
  for (const h of hrefs) {
    if (h.includes("/api/")) assert.ok(!h.includes("utm_"), `unsubscribe tagged: ${h}`);
    else assert.ok(h.includes("utm_campaign=welcome"), `untagged: ${h}`);
  }
  const imgs = [...tagHtmlLinks(built.html, "welcome").matchAll(/src="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(
    imgs.every((s) => !s.includes("utm_")),
    "an image src was tagged",
  );
});

check("weighing email without a bird: add-bird button tagged", () => {
  const built = buildSeriesWeighingEmail({ link: `${APP}/birds/x`, hasBird: false });
  const hrefs = appHrefs(tagHtmlLinks(built.html, "series_weighing")).filter(
    (h) => !h.includes("/api/"),
  );
  assert.ok(
    hrefs.length > 0 && hrefs.every((h) => h.includes("utm_campaign=series_weighing")),
    hrefs.join(" "),
  );
});

check("app launch email: own per-button campaigns kept, the rest tagged once", () => {
  const hrefs = appHrefs(
    tagHtmlLinks(buildAppLaunchEmail({ displayName: "Brittany" }).html, "app_launch"),
  );
  assert.ok(
    hrefs.some((h) => h.includes("utm_content=button")),
    "per-button campaign lost",
  );
  for (const h of hrefs)
    assert.equal(h.match(/utm_campaign=/g)?.length, 1, `not tagged exactly once: ${h}`);
});

console.log(`\n${passed} passed${process.exitCode ? ", some FAILED" : ""}`);
