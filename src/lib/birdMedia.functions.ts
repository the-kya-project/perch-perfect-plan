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
import { isCfClip, cfUid } from "./clipRef";

// Buckets keyed "<bird_id>/..." — a prefix sweep gets everything.
const BIRD_KEYED_BUCKETS = ["journal-photos", "scan-photos", "journal-attachments"] as const;

// Every column that can hold a clip reference. Kept here (not derived) so a new
// clip column is a deliberate edit rather than a silent leak.
const CLIP_COLUMNS = [
  "baseline_clip_path",
  "clip_anything_else_path",
  "clip_bedtime_path",
  "clip_food_prep_path",
  "clip_food_water_path",
  "clip_locations_path",
  "clip_step_up_path",
  "clip_targeting_path",
  "clip_toys_foraging_path",
] as const;

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

/**
 * Delete the Cloudflare Stream videos for the given refs. Non-cfstream refs are
 * ignored (legacy clips are Supabase objects and handled by the bucket sweep).
 * Throws on the first failure, so a caller aborts before dropping the rows that
 * hold these uids — once the row is gone the uid is unrecoverable and the video
 * bills forever.
 */
/** One clip we could not delete. Logged so the video can be chased manually. */
export type ClipFailure = { uid: string; reason: string };

/**
 * Delete every Cloudflare Stream clip referenced by `refs`.
 *
 * Per-uid failures are collected, not thrown: one bad uid used to abort the
 * loop and leave every later clip untouched. Callers decide what a failure
 * means — account deletion logs and continues, bird deletion still refuses.
 * An already-deleted clip is NOT a failure (deleteVideo treats 404 as success).
 */
export async function deleteStreamClips(
  refs: string[],
): Promise<{ deleted: number; failures: ClipFailure[] }> {
  const uids = [...new Set(refs.filter(isCfClip).map(cfUid))];
  const failures: ClipFailure[] = [];
  // Return before importing the client: with no clips to delete there is
  // nothing to configure, so a missing CLOUDFLARE_* env must not surface here.
  if (!uids.length) return { deleted: 0, failures };

  let deleted = 0;
  try {
    const { deleteVideo } = await import("./cloudflareStream.server");
    for (const uid of uids) {
      try {
        await deleteVideo(uid);
        deleted++;
      } catch (e: any) {
        failures.push({ uid, reason: String(e?.message ?? e) });
      }
    }
  } catch (e: any) {
    // Import/creds blew up: nothing was attempted, so report every uid.
    for (const uid of uids) failures.push({ uid, reason: String(e?.message ?? e) });
  }
  return { deleted, failures };
}

/** Collect + delete all media for one bird. Shared by the server fn and tests. */
export async function purgeBirdMediaWith(
  sb: any,
  bird: { id: string; photo_url: string | null },
): Promise<{ birdPhotos: number; streamClips: number }> {
  const birdId = bird.id;

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
  const { deleted: streamClips, failures: clipFailures } = await deleteStreamClips(refs);
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

    return purgeBirdMediaWith(sb, bird as { id: string; photo_url: string | null });
  });
