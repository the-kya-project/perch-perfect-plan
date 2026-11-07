// The Community (Flock) shell, as an admin and as everyone else, against the
// production build with a made-up signed-in session (e2e/duo-mock.ts): nothing
// real is reached. Runs in the "iPhone hydration" job (e2e/flock.config.ts).
//
//   Routes: the five tabs, in order, with My birds last; the old /flock/spaces
//   and /flock/learn redirect; bad filter links fall back to the defaults.
//   Filters: every chip row and Chapter's sub-tabs change the selection and the
//   URL; the Library search reaches the URL.
//   Spaces sheet: focus moves in and stays in, Escape and a swipe down close it
//   (focus back on Spaces), picking a space opens Today filtered to it.
//   Duo / wide: the five Community tabs sit in the side column, no care tabs.
//   Non-admins: every /flock URL sends them Home, and no Community code loads.
import { test, expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { devices } from "@playwright/test";
import { duoFixture } from "./duo-fixture";
import { mockDuo } from "./duo-mock";
import { MOCK } from "./helpers";

const { defaultBrowserType: _d, ...IPHONE } = devices["iPhone 13"];
const DUO = { viewport: { width: 951, height: 669 }, screen: { width: 951, height: 669 }, isMobile: true, hasTouch: true };

async function open(browser: Browser, baseURL: string, opts: { admin: boolean; size?: "phone" | "duo" }): Promise<{ context: BrowserContext; page: Page; flockChunks: string[] }> {
  const context = await browser.newContext({
    ...(opts.size === "duo" ? DUO : IPHONE),
    locale: "en-US", serviceWorkers: "block", baseURL,
  });
  const fx = duoFixture(baseURL, Date.now());
  fx.rpc.flock_enabled = opts.admin;
  fx.rpc.is_admin = opts.admin;
  await mockDuo(context, fx);
  // The member's chapter (the fixture's join helper can't express it).
  await context.route(`${MOCK}/rest/v1/flock_profiles**`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify({ region_slug: "great-lakes", regions: { name: "Great Lakes", states: ["IL", "IN", "MI", "OH"] } }),
    }));
  // Hide the open-in-app strip on every page (a session-only choice).
  await context.addInitScript(() => { try { sessionStorage.setItem("kya:openInAppDismissed", "1"); } catch { /* ignore */ } });
  const flockChunks: string[] = [];
  context.on("request", (r) => { if (/\/assets\/(FlockShell|FlockChips|SpacesSheet|flock(\.[\w-]+)?)-[\w-]+\.js/.test(r.url())) flockChunks.push(r.url()); });
  const page = await context.newPage();
  return { context, page, flockChunks };
}

const tabs = (page: Page) => page.locator("nav[aria-label='Community']:visible [data-flock-tab]");

test.describe("as an admin, on a phone", () => {
  test("Today: header, five tabs in order, chips change the filter", async ({ browser, baseURL }) => {
    const { context, page } = await open(browser, baseURL!, { admin: true });
    await page.goto("/flock");
    await expect(page.getByRole("heading", { level: 1, name: "Today" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Spaces" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Account settings" })).toBeVisible();
    await expect(tabs(page)).toHaveText(["Today", "Journeys", "Chapter", "Library", "My birds"]);
    await expect(tabs(page).first()).toHaveAttribute("aria-current", "page");
    await expect(tabs(page).last()).toHaveAttribute("href", "/dashboard");

    const chips = page.getByRole("group", { name: "Filter Today" }).getByRole("button");
    await expect(chips).toHaveText(["Everything", "Learn together", "Do good", "Start here"]);
    await expect(chips.first()).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("flock-empty")).toContainText("This is where the Flock's days come together.");

    await chips.filter({ hasText: "Do good" }).click();
    await expect(page).toHaveURL(/\/flock\?space=good$/);
    await expect(chips.filter({ hasText: "Do good" })).toHaveAttribute("aria-pressed", "true");
    await expect(chips.first()).toHaveAttribute("aria-pressed", "false");
    await expect(page.getByTestId("flock-empty")).toContainText("Rescue stories");

    await chips.first().click();
    await expect(page).toHaveURL(/\/flock$/);
    await context.close();
  });

  test("Spaces sheet: focus stays inside, Escape and swipe close it, a space filters Today", async ({ browser, baseURL }) => {
    const { context, page } = await open(browser, baseURL!, { admin: true });
    await page.goto("/flock/journeys");
    const spaces = page.getByRole("button", { name: "Spaces" });
    const sheet = page.getByRole("dialog", { name: "Spaces" });

    await spaces.click();
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole("button", { name: /Start here/ })).toBeFocused();
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press("Tab");
      expect(await sheet.evaluate((d) => d.contains(document.activeElement))).toBe(true);
    }
    await page.keyboard.press("Shift+Tab");
    expect(await sheet.evaluate((d) => d.contains(document.activeElement))).toBe(true);
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
    await expect(spaces).toBeFocused();

    // Swipe down from the handle.
    await spaces.click();
    const handle = page.getByTestId("spaces-sheet-handle");
    const box = (await handle.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + 10);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y + 70, { steps: 4 });
    await page.mouse.move(box.x + box.width / 2, box.y + 160, { steps: 4 });
    await page.mouse.up();
    await expect(sheet).toBeHidden();

    // A short drag snaps back instead.
    await spaces.click();
    const box2 = (await handle.boundingBox())!;
    await page.mouse.move(box2.x + box2.width / 2, box2.y + 10);
    await page.mouse.down();
    await page.mouse.move(box2.x + box2.width / 2, box2.y + 40, { steps: 3 });
    await page.mouse.up();
    await expect(sheet).toBeVisible();

    await sheet.getByRole("button", { name: /Learn together/ }).click();
    await expect(sheet).toBeHidden();
    await expect(page).toHaveURL(/\/flock\?space=learn$/);
    await expect(page.getByRole("heading", { level: 1, name: "Today" })).toBeVisible();
    await expect(page.getByRole("group", { name: "Filter Today" }).getByRole("button", { name: "Learn together" })).toHaveAttribute("aria-pressed", "true");
    await context.close();
  });

  test("Journeys, Chapter and Library: chips, sub-tabs and search", async ({ browser, baseURL }) => {
    const { context, page } = await open(browser, baseURL!, { admin: true });

    await page.goto("/flock/journeys");
    await expect(page.getByRole("heading", { level: 1, name: "Journeys" })).toBeVisible();
    const jChips = page.getByRole("group", { name: "Filter journeys" }).getByRole("button");
    await expect(jChips).toHaveText(["For you", "Following", "Tricks", "Basics"]);
    await jChips.filter({ hasText: "Tricks" }).click();
    await expect(page).toHaveURL(/\/flock\/journeys\?filter=tricks$/);
    await expect(jChips.filter({ hasText: "Tricks" })).toHaveAttribute("aria-pressed", "true");

    await tabs(page).filter({ hasText: "Chapter" }).click();
    await expect(page).toHaveURL(/\/flock\/chapter$/);
    await expect(page.getByTestId("chapter-line")).toHaveText("Great Lakes · IL · IN · MI · OH");
    const sub = page.getByRole("tablist", { name: "Chapter sections" }).getByRole("tab");
    await expect(sub).toHaveText(["Posts", "Events", "Resources"]);
    await expect(sub.first()).toHaveAttribute("aria-selected", "true");
    await sub.filter({ hasText: "Events" }).click();
    await expect(page).toHaveURL(/\/flock\/chapter\?tab=events$/);
    await expect(sub.filter({ hasText: "Events" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByTestId("flock-empty")).toContainText("meetups");

    await tabs(page).filter({ hasText: "Library" }).click();
    await expect(page.getByRole("searchbox", { name: "Search the library" })).toBeVisible();
    const type = page.getByRole("group", { name: "Type" }).getByRole("button");
    const subject = page.getByRole("group", { name: "Subject" }).getByRole("button");
    await expect(type).toHaveText(["All", "Guides", "Recordings", "Podcast"]);
    await expect(subject).toHaveText(["Foraging", "Diet", "Training", "Hormones", "Conservation"]);
    await type.filter({ hasText: "Podcast" }).click();
    await subject.filter({ hasText: "Hormones" }).click();
    await expect(page).toHaveURL(/type=podcast/);
    await expect(page).toHaveURL(/subject=hormones/);
    await subject.filter({ hasText: "Hormones" }).click(); // a second tap clears it
    await expect(page).not.toHaveURL(/subject=/);
    await page.getByRole("searchbox", { name: "Search the library" }).fill("pellets");
    await expect(page).toHaveURL(/q=pellets/);
    await expect(page.getByTestId("flock-empty")).toContainText("Nothing in the library matches that yet.");

    await tabs(page).filter({ hasText: "My birds" }).click();
    await expect(page).toHaveURL(/\/dashboard/);
    await context.close();
  });

  test("old and bad links: /flock/spaces and /flock/learn redirect, bad filters fall back", async ({ browser, baseURL }) => {
    const { context, page } = await open(browser, baseURL!, { admin: true });
    await page.goto("/flock/spaces");
    await expect(page).toHaveURL(/\/flock$/);
    await expect(page.getByRole("heading", { level: 1, name: "Today" })).toBeVisible();
    await page.goto("/flock/learn");
    await expect(page).toHaveURL(/\/flock\/library$/);
    await expect(page.getByRole("heading", { level: 1, name: "Library" })).toBeVisible();
    await page.goto("/flock?space=nonsense");
    await expect(page.getByRole("group", { name: "Filter Today" }).getByRole("button", { name: "Everything" })).toHaveAttribute("aria-pressed", "true");
    await page.goto("/flock/chapter?tab=nope");
    await expect(page.getByRole("tab", { name: "Posts" })).toHaveAttribute("aria-selected", "true");
    await context.close();
  });
});

test("as an admin, Duo / wide: the five Community tabs sit in the side column", async ({ browser, baseURL }) => {
  const { context, page } = await open(browser, baseURL!, { admin: true, size: "duo" });
  await page.goto("/flock/library");
  await expect(page.getByRole("heading", { level: 1, name: "Library" })).toBeVisible();
  await expect(page.locator("html")).toHaveClass(/\bduo\b/);
  const rail = page.locator("nav.duo-rail");
  await expect(rail.locator("[data-flock-tab]")).toHaveText(["Today", "Journeys", "Chapter", "Library", "My birds"]);
  await expect(rail.locator("[data-flock-tab='library']")).toHaveAttribute("aria-current", "page");
  // No care tabs in the column, and no bottom bar.
  await expect(rail.locator("[data-coach^='owner-tab-']")).toHaveCount(0);
  await expect(page.locator("nav.fixed.bottom-0")).toHaveCount(0);
  // Back to care: the care tabs come back to the column.
  await rail.locator("[data-flock-tab='care']").click();
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(rail.locator("[data-coach='owner-tab-home']")).toBeVisible();
  await expect(rail.locator("[data-flock-tab]")).toHaveCount(0);
  await context.close();
});

test("everyone else: every /flock URL sends them Home and no Community code loads", async ({ browser, baseURL }) => {
  for (const size of ["phone", "duo"] as const) {
    const { context, page, flockChunks } = await open(browser, baseURL!, { admin: false, size });
    for (const path of ["/flock", "/flock/journeys", "/flock/chapter", "/flock/library", "/flock/spaces", "/flock/learn", "/flock?space=good"]) {
      await page.goto(path);
      await expect(page, `${size} ${path}`).toHaveURL(/\/dashboard/);
    }
    await expect(page.locator("[data-flock-tab]")).toHaveCount(0);
    await expect(page.locator("[data-coach='owner-tab-flock']")).toHaveCount(0);
    expect(flockChunks, `${size}: Community code downloaded`).toEqual([]);
    await context.close();
  }
});
