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

// Depth budget for the recursive walk. Real paths are 2 segments
// (`<owner|bird>/<uuid>.jpg`); the deepest shape ever written was the legacy
// `<userId>/baselines/<birdId>/droppings-*.jpeg` at 4. 8 is far above anything
// real, and bounds the walk if a bucket ever returns a cyclic or malformed
// listing so a deletion can't spin.
export const STORAGE_MAX_DEPTH = 8;
// Second, independent bound: total folders we will open. Depth alone doesn't
// stop a pathologically wide tree.
export const STORAGE_MAX_PREFIXES = 10_000;

/** One object we could not remove. Logged so an operator can finish the job. */
export type SweepFailure = { bucket: string; path: string; reason: string };

// Supabase returns folders inside a listing as placeholder rows with a null id
// (real objects always carry one). This is the only way to tell them apart.
function isFolderRow(row: { id?: string | null }): boolean {
  return row.id == null;
}

/**
 * Delete every object under `<prefix>/` in a bucket, at ANY depth.
 *
 * `.list()` is NOT recursive: it returns the immediate children of one prefix,
 * with sub-folders as null-id placeholder rows. The previous version pushed
 * those placeholder names straight into `.remove()`, which silently no-ops on a
 * path that isn't an object — so anything nested survived deletion while the
 * sweep reported success. That is how
 * `bird-photos/<userId>/baselines/<birdId>/droppings-*.jpeg` outlived an
 * account deletion. We now walk the tree.
 *
 * Never throws for a per-object or per-listing failure: it returns them. The
 * caller decides whether a failure is fatal — account deletion must finish
 * (an undeletable file must not strand a user with a live account), while
 * single-bird deletion stays fail-closed.
 */
export async function deleteAllUnderPrefix(
  storage: AdminStorage,
  bucket: string,
  prefix: string,
  pageSize: number = STORAGE_LIST_PAGE_SIZE,
): Promise<{ deleted: number; failures: SweepFailure[] }> {
  const bucketApi = storage.from(bucket);
  const failures: SweepFailure[] = [];
  const paths: string[] = [];

  // Breadth-first over prefixes. Collect every object first, remove after, so
  // deletions never shift the offsets we're still reading.
  const queue: Array<{ prefix: string; depth: number }> = [{ prefix, depth: 0 }];
  let opened = 0;

  while (queue.length) {
    const { prefix: dir, depth } = queue.shift()!;
    if (++opened > STORAGE_MAX_PREFIXES) {
      failures.push({ bucket, path: dir, reason: `walk stopped: more than ${STORAGE_MAX_PREFIXES} folders` });
      break;
    }

    for (let offset = 0; ; ) {
      const { data: page, error } = await bucketApi.list(dir, { limit: pageSize, offset });
      if (error) {
        failures.push({ bucket, path: dir, reason: `list failed: ${error.message}` });
        break;
      }
      const rows = page ?? [];
      for (const row of rows) {
        const full = `${dir}/${row.name}`;
        if (isFolderRow(row)) {
          if (depth + 1 > STORAGE_MAX_DEPTH) {
            failures.push({ bucket, path: full, reason: `deeper than ${STORAGE_MAX_DEPTH} levels; not walked` });
          } else {
            queue.push({ prefix: full, depth: depth + 1 });
          }
        } else {
          paths.push(full);
        }
      }
      if (rows.length < pageSize) break;
      offset += rows.length;
    }
  }

  let deleted = 0;
  for (let i = 0; i < paths.length; i += STORAGE_REMOVE_BATCH_SIZE) {
    const chunk = paths.slice(i, i + STORAGE_REMOVE_BATCH_SIZE);
    const { error } = await bucketApi.remove(chunk);
    if (!error) {
      deleted += chunk.length;
      continue;
    }
    // A batch error says nothing about WHICH path failed, and we need exact
    // paths in the log for anyone cleaning up. Retry one at a time to find out.
    for (const path of chunk) {
      const { error: one } = await bucketApi.remove([path]);
      if (one) failures.push({ bucket, path, reason: `remove failed: ${one.message}` });
      else deleted++;
    }
  }

  return { deleted, failures };
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

    // Every media object we could not remove. Deleting the account is the
    // promise we make to the user (and to Play); a file we cannot delete must
    // not strand them with a live account. So these are collected and logged
    // with exact paths rather than thrown.
    //
    // The trade-off, deliberately taken: rows are the only lookup path to these
    // files, so continuing past a storage failure orphans bytes permanently.
    // That is why the log below carries bucket + full path — it is the sole
    // record left once the rows are gone.
    const mediaFailures: SweepFailure[] = [];

    async function sweep(bucket: string, prefix: string) {
      try {
        const { failures } = await deleteAllUnderPrefix(supabaseAdmin.storage, bucket, prefix);
        mediaFailures.push(...failures);
      } catch (e: any) {
        // deleteAllUnderPrefix reports per-object failures rather than throwing,
        // so reaching here means something unexpected (a client/network fault).
        mediaFailures.push({ bucket, path: prefix, reason: `sweep threw: ${e?.message ?? e}` });
      }
    }

    // bird-photos is keyed by the owner-uid folder; journal/moment, scan and
    // attachment files are keyed by bird id.
    await sweep("bird-photos", userId);
    for (const birdId of birdIds) {
      await sweep("journal-photos", birdId);
      await sweep("scan-photos", birdId);
      await sweep("journal-attachments", birdId);
    }

    // Cloudflare Stream clips live outside Supabase entirely, so no bucket
    // sweep reaches them. A clip that fails to delete — a stale uid, a missing
    // CLOUDFLARE_* env, Cloudflare being down — is logged like a file, not
    // fatal: the alternative is an account that can never be deleted because of
    // a video the user cannot see.
    //
    // The uids come from clip_assets, not from the nine care_plans columns.
    // Those columns hold only the CURRENT clip per slot, so a replaced clip, or
    // one uploaded and abandoned before the care plan saved, was never seen
    // here and its video was orphaned for good. The registry records every mint.
    //
    // ORDERING: this runs while every row still exists. clip_assets cascades on
    // bird_id, so reading it after the row deletes below would read nothing and
    // silently orphan every video. Nothing above this point deletes a row.
    if (birdIds.length) {
      try {
        const { clipUidsForBirds, deleteStreamUids, forgetClipUids } = await import("./birdMedia.functions");
        const uids = await clipUidsForBirds(supabaseAdmin, birdIds);
        const { deletedUids, failures } = await deleteStreamUids(uids);
        // Rows for videos confirmed gone. The birds are deleted below and would
        // cascade these anyway, but that only holds while this stays in the
        // same function as the row deletes.
        await forgetClipUids(supabaseAdmin, deletedUids);
        for (const f of failures) {
          mediaFailures.push({ bucket: "cloudflare-stream", path: f.uid, reason: f.reason });
        }
      } catch (e: any) {
        mediaFailures.push({
          bucket: "cloudflare-stream",
          path: birdIds.join(","),
          reason: `clip cleanup threw: ${e?.message ?? e}`,
        });
      }
    }

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
    await del("profiles", supabaseAdmin.from("profiles").delete().eq("id", userId));

    if (rowFailures.length) {
      console.error(`[deleteMyAccount] user=${userId}: row cleanup errors: ${JSON.stringify(rowFailures)}`);
    }

    // Finally, delete the auth user (also revokes all sessions). This one IS
    // fatal: if it fails the account still exists, and reporting success would
    // be a lie. Everything above is CASCADEd by this delete anyway.
    const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (error) throw new Error(error.message);

    return { ok: true, mediaFailures: mediaFailures.length, rowFailures: rowFailures.length };
  });
