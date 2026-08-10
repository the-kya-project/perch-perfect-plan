// Pure logic for backfilling routine_tasks.derived on EXISTING rows.
//
// SAFETY: this never writes title/instructions. For each derived row it
// re-derives a descriptor FROM THE CARE-PLAN FIELDS, renders the English the
// descriptor would produce, and only proposes the descriptor when that English
// matches the row's stored title AND instructions exactly. Any mismatch → the
// row is SKIPPED (keeps rendering its stored English). No guessing.
//
// Kept DB-free so the committed backfill script and the dry-run harness share
// one code path.

import { feedTimeToDaypart } from "./routineTasks";
import {
  feedDescriptor, medDescriptor, washFoodDescriptor, washWaterDescriptor,
  removeFreshDescriptor, changeWaterDescriptor, type DerivedTask,
} from "./derivedTasks";
import type { RenderedTask } from "./routineTaskRender";

export type PlanFields = {
  diet_details: unknown;
  medications_details: unknown;
  fresh_food_removal_minutes: number | null;
  food_bowl_wash_cadence: string | null;
  water_bowl_wash_cadence: string | null;
  water_frequency: string | null;
};
export type StoredRow = { id: string; title: string | null; instructions: string | null };
export type RenderEn = (d: DerivedTask) => RenderedTask;

export type Assignment = { id: string; derived: DerivedTask };
export type Skip = { id: string; title: string | null; reason: string };
export type PlanResult = { assign: Assignment[]; skip: Skip[] };

const MED_TIME_KEYS = ["morning", "midday", "evening", "bedtime"];

// --- pure re-implementations of the sync-side extraction (no browser deps) ---

function dietItems(dietDetails: unknown): Array<{ name: string; amount?: string; unit?: string; freeFed?: boolean; note?: string | null }> {
  if (!dietDetails || typeof dietDetails !== "object") return [];
  return Object.values(dietDetails as Record<string, any[]>).flatMap((arr) => (Array.isArray(arr) ? arr : []));
}

function hydrateMed(m: any): { name: string; times: string[]; notes: string } {
  if (Array.isArray(m?.times)) {
    return { name: m.name ?? "", times: (m.times as string[]).filter((t) => MED_TIME_KEYS.includes(t)), notes: m.notes ?? "" };
  }
  const legacy = (m?.schedule ?? "").toString();
  const inferred = legacy ? feedTimeToDaypart(legacy) : null;
  const times = inferred === "morning" || inferred === "midday" || inferred === "evening" ? [inferred] : [];
  return { name: m?.name ?? "", times, notes: legacy };
}

/** Every descriptor the plan's CURRENT fields would generate a task for. */
function candidateDescriptors(plan: PlanFields): DerivedTask[] {
  const out: DerivedTask[] = [];
  for (const it of dietItems(plan.diet_details)) {
    if ((it.name ?? "").trim()) out.push(feedDescriptor(it));
  }
  const meds = Array.isArray(plan.medications_details) ? plan.medications_details : [];
  for (const raw of meds) {
    const m = hydrateMed(raw);
    if (!(m.name ?? "").trim()) continue;
    if (m.times.length) for (const t of m.times) out.push(medDescriptor(m.name, t, m.notes));
    else out.push(medDescriptor(m.name, null, m.notes));
  }
  if (plan.food_bowl_wash_cadence) out.push(washFoodDescriptor(plan.food_bowl_wash_cadence));
  if (plan.water_bowl_wash_cadence) out.push(washWaterDescriptor(plan.water_bowl_wash_cadence));
  if (plan.fresh_food_removal_minutes != null) out.push(removeFreshDescriptor(plan.fresh_food_removal_minutes));
  if (plan.water_frequency && ["once", "twice", "more"].includes(plan.water_frequency)) {
    out.push(changeWaterDescriptor(plan.water_frequency));
  }
  return out;
}

/** Match each stored derived row to a field-derived descriptor by EXACT English
 *  (title + instructions). Matched → assign; unmatched → skip. */
export function computePlanBackfill(plan: PlanFields, rows: StoredRow[], renderEn: RenderEn): PlanResult {
  const candidates = candidateDescriptors(plan).map((d) => ({ d, r: renderEn(d) }));
  const assign: Assignment[] = [];
  const skip: Skip[] = [];
  for (const row of rows) {
    const title = row.title ?? "";
    const instr = row.instructions ?? null;
    const hit = candidates.find((c) => c.r.title === title && (c.r.instructions ?? null) === instr);
    if (hit) assign.push({ id: row.id, derived: hit.d });
    else skip.push({ id: row.id, title: row.title, reason: "no field-derived match for stored title/instructions" });
  }
  return { assign, skip };
}
