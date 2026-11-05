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
import { test, expect, type Page as PwPage } from "@playwright/test";
import { duoFixture, ECHO_ID, SIT_ACTIVE_ID, SIT_PAST_ID, SIT_UPCOMING_ID, type DuoVariant } from "./duo-fixture";
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
  /** Text that shows once the page has loaded (else the network settling). */
  ready?: RegExp;
  signedIn: boolean;
  variant?: DuoVariant;
  /** A task: Close at the top of the column instead of Back; no bottom bar on a phone. */
  task?: boolean;
  /** Home and the tab pages have no Back. */
  noBack?: boolean;
  /** No bottom bar on a phone (screens with their own chrome). */
  noNav?: boolean;
  /** The sitter link: the sitter's own tabs in the column. */
  sitter?: boolean;
  /** Part 2 screens run at fewer sizes: both Duo sizes and the phone layouts. */
  part2?: boolean;
  /** Only these sizes. */
  sizes?: string[];
  /** Steps to take on the page before the checks and the screenshot. */
  act?: (page: PwPage) => Promise<void>;
};

/** Set up a sit, filled in: Echo and Buzz, three days starting three days out, Sam covering. */
async function fillSitForm(page: PwPage) {
  await page.getByRole("button", { name: "Echo", exact: true }).click();
  await page.getByRole("button", { name: "Buzz", exact: true }).click();
  const DAY = 86_400_000;
  for (const offset of [3, 6]) {
    const label = new Date(Date.now() + offset * DAY).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
    const day = page.getByRole("button", { name: label, exact: true });
    if (!(await day.count())) await page.getByRole("button", { name: "Next month" }).click();
    await day.click();
  }
  await page.getByRole("radio", { name: /Sam/ }).first().click();
  await expect(page.getByText("Ready for Sam?")).toBeVisible();
  await expect(page.getByRole("button", { name: "Fix", exact: true }).first()).toBeVisible({ timeout: 10_000 });
  await page.getByText("Ready for Sam?").evaluate((el) => el.scrollIntoView({ block: "start" }));
  await page.waitForTimeout(400);
}

const SITTER = "e2e-sitter-long-care"; // e2e/sitter-fixture.mjs
const SCAN_ID = "00000000-0000-4000-8000-0000000e0000";
const E = ECHO_ID;
const p2 = (path: string, extra: Partial<Page> = {}): Page => ({ path, signedIn: true, variant: "filled", part2: true, ...extra });

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

  // ── Part 2: the core screens ─────────────────────────────────────────────
  sits: p2("/sits", { noBack: true }),
  "sits-empty": p2("/sits", { noBack: true, variant: "empty" }),
  // On the Duo a sit opens on the Sits tab itself (selected), so no Back.
  "sit-now": p2(`/sits/${SIT_ACTIVE_ID}`, { noBack: true }),
  "sit-coming": p2(`/sits/${SIT_UPCOMING_ID}`, { noBack: true }),
  "sit-past": p2(`/sits/${SIT_PAST_ID}`, { noBack: true }),
  "sit-new": p2("/sits/new", { task: true }),
  "sit-edit": p2(`/sits/edit/${SIT_UPCOMING_ID}`, { task: true }),
  // Two birds, dates and a sitter picked: "Ready for Sam?" with Fix rows
  // (Buzz's plan has no food; the avian vet has no phone number).
  "sit-ready": p2("/sits/new", { task: true, variant: "readiness", sizes: ["sideways", "sideways-1100"], act: fillSitForm }),
  "sitter-today": p2(`/sitter/${SITTER}`, { signedIn: false, sitter: true }),
  "sitter-care-sheet": p2(`/sitter/${SITTER}/care-sheet`, { signedIn: false, sitter: true }),
  "sitter-guide": p2(`/sitter/${SITTER}/guide`, { signedIn: false, sitter: true }),
  "sitter-around": p2(`/sitter/${SITTER}/around`, { signedIn: false, sitter: true }),
  "sitter-emergency": p2(`/sitter/${SITTER}/emergency`, { signedIn: false, sitter: true }),
  health: p2("/scans", { noBack: true }),
  "health-empty": p2("/scans", { noBack: true, variant: "empty" }),
  "health-history": p2("/scans/history"),
  "health-check-detail": p2(`/birds/${E}/scans/${SCAN_ID}`),
  journal: p2(`/birds/${E}/journal`),
  "journal-empty": p2(`/birds/${E}/journal`, { variant: "empty" }),
  moments: p2(`/birds/${E}/moments`),
  "moments-empty": p2(`/birds/${E}/moments`, { variant: "empty" }),
  updates: p2("/updates"),
  "updates-empty": p2("/updates", { variant: "empty" }),
  "past-birds": p2("/past-birds"),
  "past-birds-empty": p2("/past-birds", { variant: "empty" }),
  "plan-editor": p2(`/birds/${E}/plan/editor`, { task: true }),
  setup: p2(`/birds/${E}/setup`, { task: true, noNav: true }),
  "plan-overview": p2(`/birds/${E}/plan`),
  "care-plan": p2(`/birds/${E}/care-plan`),
  "vet-summary": p2(`/birds/${E}/vet-summary`),
  privacy: p2("/privacy", { signedIn: false }),
  terms: p2("/terms", { signedIn: false }),
  "bird-filled": p2(`/birds/${E}`),
  "bird-new": p2("/birds/new", { task: true, noNav: true }),
  handoff: p2(`/birds/${E}/handoff`),
  export: p2(`/birds/${E}/export`),
  farewell: p2(`/birds/${E}/farewell`),
  "admin-founding": p2("/admin/founding"),
  "admin-gifts": p2("/admin/gifts"),
};

const PART2_SIZES = new Set(["sideways", "sideways-1100", "iphone17pro", "folded", "upright", "iphone17promax-sideways", "ipad-air-upright"]);


const TABS = ["Home", "Sits", "Health", "Explore", "Community"];

for (const [size, { column, ...viewport }] of Object.entries(SIZES)) {
  for (const [name, pg] of Object.entries(PAGES)) {
    if (pg.part2 && !PART2_SIZES.has(size)) continue;
    if (pg.sizes && !pg.sizes.includes(size)) continue;
    test(`${size} · ${name}`, async ({ browser, baseURL }) => {
      const context = await browser.newContext({
        viewport, screen: viewport, isMobile: true, hasTouch: true, deviceScaleFactor: 2,
        locale: "en-US", serviceWorkers: "block", baseURL,
      });
      // The sitter link's first-visit walkthrough would cover every sitter screen.
      if (pg.sitter) await context.addInitScript(() => { try { localStorage.setItem("ppc_sitter_onboarded", "1"); } catch { /* ignore */ } });
      const variant = pg.variant ?? "base";
      await mockDuo(context, duoFixture(baseURL!, Date.now(), variant), pg.signedIn, variant);

      const page = await context.newPage();
      await page.goto(pg.path);
      const rail = page.locator(".duo-rail");
      if (pg.ready) await expect(page.getByText(pg.ready).first()).toBeVisible({ timeout: 20_000 });
      // Photos and the chart settle.
      await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
      await page.waitForTimeout(pg.ready ? 600 : 1500);
      if (pg.act) await pg.act(page);

      if (!column) {
        // Today's layout: no column; the bottom bar on regular signed-in pages.
        await expect(rail).toHaveCount(0);
        if (pg.signedIn && !pg.task && !pg.noNav) await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
      } else if (pg.sitter) {
        // The sitter link: the sitter's own tabs move into the column.
        await expect(rail).toBeVisible();
        expect(await rail.getByRole("link").count(), "sitter tabs in the column").toBeGreaterThanOrEqual(2);
        await expect(page.locator(".duo-rail-action")).toHaveCount(0);
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

      // Identity in the Duo card: every "Not added" row on one line.
      if (column && name === "identity") {
        const heights = await page.getByText("Not added", { exact: true }).evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height));
        expect(heights.length).toBeGreaterThan(0);
        for (const h of heights) expect(h, "a Not added value wraps").toBeLessThan(30);
        // The hatch date in its short form ("Sep 26, 2024 · 2 yrs"), on one line.
        const hatch = page.getByText(/^[A-Z][a-z]{2} \d{1,2}, \d{4} · \d+ (yrs?|mo|days?)$/);
        await expect(hatch).toHaveCount(1);
        const lines = await hatch.evaluate((el) => {
          const cs = getComputedStyle(el);
          const h = el.getBoundingClientRect().height - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
          return Math.round(h / parseFloat(cs.lineHeight));
        });
        expect(lines, "the hatch date wraps").toBe(1);
      }
      // The account's Emergency info card: an empty phone says what goes there.
      if (column && name === "account") {
        await expect(page.getByPlaceholder("Add a phone number").first()).toBeVisible();
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
      // centered unless someone set that crop with Edit photo. Only the made-up
      // birds' photos count (e2e/duo-fixture.ts), not journal or moment photos.
      const crops = await page.evaluate(() => [...document.querySelectorAll("img")]
        .filter((img) => getComputedStyle(img).objectFit === "cover" && /juno|weighing|journal-foraging|health-check/.test(img.currentSrc))
        .map((img) => ({ src: img.currentSrc.split("/").pop(), position: getComputedStyle(img).objectPosition, h: Math.round(img.getBoundingClientRect().height) })));
      appendFileSync("test-results/duo/crops.json", JSON.stringify({ size, name, crops }) + "\n");
      for (const c of crops) expect(c.position, `${c.src} is cropped from the middle`).not.toBe("50% 50%");

      if (column) {
        // A section card's preview is at most two lines; the full text is in the open card.
        const previews = await page.evaluate(() => [...document.querySelectorAll("[data-tile-preview]")].map((el) => {
          const lh = parseFloat(getComputedStyle(el).lineHeight);
          return { lines: Math.round(el.getBoundingClientRect().height / lh), text: (el.textContent ?? "").slice(0, 40) };
        }));
        for (const p of previews) expect(p.lines, `preview "${p.text}…" runs past 2 lines`).toBeLessThanOrEqual(2);
      }
      if (column && pg.sitter) {
        // No photo box that failed to load (an empty dark box with a broken image).
        await expect.poll(() => page.evaluate(() => [...document.querySelectorAll("img")].filter((img) => {
          const r = img.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && img.complete && img.naturalWidth === 0;
        }).length), { message: "broken images on a sitter page" }).toBe(0);
      }

      await page.screenshot({ path: `test-results/duo/${size}-${name}.png` });
      await context.close();
    });
  }
}
