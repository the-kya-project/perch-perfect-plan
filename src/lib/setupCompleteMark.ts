import { supabase } from "@/integrations/supabase/client";
import { computeSetupCompleteness, shouldMarkSetupComplete } from "./setupCompleteness";

export { shouldMarkSetupComplete };

/**
 * Quickstart onboarding: the self-serve path (profile section cards) never hits
 * the wizard's "Finish", so a bird fully filled in that way would wrongly keep
 * setup_complete = false forever. The fix is one ADDITIVE write: when every
 * care section is complete (per setupCompleteness), set setup_complete = true —
 * the identical flag the wizard sets on finish. It is only ever set true, never
 * false, so no existing bird can regress, and every read of the flag stays
 * untouched.
 */

/** Additive write when the caller already has completeness computed (the plan
 * overview). Returns true if the flag was written. */
export async function markSetupCompleteIfDone(
  birdId: string,
  args: { setupComplete: boolean | null | undefined; doneCount: number; total: number },
): Promise<boolean> {
  if (!shouldMarkSetupComplete(args)) return false;
  const { error } = await supabase.from("birds").update({ setup_complete: true } as any).eq("id", birdId);
  // A member without birds-update permission just no-ops here (RLS) — the
  // owner's next visit to the overview marks it instead.
  return !error;
}

/** Fetch-and-check variant for callers without the data on hand (the section
 * editor, when leaving a section). Cheap reads, swallows all errors — this is
 * a best-effort convenience write, never load-bearing. */
export async function maybeMarkSetupComplete(birdId: string): Promise<boolean> {
  try {
    const { data: bird } = await supabase
      .from("birds")
      .select("id, owner_id, normal_weight, setup_complete")
      .eq("id", birdId)
      .maybeSingle();
    if (!bird || (bird as any).setup_complete) return false;
    const { data: plan } = await supabase.from("care_plans").select("*").eq("bird_id", birdId).maybeSingle();
    const [{ count: tasksCount }, { data: contacts }, { data: defaults }] = await Promise.all([
      plan?.id
        ? supabase.from("routine_tasks").select("id", { count: "exact", head: true }).eq("care_plan_id", plan.id)
        : Promise.resolve({ count: 0 } as any),
      supabase.from("emergency_contacts").select("*").eq("bird_id", birdId).maybeSingle(),
      supabase.from("owner_emergency_defaults").select("*").eq("owner_id", (bird as any).owner_id).maybeSingle(),
    ]);
    const completeness = computeSetupCompleteness({
      bird,
      plan: plan ?? null,
      tasksCount: tasksCount ?? 0,
      contacts: contacts ?? null,
      defaults: defaults ?? null,
    });
    return await markSetupCompleteIfDone(birdId, {
      setupComplete: (bird as any).setup_complete,
      doneCount: completeness.doneCount,
      total: completeness.total,
    });
  } catch {
    return false;
  }
}
