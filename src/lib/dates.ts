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

// ---- Calendar-safe parsing (local midnight, never UTC) for richer labels ----
function dateParts(iso: string | null | undefined): { y: number; mo: number; d: number } | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? { y: +m[1], mo: +m[2], d: +m[3] } : null;
}
function localDate(iso: string | null | undefined): Date | null {
  const p = dateParts(iso);
  return p ? new Date(p.y, p.mo - 1, p.d) : null;
}

/** "2026-07-05" -> "Saturday, July 5". */
export function weekdayMonthDay(iso: string | null | undefined): string {
  const d = localDate(iso);
  return d ? d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }) : "";
}

/** "2026-07-05" -> "Jul 5". */
export function monthDay(iso: string | null | undefined): string {
  const d = localDate(iso);
  return d ? d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "";
}

/** A compact range: "Jul 6 → 12" when same month, else "Jun 24 → Jul 5". */
export function compactRange(start: string | null | undefined, end: string | null | undefined): string {
  const a = dateParts(start);
  const b = dateParts(end);
  if (!a || !b) return "";
  const right = a.y === b.y && a.mo === b.mo ? String(b.d) : monthDay(end);
  return `${monthDay(start)} → ${right}`;
}

/** Whole days from local "today" to `iso` (negative if past, 0 if today). */
export function daysUntil(iso: string | null | undefined): number {
  const d = localDate(iso);
  if (!d) return 0;
  const n = new Date();
  const today = new Date(n.getFullYear(), n.getMonth(), n.getDate());
  return Math.round((d.getTime() - today.getTime()) / 86_400_000);
}

/** Inclusive day count of a sit, e.g. Jun 24 → Jun 24 is 1 day. */
export function durationDays(start: string | null | undefined, end: string | null | undefined): number {
  const a = localDate(start);
  const b = localDate(end);
  if (!a || !b) return 0;
  return Math.round((b.getTime() - a.getTime()) / 86_400_000) + 1;
}
