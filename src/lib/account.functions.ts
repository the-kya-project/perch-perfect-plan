// Permanent account deletion. The authenticated caller can wipe only their
// own data; service-role is loaded inside the handler so it never enters
// the client bundle.

import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

type AdminStorage = SupabaseClient<Database>["storage"];

// Production page size for storage listing. `.list()` defaults to 100 and caps
// silently — without an advancing offset, objects beyond one page are never
// deleted. Kept as a named constant (overridable via the helper's `pageSize`
// argument) so the pagination loop can be proven with a handful of objects.
export const STORAGE_LIST_PAGE_SIZE = 1000;

// `.remove()` has no client-side cap; the Storage API rejects oversized delete
// requests server-side, so we chunk paths to stay comfortably under that limit.
export const STORAGE_REMOVE_BATCH_SIZE = 100;

// Delete every object under `<prefix>/` in a bucket, paging through the full
// listing and chunking the removals. Throws on the first storage error so the
// caller can abort before deleting the database rows that point at these files.
export async function deleteAllUnderPrefix(
  storage: AdminStorage,
  bucket: string,
  prefix: string,
  pageSize: number = STORAGE_LIST_PAGE_SIZE,
): Promise<void> {
  const bucketApi = storage.from(bucket);
  const paths: string[] = [];

  // Page until a short page signals the end. Collect first, remove after, so
  // deletions never shift the offsets we're still reading.
  for (let offset = 0; ; ) {
    const { data: page, error } = await bucketApi.list(prefix, { limit: pageSize, offset });
    if (error) throw new Error(`storage.list failed for ${bucket}/${prefix}: ${error.message}`);
    const rows = page ?? [];
    for (const f of rows) paths.push(`${prefix}/${f.name}`);
    if (rows.length < pageSize) break;
    offset += rows.length;
  }

  for (let i = 0; i < paths.length; i += STORAGE_REMOVE_BATCH_SIZE) {
    const { error } = await bucketApi.remove(paths.slice(i, i + STORAGE_REMOVE_BATCH_SIZE));
    if (error) throw new Error(`storage.remove failed for ${bucket}: ${error.message}`);
  }
}

export const deleteMyAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const userId = context.userId;

    // Best-effort wipe of storage objects owned by this user, then DB rows,
    // then the auth user itself. ON DELETE CASCADE on related tables takes
    // care of children of birds/sits/care_plans, but we delete explicitly
    // so anything without a cascade still goes.
    const { data: birds } = await supabaseAdmin
      .from("birds")
      .select("id")
      .eq("owner_id", userId);
    const birdIds = (birds ?? []).map((b: any) => b.id as string);

    // Remove Storage objects BEFORE any row deletion. bird-photos is keyed by
    // the owner-uid folder; journal/moment and scan photos are keyed by bird id.
    // If any bucket cleanup fails we abort here with the account fully intact:
    // the rows are the only lookup path to these files, so deleting them on a
    // partial storage failure would turn a retryable error into permanent
    // orphaned user data. Surface an honest, retryable failure instead.
    try {
      await deleteAllUnderPrefix(supabaseAdmin.storage, "bird-photos", userId);
      for (const birdId of birdIds) {
        await deleteAllUnderPrefix(supabaseAdmin.storage, "journal-photos", birdId);
        await deleteAllUnderPrefix(supabaseAdmin.storage, "scan-photos", birdId);
        await deleteAllUnderPrefix(supabaseAdmin.storage, "journal-attachments", birdId);
      }
      // Cloudflare Stream clips live outside Supabase entirely, so no bucket
      // sweep reaches them. Same ordering rule: the care_plans rows are the only
      // record of these uids, so the videos go before the rows do — otherwise
      // they bill forever with nothing left pointing at them.
      if (birdIds.length) {
        const { data: plans } = await supabaseAdmin
          .from("care_plans")
          .select(
            "baseline_clip_path, clip_anything_else_path, clip_bedtime_path, clip_food_prep_path, " +
              "clip_food_water_path, clip_locations_path, clip_step_up_path, clip_targeting_path, clip_toys_foraging_path",
          )
          .in("bird_id", birdIds);
        const refs: string[] = [];
        for (const row of (plans ?? []) as unknown as Array<Record<string, unknown>>) {
          for (const v of Object.values(row)) if (typeof v === "string" && v) refs.push(v);
        }
        const { deleteStreamClips } = await import("./birdMedia.functions");
        await deleteStreamClips(refs);
      }
    } catch (e: any) {
      throw new Error(
        `Account deletion did not complete: your photos could not be removed (${e?.message ?? "storage error"}). ` +
          "No account data was deleted — please try again.",
      );
    }

    if (birdIds.length) {
      // Children of birds
      await supabaseAdmin.from("photo_logs").delete().in("bird_id", birdIds);
      await supabaseAdmin.from("weight_logs").delete().in("bird_id", birdIds);
      await supabaseAdmin.from("daily_logs").delete().in("bird_id", birdIds);
      await supabaseAdmin.from("emergency_contacts").delete().in("bird_id", birdIds);

      const { data: plans } = await supabaseAdmin
        .from("care_plans")
        .select("id")
        .in("bird_id", birdIds);
      const planIds = (plans ?? []).map((p: any) => p.id as string);
      if (planIds.length) {
        await supabaseAdmin.from("routine_tasks").delete().in("care_plan_id", planIds);
      }
      await supabaseAdmin.from("care_plans").delete().in("bird_id", birdIds);
      await supabaseAdmin.from("sit_birds").delete().in("bird_id", birdIds);
    }

    // Sits owned by this user
    const { data: sits } = await supabaseAdmin
      .from("sits")
      .select("id")
      .eq("owner_id", userId);
    const sitIds = (sits ?? []).map((s: any) => s.id as string);
    if (sitIds.length) {
      await supabaseAdmin.from("task_completions").delete().in("sit_id", sitIds);
      await supabaseAdmin.from("sit_checklist_items").delete().in("sit_id", sitIds);
      await supabaseAdmin.from("sit_birds").delete().in("sit_id", sitIds);
      await supabaseAdmin.from("photo_logs").delete().in("sit_id", sitIds);
      await supabaseAdmin.from("daily_logs").delete().in("sit_id", sitIds);
    }
    await supabaseAdmin.from("sits").delete().eq("owner_id", userId);
    await supabaseAdmin.from("birds").delete().eq("owner_id", userId);
    await supabaseAdmin.from("owner_emergency_defaults").delete().eq("owner_id", userId);

    // Marketing-contact record + profile
    await supabaseAdmin.from("profiles").delete().eq("id", userId);

    // Finally, delete the auth user (also revokes all sessions).
    const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (error) throw new Error(error.message);

    return { ok: true };
  });
