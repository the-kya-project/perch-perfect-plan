// Shared household-member display helpers. Pair with resolveHouseholdNames()
// (src/lib/home.functions.ts), which resolves member user_ids -> {name, email}
// via the service role (the authenticated client can't read other users'
// profiles — profiles RLS is self-only, which is why members used to render as
// the generic "Household member").

export type MemberIdentity = { name?: string | null; email?: string | null };

/** Real name, else invited email, else "Pending invite" — never a generic placeholder. */
export function memberDisplayName(m: MemberIdentity | null | undefined): string {
  const name = (m?.name ?? "").trim();
  if (name) return name;
  const email = (m?.email ?? "").trim();
  if (email) return email;
  return "Pending invite";
}

/** Initials from the resolved display string (email → first letter of local part). */
export function memberInitials(display: string): string {
  const s = (display ?? "").trim();
  if (!s || s === "Pending invite") return "?";
  if (s.includes("@")) return s[0]!.toUpperCase();
  const parts = s.split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

/** First name for the terse "in charge" eyebrow (email/single-word pass through). */
export function firstName(display: string): string {
  return (display ?? "").trim().split(/\s+/)[0] || display;
}
