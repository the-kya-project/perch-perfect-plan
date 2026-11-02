// iPhone Duo screen inventory: every screen in e2e/duo-inventory-list.ts at
// 951x669 (the Duo's inner screen held sideways), with the bridge off, so the
// web app's space rule decides the layout. Part of `npm run screens:duo`.
//
// Each capture lands in test-results/duo-inventory/<slug>.png, and one line per
// screen goes to test-results/duo-inventory/manifest.jsonl: where the page
// ended up, whether the side column and the two-pane split showed.
import { appendFileSync, mkdirSync } from "node:fs";
import { test } from "@playwright/test";
import { duoFixture } from "./duo-fixture";
import { mockDuo } from "./duo-mock";
import { SCREENS, slug } from "./duo-inventory-list";

const OUT = "test-results/duo-inventory";
const VIEWPORT = { width: 951, height: 669 };

for (const screen of SCREENS) {
  if (screen.skip) continue;
  test(`inventory · ${slug(screen)}`, async ({ browser, baseURL }) => {
    const context = await browser.newContext({
      viewport: VIEWPORT, screen: VIEWPORT, isMobile: true, hasTouch: true, deviceScaleFactor: 2,
      locale: "en-US", serviceWorkers: "block", baseURL,
    });
    // The sitter view's first-visit tour would cover every sitter screen.
    await context.addInitScript(() => { try { localStorage.setItem("ppc_sitter_onboarded", "1"); } catch { /* ignore */ } });
    await mockDuo(context, duoFixture(baseURL!, Date.now(), screen.variant), screen.signedIn, screen.variant);

    const page = await context.newPage();
    await page.goto(screen.path);
    await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
    await page.waitForTimeout(1200);

    mkdirSync(OUT, { recursive: true });
    await page.screenshot({ path: `${OUT}/${slug(screen)}.png` });
    const seen = await page.evaluate(() => ({
      rail: !!document.querySelector("nav.duo-rail"),
      split: !!document.querySelector(".duo-split, [data-duo-pane]"),
    }));
    appendFileSync(`${OUT}/manifest.jsonl`, JSON.stringify({ slug: slug(screen), landed: new URL(page.url()).pathname, ...seen }) + "\n");
    await context.close();
  });
}
