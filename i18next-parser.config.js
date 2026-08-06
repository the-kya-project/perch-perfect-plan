// Extraction config for i18next-parser.
//
// Scans the code for t("key", "English default") calls and (re)generates the
// English SOURCE catalog, src/locales/en.jsonc. The Dutch catalog is NOT managed
// here — it is produced by scripts/i18n-translate.mjs so it can carry the
// English-as-comment lines and the hash-based change detection. Keeping nl out
// of `locales` means the parser never touches it.
//
//   npm run i18n:extract   → rewrite en.jsonc from the code
//   npm run i18n:check      → CI: fail if en.jsonc is out of sync with the code
export default {
  locales: ["en"],
  defaultNamespace: "translation",
  // Flat literal keys, matching the runtime (keySeparator/nsSeparator off).
  keySeparator: false,
  namespaceSeparator: false,
  input: ["src/**/*.{ts,tsx}"],
  output: "src/locales/$LOCALE.jsonc",
  sort: true,
  // Drop keys no longer present in the code (keeps the catalog honest).
  keepRemoved: false,
  // Use the inline second argument of t(key, "English") as the value.
  useKeysAsDefaultValue: false,
  createOldCatalogs: false,
  indentation: 2,
};
