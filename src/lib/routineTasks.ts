// One source of truth for routine items.
//
// Routine tasks that have a structured source elsewhere are auto-derived into
// `routine_tasks` by the setup wizard's sync functions (feeding/hygiene/water
// from the Food tab; medication from the Health tab). The guided Routine builder
// owns only pure-rhythm items that have no other source.
//
// There is no `is_auto_derived` column, so derived tasks are identified by their
// title prefix — the same convention the sync functions use to find and replace
// their own rows. Keep these prefixes in sync with the sync functions.

export const FEED_PREFIX = "Feed:";
export const HYG_REMOVE_PREFIX = "Remove fresh food";
export const HYG_WASH_FOOD_PREFIX = "Wash food bowls";
export const HYG_WASH_WATER_PREFIX = "Wash water bowl";
export const WATER_CHANGE_PREFIX = "Change water";
export const MED_TASK_PREFIX = "Medication";

const FOOD_PREFIXES = [
  FEED_PREFIX,
  HYG_REMOVE_PREFIX,
  HYG_WASH_FOOD_PREFIX,
  HYG_WASH_WATER_PREFIX,
  WATER_CHANGE_PREFIX,
];

/** The source section a derived task comes from, or null if it's a manual item. */
export function derivedSource(title: string | null | undefined): "Food" | "Health" | null {
  const t = (title ?? "").trim().toLowerCase();
  if (!t) return null;
  if (FOOD_PREFIXES.some((p) => t.startsWith(p.toLowerCase()))) return "Food";
  if (t.startsWith(MED_TASK_PREFIX.toLowerCase())) return "Health";
  return null;
}

/** True when a routine task is auto-derived from a structured source (read-only in builders). */
export function isDerivedTask(title: string | null | undefined): boolean {
  return derivedSource(title) !== null;
}
