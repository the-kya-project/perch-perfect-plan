// Permanent account deletion. The authenticated caller can wipe only their
// own data; service-role is loaded inside the handler so it never enters
// the client bundle.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { finishAccountDeletion } from "./accountDeletion";
import type { SweepFailure } from "./storageSweep";

export {
  STORAGE_LIST_PAGE_SIZE, STORAGE_MAX_DEPTH, STORAGE_MAX_PREFIXES, STORAGE_REMOVE_BATCH_SIZE,
  deleteAllUnderPrefix, type SweepFailure,
} from "./storageSweep";

export const deleteMyAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const userId = context.userId;

    // Best-effort wipe of storage objects owned by this user, then DB rows,
    // then the auth user itself. ON DELETE CASCADE on related tables takes
    // care of children of birds/sits/care_plans, but we delete explicitly
    // so anything without a cascade still goes.
    const { data: birds, error: birdsError } = await supabaseAdmin
      .from("birds")
      .select("id")
      .eq("owner_id", userId);
    // Without the bird list, their files can't be found once the birds are
    // deleted below, so stop here (nothing deleted yet) and let them retry.
    if (birdsError) throw new Error(`Could not read your birds: ${birdsError.message}`);
    const birdIds = (birds ?? []).map((b: any) => b.id as string);

    // Every media object we could not remove. Deleting the account is the
    // promise we make to the user (and to Play); a file we cannot delete must
    // not strand them with a live account. So these are collected and logged
    // with exact paths rather than thrown.
    //
    // The trade-off, deliberately taken: rows are the only lookup path to these
    // files, so continuing past a storage failure orphans bytes permanently.
    // That is why the log below carries bucket + full path — it is the sole
    // record left once the rows are gone.
    //
    // Which files, and why each rule: accountMedia.ts. It reads everything it
    // needs first (the rows are the only way to find the files), so it runs
    // before any row delete below. A read error stops the deletion here with
    // nothing deleted, so trying again starts from a full picture.
    const { deleteAccountMedia } = await import("./accountMedia");
    const { deleteStreamUids, forgetClipUids } = await import("./birdMedia.functions");
    const media = await deleteAccountMedia(supabaseAdmin as any, userId, birdIds, { deleteStreamUids, forgetClipUids });
    const mediaFailures: SweepFailure[] = media.failures;

    if (mediaFailures.length) {
      // The only surviving record of these objects once the rows are deleted.
      console.error(
        `[deleteMyAccount] user=${userId}: ${mediaFailures.length} media object(s) could not be deleted; ` +
          `account deletion continued and these are now orphaned: ${JSON.stringify(mediaFailures)}`,
      );
    }

    // Row deletes used to ignore their error entirely — a failure here was
    // invisible AND left data behind under a deleted auth user. Still not fatal
    // (most are belt-and-braces over ON DELETE CASCADE), but now recorded.
    const rowFailures: string[] = [];
    async function del(label: string, q: PromiseLike<{ error: { message: string } | null }>) {
      const { error } = await q;
      if (error) rowFailures.push(`${label}: ${error.message}`);
    }

    if (birdIds.length) {
      // Children of birds
      await del("photo_logs", supabaseAdmin.from("photo_logs").delete().in("bird_id", birdIds));
      await del("weight_logs", supabaseAdmin.from("weight_logs").delete().in("bird_id", birdIds));
      await del("weight_entries", supabaseAdmin.from("weight_entries").delete().in("bird_id", birdIds));
      await del("daily_logs", supabaseAdmin.from("daily_logs").delete().in("bird_id", birdIds));
      await del("emergency_contacts", supabaseAdmin.from("emergency_contacts").delete().in("bird_id", birdIds));

      const { data: plans } = await supabaseAdmin
        .from("care_plans")
        .select("id")
        .in("bird_id", birdIds);
      const planIds = (plans ?? []).map((p: any) => p.id as string);
      if (planIds.length) {
        await del("routine_tasks", supabaseAdmin.from("routine_tasks").delete().in("care_plan_id", planIds));
      }
      await del("care_plans", supabaseAdmin.from("care_plans").delete().in("bird_id", birdIds));
      await del("sit_birds(bird)", supabaseAdmin.from("sit_birds").delete().in("bird_id", birdIds));
    }

    // Sits owned by this user
    const { data: sits } = await supabaseAdmin
      .from("sits")
      .select("id")
      .eq("owner_id", userId);
    const sitIds = (sits ?? []).map((s: any) => s.id as string);
    if (sitIds.length) {
      await del("task_completions", supabaseAdmin.from("task_completions").delete().in("sit_id", sitIds));
      await del("sit_checklist_items", supabaseAdmin.from("sit_checklist_items").delete().in("sit_id", sitIds));
      await del("sit_birds(sit)", supabaseAdmin.from("sit_birds").delete().in("sit_id", sitIds));
      await del("photo_logs(sit)", supabaseAdmin.from("photo_logs").delete().in("sit_id", sitIds));
      await del("daily_logs(sit)", supabaseAdmin.from("daily_logs").delete().in("sit_id", sitIds));
    }
    await del("sits", supabaseAdmin.from("sits").delete().eq("owner_id", userId));
    await del("birds", supabaseAdmin.from("birds").delete().eq("owner_id", userId));
    await del("owner_emergency_defaults", supabaseAdmin.from("owner_emergency_defaults").delete().eq("owner_id", userId));
    await del("owner_home_defaults", supabaseAdmin.from("owner_home_defaults").delete().eq("owner_id", userId));
    await del("profiles", supabaseAdmin.from("profiles").delete().eq("id", userId));

    if (rowFailures.length) {
      console.error(`[deleteMyAccount] user=${userId}: row cleanup errors: ${JSON.stringify(rowFailures)}`);
    }

    // Finally, delete the auth user (also revokes all sessions; fatal on
    // failure, and everything above is CASCADEd by it anyway), then their
    // PostHog person, events and recordings (best-effort, awaited). See
    // accountDeletion.ts for why that order and those failure rules.
    const { deletePostHogPerson } = await import("./posthogPersons.server");
    const { analyticsDeleted } = await finishAccountDeletion(
      { deleteAuthUser: (id) => supabaseAdmin.auth.admin.deleteUser(id), deletePostHogPerson },
      userId,
    );

    return {
      ok: true,
      mediaFailures: mediaFailures.length,
      rowFailures: rowFailures.length,
      analyticsDeleted,
    };
  });
