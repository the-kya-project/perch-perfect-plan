// How long a bird has been home, counted the way a birthday is: a year only
// counts once its anniversary has arrived. Came home Sep 13, 2024 and today is
// Oct 20, 2026 → 2 years (the third anniversary is next September).
//
// Pure and timezone-free: both dates are read as calendar days (YYYY-MM-DD for
// the came-home date, the device's local day for `today`).

export type TogetherSince =
  | { unit: "years"; count: number }
  | { unit: "months"; count: number }
  /** Home less than a full month, or a came-home date in the future. */
  | { unit: "lessThanMonth"; count: 0 };

function parts(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return { y, m, d };
}

/** Full months between two calendar days (never negative). */
export function fullMonthsBetween(fromISO: string, today: Date): number {
  const a = parts(fromISO);
  const ty = today.getFullYear(), tm = today.getMonth() + 1, td = today.getDate();
  let months = (ty - a.y) * 12 + (tm - a.m);
  if (td < a.d) months -= 1;
  return Math.max(0, months);
}

export function togetherSince(cameHomeISO: string, today: Date = new Date()): TogetherSince {
  const months = fullMonthsBetween(cameHomeISO, today);
  if (months >= 12) return { unit: "years", count: Math.floor(months / 12) };
  if (months >= 1) return { unit: "months", count: months };
  return { unit: "lessThanMonth", count: 0 };
}

/** The years an every-year date has come round so far, up to and including
 *  today (the start year counts as the first). */
export function occurredYears(baseISO: string, today: Date = new Date()): number[] {
  const b = parts(baseISO);
  const ty = today.getFullYear();
  const reachedThisYear = today.getMonth() + 1 > b.m || (today.getMonth() + 1 === b.m && today.getDate() >= b.d);
  const last = reachedThisYear ? ty : ty - 1;
  const out: number[] = [];
  for (let y = b.y; y <= last; y++) out.push(y);
  return out;
}
