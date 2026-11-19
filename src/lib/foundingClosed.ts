// Which "no more founding spots" box /founding shows once claims stop.
// Pure, so scripts/flock-shell.test.ts pins it. The database still decides
// whether claims are open (founding_status()); this only picks the wording.
//
//   full    all 50 claimed before the Flock opens (Mon, Jan 4, 2027)
//   fullOpen all 50 claimed, and the Flock has opened
//   closed  claims closed by date (end of Jan 31, 2027) with spots left

/** 00:00 Eastern on Mon, Jan 4, 2027 (EST). */
export const FLOCK_OPENS_AT = "2027-01-04T05:00:00Z";

export type FoundingClosedCase = "full" | "fullOpen" | "closed";

export function foundingClosedCase(claimed: number, cap: number, now: Date = new Date()): FoundingClosedCase {
  if (claimed >= cap) return now.getTime() >= Date.parse(FLOCK_OPENS_AT) ? "fullOpen" : "full";
  return "closed";
}
