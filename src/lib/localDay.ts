// "Today" as the person using the app sees it.
//
// `new Date().toISOString().slice(0, 10)` is the UTC date, so it rolls over at
// UTC midnight: a health check run at 6pm in California lands on tomorrow, and
// "already checked today" goes wrong for half the evening. Use these instead.
// No imports, so it is safe in browser code and in server functions alike.

/** This device's calendar date as YYYY-MM-DD. */
export function localDateISO(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Server side: the caller's local date when it sent a plausible one, else the
 *  UTC date. Plausible means a YYYY-MM-DD within a day of UTC (time zones run
 *  from UTC−12 to UTC+14), so a client can't file a check under last month. */
export function resolveToday(clientDay?: string | null): string {
  const utc = new Date().toISOString().slice(0, 10);
  if (!clientDay || !/^\d{4}-\d{2}-\d{2}$/.test(clientDay)) return utc;
  const diff = Math.abs(Date.parse(`${clientDay}T00:00:00Z`) - Date.parse(`${utc}T00:00:00Z`));
  return diff <= 86_400_000 ? clientDay : utc;
}

/** A stored date as a Date to display. A date-only "YYYY-MM-DD" (intake dates,
 *  moments, came-home dates) is that calendar day at local noon:
 *  `new Date("YYYY-MM-DD")` is UTC midnight, which is the day before anywhere
 *  west of UTC. A full timestamp is parsed as usual. Null when empty or invalid. */
export function parseCalendarDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  const d = m ? new Date(+m[1], +m[2] - 1, +m[3], 12) : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}
