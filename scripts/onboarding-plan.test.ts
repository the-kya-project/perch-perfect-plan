/**
 * The onboarding decision, rule by rule.
 *
 *   npm run test:onboarding-plan
 *
 * Plain asserts, same as the other scripts/*.test.ts files. Exits non-zero on
 * the first failure so it can gate a merge.
 */
import assert from "node:assert/strict";
import { buildAccounts, decide, inOnboardingSeries, simulate, type OnboardingAccount, type RawRows } from "@/lib/onboardingPlan";

let passed = 0;
function check(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ok   ${name}`);
  } catch (e) {
    console.log(`  FAIL ${name}`);
    console.log(`       ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`);
    process.exitCode = 1;
  }
}

const RUN = (day: string) => new Date(`${day}T15:00:00Z`);
const sent = (stage: string, day: string) => ({ stage, status: "sent" as const, at: `${day}T15:00:02Z` });
const skipped = (stage: string, day: string) => ({ stage, status: "skipped" as const, at: `${day}T15:00:02Z` });

function acct(over: Partial<OnboardingAccount> = {}): OnboardingAccount {
  return {
    userId: "u1",
    createdAt: "2026-10-01T10:00:00Z",
    notifyOnboarding: true,
    hasBird: true,
    linkBird: { id: "b1", name: "Juno" },
    onlyPassedBirds: false,
    done: { weighed: false, checked: false, carePlanComplete: false, journaled: false, shared: false },
    cannotShare: false,
    log: [],
    pushedToday: false,
    flockReportToday: false,
    ...over,
  };
}

console.log("eligibility");
check("opted out → nothing", () => assert.deepEqual(decide(acct({ notifyOnboarding: false }), RUN("2026-10-02")), { kind: "hold", reason: "opted_out" }));
check("signed up before 9/25 → retired", () =>
  assert.deepEqual(decide(acct({ createdAt: "2026-09-24T23:59:59Z" }), RUN("2026-10-02")), { kind: "hold", reason: "pre_series" }));
check("only bird passed → paused, nothing logged", () =>
  assert.deepEqual(decide(acct({ hasBird: false, onlyPassedBirds: true }), RUN("2026-10-02")), { kind: "hold", reason: "bird_passed" }));

console.log("\ncadence");
check("new account → welcome", () => {
  const d = decide(acct(), RUN("2026-10-01"));
  assert.equal(d.kind === "act" && d.send?.stage, "welcome");
});
check("2 calendar days after a send → not due", () =>
  assert.equal(decide(acct({ log: [sent("welcome", "2026-10-01")] }), RUN("2026-10-03")).kind, "hold"));
check("3 calendar days, even a few seconds earlier in the day → due", () => {
  const d = decide(acct({ log: [{ stage: "welcome", status: "sent", at: "2026-10-01T15:00:09Z" }] }), new Date("2026-10-04T15:00:01Z"));
  assert.equal(d.kind, "act");
});
check("already sent today → hold", () =>
  assert.deepEqual(decide(acct({ log: [sent("welcome", "2026-10-04")] }), RUN("2026-10-04")), { kind: "hold", reason: "sent_today" }));
check("push nudge today → hold", () =>
  assert.equal((decide(acct({ pushedToday: true, log: [sent("welcome", "2026-10-01")] }), RUN("2026-10-04")) as { reason: string }).reason, "pushed_today"));
check("Flock Report today → hold", () =>
  assert.equal((decide(acct({ flockReportToday: true, log: [sent("welcome", "2026-10-01")] }), RUN("2026-10-04")) as { reason: string }).reason, "flock_report_today"));

console.log("\nno-bird nudges");
check("no bird, after welcome → add_first_bird (no_bird)", () => {
  const d = decide(acct({ hasBird: false, linkBird: null, log: [sent("welcome", "2026-10-01")] }), RUN("2026-10-04"));
  assert.deepEqual(d, { kind: "act", skips: [], send: { stage: "add_first_bird", ctaVariant: "no_bird" } });
});
check("still no bird 3 days later → the reminder", () => {
  const d = decide(acct({ hasBird: false, linkBird: null, log: [sent("welcome", "2026-10-01"), sent("add_first_bird", "2026-10-04")] }), RUN("2026-10-07"));
  assert.equal(d.kind === "act" && d.send?.stage, "add_first_bird_reminder");
});
check("bird added after the first nudge → reminder skipped, weighing goes the same day", () => {
  const d = decide(acct({ log: [sent("welcome", "2026-10-01"), sent("add_first_bird", "2026-10-04")] }), RUN("2026-10-07"));
  assert.deepEqual(d, { kind: "act", skips: [{ stage: "add_first_bird_reminder", reason: "has_bird" }], send: { stage: "series_weighing", ctaVariant: "standard" } });
});
check("has a bird from the start → both nudges skipped", () => {
  const d = decide(acct({ log: [sent("welcome", "2026-10-01")] }), RUN("2026-10-04"));
  assert.ok(d.kind === "act");
  assert.deepEqual(d.skips.map((s) => s.stage), ["add_first_bird", "add_first_bird_reminder"]);
});
check("first nudge skipped, bird later deleted → reminder still skipped", () => {
  const d = decide(acct({ hasBird: false, linkBird: null, log: [sent("welcome", "2026-10-01"), skipped("add_first_bird", "2026-10-04"), sent("series_weighing", "2026-10-04")] }), RUN("2026-10-07"));
  assert.ok(d.kind === "act");
  assert.deepEqual(d.skips, [{ stage: "add_first_bird_reminder", reason: "has_bird" }]);
  assert.deepEqual(d.send, { stage: "series_health_check", ctaVariant: "no_bird" });
});
check("old drip's add_first_bird counts as nudge #1 (never re-sent)", () => {
  const d = decide(acct({ hasBird: false, linkBird: null, log: [sent("welcome", "2026-10-13"), sent("add_first_bird", "2026-10-15")] }), RUN("2026-10-18"));
  assert.equal(d.kind === "act" && d.send?.stage, "add_first_bird_reminder");
});
check("no bird throughout → all 9 emails, every 3 days, series CTAs no_bird", () => {
  const ev = simulate([acct({ hasBird: false, linkBird: null })], RUN("2026-10-01"), 30).filter((e) => e.kind === "sent");
  assert.deepEqual(ev.map((e) => e.date), ["2026-10-01", "2026-10-04", "2026-10-07", "2026-10-10", "2026-10-13", "2026-10-16", "2026-10-19", "2026-10-22", "2026-10-25"]);
  assert.ok(ev.every((e) => e.kind === "sent" && e.ctaVariant === "no_bird"));
});

console.log("\nskip-if-done");
check("did everything → welcome, then straight to series_vet on day 3", () => {
  const ev = simulate([acct({ done: { weighed: true, checked: true, carePlanComplete: true, journaled: true, shared: true } })], RUN("2026-10-01"), 10);
  const sends = ev.filter((e) => e.kind === "sent").map((e) => `${e.date} ${(e as { stage: string }).stage}`);
  assert.deepEqual(sends, ["2026-10-01 welcome", "2026-10-04 series_vet"]);
  assert.equal(ev.filter((e) => e.kind === "skipped").length, 7);
});
check("series_vet is never skipped", () => {
  const d = decide(acct({ log: ["welcome", "add_first_bird", "add_first_bird_reminder", "series_weighing", "series_health_check", "series_care_plan", "series_journal", "series_sharing"].map((s) => sent(s, "2026-10-01")) }), RUN("2026-10-04"));
  assert.equal(d.kind === "act" && d.send?.stage, "series_vet");
});
check("member without Manage the household → series_sharing skipped cannot_share", () => {
  const d = decide(acct({ cannotShare: true, log: ["welcome", "add_first_bird", "add_first_bird_reminder", "series_weighing", "series_health_check", "series_care_plan", "series_journal"].map((s) => sent(s, "2026-10-01")) }), RUN("2026-10-04"));
  assert.ok(d.kind === "act");
  assert.deepEqual(d.skips, [{ stage: "series_sharing", reason: "cannot_share" }]);
});
check("everything settled → finished", () => {
  const all = ["welcome", "add_first_bird", "add_first_bird_reminder", "series_weighing", "series_health_check", "series_care_plan", "series_journal", "series_sharing", "series_vet"];
  assert.deepEqual(decide(acct({ log: all.map((s) => sent(s, "2026-10-01")) }), RUN("2026-10-20")), { kind: "hold", reason: "finished" });
});

console.log("\nbuilding accounts from rows");
const base: RawRows = {
  profiles: [
    { id: "owner", created_at: "2026-10-01T00:00:00Z", notify_onboarding: true },
    { id: "member", created_at: "2026-10-01T00:00:00Z", notify_onboarding: true },
    { id: "manager", created_at: "2026-10-01T00:00:00Z", notify_onboarding: true },
    { id: "grieving", created_at: "2026-10-01T00:00:00Z", notify_onboarding: null },
  ],
  birds: [
    { id: "b1", owner_id: "owner", name: "Juno", created_at: "2026-10-01T00:00:00Z", passed_at: null, setup_complete: false },
    { id: "b2", owner_id: "grieving", name: "Pip", created_at: "2026-09-01T00:00:00Z", passed_at: "2026-10-05T00:00:00Z", setup_complete: true },
  ],
  members: [
    { bird_id: "b1", user_id: "owner", role: "owner" },
    { bird_id: "b1", user_id: "member", role: "household" },
    { bird_id: "b1", user_id: "manager", role: "household" },
  ],
  permissions: [{ owner_id: "owner", member_user_id: "manager", capabilities: ["log_daily_care", "manage_household"] }],
  weights: [{ bird_id: "b1", source: "sitter" }],
  dailyLogs: [{ bird_id: "b1", source: "household" }],
  journals: [{ bird_id: "b1", sit_id: "sit-1" }],
  invites: [],
  sits: [{ owner_id: "owner", sitter_name: "__preview__" }],
  log: [],
  pushedToday: [],
  flockReportToday: [],
};
const built = new Map(buildAccounts(base).map((a) => [a.userId, a]));
check("a sitter's weight doesn't count; a household member's check does", () => {
  assert.equal(built.get("owner")!.done.weighed, false);
  assert.equal(built.get("owner")!.done.checked, true);
});
check("a sitter's journal entry doesn't count", () => assert.equal(built.get("owner")!.done.journaled, false));
check("'View as your sitter' preview sit is not sharing", () => assert.equal(built.get("owner")!.done.shared, false));
check("a real sit is sharing", () => {
  const a = buildAccounts({ ...base, sits: [{ owner_id: "owner", sitter_name: "Sam" }] }).find((x) => x.userId === "owner")!;
  assert.equal(a.done.shared, true);
});
check("household member counts as having a bird, buttons point at the shared bird", () => {
  assert.equal(built.get("member")!.hasBird, true);
  assert.equal(built.get("member")!.linkBird?.id, "b1");
});
check("member without Manage the household → cannotShare", () => assert.equal(built.get("member")!.cannotShare, true));
check("member with Manage the household → can share", () => assert.equal(built.get("manager")!.cannotShare, false));
check("owner whose only bird passed → paused", () => assert.equal(built.get("grieving")!.onlyPassedBirds, true));
check("notify_onboarding null reads as on", () => assert.equal(built.get("grieving")!.notifyOnboarding, true));

console.log("\nthe monthly letter's exclusion");
check("mid-series → excluded from The Flock Report", () => assert.equal(inOnboardingSeries(acct({ log: [sent("welcome", "2026-10-01")] })), true));
check("series finished → gets The Flock Report", () => assert.equal(inOnboardingSeries(acct({ log: [sent("series_vet", "2026-10-20")] })), false));
check("pre-series account → gets The Flock Report", () => assert.equal(inOnboardingSeries(acct({ createdAt: "2026-09-01T00:00:00Z" })), false));
check("opted out of onboarding → gets The Flock Report", () => assert.equal(inOnboardingSeries(acct({ notifyOnboarding: false })), false));

console.log(`\n${passed} passed${process.exitCode ? ", with failures" : ""}`);
