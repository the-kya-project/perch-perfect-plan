import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Plus, Search, X } from "lucide-react";
import { CHOP_COMMON, normalize, searchChopIngredients } from "@/lib/chopIngredients";
import { chopIngredientLabel } from "./foodLabels";
import { SERIF } from "@/components/setup/controls";

/**
 * Homemade chop ingredients, in one place: every ingredient as a chip (picks
 * from the list save to fresh_foods; ones typed as written save to "Other
 * ingredients", fresh_foods_other, and show as dashed chips), a search to add
 * more, then the common picks not added yet. Searching a food that isn't safe,
 * or that's on the bird's never-feed list, shows a warning instead of adding it.
 */
export function ChopIngredientPicker({
  ingredients,
  onToggle,
  other,
  onOtherChange,
  neverFeed,
  fieldClass,
}: {
  ingredients: string[];
  onToggle: (en: string) => void;
  other: string;
  onOtherChange: (v: string) => void;
  neverFeed: string[];
  fieldClass: string;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const label = (en: string) => chopIngredientLabel(t, en);
  const isOn = (en: string) => ingredients.some((x) => x.toLowerCase() === en.toLowerCase());
  const result = useMemo(() => searchChopIngredients(query, (en) => chopIngredientLabel(t, en), neverFeed), [query, neverFeed, t]);
  const typed = query.trim();
  // Typed extras live in one comma-separated text field.
  const extras = other.split(",").map((s) => s.trim()).filter(Boolean);
  const suggestions = result.matches.filter((en) => !isOn(en));
  const alreadyThere =
    ingredients.some((en) => normalize(label(en)) === normalize(typed) || normalize(en) === normalize(typed)) ||
    extras.some((p) => normalize(p) === normalize(typed));
  const exactMatch = result.matches.find((en) => normalize(label(en)) === normalize(typed) || normalize(en) === normalize(typed));
  // The last suggestion is always "Add … as written", unless it's unsafe or already there.
  const canAddTyped = typed.length >= 1 && !result.warning && !alreadyThere && !exactMatch;
  const commonLeft = CHOP_COMMON.filter((en) => !isOn(en));
  const count = ingredients.length + extras.length;

  function pick(en: string) {
    if (!isOn(en)) onToggle(en);
    setQuery("");
  }
  function addTyped() {
    onOtherChange([...extras, typed].join(", "));
    setQuery("");
  }
  function removeExtra(i: number) {
    onOtherChange(extras.filter((_, j) => j !== i).join(", "));
  }

  return (
    <div className="flex flex-col gap-3" style={{ color: "#1a3d2e" }}>
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="m-0 text-[20px] font-[700] leading-[1.2]" style={{ fontFamily: SERIF }}>
          {t("foodEditor.whatsInIt", "What's in it")}
        </h3>
        <span className="shrink-0 text-[13px] font-[700] text-[#5f5e5a]">{t("foodEditor.nAdded", "{{count}} added", { count })}</span>
      </div>

      {count > 0 && (
        <div className="flex flex-wrap gap-2">
          {ingredients.map((en) => (
            <span key={en} className="inline-flex min-h-[44px] items-center gap-1 rounded-full bg-[#1a3d2e] pl-3.5 pr-0 text-[14px] font-[500] text-white">
              {label(en)}
              <button type="button" onClick={() => onToggle(en)} aria-label={t("setupUi.removeItem", "Remove {{item}}", { item: label(en) })} className="grid size-11 place-items-center rounded-full">
                <X className="size-4" aria-hidden="true" />
              </button>
            </span>
          ))}
          {extras.map((x, i) => (
            <span key={`${x}-${i}`} className="inline-flex min-h-[44px] items-center gap-1 rounded-full border-2 border-dashed border-[#1a3d2e] bg-white pl-3.5 pr-0 text-[14px] font-[500]">
              {x}
              <button type="button" onClick={() => removeExtra(i)} aria-label={t("setupUi.removeItem", "Remove {{item}}", { item: x })} className="grid size-11 place-items-center rounded-full">
                <X className="size-4" aria-hidden="true" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Search */}
      <div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-[#5f5e5a]" aria-hidden="true" />
          <input
            className={`${fieldClass} pl-10`}
            type="search"
            aria-label={t("foodEditor.addAnIngredient", "Add an ingredient")}
            placeholder={t("foodEditor.addAnIngredient", "Add an ingredient")}
            value={query}
            maxLength={60}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              if (suggestions[0]) pick(suggestions[0]);
              else if (canAddTyped) addTyped();
            }}
          />
        </div>
        {typed && (suggestions.length > 0 || result.warning || canAddTyped) && (
          <div className="mt-1.5 overflow-hidden rounded-xl border border-[#d5dfd5] bg-white">
            {suggestions.map((en) => (
              <button
                key={en}
                type="button"
                onClick={() => pick(en)}
                className="flex min-h-[44px] w-full items-center justify-between gap-2 border-b border-[#eef2ed] px-3 text-left text-[15px] last:border-b-0"
              >
                <span>{label(en)}</span>
                <Plus className="size-4 shrink-0 text-[#2d6a4f]" aria-hidden="true" />
              </button>
            ))}
            {result.warning && (
              <p role="status" className="m-0 flex items-start gap-2 bg-[#f6e7c4] px-3 py-2.5 text-[14px] text-[#854f0b]">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                {result.warning.onNeverList
                  ? t("foodEditor.onNeverFeedList", "{{food}} is on the never-feed list, so it can't go in the chop.", { food: result.warning.food })
                  : t("foodEditor.notSafeForBirds", "{{food}} isn't safe for birds, so it can't go in the chop.", { food: result.warning.food })}
              </p>
            )}
            {canAddTyped && (
              <button type="button" onClick={addTyped} className="flex min-h-[44px] w-full items-center gap-2 px-3 text-left text-[15px] font-[700] text-[#2d6a4f]">
                <Plus className="size-4 shrink-0" aria-hidden="true" />
                {t("foodEditor.addAsWritten", "Add “{{food}}” as written", { food: typed })}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Common picks not added yet */}
      {commonLeft.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="m-0 text-[13px] font-[700] text-[#5f5e5a]">{t("foodEditor.commonPicks", "Common picks")}</p>
          <div className="flex flex-wrap gap-2">
            {commonLeft.map((en) => (
              <button
                key={en}
                type="button"
                onClick={() => onToggle(en)}
                className="inline-flex min-h-[44px] items-center gap-1 rounded-full border-2 border-[#c9d6c9] bg-white px-3.5 text-[14px] font-[500]"
              >
                <Plus className="size-3.5" strokeWidth={2.6} aria-hidden="true" />
                {label(en)}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
