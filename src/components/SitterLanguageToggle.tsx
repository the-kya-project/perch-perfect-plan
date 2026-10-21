import { useTranslation } from "react-i18next";
import { sitterI18n, writeSitterOverride, pickLocale, type Locale } from "@/lib/i18n";

// Manual EN/NL switch in the sitter chrome. Detection (browser language) is the
// default; this is the override for when detection is wrong. The choice is
// persisted per token (localStorage) so it sticks across reloads for this sit,
// and applied synchronously on the next open (see route.tsx SitterRoot).
//
// EN/NL are language CODES, shown verbatim in both languages — not translated.
export function SitterLanguageToggle({ token }: { token: string }) {
  const { i18n } = useTranslation();
  const current: Locale = pickLocale(i18n.language);

  function choose(next: Locale) {
    if (next === current) return;
    writeSitterOverride(token, next);
    void sitterI18n.changeLanguage(next);
  }

  // Darker-forest pill on the forest header; the selected language is lime.
  return (
    <div
      role="group"
      aria-label={i18n.t("sitter.lang.aria", "Change language")}
      className="flex h-11 shrink-0 items-center gap-0.5 rounded-full p-1 text-[13px] font-[700]"
      style={{ background: "#12291f" }}
    >
      {(["en", "nl"] as const).map((loc) => {
        const active = current === loc;
        return (
          <button
            key={loc}
            type="button"
            onClick={() => choose(loc)}
            aria-pressed={active}
            className="grid h-9 min-w-[40px] place-items-center rounded-full px-2.5 leading-none transition"
            style={active ? { background: "#cdeab0", color: "#1a3d2e" } : { color: "#ffffff" }}
          >
            {loc.toUpperCase()}
          </button>
        );
      })}
    </div>
  );
}
