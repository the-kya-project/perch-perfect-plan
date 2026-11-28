// The free-user regression check, switch on (payments plan build C).
//
// free-user.spec.ts proves a free account sees nothing of the Flock while the
// members switch is off (merged state). This one runs after it, with the
// workflow having turned the switch on for staging (opening day set, members
// open) for this run only, and checks what the same free account sees then:
// the Community button, the guidelines walk-through, the "Part of the Flock"
// sheet with no prices, the join step's chapter, 18+ and agree,
// and that joining lets them in (or tells them when it opens). The workflow
// turns staging back afterwards, whatever happens here.
import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { IPHONE, closeWelcome, dismissOpenInApp, newContext, nextFlockGate, requireEnv, signIn } from "./helpers";

test.describe.configure({ mode: "serial" });

let context: BrowserContext;
let page: Page;

test.beforeAll(async ({ browser }) => {
  requireEnv();
  if (process.env.FREE_USER_TARGET === "production") throw new Error("switch-on.spec.ts joins the Flock: never run it against production.");
  if (process.env.FLOCK_SWITCH_ON !== "1") throw new Error("Run only after the workflow turned the members switch on for staging.");
  context = await newContext(browser, IPHONE);
  page = await context.newPage();
});

test.afterAll(async () => {
  await context?.close();
});

test("1. switch on: the gate says yes, and Home has a Community button", async () => {
  const gate = nextFlockGate(page);
  await signIn(page);
  expect(await gate, "flock_enabled() for the free account, switch on").toBe(true);
  await closeWelcome(page);
  await dismissOpenInApp(page);
  await expect(page.locator('[data-coach="owner-tab-flock"]').first()).toBeVisible();
});

test("2. Community opens the guidelines walk-through, then the join step with the Part of the Flock sheet, and no prices", async () => {
  await page.locator('[data-coach="owner-tab-flock"]').first().click();
  await page.waitForURL(/\/flock\/(agree|join)/, { timeout: 45_000 });
  // The walk-through (20261128180000) comes first once staging has the
  // migration. Before that (a preview of the PR that adds it) the app finds no
  // agreement function and goes straight to the join step, as before.
  if (/\/flock\/agree/.test(page.url())) {
    await expect(page.getByTestId("walkthrough-step-1")).toBeVisible();
    await page.getByTestId("walkthrough-next").click();
    await expect(page.getByTestId("walkthrough-step-2")).toBeVisible();
    await page.getByTestId("walkthrough-next").click();
    await expect(page.getByTestId("walkthrough-promises").locator("li")).toHaveCount(6);
    await page.getByTestId("walkthrough-agree").click();
    await page.waitForURL(/\/flock\/join/, { timeout: 45_000 });
  }
  const sheet = page.getByTestId("join-flock-sheet");
  await expect(sheet).toBeVisible();
  await expect(page.getByText("Part of the Flock", { exact: true })).toBeVisible();
  expect(await page.locator("body").innerText()).not.toMatch(/\$\s?\d/);
  await sheet.getByRole("button", { name: "Join the Flock free" }).click();
  await expect(sheet).toHaveCount(0);
});

test("3. the join step: a link to the guidelines (agreed in the walk-through); Join waits for a chapter and 18+", async () => {
  await expect(page.getByTestId("join-guidelines-link")).toBeVisible();
  await expect(page.getByTestId("join-agree")).toHaveCount(0);
  await expect(page.getByTestId("join-adult")).toBeVisible();
  const submit = page.getByTestId("join-submit");
  await expect(submit).toBeDisabled();
  await page.getByRole("button", { name: "Choose" }).click();
  await page.getByRole("dialog").getByText("Great Lakes").first().click();
  await expect(submit).toBeDisabled();
  await page.getByTestId("join-adult").check();
  await expect(submit).toBeEnabled();
});

test("4. joining: in the Flock (or told when it opens)", async () => {
  await page.getByTestId("join-submit").click();
  await expect(page.getByTestId("flock-welcome").or(page.getByTestId("flock-join-waiting"))).toBeVisible({ timeout: 45_000 });
});
