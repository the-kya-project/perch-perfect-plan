// The startup safety net (STARTUP_GUARD in src/lib/startupGuard.ts) must be
// listening before any of the page's files can fail.
//
// It used to come after the code preloads and about 110 KB of inlined styles.
// When a missing file was answered at once, the browser could report the
// failure before the guard was listening, so the reset never started: the
// flaky WebKit runs sat at exactly 20 s while the passing ones reset in about
// 1 s (docs/flock/opening-scope.md B5). The server entry now puts it first in
// <head>, after only the charset, and it keeps a list of the page's code
// files (window.__kyaCode) that the root error screen reads.
//
// Runs once per engine, in English: the guard doesn't depend on language. The
// missing-file reset runs 30 times on WebKit (Safari's engine), and all 30
// must reset, so a race can't hide behind a lucky pass.
import { test, expect, type Page } from "@playwright/test";
import { STARTUP_GUARD, insertStartupGuard, withStartupGuard } from "../src/lib/startupGuard";

test.beforeEach(({ browserName: _browser }, testInfo) => {
  test.skip(!testInfo.project.name.endsWith("-en"), "language-independent: English only");
});

// ── Where the server puts it (src/lib/startupGuard.ts), no browser needed ────
const APP = `<!DOCTYPE html><html lang="en"><head><meta charSet="utf-8"/><meta name="viewport" content="width=device-width"/>` +
  `<link rel="stylesheet" href="/fonts/fonts.css" data-precedence="default"/><title>Kya &amp; Co. — café</title>` +
  `<link rel="modulepreload" href="/assets/index-k2-abc.js"/><style>${"body{color:#1a3d2e}".repeat(6000)}</style></head>` +
  `<body><div>Hallo — wereld</div><script type="module" src="/assets/index-k2-abc.js"></script></body></html>`;
const OTHER = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Unsubscribed</title></head><body>You're unsubscribed.</body></html>`;
const guardAt = (html: string) => html.indexOf('<script id="kya-startup-guard">');

/** `html` as a streamed response in chunks of `size` bytes. */
function streamed(html: string, size: number): Response {
  const bytes = new TextEncoder().encode(html);
  let i = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(c) { if (i >= bytes.length) { c.close(); return; } c.enqueue(bytes.slice(i, i + size)); i += size; },
  });
  return new Response(body, { headers: { "content-type": "text/html; charset=utf-8", "content-length": String(bytes.length) } });
}

test("placement: an app page gets the guard right after the charset, once", () => {
  const out = insertStartupGuard(APP);
  const at = guardAt(out);
  expect(out.slice(0, at)).toBe(`<!DOCTYPE html><html lang="en"><head><meta charSet="utf-8"/>`);
  expect(out.includes(STARTUP_GUARD)).toBe(true);
  expect(out.replace(/<script id="kya-startup-guard">[\s\S]*?<\/script>/, "")).toBe(APP);
  expect(insertStartupGuard(out)).toBe(out);
  expect(/<\/script/i.test(STARTUP_GUARD), "the guard can't contain </script>").toBe(false);
  const noCharset = insertStartupGuard(APP.replace(`<meta charSet="utf-8"/>`, ""));
  expect(noCharset.slice(0, guardAt(noCharset))).toBe(`<!DOCTYPE html><html lang="en"><head>`);
});

test("placement: HTML that isn't the app (unsubscribe, review, error pages) is left alone", async () => {
  expect(insertStartupGuard(OTHER)).toBe(OTHER);
  expect(await withStartupGuard(streamed(OTHER, 5)).text()).toBe(OTHER);
  const json = new Response('{"ok":true}', { headers: { "content-type": "application/json" } });
  expect(withStartupGuard(json)).toBe(json);
  const redirect = new Response(null, { status: 302, headers: { location: "/dashboard" } });
  expect(withStartupGuard(redirect)).toBe(redirect);
});

test("placement: a streamed page arrives whole, characters intact, status and headers kept", async () => {
  // Small chunks split the page's multi-byte characters (—, é) across chunks.
  for (const size of [13, 4096, 1 << 20]) {
    const res = withStartupGuard(streamed(APP, size));
    expect(res.headers.get("content-length")).toBeNull();
    expect(await res.text(), `${size}-byte chunks`).toBe(insertStartupGuard(APP));
  }
  const res = withStartupGuard(new Response(APP, { status: 404, headers: { "content-type": "text/html", "x-kya": "1" } }));
  expect(res.status).toBe(404);
  expect(res.headers.get("x-kya")).toBe("1");
  expect(guardAt(await res.text())).toBeGreaterThan(0);
});

// ── In the browser, against the production build ─────────────────────────────

type PageCode = { files: string[]; failed: string[] };

/** Where each kind of tag first appears in the page's HTML (-1 if never). */
function firstIndex(html: string, re: RegExp): number {
  const m = re.exec(html);
  return m ? m.index : -1;
}

/** A code file the page preloads but doesn't start from (not the entry). */
function pickChunk(html: string): string {
  const entry = html.match(/<script[^>]*type="module"[^>]*src="([^"]+)"/)?.[1];
  const preloads = [...html.matchAll(/<link[^>]*rel="modulepreload"[^>]*href="(\/assets\/[^"]+\.js)"/g)].map((m) => m[1]);
  const chunk = preloads.find((p) => p !== entry);
  expect(chunk, "the page should preload at least one code file besides its entry").toBeTruthy();
  return chunk!;
}

function resets(page: Page): Set<string> {
  const urls = new Set<string>();
  page.on("framenavigated", (f) => { if (f === page.mainFrame() && f.url().includes("_r=")) urls.add(f.url()); });
  return urls;
}

for (const path of ["/", "/auth?mode=signin", "/confirm-email", "/link-expired"]) {
  test(`the guard is the first script in <head> on ${path}`, async ({ request }) => {
    const html = await (await request.get(path)).text();
    const head = html.slice(html.indexOf("<head>"), html.indexOf("</head>"));
    const guard = head.indexOf("__kyaCode");
    expect(guard, "the startup guard should be in <head>").toBeGreaterThan(0);
    const guardTag = head.lastIndexOf("<script", guard);

    // Only the charset may come before it.
    const before = head.slice("<head>".length, guardTag).trim();
    expect(before, "only the charset may come before the startup guard").toMatch(/^<meta charSet="utf-8"\s*\/?>$/i);

    // And so it comes before every code preload, style and other script.
    for (const [what, re] of [
      ["a code preload", /<link[^>]*rel="modulepreload"/],
      ["a stylesheet", /<link[^>]*rel="stylesheet"/],
      ["the inlined styles", /<style/],
      ["the app's code", /<script[^>]*type="module"/],
    ] as const) {
      const at = firstIndex(head, re);
      if (at >= 0) expect(at, `the startup guard should come before ${what}`).toBeGreaterThan(guardTag);
    }
    expect(firstIndex(head, /<link[^>]*rel="modulepreload"/), "the page should preload its code").toBeGreaterThan(0);
    expect(firstIndex(head, /<style/), "the page should inline its styles").toBeGreaterThan(0);
  });
}

const RESET_RUNS = 30;
for (let run = 1; run <= RESET_RUNS; run++) {
  test(`a code file that's missing from the server resets the page once (run ${run})`, async ({ page, request, browserName }) => {
    // WebKit all 30 times; once is enough for Chromium.
    test.skip(browserName !== "webkit" && run > 1, "repeated on WebKit only");
    const chunk = pickChunk(await (await request.get("/auth?mode=signin")).text());
    let missing = true;
    // Answered at once, before any of the page's other files: the race the
    // guard used to lose when it came after them.
    await page.route(`**${chunk}`, async (route) => {
      if (missing) await route.fulfill({ status: 404, contentType: "text/plain", body: "not found" });
      else await route.continue().catch(() => { /* cancelled by the reset */ });
    });
    const seen = resets(page);
    page.on("framenavigated", (f) => { if (f === page.mainFrame() && f.url().includes("_r=")) missing = false; });

    // The reset can interrupt this first load (Chromium then reports
    // ERR_ABORTED), so wait on the reset itself rather than on navigation.
    await page.goto("/auth?mode=signin", { waitUntil: "commit" }).catch(() => { /* interrupted by the reset */ });
    await expect.poll(() => seen.size, { timeout: 10_000, message: "the page should reset itself" }).toBeGreaterThanOrEqual(1);
    await page.waitForTimeout(2000);
    expect(seen.size, "exactly one automatic reset").toBe(1);
    // Whether the reloaded page starts is up to the browser's cache: WebKit
    // keeps the failed file for the tab (see navigation.spec.ts), Chromium
    // fetches it again and starts.
    if (browserName === "chromium") {
      await page.waitForFunction(() => (window as { __kyaReady?: boolean }).__kyaReady === true, null, { timeout: 30_000 });
    }
  });
}

test("the guard lists the page's code files, and a page that starts has none failed", async ({ page }) => {
  await page.goto("/auth?mode=signin");
  await page.waitForFunction(() => (window as { __kyaReady?: boolean }).__kyaReady === true, null, { timeout: 30_000 });
  const code = await page.evaluate(() => (window as unknown as { __kyaCode?: PageCode }).__kyaCode);
  expect(code, "the startup guard should keep window.__kyaCode").toBeTruthy();
  expect(code!.files.some((u) => /\/assets\/.+\.js$/.test(u)), "the list should hold the page's code files").toBe(true);
  expect(code!.failed).toEqual([]);
});

test("the guard lists a code file that failed to load", async ({ page }) => {
  // An extra copy of a code file that fails, added once the app has started:
  // no reset (the app is up), but it's on the list for the error screen.
  await page.goto("/auth?mode=signin");
  await page.waitForFunction(() => (window as { __kyaReady?: boolean }).__kyaReady === true, null, { timeout: 30_000 });
  await page.route("**/assets/missing-for-test.js", (route) => route.fulfill({ status: 404, contentType: "text/plain", body: "not found" }));
  await page.evaluate(() => new Promise<void>((done) => {
    const s = document.createElement("script");
    s.type = "module";
    s.src = "/assets/missing-for-test.js";
    s.onerror = () => done();
    document.head.appendChild(s);
  }));
  const code = await page.evaluate(() => (window as unknown as { __kyaCode?: PageCode }).__kyaCode);
  expect(code!.failed.some((u) => u.endsWith("/assets/missing-for-test.js")), "the failed file should be on the list").toBe(true);
  expect(new URL(page.url()).searchParams.has("_r"), "a page that has started doesn't reset").toBe(false);
});
