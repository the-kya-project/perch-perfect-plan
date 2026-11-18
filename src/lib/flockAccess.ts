// How an entitlement's dates read on the admin pages (/admin/founding,
// /admin/gifts). Pure, so scripts/flock-shell.test.ts pins it. The rules that
// decide the dates live in the database (20261107120000_flock_entitlement_grants).

export type AccessDates = {
  entitlement_id: string | null;
  status: string | null;
  starts_at: string | null;
  ends_at: string | null;
};

/** "Jan 5, 2027" in UTC, so every admin sees the same day. */
export function accessDay(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

/** Start and end cells, plus a short state for the row. */
export function accessCells(a: AccessDates | undefined, now: Date = new Date()): { starts: string; ends: string; state: string } {
  if (!a || !a.entitlement_id) return { starts: "—", ends: "—", state: "No entitlement" };
  if (!a.starts_at) return { starts: "When the Flock opens", ends: "—", state: "Waiting for opening day" };
  const starts = accessDay(a.starts_at);
  const ends = a.ends_at ? accessDay(a.ends_at) : "No end date";
  const start = new Date(a.starts_at).getTime();
  const end = a.ends_at ? new Date(a.ends_at).getTime() : Infinity;
  const t = now.getTime();
  if (a.status === "canceled" && end <= t) return { starts, ends, state: "Ended" };
  if (t < start) return { starts, ends, state: "Scheduled" };
  if (t >= end) return { starts, ends, state: "Expired" };
  return { starts, ends, state: a.status === "trialing" ? "Active (free months)" : "Active" };
}
