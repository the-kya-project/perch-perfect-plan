// Which "no more founding spots" box /founding shows once all 50 are claimed.
// Pure, so scripts/flock-shell.test.ts pins it. The database still decides
// whether claims are open (founding_status()); there is no closing date
// (20261119160000_founding_no_deadline), so the cap is the only limit.
//
//   full     all 50 claimed, and the Flock hasn't opened
//   fullOpen all 50 claimed, and the Flock has opened
//
// There's no fixed opening date: it's flock_settings.flock_opens_at, set when
// Brittany opens the Flock. /founding reads it through getFlockPublicDates and
// passes null until it's set (or still loading), which shows "full".

export type FoundingClosedCase = "full" | "fullOpen";

export function foundingClosedCase(opensAt: string | null, now: Date = new Date()): FoundingClosedCase {
  if (!opensAt) return "full";
  return now.getTime() >= Date.parse(opensAt) ? "fullOpen" : "full";
}
