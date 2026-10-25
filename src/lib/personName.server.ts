// Server-side name lookup for emails that name someone to another person
// ("<owner> invited you", "<owner>'s household"). Real names only: see
// personName.ts for why a name made from an email address never counts.
import { realFullName } from "./personName";

/** A user's real display name, or null (callers supply their own fallback,
 *  e.g. "A Kya & Co. owner"). Profile first, then the auth metadata; anything
 *  equal to the part of their address before the @ is skipped. */
export async function realPersonName(sb: any, userId: string): Promise<string | null> {
  let profile: { display_name?: string | null; full_name?: string | null; email?: string | null } | null = null;
  try {
    const { data } = await sb.from("profiles").select("display_name, full_name, email").eq("id", userId).maybeSingle();
    profile = data ?? null;
  } catch { /* fall through to auth */ }
  if (profile?.email) {
    const fromProfile = realFullName([profile.display_name, profile.full_name], profile.email);
    if (fromProfile) return fromProfile;
  }
  let authEmail: string | null = null;
  let meta: Record<string, unknown> = {};
  try {
    const { data: u } = await sb.auth.admin.getUserById(userId);
    authEmail = u?.user?.email ?? null;
    meta = u?.user?.user_metadata ?? {};
  } catch { /* profile only */ }
  const str = (v: unknown) => (typeof v === "string" ? v : null);
  return realFullName(
    [profile?.display_name, profile?.full_name, str(meta.display_name), str(meta.full_name), str(meta.name)],
    profile?.email,
    authEmail,
  );
}
