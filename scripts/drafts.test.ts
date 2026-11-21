/**
 * Local form drafts (the full health check, the weight entry) and the "form in
 * progress" registry the app-update banner reads.
 *
 *   npm run test:drafts
 *
 * Pins src/lib/draftStore.ts: an owner's draft is scoped to one account AND
 * one bird, a sitter's to one sit link AND one bird; a draft expires after 24
 * hours, and a sitter's also when the sit ends, whichever is first; and broken storage (private mode, a full quota, no
 * IndexedDB) means "no draft" rather than an error. Pins
 * src/lib/formsInProgress.ts: only forms that can't keep a draft hold the
 * Update button back, and flushAllDrafts never waits on a stuck save.
 *
 * Recorded clips (ClipRecorder): saved under the same account/sit + bird keys
 * plus the clip slot, with the same expiry; skipped when the device has no
 * room; and src/lib/clipCapture.ts decides what a camera drop keeps and when
 * an app update may go ahead.
 *
 * Plain asserts, since the repo carries no test runner. Exits non-zero on
 * failure so it can gate a merge.
 */
import assert from "node:assert/strict";
import { DRAFT_TTL_MS, clipFitsStorage, deleteClipDraft, deletePhoto, draftKey, isDraftFresh, loadClipDraft, loadPhoto, readDraft, removeDraft, removeSitDrafts, saveClipDraft, savePhoto, sitDraftKey, sitTag, sweepExpiredClipDrafts, sweepExpiredDrafts, writeDraftText } from "@/lib/draftStore";
import { MIN_KEEP_SECONDS, SUSPEND_GAP_MS, canKeepInterrupted, capturedSeconds, recorderKeepable } from "@/lib/clipCapture";
import { flushAllDrafts, formInProgress, registerForm, unsavedWorkWithoutDraft } from "@/lib/formsInProgress";

let passed = 0;
async function check(name: string, fn: () => void | Promise<void>) {
  try { await fn(); passed++; console.log(`  ok   ${name}`); }
  catch (e) {
    console.log(`  FAIL ${name}\n       ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`);
    process.exitCode = 1;
  }
}

/** A Map-backed localStorage; `broken` makes every call throw. */
function installStorage(broken = false) {
  const m = new Map<string, string>();
  const boom = () => { throw new Error("SecurityError: storage blocked"); };
  (globalThis as any).localStorage = broken
    ? { getItem: boom, setItem: boom, removeItem: boom, key: boom, get length() { return boom(); } }
    : {
      getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
      setItem: (k: string, v: string) => { m.set(k, String(v)); },
      removeItem: (k: string) => { m.delete(k); },
      key: (i: number) => [...m.keys()][i] ?? null,
      get length() { return m.size; },
    };
  return m;
}

const NOW = Date.parse("2026-10-29T14:14:00Z");
const owner = draftKey({ userId: "user-owner", birdId: "bird-kiwi", kind: "full-check" });
const household = draftKey({ userId: "user-household", birdId: "bird-kiwi", kind: "full-check" });
const otherBird = draftKey({ userId: "user-owner", birdId: "bird-mango", kind: "full-check" });

await check("keys differ by account and by bird", () => {
  assert.notEqual(owner, household);
  assert.notEqual(owner, otherBird);
});

await check("a draft reads back for its own account and bird only", () => {
  installStorage();
  assert.ok(writeDraftText(owner, { savedAt: NOW, data: { notes: "a bit fluffed" } }));
  assert.deepEqual(readDraft<{ notes: string }>(owner, NOW)?.data, { notes: "a bit fluffed" });
  assert.equal(readDraft(household, NOW), null);
  assert.equal(readDraft(otherBird, NOW), null);
});

await check("a draft is kept just under 24 hours and dropped at 24", () => {
  const m = installStorage();
  writeDraftText(owner, { savedAt: NOW, data: { grams: "95" } });
  assert.ok(readDraft(owner, NOW + DRAFT_TTL_MS - 1));
  assert.equal(readDraft(owner, NOW + DRAFT_TTL_MS), null);
  assert.equal(m.has(owner), false, "the expired draft is removed, not just hidden");
});

await check("a draft dated in the future (clock change) is not trusted", () => {
  installStorage();
  writeDraftText(owner, { savedAt: NOW + 60_000, data: {} });
  assert.equal(readDraft(owner, NOW), null);
});

await check("a corrupt draft reads as none", () => {
  const m = installStorage();
  m.set(owner, "{not json");
  assert.equal(readDraft(owner, NOW), null);
});

await check("sweep removes expired drafts of any account, keeps fresh ones and other keys", () => {
  const m = installStorage();
  writeDraftText(owner, { savedAt: NOW - DRAFT_TTL_MS - 1, data: {} });
  writeDraftText(household, { savedAt: NOW - 1000, data: {} });
  m.set("kya-auto-reload", "123");
  sweepExpiredDrafts(NOW);
  assert.equal(m.has(owner), false);
  assert.equal(m.has(household), true);
  assert.equal(m.get("kya-auto-reload"), "123");
});

await check("blocked storage: nothing throws, nothing is restored", () => {
  installStorage(true);
  assert.equal(writeDraftText(owner, { savedAt: NOW, data: {} }), false);
  assert.equal(readDraft(owner, NOW), null);
  removeDraft(owner);
  sweepExpiredDrafts(NOW);
});

await check("no IndexedDB: photo calls resolve quietly", async () => {
  delete (globalThis as any).indexedDB;
  assert.equal(await savePhoto(owner, "data:image/jpeg;base64,AAAA"), false);
  assert.equal(await loadPhoto(owner), null);
  await deletePhoto(owner);
});

// ── Sitter drafts: scoped to the sit link + bird, ending with the sit ──

const TOKEN_A = "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90";
const TOKEN_B = "f0e9d8c7b6a5948372615049382716051f0e9d8c7b6a5948372615049382716";
const sitA = sitDraftKey({ token: TOKEN_A, birdId: "bird-kiwi", kind: "full-check" });
const sitB = sitDraftKey({ token: TOKEN_B, birdId: "bird-kiwi", kind: "full-check" });
const sitAMango = sitDraftKey({ token: TOKEN_A, birdId: "bird-mango", kind: "full-check" });

await check("sit keys differ by sit and by bird, and never match an owner key", () => {
  assert.notEqual(sitA, sitB);
  assert.notEqual(sitA, sitAMango);
  assert.notEqual(sitA, owner);
  assert.ok(sitA.includes(":sit-"));
});

await check("a sit key is stable and doesn't contain the link token", () => {
  assert.equal(sitA, sitDraftKey({ token: TOKEN_A, birdId: "bird-kiwi", kind: "full-check" }));
  assert.equal(sitTag(TOKEN_A), sitTag(TOKEN_A));
  assert.ok(!sitA.includes(TOKEN_A));
  assert.ok(!sitA.includes(TOKEN_A.slice(0, 12)));
});

await check("two sits on one phone don't share a draft", () => {
  installStorage();
  writeDraftText(sitA, { savedAt: NOW, data: { notes: "sit A" }, expiresAt: NOW + 3 * DRAFT_TTL_MS });
  assert.equal(readDraft(sitB, NOW), null);
  assert.equal(readDraft(sitAMango, NOW), null);
  assert.deepEqual(readDraft<{ notes: string }>(sitA, NOW)?.data, { notes: "sit A" });
});

await check("a sitter draft ends when the sit ends, even inside 24 hours", () => {
  const m = installStorage();
  const sitEnds = NOW + 2 * 3600e3; // the sit ends in two hours
  writeDraftText(sitA, { savedAt: NOW, data: {}, expiresAt: sitEnds });
  assert.ok(readDraft(sitA, sitEnds - 1));
  assert.equal(readDraft(sitA, sitEnds), null);
  assert.equal(m.has(sitA), false, "removed, not just hidden");
});

await check("a sitter draft still ends after 24 hours when the sit runs longer", () => {
  installStorage();
  writeDraftText(sitA, { savedAt: NOW, data: {}, expiresAt: NOW + 5 * DRAFT_TTL_MS });
  assert.ok(readDraft(sitA, NOW + DRAFT_TTL_MS - 1));
  assert.equal(readDraft(sitA, NOW + DRAFT_TTL_MS), null);
});

await check("sweep removes a draft whose sit has ended, without opening the sit", () => {
  const m = installStorage();
  writeDraftText(sitA, { savedAt: NOW - 1000, data: {}, expiresAt: NOW - 1 });
  writeDraftText(sitB, { savedAt: NOW - 1000, data: {}, expiresAt: NOW + 3600e3 });
  sweepExpiredDrafts(NOW);
  assert.equal(m.has(sitA), false);
  assert.equal(m.has(sitB), true);
});

await check("an expired link removes that sit's drafts only", () => {
  const m = installStorage();
  writeDraftText(sitA, { savedAt: NOW, data: {} });
  writeDraftText(sitAMango, { savedAt: NOW, data: {} });
  writeDraftText(sitB, { savedAt: NOW, data: {} });
  writeDraftText(owner, { savedAt: NOW, data: {} });
  removeSitDrafts(TOKEN_A);
  assert.equal(m.has(sitA), false);
  assert.equal(m.has(sitAMango), false);
  assert.equal(m.has(sitB), true);
  assert.equal(m.has(owner), true);
});

await check("blocked storage: removing a sit's drafts doesn't throw", () => {
  installStorage(true);
  removeSitDrafts(TOKEN_A);
});

// ── Recorded clips ──

const ownerBaseline = draftKey({ userId: "user-owner", birdId: "bird-kiwi", kind: "clip:baseline" });
const ownerTip = draftKey({ userId: "user-owner", birdId: "bird-kiwi", kind: "clip:tip:stepUp" });
const householdBaseline = draftKey({ userId: "user-household", birdId: "bird-kiwi", kind: "clip:baseline" });
const ownerMangoBaseline = draftKey({ userId: "user-owner", birdId: "bird-mango", kind: "clip:baseline" });
const sitClipA = sitDraftKey({ token: TOKEN_A, birdId: "bird-kiwi", kind: "clip:baseline" });
const sitClipB = sitDraftKey({ token: TOKEN_B, birdId: "bird-kiwi", kind: "clip:baseline" });

await check("clip keys differ by account, bird, clip slot and sit", () => {
  const keys = [ownerBaseline, ownerTip, householdBaseline, ownerMangoBaseline, sitClipA, sitClipB];
  assert.equal(new Set(keys).size, keys.length);
  assert.notEqual(ownerBaseline, owner, "a clip never shares a key with the health check");
  assert.ok(!sitClipA.includes(TOKEN_A), "no link token in a clip key");
});

await check("a saved clip keeps 24 hours, a sitter's also ends with the sit", () => {
  assert.ok(isDraftFresh(NOW, NOW + DRAFT_TTL_MS - 1));
  assert.equal(isDraftFresh(NOW, NOW + DRAFT_TTL_MS), false);
  const sitEnds = NOW + 3600e3;
  assert.ok(isDraftFresh(NOW, sitEnds - 1, sitEnds));
  assert.equal(isDraftFresh(NOW, sitEnds, sitEnds), false);
  assert.equal(isDraftFresh(NOW + 60_000, NOW), false, "dated in the future");
});

await check("a clip too big for the device's free space isn't saved", () => {
  const MB = 1024 * 1024;
  assert.equal(clipFitsStorage(20 * MB, { quota: 100 * MB, usage: 90 * MB }), false);
  assert.equal(clipFitsStorage(20 * MB, { quota: 1000 * MB, usage: 100 * MB }), true);
  assert.equal(clipFitsStorage(20 * MB, { quota: 40 * MB, usage: 0 }), true, "1.5x plus 5 MB headroom fits");
  assert.equal(clipFitsStorage(20 * MB, { quota: 34 * MB, usage: 0 }), false);
  assert.equal(clipFitsStorage(20 * MB, null), true, "unknown quota: try, the save is guarded");
});

await check("no IndexedDB: saving a clip fails quietly, nothing comes back", async () => {
  delete (globalThis as any).indexedDB;
  const blob = new Blob([new Uint8Array(1024)], { type: "video/mp4" });
  assert.equal(await saveClipDraft(ownerBaseline, { blob, name: "clip.mp4", type: "video/mp4", seconds: 12 }), false);
  assert.equal(await loadClipDraft(ownerBaseline), null);
  await deleteClipDraft(ownerBaseline);
  await sweepExpiredClipDrafts();
});

await check("camera drop: time while the page was suspended isn't counted", () => {
  const start = NOW;
  // Ticking normally: everything up to now counts.
  assert.equal(capturedSeconds(start, start + 9_900, start + 10_000), 10);
  // Last tick 9 s in, page suspended, back 2 minutes later: 9 s captured.
  assert.equal(capturedSeconds(start, start + 9_000, start + 129_000), 9);
  // A hiccup shorter than the suspend gap still counts as running.
  assert.equal(capturedSeconds(start, start + 5_000, start + 5_000 + SUSPEND_GAP_MS), 5 + SUSPEND_GAP_MS / 1000);
});

await check("camera drop: keep only with real video and at least 2 seconds", () => {
  assert.equal(MIN_KEEP_SECONDS, 2);
  assert.equal(canKeepInterrupted(1.9, true), false);
  assert.equal(canKeepInterrupted(2, true), true);
  assert.equal(canKeepInterrupted(30, false), false, "no video arrived");
});

await check("update banner: waits while recording or uploading, not for a saved clip", () => {
  const k = (phase: Parameters<typeof recorderKeepable>[0]["phase"], uploading = false, draftSaved = false) => recorderKeepable({ phase, uploading, draftSaved });
  assert.equal(k("recording"), false);
  assert.equal(k("stopping"), false);
  assert.equal(k("review", true, true), false, "mid-upload");
  assert.equal(k("review", false, false), false, "recorded but not saved on the device (too big, storage blocked)");
  assert.equal(k("review", false, true), true);
  assert.equal(k("interrupted", false, true), true);
  assert.equal(k("saved", false, true), true);
  assert.equal(k("ready"), true, "a live preview has nothing to lose");
  assert.equal(k("idle"), true);
});

await check("forms: nothing registered = nothing in progress", () => {
  assert.equal(formInProgress(), false);
  assert.equal(unsavedWorkWithoutDraft(), false);
});

await check("forms: a form with a draft is in progress but doesn't block Update", () => {
  let typing = true;
  const off = registerForm({ active: () => typing, flush: () => {} });
  assert.equal(formInProgress(), true);
  assert.equal(unsavedWorkWithoutDraft(), false);
  typing = false;
  assert.equal(formInProgress(), false);
  off();
});

await check("forms: a clip mid-upload (no draft) blocks Update", () => {
  const off = registerForm({ active: () => true });
  assert.equal(unsavedWorkWithoutDraft(), true);
  off();
  assert.equal(unsavedWorkWithoutDraft(), false);
});

await check("forms: a form whose check throws counts as idle", () => {
  const off = registerForm({ active: () => { throw new Error("x"); } });
  assert.equal(formInProgress(), false);
  off();
});

await check("flushAllDrafts saves active forms only, and never waits past its timeout", async () => {
  const saved: string[] = [];
  const offs = [
    registerForm({ active: () => true, flush: () => { saved.push("check"); } }),
    registerForm({ active: () => false, flush: () => { saved.push("idle"); } }),
    registerForm({ active: () => true, flush: () => new Promise(() => {}) }), // stuck
    registerForm({ active: () => true, flush: () => Promise.reject(new Error("offline")) }),
  ];
  const t0 = Date.now();
  await flushAllDrafts(150);
  assert.deepEqual(saved, ["check"]);
  assert.ok(Date.now() - t0 < 1000, "a stuck save held the reload");
  offs.forEach((off) => off());
});

console.log(`\n${passed} passed${process.exitCode ? ", some FAILED" : ""}`);
