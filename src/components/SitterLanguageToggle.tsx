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

  return (
    <div
      role="group"
      aria-label={i18n.t("sitter.lang.aria", "Change language")}
      className="flex shrink-0 items-center overflow-hidden rounded-full border border-[#cfe0d4] bg-white text-[11px] font-semibold"
    >
      {(["en", "nl"] as const).map((loc) => {
        const active = current === loc;
        return (
          <button
            key={loc}
            type="button"
            onClick={() => choose(loc)}
            aria-pressed={active}
            className={`px-2 py-1 leading-none transition ${active ? "bg-[#1a3d2e] text-white" : "text-[#2d6a4f]"}`}
          >
            {loc.toUpperCase()}
          </button>
        );
      })}
    </div>
  );
}
