// The language the app is currently rendering in, for code that formats text
// outside React's t() — dates mostly. Reads the react-i18next default instance
// (globalI18n in ./i18n) without importing it, so light modules like dates.ts
// don't pull the catalogs in. "en" until the owner locale is applied, and
// always "en" while OWNER_I18N_ENABLED is false.

import i18next from "i18next";
import { DEFAULT_LOCALE, isLocale, type Locale } from "./config";

export function appLocale(): Locale {
  const l = i18next.language;
  return isLocale(l) ? l : DEFAULT_LOCALE;
}
