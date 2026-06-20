// Human-readable label maps + small formatters for owner-entered care-plan
// data. Used by the sitter care sheet and any sitter-facing summary so raw
// stored values (e.g. "training_only", "tablespoons") never reach the screen.

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
