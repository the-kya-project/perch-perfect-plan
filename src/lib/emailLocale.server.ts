// Resolve the language for a transactional email, server-side.
//
// Group 1 (recipient has an account) → the recipient's profiles.locale.
// Group 2 (account-less invitee) → the SENDER's profiles.locale (the only
// reasonable heuristic; the recipient has no record yet).
//
// Either way it comes down to "the locale stored on some user's profile row",
// which is what this reads. Null/unknown/any error → English. A locale lookup
// must NEVER fail a send.

import { toLocale } from "./i18n/emailI18n.server";
import type { Locale } from "./i18n/config";

/** Read profiles.locale for a user id via a service-role client. Falls back to
 *  English on missing row, null locale, or any error. */
export async function localeForUser(sb: any, userId: string | null | undefined): Promise<Locale> {
  if (!userId) return toLocale(null);
  try {
    const { data } = await sb.from("profiles").select("locale").eq("id", userId).maybeSingle();
    return toLocale((data as { locale?: unknown } | null)?.locale);
  } catch {
    return toLocale(null);
  }
}
