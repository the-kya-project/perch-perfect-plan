// Rebuilds the auto-generated feeding routine tasks from a plan's Food items.
// Shared by the guided wizard AND the tabbed editor so both produce identical
// routine tasks (one source of truth). Each structured feed period becomes one
// task whose category IS the period — a direct map, no text parsing.

import { supabase } from "@/integrations/supabase/client";
import { FEED_PREFIX } from "./routineTasks";
import { formatAmountUnit } from "./labels";
import { normalizeFeedTimes, periodToDaypart, formatAt } from "./feedTimes";

export type FeedingItem = {
  name: string;
  amount: string;
  unit: string;
  times?: unknown; // FeedTime[] (or legacy string[]) — normalized internally
  freeFed?: boolean;
};

/** Flatten a care_plan's diet_details ({ type: DietItem[] }) into a flat item list. */
export function dietItemsFromDetails(dietDetails: unknown): FeedingItem[] {
  if (!dietDetails || typeof dietDetails !== "object") return [];
  return Object.values(dietDetails as Record<string, any[]>).flatMap((arr) =>
    Array.isArray(arr) ? (arr as FeedingItem[]) : [],
  );
}

export async function syncFeedingTasks(planId: string, items: FeedingItem[]): Promise<void> {
  // Wipe and rebuild all auto-generated feeding rows on every save.
  const { data: existing } = await supabase
    .from("routine_tasks")
    .select("id")
    .eq("care_plan_id", planId)
    .ilike("title", `${FEED_PREFIX}%`);
  const oldIds = ((existing ?? []) as any[]).map((r) => r.id);
  if (oldIds.length) await supabase.from("routine_tasks").delete().in("id", oldIds);

  const rows: any[] = [];
  let order = 100;
  for (const it of items) {
    const name = (it.name ?? "").trim();
    if (!name) continue;
    const amt = formatAmountUnit(it.amount, it.unit);
    const baseInstr = amt ? `Serve ${amt}.` : "";

    if (it.freeFed) {
      rows.push({
        care_plan_id: planId,
        title: `${FEED_PREFIX} ${name} (available all day)`,
        instructions: [baseInstr, "Keep topped up — this is free-fed in the cage."].filter(Boolean).join(" "),
        category: "custom", // → "Anytime" section; placed once, not repeated
        time_of_day: "Available all day",
        sort_order: order++,
      });
      continue;
    }

    const times = normalizeFeedTimes(it.times);
    if (times.length === 0) continue;
    for (const ft of times) {
      rows.push({
        care_plan_id: planId,
        title: `${FEED_PREFIX} ${name}`,
        instructions: baseInstr,
        category: periodToDaypart(ft.period), // direct period → section, no parsing
        time_of_day: formatAt(ft.at), // optional clock for display, else null
        sort_order: order++,
      });
    }
  }

  if (rows.length) await supabase.from("routine_tasks").insert(rows as any);
}
