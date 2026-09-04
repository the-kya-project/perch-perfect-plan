/**
 * App Store screenshot capture (iPhone 6.9" — 1320 x 2868).
 *
 * Apple scales the 6.9" set down to every other iPhone size, so one set covers
 * the whole phone lineup. 440 x 956 CSS px at deviceScaleFactor 3 renders to
 * exactly 1320 x 2868 device pixels.
 *
 * Viewport captures ONLY — never fullPage. App Store screenshots must be the
 * exact declared dimension, and fullPage produces whatever the document height
 * happens to be.
 *
 * Setup:
 *   npm i -D playwright && npx playwright install chromium
 *
 * Run (credentials never live in this file or the repo):
 *   KYA_REVIEW_EMAIL=... KYA_REVIEW_PASSWORD=... node scripts/appstore-screenshots.mjs
 *
 * Output: appstore-screenshots/ (gitignored — build output, not source).
 */
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import process from "node:process";

const BASE = process.env.KYA_BASE_URL ?? "https://app.thekyaproject.com";
const EMAIL = process.env.KYA_REVIEW_EMAIL;
const PASSWORD = process.env.KYA_REVIEW_PASSWORD;
const OUT = "appstore-screenshots";

// Demo-account fixtures. These are the App Review account's own rows — no real
// owner's data appears in any capture.
const JUNO = "fe54a9d5-5cb0-48f4-81e2-e95c60d3956c"; // blue-throated macaw
const PIP = "411382d1-8b37-411a-ae9d-4af9c685f1a5"; // red-crowned amazon
const SITTER_TOKEN = process.env.KYA_SITTER_TOKEN
  ?? "5575efc4f57b4946b6a604eb48c1f2a0e22a75711e6f409f865bc8874a7f32cc";

const VIEWPORT = { width: 440, height: 956 };
const SCALE = 3; // 440*3 x 956*3 = 1320 x 2868

if (!EMAIL || !PASSWORD) {
  console.error("Set KYA_REVIEW_EMAIL and KYA_REVIEW_PASSWORD.");
  process.exit(1);
}

/**
 * Wait until the screen is genuinely done: network quiet, every image decoded,
 * no spinner in the DOM. A screenshot with a spinner in it is a rejection, so
 * this is deliberately stricter than networkidle alone.
 */
async function settle(page, { extra = 700 } = {}) {
  await page.waitForLoadState("networkidle").catch(() => {});
  // Avatars and hero images are loading="lazy"; below-the-fold ones never start
  // until scrolled into view, so force them eager before waiting on decode.
  await page.evaluate(() => {
    for (const img of document.querySelectorAll("img")) {
      img.loading = "eager";
      if (!img.src && img.dataset.src) img.src = img.dataset.src;
    }
  });
  await page
    .waitForFunction(
      () => [...document.querySelectorAll("img")].every((i) => i.complete && i.naturalWidth > 0),
      null,
      { timeout: 15000 },
    )
    .catch(() => console.warn("  ! some images did not finish decoding"));
  await page
    .waitForFunction(() => !document.querySelector(".animate-spin"), null, { timeout: 10000 })
    .catch(() => console.warn("  ! a spinner was still present"));
  await page.waitForTimeout(extra);
}

/** Scroll to an exact offset so a re-run frames the shot identically. */
async function scrollTo(page, y) {
  await page.evaluate((top) => window.scrollTo({ top, behavior: "instant" }), y);
  await page.waitForTimeout(500);
}

async function shot(page, name) {
  const path = `${OUT}/${name}`;
  await page.screenshot({ path }); // viewport only — never fullPage
  console.log(`  wrote ${path}`);
}

const browser = await chromium.launch();
const newCtx = () =>
  browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: SCALE,
    isMobile: true,
    hasTouch: true,
    locale: "en-US",
    timezoneId: "America/Los_Angeles",
    colorScheme: "light",
    reducedMotion: "reduce", // stop mid-animation frames landing in a capture
  });

await mkdir(OUT, { recursive: true });

// ---- Owner context -------------------------------------------------------
const ctx = await newCtx();
const page = await ctx.newPage();

console.log("signing in…");
await page.goto(`${BASE}/auth?mode=signin`, { waitUntil: "networkidle" });
await page.fill('input[type="email"]', EMAIL);
await page.fill('input[type="password"]', PASSWORD);
await page.click('button:has-text("Sign in")');
await page.waitForURL((u) => !u.pathname.startsWith("/auth"), { timeout: 45000 });
await settle(page, { extra: 2500 });
console.log("  signed in →", page.url());

// 1 — Bird record: photo + weight trend, the screen an owner opens daily.
console.log("01 bird record");
await page.goto(`${BASE}/birds/${JUNO}`, { waitUntil: "networkidle" });
await settle(page);
await scrollTo(page, 0);
await shot(page, "01-bird-record.png");

// 2 — Care plan read view, scrolled past the header into the real content.
console.log("02 care plan");
await page.goto(`${BASE}/birds/${JUNO}/care-plan`, { waitUntil: "networkidle" });
await settle(page);
await scrollTo(page, 520);
await shot(page, "02-care-plan.png");

// 4 — Daily health check, mid-flow. Answer the first few questions so the shot
// shows the check being WORKED THROUGH rather than an untouched form. These
// selections are local component state — nothing is written until the check is
// submitted, which this script never does, so the demo data is unchanged.
console.log("04 health check");
await page.goto(`${BASE}/birds/${PIP}/scan`, { waitUntil: "networkidle" });
await settle(page);
const normals = page.locator('button:has-text("Normal")');
const answerCount = Math.min(4, await normals.count());
for (let i = 0; i < answerCount; i++) {
  await normals.nth(i).click();
  await page.waitForTimeout(200);
}
await page.waitForTimeout(600);
await scrollTo(page, 0);
await shot(page, "04-health-check.png");

// 5 — Household access, member visible.
console.log("05 household");
await page.goto(`${BASE}/household`, { waitUntil: "networkidle" });
await settle(page);
await scrollTo(page, 0);
await shot(page, "05-household.png");

// 6 — Journal entry read view: the vet check-up, which carries BOTH a photo and
// the clinic's PDF, so one shot shows the record and its attachment together.
console.log("06 journal");
await page.goto(`${BASE}/birds/${JUNO}/journal`, { waitUntil: "networkidle" });
await settle(page);
await page.click('button:has-text("Annual check-up")');
await settle(page, { extra: 1200 });
await shot(page, "06-journal.png");

await ctx.close();

// ---- Sitter context: no account, separate storage state ------------------
console.log("03 sitter checklist (fresh context, no session)");
const sitterCtx = await newCtx();
const sitter = await sitterCtx.newPage();
await sitter.goto(`${BASE}/sitter/${SITTER_TOKEN}`, { waitUntil: "networkidle" });
await settle(sitter, { extra: 1500 });
// First visit shows a walkthrough overlay; dismiss it deterministically.
const skip = sitter.locator('button:has-text("Skip"), a:has-text("Skip")').first();
if (await skip.count()) {
  await skip.click();
  await settle(sitter, { extra: 1200 });
}
await sitter.goto(`${BASE}/sitter/${SITTER_TOKEN}?birdId=${PIP}`, { waitUntil: "networkidle" });
await settle(sitter, { extra: 1200 });
await scrollTo(sitter, 0);
await shot(sitter, "03-sitter-checklist.png");
await sitterCtx.close();

await browser.close();
console.log("\ndone →", OUT);
