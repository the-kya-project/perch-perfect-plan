// Owner-app language: which locale the global instance renders in, and saving
// the owner's choice. profiles.locale is the single source of truth — emails
// already read it — so the in-app language and email language never disagree.
//
// Everything here is a no-op while OWNER_I18N_ENABLED is false.
//
// Only ever called from effects / event handlers, never during render. That
// alone doesn't keep public SSR pages safe: the root's effects run before each
// route's subtree has hydrated, so a switch here used to reach a page that was
// still hydrating (#418/#422, Oct 2026). Those pages hydrate against
// hydrationI18n instead, and RootComponent hands over to globalI18n afterwards.

import { supabase } from "@/integrations/supabase/client";
import { globalI18n } from "./i18n";
import { OWNER_I18N_ENABLED, isLocale, pickLocale, type Locale } from "./config";

/** Render the owner app in `saved` (profiles.locale), or the browser language
 *  when there's no saved choice (signed out, or not captured yet). */
export function applyOwnerLocale(saved: string | null | undefined): void {
  if (!OWNER_I18N_ENABLED || typeof window === "undefined") return;
  const locale: Locale = isLocale(saved) ? saved : pickLocale(navigator.language);
  if (globalI18n.language !== locale) void globalI18n.changeLanguage(locale);
  document.documentElement.lang = locale;
}

/** Save the owner's language choice and switch to it. Throws if the row
 *  didn't change — an RLS-blocked UPDATE returns no error, just zero rows. */
export async function saveOwnerLocale(userId: string, locale: Locale): Promise<void> {
  const { data, error } = await supabase
    .from("profiles")
    .update({ locale } as never)
    .eq("id", userId)
    .select("locale")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Couldn't save your language. Please try again.");
  applyOwnerLocale(locale);
}

/** The language the app is rendering in right now, normalized to exactly a
 *  supported locale ("nl-BE" → "nl", anything non-Dutch → "en"). Sent as
 *  user_metadata.locale on email signUp so the Supabase "Confirm signup"
 *  template can branch on {{ .Data.locale }} before profiles.locale exists. */
export function currentLocale(): Locale {
  return pickLocale(globalI18n.language);
}
