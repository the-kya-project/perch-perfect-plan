// Save the name Sign in with Apple hands over, in the iOS app.
//
// Apple gives the person's name ONCE, on their very first authorization, and
// never again. On the web that's handled for us: Supabase's Apple callback
// reads it and stores full_name/name in user_metadata, which handle_new_user
// copies onto the profile. The iOS app signs in with signInWithIdToken, and the
// ID token carries no name, so without this the name was simply dropped and the
// profile ended up with no name (or, before, the email's local part).
//
// Fills blanks only: a name the person has since typed in Account is never
// overwritten, and a name made from the email address counts as blank.

import { supabase } from "@/integrations/supabase/client";
import { isEmailDerivedName } from "./personName";

export type AppleProfileName = { givenName?: string | null; familyName?: string | null };
type ProfileNames = { first_name: string | null; full_name: string | null; display_name: string | null; email: string | null };

/** The profile columns to set from Apple's name, or null when there's nothing
 *  to add. Pure, for the test. */
export function appleNameUpdate(apple: AppleProfileName | null | undefined, current: ProfileNames | null, authEmail?: string | null) {
  const given = (apple?.givenName ?? "").trim();
  const family = (apple?.familyName ?? "").trim();
  const full = [given, family].filter(Boolean).join(" ");
  if (!full) return null;
  const blank = (v: string | null | undefined) => isEmailDerivedName(v, current?.email, authEmail);
  const update: Partial<ProfileNames> = {};
  if (given && blank(current?.first_name)) update.first_name = given;
  if (blank(current?.full_name)) update.full_name = full;
  if (blank(current?.display_name)) update.display_name = full;
  return Object.keys(update).length ? update : null;
}

/** Best effort and never throws: a failure here must not fail the sign-in. */
export async function saveAppleName(apple: AppleProfileName | null | undefined): Promise<void> {
  try {
    const given = (apple?.givenName ?? "").trim();
    const family = (apple?.familyName ?? "").trim();
    const full = [given, family].filter(Boolean).join(" ");
    if (!full) return; // Not a first authorization, or the person withheld their name.
    const { data: auth } = await supabase.auth.getUser();
    const user = auth.user;
    if (!user) return;
    // Same keys Supabase's web Apple callback writes, so every reader of
    // user_metadata sees one shape whichever way the person signed in.
    await supabase.auth.updateUser({
      data: { full_name: full, name: full, ...(given ? { given_name: given } : {}), ...(family ? { family_name: family } : {}) },
    });
    const { data: current } = await supabase
      .from("profiles")
      .select("first_name, full_name, display_name, email")
      .eq("id", user.id)
      .maybeSingle();
    const update = appleNameUpdate(apple, (current as ProfileNames | null) ?? null, user.email);
    if (update) await supabase.from("profiles").update(update as never).eq("id", user.id);
  } catch (err) {
    console.warn("saveAppleName failed", err);
  }
}
