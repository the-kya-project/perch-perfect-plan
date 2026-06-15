// Public-token server functions used by sitters (no account required).
// All access is gated by the sit's invite_token. The token is validated for:
//   - existence
//   - not revoked
//   - not past token_expires_at
// Bypassing RLS via supabaseAdmin is appropriate here because the token IS the
// access check. We load supabaseAdmin inside the handler to keep it out of the
// client bundle.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { computeTriage, type ScanAnswer, type ScanFieldKey } from "./triage";
import { mergeEmergency } from "./emergency";

async function getAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function loadSitByToken(token: string) {
  const sb = await getAdmin();
  const { data: sit, error } = await sb
    .from("sits")
    .select("*")
    .eq("invite_token", token)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!sit) throw new Error("This sitter link is not valid.");
  if (sit.revoked) throw new Error("This sitter link has been revoked by the owner.");
  if (new Date(sit.token_expires_at) < new Date()) {
    throw new Error("This sitter link has expired.");
  }
  return sit;
}

async function loadSitBirdIds(sitId: string): Promise<string[]> {
  const sb = await getAdmin();
  const { data, error } = await sb.from("sit_birds").select("bird_id").eq("sit_id", sitId);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r: any) => r.bird_id);
}

async function assertBirdInSit(sitId: string, birdId: string) {
  const ids = await loadSitBirdIds(sitId);
  if (!ids.includes(birdId)) throw new Error("Bird not in this sit.");
}

export const getSitterContext = createServerFn({ method: "GET" })
  .inputValidator((d: { token: string; birdId?: string }) =>
    z.object({ token: z.string().min(8), birdId: z.string().uuid().optional() }).parse(d),
  )
  .handler(async ({ data }) => {
    const sb = await getAdmin();
    const sit = await loadSitByToken(data.token);

    const birdIds = await loadSitBirdIds(sit.id);
    if (birdIds.length === 0) throw new Error("This sit has no birds.");

    const { data: birds, error: bErr } = await sb
      .from("birds")
      .select("id, name, species, photo_url, photo_position")
      .in("id", birdIds);
    if (bErr) throw new Error(bErr.message);

    const activeId = data.birdId && birdIds.includes(data.birdId) ? data.birdId : birdIds[0];

    const [birdRes, planRes, contactsRes] = await Promise.all([
      sb.from("birds").select("*").eq("id", activeId).maybeSingle(),
      sb.from("care_plans").select("*").eq("bird_id", activeId).maybeSingle(),
      sb.from("emergency_contacts").select("*").eq("bird_id", activeId).maybeSingle(),
    ]);
    if (birdRes.error || !birdRes.data) throw new Error("Bird not found.");

    const { data: defaultsRow } = await sb
      .from("owner_emergency_defaults")
      .select("*")
      .eq("owner_id", birdRes.data.owner_id)
      .maybeSingle();
    const mergedContacts = {
      ...(contactsRes.data ?? { bird_id: activeId }),
      ...mergeEmergency(contactsRes.data, defaultsRow),
    };

    const tasksRes = planRes.data
      ? await sb
          .from("routine_tasks")
          .select("*")
          .eq("care_plan_id", planRes.data.id)
          .order("category")
          .order("sort_order")
      : { data: [] as any[], error: null };

    const today = new Date().toISOString().slice(0, 10);
    const completionsRes = await sb
      .from("task_completions")
      .select("*")
      .eq("sit_id", sit.id)
      .eq("completed_date", today);

    const todayLogRes = await sb
      .from("daily_logs")
      .select("*")
      .eq("sit_id", sit.id)
      .eq("bird_id", activeId)
      .eq("log_date", today)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // Generate signed URLs for owner-recorded "Watch first" clips on the active bird.
    // Clips are stored in the private bird-photos bucket; signed URLs ensure only
    // the assigned sitter (holding this token) can play them.
    const watchClipSlots: { key: string; column: string; label: string }[] = [
      { key: "step_up", column: "clip_step_up_path", label: "How she steps up" },
      { key: "food_water", column: "clip_food_water_path", label: "How to refill food & water safely" },
      { key: "locations", column: "clip_locations_path", label: "Where everything is" },
      { key: "bedtime", column: "clip_bedtime_path", label: "Settling her for the night" },
    ];
    const watchClips: { key: string; label: string; url: string }[] = [];
    if (planRes.data) {
      for (const slot of watchClipSlots) {
        const path = (planRes.data as any)[slot.column] as string | null;
        if (!path) continue;
        const { data: signed } = await sb.storage.from("bird-photos").createSignedUrl(path, 3600);
        if (signed?.signedUrl) watchClips.push({ key: slot.key, label: slot.label, url: signed.signedUrl });
      }
    }

    return {
      sit,
      birds: birds ?? [],
      activeBirdId: activeId,
      bird: birdRes.data,
      plan: planRes.data,
      contacts: mergedContacts,
      tasks: tasksRes.data ?? [],
      completions: completionsRes.data ?? [],
      todayLog: todayLogRes.data ?? null,
      watchClips,
    };
  });

export const toggleTaskCompletion = createServerFn({ method: "POST" })
  .inputValidator((d: { token: string; taskId: string; completed: boolean }) =>
    z.object({
      token: z.string().min(8),
      taskId: z.string().uuid(),
      completed: z.boolean(),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const sb = await getAdmin();
    const sit = await loadSitByToken(data.token);
    const today = new Date().toISOString().slice(0, 10);
    if (data.completed) {
      await sb.from("task_completions").upsert(
        { sit_id: sit.id, routine_task_id: data.taskId, completed_date: today },
        { onConflict: "sit_id,routine_task_id,completed_date" },
      );
    } else {
      await sb
        .from("task_completions")
        .delete()
        .eq("sit_id", sit.id)
        .eq("routine_task_id", data.taskId)
        .eq("completed_date", today);
    }
    return { ok: true };
  });

const AnswerEnum = z.enum(["normal", "not_sure", "concerning"]);

export const submitHealthScan = createServerFn({ method: "POST" })
  .inputValidator((d: { token: string; birdId: string; answers: Record<string, ScanAnswer>; notes?: string }) =>
    z.object({
      token: z.string().min(8),
      birdId: z.string().uuid(),
      answers: z.record(z.string(), AnswerEnum),
      notes: z.string().max(2000).optional(),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const sb = await getAdmin();
    const sit = await loadSitByToken(data.token);
    await assertBirdInSit(sit.id, data.birdId);
    const triage = computeTriage(data.answers as Record<ScanFieldKey, ScanAnswer>);
    const today = new Date().toISOString().slice(0, 10);
    const a = data.answers as Record<string, string>;
    const { data: row, error } = await sb
      .from("daily_logs")
      .insert({
        sit_id: sit.id,
        bird_id: data.birdId,
        log_date: today,
        alertness_status: a.alertness,
        food_status: a.food,
        droppings_status: a.droppings,
        breathing_status: a.breathing,
        posture_status: a.posture,
        behavior_status: a.noise,
        energy_status: a.fluffed,
        injury_status: a.injury,
        exposure_status: a.exposure,
        notes: data.notes ?? null,
        triage_status: triage.status,
        triage_reasons: triage.reasons.join(" | "),
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return { log: row, triage };
  });

export const uploadDroppingsPhoto = createServerFn({ method: "POST" })
  .inputValidator((d: { token: string; birdId: string; dataUrl: string; notes?: string }) =>
    z.object({
      token: z.string().min(8),
      birdId: z.string().uuid(),
      dataUrl: z.string().startsWith("data:image/").max(2_500_000),
      notes: z.string().max(1000).optional(),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const sb = await getAdmin();
    const sit = await loadSitByToken(data.token);
    await assertBirdInSit(sit.id, data.birdId);
    const { error } = await sb.from("photo_logs").insert({
      sit_id: sit.id,
      bird_id: data.birdId,
      photo_type: "droppings",
      photo_url: data.dataUrl,
      notes: data.notes ?? null,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getGuideCards = createServerFn({ method: "GET" }).handler(async () => {
  const sb = await getAdmin();
  const { data, error } = await sb
    .from("guide_cards")
    .select("*")
    .order("category")
    .order("title");
  if (error) throw new Error(error.message);
  return data;
});
