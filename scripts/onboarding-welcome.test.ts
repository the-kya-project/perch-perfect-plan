/**
 * The welcome an hour after confirmation, rule by rule, and three simulated
 * sign-ups (no bird, a bird not set up, a bird set up) in English and Dutch.
 *
 *   npm run test:onboarding-welcome
 *
 * Plain asserts, same as the other scripts/*.test.ts files. Exits non-zero on
 * any failure so it can gate a merge. Set WELCOME_RENDER_DIR to also write the
 * six simulated welcome emails there as HTML.
 */
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { welcomeDecision, welcomeSendAt, type WelcomeCandidate } from "@/lib/welcomeTiming";
import { buildAccounts, decide, simulate, SLOTS, type LogEntry, type OnboardingAccount, type RawRows } from "@/lib/onboardingPlan";
import { buildWelcomeEmail } from "@/lib/flockEmails";

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

const cand = (over: Partial<WelcomeCandidate> = {}): WelcomeCandidate => ({
  userId: "u1",
  createdAt: "2026-10-26T09:58:00Z",
  confirmedAt: "2026-10-26T10:00:00Z",
  notifyOnboarding: true,
  timeZone: null,
  welcomeSettled: false,
  ...over,
});
const at = (iso: string) => new Date(iso);
const sendAt = (confirmed: string, tz: string | null) => welcomeSendAt(confirmed, tz).at.toISOString();

console.log("the hour after confirmation");
check("59 minutes after confirming → not yet", () =>
  assert.equal(welcomeDecision(cand(), at("2026-10-26T10:59:00Z")).kind, "hold"));
check("60 minutes after → send", () =>
  assert.equal(welcomeDecision(cand(), at("2026-10-26T11:00:00Z")).kind, "send"));
check("every confirmation minute lands 60–75 minutes later on the :07/:22/:37/:52 runs", () => {
  const runs = [7, 22, 37, 52];
  for (let m = 0; m < 60; m++) {
    const confirmed = new Date(Date.UTC(2026, 9, 26, 10, m, 30)).toISOString();
    let first: number | null = null;
    for (let h = 10; h <= 12 && first === null; h++) {
      for (const r of runs) {
        const t = new Date(Date.UTC(2026, 9, 26, h, r));
        if (welcomeDecision(cand({ confirmedAt: confirmed }), t).kind === "send") { first = t.getTime(); break; }
      }
    }
    const delay = (first! - Date.parse(confirmed)) / 60_000;
    assert.ok(delay >= 60 && delay <= 75, `confirmed :${m} → ${delay} min`);
  }
});
check("not confirmed → never", () =>
  assert.deepEqual(welcomeDecision(cand({ confirmedAt: null }), at("2026-10-27T10:00:00Z")), { kind: "hold", reason: "unconfirmed" }));
check("notify_onboarding = false (test accounts, opt-outs) → never", () =>
  assert.deepEqual(welcomeDecision(cand({ notifyOnboarding: false }), at("2026-10-26T12:00:00Z")), { kind: "hold", reason: "opted_out" }));
check("a welcome row already exists → never again", () =>
  assert.deepEqual(welcomeDecision(cand({ welcomeSettled: true }), at("2026-10-26T12:00:00Z")), { kind: "hold", reason: "already_welcomed" }));
check("signed up before the series launched → never", () =>
  assert.equal((welcomeDecision(cand({ createdAt: "2026-09-01T00:00:00Z" }), at("2026-10-26T12:00:00Z")) as { reason: string }).reason, "pre_series"));
check("more than 48 hours after confirming → never sent late", () =>
  assert.equal((welcomeDecision(cand(), at("2026-10-28T10:01:00Z")) as { reason: string }).reason, "outside_window"));

console.log("\nquiet hours (10 PM–7 AM in their time zone → 8 AM)");
check("no time zone → the 1-hour mark, even at 3 AM UTC", () =>
  assert.equal(sendAt("2026-10-26T02:00:00Z", null), "2026-10-26T03:00:00.000Z"));
check("unknown time zone name → the 1-hour mark", () =>
  assert.equal(sendAt("2026-10-26T02:00:00Z", "Mars/Olympus_Mons"), "2026-10-26T03:00:00.000Z"));
check("London, 1-hour mark 21:30 → sends then", () =>
  assert.equal(sendAt("2026-10-26T20:30:00Z", "Europe/London"), "2026-10-26T21:30:00.000Z"));
check("London, 1-hour mark 22:10 → 8 AM next day", () =>
  assert.equal(sendAt("2026-10-26T21:10:00Z", "Europe/London"), "2026-10-27T08:00:00.000Z"));
check("Amsterdam, 1-hour mark 06:30 → 8 AM same day", () =>
  assert.equal(sendAt("2026-10-27T04:30:00Z", "Europe/Amsterdam"), "2026-10-27T07:00:00.000Z"));
check("Amsterdam, 1-hour mark exactly 07:00 → sends then", () =>
  assert.equal(sendAt("2026-10-27T05:00:00Z", "Europe/Amsterdam"), "2026-10-27T06:00:00.000Z"));
check("Los Angeles, 1-hour mark 23:30 → 8 AM Pacific next day", () =>
  assert.equal(sendAt("2026-10-27T05:30:00Z", "America/Los_Angeles"), "2026-10-27T15:00:00.000Z"));
check("Amsterdam, the night the clocks go back → still 8 AM local (CET)", () =>
  assert.equal(sendAt("2026-10-24T21:30:00Z", "Europe/Amsterdam"), "2026-10-25T07:00:00.000Z"));
check("New York, the night the clocks go forward → still 8 AM local (EDT)", () =>
  assert.equal(sendAt("2027-03-14T04:00:00Z", "America/New_York"), "2027-03-14T12:00:00.000Z"));
check("held for quiet hours → hold until 8 AM, then send", () => {
  const c = cand({ confirmedAt: "2026-10-26T21:10:00Z", timeZone: "Europe/London" });
  assert.deepEqual(welcomeDecision(c, at("2026-10-26T23:00:00Z")), { kind: "hold", reason: "quiet_hours", sendAt: "2026-10-27T08:00:00.000Z" });
  assert.deepEqual(welcomeDecision(c, at("2026-10-27T08:07:00Z")), { kind: "send", sendAt: "2026-10-27T08:00:00.000Z", quietHold: true });
});
check("a late send (retry, catch-up) that would land at night also waits for 8 AM", () => {
  // 1-hour mark 17:37 London; the run that finally sends is at 22:07 London.
  const c = cand({ confirmedAt: "2026-10-25T16:37:13Z", createdAt: "2026-10-25T16:36:48Z", timeZone: "Europe/London" });
  assert.deepEqual(welcomeDecision(c, at("2026-10-25T21:52:00Z")).kind, "send");
  assert.deepEqual(welcomeDecision(c, at("2026-10-25T22:07:00Z")), { kind: "hold", reason: "quiet_hours", sendAt: "2026-10-26T08:00:00.000Z" });
  assert.equal(welcomeDecision(c, at("2026-10-26T08:07:00Z")).kind, "send");
});
check("…unless we don't know their time zone", () =>
  assert.equal(welcomeDecision(cand({ confirmedAt: "2026-10-25T16:37:13Z", createdAt: "2026-10-25T16:36:48Z" }), at("2026-10-25T22:07:00Z")).kind, "send"));

console.log("\nthe daily batch and the welcome");
const sent = (stage: string, iso: string): LogEntry => ({ stage, status: "sent", at: iso });
function acct(over: Partial<OnboardingAccount> = {}): OnboardingAccount {
  return {
    userId: "u1",
    createdAt: "2026-10-01T16:00:00Z",
    confirmedAt: "2026-10-01T16:02:00Z",
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
check("the daily batch never sends the welcome, in any state", () => {
  for (const hasBird of [true, false])
    for (const confirmedAt of [null, "2026-10-01T16:02:00Z"])
      for (const day of ["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-10"]) {
        const d = decide(acct({ hasBird, linkBird: hasBird ? { id: "b1", name: "Juno" } : null, confirmedAt }), at(`${day}T15:00:00Z`));
        assert.ok(!(d.kind === "act" && d.send?.stage === "welcome"), `${hasBird} ${confirmedAt} ${day}`);
      }
});
check("welcome not settled yet → the daily batch waits", () =>
  assert.deepEqual(decide(acct(), at("2026-10-02T15:00:00Z")), { kind: "hold", reason: "awaiting_welcome" }));
check("welcome went out this morning → the daily batch sends nothing today", () =>
  assert.deepEqual(decide(acct({ log: [sent("welcome", "2026-10-02T09:00:00Z")] }), at("2026-10-02T15:00:00Z")), { kind: "hold", reason: "sent_today" }));
check("the next email counts from sign-up, not from the welcome", () => {
  // Signed up 10/01 after the old 15:00 batch; welcome went 10/02 (late
  // confirmation). The next email is 10/04 (sign-up + 3), not 10/05.
  const a = acct({ hasBird: false, linkBird: null, confirmedAt: "2026-10-02T08:00:00Z", log: [sent("welcome", "2026-10-02T09:00:00Z")] });
  assert.deepEqual(decide(a, at("2026-10-03T15:00:00Z")), { kind: "hold", reason: "not_due", nextDue: "2026-10-04" });
  const d = decide(a, at("2026-10-04T15:00:00Z"));
  assert.equal(d.kind === "act" && d.send?.stage, "add_first_bird");
});
check("…and the ones after that stay 3 days after the last", () => {
  const a = acct({ hasBird: false, linkBird: null, log: [sent("welcome", "2026-10-02T09:00:00Z"), sent("add_first_bird", "2026-10-04T15:00:02Z")] });
  assert.equal(decide(a, at("2026-10-06T15:00:00Z")).kind, "hold");
  assert.equal((decide(a, at("2026-10-07T15:00:00Z")) as { send?: { stage: string } }).send?.stage, "add_first_bird_reminder");
});
check("never confirmed → the series never starts", () =>
  assert.deepEqual(decide(acct({ confirmedAt: null }), at("2026-10-20T15:00:00Z")), { kind: "hold", reason: "awaiting_welcome" }));
check("welcome window closed without a send → skipped welcome_missed, series goes on", () => {
  const d = decide(acct({ confirmedAt: "2026-10-01T16:02:00Z" }), at("2026-10-04T15:00:00Z"));
  assert.ok(d.kind === "act");
  assert.deepEqual(d.skips[0], { stage: "welcome", reason: "welcome_missed" });
  assert.equal(d.send?.stage, "series_weighing");
});
check("the batch doesn't give up on the welcome while the hook can still send it", () =>
  assert.deepEqual(decide(acct(), at("2026-10-03T15:00:00Z")), { kind: "hold", reason: "awaiting_welcome" }));

console.log("\nsimulated sign-ups");
// One account per state, built from rows the way both hooks build them.
const STATES = [
  { id: "no-bird", birds: [] as RawRows["birds"], variant: "no_bird" },
  { id: "bird-not-set-up", birds: [{ id: "b1", owner_id: "bird-not-set-up", name: "Kiwi", created_at: "2026-10-26T10:20:00Z", passed_at: null, setup_complete: false }], variant: "standard" },
  { id: "bird-set-up", birds: [{ id: "b2", owner_id: "bird-set-up", name: "Mango", created_at: "2026-10-26T10:20:00Z", passed_at: null, setup_complete: true }], variant: "standard" },
] as const;
const WORDING = {
  en: { headline: "Welcome to the flock, Sam.", open: "Open Kya &amp; Co.", add: "Add your first bird" },
  nl: { headline: "Welkom in de club, Sam.", open: "Open Kya &amp; Co.", add: "Voeg je eerste vogel toe" },
} as const;
const appUrl = "https://app.thekyaproject.com";
const raw: RawRows = {
  profiles: STATES.map((s) => ({ id: s.id, created_at: "2026-10-26T10:00:00Z", notify_onboarding: true })),
  birds: STATES.flatMap((s) => [...s.birds]),
  members: [], permissions: [], weights: [], dailyLogs: [], journals: [], invites: [], sits: [], log: [],
  pushedToday: [], flockReportToday: [],
  confirmations: STATES.map((s) => ({ user_id: s.id, email_confirmed_at: "2026-10-26T10:05:00Z" })),
};
const accounts = new Map(buildAccounts(raw).map((a) => [a.userId, a]));
const renderDir = process.env.WELCOME_RENDER_DIR;
if (renderDir) mkdirSync(renderDir, { recursive: true });

for (const locale of ["en", "nl"] as const) {
  for (const s of STATES) {
    check(`${locale} · ${s.id} → welcome at 11:07, ${s.variant} version, in ${locale === "en" ? "English" : "Dutch"}`, () => {
      const a = accounts.get(s.id)!;
      const tz = locale === "nl" ? "Europe/Amsterdam" : "America/New_York";
      // The 10:52 run is too soon; the 11:07 run sends.
      const c = { userId: s.id, createdAt: a.createdAt, confirmedAt: a.confirmedAt, notifyOnboarding: a.notifyOnboarding, timeZone: tz, welcomeSettled: false };
      assert.equal(welcomeDecision(c, at("2026-10-26T10:52:00Z")).kind, "hold");
      assert.equal(welcomeDecision(c, at("2026-10-26T11:07:00Z")).kind, "send");
      const variant = a.hasBird ? "standard" : "no_bird";
      assert.equal(variant, s.variant);
      const email = buildWelcomeEmail({ firstName: "Sam", link: appUrl, hasBird: a.hasBird, addBirdLink: `${appUrl}/birds/new`, locale, unsubscribeUrl: `${appUrl}/unsubscribe?t=x` });
      assert.equal(email.subject, WORDING[locale].headline);
      if (a.hasBird) {
        assert.ok(email.html.includes(WORDING[locale].open), "opens the app");
        assert.ok(!email.html.includes(WORDING[locale].add), "no add-a-bird button");
      } else {
        assert.ok(email.html.includes(WORDING[locale].add), "add-a-bird button");
        assert.ok(email.html.includes(`${appUrl}/birds/new`), "links to /birds/new");
      }
      if (renderDir) writeFileSync(join(renderDir, `welcome-${locale}-${s.id}.html`), email.html);
    });
  }
}
check("bird set up → the series later skips the care-plan email; not set up → it gets it", () => {
  const after = (id: string) => {
    const a = { ...accounts.get(id)!, log: [sent("welcome", "2026-10-26T11:07:00Z")] };
    return simulate([a], at("2026-10-27T15:00:00Z"), 40).filter((e) => e.kind !== "hold").map((e) => `${e.kind}:${e.stage}`);
  };
  assert.ok(after("bird-set-up").includes("skipped:series_care_plan"));
  assert.ok(after("bird-not-set-up").includes("sent:series_care_plan"));
  assert.ok(after("no-bird").includes("sent:add_first_bird"));
});
check("the first email after the welcome is 3 days after sign-up, for all three", () => {
  for (const s of STATES) {
    const a = { ...accounts.get(s.id)!, log: [sent("welcome", "2026-10-26T11:07:00Z")] };
    const first = simulate([a], at("2026-10-26T15:00:00Z"), 10).find((e) => e.kind === "sent");
    assert.equal(first?.date, "2026-10-29", s.id);
  }
});
check("all nine slots are still in the series", () => assert.equal(SLOTS.length, 9));

console.log(`\n${passed} passed${process.exitCode ? ", with failures" : ""}`);
