// The startup safety net (STARTUP_GUARD in src/routes/__root.tsx) resets the
// page only for a code file that is really gone from the server.
//
// On Nov 2, 2026 the iOS app's sitter preview frame reset itself about 70 ms
// after loading, before its own scripts had finished: the reset cancelled
// them, the next load reported an error at once, and the preview never
// started. The guard now waits for the page's own loading to settle, then asks
// the server whether the file is gone (HEAD): a 404 resets once, a file that's
// there (a cancelled or interrupted load) never resets.
//
// Runs once per engine, in English: the guard's rules don't depend on language.
import { test as base, expect, type Page } from "@playwright/test";

const test = base;
test.beforeEach(({ browserName: _browser }, testInfo) => {
  test.skip(!testInfo.project.name.endsWith("-en"), "language-independent: English only");
});

/** A code file the page preloads but doesn't start from (not the entry). */
async function pickChunk(page: Page): Promise<string> {
  const res = await page.request.get("/auth?mode=signin");
  const html = await res.text();
  const entry = html.match(/<script[^>]*type="module"[^>]*src="([^"]+)"/)?.[1];
  const preloads = [...html.matchAll(/<link rel="modulepreload" href="(\/assets\/[^"]+\.js)"/g)].map((m) => m[1]);
  const chunk = preloads.find((p) => p !== entry);
  expect(chunk, "the page should preload at least one code file besides its entry").toBeTruthy();
  return chunk!;
}

function resets(page: Page): Set<string> {
  const urls = new Set<string>();
  page.on("framenavigated", (f) => { if (f === page.mainFrame() && f.url().includes("_r=")) urls.add(f.url()); });
  return urls;
}

test("a file that's missing from the server resets the page once", async ({ page, browserName }) => {
  const chunk = await pickChunk(page);
  let missing = true;
  await page.route(`**${chunk}`, async (route) => {
    // A real 404 to HEAD has no body; one with a body is sometimes rejected
    // as a network error, which the guard rightly reads as "can't tell".
    if (missing) await route.fulfill({ status: 404, contentType: "text/plain", body: route.request().method() === "HEAD" ? "" : "not found" });
    else await route.continue();
  });
  const seen = resets(page);
  page.on("framenavigated", (f) => { if (f === page.mainFrame() && f.url().includes("_r=")) missing = false; });

  // The reset can interrupt this first load (Chromium then reports
  // ERR_ABORTED), so wait on the reset itself rather than on navigation.
  await page.goto("/auth?mode=signin", { waitUntil: "commit" }).catch(() => { /* interrupted by the reset */ });
  await expect.poll(() => seen.size, { timeout: 20_000 }).toBeGreaterThanOrEqual(1);
  await page.waitForTimeout(3000);
  expect(seen.size, "exactly one automatic reset").toBe(1);
  // Whether the reloaded page starts is up to the browser's cache: WebKit
  // keeps the failed file for the tab (see navigation.spec.ts), Chromium
  // fetches it again and starts.
  if (browserName === "chromium") {
    await page.waitForFunction(() => (window as { __kyaReady?: boolean }).__kyaReady === true, null, { timeout: 30_000 });
  }
});

test("a failed load of a file that's still there doesn't reset a page that starts", async ({ page }) => {
  const chunk = await pickChunk(page);
  const probe = `${chunk}?probe=1`;
  // An extra copy of one of the page's code files, added while the page is
  // loading, whose load fails at once (as a cancelled load does). The file
  // itself is on the server (the guard's HEAD finds it), and the app doesn't
  // need this copy, so the page starts. Everything else arrives late, so the
  // failure lands while the page's own files are still loading.
  await page.addInitScript((src) => {
    document.addEventListener("DOMContentLoaded", () => {
      const s = document.createElement("script");
      s.type = "module";
      s.src = src;
      document.head.appendChild(s);
    });
  }, probe);
  let aborted = 0;
  await page.route("**/assets/**", async (route) => {
    const req = route.request();
    if (req.url().endsWith(probe) && req.method() === "GET") { aborted++; await route.abort("aborted"); return; }
    if (req.method() === "GET") await new Promise((r) => setTimeout(r, 1500));
    await route.continue().catch(() => { /* a reset cancelled it */ });
  });
  const seen = resets(page);

  await page.goto("/auth?mode=signin");
  await page.waitForFunction(() => (window as { __kyaReady?: boolean }).__kyaReady === true, null, { timeout: 30_000 });
  await page.waitForTimeout(5000);

  expect(aborted, "the test should have failed the extra load").toBeGreaterThanOrEqual(1);
  // Before the fix this reset at once, cancelling the page's other files.
  expect([...seen], "the guard reset a page whose failed file was still on the server").toEqual([]);
  await expect(page.locator("#kya-startup-slow")).toHaveCount(0);
});
