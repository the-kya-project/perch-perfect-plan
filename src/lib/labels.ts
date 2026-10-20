// Human-readable label maps + small formatters for owner-entered care-plan
// data. Used by the sitter care sheet and any sitter-facing summary so raw
// stored values (e.g. "training_only", "tablespoons") never reach the screen.

import type { TFunction } from "i18next";

export const WATER_FREQ_LABELS: Record<string, string> = {
  once: "changed once daily",
  twice: "changed twice daily",
  more: "changed more than twice daily",
};

export const TREATS_FREQ_LABELS: Record<string, string> = {
  daily: "Daily",
  few_per_week: "A few times a week",
  training_only: "Training only",
  rarely: "Rarely",
};

export const OUT_OF_CAGE_LABELS: Record<string, string> = {
  supervised: "Supervised only",
  specific_room: "Specific room only",
  not_while_sitting: "Keep in cage",
};

export const BOWL_WASH_LABELS: Record<string, string> = {
  after_each_fresh: "After every fresh-food serving",
  once_daily: "Once a day",
  twice_daily: "Twice a day",
  every_few_days: "Every few days",
};

export function prettyLabel(value: string | null | undefined, map: Record<string, string>): string {
  if (!value) return "";
  if (map[value]) return map[value];
  // Fallback: snake_case -> sentence case so unknown values never display raw.
  return value.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

const SINGULARIZE: Record<string, string> = {
  tablespoons: "tablespoon",
  cups: "cup",
  grams: "gram",
  scoops: "scoop",
  pieces: "piece",
  teaspoons: "teaspoon",
};

/** Format "1 tablespoon" / "2 tablespoons" — handles fractions ("1/2") and decimals. */
export function formatAmountUnit(amount: string | number | null | undefined, unit: string | null | undefined): string {
  const a = amount == null ? "" : String(amount).trim();
  const u = (unit ?? "").trim();
  if (!a && !u) return "";
  if (!u) return a;
  const n = Number(a.replace(/^([0-9.]+).*$/, "$1"));
  const isOne = a === "1" || n === 1;
  const display = isOne ? (SINGULARIZE[u.toLowerCase()] ?? u) : u;
  return `${a} ${display}`.trim();
}

/** "120 min" → "2 hours"; "60 min" → "1 hour"; falls back to "N min". */
export function formatRemovalMinutes(mins: number | null | undefined): string {
  const m = mins ?? 120;
  if (m % 60 === 0) {
    const h = m / 60;
    return `${h} hour${h === 1 ? "" : "s"}`;
  }
  return `${m} min`;
}

// ---------------------------------------------------------------------------
// Display-time translation.
//
// The maps and formatters above stay English: their values feed stored text
// (feedingSync / the setup wizard compose task titles with formatAmountUnit)
// and existing comparisons. The functions below are for RENDERING only — pass
// the component's `t` (from useTranslation(), so the sitter subtree's own
// instance is honoured). English output is byte-identical to the English
// helpers; unknown stored values fall back to the same sentence-case rule.
// ---------------------------------------------------------------------------


/** Water-change frequency (care_plans.water_frequency). */
export function waterFreqLabel(value: string | null | undefined, t: TFunction): string {
  switch (value) {
    case "once": return t("careLabels.water.once", "changed once daily");
    case "twice": return t("careLabels.water.twice", "changed twice daily");
    case "more": return t("careLabels.water.more", "changed more than twice daily");
  }
  return prettyLabel(value, WATER_FREQ_LABELS);
}

/** Treat frequency (care_plans.treats_frequency). */
export function treatsFreqLabel(value: string | null | undefined, t: TFunction): string {
  switch (value) {
    case "daily": return t("careLabels.treats.daily", "Daily");
    case "few_per_week": return t("careLabels.treats.fewPerWeek", "A few times a week");
    case "training_only": return t("careLabels.treats.trainingOnly", "Training only");
    case "rarely": return t("careLabels.treats.rarely", "Rarely");
  }
  return prettyLabel(value, TREATS_FREQ_LABELS);
}

/** Out-of-cage mode while someone else is caring (care_plans.out_of_cage_mode). */
export function outOfCageLabel(value: string | null | undefined, t: TFunction): string {
  switch (value) {
    case "supervised": return t("careLabels.outOfCage.supervised", "Supervised only");
    case "specific_room": return t("careLabels.outOfCage.specificRoom", "Specific room only");
    case "not_while_sitting": return t("careLabels.outOfCage.notWhileSitting", "Keep in cage");
  }
  return prettyLabel(value, OUT_OF_CAGE_LABELS);
}

/** Bowl-wash cadence (care_plans.food_bowl_wash_cadence / water_bowl_wash_cadence). */
export function bowlWashLabel(value: string | null | undefined, t: TFunction): string {
  switch (value) {
    case "after_each_fresh": return t("careLabels.bowlWash.afterEachFresh", "After every fresh-food serving");
    case "once_daily": return t("careLabels.bowlWash.onceDaily", "Once a day");
    case "twice_daily": return t("careLabels.bowlWash.twiceDaily", "Twice a day");
    case "every_few_days": return t("careLabels.bowlWash.everyFewDays", "Every few days");
  }
  return prettyLabel(value, BOWL_WASH_LABELS);
}

/** Unit word for display. Known units are keyed (singular/plural chosen in
 *  code, not via i18next `count`); any other unit is shown as stored. */
function unitWord(unit: string, one: boolean, t: TFunction): string {
  const lower = unit.toLowerCase();
  if (one) {
    switch (lower) {
      case "tablespoons": return t("careLabels.unit.tablespoonOne", "tablespoon");
      case "cups": return t("careLabels.unit.cupOne", "cup");
      case "grams": return t("careLabels.unit.gramOne", "gram");
      case "scoops": return t("careLabels.unit.scoopOne", "scoop");
      case "pieces": return t("careLabels.unit.pieceOne", "piece");
      case "teaspoons": return t("careLabels.unit.teaspoonOne", "teaspoon");
    }
    return unit;
  }
  // Plural: formatAmountUnit shows the stored word as-is, so only an exact
  // lowercase match is keyed (keeps English byte-identical for odd casing).
  switch (unit) {
    case "tablespoons": return t("careLabels.unit.tablespoonOther", "tablespoons");
    case "cups": return t("careLabels.unit.cupOther", "cups");
    case "grams": return t("careLabels.unit.gramOther", "grams");
    case "scoops": return t("careLabels.unit.scoopOther", "scoops");
    case "pieces": return t("careLabels.unit.pieceOther", "pieces");
    case "teaspoons": return t("careLabels.unit.teaspoonOther", "teaspoons");
  }
  return unit;
}

/** Display twin of formatAmountUnit — same shape, translated unit word.
 *  NEVER use this for text that gets saved; use formatAmountUnit there. */
export function formatAmountUnitDisplay(
  amount: string | number | null | undefined,
  unit: string | null | undefined,
  t: TFunction,
): string {
  const a = amount == null ? "" : String(amount).trim();
  const u = (unit ?? "").trim();
  if (!a && !u) return "";
  if (!u) return a;
  const n = Number(a.replace(/^([0-9.]+).*$/, "$1"));
  const isOne = a === "1" || n === 1;
  return `${a} ${unitWord(u, isOne, t)}`.trim();
}

/** Display twin of formatRemovalMinutes: "2 hours" / "1 hour" / "45 min". */
export function formatRemovalMinutesDisplay(mins: number | null | undefined, t: TFunction): string {
  const m = mins ?? 120;
  if (m % 60 === 0) {
    const h = m / 60;
    return h === 1 ? t("careLabels.duration.hourOne", "{{n}} hour", { n: h }) : t("careLabels.duration.hourOther", "{{n}} hours", { n: h });
  }
  return t("careLabels.duration.minutes", "{{n}} min", { n: m });
}
