/**
 * PERMANENT GUARD: nothing inside the native app may mention the home screen.
 *
 * The apps are live on both stores. Telling someone inside the app to bookmark
 * the app is nonsense, and it is a mistake that keeps coming back — it survived
 * in three separate places (Settings, both checklists, and the dashboard
 * prompt) long after native push shipped, because each one guarded on a
 * different signal and none of them asked "am I in the app".
 *
 * AddToHomeScreenPrompt is the cautionary tale: it guarded on
 * `isIOSSafari() && !isStandalone()`, and a WKWebView passes BOTH — the shell
 * is iOS Safari and is not standalone — so the live iOS app showed it. No
 * amount of reading the condition catches that; only rendering it does.
 *
 * Exits non-zero on any hit, so it can gate a merge.
 *
 *   node no-home-screen.mjs            # against the dev server
 *   BASE=https://app.thekyaproject.com node no-home-screen.mjs
 */
import fs from "node:fs";

/**
 * Playwright is not a dependency of this repo. Install it to run this guard:
 *
 *   npm i -D @playwright/test && npx playwright install webkit chromium
 *
 * Without it the script SKIPS rather than fails, so it can sit in the repo and
 * in CI before anyone decides whether to carry the dependency.
 */
let webkit, chromium, devices;
try {
  ({ webkit, chromium, devices } = await import("@playwright/test"));
} catch {
  console.log("skipped — @playwright/test is not installed (npm i -D @playwright/test)");
  process.exit(0);
}

const BASE = process.env.BASE || "http://localhost:8080";
/**
 * Credentials for the QA account, never committed. Point QA_CREDS at the file,
 * or set QA_EMAIL and QA_PASSWORD directly in the environment.
 */
const credsFile = process.env.QA_CREDS;
const creds = credsFile && fs.existsSync(credsFile)
  ? Object.fromEntries(fs.readFileSync(credsFile, "utf8").split("\n").filter(Boolean).map((l) => l.split(/=(.*)/s).slice(0, 2)))
  : { QA_EMAIL: process.env.QA_EMAIL, QA_PASSWORD: process.env.QA_PASSWORD };
if (!creds.QA_EMAIL || !creds.QA_PASSWORD) {
  console.log("skipped — set QA_CREDS (a file with QA_EMAIL/QA_PASSWORD) or QA_EMAIL + QA_PASSWORD");
  process.exit(0);
}
const GUARD_SPINNER = ".min-h-screen.place-items-center[aria-hidden] .animate-spin";
const BANNED = /home screen|add to home|install the app|add it to your home/i;

/** Every authenticated screen an owner can reach from the tab bar or account. */
const PAGES = (process.env.PAGES || "/dashboard,/account,/scans/settings,/sits,/explore,/today,/household,/past-birds").split(",");

const capacitorStub = (platform) => `
(() => {
  const stub = { Plugins: {} };
  const pin = (n, v) => Object.defineProperty(stub, n, { configurable: false, get: () => v, set: () => {} });
  pin('isNativePlatform', () => true);
  pin('getPlatform', () => '${platform}');
  pin('isPluginAvailable', () => true);
  Object.defineProperty(window, 'Capacitor', { configurable: false, get: () => stub, set: () => {} });
})();
`;
const coreModule = (p) => `export const Capacitor={isNativePlatform:()=>true,getPlatform:()=>'${p}',isPluginAvailable:()=>true,convertFileSrc:s=>s};export const registerPlugin=()=>({});export default {Capacitor,registerPlugin};`;
const pushModule = (perm) => `export const PushNotifications={checkPermissions:async()=>({receive:'${perm}'}),requestPermissions:async()=>({receive:'${perm}'}),register:async()=>{},addListener:()=>({remove(){}}),removeAllListeners:async()=>{}};export default {PushNotifications};`;

/**
 * Sign in once and keep the session on disk.
 *
 * This harness had been signing in on every run, several times per run, which
 * is both slow and a good way to trip auth rate limiting — which is exactly how
 * it failed the first time. The cache is reused until it stops working.
 */
async function cachedSignIn(browser, engineName) {
  const origin = BASE.replace(/\W+/g, "-").toLowerCase();
  const file = new URL(`../.qa-sessions/${origin}-${engineName.replace(/\W+/g, "-").toLowerCase()}.json`, import.meta.url);
  fs.mkdirSync(new URL("../.qa-sessions/", import.meta.url), { recursive: true });
  if (fs.existsSync(file)) {
    try {
      const state = JSON.parse(fs.readFileSync(file, "utf8"));
      const ctx = await browser.newContext({ storageState: state });
      const page = await ctx.newPage();
      await page.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded" });
      const ok = await page
        .waitForFunction(() => !/^\/auth/.test(location.pathname), null, { timeout: 15000 })
        .then(() => true).catch(() => false);
      await ctx.close();
      if (ok) return state;
    } catch { /* fall through and sign in again */ }
  }
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${BASE}/auth?mode=signin`, { waitUntil: "domcontentloaded" });
  await page.locator('input[type="email"]').first().waitFor({ state: "visible", timeout: 45000 });
  await page.waitForTimeout(800);
  await page.locator('input[type="email"]').first().fill(creds.QA_EMAIL);
  await page.locator('input[type="password"]').first().fill(creds.QA_PASSWORD);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForFunction(() => !/^\/auth/.test(location.pathname), null, { timeout: 60000 });
  const state = await ctx.storageState();
  await ctx.close();
  fs.writeFileSync(file, JSON.stringify(state));
  return state;
}

const hits = [];
for (const [engineName, engine, device, platform] of [
  ["WebKit iPhone", webkit, devices["iPhone 15"], "ios"],
  ["Chromium Pixel", chromium, devices["Pixel 7"], "android"],
]) {
  const browser = await engine.launch();
  const storageState = await cachedSignIn(browser, engineName);

  // Each permission state renders different copy, so all three are swept.
  for (const permission of (process.env.PERMS || "prompt,denied,granted").split(",")) {
    const ctx = await browser.newContext({ ...device, storageState });
    await ctx.addInitScript(capacitorStub(platform));
    await ctx.route((u) => /capacitor[_-]?core/i.test(u.pathname + u.search), (r) =>
      r.fulfill({ status: 200, contentType: "application/javascript", body: coreModule(platform) }));
    await ctx.route((u) => /push[_-]?notifications/i.test(u.pathname + u.search), (r) =>
      r.fulfill({ status: 200, contentType: "application/javascript", body: pushModule(permission) }));
    const page = await ctx.newPage();
    for (const path of PAGES) {
      await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" }).catch(() => {});
      await page.waitForFunction((sel) => !document.querySelector(sel), GUARD_SPINNER, { timeout: 25000 }).catch(() => {});
      await page.waitForTimeout(1800);
      const found = await page.evaluate((src) => {
        const re = new RegExp(src, "i");
        const out = [];
        document.querySelectorAll("*").forEach((el) => {
          if (el.children.length === 0 && re.test(el.textContent || "")) out.push(el.textContent.trim().slice(0, 100));
        });
        return [...new Set(out)];
      }, BANNED.source);
      // Guard against a silent pass twice over: the page must have rendered,
      // AND it must be the page we asked for. A bounce to /auth contains no
      // banned copy and would otherwise read as a pass.
      const where = await page.evaluate(() => ({
        path: location.pathname,
        len: (document.body.innerText || "").trim().length,
      }));
      if (where.len <= 40) { hits.push(`${engineName}/${permission} ${path}: PAGE DID NOT RENDER — check not meaningful`); continue; }
      if (where.path !== path) { hits.push(`${engineName}/${permission} ${path}: LANDED ON ${where.path} — not signed in, check not meaningful`); continue; }
      for (const f of found) hits.push(`${engineName}/${permission} ${path}: "${f}"`);
    }
    await ctx.close();
  }
  await browser.close();
}

if (hits.length) {
  console.log(`FAIL — install/home-screen copy inside the native app:\n${hits.map((h) => "  " + h).join("\n")}`);
  process.exit(1);
}
const perms = (process.env.PERMS || "prompt,denied,granted").split(",").length;
console.log(`clean — no install or home-screen copy across ${PAGES.length * perms * 2} checks (${PAGES.length} pages x ${perms} permission states x 2 platforms)`);
