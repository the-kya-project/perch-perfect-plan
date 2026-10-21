// The weight "then" on the weight page: the entry nearest a past date (30 days,
// 90 days, or a year ago), but only when one was logged close enough to that
// date to stand for it. Picking the nearest entry from every entry meant a bird
// first weighed last week showed last week's weight as "1 year ago".
//
// Pure, no imports: safe to test under vite-node.

/** How far from the target date an entry may be, per range (days). */
export const THEN_TOLERANCE_DAYS: Record<number, number> = { 30: 7, 90: 14, 365: 30 };

const DAY_MS = 86_400_000;

/** Tolerance for a range: the table above, else a quarter of the range. */
export function thenToleranceDays(rangeDays: number): number {
  return THEN_TOLERANCE_DAYS[rangeDays] ?? Math.max(1, Math.round(rangeDays / 4));
}

/** The entry closest to `targetMs` within ±toleranceDays, or null. */
export function weightNear<T extends { measured_at: string }>(entries: T[], targetMs: number, toleranceDays: number): T | null {
  const limit = toleranceDays * DAY_MS;
  let best: T | null = null;
  let bestGap = Infinity;
  for (const e of entries) {
    const at = Date.parse(e.measured_at);
    if (Number.isNaN(at)) continue;
    const gap = Math.abs(at - targetMs);
    if (gap <= limit && gap < bestGap) { best = e; bestGap = gap; }
  }
  return best;
}

/** The weight `rangeDays` before `nowMs`, within that range's tolerance. */
export function weightThen<T extends { measured_at: string }>(entries: T[], rangeDays: number, nowMs: number = Date.now()): T | null {
  return weightNear(entries, nowMs - rangeDays * DAY_MS, thenToleranceDays(rangeDays));
}
