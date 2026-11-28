// Locale catalogs.
//
// English is bundled inline (Vite `?raw`, parsed synchronously): it's the
// server's language and every page's first render, so it must be there on the
// very first paint with no async load (see src/lib/i18n/i18n.ts for the
// SSR/#418 reasoning).
//
// Every other language is its own chunk, fetched the first time the browser
// needs it (loadLocaleBundle, called through loadLocale in ./i18n). Nothing is
// rendered in another language on the server, so this never affects
// hydration; it only keeps each language out of everyone else's download.
// To add a language: add its three files to LOADERS below.
//
// Namespaces: "translation" is the app catalog; "routine" renders auto-derived
// routine tasks (routine_tasks.derived); "seasonal" is Home's seasonal and
// holiday Today cards (src/lib/seasonalCalendar.ts). The last two stay out of
// the parser-managed "translation" catalog.

import enRaw from "@/locales/en.jsonc?raw";
import routineEnRaw from "@/locales/routine.en.jsonc?raw";
import seasonalEnRaw from "@/locales/seasonal.en.jsonc?raw";
import { parseJsonc } from "./jsonc";
import { DEFAULT_LOCALE, type Locale } from "./config";

export type LocaleBundle = {
  translation: Record<string, unknown>;
  routine: Record<string, unknown>;
  seasonal: Record<string, unknown>;
};

const en: LocaleBundle = {
  translation: parseJsonc(enRaw),
  routine: parseJsonc(routineEnRaw),
  seasonal: parseJsonc(seasonalEnRaw),
};

/** The bundled catalog (English only). */
export const catalogs = { en: en.translation } as const;

/** i18next `resources` for init: the bundled language only. */
export const resources = { en } as const;

const LOADERS: Record<Exclude<Locale, "en">, () => Promise<LocaleBundle>> = {
  nl: async () => {
    const [app, routine, seasonal] = await Promise.all([
      import("@/locales/nl.jsonc?raw"),
      import("@/locales/routine.nl.jsonc?raw"),
      import("@/locales/seasonal.nl.jsonc?raw"),
    ]);
    return { translation: parseJsonc(app.default), routine: parseJsonc(routine.default), seasonal: parseJsonc(seasonal.default) };
  },
};

/** Fetch and parse a language's catalogs. English resolves at once. */
export function loadLocaleBundle(locale: Locale): Promise<LocaleBundle> {
  if (locale === DEFAULT_LOCALE) return Promise.resolve(en);
  return LOADERS[locale as Exclude<Locale, "en">]();
}
