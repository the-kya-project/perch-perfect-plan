/**
 * The owner's sitter preview steps in when its frame hasn't started.
 *
 *   npm run test:sit-preview-recovery
 *
 * On Nov 1, 2026 an app left open across a release showed "Something's taking
 * too long" in the preview until the owner closed and reopened it. This pins
 * src/lib/sitPreviewRecovery.ts: wait while the frame starts, then move onto a
 * waiting build, otherwise reload the frame once, and never loop.
 *
 * Plain asserts, since the repo carries no test runner. Exits non-zero on
 * failure so it can gate a merge.
 */
import assert from "node:assert/strict";
import { FRAME_START_MS, stalledFrameAction } from "@/lib/sitPreviewRecovery";

let passed = 0;
function check(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ok   ${name}`); }
  catch (e) {
    console.log(`  FAIL ${name}\n       ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`);
    process.exitCode = 1;
  }
}

const base = { started: false, elapsedMs: 0, updateReady: false, reloadedFrame: false };

check("steps in before the frame's own 10-second check", () => {
  assert.ok(FRAME_START_MS > 0 && FRAME_START_MS < 10_000);
});

check("waits while the frame is still within its time", () => {
  assert.equal(stalledFrameAction({ ...base, elapsedMs: FRAME_START_MS - 1 }), "wait");
  assert.equal(stalledFrameAction({ ...base, elapsedMs: FRAME_START_MS - 1, updateReady: true }), "wait");
});

check("a started frame is left alone, however long it took", () => {
  assert.equal(stalledFrameAction({ ...base, started: true, elapsedMs: 60_000, updateReady: true }), "wait");
});

check("a stalled frame with a newer build waiting moves the app onto it", () => {
  assert.equal(stalledFrameAction({ ...base, elapsedMs: FRAME_START_MS, updateReady: true }), "update-app");
  assert.equal(stalledFrameAction({ ...base, elapsedMs: FRAME_START_MS, updateReady: true, reloadedFrame: true }), "update-app");
});

check("a stalled frame with no update reloads the frame once", () => {
  assert.equal(stalledFrameAction({ ...base, elapsedMs: FRAME_START_MS }), "reload-frame");
});

check("never reloads the frame twice", () => {
  assert.equal(stalledFrameAction({ ...base, elapsedMs: FRAME_START_MS * 3, reloadedFrame: true }), "leave");
});

console.log(`\n${passed} passed${process.exitCode ? ", some FAILED" : ""}`);
