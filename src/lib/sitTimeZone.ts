// A sit's dates are calendar days in the OWNER's time zone (sits.time_zone).
//
// The sitter link expires at the end of end_date in that zone (the
// enforce_sit_token_rules trigger), and the sitter view's "Day 2 of 3" / "Last
// day" line reads "today" in the same zone, so a sitter in another zone, or a
// phone set to UTC, sees the same day the owner meant.
// No imports, so it is safe in browser code, server functions and tests.

/** This device's IANA time zone (e.g. "America/Los_Angeles"), or null. */
export function deviceTimeZone(): string | null {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return tz && isValidTimeZone(tz) ? tz : null;
  } catch {
    return null;
  }
}

/** True when the runtime knows this IANA zone name. */
export function isValidTimeZone(tz: string | null | undefined): tz is string {
  if (!tz || typeof tz !== "string") return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** The calendar date (YYYY-MM-DD) at `now` in `tz`; the device's own date when
 *  the zone is missing or unknown. */
export function dateInTimeZone(tz: string | null | undefined, now: Date = new Date()): string {
  if (isValidTimeZone(tz)) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
    }).formatToParts(now);
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
    const y = get("year"), m = get("month"), d = get("day");
    if (/^\d{4}$/.test(y) && /^\d{2}$/.test(m) && /^\d{2}$/.test(d)) return `${y}-${m}-${d}`;
  }
  const p = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

function dayNumber(iso: string | null | undefined): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  return m ? Math.round(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86_400_000) : null;
}

export type SitPhase =
  | { kind: "before"; daysUntilStart: number }
  | { kind: "during"; day: number; total: number; daysLeft: number }
  | { kind: "lastDay"; day: number; total: number }
  | { kind: "after" }
  | { kind: "unknown" };

/** Where `today` falls in a sit (all YYYY-MM-DD calendar days). "lastDay" is
 *  ONLY the end date itself; any later day is "after". */
export function sitPhase(today: string, start: string | null | undefined, end: string | null | undefined): SitPhase {
  const t = dayNumber(today), s = dayNumber(start), e = dayNumber(end);
  if (t == null || s == null || e == null || e < s) return { kind: "unknown" };
  if (t < s) return { kind: "before", daysUntilStart: s - t };
  if (t > e) return { kind: "after" };
  const day = t - s + 1;
  const total = e - s + 1;
  if (t === e) return { kind: "lastDay", day, total };
  return { kind: "during", day, total, daysLeft: e - t };
}
