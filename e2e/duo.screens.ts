// iPhone Duo screenshots and checks (not part of the hydration run in CI).
//
//   npm run screens:duo
//
// Home, Echo's page, the weight page, the full health check, Account,
// Household, Echo's settings (identity, emergency, who can see), the landing,
// sign in and sign up at each size below. Signed-in screens with the column
// must show every tab and Back (Close on a task) and no action tile; every
// column screen shows at most one gold button. Sizes marked `column` must show the side column, split exactly on the
// middle of the screen; every other size must show today's layout with the
// bottom bar (lib/duo.ts decides by space, not device). Gap positions are
// written to test-results/duo/gaps.json. The app's Supabase requests are
// answered in the browser from e2e/duo-fixture.ts, signed in with a made-up
// session, so nothing real is reached. Screenshots land in test-results/duo/.
import { appendFileSync, mkdirSync } from "node:fs";
import { test, expect } from "@playwright/test";
import { duoFixture, ECHO_ID, type DuoVariant } from "./duo-fixture";
import { mockDuo } from "./duo-mock";

const SIZES = {
  // iPhone Duo folded (cover screen): a regular iPhone layout until 1.2.
  folded: { width: 382, height: 837, column: false },
  // iPhone Duo unfolded, upright.
  upright: { width: 669, height: 904, column: false },
  // iPhone 17 Pro, upright and sideways; 17 Pro Max sideways (the widest phone).
  "iphone17pro": { width: 402, height: 874, column: false },
  "iphone17pro-sideways": { width: 874, height: 402, column: false },
  "iphone17promax-sideways": { width: 956, height: 440, column: false },
  // iPhone Duo unfolded, sideways; and a wider landscape screen.
  sideways: { width: 951, height: 669, column: true },
  "sideways-1100": { width: 1100, height: 750, column: true },
  // iPads: sideways they have the room, so they get the column; upright keeps
  // today's layout.
  "ipad-air-sideways": { width: 1180, height: 820, column: true },
  "ipad-pro-sideways": { width: 1366, height: 1024, column: true },
  "ipad-air-upright": { width: 820, height: 1180, column: false },
} as const;

type Page = {
  path: string;
  /** Text that shows once the page has loaded. */
  ready: RegExp;
  signedIn: boolean;
  variant?: DuoVariant;
  /** A task: Close at the top of the column instead of Back. */
  task?: boolean;
  /** Home and the tab pages have no Back. */
  noBack?: boolean;
};

const PAGES: Record<string, Page> = {
  home: { path: "/dashboard", ready: /Your flock today/, signedIn: true, noBack: true },
  bird: { path: `/birds/${ECHO_ID}`, ready: /Echo/, signedIn: true },
  weight: { path: `/birds/${ECHO_ID}/weight`, ready: /Echo's weight/, signedIn: true },
  check: { path: `/birds/${ECHO_ID}/scan`, ready: /full health check/, signedIn: true, task: true },
  account: { path: "/account", ready: /Your account/, signedIn: true },
  household: { path: "/household", ready: /Household|Your household/, signedIn: true, variant: "filled" },
  identity: { path: `/birds/${ECHO_ID}/identity`, ready: /identity/i, signedIn: true },
  emergency: { path: `/birds/${ECHO_ID}/emergency`, ready: /emergency info/i, signedIn: true },
  access: { path: `/birds/${ECHO_ID}/access`, ready: /Who can see/, signedIn: true, variant: "filled" },
  landing: { path: "/", ready: /Everything it takes to care for your parrots/, signedIn: false },
  signin: { path: "/auth?mode=signin", ready: /Welcome back/, signedIn: false },
  signup: { path: "/auth?mode=signup", ready: /Create your account/, signedIn: false },
};

const TABS = ["Home", "Sits", "Health", "Explore", "Community"];

for (const [size, { column, ...viewport }] of Object.entries(SIZES)) {
  for (const [name, pg] of Object.entries(PAGES)) {
    test(`${size} · ${name}`, async ({ browser, baseURL }) => {
      const context = await browser.newContext({
        viewport, screen: viewport, isMobile: true, hasTouch: true, deviceScaleFactor: 2,
        locale: "en-US", serviceWorkers: "block", baseURL,
      });
      const variant = pg.variant ?? "base";
      await mockDuo(context, duoFixture(baseURL!, Date.now(), variant), pg.signedIn, variant);

      const page = await context.newPage();
      await page.goto(pg.path);
      const rail = page.locator(".duo-rail");
      await expect(page.getByText(pg.ready).first()).toBeVisible({ timeout: 20_000 });
      // Photos and the chart settle.
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(600);

      if (!column) {
        // Today's layout: no column; the bottom bar on regular signed-in pages.
        await expect(rail).toHaveCount(0);
        if (pg.signedIn && !pg.task) await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
      } else if (pg.signedIn) {
        // Every signed-in screen, tasks included, keeps all its tabs in the column.
        await expect(rail).toBeVisible();
        for (const label of TABS) await expect(rail.getByRole("link", { name: label })).toBeVisible();
        // Back (or Close on a task) at the top, and no action tile: the only
        // button in the column is that one.
        const buttons = rail.getByRole("button");
        if (pg.task) await expect(rail.getByRole("button", { name: "Close" })).toBeVisible();
        else if (!pg.noBack) await expect(rail.getByRole("button", { name: "Back" })).toBeVisible();
        expect(await buttons.count()).toBeLessThanOrEqual(1);
        await expect(page.locator(".duo-rail-action")).toHaveCount(0);
      } else {
        // Signed out: the status bar's strip on dark forest, no tabs.
        await expect(rail).toBeVisible();
        await expect(rail.getByRole("link")).toHaveCount(0);
      }

      // One main button per screen: at most one gold (sunflower) button showing.
      const gold = await page.evaluate(() => [...document.querySelectorAll("button, a")].filter((el) => {
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height || r.bottom < 0 || r.top > innerHeight) return false;
        return getComputedStyle(el).backgroundColor === "rgb(242, 179, 61)";
      }).map((el) => (el.textContent ?? "").trim()));
      mkdirSync("test-results/duo", { recursive: true });
      appendFileSync("test-results/duo/gold.json", JSON.stringify({ size, name, gold }) + "\n");
      if (column) expect(gold.length, `gold buttons: ${gold.join(" | ")}`).toBeLessThanOrEqual(1);

      if (column) {
        // The split lands on the middle of the screen (the fold): where the
        // left pane ends and the right one begins.
        const gap = await page.evaluate(() => {
          const tagged = [document.querySelector('[data-duo-pane="left"]'), document.querySelector('[data-duo-pane="right"]')];
          const [a, b] = tagged[0] && tagged[1] ? tagged : [...document.querySelectorAll(".duo-split > .duo-pane")];
          return { leftEnds: a!.getBoundingClientRect().right, rightStarts: b!.getBoundingClientRect().left };
        });
        const center = viewport.width / 2;
        const mid = (gap.leftEnds + gap.rightStarts) / 2;
        appendFileSync("test-results/duo/gaps.json", JSON.stringify({ size, name, center, ...gap, mid }) + "\n");
        expect(Math.abs(mid - center)).toBeLessThanOrEqual(0.5);
      }

      // Bird photos keep the top of the image (the head): no photo is cropped
      // centered unless someone set that crop with Edit photo.
      const crops = await page.evaluate(() => [...document.querySelectorAll("img")]
        .filter((img) => getComputedStyle(img).objectFit === "cover" && !/app-launch-hero/.test(img.currentSrc))
        .map((img) => ({ src: img.currentSrc.split("/").pop(), position: getComputedStyle(img).objectPosition, h: Math.round(img.getBoundingClientRect().height) })));
      appendFileSync("test-results/duo/crops.json", JSON.stringify({ size, name, crops }) + "\n");
      for (const c of crops) expect(c.position, `${c.src} is cropped from the middle`).not.toBe("50% 50%");

      await page.screenshot({ path: `test-results/duo/${size}-${name}.png` });
      await context.close();
    });
  }
}
