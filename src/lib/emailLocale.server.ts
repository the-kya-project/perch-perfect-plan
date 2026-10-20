// Resolve the language for a transactional email, server-side.
//
// Group 1 (recipient has an account) → the recipient's profiles.locale.
// Group 2 (account-less invitee) → the SENDER's profiles.locale (the only
// reasonable heuristic; the recipient has no record yet).
//
// Either way it comes down to "the locale stored on some user's profile row",
// which is what this reads. Null/unknown/any error → English. A locale lookup
// must NEVER fail a send.

import { emailT, toLocale } from "./i18n/emailI18n.server";
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

/** Human list in the email's language: "Willow", "Willow and Moxie",
 *  "Willow, Moxie, and Kiwi". `empty` is the already-translated phrase used
 *  when there are no names. English output is byte-identical to the old
 *  hardcoded joiners. */
export function joinNamesLocalized(names: string[], locale: unknown, empty: "bird" | "birds"): string {
  const t = emailT(locale);
  const n = names.filter(Boolean);
  if (n.length === 0) return empty === "bird" ? t("email.common.yourBird") : t("email.common.yourBirds");
  if (n.length === 1) return n[0];
  if (n.length === 2) return t("email.common.listPair", { a: n[0], b: n[1] });
  return t("email.common.listMany", { head: n.slice(0, -1).join(t("email.common.listSep")), last: n[n.length - 1] });
}

/** Fallback sender labels for when a profile has no name or email. */
export function fallbackOwnerLabel(locale: unknown): string {
  return emailT(locale)("email.common.anOwner");
}
export function fallbackSomeoneLabel(locale: unknown): string {
  return emailT(locale)("email.common.someone");
}
