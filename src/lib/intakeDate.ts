// "Came to you" (birds.intake_date) is shown only when the OWNER entered it.
//
// Until 2026-10-21, Add a bird defaulted intake_date to today and saved it for
// every bird, foster or not, while the field was only visible for fosters. So
// many non-foster birds carry their creation day as a "came to you" date nobody
// entered. birds.intake_date_source marks them: 'auto' = set by the app, never
// shown or passed on; 'owner' (or null, for rows from before the marker that
// didn't match the automatic pattern) = shown. The value itself is kept.
//
// past_birds.intake_date_source carries the same marker on handoff keepsakes.

export type IntakeDateSource = "owner" | "auto";

type WithIntake = { intake_date?: string | null; intake_date_source?: string | null } | null | undefined;

/** The intake date to show or pass on, or null when there is none or the app
 *  set it automatically. */
export function ownerIntakeDate(row: WithIntake): string | null {
  const d = (row?.intake_date ?? "").toString().trim();
  if (!d) return null;
  return row?.intake_date_source === "auto" ? null : d;
}

/** The UTC calendar day (YYYY-MM-DD) of a timestamp, shifted by `days`. */
function utcDay(iso: string, days = 0): string {
  const t = new Date(iso).getTime() + days * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

/**
 * The automatic-date rule the backfill migration
 * (20261021185000_intake_date_source.sql) applies, kept here so it's tested.
 * A bird's intake date was set by the app, not the owner, when all hold:
 *  - it isn't a foster now and never became permanent through "foster fail"
 *    (the "Came to you" field is only ever shown for fosters, so a non-foster
 *    owner never saw or entered it);
 *  - the date is the bird's creation day: within one day of created_at's UTC
 *    date (Add a bird used the device's UTC day until 2026-10-19 and its local
 *    day after, which can be a day either side);
 *  - the bird was created before the fix (2026-10-22 UTC, with margin).
 */
export function looksAutoIntake(b: {
  intake_date: string | null;
  created_at: string;
  is_foster: boolean | null;
  became_permanent_on: string | null;
}): boolean {
  if (!b.intake_date || b.is_foster || b.became_permanent_on) return false;
  if (new Date(b.created_at).getTime() >= Date.parse("2026-10-22T00:00:00Z")) return false;
  return b.intake_date >= utcDay(b.created_at, -1) && b.intake_date <= utcDay(b.created_at, 1);
}
