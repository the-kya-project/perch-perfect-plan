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
import { test, expect, type Browser, type BrowserContext, type Page, type Route } from "@playwright/test";
import { devices } from "@playwright/test";
import { duoFixture } from "./duo-fixture";
import { mockDuo } from "./duo-mock";
import { MOCK } from "./helpers";

const { defaultBrowserType: _d, ...IPHONE } = devices["iPhone 13"];
const DUO = { viewport: { width: 951, height: 669 }, screen: { width: 951, height: 669 }, isMobile: true, hasTouch: true };

const REGIONS = [
  { slug: "california", name: "California", states: ["CA"], sort_order: 1 },
  { slug: "great-lakes", name: "Great Lakes", states: ["IL", "IN", "MI", "OH"], sort_order: 3 },
  { slug: "texas", name: "Texas", states: ["TX"], sort_order: 9 },
  { slug: "other", name: "Other region", states: [], sort_order: 10 },
];

/** The Community's own data, stateful so a save changes the next screen:
 *  the member's Flock profile and bird choices, the regions, chapters
 *  (counted from a few made-up neighbours), and their membership. */
type FlockState = {
  profile: Record<string, any> | null;
  shown: Map<string, boolean>;
  saves: Record<string, any>[];
  shownSaves: Record<string, any>[];
};

async function mockFlock(context: BrowserContext, userId: string, opts: { setupDone: boolean; region?: string }): Promise<FlockState> {
  const state: FlockState = {
    profile: opts.setupDone || opts.region
      ? { user_id: userId, display_name: "Brittany K.", region_slug: opts.region ?? "great-lakes", bio: null, photo_path: null, setup_completed_at: opts.setupDone ? new Date().toISOString() : null }
      : null,
    shown: new Map(),
    saves: [],
    shownSaves: [],
  };
  const neighbours: Record<string, { user_id: string; display_name: string }[]> = {
    "great-lakes": [{ user_id: "00000000-0000-4000-8000-00000000c001", display_name: "Ada L." }],
    texas: [{ user_id: "00000000-0000-4000-8000-00000000c002", display_name: "Cy T." }, { user_id: "00000000-0000-4000-8000-00000000c003", display_name: "Dee R." }],
  };
  const json = (route: Route, body: unknown, status = 200) =>
    route.fulfill({ status, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(body) });
  const wantsObject = (route: Route) => (route.request().headers()["accept"] ?? "").includes("vnd.pgrst.object");
  const membersOf = (slug: string) => [
    ...(neighbours[slug] ?? []).map((m) => ({ ...m, photo_path: null, is_founder: false, bird_names: ["Pip"] })),
    ...(state.profile?.region_slug === slug ? [{ user_id: userId, display_name: state.profile.display_name, photo_path: null, is_founder: true, bird_names: [] }] : []),
  ];

  await context.route(`${MOCK}/rest/v1/flock_profiles**`, async (route) => {
    const req = route.request();
    if (req.method() === "GET" || req.method() === "HEAD") return wantsObject(route) ? (state.profile ? json(route, state.profile) : json(route, { code: "PGRST116" }, 406)) : json(route, state.profile ? [state.profile] : []);
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" } });
    const body = req.postDataJSON();
    state.saves.push(body);
    state.profile = { ...(state.profile ?? {}), ...body };
    return json(route, [], 201);
  });
  await context.route(`${MOCK}/rest/v1/flock_shown_birds**`, async (route) => {
    const req = route.request();
    if (req.method() === "GET") return json(route, [...state.shown].map(([bird_id, shown]) => ({ bird_id, shown })));
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" } });
    const rows = req.postDataJSON() as { bird_id: string; shown: boolean }[];
    state.shownSaves.push(...rows);
    for (const r of rows) state.shown.set(r.bird_id, r.shown);
    return json(route, [], 201);
  });
  await context.route(`${MOCK}/rest/v1/regions**`, (route) => json(route, REGIONS));
  await context.route(`${MOCK}/rest/v1/entitlements**`, (route) =>
    json(route, [{ plan: "founding", status: "trialing", source: "founding", starts_at: null, current_period_end: null, free_until: null }]));
  await context.route(`${MOCK}/rest/v1/rpc/flock_*`, async (route) => {
    const fn = new URL(route.request().url()).pathname.split("/").pop();
    const args = (route.request().postDataJSON() ?? {}) as Record<string, any>;
    if (fn === "flock_my_setup") return json(route, [{ suggested_region: "great-lakes", founding_spot: 7, setup_completed_at: state.profile?.setup_completed_at ?? null }]);
    if (fn === "flock_chapter") {
      const r = REGIONS.find((x) => x.slug === args.p_region_slug);
      return json(route, r ? [{ region_slug: r.slug, name: r.name, states: r.states, member_count: membersOf(r.slug).length }] : []);
    }
    if (fn === "flock_chapter_members") return json(route, membersOf(args.p_region_slug));
    if (fn === "flock_visible_birds") return json(route, []);
    if (fn === "flock_member_profile") return json(route, []);
    if (fn === "flock_enabled") return route.fallback();
    return json(route, null);
  });
  return state;
}

async function open(browser: Browser, baseURL: string, opts: { admin: boolean; size?: "phone" | "duo"; setupDone?: boolean; region?: string }): Promise<{ context: BrowserContext; page: Page; flockChunks: string[]; state: FlockState }> {
  const context = await browser.newContext({
    ...(opts.size === "duo" ? DUO : IPHONE),
    locale: "en-US", serviceWorkers: "block", baseURL,
  });
  const fx = duoFixture(baseURL, Date.now());
  fx.rpc.flock_enabled = opts.admin;
  fx.rpc.is_admin = opts.admin;
  await mockDuo(context, fx);
  const state = await mockFlock(context, fx.user.id, { setupDone: opts.setupDone ?? true, region: opts.region });
  // Hide the open-in-app strip on every page (a session-only choice).
  await context.addInitScript(() => { try { sessionStorage.setItem("kya:openInAppDismissed", "1"); } catch { /* ignore */ } });
  const flockChunks: string[] = [];
  context.on("request", (r) => { if (FLOCK_CHUNK.test(r.url())) flockChunks.push(r.url()); });
  const page = await context.newPage();
  return { context, page, flockChunks, state };
}

// Community code chunks (FlockHealthDuo is the care app's, not Community's).
const FLOCK_CHUNK = /\/assets\/(?!FlockHealthDuo)(Flock\w+|SpacesSheet|flock\w*(\.[\w$-]+)*)-[\w-]+\.js/;

const tabs = (page: Page) => page.locator("nav[aria-label='Community']:visible [data-flock-tab]");

test.describe("as an admin, on a phone", () => {
  test("Today: header, five tabs in order, chips change the filter", async ({ browser, baseURL }) => {
    const { context, page } = await open(browser, baseURL!, { admin: true });
    await page.goto("/flock");
    await expect(page.getByRole("heading", { level: 1, name: "Today" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Spaces" })).toBeVisible();
    // The header avatar opens You (the Community profile), not care Account.
    await expect(page.getByRole("link", { name: "You", exact: true })).toHaveAttribute("href", "/flock/you");
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
    await expect(page.getByTestId("chapter-count")).toContainText("2 members · meetups unlock at 15");
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

test.describe("welcome, setup, profiles and chapters (admin, phone)", () => {
  test("welcome shows once: first visit goes to welcome, setup saves, then never again", async ({ browser, baseURL }) => {
    const { context, page, state } = await open(browser, baseURL!, { admin: true, setupDone: false });
    await page.goto("/flock");
    await expect(page).toHaveURL(/\/flock\/welcome$/);
    const welcome = page.getByTestId("flock-welcome");
    await expect(welcome.getByText("Founding member · 7 of 50")).toBeVisible();
    await expect(welcome.getByRole("heading", { level: 1 })).toHaveText("Welcome to the Flock, Brittany");
    await expect(welcome.getByText("This is a place to learn alongside other bird people, share how your birds are doing, and do some good together.")).toBeVisible();
    await expect(welcome.getByText("Takes about a minute")).toBeVisible();
    await expect(page.locator("[data-flock-tab]")).toHaveCount(0);

    await welcome.getByRole("button", { name: "Let's get you set up" }).click();
    await expect(page).toHaveURL(/\/flock\/setup$/);
    await expect(page.getByRole("progressbar", { name: "Setup progress" })).toBeVisible();
    await expect(page.getByTestId("setup-region")).toHaveText("Great Lakes · IL · IN · MI · OH");
    await expect(page.getByText("Members see your region, never your address.")).toBeVisible();
    await expect(page.getByText("Only their name, species, and photo. Care records stay private.")).toBeVisible();
    const chips = page.locator("[data-bird-chip]");
    expect(await chips.count()).toBeGreaterThan(0);
    for (const c of await chips.all()) await expect(c).toHaveAttribute("aria-pressed", "true");
    const first = chips.first();
    const firstId = await first.getAttribute("data-bird-chip");
    await first.click();
    await expect(first).toHaveAttribute("aria-pressed", "false");

    await page.getByRole("button", { name: "Go to the community" }).click();
    await expect(page).toHaveURL(/\/flock$/);
    await expect(page.getByRole("heading", { level: 1, name: "Today" })).toBeVisible();
    const saved = state.saves.at(-1)!;
    expect(saved.region_slug).toBe("great-lakes");
    expect(saved.display_name).toBe("Brittany");
    expect(typeof saved.setup_completed_at).toBe("string");
    expect(state.shownSaves.find((r) => r.bird_id === firstId)?.shown).toBe(false);
    expect(state.shownSaves.filter((r) => r.bird_id !== firstId).every((r) => r.shown)).toBe(true);

    // Never again.
    await page.goto("/flock");
    await expect(page.getByRole("heading", { level: 1, name: "Today" })).toBeVisible();
    await page.waitForTimeout(500);
    await expect(page).toHaveURL(/\/flock$/);
    await page.goto("/flock/library");
    await expect(page).toHaveURL(/\/flock\/library$/);
    await context.close();
  });

  test("changing region moves you to that chapter at once", async ({ browser, baseURL }) => {
    const { context, page } = await open(browser, baseURL!, { admin: true });
    await page.goto("/flock/chapter");
    await expect(page.getByTestId("chapter-line")).toHaveText("Great Lakes · IL · IN · MI · OH");
    await expect(page.getByTestId("chapter-count")).toContainText("2 members");
    await page.getByRole("link", { name: "See members" }).click();
    await expect(page).toHaveURL(/\/flock\/members$/);
    await expect(page.getByTestId("chapter-members").getByText("Ada L.")).toBeVisible();

    await page.goto("/flock/you");
    await page.getByRole("link", { name: "Edit profile" }).click();
    await expect(page).toHaveURL(/\/flock\/you\/edit$/);
    await page.getByRole("button", { name: "Change" }).click();
    await page.getByTestId("region-list").locator("[data-region='texas']").click();
    await expect(page.getByTestId("edit-region")).toHaveText("Texas · TX");
    await page.getByRole("button", { name: "Save profile" }).click();
    await expect(page).toHaveURL(/\/flock\/you$/);
    await expect(page.getByTestId("you-line")).toHaveText("Texas · Founding member");

    await page.goto("/flock/chapter");
    await expect(page.getByTestId("chapter-line")).toHaveText("Texas · TX");
    await expect(page.getByTestId("chapter-count")).toContainText("3 members · meetups unlock at 15");
    await context.close();
  });

  test("Other region: no chapter yet, and a way to pick one", async ({ browser, baseURL }) => {
    const { context, page } = await open(browser, baseURL!, { admin: true, region: "other" });
    await page.goto("/flock/chapter");
    await expect(page.getByTestId("chapter-line")).toHaveText("No chapter yet");
    await page.getByRole("button", { name: "Choose your region" }).click();
    await expect(page.getByTestId("region-list").locator("[data-region='other']")).toHaveCount(0);
    await page.getByTestId("region-list").locator("[data-region='california']").click();
    await expect(page.getByTestId("chapter-line")).toHaveText("California · CA");
    await context.close();
  });

  test("You and Privacy: what members see, and what they never see", async ({ browser, baseURL }) => {
    const { context, page } = await open(browser, baseURL!, { admin: true });
    await page.goto("/flock");
    await page.getByRole("link", { name: "You" }).click();
    await expect(page).toHaveURL(/\/flock\/you$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Brittany K.");
    await expect(page.getByText("Community is separate from care reminders")).toBeVisible();
    await expect(page.getByText("Founding · $15/mo · first 6 months free once the Flock opens")).toBeVisible();
    await page.getByRole("button", { name: /Privacy/ }).click();
    await expect(page).toHaveURL(/\/flock\/you\/privacy$/);
    const see = page.getByTestId("privacy-see");
    const never = page.getByTestId("privacy-never");
    for (const x of ["Your display name", "Your region (your chapter)", "Your bio", "Your profile photo", "The birds you choose to show: their name, species, and photo"]) {
      await expect(see.getByText(x, { exact: true })).toBeVisible();
    }
    for (const x of ["Your email", "Your address", "Your birds' care records and care plans", "Your sits and sitters", "Health checks and health notes", "Weights"]) {
      await expect(never.getByText(x, { exact: true })).toBeVisible();
    }
    await page.getByRole("link", { name: "Choose which birds members meet" }).click();
    await expect(page).toHaveURL(/\/flock\/you\/edit#birds$/);
    await context.close();
  });
});
