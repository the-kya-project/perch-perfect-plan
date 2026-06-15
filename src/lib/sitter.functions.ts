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

export const getSitterContext = createServerFn({ method: "GET" })
  .inputValidator((d: { token: string }) => z.object({ token: z.string().min(8) }).parse(d))
  .handler(async ({ data }) => {
    const sb = await getAdmin();
    const sit = await loadSitByToken(data.token);

    const [birdRes, planRes, contactsRes] = await Promise.all([
      sb.from("birds").select("*").eq("id", sit.bird_id).maybeSingle(),
      sb.from("care_plans").select("*").eq("bird_id", sit.bird_id).maybeSingle(),
      sb.from("emergency_contacts").select("*").eq("bird_id", sit.bird_id).maybeSingle(),
    ]);
    if (birdRes.error || !birdRes.data) throw new Error("Bird not found.");

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
      .eq("log_date", today)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    return {
      sit,
      bird: birdRes.data,
      plan: planRes.data,
      contacts: contactsRes.data,
      tasks: tasksRes.data ?? [],
      completions: completionsRes.data ?? [],
      todayLog: todayLogRes.data ?? null,
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
  .inputValidator((d: { token: string; answers: Record<string, ScanAnswer>; notes?: string }) =>
    z.object({
      token: z.string().min(8),
      answers: z.record(z.string(), AnswerEnum),
      notes: z.string().max(2000).optional(),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const sb = await getAdmin();
    const sit = await loadSitByToken(data.token);
    const triage = computeTriage(data.answers as Record<ScanFieldKey, ScanAnswer>);
    const today = new Date().toISOString().slice(0, 10);
    const a = data.answers as Record<string, string>;
    const { data: row, error } = await sb
      .from("daily_logs")
      .insert({
        sit_id: sit.id,
        bird_id: sit.bird_id,
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
  .inputValidator((d: { token: string; dataUrl: string; notes?: string }) =>
    z.object({
      token: z.string().min(8),
      dataUrl: z.string().startsWith("data:image/").max(2_500_000), // ~1.8MB image
      notes: z.string().max(1000).optional(),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const sb = await getAdmin();
    const sit = await loadSitByToken(data.token);
    const { error } = await sb.from("photo_logs").insert({
      sit_id: sit.id,
      bird_id: sit.bird_id,
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
