/**
 * The version endpoint and the rules for noticing a new release.
 *
 *   npm run test:release-check
 *
 * On Nov 2, 2026 the iOS app, open across a release, kept running the old
 * build (no service worker in WKWebView) until the next screen's code file
 * 404'd. This pins /api/public/version (the build id, never cached) and
 * src/lib/releaseCheck.ts: which pages check, when, what counts as a newer
 * build, update now or later, and the one-reload-per-build guard.
 *
 * Plain asserts, since the repo carries no test runner. Exits non-zero on
 * failure so it can gate a merge.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  CHECK_EVERY_MS, MIN_GAP_MS, PIN_COOKIE, RELOAD_FOR_BUILD_WINDOW_MS, UNPIN_SET_COOKIE, UNPIN_TIMEOUT_MS,
  buildFromPageText, checkDue, isNewerBuild, mayReloadFor, parseBuildReload, parseVersionResponse,
  releaseUpdateAction, shouldCheckVersion,
} from "@/lib/releaseCheck";
import { WEB_BUILD } from "@/lib/errorTags";
import { Route as VersionRoute } from "@/routes/api/public/version";
import { Route as UnpinRoute } from "@/routes/api/public/unpin";

let passed = 0;
async function check(name: string, fn: () => void | Promise<void>) {
  try { await fn(); passed++; console.log(`  ok   ${name}`); }
  catch (e) {
    console.log(`  FAIL ${name}\n       ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`);
    process.exitCode = 1;
  }
}

const where = { running: "c8d60bf", prod: true, inFrame: false };

await check("/api/public/version returns this build's id, never cached", async () => {
  const handlers = (VersionRoute.options as { server?: { handlers?: Record<string, () => Response | Promise<Response>> } })
    .server?.handlers;
  assert.ok(handlers?.GET, "no GET handler");
  const res = await handlers.GET();
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type") ?? "", /^application\/json/);
  assert.match(res.headers.get("cache-control") ?? "", /no-store/);
  const body = await res.json();
  assert.deepEqual(body, { build: WEB_BUILD });
});

await check("/api/public/unpin expires Vercel's pin cookie and nothing else, never cached", async () => {
  const handlers = (UnpinRoute.options as { server?: { handlers?: Record<string, () => Response | Promise<Response>> } })
    .server?.handlers;
  assert.ok(handlers?.POST, "no POST handler");
  assert.equal(handlers.GET, undefined, "only POST: a link or prefetch must never unpin");
  const res = await handlers.POST();
  assert.equal(res.status, 204);
  assert.match(res.headers.get("cache-control") ?? "", /no-store/);
  assert.equal(res.headers.get("set-cookie"), UNPIN_SET_COOKIE);
  assert.equal(await res.text(), "");
});
await check("the unpin cookie is __vdpl, expired, for the whole site", () => {
  assert.equal(PIN_COOKIE, "__vdpl");
  const parts = UNPIN_SET_COOKIE.split(";").map((p) => p.trim());
  assert.equal(parts[0], "__vdpl=");
  assert.ok(parts.includes("Path=/"), "Path=/ (the pin covers every page)");
  assert.ok(parts.includes("Max-Age=0"), "Max-Age=0 (expired at once)");
  assert.ok(parts.includes("Secure") && parts.includes("HttpOnly"));
});

await check("every open production page checks (Skew Protection pins the worker's own check too)", () => {
  assert.equal(shouldCheckVersion(where), true);
});
await check("never in a frame, a dev build, or a build without a real id", () => {
  assert.equal(shouldCheckVersion({ ...where, inFrame: true }), false);
  assert.equal(shouldCheckVersion({ ...where, prod: false }), false);
  assert.equal(shouldCheckVersion({ ...where, running: "local" }), false);
});

await check("a different live build is newer; the same one isn't", () => {
  assert.equal(isNewerBuild("c8d60bf", "a1b2c3d"), true);
  assert.equal(isNewerBuild("c8d60bf", "C8D60BF"), false);
});
await check("an odd answer never counts as a release", () => {
  for (const live of [undefined, null, "", "<!doctype html>", 42, "local", "not-a-sha"]) {
    assert.equal(isNewerBuild("c8d60bf", live), false, String(live));
  }
  assert.equal(isNewerBuild("local", "a1b2c3d"), false);
});
await check("the endpoint's answer is read only when it's { build: <id> }", () => {
  assert.equal(parseVersionResponse({ build: "a1b2c3d" }), "a1b2c3d");
  for (const body of [null, undefined, "a1b2c3d", 42, {}, { build: 7 }, { build: "local" }, { build: "<html>" }]) {
    assert.equal(parseVersionResponse(body), null, JSON.stringify(body));
  }
});

await check("checks on launch, hourly, and on return to the foreground at most once a minute", () => {
  const t = 1_000_000_000;
  assert.equal(checkDue(0, t), true);
  assert.equal(checkDue(0, t, true), true);
  assert.equal(checkDue(t, t + CHECK_EVERY_MS - 1), false);
  assert.equal(checkDue(t, t + CHECK_EVERY_MS), true);
  assert.equal(checkDue(t, t + MIN_GAP_MS - 1, true), false);
  assert.equal(checkDue(t, t + MIN_GAP_MS, true), true);
});

await check("a new release at a quiet moment with no form in progress: update now", () => {
  assert.equal(releaseUpdateAction({ quietMoment: true, formInProgress: false }), "now");
});
await check("a form in progress, or no quiet moment: later, behind the banner", () => {
  assert.equal(releaseUpdateAction({ quietMoment: true, formInProgress: true }), "later");
  assert.equal(releaseUpdateAction({ quietMoment: false, formInProgress: false }), "later");
  assert.equal(releaseUpdateAction({ quietMoment: false, formInProgress: true }), "later");
});

await check("reloads for a given build once; again only after the window or for a newer one", () => {
  const t = 1_000_000_000;
  assert.equal(mayReloadFor(null, "a1b2c3d", t), true);
  const last = { build: "a1b2c3d", at: t };
  assert.equal(mayReloadFor(last, "a1b2c3d", t + 1000), false);
  assert.equal(mayReloadFor(last, "A1B2C3D", t + 1000), false);
  assert.equal(mayReloadFor(last, "a1b2c3d", t + RELOAD_FOR_BUILD_WINDOW_MS), true);
  assert.equal(mayReloadFor(last, "ffff000", t + 1000), true);
});
await check("a damaged reload record reads as none", () => {
  assert.equal(parseBuildReload(null), null);
  assert.equal(parseBuildReload("{oops"), null);
  assert.equal(parseBuildReload('{"build":1,"at":"x"}'), null);
  assert.deepEqual(parseBuildReload('{"build":"a1b2c3d","at":5}'), { build: "a1b2c3d", at: 5 });
});

await check("reads the build from the version page's text, with or without a viewer around it", () => {
  assert.equal(buildFromPageText('{"build":"a1b2c3d"}'), "a1b2c3d");
  assert.equal(buildFromPageText('Pretty-print\n{ "build" : "A1B2C3D4" }'), "A1B2C3D4");
  assert.equal(buildFromPageText(`{"build":"${WEB_BUILD}"}`), WEB_BUILD === "local" ? null : WEB_BUILD);
});
await check("anything else on the version page reads as no answer", () => {
  assert.equal(buildFromPageText(undefined), null);
  assert.equal(buildFromPageText(""), null);
  assert.equal(buildFromPageText("<h1>502 Bad Gateway</h1>"), null);
  assert.equal(buildFromPageText('{"build":"local"}'), null);
  assert.equal(buildFromPageText('{"build":"<script>"}'), null);
});

// The wiring (sw-register.ts needs a browser, so it's read as text here).
const swSource = readFileSync(new URL("../src/lib/sw-register.ts", import.meta.url), "utf8");
const rootSource = readFileSync(new URL("../src/routes/__root.tsx", import.meta.url), "utf8");
await check("the app starts the version check at boot, next to the worker", () => {
  assert.match(rootSource, /registerServiceWorker\(\);[\s\S]{0,200}startReleaseCheck\(\);/);
});
await check("the check asks on launch, hourly and on each return to the foreground", () => {
  const start = swSource.slice(swSource.indexOf("export function startReleaseCheck"));
  assert.match(start, /shouldCheckVersion\(/);
  assert.match(start, /void checkVersion\(false\);\s*window\.setInterval\(\(\) => \{ void checkVersion\(false\); \}, CHECK_EVERY_MS\);/);
  assert.match(start, /onForeground\(\(\) => \{ void checkVersion\(true\); \}\)/);
  assert.match(swSource, /addEventListener\("resume", \(\) => \{ back\(\); \}\)/);
});
await check("the live build is read through a page load, never a pinned fetch", () => {
  const read = swSource.slice(swSource.indexOf("function readLiveBuild"), swSource.indexOf("async function checkVersion"));
  assert.match(read, /createElement\("iframe"\)/);
  assert.match(read, /\/api\/public\/version\?t=/);
  assert.doesNotMatch(read, /fetch\(/);
});
await check("a newer build goes through the same update decision as a worker update", () => {
  assert.match(swSource, /pageBehind = true;\s*onUpdateReady\(\);/);
  assert.match(swSource, /releaseUpdateAction\(\{ quietMoment: Date\.now\(\) < quietUntil, formInProgress: formInProgress\(\) \}\) === "now"/);
  assert.match(swSource, /if \(liveBuild\) \{ noteBuildReload\(\); reloadFresh\(\); \}/);
});
await check("every update reload drops the pin first (version check and worker update alike)", () => {
  const apply = swSource.slice(swSource.indexOf("async function applyUpdate"), swSource.indexOf("async function unpinBuild"));
  assert.match(apply, /if \(reload\) \{[\s\S]*?await unpinBuild\(\);\s*if \(liveBuild\) \{ noteBuildReload\(\); reloadFresh\(\); \}\s*else window\.location\.reload\(\);/);
  assert.equal(apply.match(/reloadFresh\(\)|location\.reload\(\)/g)?.length, 2, "no reload in applyUpdate skips the unpin");
});
await check("the unpin is a POST to /api/public/unpin that never holds a reload up for long", () => {
  const unpin = swSource.slice(swSource.indexOf("async function unpinBuild"), swSource.indexOf("function reloadFresh"));
  assert.match(unpin, /fetch\("\/api\/public\/unpin", \{ method: "POST"/);
  assert.match(unpin, /setTimeout\(\(\) => ctrl\?\.abort\(\), UNPIN_TIMEOUT_MS\)/);
  assert.match(unpin, /catch \{/, "a failed unpin still reloads");
  assert.ok(UNPIN_TIMEOUT_MS > 0 && UNPIN_TIMEOUT_MS <= 5_000);
});
await check("the service worker never answers /api/, so the unpin always reaches the server", () => {
  const sw = readFileSync(new URL("../src/sw.ts", import.meta.url), "utf8");
  assert.match(sw, /\^\\\/api\\\/\//);
});

console.log(`\n${passed} passed${process.exitCode ? ", some FAILED" : ""}`);
