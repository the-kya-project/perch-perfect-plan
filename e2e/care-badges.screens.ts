// Care badges (backlog 1.13b): before-and-after screenshots of what a free
// account sees on a bird's page, at iPhone size (not part of the hydration run
// in CI).
//
//   npm run test:care-badges:screens
//
// "off" is the care_badges switch as it ships (off): the bird page must have
// no badge row, no celebration, and ask nothing about badges. The "on" shots
// are what Brittany would see after `admin_set_care_feature('care_badges',
// 'admins')`. A free, non-admin account with the Flock closed throughout. The
// app's Supabase requests are answered in the browser from e2e/duo-fixture.ts
// (e2e/duo-mock.ts), so nothing real is reached. Screenshots land in
// test-results/care-badges/.
import { mkdirSync } from "node:fs";
import { test, expect, type BrowserContext } from "@playwright/test";
import { duoFixture, ECHO_ID } from "./duo-fixture";
import { mockDuo } from "./duo-mock";

const OUT = "test-results/care-badges";
const VIEWPORT = { width: 390, height: 844 };
const earned = "2026-11-28T15:00:00Z";
const row = (badge: string, level: number, unseen: boolean, at_launch: boolean) => ({ badge, level, earned_at: level > 0 ? earned : null, unseen: level > 0 && unseen, at_launch: level > 0 && at_launch });

const STATES = {
  // A long-time owner the first time badges are worked out.
  launch: [row("steady_scale", 52, true, true), row("daily_check_in", 30, true, true), row("plan_ready", 1, true, true), row("sitter_ready", 1, true, true)],
  // A new level later on.
  earned: [row("steady_scale", 12, true, false), row("daily_check_in", 7, false, false), row("plan_ready", 1, false, false), row("sitter_ready", 0, false, false)],
  // Everything seen.
  seen: [row("steady_scale", 12, false, false), row("daily_check_in", 7, false, false), row("plan_ready", 1, false, false), row("sitter_ready", 0, false, false)],
};

async function setUp(context: BrowserContext, baseURL: string, on: boolean, badges: unknown[]) {
  const fx = duoFixture(baseURL, Date.now(), "base");
  // A free account: not an admin, the Flock closed to it.
  fx.rpc = { ...fx.rpc, flock_enabled: false, is_admin: false, flock_my_access: [], care_feature_enabled: on, care_my_badges: on ? badges : [], care_badges_seen: null };
  const asked: string[] = [];
  await mockDuo(context, fx, true, "base");
  context.on("request", (r) => { if (r.url().includes("/rest/v1/rpc/")) asked.push(r.url().split("/rpc/")[1].split("?")[0]); });
  return asked;
}

test.beforeAll(() => mkdirSync(OUT, { recursive: true }));

for (const [name, on, badges] of [
  ["before-switch-off", false, STATES.seen],
  ["after-launch-celebration", true, STATES.launch],
  ["after-badge-earned", true, STATES.earned],
  ["after-all-seen", true, STATES.seen],
] as const) {
  test(`bird page · ${name}`, async ({ browser, baseURL }) => {
    const context = await browser.newContext({
      viewport: VIEWPORT, screen: VIEWPORT, isMobile: true, hasTouch: true, deviceScaleFactor: 2,
      locale: "en-US", serviceWorkers: "block", baseURL,
    });
    const asked = await setUp(context, baseURL!, on, [...badges]);
    const page = await context.newPage();
    await page.goto(`/birds/${ECHO_ID}`);
    await expect(page.getByText(/Echo's record/).first()).toBeVisible({ timeout: 20_000 });
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
    await page.waitForTimeout(800);
    if (!on) {
      await expect(page.getByTestId("bird-badges-row")).toHaveCount(0);
      await expect(page.getByTestId("care-badges-launch")).toHaveCount(0);
      await expect(page.getByTestId("care-badge-earned")).toHaveCount(0);
      expect(asked).not.toContain("care_my_badges");
    } else {
      await expect(page.getByTestId("bird-badges-row")).toBeVisible();
      if (name === "after-launch-celebration") await expect(page.getByTestId("care-badges-launch")).toBeVisible();
      if (name === "after-badge-earned") await expect(page.getByTestId("care-badge-earned")).toBeVisible();
    }
    await page.screenshot({ path: `${OUT}/${name}.png` });
    await page.screenshot({ path: `${OUT}/${name}-full.png`, fullPage: true });
    await context.close();
  });
}

test("Badges screen", async ({ browser, baseURL }) => {
  const context = await browser.newContext({
    viewport: VIEWPORT, screen: VIEWPORT, isMobile: true, hasTouch: true, deviceScaleFactor: 2,
    locale: "en-US", serviceWorkers: "block", baseURL,
  });
  await setUp(context, baseURL!, true, [...STATES.seen]);
  const page = await context.newPage();
  await page.goto(`/birds/${ECHO_ID}/badges`);
  await expect(page.getByTestId("care-badges-grid")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("3 of 4 earned")).toBeVisible();
  await expect(page.getByTestId("care-badge-how")).toContainText("Sitter ready");
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/badges-screen.png` });
  await page.locator('[data-badge="steady_scale"]').click();
  await expect(page.getByTestId("care-badge-earned-on")).toContainText("Next level at 52 weeks.");
  await page.screenshot({ path: `${OUT}/badges-screen-steady-scale.png` });
  await context.close();
});

test("Badges screen while the switch is off goes back to the bird", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ viewport: VIEWPORT, locale: "en-US", serviceWorkers: "block", baseURL });
  await setUp(context, baseURL!, false, []);
  const page = await context.newPage();
  await page.goto(`/birds/${ECHO_ID}/badges`);
  await expect(page).toHaveURL(new RegExp(`/birds/${ECHO_ID}$`), { timeout: 20_000 });
  await context.close();
});
