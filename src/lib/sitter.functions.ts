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
import { buildDailyLogEmail } from "./emailTemplates";
import { mergeEmergency } from "./emergency";
import { isCfClip, cfUid } from "./clipRef";

// Resolve a clip column value to a playable URL: a signed Cloudflare Stream
// iframe URL for "cfstream:<uid>" refs, or a signed Supabase Storage URL for
// legacy clips. Returns null if it can't be resolved.
async function resolveClipUrl(sb: any, ref: string): Promise<string | null> {
  if (isCfClip(ref)) {
    try {
      const { signedIframeUrl } = await import("@/lib/cloudflareStream.server");
      return await signedIframeUrl(cfUid(ref));
    } catch {
      return null;
    }
  }
  const { data } = await sb.storage.from("bird-photos").createSignedUrl(ref, 3600);
  return data?.signedUrl ?? null;
}

// Resolve a bird's photo_url for display: sign Storage object paths, pass
// through legacy inline data: URLs and absolute URLs unchanged.
async function signBirdPhotoPath(sb: any, value: string | null | undefined): Promise<string | null> {
  if (!value) return null;
  if (value.startsWith("data:") || value.startsWith("http")) return value;
  const { data } = await sb.storage.from("bird-photos").createSignedUrl(value, 3600);
  return data?.signedUrl ?? null;
}

async function getAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

// Owner-side "View as sitter" preview sits carry this sentinel name. They render
// the real read-only sitter view but must never accept writes.
export const PREVIEW_SITTER_NAME = "__preview__";
function assertNotPreview(sit: { sitter_name?: string | null }) {
  if (sit.sitter_name === PREVIEW_SITTER_NAME) throw new Error("This is a read-only preview — changes aren't saved.");
}

async function loadSitByToken(token: string) {
  const sb = await getAdmin();
  const { data: sit, error } = await sb
    .from("sits")
    .select("*")
    .eq("invite_token", token)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!sit) throw new Error("SITTER_LINK_INVALID");
  if (sit.revoked) throw new Error("SITTER_LINK_REVOKED");
  // Token-bearing rows always carry token_expires_at (sits_one_caregiver_chk
  // enforces token + expiry on the external-sitter path); household sits have
  // no token and won't match the lookup above, so the non-null assert is safe.
  if (new Date(sit.token_expires_at as string) < new Date()) {
    throw new Error("SITTER_LINK_EXPIRED");
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

// A routine task is "in" a sit only if it belongs to a care plan of one of the
// sit's birds. Without this, a valid-token sitter could pass an arbitrary
// routine_task_id; the row would be harmless (scoped to their own sit_id and
// only readable by that sit's owner), but we reject it so completions can only
// reference this sit's real tasks.
async function assertTaskInSit(sitId: string, taskId: string) {
  const sb = await getAdmin();
  const birdIds = await loadSitBirdIds(sitId);
  if (birdIds.length === 0) throw new Error("Task not in this sit.");
  const { data: plans } = await sb.from("care_plans").select("id").in("bird_id", birdIds);
  const planIds = (plans ?? []).map((p: any) => p.id);
  if (planIds.length === 0) throw new Error("Task not in this sit.");
  const { data: task } = await sb
    .from("routine_tasks")
    .select("id")
    .eq("id", taskId)
    .in("care_plan_id", planIds)
    .maybeSingle();
  if (!task) throw new Error("Task not in this sit.");
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

    // Generate signed URLs for the owner-recorded "Tips from the owner" clips on the active bird.
    // Clips are stored in the private bird-photos bucket; signed URLs ensure only
    // the assigned sitter (holding this token) can play them.
    const watchClipSlots: { key: string; column: string; label: string }[] = [
      { key: "step_up", column: "clip_step_up_path", label: "How she steps up" },
      { key: "food_water", column: "clip_food_water_path", label: "How to refill food & water safely" },
      { key: "locations", column: "clip_locations_path", label: "Where everything is" },
      { key: "bedtime", column: "clip_bedtime_path", label: "Settling her for the night" },
    ];
    const watchClips: { key: string; label: string; url: string }[] = [];
    let baselineClipUrl: string | null = null;
    if (planRes.data) {
      for (const slot of watchClipSlots) {
        const path = (planRes.data as any)[slot.column] as string | null;
        if (!path) continue;
        const url = await resolveClipUrl(sb, path);
        if (url) watchClips.push({ key: slot.key, label: slot.label, url });
      }
      const bcp = (planRes.data as any).baseline_clip_path as string | null;
      if (bcp) baselineClipUrl = await resolveClipUrl(sb, bcp);
    }

    // Sign bird profile photos (paths → signed URLs) so the sitter can load them
    // from the private bucket; legacy inline data: URLs pass through.
    const signedBirds = await Promise.all(
      (birds ?? []).map(async (b: any) => ({ ...b, photo_url: await signBirdPhotoPath(sb, b.photo_url) })),
    );
    const signedActiveBird = {
      ...birdRes.data,
      photo_url: await signBirdPhotoPath(sb, (birdRes.data as any).photo_url),
    };

    return {
      sit,
      birds: signedBirds,
      activeBirdId: activeId,
      bird: signedActiveBird,
      plan: planRes.data,
      contacts: mergedContacts,
      tasks: tasksRes.data ?? [],
      completions: completionsRes.data ?? [],
      todayLog: todayLogRes.data ?? null,
      watchClips,
      baselineClipUrl,
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
    assertNotPreview(sit);
    await assertTaskInSit(sit.id, data.taskId);
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

// Build the owner alert email for a flagged scan. Plain inline styles so it
// renders consistently across mail clients; warm palette to match the app.
function buildScanAlertEmail(opts: {
  birdName: string;
  sitterName: string;
  status: "red" | "yellow";
  reasons: string[];
  notes: string | null;
  link: string;
}): { subject: string; html: string; text: string } {
  const urgent = opts.status === "red";
  const subject = urgent
    ? `${opts.birdName}: health concern flagged by your sitter`
    : `${opts.birdName}: your sitter flagged something to check`;
  const reasonItems = opts.reasons.length
    ? opts.reasons.map((r) => `<li style="margin:4px 0;">${escapeHtml(r)}</li>`).join("")
    : "<li>See the full health check in the app.</li>";
  const notesBlock = opts.notes
    ? `<p style="margin:16px 0 4px;font-size:13px;color:#5f5e5a;text-transform:uppercase;letter-spacing:.08em;">Sitter notes</p>
       <p style="margin:0;font-size:15px;color:#1a3d2e;font-style:italic;">"${escapeHtml(opts.notes)}"</p>`
    : "";
  const html = `
<div style="background:#f4f1e8;padding:24px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e3ded0;">
    <div style="background:${urgent ? "#993C1D" : "#a9791f"};padding:20px 24px;">
      <p style="margin:0;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:rgba(255,255,255,.85);">
        ${urgent ? "Health concern" : "Worth a check"}
      </p>
      <h1 style="margin:6px 0 0;font-size:20px;font-weight:500;color:#fff;">
        ${escapeHtml(opts.birdName)}'s daily health check needs your eyes
      </h1>
    </div>
    <div style="padding:24px;">
      <p style="margin:0 0 12px;font-size:15px;color:#1a3d2e;">
        ${escapeHtml(opts.sitterName)} just submitted a health check and flagged the following:
      </p>
      <ul style="margin:0;padding-left:20px;font-size:15px;color:#1a3d2e;">${reasonItems}</ul>
      ${notesBlock}
      <a href="${opts.link}" style="display:inline-block;margin-top:20px;background:#1a3d2e;color:#fff;text-decoration:none;padding:12px 20px;border-radius:12px;font-size:14px;font-weight:600;">
        View the full health check
      </a>
      <p style="margin:20px 0 0;font-size:12px;color:#8a897f;line-height:1.5;">
        This app doesn't diagnose illness and isn't a substitute for veterinary care. If something seems off, contact an avian veterinarian.
      </p>
    </div>
  </div>
</div>`;
  const text = `${opts.birdName}'s daily health check needs your eyes.\n\n${opts.sitterName} flagged:\n${opts.reasons.map((r) => `- ${r}`).join("\n")}${opts.notes ? `\n\nSitter notes: "${opts.notes}"` : ""}\n\nView the full health check: ${opts.link}`;
  return { subject, html, text };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;",
  );
}

export const submitHealthScan = createServerFn({ method: "POST" })
  .inputValidator(
    (d: { token: string; birdId: string; answers: Record<string, ScanAnswer>; itemNotes?: Record<string, string>; notes?: string; photoDataUrl?: string; weightGrams?: number }) =>
      z
        .object({
          token: z.string().min(8),
          birdId: z.string().uuid(),
          answers: z.record(z.string(), AnswerEnum),
          // Optional per-item note (keyed by scan field key) for not-normal items.
          itemNotes: z.record(z.string(), z.string().max(2000)).optional(),
          notes: z.string().max(2000).optional(),
          // Optional scan photo, already compressed client-side to a small JPEG.
          photoDataUrl: z.string().startsWith("data:image/").max(4_000_000).optional(),
          // Optional weigh-in — flows into the owner's weight timeline.
          weightGrams: z.number().positive().max(5000).optional(),
        })
        .parse(d),
  )
  .handler(async ({ data }) => {
    const sb = await getAdmin();
    const sit = await loadSitByToken(data.token);
    assertNotPreview(sit);
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
        item_notes: data.itemNotes ?? null,
        triage_status: triage.status,
        triage_reasons: triage.reasons.join(" | "),
      } as any)
      .select()
      .single();
    if (error) throw new Error(error.message);

    // vomiting_status is added by a later migration that may not be applied yet,
    // so write it best-effort — never let a missing column break the scan.
    if (a.vomiting) {
      await sb.from("daily_logs").update({ vomiting_status: a.vomiting } as any).eq("id", row.id);
    }

    // Attach the optional photo to THIS scan record (daily_log_id) so it shows
    // inline in both the owner and sitter scan detail views.
    if (data.photoDataUrl) {
      const { error: pErr } = await sb.from("photo_logs").insert({
        sit_id: sit.id,
        bird_id: data.birdId,
        daily_log_id: row.id,
        photo_type: "other",
        photo_url: data.photoDataUrl,
        notes: "Attached to health check",
      });
      if (pErr) console.error("[submitHealthScan] photo insert failed", pErr.message);
    }

    // Optional sitter weigh-in → the owner's shared weight timeline (source
    // 'sitter'). Isolated so a weight failure never breaks the scan itself.
    if (typeof data.weightGrams === "number") {
      const { error: wErr } = await sb.from("weight_entries").insert({
        bird_id: data.birdId,
        grams: data.weightGrams,
        source: "sitter",
        // No auth user for a token-based sitter; note carries who logged it.
        note: sit.sitter_name ? `Logged by ${sit.sitter_name}` : null,
      });
      if (wErr) console.error("[submitHealthScan] weight insert failed", wErr.message);
    }

    // Notify the owner across channels. Run BEFORE returning: on serverless the
    // lambda can freeze the moment the response is sent, so fire-and-forget work
    // may never execute. Push and email are isolated in separate try/catch blocks
    // so a failure in one (e.g. a bad VAPID_SUBJECT throwing in web-push) can
    // never prevent the other — email is the must-work channel.
    const { data: birdRow } = await sb
      .from("birds")
      .select("owner_id, name")
      .eq("id", data.birdId)
      .maybeSingle();
    if (birdRow?.owner_id) {
      const ownerId = birdRow.owner_id as string;
      const birdName = birdRow.name ?? "Your bird";
      const flagged = triage.status === "red" || triage.status === "yellow";
      const url = `/birds/${data.birdId}/scans/${row.id}`;

      // Push (best-effort).
      try {
        const { sendPushToOwner } = await import("./pushSender.server");
        if (flagged) {
          const res = await sendPushToOwner(ownerId, "health_concern", {
            title: triage.status === "red" ? "Health concern flagged" : "Sitter flagged something to check",
            body: `${birdName}'s sitter logged ${triage.status === "red" ? "a concerning" : "an uncertain"} result. Tap to review.`,
            url,
            tag: `scan-${row.id}`,
            requireInteraction: triage.status === "red",
          });
          console.log("[scan] push", res);
        } else {
          const res = await sendPushToOwner(ownerId, "sitter_log", {
            title: "New daily health check",
            body: `${birdName}'s sitter logged an all-clear health check.`,
            url,
            tag: `scan-${row.id}`,
          });
          console.log("[scan] push", res);
        }
      } catch (e) {
        console.error("[scan] push failed", e);
      }

      // Email: a flagged scan ALWAYS emails (safety alert, can't be turned off).
      // An all-clear scan emails only if the owner opted into "sitter added a
      // daily log" emails (profiles.notify_sitter_log).
      try {
        const [{ data: profile }, { data: sitRow }] = await Promise.all([
          sb.from("profiles").select("email, display_name, notify_sitter_log").eq("id", ownerId).maybeSingle(),
          sb.from("sits").select("sitter_name, sitter_email").eq("id", sit.id).maybeSingle(),
        ]);
        const wantsLogEmail = (profile?.notify_sitter_log ?? true) === true;
        if (flagged || wantsLogEmail) {
          // profiles.email can be empty for older accounts — fall back to the
          // authoritative auth.users email so there's always a recipient.
          let to = profile?.email ?? null;
          if (!to) {
            const { data: authUser } = await sb.auth.admin.getUserById(ownerId);
            to = authUser?.user?.email ?? null;
          }
          console.log("[scan] email", { status: triage.status, flagged, wantsLogEmail, ownerHasEmail: !!to });
          if (to) {
            const appUrl = process.env.APP_URL || "https://app.thekyaproject.com";
            const sitterName = sitRow?.sitter_name || sitRow?.sitter_email || "Your sitter";
            const link = `${appUrl}${url}`;
            const built = flagged
              ? buildScanAlertEmail({
                  birdName,
                  sitterName,
                  status: triage.status as "red" | "yellow",
                  reasons: triage.reasons,
                  notes: data.notes ?? null,
                  link,
                })
              : buildDailyLogEmail({ birdName, sitterName, link });
            const { sendTransactionalEmail } = await import("./brevoEmail.server");
            const sent = await sendTransactionalEmail({
              to,
              toName: profile?.display_name ?? undefined,
              subject: built.subject,
              htmlContent: built.html,
              textContent: built.text,
            });
            console.log("[scan] email result", sent);
          }
        }
      } catch (e) {
        console.error("[scan] email failed", e);
      }
    }

    return { log: row, triage };
  });

// Past scans for the CURRENT sit only — gives the sitter day-to-day continuity
// (e.g. "did the droppings look like this yesterday?") without exposing the
// bird's full historical record from other sitters or the owner.
export const getSitterScans = createServerFn({ method: "GET" })
  .inputValidator((d: { token: string; birdId: string }) =>
    z.object({ token: z.string().min(8), birdId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data }) => {
    const sb = await getAdmin();
    const sit = await loadSitByToken(data.token);
    await assertBirdInSit(sit.id, data.birdId);
    const { data: scans } = await sb
      .from("daily_logs")
      .select("*")
      .eq("sit_id", sit.id)
      .eq("bird_id", data.birdId)
      .order("created_at", { ascending: false });
    const ids = (scans ?? []).map((s: any) => s.id);
    let photos: any[] = [];
    if (ids.length) {
      const { data: p } = await sb.from("photo_logs").select("*").in("daily_log_id", ids);
      photos = p ?? [];
    }
    return (scans ?? []).map((s: any) => ({
      ...s,
      photos: photos.filter((p: any) => p.daily_log_id === s.id),
    }));
  });

// Per-bird status for the multi-bird landing dashboard: tasks done/total today
// and today's health-scan status. Same underlying data as the Today tab, so the
// dashboard and a bird's Today card always agree.
export const getSitterDashboard = createServerFn({ method: "GET" })
  .inputValidator((d: { token: string }) => z.object({ token: z.string().min(8) }).parse(d))
  .handler(async ({ data }) => {
    const sb = await getAdmin();
    const sit = await loadSitByToken(data.token);
    const birdIds = await loadSitBirdIds(sit.id);
    const today = new Date().toISOString().slice(0, 10);

    const [birdsRes, plansRes, compsRes, scansRes] = await Promise.all([
      sb.from("birds").select("id, name, species, photo_url, photo_position").in("id", birdIds),
      sb.from("care_plans").select("id, bird_id").in("bird_id", birdIds),
      sb.from("task_completions").select("routine_task_id").eq("sit_id", sit.id).eq("completed_date", today),
      sb.from("daily_logs").select("bird_id, triage_status").eq("sit_id", sit.id).eq("log_date", today).in("bird_id", birdIds),
    ]);

    const plans = plansRes.data ?? [];
    const planByBird = new Map(plans.map((p: any) => [p.bird_id, p.id]));
    const planIds = plans.map((p: any) => p.id);
    const tasksRes = planIds.length
      ? await sb.from("routine_tasks").select("id, care_plan_id").in("care_plan_id", planIds)
      : { data: [] as any[] };
    const tasks = tasksRes.data ?? [];
    const doneTaskIds = new Set((compsRes.data ?? []).map((c: any) => c.routine_task_id));
    const scans = scansRes.data ?? [];
    const rank = (s: string) => (s === "red" ? 0 : s === "yellow" ? 1 : 2);
    const order = new Map(birdIds.map((id, i) => [id, i]));

    const summary = (birdsRes.data ?? [])
      .map((b: any) => {
        const planId = planByBird.get(b.id);
        const birdTasks = tasks.filter((t: any) => t.care_plan_id === planId);
        const birdScans = scans.filter((s: any) => s.bird_id === b.id);
        const scanStatus = birdScans.length
          ? birdScans.slice().sort((x: any, y: any) => rank(x.triage_status) - rank(y.triage_status))[0].triage_status
          : null;
        return {
          id: b.id,
          name: b.name,
          species: b.species,
          photo_url: b.photo_url,
          photo_position: b.photo_position,
          tasksDone: birdTasks.filter((t: any) => doneTaskIds.has(t.id)).length,
          tasksTotal: birdTasks.length,
          scanDone: birdScans.length > 0,
          scanStatus,
        };
      })
      .sort((a: any, b: any) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));

    // Sign photo paths → URLs (legacy data: URLs pass through).
    const signedSummary = await Promise.all(
      summary.map(async (b: any) => ({ ...b, photo_url: await signBirdPhotoPath(sb, b.photo_url) })),
    );

    return { birds: signedSummary };
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
