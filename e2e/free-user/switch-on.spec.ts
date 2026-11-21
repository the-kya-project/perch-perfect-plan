// The free-user regression check, switch on (payments plan build C).
//
// free-user.spec.ts proves a free account sees nothing of the Flock while the
// members switch is off (merged state). This one runs after it, with the
// workflow having turned the switch on for staging (opening day set, members
// open) for this run only, and checks what the same free account sees then:
// the Community button, the "Part of the Flock" sheet with no prices, the
// guidelines with the contact line, the join step's chapter, 18+ and agree,
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

test("2. Community opens the join step with the Part of the Flock sheet, and no prices", async () => {
  await page.locator('[data-coach="owner-tab-flock"]').first().click();
  await page.waitForURL(/\/flock\/join/, { timeout: 45_000 });
  const sheet = page.getByTestId("join-flock-sheet");
  await expect(sheet).toBeVisible();
  await expect(page.getByText("Part of the Flock", { exact: true })).toBeVisible();
  expect(await page.locator("body").innerText()).not.toMatch(/\$\s?\d/);
  await sheet.getByRole("button", { name: "Join the Flock free" }).click();
  await expect(sheet).toHaveCount(0);
});

test("3. the guidelines and the contact line; Join waits for a chapter, 18+ and agree", async () => {
  const g = page.getByTestId("flock-guidelines");
  await expect(g).toContainText("Welcome to the Flock.");
  await expect(g).toContainText("8. Adults only.");
  await expect(g.getByTestId("flock-contact-line")).toContainText("brittany@thekyaproject.com");
  const submit = page.getByTestId("join-submit");
  await expect(submit).toBeDisabled();
  await page.getByRole("button", { name: "Choose" }).click();
  await page.getByRole("dialog").getByText("Great Lakes").first().click();
  await page.getByTestId("join-agree").check();
  await expect(submit).toBeDisabled();
  await page.getByTestId("join-adult").check();
  await expect(submit).toBeEnabled();
});

test("4. joining: in the Flock (or told when it opens)", async () => {
  await page.getByTestId("join-submit").click();
  await expect(page.getByTestId("flock-welcome").or(page.getByTestId("flock-join-waiting"))).toBeVisible({ timeout: 45_000 });
});
