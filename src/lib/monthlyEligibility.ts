/**
 * Who is old enough to receive a monthly recap.
 *
 * An account that signed up late in the month has almost nothing to recap, and
 * a near-empty Flock Report is a poor first impression when the onboarding
 * series is already introducing the app properly. So a recap goes only to
 * accounts that existed before the 15th of the month being recapped; everyone
 * else waits for the next issue, by which time they have a full month.
 *
 * Deliberately a date rule ONLY, with no activity escape hatch: a late signup
 * who logged a little still gets a thin recap, and the onboarding series is the
 * better thing for them to be reading that week.
 *
 * Lives in its own module so the cron and its dry run share one implementation
 * — the hook has a single code path and the dryRun flag only decides whether to
 * send and log, so there is no second copy of this to drift.
 */

/** Midnight UTC on the 15th of the recapped month. */
export function recapCutoff(recapYear: number, recapMonth: number): Date {
  return new Date(Date.UTC(recapYear, recapMonth - 1, 15, 0, 0, 0, 0));
}

/**
 * True when `createdAt` is strictly before midnight UTC on the 15th.
 *
 * Strictly before: an account created at exactly 00:00:00Z on the 15th is OUT,
 * which makes the boundary unambiguous rather than a coin toss on a timestamp.
 * An unparseable or missing date is treated as NOT eligible — a recap is not
 * worth sending on a guess.
 */
export function eligibleForRecap(
  createdAt: string | Date | null | undefined,
  recapYear: number,
  recapMonth: number,
): boolean {
  if (!createdAt) return false;
  const t = createdAt instanceof Date ? createdAt.getTime() : Date.parse(createdAt);
  if (Number.isNaN(t)) return false;
  return t < recapCutoff(recapYear, recapMonth).getTime();
}
