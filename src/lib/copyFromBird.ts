// "Start from another bird?" — what's copied from one of the owner's birds to
// a new one during setup.
//
// Food copies everything on the Food step except how much: each item keeps its
// name, unit, times and note, and the owner fills in the amount. Day copies the
// owner's own tasks within each time block; tasks generated from Food and
// Health are left out (they're rebuilt from this bird's own answers), and no
// clock times are added.
import { isDerivedTask } from "@/lib/routineTasks";

/** care_plans columns the Food step reads and writes. */
export const FOOD_COLUMNS = [
  "diet_types", "diet_other", "diet_details", "food_brand", "amount_value", "amount_unit",
  "fresh_foods", "fresh_foods_other", "treats_notes", "treats_frequency", "never_feed",
  "water_frequency", "water_notes", "food_storage", "fresh_food_removal_minutes",
  "food_bowl_wash_cadence", "water_bowl_wash_cadence", "food_hygiene_notes",
] as const;

type Row = Record<string, any>;

/** True when a bird's plan has food worth copying. */
export function hasFoodToCopy(plan: Row | null | undefined): boolean {
  return Array.isArray(plan?.diet_types) && plan!.diet_types.length > 0;
}

/** The source plan's food answers with every amount cleared. */
export function foodCopy(source: Row): Row {
  const out: Row = {};
  for (const col of FOOD_COLUMNS) out[col] = source[col] ?? null;
  out.amount_value = null;
  const details = (source.diet_details ?? {}) as Record<string, Row[]>;
  out.diet_details = Object.fromEntries(
    Object.entries(details).map(([type, items]) => [
      type,
      (Array.isArray(items) ? items : []).map((it) => ({ ...it, amount: "" })),
    ]),
  );
  return out;
}

/** True for a task the owner added themselves (not generated from Food or Health). */
export function isOwnTask(task: Row): boolean {
  return !task.derived && !isDerivedTask(task.title);
}

/** New routine_tasks rows for `carePlanId`, copied from the source's own tasks. */
export function dayCopy(sourceTasks: Row[], carePlanId: string): Row[] {
  return sourceTasks.filter(isOwnTask).map((task) => ({
    care_plan_id: carePlanId,
    title: task.title,
    category: task.category,
    instructions: task.instructions ?? null,
    sort_order: task.sort_order ?? 0,
    required: task.required ?? true,
    sitter_completable: task.sitter_completable ?? true,
  }));
}
