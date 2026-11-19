// Which "no more founding spots" box /founding shows once all 50 are claimed.
// Pure, so scripts/flock-shell.test.ts pins it. The database still decides
// whether claims are open (founding_status()); there is no closing date
// (20261119160000_founding_no_deadline), so the cap is the only limit.
//
//   full     all 50 claimed before the Flock opens (Mon, Jan 4, 2027)
//   fullOpen all 50 claimed, and the Flock has opened

/** 00:00 Eastern on Mon, Jan 4, 2027 (EST). */
export const FLOCK_OPENS_AT = "2027-01-04T05:00:00Z";

export type FoundingClosedCase = "full" | "fullOpen";

export function foundingClosedCase(now: Date = new Date()): FoundingClosedCase {
  return now.getTime() >= Date.parse(FLOCK_OPENS_AT) ? "fullOpen" : "full";
}
