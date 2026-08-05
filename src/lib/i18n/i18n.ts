// The i18n runtime: two instances, deliberately.
//
// WHY TWO INSTANCES
// -----------------
// The sitter view is built largely from components that the OWNER app also
// renders (CareSheetView, SitterDashboard, SitterOnboarding, …). If translation
// were driven by one global language, an owner on a Dutch browser would flip
// those shared components to Dutch — an owner-facing regression, and a Phase-2
// concern leaking into Phase 1.
//
//   • `globalI18n` is the react-i18next DEFAULT instance, pinned to English and
//     never switched. Everything OUTSIDE a sitter route (the whole owner app,
//     any SSR) reads this, so shared components render byte-identically to
//     pre-i18n. This is what makes owner output provably unchanged.
//   • `sitterI18n` is a separate instance provided ONLY around the sitter
//     subtree (see route.tsx's <I18nextProvider>). Its language is resolved
//     from the sitter's browser / manual toggle. Owner code never sees it.
//
// HYDRATION / React #418
// ----------------------
// Every sitter route is `ssr: false`. The server renders only the shell + a
// TEXT-FREE skeleton for the sitter subtree; it resolves no locale and emits no
// translated markup. So there is no server-vs-client markup to diverge — the
// classic "server picks lang from Accept-Language, client from navigator.language"
// mismatch cannot occur, because the server renders none of it. On the client,
// resources are inline and `lng` is set synchronously before the sitter content
// renders, and `useSuspense: false` guarantees `t()` never suspends. `<html lang>`
// stays server-rendered "en" and is corrected by a DOM effect outside React's
// tree (see route.tsx), which cannot cause a hydration mismatch.

import i18next, { type i18n as I18nInstance } from "i18next";
import { initReactI18next } from "react-i18next";
import { resources } from "./catalogs";
import { DEFAULT_LOCALE, SUPPORTED_LOCALES, pickLocale, isLocale, type Locale } from "./config";

const commonInit = {
  resources,
  fallbackLng: DEFAULT_LOCALE,
  supportedLngs: SUPPORTED_LOCALES as unknown as string[],
  // Flat, literal keys like "sitter.today.dueNow" — not nested lookups. Turning
  // off the separators keeps the catalogs a plain key→value map that a
  // non-technical person can scan, and lets keys contain dots/colons safely.
  keySeparator: false as const,
  nsSeparator: false as const,
  // React escapes on render; double-escaping would corrupt apostrophes etc.
  interpolation: { escapeValue: false },
  // Synchronous reads, no Suspense boundary — required for the #418 guarantee.
  react: { useSuspense: false } as const,
};

// ---- Global default instance: English, forever. Owner app + SSR read this. ----
// initReactI18next is applied ONLY here, so this is react-i18next's default
// instance (what useTranslation() resolves to with no <I18nextProvider>).
if (!i18next.isInitialized) {
  void i18next.use(initReactI18next).init({ ...commonInit, lng: DEFAULT_LOCALE });
}
export const globalI18n = i18next;

// ---- Sitter instance: scoped to the sitter subtree via <I18nextProvider>. ----
// NOT wired with initReactI18next (that would steal the global default and flip
// the owner app). Components under the provider read it from context.
export const sitterI18n: I18nInstance = i18next.createInstance();

/** Idempotently bring the sitter instance to `locale`. `init` is synchronous
 *  here (inline resources, no backend/detector), so `t()` works immediately on
 *  the same tick — no async gap, no flash. */
export function ensureSitterI18n(locale: Locale): I18nInstance {
  if (!sitterI18n.isInitialized) {
    void sitterI18n.init({ ...commonInit, lng: locale });
  } else if (sitterI18n.language !== locale) {
    void sitterI18n.changeLanguage(locale);
  }
  return sitterI18n;
}

// ---- Per-token manual override (localStorage), highest-priority signal. ----
const overrideKey = (token: string) => `kya_sitter_lang_${token}`;

export function readSitterOverride(token: string): Locale | null {
  try {
    const v = localStorage.getItem(overrideKey(token));
    return isLocale(v) ? v : null;
  } catch {
    return null;
  }
}

export function writeSitterOverride(token: string, locale: Locale): void {
  try {
    localStorage.setItem(overrideKey(token), locale);
  } catch {
    /* private-mode / quota: fall back to detection next load, no-op */
  }
}

/** Resolution precedence: manual toggle (per token) → browser detection → 'en'.
 *  Client-only detection is deliberate — resolving locale on the server would
 *  reintroduce the Accept-Language vs navigator.language divergence (#418). */
export function resolveSitterLocale(token?: string): Locale {
  if (typeof window === "undefined") return DEFAULT_LOCALE;
  if (token) {
    const override = readSitterOverride(token);
    if (override) return override;
  }
  return pickLocale(navigator.language);
}
