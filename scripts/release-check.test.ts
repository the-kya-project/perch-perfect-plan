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
import {
  CHECK_EVERY_MS, MIN_GAP_MS, RELOAD_FOR_BUILD_WINDOW_MS,
  checkDue, isNewerBuild, mayReloadFor, parseBuildReload, parseVersionResponse,
  releaseUpdateAction, shouldCheckVersion,
} from "@/lib/releaseCheck";
import { WEB_BUILD } from "@/lib/errorTags";
import { Route as VersionRoute } from "@/routes/api/public/version";

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

console.log(`\n${passed} passed${process.exitCode ? ", some FAILED" : ""}`);
