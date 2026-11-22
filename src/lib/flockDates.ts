// Opening day and the free season's end, as the public founding, gift and
// redeem pages see them. Both are empty until Brittany sets them when she
// opens the Flock (flock_settings; read through getFlockPublicDates). Pure, so
// scripts/flock-shell.test.ts pins it.

export type FlockPublicDates = { opensAt: string | null; freeSeasonEndsAt: string | null };

export const NO_FLOCK_DATES: FlockPublicDates = { opensAt: null, freeSeasonEndsAt: null };

/** "July 6, 2027": the Flock's day (Eastern time), the month written out. */
export function formatFlockDay(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "America/New_York" });
}

/** The free season's end to show ("July 6, 2027"), or null when there's none
 *  to show: not set yet, or already past. Pages fall back to the "while we're
 *  getting started" wording when this is null. */
export function freeSeasonEndLabel(dates: FlockPublicDates, now: Date = new Date()): string | null {
  const end = dates.freeSeasonEndsAt;
  if (!end) return null;
  const t = Date.parse(end);
  if (Number.isNaN(t) || t <= now.getTime()) return null;
  return formatFlockDay(end);
}
