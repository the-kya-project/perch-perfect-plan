import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Check, Plus, Search, X } from "lucide-react";
import { CHOP_COMMON, normalize, searchChopIngredients } from "@/lib/chopIngredients";
import { chopIngredientLabel } from "./foodLabels";

/**
 * Homemade chop ingredients: a row of common picks, a search over the larger
 * bird-safe list, and a way to add anything else. Picks save to the ingredient
 * list (fresh_foods); typed extras go to "Other ingredients" (fresh_foods_other).
 * Searching a food that isn't safe, or that's on the bird's never-feed list,
 * shows a warning instead of offering to add it.
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
  const otherParts = other.split(",").map((s) => s.trim()).filter(Boolean);
  // Offer "Add …" for something not on the list (and not already added): when
  // nothing matches, or once a longer word still isn't an exact match — not
  // while "ap" is on its way to "apple".
  const exact = result.matches.some((en) => normalize(label(en)) === normalize(typed) || normalize(en) === normalize(typed));
  const longEnough = result.matches.length === 0 ? typed.length >= 2 : typed.length >= 4;
  const canAddTyped = longEnough && !result.warning && !exact && !otherParts.some((p) => normalize(p) === normalize(typed));
  const picked = ingredients.filter((en) => !(CHOP_COMMON as readonly string[]).includes(en));

  function pick(en: string) {
    if (!isOn(en)) onToggle(en);
    setQuery("");
  }
  function addTyped() {
    onOtherChange([...otherParts, typed].join(", "));
    setQuery("");
  }

  return (
    <div>
      <p className="mb-1.5 text-xs font-medium text-[#5f5e5a]">{t("foodEditor.whatsInItSearch", "What's in it? Tap the common ones or search for more.")}</p>

      {/* Common picks */}
      <div className="flex flex-wrap gap-1.5">
        {CHOP_COMMON.map((en) => {
          const on = isOn(en);
          return (
            <button
              key={en}
              type="button"
              aria-pressed={on}
              onClick={() => onToggle(en)}
              className={
                "min-h-[40px] rounded-full px-3 text-xs font-medium transition " +
                (on ? "bg-[#1a3d2e] text-white" : "border border-[#c8bfa6] bg-white text-[#1a3d2e]")
              }
            >
              {on && <Check className="mr-1 inline size-3" aria-hidden="true" />}
              {label(en)}
            </button>
          );
        })}
      </div>

      {/* Search */}
      <div className="relative mt-2.5">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#5f5e5a]" aria-hidden="true" />
        <input
          className={`${fieldClass} pl-9`}
          type="search"
          aria-label={t("foodEditor.searchIngredients", "Search ingredients")}
          placeholder={t("foodEditor.searchIngredientsPlaceholder", "Search ingredients (e.g. kale, mango)")}
          value={query}
          maxLength={60}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            if (result.matches[0]) pick(result.matches[0]);
            else if (canAddTyped) addTyped();
          }}
        />
      </div>
      {typed && (
        <div className="mt-1.5 overflow-hidden rounded-xl border border-[#c8bfa6] bg-white">
          {result.matches.map((en) => {
            const on = isOn(en);
            return (
              <button
                key={en}
                type="button"
                onClick={() => (on ? onToggle(en) : pick(en))}
                className="flex min-h-[44px] w-full items-center justify-between gap-2 border-b border-[#efe9da] px-3 text-left text-sm text-[#1a3d2e] last:border-b-0"
              >
                <span>{label(en)}</span>
                {on ? <Check className="size-4 shrink-0 text-[#2d6a4f]" aria-label={t("foodEditor.added", "Added")} /> : <Plus className="size-4 shrink-0 text-[#2d6a4f]" aria-hidden="true" />}
              </button>
            );
          })}
          {result.warning && (
            <p role="status" className="flex items-start gap-2 bg-[#f6e7c4] px-3 py-2.5 text-sm text-[#854f0b]">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {result.warning.onNeverList
                ? t("foodEditor.onNeverFeedList", "{{food}} is on the never-feed list, so it can't go in the chop.", { food: result.warning.food })
                : t("foodEditor.notSafeForBirds", "{{food}} isn't safe for birds, so it can't go in the chop.", { food: result.warning.food })}
            </p>
          )}
          {canAddTyped && (
            <button
              type="button"
              onClick={addTyped}
              className="flex min-h-[44px] w-full items-center gap-2 px-3 text-left text-sm font-medium text-[#2d6a4f]"
            >
              <Plus className="size-4 shrink-0" aria-hidden="true" />
              {t("foodEditor.addTypedIngredient", "Add “{{food}}”", { food: typed })}
            </button>
          )}
        </div>
      )}

      {/* Picked from search (common picks show in their row above) */}
      {picked.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {picked.map((en) => (
            <span key={en} className="inline-flex min-h-[40px] items-center gap-1 rounded-full bg-[#1a3d2e] pl-3 pr-1 text-xs font-medium text-white">
              {label(en)}
              <button
                type="button"
                onClick={() => onToggle(en)}
                aria-label={t("setupUi.removeItem", "Remove {{item}}", { item: label(en) })}
                className="grid size-8 place-items-center rounded-full"
              >
                <X className="size-3.5" aria-hidden="true" />
              </button>
            </span>
          ))}
        </div>
      )}

      <input
        className={`mt-2.5 ${fieldClass}`}
        aria-label={t("foodEditor.otherIngredients", "Other ingredients")}
        placeholder={t("foodEditor.otherIngredientsPlaceholder", "Other ingredients (free text)")}
        value={other}
        maxLength={300}
        onChange={(e) => onOtherChange(e.target.value)}
      />
    </div>
  );
}
