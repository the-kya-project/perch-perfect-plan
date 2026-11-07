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
  chapterLine, destForPath, isFlockFullScreenPath, isFlockOnboardingPath, pick, pickOptional, pickQuery,
} from "@/lib/flockNav";
import { birdsLine, filterRoster, speciesGroup, topGroups } from "@/lib/flockMembers";
import { dateBlock, eventIcs, goersLine, longWhen, shortWhen } from "@/lib/flockEvents";
import { AAV_FIND_A_VET_URL, POST_SPACES, findVetSigns, mergeFeed, rateLimitKind, replyPrefix, threadComments } from "@/lib/flockPosts";
import { defaultDisplayName, greetingName, isAutomaticDisplayName, memberCountLine, membershipSummary } from "@/lib/flockProfile";
import { accessCells, accessDay } from "@/lib/flockAccess";
import {
  birdPronoun, canStartCustom, customProblem, daysSince, defaultVisibility, groupTemplates, isLocked, journeyDay, journeyDays,
  nextMilestone, possessive, progressOf, skillInSentence, startHere, trimTrailingBlanks, vetCheckLine, visibilityChoices, wantsTip,
  type JourneyTemplate,
} from "@/lib/journeys";

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
  assert.ok(isFlockOnboardingPath("/flock/journeys/start"));
  assert.ok(isFlockOnboardingPath("/flock/journeys/setup"));
  assert.ok(isFlockOnboardingPath("/flock/journeys/known"));
  assert.ok(!isFlockOnboardingPath("/flock/journeys"));
  assert.ok(!isFlockOnboardingPath("/flock/journeys/abc"));
  assert.ok(isFlockOnboardingPath("/flock/journeys/abc/post"));
  assert.ok(isFlockOnboardingPath("/flock/journeys/abc/milestone/3"));
  assert.ok(isFlockOnboardingPath("/flock/journeys/abc/finished"));
  assert.ok(!isFlockOnboardingPath("/flock/journeys/abc/postscript"));
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
  assert.deepEqual(CHAPTER_TABS, ["posts", "events", "resources", "members"]);
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

// ---- Journeys (step 3) -------------------------------------------------------
const tpl = (slug: string, tier: "free" | "premium", sort: number): JourneyTemplate => ({
  id: slug, slug, name: slug, category: "tricks", tier, purpose: "", done_when: "", suggested_first: null,
  typical_length: "", safety_notes: [], safeguards: [], tips: [], sort_order: sort, milestones: [],
});
check("journeys: templates group into the basics, then tricks and more, in catalog order", () => {
  const g = groupTemplates([tpl("wave", "premium", 100), tpl("recall", "free", 40), tpl("scale", "free", 10), tpl("spin", "premium", 120)]);
  assert.deepEqual(g.basics.map((x) => x.slug), ["scale", "recall"]);
  assert.deepEqual(g.more.map((x) => x.slug), ["wave", "spin"]);
});
check("journeys: premium templates lock without app premium", () => {
  assert.equal(isLocked({ tier: "premium" }, { can_use_premium: false }), true);
  assert.equal(isLocked({ tier: "premium" }, undefined), true);
  assert.equal(isLocked({ tier: "premium" }, { can_use_premium: true }), false);
  assert.equal(isLocked({ tier: "free" }, { can_use_premium: false }), false);
});
check("journeys: one custom journey at a time when there's a limit", () => {
  assert.equal(canStartCustom({ max_open_custom: 1, open_custom: 0 }), true);
  assert.equal(canStartCustom({ max_open_custom: 1, open_custom: 1 }), false);
  assert.equal(canStartCustom({ max_open_custom: null, open_custom: 7 }), true);
  assert.equal(canStartCustom(undefined), false);
});
check("journeys: only Flock members can choose the community", () => {
  assert.deepEqual(visibilityChoices({ can_share: false }), ["private"]);
  assert.deepEqual(visibilityChoices({ can_share: true }), ["community", "private"]);
  assert.equal(defaultVisibility({ can_share: true }), "community");
  assert.equal(defaultVisibility({ can_share: false }), "private");
});
check("journeys: start here is the first milestone not already done", () => {
  assert.equal(startHere(7, new Set([1, 2])), 3);
  assert.equal(startHere(7, new Set([2])), 1);
  assert.equal(startHere(3, new Set([1, 2, 3])), null);
});
check("journeys: a custom journey needs a name and 3 to 8 milestones", () => {
  assert.equal(customProblem("Bath time", ["a", "b", "c"]), null);
  assert.equal(customProblem("Bath time", ["a", "b", "c", ""]), null);
  assert.equal(customProblem("  ", ["a", "b", "c"]), "name");
  assert.equal(customProblem("Bath", ["a", "b"]), "tooFew");
  assert.equal(customProblem("Bath", ["1", "2", "3", "4", "5", "6", "7", "8", "9"]), "tooMany");
  assert.equal(customProblem("Bath", ["a", "", "c"]), "blank");
  assert.deepEqual(trimTrailingBlanks(["a", "", " "]), ["a"]);
});
check("journeys: pronouns, possessives and the vet check line", () => {
  assert.equal(birdPronoun("Female"), "she");
  assert.equal(birdPronoun("Male"), "he");
  assert.equal(birdPronoun(null), "they");
  assert.equal(birdPronoun("Unknown"), "they");
  assert.equal(possessive("Juno"), "Juno's");
  assert.equal(possessive("Iris"), "Iris'");
  assert.equal(vetCheckLine({ safeguards: ["Daily weigh-ins.", "The template suggests a vet check before starting."] }), "The template suggests a vet check before starting.");
  assert.equal(vetCheckLine({ safeguards: [] }), null);
});

check("journeys: after posting, a tip on hard days and the question on good ones", () => {
  assert.equal(wantsTip("all_in"), false);
  assert.equal(wantsTip("distracted"), true);
  assert.equal(wantsTip("not_today"), true);
});
check("journeys: next milestone, progress, days", () => {
  const ms = [{ position: 2, state: "todo" }, { position: 1, state: "already" }, { position: 3, state: "todo" }];
  assert.equal(nextMilestone(ms)?.position, 2);
  assert.deepEqual(progressOf(ms), { done: 1, total: 3 });
  assert.equal(nextMilestone([{ position: 1, state: "reached" }]), null);
  const now = new Date("2026-11-20T12:00:00Z");
  assert.equal(journeyDay("2026-11-20T08:00:00Z", now), 1);
  assert.equal(journeyDay("2026-11-04T12:00:00Z", now), 17);
  assert.equal(journeyDays("2026-10-04T12:00:00Z", "2026-11-04T12:00:00Z"), 31);
  assert.equal(daysSince(null, now), null);
  assert.equal(daysSince("2026-11-18T12:00:00Z", now), 2);
  assert.equal(skillInSentence("Recall"), "recall");
  assert.equal(skillInSentence("Step up"), "step up");
});

// ---- Posts, comments and the vet nudge (step 4) -------------------------------------
check("post screens are full screen (no tab bar) but still behind setup", () => {
  for (const p of ["/flock/post/new", "/flock/post/abc", "/flock/post/abc/edit", "/flock/comments/journey_update/abc", "/flock/reactions/post/abc"]) {
    assert.equal(isFlockFullScreenPath(p), true, p);
    assert.equal(isFlockOnboardingPath(p), false, p);
  }
  assert.equal(isFlockFullScreenPath("/flock"), false);
  assert.equal(isFlockFullScreenPath("/flock/postcards"), false);
  assert.equal(destForPath("/flock/post/abc"), "today");
});

check("Post to chips: Learn together, Do good, my chapter, Start here", () => {
  assert.deepEqual(POST_SPACES, ["learn", "good", "chapter", "start"]);
});

check("vet nudge: whole phrases, any case, curly quotes, never a partial word", () => {
  const signs = ["fluffed up", "sleeping a lot", "isn't eating", "bleeding", "blood", "tail bobbing", "sitting on the cage floor"];
  assert.deepEqual(findVetSigns("Echo has been Fluffed  up and sleeping a lot since yesterday and isn\u2019t eating much.", signs),
    ["fluffed up", "sleeping a lot", "isn't eating"]);
  assert.deepEqual(findVetSigns("Kiwi is sitting on the cage floor, tail bobbing.", signs), ["tail bobbing", "sitting on the cage floor"]);
  assert.deepEqual(findVetSigns("Our bloodhound loves Kiwi.", signs), []);
  assert.deepEqual(findVetSigns("A broken feather was bleeding", signs), ["bleeding"]);
  assert.deepEqual(findVetSigns("", signs), []);
  assert.deepEqual(findVetSigns("Walnut is Echo's favorite too!", signs), []);
});

check("the Find a vet link is the AAV's public search", () => {
  assert.equal(AAV_FIND_A_VET_URL, "https://www.aav.org/page/FindAVet2");
});

check("rate limit errors name the limit; anything else is not one", () => {
  assert.equal(rateLimitKind({ message: "rate_limited", details: "comments" }), "comments");
  assert.equal(rateLimitKind({ message: "rate_limited", details: "photos" }), "photos");
  assert.equal(rateLimitKind({ message: "rate_limited" }), "posts");
  assert.equal(rateLimitKind({ message: "not found" }), null);
  assert.equal(rateLimitKind(null), null);
});

check("comments thread one level deep, oldest first, orphans dropped", () => {
  const rows = [
    { comment_id: "c3", parent_id: "c1", created_at: "2026-11-07T10:03:00Z" },
    { comment_id: "c1", parent_id: null, created_at: "2026-11-07T10:01:00Z" },
    { comment_id: "c2", parent_id: "c1", created_at: "2026-11-07T10:02:00Z" },
    { comment_id: "c4", parent_id: null, created_at: "2026-11-07T10:04:00Z" },
    { comment_id: "c5", parent_id: "gone", created_at: "2026-11-07T10:05:00Z" },
  ];
  const t = threadComments(rows);
  assert.deepEqual(t.map((x) => [x.comment.comment_id, x.replies.map((r) => r.comment_id)]), [["c1", ["c2", "c3"]], ["c4", []]]);
});

check("replying adds the first name", () => {
  assert.equal(replyPrefix("Alex R."), "@Alex ");
  assert.equal(replyPrefix(""), "");
  assert.equal(replyPrefix(null), "");
});

check("Today mixes posts and milestone cards newest first; older cards wait for older posts", () => {
  const posts = [{ id: "p1", created_at: "2026-11-07T12:00:00Z" }, { id: "p2", created_at: "2026-11-07T09:00:00Z" }];
  const cards = [{ id: "m1", reached_at: "2026-11-07T10:00:00Z" }, { id: "m2", reached_at: "2026-11-06T10:00:00Z" }];
  const ids = (xs: ReturnType<typeof mergeFeed<(typeof posts)[number], (typeof cards)[number]>>) => xs.map((x) => x.item.id);
  assert.deepEqual(ids(mergeFeed(posts, cards, true)), ["p1", "m1", "p2"]);
  assert.deepEqual(ids(mergeFeed(posts, cards, false)), ["p1", "m1", "p2", "m2"]);
  assert.deepEqual(ids(mergeFeed([], cards, false)), ["m1", "m2"]);
});

// ---- Chapter events (step 5) -------------------------------------------------------------
check("event times read like the mockup, in the viewer's time zone", () => {
  const tz = "America/Chicago";
  assert.equal(shortWhen("2026-11-08T19:00:00Z", "2026-11-08T21:00:00Z", "en-US", tz), "Sun 1–3pm");
  assert.equal(shortWhen("2026-11-20T01:00:00Z", null, "en-US", tz), "Thu 7pm");
  assert.equal(shortWhen("2026-12-06T16:00:00Z", "2026-12-06T18:30:00Z", "en-US", tz), "Sun 10am–12:30pm");
  assert.equal(longWhen("2026-11-08T19:00:00Z", "2026-11-08T21:00:00Z", "en-US", tz), "Sunday, Nov 8 · 1–3pm");
  assert.deepEqual(dateBlock("2026-11-08T19:00:00Z", "en-US", tz), { month: "Nov", day: "8" });
});

check("who's going: two first names and the rest", () => {
  assert.deepEqual(goersLine(["Priya S.", "Alex R.", "Sam T."], 14), { first: ["Priya", "Alex"], others: 12 });
  assert.deepEqual(goersLine(["Priya S."], 1), { first: ["Priya"], others: 0 });
});

check("the calendar file: one event, UTC times, escaped text, 2-hour default", () => {
  const ics = eventIcs({ id: "e1", title: "Fall flock meetup; bring toys", starts_at: "2026-11-08T19:00:00Z", ends_at: null,
    description: "Humans only, this time.", location: "Ann Arbor District Library, Room B", url: null }, new Date("2026-11-01T00:00:00Z"));
  assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
  assert.match(ics, /\r\nDTSTART:20261108T190000Z\r\n/);
  assert.match(ics, /\r\nDTEND:20261108T210000Z\r\n/);
  assert.match(ics, /\r\nSUMMARY:Fall flock meetup\\; bring toys\r\n/);
  assert.match(ics, /\r\nLOCATION:Ann Arbor District Library\\, Room B\r\n/);
  assert.match(ics, /UID:e1@thekyaproject.com/);
  assert.ok(ics.split("\r\n").every((l) => new TextEncoder().encode(l).length <= 75));
});

// ---- Members and chapter leads (step 5B) ----------------------------------------------------
check("species group into the chips (Macaws, Amazons, Cockatoos, Greys…)", () => {
  assert.equal(speciesGroup("Blue and gold macaw"), "macaws");
  assert.equal(speciesGroup("Yellow-naped Amazon"), "amazons");
  assert.equal(speciesGroup("Umbrella cockatoo"), "cockatoos");
  assert.equal(speciesGroup("Congo African grey"), "greys");
  assert.equal(speciesGroup("Timneh"), "greys");
  assert.equal(speciesGroup("Green-cheeked conure"), "conures");
  assert.equal(speciesGroup("Quaker parrot"), "quakers");
  assert.equal(speciesGroup("Monk parakeet"), "quakers");
  assert.equal(speciesGroup("Indian ringneck"), "parakeets");
  assert.equal(speciesGroup("Kakariki"), "kakariki");
  assert.equal(speciesGroup(""), null);
});

check("the Members tab: top species, search by name or species, birds line", () => {
  const m = (id: string, name: string, birds: [string, string | null][]) => ({ user_id: id, display_name: name, photo_path: null, is_founder: false, is_lead: false,
    birds: birds.map(([n, s]) => ({ name: n, species: s })) });
  const roster = [
    m("1", "Priya S.", [["Mango", "Blue and gold macaw"]]),
    m("2", "Alex R.", [["Kiwi", "Green-cheeked conure"]]),
    m("3", "Brittany K.", [["Echo", "Sun conure"], ["Kya", "Hyacinth macaw"]]),
    m("4", "Jordan L.", [["Rio", "Congo grey"]]),
  ];
  assert.deepEqual(topGroups(roster), ["conures", "macaws", "greys"]);
  assert.deepEqual(filterRoster(roster, "", "macaws").map((x) => x.user_id), ["1", "3"]);
  assert.deepEqual(filterRoster(roster, "kiwi", null).map((x) => x.user_id), ["2"]);
  assert.deepEqual(filterRoster(roster, "grey", null).map((x) => x.user_id), ["4"]);
  assert.deepEqual(filterRoster(roster, "jor", null).map((x) => x.user_id), ["4"]);
  assert.equal(birdsLine(roster[0].birds), "Mango, Blue and gold macaw");
  assert.equal(birdsLine(roster[2].birds), "Echo and Kya");
  assert.equal(birdsLine([...roster[2].birds, { name: "Pip", species: null }]), "Echo, Kya, and Pip");
});

check("Chapter tabs: Posts, Events, Resources, Members; old members links read as Chapter", () => {
  assert.deepEqual(CHAPTER_TABS, ["posts", "events", "resources", "members"]);
  assert.equal(destForPath("/flock/members"), "chapter");
  assert.equal(destForPath("/flock/events/abc"), "chapter");
});

console.log(`\n${passed} passed${process.exitCode ? ", some FAILED" : ""}`);
