// Pure helpers for Community profiles, so scripts/flock-shell.test.ts can pin
// them. Flock code only (CLAUDE.md, Flock safety rules).

/** First name + last initial ("Brittany K."), from what the care profile
 *  knows. Never an email. Falls back to "Member". */
export function defaultDisplayName(firstName: string | null | undefined, fullName: string | null | undefined): string {
  const full = (fullName ?? "").trim().split(/\s+/).filter(Boolean);
  const first = (firstName ?? "").trim() || full[0] || "";
  if (!first) return "Member";
  const last = full.length > 1 ? full[full.length - 1] : "";
  const initial = last && last.toLowerCase() !== first.toLowerCase() ? ` ${last[0]!.toUpperCase()}.` : "";
  return `${first}${initial}`.slice(0, 50);
}

/** A first name to greet with: the care profile's first name, else the first
 *  word of the display name. */
export function greetingName(firstName: string | null | undefined, displayName: string | null | undefined): string {
  return (firstName ?? "").trim() || (displayName ?? "").trim().split(/\s+/)[0] || "";
}

/** True when a stored display name was set automatically (a founding claim
 *  copies the full name), so setup may replace it with the default. */
export function isAutomaticDisplayName(current: string | null | undefined, fullName: string | null | undefined): boolean {
  const c = (current ?? "").trim();
  return !c || c === "Founding member" || c === (fullName ?? "").trim();
}

/** "8 members · meetups unlock at 15"; past 15, just the count. */
export const MEETUP_THRESHOLD = 15;
export function memberCountLine(n: number): string {
  const members = `${n} ${n === 1 ? "member" : "members"}`;
  return n < MEETUP_THRESHOLD ? `${members} · meetups unlock at ${MEETUP_THRESHOLD}` : members;
}

export type EntitlementRow = {
  plan: string;
  status: string;
  source: string;
  starts_at: string | null;
  current_period_end: string | null;
  free_until: string | null;
};

/** "Jan 5, 2027" in UTC. */
export function day(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

function current(e: EntitlementRow, now: number): boolean {
  if (!e.starts_at) return false;
  const s = new Date(e.starts_at).getTime();
  const end = e.current_period_end ? new Date(e.current_period_end).getTime() : Infinity;
  return s <= now && now < end;
}

/**
 * What "Membership and billing" says, from the member's own entitlements.
 * Founding wins (it's the one with a price), then a running grant, then one
 * waiting to start. No payment actions here yet.
 */
export function membershipSummary(rows: EntitlementRow[], isAdmin: boolean, now: Date = new Date()): { title: string; line: string } {
  const t = now.getTime();
  const live = rows.filter((e) => !(e.status === "canceled" && e.current_period_end && new Date(e.current_period_end).getTime() <= t));
  const founding = live.find((e) => e.plan === "founding");
  if (founding) {
    if (!founding.starts_at) return { title: "Founding member", line: "Founding · $15/mo · first 6 months free once the Flock opens" };
    const free = founding.free_until ?? founding.current_period_end;
    return { title: "Founding member", line: free ? `Founding · $15/mo · free until ${day(free)}` : "Founding · $15/mo" };
  }
  const order = (e: EntitlementRow) => (current(e, t) ? 0 : e.starts_at ? 1 : 2);
  const best = [...live].filter((e) => e.plan !== "app_premium" || live.every((x) => x.plan === "app_premium"))
    .sort((a, b) => order(a) - order(b))[0];
  if (best) {
    const what = best.source === "gift"
      ? best.plan === "app_premium" ? "Gift · app premium" : "Gift membership"
      : best.plan === "comp" ? "Complimentary membership"
      : best.plan === "chapter_lead" ? "Chapter lead"
      : best.plan === "app_premium" ? "App premium"
      : "Membership";
    if (!best.starts_at) return { title: what, line: `${what} · starts when the Flock opens` };
    if (!current(best, t) && new Date(best.starts_at).getTime() > t) return { title: what, line: `${what} · starts ${day(best.starts_at)}` };
    return { title: what, line: best.current_period_end ? `${what} · until ${day(best.current_period_end)}` : what };
  }
  return isAdmin ? { title: "Admin access", line: "Admin access · no membership needed" } : { title: "No membership", line: "No membership yet" };
}
