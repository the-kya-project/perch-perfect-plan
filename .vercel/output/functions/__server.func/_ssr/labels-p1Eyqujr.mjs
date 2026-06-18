const WATER_FREQ_LABELS = {
  once: "changed once daily",
  twice: "changed twice daily",
  more: "changed more than twice daily"
};
const TREATS_FREQ_LABELS = {
  daily: "Daily",
  few_per_week: "A few times a week",
  training_only: "Training only",
  rarely: "Rarely"
};
const OUT_OF_CAGE_LABELS = {
  supervised: "Supervised only",
  specific_room: "Specific room only",
  not_while_sitting: "Not while sitting"
};
const BOWL_WASH_LABELS = {
  after_each_fresh: "After every fresh-food serving",
  once_daily: "Once a day",
  twice_daily: "Twice a day",
  every_few_days: "Every few days"
};
function prettyLabel(value, map) {
  if (!value) return "";
  if (map[value]) return map[value];
  return value.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}
const SINGULARIZE = {
  tablespoons: "tablespoon",
  cups: "cup",
  grams: "gram",
  scoops: "scoop",
  pieces: "piece",
  teaspoons: "teaspoon"
};
function formatAmountUnit(amount, unit) {
  const a = amount == null ? "" : String(amount).trim();
  const u = (unit ?? "").trim();
  if (!a && !u) return "";
  if (!u) return a;
  const n = Number(a.replace(/^([0-9.]+).*$/, "$1"));
  const isOne = a === "1" || n === 1;
  const display = isOne ? SINGULARIZE[u.toLowerCase()] ?? u : u;
  return `${a} ${display}`.trim();
}
function formatRemovalMinutes(mins) {
  const m = mins ?? 120;
  if (m % 60 === 0) {
    const h = m / 60;
    return `${h} hour${h === 1 ? "" : "s"}`;
  }
  return `${m} min`;
}
export {
  BOWL_WASH_LABELS as B,
  OUT_OF_CAGE_LABELS as O,
  TREATS_FREQ_LABELS as T,
  WATER_FREQ_LABELS as W,
  formatRemovalMinutes as a,
  formatAmountUnit as f,
  prettyLabel as p
};
