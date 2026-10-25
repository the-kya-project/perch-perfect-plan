// The new-sitter tour on /sitter/<token>: every step's highlight has to be on
// screen, on the element it names, with its tooltip clear of the top buttons,
// the Emergency bar and the iPhone home bar. Reported on iPhone (Oct 2026):
// later steps highlighted somewhere off screen, because the router scrolled
// back to the top after the step had scrolled its target into view.
//
// Runs on each engine and language with the rest of the check, against the
// sitter fixture (e2e/sitter-fixture.mjs): Kiwi has a long care sheet and a
// late photo, so later steps start below the fold; Mango has no routine
// tasks, so the daily-checklist step must be skipped.
import type { Page } from "@playwright/test";
import { test, expect, wording, expectClean } from "./helpers";

type Box = { top: number; bottom: number; left: number; right: number; height: number };

async function boxOf(page: Page, selector: string): Promise<Box | null> {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, height: r.height };
  }, selector);
}

/** Open the sitter link fresh and start the tour. */
async function startTour(page: Page, token: string, locale: string) {
  await page.goto(`/sitter/${token}`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: wording(locale, "sitterOnboarding.welcome.cta") }).click();
  await page.getByRole("button", { name: wording(locale, "sitterOnboarding.overview.cta") }).click();
}

/** Step through the whole tour, checking each step; returns what it saw. */
async function walkTour(page: Page, locale: string) {
  const seen: Array<{ target: string; scrollY: number; step: string }> = [];
  const nextLabel = wording(locale, "sitterOnboarding.coach.next");
  const closing = page.getByText(wording(locale, "sitterOnboarding.closing.heading"));
  for (let i = 0; i < 40; i++) {
    if (await closing.isVisible()) break;
    const overlay = page.locator("[data-coach-overlay]");
    await expect(overlay).toHaveAttribute("data-coach-status", "ready", { timeout: 15_000 });
    const target = (await overlay.getAttribute("data-coach-current"))!;
    const where = `step ${i + 1} (${target})`;
    // The highlight follows the element as late content settles (and slides
    // 200ms when it moves): give it a moment to line up, then check it did.
    await expect
      .poll(async () => {
        const e = await boxOf(page, `[data-coach="${target}"]`);
        const s = await boxOf(page, "[data-coach-spot]");
        return e && s ? Math.max(Math.abs(s.top - (e.top - 6)), Math.abs(s.left - (e.left - 6))) : 999;
      }, { message: `${where}: highlight lines up with the element`, timeout: 4000 })
      .toBeLessThan(3);
    const vh = await page.evaluate(() => window.innerHeight);
    const el = await boxOf(page, `[data-coach="${target}"]`);
    const spot = await boxOf(page, "[data-coach-spot]");
    const bubble = await boxOf(page, "[data-coach-bubble]");
    const bar = await boxOf(page, "nav.fixed");
    expect(el, `${where}: the element exists`).not.toBeNull();
    expect(spot, `${where}: a highlight is drawn`).not.toBeNull();
    // On screen: the element's top is visible (tall sections may run past the bottom).
    expect(el!.top, `${where}: element top on screen`).toBeGreaterThanOrEqual(0);
    expect(el!.top, `${where}: element top above the fold`).toBeLessThan(vh - 40);
    // The tooltip is fully on screen, under the tour's top buttons and above the bar.
    expect(bubble!.top, `${where}: tooltip below the top buttons`).toBeGreaterThanOrEqual(56);
    expect(bubble!.bottom, `${where}: tooltip on screen`).toBeLessThanOrEqual(vh);
    if (bar) expect(bubble!.bottom, `${where}: tooltip above the Emergency bar`).toBeLessThanOrEqual(bar.top + 1);
    seen.push({ target, scrollY: await page.evaluate(() => window.scrollY), step: (await page.locator("[data-coach-bubble] p").first().textContent()) ?? "" });
    await page.locator("[data-coach-bubble]").getByRole("button", { name: nextLabel }).click();
  }
  await expect(closing).toBeVisible();
  return seen;
}

test("the sitter tour shows every step on screen, with a long care sheet", async ({ page, problems, locale_ }) => {
  test.setTimeout(180_000);
  await startTour(page, "e2e-sitter-long-care", locale_);
  const seen = await walkTour(page, locale_);

  const targets = seen.map((s) => s.target);
  // The care-sheet sections and the checklist are all part of Kiwi's tour.
  for (const t of ["scan-card", "daily-checklist", "care-plan-link", "cp-food", "cp-handling", "cp-home", "cp-health", "cp-emergency", "guide-topics", "nav-emergency"]) {
    expect(targets, `the tour points at ${t}`).toContain(t);
  }
  // Later steps really started off screen: the page had to scroll well past a screen's height.
  const vh = await page.evaluate(() => window.innerHeight);
  expect(Math.max(...seen.map((s) => s.scrollY)), "some steps needed scrolling").toBeGreaterThan(vh);
  // The count matches what was shown: the last step reads "n of n".
  const last = seen[seen.length - 1].step.match(/(\d+)\D+(\d+)/);
  expect(last && last[1] === last[2], `last step count: ${seen[seen.length - 1].step}`).toBe(true);
  expect(Number(last![2])).toBe(seen.length);
  expectClean(problems, `sitter tour, long care sheet (${locale_})`);
});

test("a step with nothing to point at is skipped", async ({ page, problems, locale_ }) => {
  test.setTimeout(180_000);
  await startTour(page, "e2e-sitter-no-tasks", locale_);
  const seen = await walkTour(page, locale_);
  const targets = seen.map((s) => s.target);
  // Mango has no routine tasks, so there's no checklist on Today to highlight.
  expect(targets).not.toContain("daily-checklist");
  // Only that step: the ones either side of it still show.
  expect(targets).toContain("scan-card");
  expect(targets).toContain("care-plan-link");
  const last = seen[seen.length - 1].step.match(/(\d+)\D+(\d+)/);
  expect(Number(last![2]), "the count leaves out the skipped step").toBe(seen.length);
  expectClean(problems, `sitter tour, no tasks (${locale_})`);
});
