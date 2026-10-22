/**
 * The Flock shell's device memory and avatar.
 *
 *   npm run test:flock-shell
 *
 * Pins the pure parts of the hidden Flock mode: the last-mode memory defaults
 * to care and never throws (private browsing, storage blocked), and the avatar
 * initial prefers a name over an email. The gate itself is the server's
 * flock_enabled(); the screens are checked in the browser (see the PR).
 *
 * Plain asserts, since the repo carries no test runner. Exits non-zero on
 * failure so it can gate a merge.
 */
import assert from "node:assert/strict";
import { rememberMode, rememberedMode } from "@/lib/flock";
import { avatarInitial } from "@/lib/accountInitial";

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

console.log(`\n${passed} passed${process.exitCode ? ", some FAILED" : ""}`);
