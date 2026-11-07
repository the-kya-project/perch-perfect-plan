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
  chapterLine, destForPath, isFlockOnboardingPath, pick, pickOptional, pickQuery,
} from "@/lib/flockNav";
import { defaultDisplayName, greetingName, isAutomaticDisplayName, memberCountLine, membershipSummary } from "@/lib/flockProfile";
import { accessCells, accessDay } from "@/lib/flockAccess";

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
  assert.equal(destForPath("/flock/members"), "chapter");
  assert.equal(destForPath("/flock/members/abc"), null);
  assert.equal(destForPath("/flock/you"), null);
  assert.equal(destForPath("/flock/you/edit"), null);
  assert.equal(destForPath("/flock/birds/abc"), null);
});
check("welcome and setup have no tab bar", () => {
  assert.ok(isFlockOnboardingPath("/flock/welcome"));
  assert.ok(isFlockOnboardingPath("/flock/setup"));
  assert.ok(!isFlockOnboardingPath("/flock"));
  assert.ok(!isFlockOnboardingPath("/flock/you"));
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

console.log("admin access cells");
const NOW = new Date("2027-03-01T12:00:00Z");
const ent = (o: Partial<{ starts_at: string | null; ends_at: string | null; status: string }>) =>
  ({ entitlement_id: "e1", status: "active", starts_at: null, ends_at: null, ...o });
check("no entitlement", () => {
  assert.deepEqual(accessCells(undefined, NOW), { starts: "—", ends: "—", state: "No entitlement" });
  assert.equal(accessCells({ entitlement_id: null, status: null, starts_at: null, ends_at: null }, NOW).state, "No entitlement");
});
check("before the Flock has an opening day", () => {
  assert.deepEqual(accessCells(ent({ status: "trialing" }), NOW), { starts: "When the Flock opens", ends: "—", state: "Waiting for opening day" });
});
check("founding free months, scheduled then active", () => {
  const f = ent({ status: "trialing", starts_at: "2027-01-05T00:00:00Z", ends_at: "2027-07-05T00:00:00Z" });
  assert.equal(accessCells(f, new Date("2026-12-01T00:00:00Z")).state, "Scheduled");
  assert.deepEqual(accessCells(f, NOW), { starts: "Jan 5, 2027", ends: "Jul 5, 2027", state: "Active (free months)" });
});
check("gift year: active, expired, refunded", () => {
  const g = ent({ starts_at: "2027-01-05T00:00:00Z", ends_at: "2028-01-05T00:00:00Z" });
  assert.equal(accessCells(g, NOW).state, "Active");
  assert.equal(accessCells(g, new Date("2028-02-01T00:00:00Z")).state, "Expired");
  assert.equal(accessCells({ ...g, status: "canceled", ends_at: "2027-02-01T00:00:00Z" }, NOW).state, "Ended");
});
check("no end date (comp)", () => {
  assert.equal(accessCells(ent({ starts_at: "2026-11-01T00:00:00Z" }), NOW).ends, "No end date");
});
check("days are UTC, so every admin sees the same date", () => {
  assert.equal(accessDay("2027-01-05T00:00:00Z"), "Jan 5, 2027");
  assert.equal(accessDay("2027-01-04T23:59:00Z"), "Jan 4, 2027");
});

console.log("profiles");
check("display name: first name and last initial, never an email", () => {
  assert.equal(defaultDisplayName("Brittany", "Brittany King"), "Brittany K.");
  assert.equal(defaultDisplayName(null, "brittany king"), "brittany K.");
  assert.equal(defaultDisplayName("Kiwi", null), "Kiwi");
  assert.equal(defaultDisplayName("Ana", "Ana"), "Ana");
  assert.equal(defaultDisplayName("Mary", "Mary Jo Smith"), "Mary S.");
  assert.equal(defaultDisplayName(null, null), "Member");
  assert.equal(defaultDisplayName("", "  "), "Member");
});
check("greeting: first name, else the display name's first word", () => {
  assert.equal(greetingName("Brittany", "Brittany K."), "Brittany");
  assert.equal(greetingName(null, "Ben M."), "Ben");
  assert.equal(greetingName(null, null), "");
});
check("setup replaces only an automatic display name", () => {
  assert.ok(isAutomaticDisplayName("Brittany King", "Brittany King"));
  assert.ok(isAutomaticDisplayName("Founding member", "Brittany King"));
  assert.ok(isAutomaticDisplayName(null, "x"));
  assert.ok(!isAutomaticDisplayName("Birdlady B.", "Brittany King"));
});
check("member count line", () => {
  assert.equal(memberCountLine(1), "1 member · meetups unlock at 15");
  assert.equal(memberCountLine(8), "8 members · meetups unlock at 15");
  assert.equal(memberCountLine(15), "15 members");
});
check("membership: founding before and after opening", () => {
  const f = { plan: "founding", status: "trialing", source: "founding", starts_at: null, current_period_end: null, free_until: null };
  assert.equal(membershipSummary([f], false).line, "Founding · $15/mo · first 6 months free once the Flock opens");
  const open = { ...f, starts_at: "2027-01-05T06:00:00Z", free_until: "2027-07-05T06:00:00Z", current_period_end: "2027-07-05T06:00:00Z" };
  assert.equal(membershipSummary([open], false, new Date("2027-02-01T00:00:00Z")).line, "Founding · $15/mo · free until Jul 5, 2027");
});
check("membership: gifts, comp, admin, none", () => {
  const g = { plan: "annual", status: "active", source: "gift", starts_at: "2027-01-05T06:00:00Z", current_period_end: "2028-01-05T06:00:00Z", free_until: null };
  assert.equal(membershipSummary([g], false, new Date("2027-03-01T00:00:00Z")).line, "Gift membership · until Jan 5, 2028");
  assert.equal(membershipSummary([g], false, new Date("2026-12-01T00:00:00Z")).line, "Gift membership · starts Jan 5, 2027");
  assert.equal(membershipSummary([{ ...g, starts_at: null, current_period_end: null }], false).line, "Gift membership · starts when the Flock opens");
  assert.equal(membershipSummary([{ ...g, source: "manual", plan: "comp", starts_at: "2026-10-01T00:00:00Z", current_period_end: null }], false).line, "Complimentary membership");
  assert.equal(membershipSummary([], true).title, "Admin access");
  assert.equal(membershipSummary([], false).line, "No membership yet");
  const refunded = { ...g, status: "canceled", current_period_end: "2027-02-01T00:00:00Z" };
  assert.equal(membershipSummary([refunded], false, new Date("2027-03-01T00:00:00Z")).line, "No membership yet");
});

console.log(`\n${passed} passed${process.exitCode ? ", some FAILED" : ""}`);
