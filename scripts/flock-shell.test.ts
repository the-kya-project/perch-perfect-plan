/**
 * The Flock shell's device memory and avatar.
 *
 *   npm run test:flock-shell
 *
 * Pins the pure parts of the hidden Flock mode: the last-mode memory defaults
 * to care and never throws (private browsing, storage blocked), the avatar
 * initial prefers a name over an email, and the Community navigation (tabs,
 * redirects, chips, filter links) in lib/flockNav.ts. The gate itself is the server's
 * flock_enabled(); the screens are checked in the browser (see the PR).
 *
 * Plain asserts, since the repo carries no test runner. Exits non-zero on
 * failure so it can gate a merge.
 */
import assert from "node:assert/strict";
import { rememberMode, rememberedMode } from "@/lib/flock";
import { avatarInitial } from "@/lib/accountInitial";
import {
  CHAPTER_TABS, FLOCK_DESTS, FLOCK_REDIRECTS, FLOCK_SPACES, JOURNEYS_FILTERS, LIBRARY_SUBJECTS, LIBRARY_TYPES, TODAY_FILTERS,
  chapterLine, destForPath, pick, pickOptional, pickQuery,
} from "@/lib/flockNav";

let passed = 0;
function check(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ok   ${name}`); }
  catch (e) {
    console.log(`  FAIL ${name}\n       ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`);
    process.exitCode = 1;
  }
}

const g = globalThis as { localStorage?: Storage };
function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() { return m.size; },
    clear: () => m.clear(),
    getItem: (k) => (m.has(k) ? m.get(k)! : null),
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => { m.delete(k); },
    setItem: (k, v) => { m.set(k, String(v)); },
  };
}

console.log("last mode");
check("defaults to care on a fresh device", () => {
  g.localStorage = memoryStorage();
  assert.equal(rememberedMode(), "care");
});
check("remembers flock, then care", () => {
  g.localStorage = memoryStorage();
  rememberMode("flock");
  assert.equal(rememberedMode(), "flock");
  rememberMode("care");
  assert.equal(rememberedMode(), "care");
});
check("anything unexpected in storage reads as care", () => {
  g.localStorage = memoryStorage();
  g.localStorage.setItem("kya_mode", "admin");
  assert.equal(rememberedMode(), "care");
});
check("storage that throws: care, and no crash", () => {
  g.localStorage = {
    ...memoryStorage(),
    getItem: () => { throw new Error("blocked"); },
    setItem: () => { throw new Error("blocked"); },
  };
  assert.doesNotThrow(() => rememberMode("flock"));
  assert.equal(rememberedMode(), "care");
});

console.log("avatar initial");
check("prefers the display name", () => {
  assert.equal(avatarInitial({ display_name: "brittany", full_name: "Zed" }, "x@example.com"), "B");
});
check("falls back to full name, then email", () => {
  assert.equal(avatarInitial({ full_name: "  kiwi " }, "x@example.com"), "K");
  assert.equal(avatarInitial({}, "staging-owner@example.com"), "S");
});
check("nothing known: empty, not a crash", () => {
  assert.equal(avatarInitial(undefined, undefined), "");
});

console.log("community navigation");
check("five destinations, left to right, My birds last and back to care", () => {
  assert.deepEqual(FLOCK_DESTS.map((d) => d.key), ["today", "journeys", "chapter", "library", "care"]);
  assert.deepEqual(FLOCK_DESTS.map((d) => d.to), ["/flock", "/flock/journeys", "/flock/chapter", "/flock/library", "/dashboard"]);
});
check("every path lights the right tab", () => {
  assert.equal(destForPath("/flock"), "today");
  assert.equal(destForPath("/flock/"), "today");
  assert.equal(destForPath("/flock/journeys"), "journeys");
  assert.equal(destForPath("/flock/chapter"), "chapter");
  assert.equal(destForPath("/flock/library"), "library");
  assert.equal(destForPath("/flock/something-new"), "today");
});
check("old placeholder URLs redirect to a real tab", () => {
  assert.equal(FLOCK_REDIRECTS["/flock/spaces"], "/flock");
  assert.equal(FLOCK_REDIRECTS["/flock/learn"], "/flock/library");
  for (const to of Object.values(FLOCK_REDIRECTS)) assert.ok(FLOCK_DESTS.some((d) => d.to === to), to);
});
check("the chips and spaces are the ones in the design", () => {
  assert.deepEqual(FLOCK_SPACES, ["start", "learn", "good"]);
  assert.deepEqual(TODAY_FILTERS, ["everything", "learn", "good", "start"]);
  assert.deepEqual(JOURNEYS_FILTERS, ["for-you", "following", "tricks", "basics"]);
  assert.deepEqual(CHAPTER_TABS, ["posts", "events", "resources"]);
  assert.deepEqual(LIBRARY_TYPES, ["all", "guides", "recordings", "podcast"]);
  assert.deepEqual(LIBRARY_SUBJECTS, ["foraging", "diet", "training", "hormones", "conservation"]);
});
check("bad or old filter links fall back instead of breaking", () => {
  assert.equal(pick("good", TODAY_FILTERS, "everything"), "good");
  assert.equal(pick("nonsense", TODAY_FILTERS, "everything"), "everything");
  assert.equal(pick(42, TODAY_FILTERS, "everything"), "everything");
  assert.equal(pickOptional("learn", FLOCK_SPACES), "learn");
  assert.equal(pickOptional("everything", FLOCK_SPACES), undefined);
  assert.equal(pickOptional(undefined, CHAPTER_TABS), undefined);
});
check("library search text: trimmed to 100 characters, blank is none", () => {
  assert.equal(pickQuery("pellets"), "pellets");
  assert.equal(pickQuery("   "), undefined);
  assert.equal(pickQuery(["x"]), undefined);
  assert.equal(pickQuery("a".repeat(150))?.length, 100);
});
check("chapter line: name, then states", () => {
  assert.equal(chapterLine("Great Lakes", ["IL", "IN", "MI", "OH"]), "Great Lakes · IL · IN · MI · OH");
  assert.equal(chapterLine("Other region", []), "Other region");
  assert.equal(chapterLine("Texas", null), "Texas");
});

console.log(`\n${passed} passed${process.exitCode ? ", some FAILED" : ""}`);
