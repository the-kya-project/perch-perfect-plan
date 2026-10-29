/**
 * Local form drafts (the full health check, the weight entry) and the "form in
 * progress" registry the app-update banner reads.
 *
 *   npm run test:drafts
 *
 * Pins src/lib/draftStore.ts: a draft is scoped to one account AND one bird,
 * expires after 24 hours, and broken storage (private mode, a full quota, no
 * IndexedDB) means "no draft" rather than an error. Pins
 * src/lib/formsInProgress.ts: only forms that can't keep a draft hold the
 * Update button back, and flushAllDrafts never waits on a stuck save.
 *
 * Plain asserts, since the repo carries no test runner. Exits non-zero on
 * failure so it can gate a merge.
 */
import assert from "node:assert/strict";
import { DRAFT_TTL_MS, deletePhoto, draftKey, loadPhoto, readDraft, removeDraft, savePhoto, sweepExpiredDrafts, writeDraftText } from "@/lib/draftStore";
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
