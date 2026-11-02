// iPhone Duo screenshots and checks (not part of the hydration run in CI).
//
//   npm run screens:duo
//
// Home, Echo's page, the weight page and the full health check at each size
// below. Sizes marked `column` must show the side column, split exactly on the
// middle of the screen; every other size must show today's layout with the
// bottom bar (lib/duo.ts decides by space, not device). Gap positions are
// written to test-results/duo/gaps.json. The app's Supabase requests are
// answered in the browser from e2e/duo-fixture.ts, signed in with a made-up
// session, so nothing real is reached. Screenshots land in test-results/duo/.
import { appendFileSync, mkdirSync } from "node:fs";
import { test, expect } from "@playwright/test";
import { duoFixture, ECHO_ID } from "./duo-fixture";
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

const PAGES = {
  home: "/dashboard",
  bird: `/birds/${ECHO_ID}`,
  weight: `/birds/${ECHO_ID}/weight`,
  check: `/birds/${ECHO_ID}/scan`,
} as const;

for (const [size, { column, ...viewport }] of Object.entries(SIZES)) {
  for (const [name, path] of Object.entries(PAGES)) {
    test(`${size} · ${name}`, async ({ browser, baseURL }) => {
      const context = await browser.newContext({
        viewport, screen: viewport, isMobile: true, hasTouch: true, deviceScaleFactor: 2,
        locale: "en-US", serviceWorkers: "block", baseURL,
      });
      const fx = duoFixture(baseURL!);
      await mockDuo(context, fx);

      const page = await context.newPage();
      await page.goto(path);
      const rail = page.locator("nav.duo-rail");
      const tabs = rail.getByRole("link");

      if (name === "home") await expect(page.getByText(/Your flock today/)).toBeVisible({ timeout: 20_000 });
      if (name === "bird") await expect(page.getByRole("heading", { name: "Echo", exact: true }).first()).toBeVisible({ timeout: 20_000 });
      if (name === "weight") await expect(page.getByRole("heading", { name: "Echo's weight" })).toBeVisible({ timeout: 20_000 });
      if (name === "check") await expect(page.getByRole("heading", { name: /full health check/ })).toBeVisible({ timeout: 20_000 });
      // Photos and the chart settle.
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(600);

      if (!column) {
        // Today's layout: no column; the bottom bar on regular pages.
        await expect(rail).toHaveCount(0);
        if (name !== "check") await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
      } else if (name === "check") {
        // A task: Close and the main action, no tabs.
        await expect(rail).toBeVisible();
        await expect(rail.getByRole("button", { name: "Close" })).toBeVisible();
        // Short label in the column, the full one for screen readers.
        await expect(rail.getByRole("button", { name: "Save Echo's check" })).toHaveText("Save");
        await expect(tabs).toHaveCount(0);
      } else {
        // Every regular page keeps all its tabs in the column.
        await expect(rail).toBeVisible();
        for (const label of ["Home", "Sits", "Health", "Explore", "Community"]) {
          await expect(rail.getByRole("link", { name: label })).toBeVisible();
        }
        if (name !== "home") await expect(rail.getByRole("button", { name: "Back" })).toBeVisible();
      }

      if (column) {
        // The split lands on the middle of the screen (the fold): where the
        // left pane ends and the right one begins.
        const gap = await page.evaluate((n) => {
          const [a, b] = n === "weight"
            ? [document.querySelector('[data-duo-pane="left"]'), document.querySelector('[data-duo-pane="right"]')]
            : [...document.querySelectorAll(".duo-split > .duo-pane")];
          return { leftEnds: a!.getBoundingClientRect().right, rightStarts: b!.getBoundingClientRect().left };
        }, name);
        const center = viewport.width / 2;
        const mid = (gap.leftEnds + gap.rightStarts) / 2;
        mkdirSync("test-results/duo", { recursive: true });
        appendFileSync("test-results/duo/gaps.json", JSON.stringify({ size, name, center, ...gap, mid }) + "\n");
        expect(Math.abs(mid - center)).toBeLessThanOrEqual(0.5);
      }

      await page.screenshot({ path: `test-results/duo/${size}-${name}.png` });
      await context.close();
    });
  }
}
