// i18n configuration shared by the runtime and the tooling.
//
// Phase 1 ships English + Dutch, but everything here is written for N locales:
// adding a language is a new entry in SUPPORTED_LOCALES plus a locale catalog —
// never a code change here or elsewhere.

export const SUPPORTED_LOCALES = ["en", "nl"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

/** The app's source language. The global i18n instance is pinned to this and
 *  never switches, so owner-app output is byte-identical to pre-i18n. */
export const DEFAULT_LOCALE: Locale = "en";

/** Map a BCP-47 tag (e.g. navigator.language "nl-NL") to a supported locale.
 *  Anything we don't ship falls back to the default — never throws. */
export function pickLocale(input: string | null | undefined): Locale {
  const tag = (input ?? "").trim().toLowerCase();
  if (tag === "nl" || tag.startsWith("nl-")) return "nl";
  return DEFAULT_LOCALE;
}

export function isLocale(v: unknown): v is Locale {
  return typeof v === "string" && (SUPPORTED_LOCALES as readonly string[]).includes(v);
}
