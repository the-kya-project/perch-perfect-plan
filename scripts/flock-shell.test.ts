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
import { existsSync, readFileSync } from "node:fs";
import { rememberMode, rememberedMode } from "@/lib/flock";
import { avatarInitial } from "@/lib/accountInitial";
import {
  CHAPTER_TABS, FLOCK_DESTS, FLOCK_REDIRECTS, FLOCK_SPACES, JOURNEYS_FILTERS, LIBRARY_SUBJECTS, LIBRARY_TYPES, TODAY_FILTERS,
  CHAPTER_NAMES, chapterLine, chapterName, destForPath, isFlockFullScreenPath, isFlockOnboardingPath, pick, pickOptional, pickQuery,
  LIBRARY_RESOURCE_TYPES, resourceTypeFor,
} from "@/lib/flockNav";
import { parseBody, parseInline, plainText, safeHref } from "@/lib/libraryMarkdown";
import { normalizeUrl, publishProblems, speciesFromText } from "@/lib/flockLibraryRules";
import { birdsLine, filterRoster, speciesGroup, topGroups } from "@/lib/flockMembers";
import { TALLEST, WIDEST, jpegSize, photoFrame } from "@/lib/flockPhotos";
import { CARD_MARK, CARD_SIZES, canMakeJourneyCard, cardFileName, layoutJourneyCard } from "@/lib/journeyCard";
import { dateBlock, eventIcs, goersLine, longWhen, shortWhen } from "@/lib/flockEvents";
import { AAV_FIND_A_VET_URL, POST_SPACES, findVetSigns, mergeFeed, vetNudgeTier, rateLimitKind, replyPrefix, threadComments } from "@/lib/flockPosts";
import { defaultDisplayName, greetingName, isAutomaticDisplayName, memberCountLine, membershipSummary } from "@/lib/flockProfile";
import { accessCells, accessDay } from "@/lib/flockAccess";
import { blockActions, blockName } from "@/lib/flockBlocks";
import { spotLabel } from "@/lib/flockFounders";
import {
  FINISHER_LEVELS, FLOCK_BADGES, badgeName, badgeTitle, celebrationFor, cleanMyBadges, cleanShownBadges, earnedCount, earnedLine, howToEarn, levelLabel, nextLevel,
} from "@/lib/flockBadges";
import { CARE_ART_LEVELS, FLOCK_ART_LEVELS, artLevel, careBadgeArt, flockBadgeArt, type CareBadgeId } from "@/lib/badgeArt";
import { POD_MAX, POD_MIN, PODS_AT_ONCE, cleanPod, podInitial, podOpen, podRefusal, podStage, podStillNeeded, showWeeklyCard } from "@/lib/flockPods";
import { foundingClosedCase } from "@/lib/foundingClosed";
import {
  CHALLENGE_LIMITS, challengeError, challengeProblems, challengeTemplateAllowed, cleanChallenge, flockTodayIso, nextPrompt, parsePrompts,
} from "@/lib/flockChallenges";
import { challengeDay, challengeEyebrow, challengeProgress, challengeSummary } from "@/components/flock/ChallengeParts";
import { formatFlockDay, freeSeasonEndLabel, NO_FLOCK_DATES } from "@/lib/flockDates";
import { FLOCK_CONTACT_EMAIL, FLOCK_GUIDELINES_VERSION, contactLine } from "@/lib/flockGuidelines";
import { GUIDELINES_VERSION, fullGuidelines, promises, questionsLine, walkthroughScreen1, walkthroughScreen2, walkthroughScreen3 } from "@/flock/guidelines/content";
import { isWalkthroughPath } from "@/flock/guidelines/agreement";
import { isJoinPath, isRescuePath, joinErrorKind, joinRedirect, type FlockAccess } from "@/lib/flockJoin";
import {
  RESCUE_LIMITS, RESCUE_MONTHS, adoptedLabel, adoptionProblem, cleanRescueCode, flockTodayIso as rescueToday, parseUseLimit, rescueCodeLooksValid,
  rescueErrorKind, rescueStep, type MyRescue,
} from "@/lib/flockRescue";
import { QUEUE_FILTERS, queueItemPlace, type QueueItem } from "@/lib/flockModeration";
import { PLACE_KINDS, PLACE_LIMITS, groupPlaces, telHref, updatedDay, websiteHref, type Place } from "@/lib/flockPlaces";
import { VOTE_GUARANTEED_PCT, VOTE_LIMITS, choiceColor, cleanVote, emptyVoteDraft, isDonationVote, openProblems, rankedChoices, toLocalInput, topNames, voteDay, votesFor, type Vote } from "@/lib/flockVotes";
import {
  birdPronoun, canStartCustom, customProblem, daysSince, clipPhase, flockSheetTitle, isEclectus, isNectarEater, rollingAverage, showVetReminder, youngOrUnknownAge, defaultVisibility, groupSkills, journeyDay, journeyDays,
  SKILL_GROUPS, askFlock, canFinishLearned, isOpenJourney, sortYourJourneys, CUSTOM_DESCRIPTION_MAX, CUSTOM_NAME_MAX, isMemberSupplied, matchingSkill,
  nextMilestone, possessive, skillInSentence, vetCheckLine, visibilityChoices, wantsTip,
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
  assert.deepEqual(LIBRARY_TYPES, ["all", "guides", "checklists", "videos", "links"]);
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
check("library: each type chip is one resource type; the lists match the database's", () => {
  assert.deepEqual(LIBRARY_RESOURCE_TYPES, ["guide", "checklist", "video", "link"]);
  assert.equal(resourceTypeFor("all"), null);
  assert.deepEqual(LIBRARY_TYPES.filter((t) => t !== "all").map(resourceTypeFor), LIBRARY_RESOURCE_TYPES);
  // The migration's allowed topics are the subject chips, in order.
  const sql = readFileSync("supabase/migrations/20261118120000_flock_library.sql", "utf8");
  const topics = sql.match(/topics <@ array\[([^\]]+)\]/)![1].match(/'([a-z]+)'/g)!.map((x) => x.slice(1, -1));
  assert.deepEqual(topics, LIBRARY_SUBJECTS);
  const types = sql.match(/resource_type in \(([^)]+)\)/)![1].match(/'([a-z]+)'/g)!.map((x) => x.slice(1, -1));
  assert.deepEqual(types, LIBRARY_RESOURCE_TYPES);
});
check("library body: headings, lists, checklists, callouts, paragraphs", () => {
  const b = parseBody("# Why forage\nWild parrots spend **hours**\nfinding food.\n\n## Start\n- one\n* two\n1. first\n2) second\n- [ ] cup\n- [x] box\n> Stay close.\n> Watch.\n\nThe end.");
  assert.deepEqual(b.map((x) => x.kind), ["heading", "paragraph", "heading", "list", "list", "checklist", "quote", "paragraph"]);
  assert.deepEqual(b[0], { kind: "heading", level: 2, content: [{ kind: "text", text: "Why forage" }] });
  assert.deepEqual(b[1], { kind: "paragraph", content: [{ kind: "text", text: "Wild parrots spend " }, { kind: "strong", text: "hours" }, { kind: "text", text: " finding food." }] });
  assert.equal((b[2] as any).level, 3);
  assert.deepEqual((b[3] as any).items.length, 2);
  assert.equal((b[4] as any).ordered, true);
  assert.deepEqual((b[5] as any).items.map((i: any) => i.checked), [false, true]);
  assert.equal(plainText("# Hi\n- **a** b\n> c"), "Hi a b c");
  // A paragraph between two checklists ends the first.
  assert.equal(parseBody("- [ ] a\nnote\n- [ ] b").filter((x) => x.kind === "checklist").length, 2);
});
check("library body: only web and email links; nothing becomes HTML", () => {
  assert.deepEqual(parseInline("See [the AAV](https://www.aav.org) and *this*."), [
    { kind: "text", text: "See " }, { kind: "link", text: "the AAV", href: "https://www.aav.org" }, { kind: "text", text: " and " }, { kind: "em", text: "this" }, { kind: "text", text: "." },
  ]);
  assert.deepEqual(parseInline("[x](javascript:alert(1))")[0].kind, "text");
  assert.equal(safeHref("data:text/html,hi"), null);
  assert.equal(safeHref("mailto:hello@example.com"), "mailto:hello@example.com");
  assert.deepEqual(parseInline("Go to https://example.com/a."), [{ kind: "text", text: "Go to " }, { kind: "link", text: "https://example.com/a", href: "https://example.com/a" }, { kind: "text", text: "." }]);
  assert.deepEqual(parseInline("<script>alert(1)</script>"), [{ kind: "text", text: "<script>alert(1)</script>" }]);
  assert.deepEqual(parseInline("2 * 3 * 4"), [{ kind: "text", text: "2 * 3 * 4" }]);
});
check("library editing: species tags, links and what publishing needs", () => {
  assert.deepEqual(speciesFromText(" Sun conure, caique,\nSun Conure, , African  grey"), ["Sun conure", "caique", "African grey"]);
  assert.equal(speciesFromText(Array.from({ length: 20 }, (_, i) => `s${i}`).join(",")).length, 12);
  assert.equal(normalizeUrl("  "), null);
  assert.equal(normalizeUrl("youtube.com/x"), "https://youtube.com/x");
  assert.equal(normalizeUrl("http://a.org"), "http://a.org");
  const ok = { title: "T", summary: "S", topics: ["diet"], resource_type: "guide" as const, external_url: null };
  assert.deepEqual(publishProblems(ok), []);
  assert.deepEqual(publishProblems({ ...ok, title: " ", summary: "", topics: [] }), ["title", "summary", "topics"]);
  assert.deepEqual(publishProblems({ ...ok, resource_type: "video" }), ["url"]);
  assert.deepEqual(publishProblems({ ...ok, resource_type: "link", external_url: "https://x.org" }), []);
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
check("founding free season, scheduled then active", () => {
  const f = ent({ status: "trialing", starts_at: "2027-01-04T05:00:00Z", ends_at: "2027-07-06T04:00:00Z" });
  assert.equal(accessCells(f, new Date("2026-12-01T00:00:00Z")).state, "Scheduled");
  assert.deepEqual(accessCells(f, NOW), { starts: "Jan 4, 2027", ends: "Jul 6, 2027", state: "Active (free season)" });
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
  // No dates yet: there's no fixed free-season end to name.
  assert.equal(membershipSummary([f], false).line, "Founding · free while we're getting started, then $15/mo for life");
  // Sample dates only (there's no real opening date yet): once the settings
  // are filled in, the line reads the stored date.
  const open = { ...f, starts_at: "2027-03-01T05:00:00Z", free_until: "2027-09-01T04:00:00Z", current_period_end: "2027-09-01T04:00:00Z" };
  assert.equal(membershipSummary([open], false, new Date("2027-04-01T00:00:00Z")).line, "Founding · free until Sep 1, 2027, then $15/mo for life");
});
check("founding: the regular price leads with $25 a month billed annually, then $30 month to month", () => {
  const want = "Regular price $25 a month billed annually, or $30 month to month.";
  const en = readFileSync("src/locales/en.jsonc", "utf8");
  assert.ok(en.includes(`"founding.regular": "${want}"`), "en.jsonc founding.regular");
  const page = readFileSync("src/routes/founding.tsx", "utf8");
  assert.ok(page.includes(`t("founding.regular", "${want}")`), "founding.tsx fallback matches en.jsonc");
  assert.ok(!/\$30 a month or \$300 a year/.test(en + page), "old regular-price wording is gone");
});

check("journeys: no 'app premium' wording, and no skill is locked any more (1.20)", () => {
  const setup = readFileSync("src/routes/_authenticated/flock.journeys.setup.tsx", "utf8");
  assert.ok(!/this journey comes with/.test(setup), "setup no longer expects a locked-skill refusal");
  const start = readFileSync("src/routes/_authenticated/flock.journeys.start.tsx", "utf8");
  assert.ok(!/isLocked|FlockOnlySheet|Flock journeys/.test(start), "Pick a skill has no Flock-only group or lock");
  assert.ok(!/app premium/i.test(readFileSync("e2e/journey-fixture.json", "utf8")), "e2e journey fixture");
  assert.ok(!/app premium/i.test(readFileSync("src/locales/en.jsonc", "utf8")), "en.jsonc");
});

check("founding: which full box shows (no opening day yet, then before and after a sample one)", () => {
  assert.equal(foundingClosedCase(null, new Date("2030-01-01T00:00:00Z")), "full");
  const sample = "2027-03-01T05:00:00Z"; // a sample, not a real opening date
  assert.equal(foundingClosedCase(sample, new Date("2027-02-28T12:00:00Z")), "full");
  assert.equal(foundingClosedCase(sample, new Date("2027-03-01T05:00:00Z")), "fullOpen");
});

check("no fixed opening or free-season date in member-facing copy or the founding page logic", () => {
  const files = ["src/locales/en.jsonc", "src/locales/emails.en.jsonc", "src/routes/founding.tsx", "src/lib/giftCopy.ts",
    "src/lib/flockDates.ts", "src/lib/flockDates.functions.ts", "src/lib/useFlockPublicDates.ts", "src/routes/gift.index.tsx",
    "src/routes/gift.thanks.tsx", "src/routes/redeem.tsx",
    "src/components/flock/JourneyParts.tsx", "src/lib/flockProfile.ts", "src/lib/foundingClosed.ts", "src/routes/_authenticated/admin.gifts.tsx",
    "src/routes/_authenticated/admin.founding.tsx"];
  const fixed = /January 4|Jan 4|January 5|Jan 5|July 6|Jul 6|June 7|Jun 7|until July|in January|2027-01-0[45]|2027-07-06/;
  for (const f of files) {
    const txt = readFileSync(f, "utf8");
    const hit = txt.split("\n").find((l) => fixed.test(l));
    assert.ok(!hit, `${f}: ${hit}`);
  }
});
check("membership: the free season says Free until Jul 6, 2027, and never outranks a gift or a comp", () => {
  const fs = { plan: "comp", status: "active", source: "free_season", starts_at: "2027-01-04T05:00:00Z", current_period_end: "2027-07-06T04:00:00Z", free_until: null };
  const during = new Date("2027-02-01T00:00:00Z");
  assert.deepEqual(membershipSummary([fs], false, during), { title: "Free season", line: "Free until Jul 6, 2027" });
  assert.equal(membershipSummary([{ ...fs, starts_at: null }], false).line, "Free until Jul 6, 2027 · starts when the Flock opens");
  // A gift year that starts when the free season ends: the free season shows while it runs.
  const gift = { plan: "annual", status: "active", source: "gift", starts_at: "2027-07-06T04:00:00Z", current_period_end: "2028-07-06T04:00:00Z", free_until: null };
  assert.equal(membershipSummary([gift, fs], false, during).line, "Free until Jul 6, 2027");
  // Once it ends, the gift year is what's left.
  assert.equal(membershipSummary([gift, fs], false, new Date("2027-08-01T00:00:00Z")).line, "Gift membership · until Jul 6, 2028");
  // A running gift or comp wins over the free season.
  const running = { ...gift, starts_at: "2027-01-04T05:00:00Z", current_period_end: "2028-01-04T05:00:00Z" };
  assert.equal(membershipSummary([fs, running], false, during).line, "Gift membership · until Jan 4, 2028");
  // Founding always wins.
  const f = { plan: "founding", status: "trialing", source: "founding", starts_at: "2027-01-04T05:00:00Z", current_period_end: "2027-07-06T04:00:00Z", free_until: "2027-07-06T04:00:00Z" };
  assert.equal(membershipSummary([fs, f], false, during).title, "Founding member");
  // After the free season, a free-season row alone is no membership.
  assert.equal(membershipSummary([fs], false, new Date("2027-07-06T04:00:00Z")).line, "No membership yet");
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
const tpl = (slug: string, category: JourneyTemplate["category"], sort: number, tier: "free" | "premium" = "free"): JourneyTemplate => ({
  id: slug, slug, name: slug, category, tier, purpose: "", safety_notes: [], safeguards: [], tips: [], sort_order: sort, video_ref: null,
});
check("journeys: Pick a skill is one list in four groups, in catalog order, with no free/Flock split", () => {
  const g = groupSkills([tpl("wave", "tricks", 100, "premium"), tpl("recall", "foundations", 40), tpl("scale", "husbandry", 10),
    tpl("diet-conversion", "food", 60), tpl("nail-trims", "husbandry", 20, "premium"), tpl("spin", "tricks", 120, "premium")]);
  assert.deepEqual(g.map((x) => x.group), ["husbandry", "foundations", "food", "tricks"]);
  assert.deepEqual(g.map((x) => x.skills.map((s) => s.slug)), [["scale", "nail-trims"], ["recall"], ["diet-conversion"], ["wave", "spin"]]);
  assert.deepEqual(groupSkills([tpl("wave", "tricks", 1)]).map((x) => x.group), ["tricks"], "empty groups are left out");
  assert.deepEqual(SKILL_GROUPS, ["husbandry", "foundations", "food", "tricks"]);
});
check("journeys: the Part of the Flock sheet is about the community, with no price anywhere", () => {
  const t = ((_k: string, d: string, o?: Record<string, string>) => d.replace(/\{\{(\w+)\}\}/g, (_m, n) => o?.[n] ?? "")) as unknown as Parameters<typeof flockSheetTitle>[0];
  assert.equal(flockSheetTitle(t, "how_others"), "See how others did it");
  assert.equal(flockSheetTitle(t, "ask"), "Ask the Flock");
  const parts = readFileSync("src/components/flock/JourneyParts.tsx", "utf8");
  const sheet = parts.slice(parts.indexOf("export function FlockOnlySheet"), parts.indexOf("export function CustomLimitSheet"));
  assert.ok(!/\$\d|price|per month|a year/i.test(sheet), "no price in the sheet");
});
check("journeys: Ask the Flock on a question: community journeys show it, private ones offer sharing or the sheet", () => {
  assert.equal(askFlock("Any tips for a nervous bird?", "community", true), "community");
  assert.equal(askFlock("Any tips?", "private", true), "offer_share");
  assert.equal(askFlock("Any tips?", "private", false), "flock_sheet");
  assert.equal(askFlock("Great session today", "private", false), "none");
});
check("journeys: Your journeys lists open ones first, then finished; learned it needs no weight pause", () => {
  const rows = [
    { id: "f", status: "finished" as const, started_at: "2026-10-01T00:00:00Z", finished_at: "2026-11-01T00:00:00Z" },
    { id: "a1", status: "active" as const, started_at: "2026-11-01T00:00:00Z" },
    { id: "h", status: "happy_where_we_are" as const, started_at: "2026-09-01T00:00:00Z", finished_at: "2026-11-10T00:00:00Z" },
    { id: "p", status: "paused" as const, started_at: "2026-11-05T00:00:00Z" },
  ];
  assert.deepEqual(sortYourJourneys(rows).map((r) => r.id), ["p", "a1", "h", "f"]);
  assert.ok(isOpenJourney("active") && isOpenJourney("paused") && !isOpenJourney("finished") && !isOpenJourney("happy_where_we_are"));
  assert.equal(canFinishLearned({ status: "active", paused_reason: null }), true);
  assert.equal(canFinishLearned({ status: "paused", paused_reason: "member" }), true);
  assert.equal(canFinishLearned({ status: "paused", paused_reason: "weight_drop" }), false);
  assert.equal(canFinishLearned({ status: "finished", paused_reason: null }), false);
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
check("journeys: your own skill needs only a name (up to 60) and takes a description up to 500, no steps", () => {
  assert.equal(customProblem("Bath time", ""), null);
  assert.equal(customProblem("Bath time", "Splashing in a shallow dish."), null);
  assert.equal(customProblem("  ", "Splashing"), "name");
  assert.equal(customProblem("x".repeat(60), ""), null);
  assert.equal(customProblem("x".repeat(61), ""), "name");
  assert.equal(customProblem("Bath", "y".repeat(500)), null);
  assert.equal(customProblem("Bath", "y".repeat(501)), "long");
  assert.equal(CUSTOM_NAME_MAX, 60);
  assert.equal(CUSTOM_DESCRIPTION_MAX, 500);
  const src = readFileSync("src/lib/journeys.ts", "utf8");
  assert.ok(!/CUSTOM_MIN|CUSTOM_MAX\b|MILESTONE_MAX|tooFew|tooMany/.test(src), "the step rules are gone");
});
check("journeys: your own skill named like one of the 14 suggests that skill", () => {
  const tps = [{ name: "Step up", slug: "step-up" }, { name: "High five", slug: "high-five" }, { name: "Scale training", slug: "scale-training" }];
  assert.equal(matchingSkill("Step up", tps)?.slug, "step-up");
  assert.equal(matchingSkill("  step-UP! ", tps)?.slug, "step-up");
  assert.equal(matchingSkill("high five", tps)?.slug, "high-five");
  assert.equal(matchingSkill("scale-training", tps)?.slug, "scale-training");
  assert.equal(matchingSkill("Step up onto the perch", tps), null);
  assert.equal(matchingSkill("Bath time", tps), null);
  assert.equal(matchingSkill("", tps), null);
});
check("journeys: another member's own skill is labeled Member-supplied journey, never a template or your own", () => {
  assert.equal(isMemberSupplied({ template_slug: null, is_mine: false }), true);
  assert.equal(isMemberSupplied({ template_slug: null }), true);
  assert.equal(isMemberSupplied({ template_slug: null, is_mine: true }), false);
  assert.equal(isMemberSupplied({ template_slug: "recall", is_mine: false }), false);
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

check("journeys: after posting, a tip on hard days only", () => {
  assert.equal(wantsTip("all_in"), false);
  assert.equal(wantsTip("distracted"), true);
  assert.equal(wantsTip("not_today"), true);
});
check("journeys: no milestone question or step counts on the new screens", () => {
  const post = readFileSync("src/routes/_authenticated/flock.journeys.$journeyId.post.tsx", "utf8");
  assert.ok(!/reachMilestone|milestoneQuestion|nextMilestone|working-on/.test(post), "Post an update asks no milestone question");
  assert.ok(/vetNudgeTier\(caption/.test(post), "the vet nudge runs on every caption and question");
  const page = readFileSync("src/routes/_authenticated/flock.journeys.$journeyId.index.tsx", "utf8");
  assert.ok(!/progress-bar|next_title|card\.total/.test(page), "the journey page shows no steps");
  const browse = readFileSync("src/components/flock/JourneyBrowse.tsx", "utf8");
  assert.ok(!/card\.done|c\.done|c\.total/.test(browse), "cards and rings show no step counts");
});
check("journeys: the e2e fixture has the 1.20a skill text, and the app never marks or shares a milestone (1.20e)", () => {
  const fixture = JSON.parse(readFileSync("e2e/journey-fixture.json", "utf8")) as Record<string, any>[];
  const migration = readFileSync("supabase/migrations/20261124190000_journeys_skills_data.sql", "utf8");
  const sqlText = (t: string) => t.replace(/'/g, "''");
  for (const t of fixture) {
    for (const gone of ["done_when", "suggested_first", "typical_length", "milestones"]) assert.ok(!(gone in t), `${t.slug}: no ${gone}`);
    assert.deepEqual(t.tips, [], `${t.slug}: tips cleared`);
    assert.equal(t.review_status, "draft", `${t.slug}: draft`);
    assert.ok(migration.includes(`('${t.slug}',\n       '${sqlText(t.purpose)}'`), `${t.slug}: description matches the migration`);
    for (const line of t.safety_notes) assert.ok(migration.includes(`'${sqlText(line)}'`), `${t.slug}: safety note "${line}" is the migration's`);
    assert.ok(Array.isArray(t.history_milestones) && t.history_milestones.length > 0, `${t.slug}: old milestones kept only as history`);
  }
  const data = readFileSync("src/lib/journeyData.ts", "utf8");
  assert.ok(!/journey_reach_milestone|journey_share_milestone|journey_milestone_cards/.test(data), "no milestone writes or milestone cards");
  assert.ok(/p_custom_milestones: null/.test(data) && /p_already: null/.test(data), "journey_start is sent no milestones");
});
check("journeys: next milestone (history), days", () => {
  const ms = [{ position: 2, state: "todo" }, { position: 1, state: "already" }, { position: 3, state: "todo" }];
  assert.equal(nextMilestone(ms)?.position, 2);
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

// ---- Share cards (backlog 1.7) ---------------------------------------------------
check("share cards: only the household makes one; day one vs. now needs both clips", () => {
  assert.equal(canMakeJourneyCard({ kind: "moment", isMine: true }), true);
  assert.equal(canMakeJourneyCard({ kind: "finished", isMine: true }), true);
  // Someone else's journey, community or not: never (so a "Just me" one can't leak).
  for (const kind of ["moment", "finished", "compare"] as const) assert.equal(canMakeJourneyCard({ kind, isMine: false, comparePhotos: 2 }), false, kind);
  assert.equal(canMakeJourneyCard({ kind: "compare", isMine: true, comparePhotos: 1 }), false);
  assert.equal(canMakeJourneyCard({ kind: "compare", isMine: true, comparePhotos: 2 }), true);
  // The card screen has no tab bar, like the milestone and finish screens.
  assert.equal(isFlockOnboardingPath("/flock/journeys/abc/card"), true);
  assert.equal(isFlockOnboardingPath("/flock/journeys/abc/cards-and-more"), false);
});
check("share cards: post and story sizes, the mark, a plain file name", () => {
  assert.deepEqual(CARD_SIZES.post, { w: 1080, h: 1350 });
  assert.deepEqual(CARD_SIZES.story, { w: 1080, h: 1920 });
  assert.equal(CARD_MARK, "Kya & Co. · thekyaproject.com");
  assert.equal(cardFileName(["Echo", "Step up"], "post"), "echo-step-up-post.png");
  assert.equal(cardFileName([null, "Scale training"], "story"), "scale-training-story.png");
  assert.equal(cardFileName(["Zoë", "Révérence!"], "post"), "zoe-reverence-post.png");
  assert.equal(cardFileName([null, "鳥"], "post"), "journey-post.png");
});
check("share cards: everything fits on the card, in order, never overlapping", () => {
  for (const size of ["post", "story"] as const) {
    const { w: W, h: H } = CARD_SIZES[size];
    for (const titleLines of [1, 2, 3]) for (const hasDate of [true, false]) for (const hasMember of [true, false]) {
      const label = `${size} ${titleLines} lines date=${hasDate} member=${hasMember}`;
      const one = layoutJourneyCard({ kind: "moment", size, titleLines, hasDate, hasMember });
      assert.equal(one.photos.length, 1, label);
      const p = one.photos[0];
      assert.ok(p.x >= 0 && p.y >= 0 && p.x + p.w <= W && p.h > 400, label);
      assert.ok(p.y + p.h < one.eyebrowY - 40, label);
      assert.ok(one.eyebrowY < one.titleY, label);
      const lastTitle = one.titleY + (titleLines - 1) * 96;
      if (hasDate) assert.ok(one.dateY! > lastTitle, label); else assert.equal(one.dateY, null, label);
      const lastText = hasDate ? one.dateY! : lastTitle;
      if (hasMember) assert.ok(one.memberY! - 38 > lastText && one.memberY! < one.markY, label); else assert.equal(one.memberY, null, label);
      assert.ok(one.markY - 38 > lastText && one.markY <= H - 40, label);
      if (titleLines > 2) continue;
      const two = layoutJourneyCard({ kind: "compare", size, titleLines, hasDate: false, hasMember });
      assert.equal(two.photos.length, 2, label);
      const [l, r] = two.photos;
      assert.equal(l.h, r.h, label);
      assert.ok(l.x + l.w < r.x && r.x + r.w <= W, label);
      assert.ok(l.h <= Math.round(l.w * 16 / 9), label);
      assert.ok(l.y > two.titleY + (titleLines - 1) * 96, label);
      assert.ok(two.photoDatesY! > l.y + l.h && two.photoDatesY! < (two.memberY ?? two.markY) - 38, label);
    }
  }
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

check("Today mixes posts and journey cards newest first; older cards wait for older posts", () => {
  const posts = [{ id: "p1", created_at: "2026-11-07T12:00:00Z" }, { id: "p2", created_at: "2026-11-07T09:00:00Z" }];
  const cards = [{ id: "m1", happened_at: "2026-11-07T10:00:00Z" }, { id: "m2", happened_at: "2026-11-06T10:00:00Z" }];
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

check("Diet conversion: lories and lorikeets, eclectus, young birds, the vet reminder once the starting weight is set", () => {
  assert.ok(isNectarEater("Rainbow lorikeet") && isNectarEater("Chattering Lory") && isNectarEater("lories"));
  assert.ok(!isNectarEater("Cockatiel") && !isNectarEater(null) && !isNectarEater("Galah"));
  const now = new Date("2026-11-08T12:00:00");
  assert.ok(youngOrUnknownAge(null, now), "unknown age counts as young");
  assert.ok(youngOrUnknownAge("2026-03-01", now));
  assert.ok(!youngOrUnknownAge("2025-11-07", now));
  assert.ok(youngOrUnknownAge("2025-11-09", now), "a day short of a year");
  assert.ok(isEclectus("Eclectus") && isEclectus("Red-sided eclectus"));
  assert.ok(!isEclectus(null) && !isEclectus("Cockatiel"), "unknown species: no species alert");
  const j = { vet_check: "will_call" as const, vet_remind_after: null, status: "active" };
  assert.ok(showVetReminder(j, true, now), "I'll call, once the starting weight is set");
  assert.ok(!showVetReminder(j, false, now), "not during the starting week");
  assert.ok(!showVetReminder({ ...j, vet_check: "talked" }, true, now), "not after they've talked");
  assert.ok(!showVetReminder({ ...j, vet_check: null }, true, now), "not without an answer");
  assert.ok(!showVetReminder({ ...j, vet_remind_after: "2026-11-10T00:00:00Z" }, true, now), "remind me later");
  assert.ok(showVetReminder({ ...j, vet_remind_after: "2026-11-01T00:00:00Z" }, true, now), "back after the snooze");
  assert.ok(!showVetReminder({ ...j, status: "paused" }, true, now));
});

check("Diet conversion's weight line: the average of the last 3 counted weigh-ins", () => {
  const c = (grams: number, counted = true) => ({ grams, counted });
  assert.deepEqual(rollingAverage([c(400), c(398), c(396), c(390)]), [400, 399, 398, 394.7]);
  assert.deepEqual(rollingAverage([c(400), c(360, false), c(398), c(399)]), [400, null, 399, 399]);
  assert.deepEqual(rollingAverage([]), []);
});

check("the vet nudge's tiers: urgent wins when both match; none for ordinary posts", () => {
  // A slice of the real lists (20261108180000_flock_vet_nudge_tighten.sql),
  // including the phrases next to each everyday trap.
  const today = ["fluffed up and sleeping", "fluffed up all day", "sleeping on the bottom", "sleeping a lot", "bleeding", "tail bobbing"];
  const urgent = ["won't stop bleeding", "ate avocado", "got into avocado", "ate chocolate", "drank alcohol", "had caffeine", "teflon fumes",
    "ptfe fumes", "pan fumes", "fumes", "smoke inhalation", "breathed smoke", "house fire", "heavy metal poisoning", "zinc poisoning",
    "chewed zinc", "got burned", "has a burn", "hard fall"];
  const signs = [...today.map((phrase) => ({ phrase, tier: "today" as const })), ...urgent.map((phrase) => ({ phrase, tier: "urgent" as const }))];
  assert.equal(vetNudgeTier("Echo has been fluffed up all day.", signs), "today");
  assert.equal(vetNudgeTier("His nail won\u2019t stop bleeding", signs), "urgent", "urgent, with today's 'bleeding' also matching");
  assert.equal(vetNudgeTier("We tried a new foraging toy!", signs), null);
  // Everyday posts: no card.
  for (const t of ["We got rid of our nonstick pans", "Is avocado safe for parrots?", "Smoky loves his bath, all fluffed up",
    "Our smoke detector went off and scared her", "Music time: Kiwi loves heavy metal", "Use alcohol-free wipes", "That's a burning question"]) {
    assert.equal(vetNudgeTier(t, signs), null, t);
  }
  // Emergencies: urgent, whatever the case.
  for (const t of ["Echo ate avocado off my plate", "the pan overheated and there were teflon fumes", "Kiwi got burned on the stove", "KIWI GOT BURNED"]) {
    assert.equal(vetNudgeTier(t, signs), "urgent", t);
  }
  // Whole words and phrases only; a hyphenated word is one word.
  assert.deepEqual(findVetSigns("That's a burning question", ["a burn", "burn"]), []);
  assert.deepEqual(findVetSigns("Kiwi has a burn on her foot", ["a burn"]), ["a burn"]);
  assert.deepEqual(findVetSigns("Use alcohol-free wipes", ["alcohol"]), []);
  assert.deepEqual(findVetSigns("He drank alcohol. Help!", ["drank alcohol"]), ["drank alcohol"]);
  assert.deepEqual(findVetSigns("chocolatey brown feathers", ["chocolate"]), []);
  assert.equal(vetNudgeTier("anything", []), null);
});

check("journey clips: processing, then still processing after two minutes, failed, ready; never the player's own error", () => {
  const base = { loading: false, playerFailed: false, processingSince: 1_000, now: 1_000, budgetMs: 120_000 };
  assert.equal(clipPhase({ ...base, status: undefined, loading: true }), "loading");
  assert.equal(clipPhase({ ...base, status: undefined }), "failed", "a clip the server didn't return can't be played");
  assert.equal(clipPhase({ ...base, status: "processing" }), "processing");
  assert.equal(clipPhase({ ...base, status: "processing", now: 1_000 + 119_000 }), "processing");
  assert.equal(clipPhase({ ...base, status: "processing", now: 1_000 + 120_000 }), "stalled");
  assert.equal(clipPhase({ ...base, status: "processing", processingSince: undefined, now: 999_999 }), "processing");
  assert.equal(clipPhase({ ...base, status: "failed" }), "failed");
  assert.equal(clipPhase({ ...base, status: "ready" }), "ready");
  assert.equal(clipPhase({ ...base, status: "ready", playerFailed: true }), "failed");
});

check("photos at their own shape: 4:5 to 1.91:1, never cropped inside, tall ones keep their top", () => {
  const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;
  let f = photoFrame({ width: 1200, height: 900 });
  assert.ok(near(f.ratio, 4 / 3) && !f.cropped);
  f = photoFrame({ width: 800, height: 1000 });
  assert.ok(near(f.ratio, 0.8) && !f.cropped, "exactly 4:5 isn't cropped");
  f = photoFrame({ width: 900, height: 1600 });
  assert.ok(near(f.ratio, TALLEST) && f.cropped && f.position === "50% 20%", "a tall phone photo: 4:5, top kept");
  f = photoFrame({ width: 3000, height: 1000 });
  assert.ok(near(f.ratio, WIDEST) && f.cropped && f.position === "50% 50%", "a panorama: 1.91:1, centred");
  f = photoFrame({ width: 1910, height: 1000 });
  assert.ok(near(f.ratio, 1.91) && !f.cropped);
  f = photoFrame(null);
  assert.ok(near(f.ratio, 4 / 3) && !f.cropped, "unknown size: 4:3 until it loads");
  // A JPEG's size from its first bytes (SOF0 after an APP0 segment).
  const app0 = [0xff, 0xe0, 0x00, 0x10, ...Array(14).fill(0)];
  const sof0 = [0xff, 0xc0, 0x00, 0x11, 0x08, 0x06, 0x40, 0x03, 0x84, 0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01];
  assert.deepEqual(jpegSize(new Uint8Array([0xff, 0xd8, ...app0, ...sof0])), { width: 900, height: 1600 });
  assert.equal(jpegSize(new Uint8Array([0x89, 0x50, 0x4e, 0x47])), null, "not a JPEG");
});

check("blocking menus: Block and Block and report on someone else's things only", () => {
  const tt = ((k: string, d: string, o?: Record<string, string>) => d.replace("{{name}}", o?.name ?? "")) as unknown as Parameters<typeof blockActions>[0];
  const noop = () => undefined;
  let a = blockActions(tt, { authorId: "u2", myId: "u1", name: "Alex R.", onBlock: noop, onBlockAndReport: noop });
  assert.deepEqual(a.map((x) => [x.key, x.label]), [["block", "Block Alex R."], ["block-report", "Block and report"]]);
  a = blockActions(tt, { authorId: "u2", myId: null, name: "Alex R.", onBlock: noop });
  assert.deepEqual(a.map((x) => x.key), ["block"], "profiles, journeys and lists: Block only (nothing to report)");
  assert.deepEqual(blockActions(tt, { authorId: "u1", myId: "u1", name: "Me", onBlock: noop }), [], "never on your own things");
  assert.deepEqual(blockActions(tt, { authorId: null, myId: "u1", name: "x", onBlock: noop }), [], "never without an author");
  assert.equal(blockName(tt, "  "), "this member");
  assert.equal(blockName(tt, null), "this member");
  assert.equal(blockName(tt, "Priya S."), "Priya S.");
});

check("founding members page: a spot shows as #n", () => {
  assert.equal(spotLabel(1), "#1");
  assert.equal(spotLabel(50), "#50");
  assert.equal(spotLabel(7.0), "#7");
});


check("free-season end: shown only once it's set and still ahead, as Month Day, Year in Eastern time", () => {
  // Sample dates only (nothing is stored until Brittany sets it).
  const now = new Date("2027-03-01T12:00:00Z");
  assert.equal(freeSeasonEndLabel(NO_FLOCK_DATES, now), null, "not set: the undated wording");
  assert.equal(freeSeasonEndLabel({ opensAt: null, freeSeasonEndsAt: "2027-09-01T04:00:00Z" }, now), "September 1, 2027");
  assert.equal(freeSeasonEndLabel({ opensAt: null, freeSeasonEndsAt: "2027-02-01T05:00:00Z" }, now), null, "already past: the undated wording");
  assert.equal(freeSeasonEndLabel({ opensAt: null, freeSeasonEndsAt: "not a date" }, now), null);
  // Midnight Eastern is still the same day (04:00 UTC in summer, 05:00 in winter).
  assert.equal(formatFlockDay("2027-09-01T04:00:00Z"), "September 1, 2027");
  assert.equal(formatFlockDay("2028-01-10T05:00:00Z"), "January 10, 2028");
});

check("founding page: the dated lines say 'The Flock is free for everyone until {{date}}.' and match en.jsonc", () => {
  const en = readFileSync("src/locales/en.jsonc", "utf8");
  const page = readFileSync("src/routes/founding.tsx", "utf8");
  for (const k of ["founding.lockedDated", "founding.nextDated", "founding.fullBodyDated", "founding.fullOpenBodyDated"]) {
    const m = en.match(new RegExp(`"${k.replace(".", "\\.")}": "([^"]*)"`));
    assert.ok(m, `${k} in en.jsonc`);
    assert.ok(m![1].includes("The Flock is free for everyone until {{date}}."), `${k} has the approved sentence`);
    assert.ok(page.includes(`t("${k}", "${m![1]}"`), `${k}: founding.tsx fallback matches en.jsonc`);
  }
  // The undated lines are still there for when no date is set.
  for (const k of ["founding.locked", "founding.next", "founding.fullBody", "founding.fullOpenBody"]) {
    assert.ok(/while we're getting started/.test(en.match(new RegExp(`"${k.replace(".", "\\.")}": "([^"]*)"`))![1]), `${k} keeps the undated wording`);
  }
  // P3: the full box follows the real opening day, not a constant.
  assert.ok(page.includes("foundingClosedCase(dates.opensAt)"), "founding page passes the stored opening day");
});

check("public dates: read on the server with the service role, never from the browser", () => {
  const fn = readFileSync("src/lib/flockDates.functions.ts", "utf8");
  assert.ok(fn.includes("createServerFn") && fn.includes('supabaseAdmin.rpc("flock_public_dates")'), "server function, service role");
  const hook = readFileSync("src/lib/useFlockPublicDates.ts", "utf8");
  assert.ok(!/supabase\.rpc|from "@\/integrations\/supabase\/client"/.test(hook), "the hook never calls the database directly");
  // Only the public pages use it; the care app never does.
  for (const f of ["src/routes/_authenticated/dashboard.tsx", "src/routes/_authenticated/route.tsx", "src/routes/__root.tsx"]) {
    assert.ok(!readFileSync(f, "utf8").includes("useFlockPublicDates"), `${f} doesn't read the Flock dates`);
  }
});

check("join: the guidelines version matches the database's", () => {
  const sql = readFileSync("supabase/migrations/20261122100000_flock_open_to_members.sql", "utf8");
  const m = sql.match(/create or replace function private\.flock_guidelines_version\(\)[\s\S]*?select '([^']+)'::text/);
  assert.ok(m, "version function in the migration");
  assert.equal(m![1], FLOCK_GUIDELINES_VERSION);
});

check("guidelines: the walk-through version matches current_guidelines_version()", () => {
  const sql = readFileSync("supabase/migrations/20261128180000_flock_guideline_agreements.sql", "utf8");
  const m = sql.match(/create or replace function public\.current_guidelines_version\(\)[\s\S]*?as \$\$ select (\d+); \$\$/);
  assert.ok(m, "version function in the migration");
  assert.equal(Number(m![1]), GUIDELINES_VERSION);
  assert.equal(GUIDELINES_VERSION, 1);
});

check("guidelines: the walk-through's copy, the six promises and the full text's sections, in order", () => {
  const tt = ((k: string, d: string, o?: Record<string, string | number>) => d.replace(/\{\{(\w+)\}\}/g, (_, n) => String(o?.[n] ?? ""))) as unknown as Parameters<typeof promises>[0];
  const one = walkthroughScreen1(tt);
  assert.equal(one.title, "Welcome to the Flock");
  assert.deepEqual(one.communities.map((c) => c.label), ["Researchers", "Conservationists", "Parrot owners"]);
  assert.deepEqual(one.advocate.map((a) => a.title), ["A varied, fresh diet", "Fully flighted birds", "Good husbandry", "Positive reinforcement training"]);
  assert.equal(one.tableTitle, "Most importantly, we're building a bigger table");
  assert.deepEqual(walkthroughScreen2(tt).rows.map((r) => r.title), [
    "We give feedback only when it's asked for", "We flag it instead of calling it out", "Health questions go to your vet", "What you share stays here",
  ]);
  assert.equal(walkthroughScreen3(tt).agree, "I agree, take me to the Flock");
  assert.deepEqual(promises(tt), [
    "I'll be kind, and I'll give feedback only when someone asks for it.",
    "I'll flag anything that worries me instead of calling someone out.",
    "I'll follow science-based care and positive reinforcement training when I share.",
    "I'll take health questions to an avian vet.",
    "I won't sell, trade, or breed birds here.",
    "I understand that harassment and harmful content mean removal from the Flock.",
  ]);
  assert.deepEqual(fullGuidelines(tt).map((s) => s.title), ["What we believe", "How the Flock works", "How we treat each other", "The rules"]);
  const rules = fullGuidelines(tt).find((s) => s.key === "rules")!;
  const list = rules.blocks.find((b) => b.kind === "list") as { items: string[] };
  assert.equal(list.items.length, 9);
  assert.equal(list.items[8], "Members must be 18 or older.");
  const q = questionsLine(tt);
  assert.equal(`${q.before}${FLOCK_CONTACT_EMAIL}${q.after}`, "Questions? Write to brittany@thekyaproject.com");
  assert.equal(contactLine(tt).body, `Email the Kya team at ${FLOCK_CONTACT_EMAIL}.`);
  assert.equal(FLOCK_CONTACT_EMAIL, "brittany@thekyaproject.com");
});

check("guidelines: the walk-through gate comes first, and only it and the full guidelines are open before agreeing", () => {
  assert.ok(isWalkthroughPath("/flock/agree") && isWalkthroughPath("/flock/guidelines"));
  assert.ok(!isWalkthroughPath("/flock") && !isWalkthroughPath("/flock/join") && !isWalkthroughPath("/flock/agreement") && !isWalkthroughPath("/flock/library"));
  const layout = readFileSync("src/routes/_authenticated/flock.tsx", "utf8");
  const enabled = layout.indexOf("fetchQuery(FLOCK_ENABLED_QUERY)");
  const agreed = layout.indexOf("fetchQuery(GUIDELINES_AGREED_QUERY)");
  const access = layout.indexOf("fetchQuery(FLOCK_ACCESS_QUERY)");
  assert.ok(enabled > 0 && agreed > enabled && access > agreed, "flock_enabled(), then the guidelines, then the join step");
  // The gate loads with the app: it carries the version number, never the text.
  assert.ok(!/from "\.\/content"/.test(readFileSync("src/flock/guidelines/agreement.ts", "utf8")), "the gate doesn't import the guidelines' text");
  assert.ok(!readFileSync("src/routes/_authenticated/flock.agree.tsx", "utf8").includes("guidelines/content"), "the walk-through route's options don't either");
  // Shared code never imports the walk-through.
  for (const f of ["src/routes/_authenticated/route.tsx", "src/routes/__root.tsx", "src/components/OwnerTabBar.tsx", "src/lib/flock.ts"]) {
    if (existsSync(f)) assert.ok(!readFileSync(f, "utf8").includes("flock/guidelines/"), `${f} doesn't import the walk-through`);
  }
});

check("guidelines: one agreement, the walk-through's; the join step has no checkbox of its own", () => {
  const join = readFileSync("src/routes/_authenticated/flock.join.tsx", "utf8");
  assert.ok(!join.includes("join-agree") && !join.includes("FlockGuidelinesText"), "no guidelines checkbox or text on the join step");
  assert.ok(join.includes("join-adult") && join.includes('to="/flock/guidelines"'), "18+ stays, with a link to the guidelines");
  const sql = readFileSync("supabase/migrations/20261128210000_flock_join_uses_walkthrough.sql", "utf8");
  const fn = sql.slice(sql.indexOf("create or replace function private.flock_agreed"));
  assert.ok(/public\.flock_agreements/.test(fn) && /public\.flock_guideline_agreements/.test(fn) && /current_guidelines_version\(\)/.test(fn), "joining needs the join record and the walk-through");
  assert.equal(FLOCK_GUIDELINES_VERSION, "2026-12", "the join record's version is frozen");
});

check("join: who the /flock layout lets in", () => {
  const base: FlockAccess = { member_now: false, has_membership: false, agreed: false, is_admin: false, guidelines_version: FLOCK_GUIDELINES_VERSION, opens_at: null, season_ends_at: null };
  assert.equal(joinRedirect(null, "/flock"), "/dashboard", "status unreadable: fails closed");
  assert.equal(joinRedirect(base, "/flock"), "/flock/join", "not joined: the join step");
  assert.equal(joinRedirect(base, "/flock/join"), null);
  assert.equal(joinRedirect(base, "/flock/guidelines"), null, "the guidelines can be read before joining");
  assert.equal(joinRedirect(base, "/flock/library"), "/flock/join");
  assert.equal(joinRedirect({ ...base, has_membership: true, member_now: true }, "/flock"), "/flock/join", "a founder or member who hasn't agreed yet");
  assert.equal(joinRedirect({ ...base, agreed: true, has_membership: true }, "/flock"), "/flock/join", "joined before opening day: waits");
  assert.equal(joinRedirect({ ...base, agreed: true, has_membership: true, member_now: true }, "/flock"), null);
  assert.equal(joinRedirect({ ...base, is_admin: true, member_now: true }, "/flock"), null, "admins are never held at the door");
  assert.ok(isJoinPath("/flock/join") && !isJoinPath("/flock/joiner") && !isJoinPath("/flock"));
});

check("join: database refusals map to what the screen says", () => {
  assert.equal(joinErrorKind({ code: "22023", message: "adult_required" }), "adult_required");
  assert.equal(joinErrorKind({ code: "55000", message: "season_over" }), "season_over");
  assert.equal(joinErrorKind({ code: "42501", message: "the Flock isn't open to you yet" }), "closed");
  assert.equal(joinErrorKind(new Error("offline")), "other");
});

check("review queue: each item names where it lives", () => {
  const base: QueueItem = {
    item_type: "report", subject_type: "post", subject_id: "s1", author_id: "a1", author_name: "Alex R.", author_region: "Great Lakes",
    title: null, body: "Hi", photo_count: 0, created_at: "2026-11-22T12:00:00Z", report_count: 1, reasons: ["spam"], notes: [],
    hidden: false, removed: false, messaged_at: null, post_id: "p1", journey_id: null,
    event_starts_at: null, event_mode: null, event_kind: null, event_place: null,
  };
  const spaces = new Map([
    ["p1", { post_id: "p1", space: "learn" as const, chapter_name: null }],
    ["p2", { post_id: "p2", space: "chapter" as const, chapter_name: "Texas" }],
  ]);
  assert.deepEqual(queueItemPlace({ ...base, item_type: "good", post_id: "p9" }, undefined), { kind: "space", space: "good", chapter: null }, "Do good needs no lookup");
  assert.deepEqual(queueItemPlace(base, spaces), { kind: "space", space: "learn", chapter: null });
  assert.deepEqual(queueItemPlace({ ...base, subject_type: "comment", post_id: "p2" }, spaces), { kind: "space", space: "chapter", chapter: "Texas" }, "a comment: its post's space");
  assert.equal(queueItemPlace({ ...base, post_id: "p3" }, spaces), null, "not loaded yet: nothing rather than a guess");
  assert.equal(queueItemPlace(base, undefined), null);
  assert.deepEqual(queueItemPlace({ ...base, subject_type: "journey_update", post_id: null, journey_id: "j1" }, spaces), { kind: "journeys" });
  assert.deepEqual(queueItemPlace({ ...base, item_type: "event", subject_type: "event", post_id: null }, spaces), { kind: "chapter", chapter: "Great Lakes" }, "events: their chapter");
  assert.equal(queueItemPlace({ ...base, item_type: "event", subject_type: "event", post_id: null, author_region: null }, spaces), null);
});

check("chapter resources: three groups in order, each in the managers' order", () => {
  assert.deepEqual(PLACE_KINDS, ["vet", "rescue", "shop"], "Avian vets, Rescues, Shops and services");
  const p = (id: string, kind: Place["kind"], position: number): Place => ({
    place_id: id, region_slug: "great-lakes", kind, name: id, area: null, phone: null, website: null, note: null, position, updated_at: "2026-11-22T12:00:00Z",
  });
  const groups = groupPlaces([p("shop1", "shop", 1), p("vet2", "vet", 2), p("vet1", "vet", 1)]);
  assert.deepEqual(groups.map((g) => g.kind), ["vet", "rescue", "shop"]);
  assert.deepEqual(groups.map((g) => g.places.map((x) => x.place_id)), [["vet1", "vet2"], [], ["shop1"]], "an empty group is still there, to invite a suggestion");
  assert.ok(QUEUE_FILTERS.includes("places"), "the review queue has a Places filter");
});

check("chapter resources: phone and website links are safe and tappable", () => {
  assert.equal(telHref("(260) 555-0100"), "tel:2605550100");
  assert.equal(telHref("+31 20 555 0100"), "tel:+31205550100");
  assert.equal(telHref("  "), null);
  assert.equal(telHref(null), null);
  assert.equal(telHref("n/a"), null);
  assert.equal(websiteHref("lakeshorebirds.example.com"), "https://lakeshorebirds.example.com/");
  assert.equal(websiteHref("http://northside.example.com/vets"), "http://northside.example.com/vets");
  assert.equal(websiteHref("HTTPS://Example.com"), "https://example.com/");
  assert.equal(websiteHref("javascript:alert(1)"), null, "never a script link");
  assert.equal(websiteHref("mailto:vet@example.com"), null);
  assert.equal(websiteHref(""), null);
  assert.equal(websiteHref("not a url at all"), null);
  // The same limits as the table's checks (20261123140000_flock_chapter_places.sql).
  const sql = readFileSync("supabase/migrations/20261123140000_flock_chapter_places.sql", "utf8");
  for (const [field, max] of Object.entries(PLACE_LIMITS)) {
    assert.ok(new RegExp(`\\b${field}\\b[^\\n]*length\\(${field === "name" ? "btrim\\(name\\)\\) between 1 and" : field + "\\) <="} ${max}\\b`).test(sql), `${field} limit ${max} matches the table`);
  }
});

check("chapter resources: when a listing was last updated", () => {
  const now = new Date("2026-11-23T12:00:00");
  assert.equal(updatedDay("2026-11-22T15:00:00", "en-US", now), "Nov 22");
  assert.equal(updatedDay("2025-10-30T15:00:00", "en-US", now), "Oct 30, 2025");
});

check("votes: rows are cleaned, and only the server's results are shown", () => {
  const v = cleanVote({
    vote_id: "v1", question: "Where should this quarter's donation go?", audience: "nonsense", state: "weird", closes_at: "2026-12-15T20:00:00Z",
    voters: "31", my_choice: null,
    choices: [{ choice_id: "a", name: "The Macaw Society", percent: 52, share: 46, from_votes: 36, votes: null, top: true }, { choice_id: "b", name: "Armonía", percent: "15", share: "20", top: "true" }, "junk"],
  });
  assert.equal(v.audience, "members");
  assert.equal(v.state, "closed", "an unknown state never shows as open");
  assert.equal(v.voters, 31);
  assert.equal(v.choices.length, 3);
  assert.equal(v.choices[1].percent, null, "a percent only when the server sends a number");
  assert.equal(v.choices[1].share, null, "a share only when the server sends a number");
  assert.equal(v.choices[1].top, false);
  assert.equal(v.choices[0].from_votes, 36);
  assert.deepEqual(topNames(v), ["The Macaw Society"]);
  assert.deepEqual(cleanVote({ choices: "x" }).choices, []);
});

check("votes: Today shows open votes; Do good also shows recent results", () => {
  const mk = (id: string, state: Vote["state"]) => cleanVote({ vote_id: id, state, choices: [] });
  const all = [mk("open", "open"), mk("closed", "closed"), mk("draft", "draft")];
  assert.deepEqual(votesFor(all, "today").map((v) => v.vote_id), ["open"]);
  assert.deepEqual(votesFor(all, "good").map((v) => v.vote_id), ["open", "closed"]);
  // A founders-only tie names every top choice.
  assert.deepEqual(topNames({ choices: [{ name: "A", top: true }, { name: "B", top: true }, { name: "C", top: false }] as Vote["choices"] }), ["A", "B"]);
});

check("votes: results are ordered by share, and each choice keeps its color", () => {
  const ranked = rankedChoices({ choices: [
    { choice_id: "a", share: 33, percent: 33 }, { choice_id: "b", share: 44, percent: 48 }, { choice_id: "c", share: 23, percent: 19 },
  ] as Vote["choices"] });
  assert.deepEqual(ranked.map((c) => c.choice_id), ["b", "a", "c"]);
  assert.deepEqual(ranked.map((c) => c.index), [1, 0, 2]);
  // Founders-only votes have no share, so they order by percent.
  assert.deepEqual(rankedChoices({ choices: [{ choice_id: "x", share: null, percent: 40 }, { choice_id: "y", share: null, percent: 60 }] as Vote["choices"] }).map((c) => c.choice_id), ["y", "x"]);
  // Equal choices stay in the vote's order.
  assert.deepEqual(rankedChoices({ choices: [{ choice_id: "p", share: 50, percent: 50 }, { choice_id: "q", share: 50, percent: 50 }] as Vote["choices"] }).map((c) => c.choice_id), ["p", "q"]);
  assert.equal(new Set(Array.from({ length: 8 }, (_, i) => choiceColor(i).solid)).size, 8, "eight choices, eight colors");
  assert.equal(isDonationVote({ audience: "members" }), true);
  assert.equal(isDonationVote({ audience: "founders" }), false);
  const sql = readFileSync("supabase/migrations/20261123183000_flock_votes.sql", "utf8");
  assert.ok(sql.includes(`returns integer language sql immutable set search_path = '' as $$ select ${VOTE_GUARANTEED_PCT}; $$;`), "the guarantee matches the database");
  assert.ok(!sql.includes("flock_vote_min_results"), "no minimum-votes rule");
  assert.ok(!sql.includes("too_few"), "no too-few state");
});

check("votes: what a draft needs before it opens", () => {
  const now = new Date("2026-11-23T12:00:00");
  const ch = (name: string) => ({ key: name || "k", name, blurb: "", photo_path: null });
  const ok = { question: "Which chapter first?", choices: [ch("Great Lakes"), ch("Texas")], closes_at: "2026-12-01T20:00" };
  assert.deepEqual(openProblems(ok, now), []);
  assert.deepEqual(openProblems({ ...ok, question: "  " }, now), ["question"]);
  assert.deepEqual(openProblems({ ...ok, choices: [ch("Only")] }, now), ["choices"]);
  assert.deepEqual(openProblems({ ...ok, choices: Array.from({ length: 9 }, (_, i) => ch(`C${i}`)) }, now), ["choices"]);
  assert.deepEqual(openProblems({ ...ok, choices: [ch("A"), ch(" ")] }, now), ["choiceName"]);
  assert.deepEqual(openProblems({ ...ok, closes_at: "2026-11-20T20:00" }, now), ["closes"]);
  assert.deepEqual(openProblems({ ...ok, closes_at: "" }, now), ["closes"]);
  // A new draft has two empty choices and a close date two weeks out, at 8 PM.
  const d = emptyVoteDraft(now);
  assert.equal(d.choices.length, 2);
  assert.equal(d.closes_at, "2026-12-07T20:00");
  assert.notEqual(d.choices[0].key, d.choices[1].key);
  assert.equal(toLocalInput("not a date"), "");
  assert.equal(voteDay("2026-12-15T20:00:00", "en-US", now), "Dec 15");
  assert.equal(voteDay("2027-01-05T20:00:00", "en-US", now), "Jan 5, 2027");
  // The same limits as the tables' checks (20261123183000_flock_votes.sql).
  const sql = readFileSync("supabase/migrations/20261123183000_flock_votes.sql", "utf8");
  assert.ok(sql.includes(`length(btrim(question)) between 1 and ${VOTE_LIMITS.question}`));
  assert.ok(sql.includes(`length(description) <= ${VOTE_LIMITS.description}`));
  assert.ok(sql.includes(`length(btrim(name)) between 1 and ${VOTE_LIMITS.choiceName}`));
  assert.ok(sql.includes(`length(blurb) <= ${VOTE_LIMITS.choiceBlurb}`));
  assert.ok(sql.includes(`length(announcement) <= ${VOTE_LIMITS.announcement}`));
  assert.ok(sql.includes(`jsonb_array_length(v_choices) > ${VOTE_LIMITS.maxChoices}`));
  assert.ok(sql.includes(`n < ${VOTE_LIMITS.minChoices} or n > ${VOTE_LIMITS.maxChoices}`));
});

check("badges: every badge in screen order, matching the database's list", () => {
  const rows = cleanMyBadges([
    { badge: "voice_of_the_flock", level: 1, earned_at: "2026-11-20T15:00:00Z", unseen: false, at_launch: true },
    { badge: "journey_finisher", level: 3, earned_at: "2026-11-21T15:00:00Z", unseen: true, at_launch: false },
    { badge: "made_up", level: 1 },
    { badge: "trick_star", level: 0, earned_at: "2026-11-21T15:00:00Z", unseen: true },
  ]);
  assert.deepEqual(rows.map((b) => b.badge), [...FLOCK_BADGES]);
  assert.deepEqual(rows.map((b) => b.level), [0, 3, 0, 0, 1, 0]);
  // Not earned: never unseen, never dated.
  assert.equal(rows[2].unseen, false);
  assert.equal(rows[2].earned_at, null);
  assert.equal(earnedCount(rows), 2);
  assert.deepEqual(cleanMyBadges(null).map((b) => b.level), [0, 0, 0, 0, 0, 0]);
  assert.deepEqual(cleanShownBadges([{ badge: "trick_star", level: 1 }, { badge: "first_steps", level: 1 }, { badge: "nope", level: 1 }, { badge: "good_neighbor", level: 0 }]),
    [{ badge: "first_steps", level: 1 }, { badge: "trick_star", level: 1 }]);
  assert.deepEqual(cleanShownBadges(null), []);
  const sql = readFileSync("supabase/migrations/20261124013000_flock_badges.sql", "utf8");
  assert.ok(sql.includes(`select array[${FLOCK_BADGES.map((b) => `'${b}'`).join(", ")}];`));
  assert.ok(sql.includes("when p_finished >= 10 then 10 when p_finished >= 3 then 3 when p_finished >= 1 then 1"));
  assert.deepEqual([...FINISHER_LEVELS], [1, 3, 10]);
});

check("badges: one launch celebration for history, then a card for each new one", () => {
  const b = (badge: (typeof FLOCK_BADGES)[number], level: number, unseen: boolean, at_launch: boolean) =>
    ({ badge, level, earned_at: level ? "2026-11-21T15:00:00Z" : null, unseen, at_launch });
  // History earned two or more: one "Here's what you've already earned".
  const launch = celebrationFor([b("first_steps", 1, true, true), b("journey_finisher", 3, true, true), b("trick_star", 0, false, false)]);
  assert.equal(launch?.kind, "launch");
  assert.deepEqual(launch?.badges.map((x) => x.badge), ["first_steps", "journey_finisher"]);
  // Just one from history (a newcomer who's just set up): the small card.
  assert.equal(celebrationFor([b("first_steps", 1, true, true)])?.kind, "new");
  // Earned later: a card each; seen ones never come back.
  const later = celebrationFor([b("first_steps", 1, false, true), b("journey_finisher", 10, true, false), b("voice_of_the_flock", 1, true, false)]);
  assert.equal(later?.kind, "new");
  assert.deepEqual(later?.badges.map((x) => x.badge), ["journey_finisher", "voice_of_the_flock"]);
  assert.equal(celebrationFor([b("first_steps", 1, false, true)]), null);
  assert.equal(celebrationFor([]), null);
});

check("badges: levels, names and how to earn each one", () => {
  const t = ((_k: string, d: string, o?: Record<string, unknown>) => d.replace(/\{\{(\w+)\}\}/g, (_m, n) => String(o?.[n] ?? ""))) as unknown as Parameters<typeof badgeName>[0];
  assert.equal(nextLevel("journey_finisher", 0), 1);
  assert.equal(nextLevel("journey_finisher", 1), 3);
  assert.equal(nextLevel("journey_finisher", 3), 10);
  assert.equal(nextLevel("journey_finisher", 10), null);
  assert.equal(nextLevel("trick_star", 1), null);
  assert.equal(levelLabel(t, "journey_finisher", 1), "1 journey");
  assert.equal(levelLabel(t, "journey_finisher", 3), "3 journeys");
  assert.equal(levelLabel(t, "journey_finisher", 0), null);
  assert.equal(levelLabel(t, "good_neighbor", 1), null);
  assert.equal(badgeTitle(t, "journey_finisher", 10), "Journey finisher · 10 journeys");
  assert.equal(badgeTitle(t, "voice_of_the_flock", 1), "Voice of the Flock");
  assert.equal(earnedLine(t, "journey_finisher", 1), "You finished your first journey.");
  assert.equal(earnedLine(t, "journey_finisher", 3), "You've finished 3 journeys.");
  assert.equal(howToEarn(t, "trick_star"), "Trick star: finish any tricks journey.");
  // Every badge has a name, a way to earn it and a line for earning it, and
  // none of them talks about points, rankings or health.
  for (const x of FLOCK_BADGES) {
    for (const s of [badgeName(t, x), howToEarn(t, x), earnedLine(t, x, 1)]) {
      assert.ok(s.length > 0);
      assert.ok(!/\b(points?|rank|leaderboard|weight|healthy)\b/i.test(s), s);
    }
  }
});

check("badges: Brittany's art for every badge, level and state, at both sizes", () => {
  // Journey finisher's art levels are its real levels.
  assert.deepEqual(FLOCK_ART_LEVELS.journey_finisher, [...FINISHER_LEVELS]);
  assert.equal(artLevel([1, 3, 10], 0), 1);
  assert.equal(artLevel([1, 3, 10], 5), 3);
  assert.equal(artLevel([1, 3, 10], 12), 10);
  assert.equal(flockBadgeArt("journey_finisher", 3), "/badges/flock/earned/journey-finisher-3-192.png");
  assert.equal(flockBadgeArt("journey_finisher", 0, "sm"), "/badges/flock/unearned/journey-finisher-1-64.png");
  assert.equal(flockBadgeArt("trick_star", 1), "/badges/flock/earned/trick-star-192.png");
  assert.equal(careBadgeArt("steady_scale", 12), "/badges/care/earned/steady-scale-12-weeks-192.png");
  assert.equal(careBadgeArt("daily_check_in", 0), "/badges/care/unearned/daily-check-in-7-days-192.png");
  assert.equal(careBadgeArt("plan_ready", 1, "sm"), "/badges/care/earned/plan-ready-64.png");
  const files: string[] = [];
  for (const size of ["lg", "sm"] as const) {
    for (const b of FLOCK_BADGES) for (const lvl of [0, ...(FLOCK_ART_LEVELS[b] ?? [1])]) files.push(flockBadgeArt(b, lvl, size));
    for (const b of ["steady_scale", "daily_check_in", "plan_ready", "sitter_ready"] as CareBadgeId[]) {
      for (const lvl of [0, ...(CARE_ART_LEVELS[b] ?? [1])]) files.push(careBadgeArt(b, lvl, size));
    }
  }
  for (const f of files) assert.ok(existsSync(`public${f}`), `missing ${f}`);
  // 15 earned designs, plus the gray version of each badge's first level
  // (what an unearned badge shows), at two sizes. The gray higher levels are
  // stored too, unused for now.
  assert.equal(new Set(files).size, (15 + 10) * 2);
});

check("buddy pods: stages, the weekly card, waiting and refusals", () => {
  // Where a member is on the journey; anything else (a "Just me" journey's
  // null included) stays private. No progress numbers since 1.20a.
  assert.equal(podStage("working"), "working");
  assert.equal(podStage("learned"), "learned");
  assert.equal(podStage("happy"), "happy");
  assert.equal(podStage(null), null);
  assert.equal(podStage("finished"), null);
  // Ended pods stay readable but take no posts, and ask nothing weekly.
  // There's no "asking" state any more.
  assert.ok(podOpen("active"));
  assert.ok(!podOpen("closed") && !podOpen("dissolved"));
  assert.ok(!podOpen("asking" as never));
  assert.ok(showWeeklyCard({ status: "active", checked_in_this_week: false }));
  assert.ok(!showWeeklyCard({ status: "active", checked_in_this_week: true }));
  assert.ok(!showWeeklyCard({ status: "dissolved", checked_in_this_week: false }));
  // "Your pod starts when 3 members are ready. N so far."
  assert.equal(podStillNeeded(1), 2);
  assert.equal(podStillNeeded(2), 1);
  assert.equal(podStillNeeded(0), 2);
  assert.equal(podStillNeeded(4), 0);
  assert.equal(podInitial(" ana"), "A");
  assert.equal(podInitial(null), "?");
  assert.equal(podRefusal({ message: "pod_limit" }), "limit");
  assert.equal(podRefusal({ message: "pod_closed" }), "closed");
  assert.equal(podRefusal({ message: "pod_blocked" }), "blocked");
  assert.equal(podRefusal(new Error("network")), "other");
  // Anything unexpected from the database reads as a closed journey pod.
  const p = cleanPod({ pod_id: "x", kind: "nope", status: "weird", member_count: "4", asking_me: "yes" });
  assert.equal(p.kind, "journey");
  assert.equal(p.status, "closed");
  assert.equal(p.member_count, 4);
  assert.ok(!("asking_me" in p) && !("my_answer" in p));
  // No buddy groups, and an old "asking" reads as closed.
  assert.equal(cleanPod({ kind: "group", status: "active" }).kind, "journey");
  assert.equal(cleanPod({ status: "asking" }).status, "closed");
});

check("buddy pods: the app's numbers match the database's", () => {
  const sql = readFileSync("supabase/migrations/20261124070000_flock_buddy_pods.sql", "utf8");
  // The live placement rules (20261124235900 replaced flock_pod_place).
  const next = readFileSync("supabase/migrations/20261124235900_flock_pods_no_groups.sql", "utf8");
  const code = next.replace(/--.*$/gm, "");
  assert.match(code, /cardinality\(v_users\) >= 6/);
  assert.match(code, /cardinality\(v_users\) >= 3/);
  assert.match(code, /flock_pod_size\(p\.id\) between 1 and 5/);
  // No keep-going or groups left in the functions: 'group' and 'asking' only
  // in the one-off update that closes old rows and the constraint lookup.
  assert.match(code, /drop function if exists private\.flock_pod_settle\(uuid\)/);
  assert.match(code, /drop function if exists public\.flock_pod_keep_going\(uuid, boolean\)/);
  assert.ok(!/keep_going\s*=|group_since\s*<|asked_at\s*>/.test(code));
  assert.match(code, /check \(status in \('active', 'closed', 'dissolved'\)\)/);
  // "Finished" means the journey ended either way.
  assert.equal((code.match(/not in \('finished', 'happy_where_we_are'\)/g) ?? []).length, 2);
  assert.match(code, /when 'finished' then 'learned' when 'happy_where_we_are' then 'happy' else 'working'/);
  assert.equal([POD_MIN, POD_MAX, PODS_AT_ONCE].join(), "3,6,2");
  assert.match(sql, /cardinality\(v_users\) >= 6/);
  assert.match(sql, /cardinality\(v_users\) >= 3/);
  assert.match(sql, /flock_pod_size\(p\.id\) between 1 and 5/);
  assert.match(sql, /flock_pod_max\(\)\s+returns integer language sql immutable set search_path = '' as \$\$ select 2; \$\$/);
  // Pod posts never reach Today, and only the pod reads them.
  assert.match(sql, /and r\.space <> ''pod''/);
  assert.match(sql, /p\.space <> ''pod'' or private\.flock_pod_member\(p_user_id, p\.pod_id\)/);
  // No push or email for pods.
  assert.ok(!/push|brevo|email/i.test(sql.replace(/--.*$/gm, "")));
});
// ---- Challenges (backlog 1.10) ----------------------------------------------------------
console.log("challenges");
const challengeRow = {
  challenge_id: "c1", kind: "standalone", title: "Foraging week", description: null, template_slug: null, template_name: null,
  region_slug: null, region_name: null, state: "open", starts_on: "2026-12-01", ends_on: "2026-12-07", days_left: 4,
  prompts: [
    { position: 1, body: "Paper cup surprise", done: true }, { position: 2, body: "Shred a cardboard tube", done: true },
    { position: 3, body: "Hide a treat in a basket", done: true }, { position: 4, body: "Foraging box with crinkle paper", done: false },
    { position: 5, body: "Five", done: false }, { position: 6, body: "Six", done: false }, { position: 7, body: "Seven", done: false },
  ],
  member_count: 63, faces: [{ name: "A", photo_path: null }], joined: true, my_bird_id: "b1", my_bird_name: "Juno", feature_ok: false,
  my_journey_id: null, done_count: 3, total_count: 7, finished: false, wrap_up: null, pinned_post_id: null, featured_post_ids: [],
};
const ct = ((_k: string, d: string, o?: Record<string, unknown>) => d.replace(/\{\{(\w+)\}\}/g, (_m, n) => String(o?.[n] ?? ""))) as unknown as Parameters<typeof challengeEyebrow>[0];
check("challenges: rows are cleaned, and the next prompt is the first not done", () => {
  const c = cleanChallenge(challengeRow);
  assert.equal(nextPrompt(c)?.position, 4);
  assert.equal(nextPrompt({ prompts: c.prompts.map((p) => ({ ...p, done: true })) }), null);
  const odd = cleanChallenge({ kind: "nope", state: "weird", prompts: "x", faces: null, featured_post_ids: ["p1"] });
  assert.equal(odd.kind, "standalone");
  assert.equal(odd.state, "closed");
  assert.deepEqual(odd.prompts, []);
  assert.deepEqual(odd.featured_post_ids, ["p1"]);
});
check("challenges: the card and page lines match the mockup", () => {
  const c = cleanChallenge(challengeRow);
  assert.equal(challengeEyebrow(ct, c), "Challenge · 4 days left");
  assert.equal(challengeEyebrow(ct, { state: "open", days_left: 1 }), "Challenge · 1 day left");
  assert.equal(challengeEyebrow(ct, { state: "open", days_left: 0 }), "Challenge · last day");
  assert.equal(challengeSummary(ct, c), "Standalone challenge · 7 prompts · 63 members joined");
  assert.equal(challengeProgress(ct, c), "Juno · 3 of 7 done");
  // A journey challenge counts no milestones (1.20b): learned it, or still going.
  const jc = { ...c, kind: "journey" as const, template_name: "Recall", total_count: 0, done_count: 0 };
  assert.equal(challengeSummary(ct, jc), "Journey challenge · Recall · 63 members joined");
  assert.equal(challengeProgress(ct, { ...jc, finished: false }), "Juno · In progress");
  assert.equal(challengeProgress(ct, { ...jc, finished: true }), "Juno · Learned it");
  assert.equal(challengeDay("2026-12-01", "en-US"), "Dec 1");
  // No winners, prizes or rankings in anything the card says.
  for (const s of [challengeEyebrow(ct, c), challengeSummary(ct, c), challengeProgress(ct, c)]) {
    assert.ok(!/\b(win|winner|prize|rank|leaderboard|points?)\b/i.test(s), s);
  }
});
check("challenges: food templates can't be challenges", () => {
  assert.equal(challengeTemplateAllowed({ slug: "diet-conversion", category: "food" }), false);
  assert.equal(challengeTemplateAllowed({ slug: "new-foods", category: "food" }), false);
  assert.equal(challengeTemplateAllowed({ slug: "step-up", category: "husbandry" }), true);
});
check("challenges: the admin form's prompts and what scheduling needs", () => {
  assert.deepEqual(parsePrompts(" Paper cup surprise \n\n Shred a tube\n"), ["Paper cup surprise", "Shred a tube"]);
  const d = { id: null, kind: "standalone" as const, title: "", description: "", template_slug: "", prompts: [], region_slug: null, starts_on: "2026-12-07", ends_on: "2026-12-01" };
  assert.deepEqual(challengeProblems(d, "2026-11-30"), ["title", "prompts", "dates"]);
  assert.deepEqual(challengeProblems({ ...d, title: "x", prompts: ["a"], starts_on: "2026-11-29", ends_on: "2026-12-01" }, "2026-11-30"), ["past"]);
  assert.deepEqual(challengeProblems({ ...d, kind: "journey", title: "x", starts_on: "2026-12-01", ends_on: "2026-12-01" }, "2026-11-30"), ["template"]);
  assert.deepEqual(challengeProblems({ ...d, title: "x", prompts: ["a".repeat(CHALLENGE_LIMITS.prompt + 1)], starts_on: "2026-12-01", ends_on: "2026-12-02" }, "2026-11-30"), ["promptLength"]);
  assert.equal(flockTodayIso(new Date("2026-12-01T03:00:00Z")), "2026-11-30");
});
check("challenges: the database's refusals are recognised", () => {
  assert.equal(challengeError({ message: "challenge_overlap" }), "challenge_overlap");
  assert.equal(challengeError({ message: "no_food_challenges" }), "no_food_challenges");
  assert.equal(challengeError({ message: "something else" }), null);
  assert.equal(challengeError(null), null);
});
check("challenges: the migration's food rule matches the app's", () => {
  const sql = readFileSync("supabase/migrations/20261124033000_flock_challenges.sql", "utf8");
  assert.ok(sql.includes("t.slug <> 'diet-conversion' and t.category <> 'food'"));
});


// ---- Rescue partner codes (backlog 1.16) ------------------------------------------------

check("rescue codes: cleaned like the database (capitals, letters and digits)", () => {
  assert.equal(cleanRescueCode("birds and-beaks!"), "BIRDSANDBEAKS");
  assert.ok(rescueCodeLooksValid("Birds and Beaks"));
  assert.ok(!rescueCodeLooksValid("ab-c"), "under four letters");
  assert.ok(!rescueCodeLooksValid("x".repeat(31)), "over thirty");
  const sql = readFileSync("supabase/migrations/20261126130000_flock_rescue_codes.sql", "utf8");
  assert.ok(sql.includes("regexp_replace(upper(coalesce(p_code, '')), '[^A-Z0-9]', '', 'g')"), "the database cleans codes the same way");
  assert.ok(sql.includes(`'^[A-Z0-9]{${RESCUE_LIMITS.codeMin},${RESCUE_LIMITS.codeMax}}$'`), "the same length limits");
  assert.ok(sql.includes(`select ${RESCUE_MONTHS} $$`), "six months, in both places");
  assert.ok(sql.includes(`length(btrim(bird_name)) between 1 and ${RESCUE_LIMITS.birdName}`));
  assert.ok(sql.includes(`length(btrim(species)) between 1 and ${RESCUE_LIMITS.species}`));
  assert.ok(sql.includes(`length(btrim(name)) between 1 and ${RESCUE_LIMITS.partnerName}`));
});

check("rescue codes: never a payment, never seats", () => {
  const sql = readFileSync("supabase/migrations/20261126130000_flock_rescue_codes.sql", "utf8");
  assert.ok(/source <> 'rescue' or \(\s*plan = 'comp'/.test(sql), "a rescue membership is a free comp");
  assert.ok(sql.includes("free_until is null"), "with no billing start");
  assert.doesNotMatch(sql, /crew_seat|sponsor(ed|ship)_?seat|insert into public\.crew/i, "no seat counting");
  for (const f of ["src/routes/_authenticated/flock.rescue.tsx", "src/routes/_authenticated/admin.rescues.tsx", "src/components/flock/RescueParts.tsx"]) {
    // What the screen says, not the comments explaining it.
    const src = readFileSync(f, "utf8").split("\n").filter((l) => !/^\s*(\/\/|\/\*|\*)/.test(l)).join("\n");
    assert.doesNotMatch(src, /\$\s?\d|[Ss]ponsored seats|[Ss]eats/, `${f}: no prices or seats`);
  }
});

check("rescue codes: the adoption form's checks", () => {
  const ok = { birdName: "Sunny", species: "Sun conure", adoptedOn: "2026-11-15" };
  assert.equal(adoptionProblem(ok, "2026-11-26"), null);
  assert.equal(adoptionProblem({ ...ok, birdName: "  " }, "2026-11-26"), "bird_name");
  assert.equal(adoptionProblem({ ...ok, species: "" }, "2026-11-26"), "species");
  assert.equal(adoptionProblem({ ...ok, adoptedOn: "2026-11-27" }, "2026-11-26"), "adopted_on", "not in the future");
  assert.equal(adoptionProblem({ ...ok, adoptedOn: "" }, "2026-11-26"), "adopted_on");
  assert.equal(adoptionProblem(ok, "2026-11-15"), null, "today is fine");
  assert.equal(rescueToday(new Date("2026-11-27T03:00:00Z")), "2026-11-26", "today is Eastern time");
});

check("rescue codes: which screen an adopter sees", () => {
  const base: MyRescue = { redemption_id: "r", status: null, partner_name: "Birds and Beaks", bird_name: "Sunny", species: "Sun conure",
    adopted_on: "2026-11-15", created_at: null, starts_at: null, ends_at: null, seen: false, has_founding: false };
  assert.equal(rescueStep(null), "code");
  assert.equal(rescueStep({ ...base, redemption_id: null }), "code");
  assert.equal(rescueStep({ ...base, status: "pending" }), "pending");
  assert.equal(rescueStep({ ...base, status: "approved" }), "welcome");
  assert.equal(rescueStep({ ...base, status: "declined" }), "declined");
  assert.equal(rescueStep({ ...base, status: "declined", seen: true }), "code", "after seeing a decline, they can try again");
  assert.equal(rescueStep({ ...base, redemption_id: null, has_founding: true }), "founder");
});

check("rescue codes: the form is open before joining, without the member chrome", () => {
  assert.ok(isJoinPath("/flock/rescue") && isRescuePath("/flock/rescue"));
  const base: FlockAccess = { member_now: false, has_membership: false, agreed: false, is_admin: false, guidelines_version: FLOCK_GUIDELINES_VERSION, opens_at: null, season_ends_at: null };
  assert.equal(joinRedirect(base, "/flock/rescue"), null, "not joined yet: may open the form");
  assert.equal(joinRedirect(null, "/flock/rescue"), "/dashboard");
  assert.ok(QUEUE_FILTERS.includes("rescues"), "the review queue has a Rescues filter");
});

check("rescue codes: admin helpers", () => {
  assert.equal(parseUseLimit(""), null);
  assert.equal(parseUseLimit(" 25 "), 25);
  assert.equal(parseUseLimit("0"), "bad");
  assert.equal(parseUseLimit("2.5"), "bad");
  assert.equal(rescueErrorKind({ message: "code_taken" }), "code_taken");
  assert.equal(rescueErrorKind({ message: "founder" }), "founder");
  assert.equal(adoptedLabel("2026-11-15", "en-US").startsWith("Nov 15"), true);
});

check("rescue codes: the redeem page shows the link only behind the Flock gate", () => {
  const src = readFileSync("src/routes/redeem.tsx", "utf8");
  assert.ok(src.includes("flockOpen === true &&"), "the link waits for flock_enabled()");
  assert.doesNotMatch(src, /from "@\/lib\/flockRescue"/, "shared code doesn't import Flock code");
});


check("chapter names: every stored chapter has a translation, unknown names pass through", () => {
  const sql = readFileSync("supabase/migrations/20261020180000_flock_foundation.sql", "utf8");
  const seeded = [...sql.slice(sql.indexOf("insert into public.regions")).matchAll(/\('[a-z-]+',\s+'([^']+)'/g)].map((m) => m[1]);
  assert.deepEqual([...CHAPTER_NAMES], seeded, "the same ten names as the regions table");
  const keys: string[] = [];
  const t = ((k: string, d: string) => { keys.push(k); return `<${d}>`; }) as unknown as Parameters<typeof chapterName>[0];
  for (const n of CHAPTER_NAMES) assert.equal(chapterName(t, n), `<${n}>`, n);
  assert.equal(new Set(keys).size, CHAPTER_NAMES.length, "one key each");
  assert.equal(chapterName(t, "Rocky Mountains"), "Rocky Mountains", "a new region shows as stored");
  assert.equal(chapterName(t, null), "");
  assert.equal(chapterLine("Great Lakes", ["IL", "IN"], t), "<Great Lakes> · IL · IN", "state codes stay as they are");
});

console.log(`\n${passed} passed${process.exitCode ? ", some FAILED" : ""}`);
