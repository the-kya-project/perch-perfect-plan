/**
 * The weekly recap push (backlog D5.1): the rules, kept pure so
 * `npm run test:weekly-recap` can pin them. The engagement-nudges hook calls
 * these; with the switch off it sends the old 10- and 30-day check-ins exactly
 * as before.
 *
 * The switch is the Vercel env var `WEEKLY_RECAP` (Production):
 *   unset / "off" / anything else → off: nobody gets a recap, the old
 *                                    check-ins run unchanged
 *   "test"                         → only the accounts in
 *                                    `WEEKLY_RECAP_TEST_EMAILS` (comma-separated;
 *                                    default brittany@thekyaproject.com) get the
 *                                    recap instead of the check-ins
 *   "everyone"                     → every account gets the recap; the
 *                                    check-ins are retired
 *
 * What a recap says: how many weigh-ins, health checks and journal entries the
 * account's living birds had in the last 7 days. Counts only: never a weight,
 * a trend or a health check's result, so it can't read as a health judgment
 * (opening-scope 5d). A week with none of the three is a "quiet" recap, a
 * gentle nudge in the old check-in's place, and like the old pair it stops
 * after two in a row until the owner logs something again.
 *
 * When: the daily run (16:00 UTC) sends it on Sunday, or on Monday or Tuesday
 * when Sunday's was held back by the other nudges' one-a-day rules, and never
 * within 4 days of the last one, so it's at most one a week. It uses the
 * existing "Check-in reminders" toggle (push_checkin_reminder).
 */

export type WeeklyRecapMode = "off" | "test" | "everyone";

export const DEFAULT_RECAP_TEST_EMAILS = ["brittany@thekyaproject.com"];

/** UTC weekdays a recap may go out: Sunday, then Monday and Tuesday as catch-up. */
export const RECAP_WEEKDAYS: ReadonlySet<number> = new Set([0, 1, 2]);
/** Days that must pass after a recap before the next one. */
export const RECAP_MIN_GAP_DAYS = 4;
/** Days a recap covers, ending at the run. */
export const RECAP_WINDOW_DAYS = 7;
/** Quiet recaps in a row before going silent until the owner is back. */
export const RECAP_QUIET_MAX = 2;

const DAY = 1000 * 60 * 60 * 24;

export function weeklyRecapMode(raw: string | undefined | null): WeeklyRecapMode {
  const v = (raw ?? "").trim().toLowerCase();
  return v === "test" || v === "everyone" ? v : "off";
}

export function recapTestEmails(raw: string | undefined | null): string[] {
  const list = (raw ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.includes("@"));
  return list.length ? list : DEFAULT_RECAP_TEST_EMAILS;
}

/** Whether this account gets the recap (and so no 10/30-day check-in). */
export function recapOnFor(mode: WeeklyRecapMode, email: string | null | undefined, testEmails: string[]): boolean {
  if (mode === "everyone") return true;
  if (mode === "test") return !!email && testEmails.includes(email.trim().toLowerCase());
  return false;
}

export type RecapCounts = { weighIns: number; healthChecks: number; journalEntries: number };

export type RecapInput = {
  now: number;
  /** Latest weigh-in, health check or journal entry on the account's living birds; 0 = never. */
  lastActivityAt: number;
  /** Latest recap sent to the account; 0 = never. */
  lastRecapAt: number;
  /** Recaps sent since lastActivityAt (each one was a quiet one). */
  recapsSinceActivity: number;
  counts: RecapCounts;
};

export type RecapPlan = { kind: "week" | "quiet"; counts: RecapCounts };

export function isQuietWeek(c: RecapCounts): boolean {
  return c.weighIns + c.healthChecks + c.journalEntries === 0;
}

/** The recap due for one account on this run, or null. */
export function planRecap(i: RecapInput): RecapPlan | null {
  if (i.lastActivityAt <= 0) return null; // never active: the onboarding series covers them
  if (!RECAP_WEEKDAYS.has(new Date(i.now).getUTCDay())) return null;
  if (i.lastRecapAt > 0 && i.now - i.lastRecapAt < RECAP_MIN_GAP_DAYS * DAY) return null;
  if (!isQuietWeek(i.counts)) return { kind: "week", counts: i.counts };
  if (i.recapsSinceActivity >= RECAP_QUIET_MAX) return null;
  return { kind: "quiet", counts: i.counts };
}

/** Whether a timestamp falls inside the recap's week, ending at `now`. */
export function inRecapWindow(t: number, now: number): boolean {
  return t > now - RECAP_WINDOW_DAYS * DAY && t <= now;
}
