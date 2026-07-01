// Household-as-caregiver server fns. Mirrors the sitter (token) flow but
// authorizes via auth.uid() = sits.caregiver_user_id. No tokens; no new
// permissions beyond the existing bird_members household role (which already
// lets the user read the bird and write logs). The sit row itself becomes
// readable to the assigned caregiver via the RLS policy added in
// 20260624170000_sit_household_caregiver.sql.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function getAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

// All sits where the caller is the assigned household caregiver AND today is
// inside the window. Returns enough to render the Today view in one round trip:
// the sit, its birds, the owner's display name, the routine tasks, and which
// tasks were completed today. Multi-concurrent-sits is handled (the array can
// be length > 1) — the UI stacks them.
export const getActiveCaregiverSits = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = await getAdmin();
    const userId = context.userId as string;
    const today = todayISO();

    const { data: sits } = await sb
      .from("sits")
      .select("id, owner_id, title, start_date, end_date, caregiver_user_id, revoked, notes")
      .eq("caregiver_user_id", userId)
      .lte("start_date", today)
      .gte("end_date", today)
      .eq("revoked", false);

    const rows = (sits ?? []) as any[];
    if (!rows.length) return { sits: [] as ActiveCaregiverSit[], upcoming: await loadUpcoming(sb, userId, today) };

    const sitIds = rows.map((s) => s.id);
    const ownerIds = Array.from(new Set(rows.map((s) => s.owner_id)));

    const [sitBirdsRes, ownerProfsRes] = await Promise.all([
      sb.from("sit_birds").select("sit_id, bird_id").in("sit_id", sitIds),
      sb.from("profiles").select("id, display_name").in("id", ownerIds),
    ]);
    const birdIds = Array.from(new Set(((sitBirdsRes.data ?? []) as any[]).map((r) => r.bird_id)));
    const [birdsRes, plansRes] = await Promise.all([
      birdIds.length
        ? sb.from("birds").select("id, name, species, photo_url, photo_position").in("id", birdIds)
        : Promise.resolve({ data: [] as any[] }),
      birdIds.length
        ? sb.from("care_plans").select("id, bird_id").in("bird_id", birdIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);
    const planIds = ((plansRes.data ?? []) as any[]).map((p: any) => p.id);
    const planToBird = new Map(((plansRes.data ?? []) as any[]).map((p: any) => [p.id, p.bird_id]));

    const [tasksRes, completionsRes, scansRes] = await Promise.all([
      planIds.length
        ? sb.from("routine_tasks")
            .select("id, care_plan_id, title, instructions, category, time_of_day, sort_order, required, sitter_completable, guide_card_id")
            .in("care_plan_id", planIds)
        : Promise.resolve({ data: [] as any[] }),
      sb.from("task_completions")
        .select("routine_task_id, sit_id, completed_at")
        .in("sit_id", sitIds)
        .eq("completed_date", today),
      // Today's health scans for these sits (daily_logs are tagged with sit_id by
      // the caregiver scan flow), so each bird card can show done/not-done today.
      sb.from("daily_logs")
        .select("bird_id, sit_id, triage_status")
        .in("sit_id", sitIds)
        .eq("log_date", today),
    ]);

    const birdById = new Map(((birdsRes.data ?? []) as any[]).map((b: any) => [b.id, b]));
    const ownerNameById = new Map(((ownerProfsRes.data ?? []) as any[]).map((p: any) => [p.id, (p.display_name ?? "").toString().trim() || "the owner"]));
    const sitBirdsBySit = new Map<string, string[]>();
    for (const r of (sitBirdsRes.data ?? []) as any[]) {
      const list = sitBirdsBySit.get(r.sit_id) ?? [];
      list.push(r.bird_id);
      sitBirdsBySit.set(r.sit_id, list);
    }
    const tasksByBird = new Map<string, any[]>();
    for (const t of (tasksRes.data ?? []) as any[]) {
      const birdId = planToBird.get(t.care_plan_id) as string | undefined;
      if (!birdId) continue;
      (tasksByBird.get(birdId) ?? tasksByBird.set(birdId, []).get(birdId)!).push(t);
    }
    const completionsBySit = new Map<string, { taskId: string; at: string }[]>();
    for (const c of (completionsRes.data ?? []) as any[]) {
      const list = completionsBySit.get(c.sit_id) ?? [];
      list.push({ taskId: c.routine_task_id, at: c.completed_at });
      completionsBySit.set(c.sit_id, list);
    }
    // Per-bird today-scan status, keyed by sit+bird (a bird can be on >1 sit).
    const scanByBirdSit = new Map<string, string | null>();
    for (const r of (scansRes.data ?? []) as any[]) {
      scanByBirdSit.set(`${r.sit_id}:${r.bird_id}`, (r.triage_status ?? null) as string | null);
    }

    const out: ActiveCaregiverSit[] = rows.map((s) => {
      const birds = (sitBirdsBySit.get(s.id) ?? [])
        .map((bid) => birdById.get(bid))
        .filter(Boolean)
        .map((b: any) => ({
          id: b.id as string,
          name: b.name as string,
          species: b.species as string | null,
          photo_url: b.photo_url as string | null,
          photo_position: b.photo_position as string | null,
          tasks: (tasksByBird.get(b.id) ?? []) as any[],
          scanDone: scanByBirdSit.has(`${s.id}:${b.id}`),
          scanStatus: scanByBirdSit.get(`${s.id}:${b.id}`) ?? null,
        }));
      return {
        id: s.id as string,
        title: s.title as string | null,
        ownerName: ownerNameById.get(s.owner_id) ?? "the owner",
        startDate: s.start_date as string,
        endDate: s.end_date as string,
        notes: s.notes as string | null,
        birds,
        completionsToday: completionsBySit.get(s.id) ?? [],
      };
    });
    return { sits: out, upcoming: await loadUpcoming(sb, userId, today) };
  });

// Soonest upcoming sit assigned to me (today < start_date). Powers the
// "Today's check starts in N days" message when the caregiver lands on /today
// before their window opens.
async function loadUpcoming(sb: any, userId: string, today: string) {
  const { data } = await sb
    .from("sits")
    .select("id, title, start_date, end_date, owner_id")
    .eq("caregiver_user_id", userId)
    .gt("start_date", today)
    .eq("revoked", false)
    .order("start_date", { ascending: true })
    .limit(1);
  const row = ((data ?? []) as any[])[0] ?? null;
  return row ? { id: row.id as string, title: row.title as string | null, startDate: row.start_date as string, endDate: row.end_date as string } : null;
}

// Toggle a routine task as completed today, when the caller is the assigned
// caregiver on a sit whose window covers today AND the task belongs to one of
// that sit's birds. Mirrors the sitter token version's upsert/delete.
export const caregiverToggleTaskCompletion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { sitId: string; taskId: string; completed: boolean }) =>
    z.object({ sitId: z.string().uuid(), taskId: z.string().uuid(), completed: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = await getAdmin();
    const userId = context.userId as string;
    const today = todayISO();

    // Authorization: caller IS the caregiver on this sit, sit is active today.
    const { data: sit } = await sb
      .from("sits")
      .select("id, caregiver_user_id, start_date, end_date, revoked")
      .eq("id", data.sitId)
      .maybeSingle();
    if (!sit) throw new Error("Sit not found.");
    if (sit.caregiver_user_id !== userId) throw new Error("Not the assigned caregiver.");
    if (sit.revoked) throw new Error("Sit revoked.");
    if (today < (sit.start_date as string) || today > (sit.end_date as string)) {
      throw new Error("Sit isn't active today.");
    }

    // Task must belong to one of the sit's birds.
    const { data: sitBirds } = await sb.from("sit_birds").select("bird_id").eq("sit_id", data.sitId);
    const birdIds = ((sitBirds ?? []) as any[]).map((r) => r.bird_id);
    if (!birdIds.length) throw new Error("Sit has no birds.");
    const { data: plans } = await sb.from("care_plans").select("id").in("bird_id", birdIds);
    const planIds = ((plans ?? []) as any[]).map((p: any) => p.id);
    const { data: task } = await sb
      .from("routine_tasks").select("id, care_plan_id")
      .eq("id", data.taskId).in("care_plan_id", planIds).maybeSingle();
    if (!task) throw new Error("Task not in this sit.");

    if (data.completed) {
      const { error } = await sb.from("task_completions").upsert(
        { sit_id: data.sitId, routine_task_id: data.taskId, completed_date: today },
        { onConflict: "sit_id,routine_task_id,completed_date" },
      );
      if (error) throw new Error(error.message);
    } else {
      const { error } = await sb
        .from("task_completions").delete()
        .eq("sit_id", data.sitId)
        .eq("routine_task_id", data.taskId)
        .eq("completed_date", today);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export type ActiveCaregiverBird = {
  id: string;
  name: string;
  species: string | null;
  photo_url: string | null;
  photo_position: string | null;
  tasks: { id: string; title: string; instructions: string | null; category: string; time_of_day: string | null; sort_order: number; required: boolean; sitter_completable: boolean; guide_card_id: string | null }[];
  scanDone: boolean;
  scanStatus: string | null;
};
export type ActiveCaregiverSit = {
  id: string;
  title: string | null;
  ownerName: string;
  startDate: string;
  endDate: string;
  notes: string | null;
  birds: ActiveCaregiverBird[];
  completionsToday: { taskId: string; at: string }[];
};
