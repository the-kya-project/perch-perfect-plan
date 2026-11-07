// The free-user check against PRODUCTION, read-only. Run by hand only
// (free-user-regression.yml → Run workflow → target "production"), with an
// existing non-admin account (secrets PROD_READONLY_EMAIL / _PASSWORD).
//
// It cannot create, edit, delete or send anything: blockAllWrites() aborts in
// the browser every request that could change something (REST writes, every
// RPC but flock_enabled, Edge Functions, the app's POST server functions and
// hooks, sign-out, analytics) before it leaves the machine. Sign-in and
// session refresh are the only POSTs allowed. It never fills in a form. What
// was blocked is listed in the report.
import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import {
  DUO, IPHONE, blockAllWrites, closeWelcome, dismissOpenInApp, expectOnlyCareTabs, newContext,
  nextFlockGate, requireEnv, signIn, watchForFlock, type Blocked, type FlockLeak,
} from "./helpers";

test.describe.configure({ mode: "serial" });

let context: BrowserContext;
let page: Page;
let blocked: Blocked[];
let leaks: FlockLeak[];

test.beforeAll(async ({ browser }) => {
  requireEnv();
  if (process.env.FREE_USER_TARGET !== "production") throw new Error("production.spec.ts runs only with FREE_USER_TARGET=production.");
  context = await newContext(browser, IPHONE);
  blocked = await blockAllWrites(context);
  leaks = watchForFlock(context);
  page = await context.newPage();
});

test.afterAll(async () => {
  // Leave the session as it is: signing out is a POST, and it's blocked.
  await context?.close();
  if (blocked?.length) {
    const lines = [...new Set(blocked.map((b) => `${b.method} ${b.url}`))];
    console.log(`Blocked ${blocked.length} write(s), nothing reached the server:\n  ${lines.join("\n  ")}`);
  }
});

test("1. sign in; Home loads; no Community button; the gate says no", async () => {
  const gate = nextFlockGate(page);
  await signIn(page);
  expect(await gate, "flock_enabled() for this account (must be a non-admin)").toBe(false);
  // Closing the welcome layer is a profile write, which is blocked: harmless.
  await closeWelcome(page);
  await dismissOpenInApp(page);
  await expect(page).toHaveTitle(/Home — Kya & Co\./);
  await expectOnlyCareTabs(page.locator('nav[aria-label="Primary"]'));
  await expect(page.getByRole("link", { name: "Community" })).toHaveCount(0);
});

test("2. the gear opens settings, as today", async () => {
  await page.getByRole("link", { name: "Account settings" }).click();
  await page.waitForURL(/\/account(\?|$)/);
  await expect(page.getByRole("heading", { name: "Your account", level: 1 })).toBeVisible();
  await expect(page.getByText("Care settings")).toBeVisible();
});

test("3. /flock sends the account Home", async () => {
  await page.goto("/flock");
  await page.waitForURL(/\/dashboard(\?|$)/, { timeout: 45_000 });
  await expectOnlyCareTabs(page.locator('nav[aria-label="Primary"]'));
});

test("4. Duo / wide layout: the side column shows only the care tabs", async ({ browser }) => {
  const duo = await newContext(browser, { ...DUO, storageState: await context.storageState() });
  const duoBlocked = await blockAllWrites(duo);
  const duoLeaks = watchForFlock(duo);
  const p = await duo.newPage();
  const gate = nextFlockGate(p);
  await p.goto("/dashboard");
  expect(await gate, "flock_enabled() in the Duo layout").toBe(false);
  await expect(p.locator("html")).toHaveClass(/\bduo\b/);
  await expectOnlyCareTabs(p.locator('nav.duo-rail[aria-label="Primary"]'));
  await expect(p.locator('nav[aria-label="Primary"]:not(.duo-rail)')).toHaveCount(0);
  expect(duoLeaks, "Flock requests in the Duo layout").toEqual([]);
  blocked.push(...duoBlocked);
  await duo.close();
});

test("5. no Flock code, RPC or table was touched", async () => {
  expect(leaks, "Flock requests made for a free account").toEqual([]);
});
