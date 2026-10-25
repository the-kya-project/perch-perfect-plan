// The startup safety net (STARTUP_GUARD in src/routes/__root.tsx) reloads the
// page once if one of the app's own files fails to load before it starts.
// When a navigation begins, Safari cancels the page's pending loads and
// reports each as an error; the guard used to read that as a broken file and
// reload over the page the person had just asked for (seen as a flaky
// "interrupted by another navigation to …?_r=" in this check, PR #398).
//
// Each test runs once per engine and language with the rest of the check, and
// CI repeats this file on WebKit (hydration.yml) so a race can't hide.
import { test, expect, wording } from "./helpers";

// Long enough that the tap lands while the app is still loading.
const ASSET_DELAY_MS = 2500;

test("tapping a link while the app is still loading goes where the link points", async ({ page, locale_, problems: _problems }) => {
  await page.route("**/assets/**", async (route) => {
    await new Promise((r) => setTimeout(r, ASSET_DELAY_MS));
    await route.continue().catch(() => { /* cancelled by the navigation */ });
  });
  const visited: string[] = [];
  page.on("framenavigated", (frame) => { if (frame === page.mainFrame()) visited.push(frame.url()); });

  await page.goto("/auth?mode=signin", { waitUntil: "commit" });
  await page.waitForSelector("body", { state: "attached" });
  expect(await page.evaluate(() => !(window as { __kyaReady?: boolean }).__kyaReady), "the app should still be loading").toBe(true);

  // A real link, tapped.
  await page.evaluate(() => {
    const a = document.createElement("a");
    a.href = "/link-expired";
    a.textContent = "go";
    document.body.appendChild(a);
    a.click();
  });

  await page.waitForURL((u) => u.pathname === "/link-expired", { timeout: 20_000 });
  await page.waitForFunction(() => (window as { __kyaReady?: boolean }).__kyaReady === true, null, { timeout: 30_000 });
  await page.waitForTimeout(800);

  expect(visited.filter((u) => u.includes("_r=")), "the safety net reloaded over the tapped link").toEqual([]);
  expect(new URL(page.url()).pathname).toBe("/link-expired");
  await expect(page.locator("h1").first()).toHaveText(wording(locale_, "linkExpired.title"));
});

// The fix must not switch the safety net off: a file that really fails to
// load, with nobody leaving the page, still gets its one reset. (Only the
// reset is checked. Whether the reloaded page then starts is up to the
// browser's cache, and WebKit keeps the failed file for the tab.)
test("a file that really fails to load still gets one automatic reset", async ({ page, problems: _problems }) => {
  let failed = false;
  await page.route("**/assets/**/*.js", async (route) => {
    if (!failed) {
      failed = true;
      await route.abort();
      return;
    }
    await route.continue().catch(() => { /* the reset reload cancelled it */ });
  });
  const resets: string[] = [];
  page.on("framenavigated", (frame) => { if (frame === page.mainFrame() && frame.url().includes("_r=")) resets.push(frame.url()); });

  await page.goto("/auth?mode=signin", { waitUntil: "commit" });
  // One reset: caches cleared, the page reloaded with a cache-busting _r.
  await page.waitForURL((u) => u.searchParams.has("_r"), { timeout: 20_000 });
  await page.waitForTimeout(1500);
  expect(failed).toBe(true);
  expect(new Set(resets).size, "exactly one reset").toBe(1);
});
