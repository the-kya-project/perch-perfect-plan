// Display helpers for DATE-only values (stored as "YYYY-MM-DD").
//
// Parse the parts directly rather than `new Date("YYYY-MM-DD")` — the latter is
// interpreted as UTC midnight and can render as the previous day in negative-UTC
// timezones. Splitting the string keeps the calendar date the owner picked.

/** "2026-08-14" -> "08/14/2026". Returns "" for empty/invalid input. */
export function formatDateUS(iso: string | null | undefined): string {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const [, y, mo, d] = m;
  return `${mo}/${d}/${y}`;
}

/** A start–end range as "MM/DD/YYYY – MM/DD/YYYY". */
export function formatDateRangeUS(start: string | null | undefined, end: string | null | undefined): string {
  return `${formatDateUS(start)} – ${formatDateUS(end)}`;
}
