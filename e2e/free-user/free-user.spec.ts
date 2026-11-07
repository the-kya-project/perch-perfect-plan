// The free-user regression check, full version: a plain non-admin account on
// the PR's Vercel preview (Supabase staging) does everything a free user does,
// and never sees, loads or calls any part of the Flock.
// .github/workflows/free-user-regression.yml rebuilds the account before each
// run (supabase/staging/free-user.sql), so it always starts with no birds.
import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import {
  DUO, IPHONE, closeWelcome, dayFromToday, dismissOpenInApp, expectOnlyCareTabs, newContext,
  nextFlockGate, requireEnv, signIn, watchForFlock, type FlockLeak,
} from "./helpers";

const BIRD = `Pip ${Date.now().toString(36).slice(-4)}`;

test.describe.configure({ mode: "serial" });

let context: BrowserContext;
let page: Page;
let leaks: FlockLeak[];
let birdId = "";
let sitterToken = "";

test.beforeAll(async ({ browser }) => {
  requireEnv();
  if (process.env.FREE_USER_TARGET === "production") throw new Error("free-user.spec.ts writes data: never run it against production.");
  context = await newContext(browser, IPHONE);
  leaks = watchForFlock(context);
  page = await context.newPage();
});

test.afterAll(async () => {
  await context?.close();
});

test("1. sign in; Home loads; no Community button; the gate says no", async () => {
  const gate = nextFlockGate(page);
  await signIn(page);
  expect(await gate, "flock_enabled() for the free account").toBe(false);
  await closeWelcome(page);
  await dismissOpenInApp(page);
  await expect(page).toHaveTitle(/Home — Kya & Co\./);
  // The account is rebuilt before every run, so Home is its empty state.
  await expect(page.getByRole("heading", { name: "Welcome to your flock" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add your first bird" })).toBeVisible();
  await expectOnlyCareTabs(page.locator('nav[aria-label="Primary"]'));
  await expect(page.getByRole("link", { name: "Community" })).toHaveCount(0);
});

test("2. the gear opens settings, as today", async () => {
  await page.getByRole("link", { name: "Account settings" }).click();
  await page.waitForURL(/\/account(\?|$)/);
  await expect(page.getByRole("heading", { name: "Your account", level: 1 })).toBeVisible();
  await expect(page.getByText("Care settings")).toBeVisible();
});

test("3. add a bird", async () => {
  await page.goto("/birds/new?next=weight");
  await expect(page.getByRole("heading", { name: "Add a bird" })).toBeVisible();
  await page.getByLabel("Name").first().fill(BIRD);
  await page.getByLabel("Species").selectOption("Cockatiel");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL(/\/birds\/[0-9a-f-]{36}\/weight/);
  birdId = page.url().match(/\/birds\/([0-9a-f-]{36})\//)![1];
  await expect(page.getByText(`${BIRD} added.`)).toBeVisible();
});

test("4. log a weight", async () => {
  await expect(page.getByRole("heading", { name: `${BIRD}'s weight` })).toBeVisible();
  const grams = page.locator("#weight-grams");
  if (!(await grams.isVisible().catch(() => false))) await page.getByRole("button", { name: "Log a weight" }).click();
  await grams.fill("92");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Weight logged.")).toBeVisible();
  await expect(page.getByText("92 g").first()).toBeVisible();
});

test("5. the daily health check", async () => {
  await page.goto(`/check?bird=${birdId}`);
  await dismissOpenInApp(page);
  await expect(page.getByRole("heading", { name: `${BIRD}'s daily check` })).toBeVisible();
  await page.getByRole("button", { name: "Save health check" }).click();
  await expect(page.getByText(/Everything's saved to each bird's health log|Health check: all normal/).first()).toBeVisible();
});

test("6. add a journal entry", async () => {
  await page.goto(`/birds/${birdId}/journal`);
  await expect(page.getByRole("heading", { name: `${BIRD}'s journal` })).toBeVisible();
  await page.getByRole("button", { name: "Add an entry" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.locator("#journal-title").fill("Regression check entry");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Entry added.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Regression check entry" })).toBeVisible();
});

test("7. emergency contacts, then a pet sit", async () => {
  // A sitter link needs an owner phone and an avian vet phone.
  await page.goto("/account/emergency");
  await expect(page.getByRole("heading", { name: "Emergency info", level: 1 })).toBeVisible();

  await page.locator("[role=button]").filter({ has: page.getByText(/^You(\s|$)/) }).first().click();
  await page.locator("#em-owner_phone").fill("5555551234");
  await page.getByRole("dialog").getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Saved for all your birds.").first()).toBeVisible();

  await page.locator("[role=button]").filter({ has: page.getByText(/^Avian vet(\s|$)/) }).first().click();
  await page.locator("#em-avian_vet_name").fill("Regression Bird Clinic");
  await page.locator("#em-avian_vet_phone").fill("5555559876");
  await page.getByRole("dialog").getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeHidden();

  await page.goto("/sits/new");
  await expect(page.getByRole("heading", { name: "Set up a sit" })).toBeVisible();
  // One bird: already chosen (aria-pressed); don't click it.
  await expect(page.getByRole("button", { name: BIRD })).toHaveAttribute("aria-pressed", "true");
  await page.getByLabel("Starts").fill(dayFromToday(3));
  await page.getByLabel("Ends").fill(dayFromToday(5));
  await page.getByRole("radio", { name: /Someone else/ }).click();
  await page.getByLabel("Sitter's name").fill("Sam");
  // example.com is reserved: Brevo refuses it, so no email is ever sent.
  await page.getByLabel("Sitter's email").fill("sitter@example.com");

  const created = page.waitForResponse((r) => /\/rest\/v1\/sits(\?|$)/.test(r.url()) && r.request().method() === "POST", { timeout: 60_000 });
  await page.getByRole("button", { name: /^Create sit and email/ }).click();
  // A new bird's plan is mostly empty, so the app asks first ("Sam will need a
  // little more", gaps listed as "Good to add when you can"). The sheet opens
  // after an async readiness check: wait for it. (isVisible() never waits.)
  const anyway = page.getByRole("button", { name: "Create the sit anyway" });
  const asked = await anyway.waitFor({ state: "visible", timeout: 20_000 }).then(() => true, () => false);
  if (asked) {
    await expect(page.getByText("Needed before you can create a sit")).toHaveCount(0);
    await anyway.click();
  }
  const res = await created;
  expect(res.ok(), `create sit: HTTP ${res.status()}`).toBeTruthy();
  const body = await res.json();
  sitterToken = (Array.isArray(body) ? body[0] : body)?.invite_token ?? "";
  expect(sitterToken, "the new sit's invite token").not.toBe("");
  await page.waitForURL(/\/sits(\?|$)/, { timeout: 60_000 });
});

test("8. the sitter link opens signed out", async ({ browser }) => {
  const sitter = await newContext(browser, IPHONE);
  const sitterLeaks = watchForFlock(sitter);
  await sitter.addInitScript(() => { try { localStorage.setItem("ppc_sitter_onboarded", "1"); } catch { /* ignore */ } });
  const p = await sitter.newPage();
  await p.goto(`/sitter/${sitterToken}`);
  await expect(p.getByRole("heading", { name: `${BIRD}'s day` })).toBeVisible({ timeout: 45_000 });
  await expect(p.getByText(/This sitter link (isn't valid|has expired|was turned off)/)).toHaveCount(0);
  expect(sitterLeaks, "Flock requests from the sitter view").toEqual([]);
  await sitter.close();
});

test("9. /flock sends a free account Home", async () => {
  await page.goto("/flock");
  await page.waitForURL(/\/dashboard(\?|$)/, { timeout: 45_000 });
  await expectOnlyCareTabs(page.locator('nav[aria-label="Primary"]'));
  expect(await page.evaluate(() => localStorage.getItem("kya_mode"))).not.toBe("flock");
});

test("10. Duo / wide layout: the side column shows only the care tabs", async ({ browser }) => {
  const duo = await newContext(browser, { ...DUO, storageState: await context.storageState() });
  const duoLeaks = watchForFlock(duo);
  const p = await duo.newPage();
  const gate = nextFlockGate(p);
  await p.goto("/dashboard");
  expect(await gate, "flock_enabled() in the Duo layout").toBe(false);
  await expect(p.locator("html")).toHaveClass(/\bduo\b/);
  await expectOnlyCareTabs(p.locator('nav.duo-rail[aria-label="Primary"]'));
  // The bottom bar isn't drawn alongside the rail.
  await expect(p.locator('nav[aria-label="Primary"]:not(.duo-rail)')).toHaveCount(0);
  expect(duoLeaks, "Flock requests in the Duo layout").toEqual([]);
  await duo.close();
});

test("11. no Flock code, RPC or table was touched all run", async () => {
  expect(leaks, "Flock requests made for a free account").toEqual([]);
});
