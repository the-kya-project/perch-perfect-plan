/**
 * Noticing a release without a service worker, and what a missing code file
 * does.
 *
 *   npm run test:release-check
 *
 * On Nov 2, 2026 the iOS app, open across a release, kept running the old
 * build (no service worker in WKWebView) until the next screen's code file
 * 404'd. This pins src/lib/releaseCheck.ts: which pages check, when, what
 * counts as a newer build, the one-reload-per-build guard, and how a missing
 * code file is handled (reload, banner, or the error screen; never a loop).
 *
 * Plain asserts, since the repo carries no test runner. Exits non-zero on
 * failure so it can gate a merge.
 */
import assert from "node:assert/strict";
import {
  CHECK_EVERY_MS, MIN_GAP_MS, RELOAD_FOR_BUILD_WINDOW_MS,
  checkDue, isNewerBuild, mayReloadFor, parseBuildReload, shouldCheckVersion, staleCodeAction,
} from "@/lib/releaseCheck";

let passed = 0;
function check(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ok   ${name}`); }
  catch (e) {
    console.log(`  FAIL ${name}\n       ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`);
    process.exitCode = 1;
  }
}

const where = { running: "c8d60bf", prod: true, inFrame: false };

check("every open production page checks (Skew Protection pins the worker's own check too)", () => {
  assert.equal(shouldCheckVersion(where), true);
});
check("never in a frame, a dev build, or a build without a real id", () => {
  assert.equal(shouldCheckVersion({ ...where, inFrame: true }), false);
  assert.equal(shouldCheckVersion({ ...where, prod: false }), false);
  assert.equal(shouldCheckVersion({ ...where, running: "local" }), false);
});

check("a different live build is newer; the same one isn't", () => {
  assert.equal(isNewerBuild("c8d60bf", "a1b2c3d"), true);
  assert.equal(isNewerBuild("c8d60bf", "C8D60BF"), false);
});
check("an odd answer never counts as a release", () => {
  for (const live of [undefined, null, "", "<!doctype html>", 42, "local", "not-a-sha"]) {
    assert.equal(isNewerBuild("c8d60bf", live), false, String(live));
  }
  assert.equal(isNewerBuild("local", "a1b2c3d"), false);
});

check("checks hourly, and on return to the foreground at most once a minute", () => {
  const t = 1_000_000_000;
  assert.equal(checkDue(0, t), true);
  assert.equal(checkDue(t, t + CHECK_EVERY_MS - 1), false);
  assert.equal(checkDue(t, t + CHECK_EVERY_MS), true);
  assert.equal(checkDue(t, t + MIN_GAP_MS - 1, true), false);
  assert.equal(checkDue(t, t + MIN_GAP_MS, true), true);
});

check("reloads for a given build once; again only after the window or for a newer one", () => {
  const t = 1_000_000_000;
  assert.equal(mayReloadFor(null, "a1b2c3d", t), true);
  const last = { build: "a1b2c3d", at: t };
  assert.equal(mayReloadFor(last, "a1b2c3d", t + 1000), false);
  assert.equal(mayReloadFor(last, "A1B2C3D", t + 1000), false);
  assert.equal(mayReloadFor(last, "a1b2c3d", t + RELOAD_FOR_BUILD_WINDOW_MS), true);
  assert.equal(mayReloadFor(last, "ffff000", t + 1000), true);
});
check("a damaged reload record reads as none", () => {
  assert.equal(parseBuildReload(null), null);
  assert.equal(parseBuildReload("{oops"), null);
  assert.equal(parseBuildReload('{"build":1,"at":"x"}'), null);
  assert.deepEqual(parseBuildReload('{"build":"a1b2c3d","at":5}'), { build: "a1b2c3d", at: 5 });
});

check("missing code with nothing in progress: reload", () => {
  assert.equal(staleCodeAction({ formInProgress: false, attemptSpent: false, appGone: false }), "reload");
});
check("missing code mid-form (or mid-recording/upload): the banner, never a reload", () => {
  assert.equal(staleCodeAction({ formInProgress: true, attemptSpent: false, appGone: false }), "banner");
  assert.equal(staleCodeAction({ formInProgress: true, attemptSpent: true, appGone: false }), "banner");
});
check("missing code after the one attempt is spent: the error screen, not another reload", () => {
  assert.equal(staleCodeAction({ formInProgress: false, attemptSpent: true, appGone: false }), "error");
  assert.equal(staleCodeAction({ formInProgress: false, attemptSpent: true, appGone: true }), "error");
});
check("the root error screen already replaced the app: reload even if a form had registered", () => {
  assert.equal(staleCodeAction({ formInProgress: true, attemptSpent: false, appGone: true }), "reload");
});

console.log(`\n${passed} passed${process.exitCode ? ", some FAILED" : ""}`);
