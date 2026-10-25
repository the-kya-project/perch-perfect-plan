/**
 * When the onboarding welcome goes out: about an hour after the account is
 * confirmed, held to 8 AM if that hour lands in the person's night.
 *
 * Pure — no database, no clock reads. The onboarding-welcome hook (every 15
 * minutes) asks `welcomeDecision` about each account, so a welcome goes out
 * 60–75 minutes after confirmation. The daily onboarding batch no longer sends
 * the welcome; it waits for it (see `decide` in onboardingPlan.ts).
 *
 *   due        confirmed_at + 60 minutes
 *   quiet      due lands 22:00–07:00 in profiles.time_zone → hold until the
 *              next 08:00 there. No (or an unknown) time zone: send at due.
 *   window     a welcome not sent within 48 hours of confirmation (a long
 *              Brevo outage, notifications off and later back on) is never
 *              sent late; the daily batch settles it as skipped
 *              `welcome_missed` an hour after that and moves on to the series.
 */
import { isValidTimeZone } from "./sitTimeZone";
import { SERIES_LAUNCH, WELCOME_WINDOW_HOURS } from "./onboardingPlan";

export { WELCOME_WINDOW_HOURS, WELCOME_MISSED_AFTER_HOURS } from "./onboardingPlan";
export const WELCOME_DELAY_MINUTES = 60;
export const QUIET_START_HOUR = 22;
export const QUIET_END_HOUR = 7;
export const QUIET_RELEASE_HOUR = 8;

const HOUR = 3_600_000;

/** Wall-clock parts of `t` in `tz`. */
function wallParts(t: number, tz: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(new Date(t));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { y: get("year"), m: get("month"), d: get("day"), h: get("hour") % 24, min: get("minute"), s: get("second") };
}

/** The zone's offset from UTC at instant `t`, in ms (local minus UTC). */
function offsetAt(t: number, tz: string): number {
  const p = wallParts(t, tz);
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s) - Math.floor(t / 1000) * 1000;
}

/** The instant that reads `hour`:00 on the given local date in `tz`. Checked
 *  twice so a DST change between the guess and the answer is accounted for. */
function wallToInstant(y: number, m: number, d: number, hour: number, tz: string): number {
  const guess = Date.UTC(y, m - 1, d, hour);
  let t = guess - offsetAt(guess, tz);
  const again = guess - offsetAt(t, tz);
  if (again !== t) t = again;
  return t;
}

/** The local hour (0–23) at `at` in `tz`. */
export function localHour(at: Date, tz: string): number {
  return wallParts(at.getTime(), tz).h;
}

/**
 * When this account's welcome should go: an hour after confirmation, or 8 AM
 * their time if that hour falls between 10 PM and 7 AM there.
 */
export function welcomeSendAt(confirmedAt: string, timeZone: string | null | undefined): { at: Date; quietHold: boolean } {
  const due = new Date(confirmedAt).getTime() + WELCOME_DELAY_MINUTES * 60_000;
  if (!isValidTimeZone(timeZone)) return { at: new Date(due), quietHold: false };
  const p = wallParts(due, timeZone);
  if (p.h < QUIET_START_HOUR && p.h >= QUIET_END_HOUR) return { at: new Date(due), quietHold: false };
  // 22:00–23:59 → 8 AM the next local day; 00:00–06:59 → 8 AM the same day.
  // Built from the local date, so a DST change overnight still lands on 8:00.
  const day = p.h >= QUIET_START_HOUR ? new Date(Date.UTC(p.y, p.m - 1, p.d + 1)) : new Date(Date.UTC(p.y, p.m - 1, p.d));
  const at = wallToInstant(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate(), QUIET_RELEASE_HOUR, timeZone);
  return { at: new Date(at), quietHold: true };
}

export type WelcomeCandidate = {
  userId: string;
  createdAt: string;
  confirmedAt: string | null;
  notifyOnboarding: boolean;
  timeZone: string | null;
  /** A welcome row exists in onboarding_email_log (sent or skipped). */
  welcomeSettled: boolean;
};

export type WelcomeHold = "already_welcomed" | "opted_out" | "pre_series" | "unconfirmed" | "too_soon" | "quiet_hours" | "outside_window";

export type WelcomeDecision =
  | { kind: "send"; sendAt: string; quietHold: boolean }
  | { kind: "hold"; reason: WelcomeHold; sendAt?: string };

/** Should this account get its welcome on a run at `now`? */
export function welcomeDecision(c: WelcomeCandidate, now: Date): WelcomeDecision {
  if (c.welcomeSettled) return { kind: "hold", reason: "already_welcomed" };
  if (new Date(c.createdAt) < new Date(SERIES_LAUNCH)) return { kind: "hold", reason: "pre_series" };
  if (!c.confirmedAt) return { kind: "hold", reason: "unconfirmed" };
  if (now.getTime() - new Date(c.confirmedAt).getTime() > WELCOME_WINDOW_HOURS * HOUR) return { kind: "hold", reason: "outside_window" };
  // Opt-out is checked after the window so the dry run doesn't list every old
  // opted-out account; it never sends either way.
  if (!c.notifyOnboarding) return { kind: "hold", reason: "opted_out" };
  const { at, quietHold } = welcomeSendAt(c.confirmedAt, c.timeZone);
  if (now < at) return { kind: "hold", reason: quietHold ? "quiet_hours" : "too_soon", sendAt: at.toISOString() };
  return { kind: "send", sendAt: at.toISOString(), quietHold };
}
