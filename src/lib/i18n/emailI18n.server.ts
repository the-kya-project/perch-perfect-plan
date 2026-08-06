// Server-ONLY i18n for transactional emails.
//
// Emails render server-side (server functions + cron routes), where the
// client's navigator.language locale resolution doesn't exist and React's
// useTranslation() is unavailable. This module is a standalone i18next instance
// with a dedicated `emails` namespace, loaded from server-only jsonc catalogs.
//
// WHY THIS IS SEPARATE FROM src/lib/i18n/i18n.ts
// ----------------------------------------------
//  • BUNDLE SIZE: the email catalogs (long-form HTML prose × 15 templates)
//    must NEVER ship to the browser. This file and the emails.*.jsonc it imports
//    are referenced only from server code, so Vite keeps them out of the client
//    bundle. The client `translation` catalog (en.jsonc) is untouched.
//  • PARSER: the translator is exported as `emailT` (NOT `t`), so i18next-parser
//    (functions:['t']) never extracts these keys into the client en.jsonc.
//
// English is always the fallback (fallbackLng), so a missing/unknown locale — or
// a not-yet-translated key — sends in English rather than failing.

import i18next, { type TFunction } from "i18next";
import { parseJsonc } from "./jsonc";
import { DEFAULT_LOCALE, SUPPORTED_LOCALES, isLocale, type Locale } from "./config";
// ?raw is a build-time transform (runtime-agnostic), same mechanism the sitter
// catalog uses — resolves in the Nitro server bundle. Parsed synchronously.
import emailEnRaw from "@/locales/emails.en.jsonc?raw";
import emailNlRaw from "@/locales/emails.nl.jsonc?raw";

const EMAIL_NS = "emails" as const;

const emailResources = {
  en: { [EMAIL_NS]: parseJsonc(emailEnRaw) },
  nl: { [EMAIL_NS]: parseJsonc(emailNlRaw) },
} as const;

// A dedicated instance — NOT wired with initReactI18next (that would hijack the
// react-i18next default and flip the owner app). Never switched globally; each
// send reads a fixed-language T via getFixedT.
const emailI18n = i18next.createInstance();
void emailI18n.init({
  resources: emailResources,
  fallbackLng: DEFAULT_LOCALE,
  supportedLngs: SUPPORTED_LOCALES as unknown as string[],
  ns: [EMAIL_NS],
  defaultNS: EMAIL_NS,
  // Flat literal keys ("email.dailyLog.subject"), matching the app catalog.
  keySeparator: false,
  nsSeparator: false,
  // Values are pre-escaped per-field at the call site EXACTLY as before i18n, so
  // escaping here would double-escape and change bytes. Keep it off; English
  // output stays byte-identical.
  interpolation: { escapeValue: false },
  // Synchronous init with inline resources — a fixed-T works on the same tick.
  initImmediate: false,
});

/** Normalize any stored/detected value to a supported locale; unknown → English. */
export function toLocale(v: unknown): Locale {
  return isLocale(v) ? v : DEFAULT_LOCALE;
}

/**
 * A fixed-language translator for the emails namespace. Pass a stored
 * profiles.locale (or anything); it normalizes and falls back to English. Never
 * throws — the worst case is English output.
 */
export function emailT(locale: unknown): TFunction {
  return emailI18n.getFixedT(toLocale(locale), EMAIL_NS);
}
