// Remove every stored file belonging to ONE bird: the four Supabase buckets
// plus that bird's Cloudflare Stream clips. Called by both bird-delete paths
// BEFORE any row is deleted.
//
// Why a server function at all: bird deletion runs through the RLS-gated
// browser client, which can list and remove only what storage policies allow
// per object and cannot see another bucket's key shape. The account-deletion
// sweep already does this work with the service-role client; this is the
// per-bird equivalent, authorized by birds.owner_id instead of by session.
//
// ORDERING (same reasoning as deleteAccount): the rows are the only lookup path
// to these files, so media goes first and any failure throws. Deleting rows on
// a partial media failure would turn a retryable error into permanently
// orphaned data that nothing can find again. A caller that aborts here leaves
// the bird fully intact, which is the recoverable state.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { deleteAllUnderPrefix } from "./account.functions";
import { isCfClip, cfUid, CLIP_COLUMNS } from "./clipRef";

// Buckets keyed "<bird_id>/..." — a prefix sweep gets everything.
const BIRD_KEYED_BUCKETS = ["journal-photos", "scan-photos", "journal-attachments"] as const;


/**
 * True when a stored photo/clip value is a Storage object path rather than a
 * legacy inline `data:` URL or an absolute URL. Same predicate as
 * birdPhoto.isStoragePath, restated here because that module imports the
 * browser client at top level and cannot be pulled into a server function.
 */
function isStoragePath(value: string | null | undefined): value is string {
  return !!value && !value.startsWith("data:") && !value.startsWith("http");
}

async function getAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/** Every clip reference on a set of care plans, flattened and de-duplicated. */
function clipRefsFrom(rows: Array<Record<string, unknown>>): string[] {
  const refs = new Set<string>();
  for (const row of rows) {
    for (const col of CLIP_COLUMNS) {
      const v = row[col];
      if (typeof v === "string" && v) refs.add(v);
    }
  }
  return [...refs];
}

/** One clip we could not delete. Logged so the video can be chased manually. */
export type ClipFailure = { uid: string; reason: string };

/**
 * Every Cloudflare uid ever minted against these birds.
 *
 * MUST be called before anything deletes birds or care_plans: clip_assets has
 * ON DELETE CASCADE on bird_id, so a row deletion takes the uid list with it
 * and the videos become unreachable forever. Callers read this first and hold
 * the uids in memory.
 *
 * This is why the sweep no longer reads the nine care_plans clip columns for
 * uids: those hold only the CURRENT clip per slot, so a replaced clip — or one
 * uploaded and then abandoned before the care plan saved — was invisible and
 * its video orphaned. The registry records every mint.
 */
export async function clipUidsForBirds(sb: any, birdIds: string[]): Promise<string[]> {
  if (!birdIds.length) return [];
  const { data, error } = await sb.from("clip_assets").select("uid").in("bird_id", birdIds);
  if (error) throw new Error(`clip_assets read failed: ${error.message}`);
  return [...new Set(((data ?? []) as Array<{ uid: string }>).map((r) => r.uid))];
}

/**
 * Delete the given Cloudflare Stream videos.
 *
 * Per-uid failures are collected, not thrown: one bad uid used to abort the
 * loop and leave every later clip untouched. Callers decide what a failure
 * means — account deletion logs and continues, bird deletion still refuses.
 * An already-deleted clip is NOT a failure (deleteVideo treats 404 as success).
 */
export async function deleteStreamUids(
  uids: string[],
): Promise<{ deleted: number; deletedUids: string[]; failures: ClipFailure[] }> {
  const unique = [...new Set(uids)];
  const failures: ClipFailure[] = [];
  const deletedUids: string[] = [];
  // Return before importing the client: with no clips to delete there is
  // nothing to configure, so a missing CLOUDFLARE_* env must not surface here.
  if (!unique.length) return { deleted: 0, deletedUids, failures };

  try {
    const { deleteVideo } = await import("./cloudflareStream.server");
    for (const uid of unique) {
      try {
        await deleteVideo(uid);
        deletedUids.push(uid);
      } catch (e: any) {
        failures.push({ uid, reason: String(e?.message ?? e) });
      }
    }
  } catch (e: any) {
    // Import/creds blew up: nothing was attempted, so report every uid.
    for (const uid of unique) failures.push({ uid, reason: String(e?.message ?? e) });
  }
  return { deleted: deletedUids.length, deletedUids, failures };
}

/**
 * Drop registry rows for videos that are actually gone from Cloudflare.
 *
 * Cascade covers the usual case (the bird row goes moments later), but not
 * every one: a purge whose caller then fails to delete the bird would otherwise
 * leave rows pointing at videos that no longer exist. Best-effort — a stale row
 * is untidy, never harmful, and must not fail a deletion.
 */
export async function forgetClipUids(sb: any, uids: string[]): Promise<void> {
  if (!uids.length) return;
  const { error } = await sb.from("clip_assets").delete().in("uid", uids);
  if (error) console.error(`[forgetClipUids] could not drop ${uids.length} row(s): ${error.message}`);
}

/** Collect + delete all media for one bird. Shared by the server fn and tests. */
export async function purgeBirdMediaWith(
  sb: any,
  bird: { id: string; photo_url: string | null },
): Promise<{ birdPhotos: number; streamClips: number }> {
  const birdId = bird.id;

  // Registry FIRST, before anything can delete a row: clip_assets cascades on
  // bird_id, so reading it late would mean reading nothing.
  const uids = await clipUidsForBirds(sb, [birdId]);

  // care_plans is still read, but only for LEGACY clips — pre-Cloudflare refs
  // are Supabase Storage paths living in these same columns, and the registry
  // holds Cloudflare uids only.
  const { data: plans, error: planErr } = await sb
    .from("care_plans").select(CLIP_COLUMNS.join(",")).eq("bird_id", birdId);
  if (planErr) throw new Error(`care_plans read failed for ${birdId}: ${planErr.message}`);
  const refs = clipRefsFrom((plans ?? []) as Array<Record<string, unknown>>);

  // Stream FIRST. Both this and the bucket sweeps are individually
  // interruptible, and either order leaves rows pointing at something already
  // gone — but never orphaned bytes, which is the invariant that matters. Doing
  // the remote service first means the most likely failure (Stream env not
  // configured) aborts having touched no Supabase object at all, so a retry
  // starts from a completely clean state.
  // Single-bird deletion stays fail-closed, unlike account deletion: the bird
  // (and therefore the lookup path to its media) still exists, so the user can
  // simply retry. Refusing beats orphaning.
  const { deleted: streamClips, deletedUids, failures: clipFailures } = await deleteStreamUids(uids);
  // Drop registry rows for videos confirmed gone, even if a later uid failed —
  // those really are deleted and the row would be a lie.
  await forgetClipUids(sb, deletedUids);
  if (clipFailures.length) {
    throw new Error(
      `Stream clip delete failed for ${birdId}: ${clipFailures.map((f) => `${f.uid} (${f.reason})`).join("; ")}`,
    );
  }

  // bird-photos is keyed by OWNER, not bird, so it gets no prefix sweep — only
  // this bird's own photo plus any legacy (pre-Cloudflare) clips, which were
  // stored in this same bucket.
  const birdPhotoPaths = [
    ...(isStoragePath(bird.photo_url) ? [bird.photo_url] : []),
    ...refs.filter((r) => !isCfClip(r) && isStoragePath(r)),
  ];
  if (birdPhotoPaths.length) {
    const { error } = await sb.storage.from("bird-photos").remove(birdPhotoPaths);
    if (error) throw new Error(`storage.remove failed for bird-photos: ${error.message}`);
  }

  for (const bucket of BIRD_KEYED_BUCKETS) {
    const { failures } = await deleteAllUnderPrefix(sb.storage, bucket, birdId);
    if (failures.length) {
      throw new Error(
        `storage sweep failed for ${bucket}/${birdId}: ` +
          failures.map((f) => `${f.path} (${f.reason})`).join("; "),
      );
    }
  }

  return { birdPhotos: birdPhotoPaths.length, streamClips };
}

/**
 * What the owner sees when purgeBirdMedia fails. ONE string, imported by both
 * delete-bird screens (plan.editor.tsx and index.tsx) so they can't drift again.
 *
 * Deliberately does NOT say "nothing was deleted": storage and Stream deletes
 * are not atomic. A purge that fails partway has already permanently removed
 * whatever it reached first — verified by running purgeBirdMediaWith against a
 * store that fails on scan-photos: both clips, the profile photo and the
 * journal photos were gone before it threw. What IS true is that the bird row
 * survives (media runs before rows) and that retrying works: already-deleted
 * clips come back 404 from Cloudflare, which deleteVideo treats as success, and
 * already-removed files are simply absent from the next listing.
 */
export const BIRD_MEDIA_PURGE_FAILED =
  "We couldn't finish removing this bird's files, so the bird is still here. Please try again.";

/**
 * Owner-authorized purge of one bird's media. Call this and let it settle
 * BEFORE deleting the bird's rows.
 */
export const purgeBirdMedia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { birdId: string }) => z.object({ birdId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = await getAdmin();
    const ownerId = context.userId as string;

    // Service-role bypasses RLS, so ownership is checked explicitly here. A
    // household member with bird access is NOT allowed — deleting a bird is
    // owner-only (journal_entries/birds DELETE policies agree).
    const { data: bird, error } = await sb
      .from("birds").select("id, owner_id, photo_url").eq("id", data.birdId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!bird || (bird as any).owner_id !== ownerId) throw new Error("Not allowed.");

    try {
      return await purgeBirdMediaWith(sb, bird as { id: string; photo_url: string | null });
    } catch (e: any) {
      // The detail (bucket, full paths, clip uids) goes to the server log and
      // nowhere else. The client gets only the fixed message, so no path or
      // UUID can reach the UI — or even the network response.
      console.error(`[purgeBirdMedia] bird=${bird.id} owner=${ownerId}: ${e?.message ?? e}`);
      throw new Error(BIRD_MEDIA_PURGE_FAILED);
    }
  });
