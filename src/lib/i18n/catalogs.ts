// Locale catalogs, bundled inline as i18next `resources`.
//
// Imported as raw strings (Vite `?raw`, no plugin) and parsed synchronously, so
// the active catalog is available on the very first render with no async load —
// this is what lets the sitter surface render Dutch immediately with no
// flash-of-English (see src/lib/i18n/i18n.ts for the SSR/#418 reasoning).

import enRaw from "@/locales/en.jsonc?raw";
import nlRaw from "@/locales/nl.jsonc?raw";
import routineEnRaw from "@/locales/routine.en.jsonc?raw";
import routineNlRaw from "@/locales/routine.nl.jsonc?raw";
import { parseJsonc } from "./jsonc";

export const catalogs = {
  en: parseJsonc(enRaw),
  nl: parseJsonc(nlRaw),
} as const;

// The "routine" namespace renders auto-derived routine tasks (checklist) in the
// reader's language from routine_tasks.derived. Kept a separate namespace so the
// keys stay out of the parser-managed "translation" catalog.
export const routineCatalogs = {
  en: parseJsonc(routineEnRaw),
  nl: parseJsonc(routineNlRaw),
} as const;

export const resources = {
  en: { translation: catalogs.en, routine: routineCatalogs.en },
  nl: { translation: catalogs.nl, routine: routineCatalogs.nl },
} as const;
