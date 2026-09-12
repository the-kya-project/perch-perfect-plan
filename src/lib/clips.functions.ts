// Server functions for the Cloudflare Stream clip pipeline. Owner-authenticated;
// the Cloudflare token is read server-side only (cloudflareStream.server.ts).

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { CF_UID_RE, CLIP_COLUMNS, cfRef } from "@/lib/clipRef";

const MAX_CLIP_SECONDS = 60;

// A Cloudflare uid is 32 hex chars. Validating the exact shape rather than just
// a length keeps a uid safe to use as a lookup key and rejects anything
// structured before it reaches a query.
const uidInput = z.object({ uid: z.string().regex(CF_UID_RE) });

/**
 * Authorize a caller for one clip.
 *
 * The uid -> bird binding comes from `clip_assets`, which is written ONLY by
 * createClipUpload below, under the service role, with RLS on and no policies
 * so no client can read or write it. The caller cannot forge the binding.
 *
 * This replaces an earlier rule — "the caller can see a care_plans row
 * referencing this uid" — which was bypassable and verified to be so: care_plans
 * is user-writable, so an attacker wrote a victim's uid into their OWN care plan
 * and passed honestly. Authorization must never be sourced from a table the
 * caller can write.
 *
 * Access to the resolved bird is then decided by the CALLER'S client
 * (context.supabase: publishable key + their bearer token) against the existing
 * `birds read` policy — owner_id = auth.uid() OR has_capability(id, uid,
 * 'view') — so owners and household members pass and the access rules stay in
 * one place.
 *
 * Unknown uid and unauthorized uid both raise the same "Not found.", and the
 * check runs before Cloudflare is contacted, so nothing about a uid's existence
 * leaks — not via the message, not via timing a Cloudflare 404 against a 200.
 *
 * Sitters never reach this: they are not Supabase users (requireSupabaseAuth
 * refuses them first) and get clips from sitter.functions via the invite token.
 */
async function resolveAuthorizedClip(
  callerSb: SupabaseClient,
  uid: string,
): Promise<{ birdId: string }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // 1. Server-authored binding: which bird does this uid belong to?
  const { data: asset } = await supabaseAdmin
    .from("clip_assets")
    .select("bird_id")
    .eq("uid", uid)
    .maybeSingle();
  if (!asset) throw new Error("Not found.");
  const birdId = asset.bird_id;

  // 2. Does the CALLER have access to that bird? RLS decides.
  const { data: bird, error } = await callerSb
    .from("birds")
    .select("id")
    .eq("id", birdId)
    .maybeSingle();
  if (error || !bird) throw new Error("Not found.");

  return { birdId };
}

/**
 * Create a resumable (tus) direct-upload URL + video uid for the owner's
 * browser to upload to. uploadLength is the file's byte size (tus needs it).
 *
 * birdId is required: the uid is registered against that bird HERE, before the
 * uid is handed to the client, so the binding exists from the moment the clip
 * does and every later authorization has something unforgeable to resolve.
 */
export const createClipUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { uploadLength: number; birdId: string }) =>
    z
      .object({
        uploadLength: z.number().int().positive().max(2_000_000_000),
        birdId: z.string().uuid(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const callerSb = (context as any).supabase as SupabaseClient;

    // Only register a clip against a bird the caller can actually reach. RLS
    // decides, same policy as the read path.
    const { data: bird, error } = await callerSb
      .from("birds")
      .select("id")
      .eq("id", data.birdId)
      .maybeSingle();
    if (error || !bird) throw new Error("Not found.");

    const { createTusDirectUpload } = await import("@/lib/cloudflareStream.server");
    const upload = await createTusDirectUpload({
      uploadLength: data.uploadLength,
      maxDurationSeconds: MAX_CLIP_SECONDS,
      creator: (context as any).userId,
    });

    // Register BEFORE returning. If this insert fails the caller gets an error
    // and no uid, rather than a clip nothing can ever authorize.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: regErr } = await supabaseAdmin
      .from("clip_assets")
      .insert({ uid: upload.uid, bird_id: data.birdId });
    if (regErr) {
      console.error(`[createClipUpload] clip_assets insert failed uid=${upload.uid}: ${regErr.message}`);
      throw new Error("Couldn't start the upload. Please try again.");
    }

    return upload;
  });

/** Poll a video's transcode status (owner shows "Processing…" until ready). */
export const getClipStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { uid: string }) => uidInput.parse(d))
  .handler(async ({ data, context }) => {
    await resolveAuthorizedClip((context as any).supabase, data.uid);
    const { getVideoStatus } = await import("@/lib/cloudflareStream.server");
    return await getVideoStatus(data.uid);
  });

/** A signed, private playback iframe URL for the owner's own preview. */
export const getOwnerClipUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { uid: string }) => uidInput.parse(d))
  .handler(async ({ data, context }) => {
    // The more important of the two gates: this mints a signed PLAYBACK URL,
    // so without it any signed-in user holding a uid could watch the video.
    await resolveAuthorizedClip((context as any).supabase, data.uid);
    const { signedIframeUrl } = await import("@/lib/cloudflareStream.server");
    return { url: await signedIframeUrl(data.uid) };
  });

/**
 * Delete the Cloudflare asset of a clip that has just been REPLACED.
 *
 * Called fire-and-forget by commitClipRef AFTER the new ref is saved. Never
 * throws for a Cloudflare failure and never reports one to the user: a missed
 * delete is an orphan the registry sweep reclaims when the bird or account is
 * deleted.
 *
 * Authorization, in two parts with different jobs:
 *   - GRANT comes from the server-authored binding: the caller must be able to
 *     see the bird clip_assets binds this uid to (resolveAuthorizedClip).
 *     Unknown and unauthorized uids return identically and silently.
 *   - SAFETY comes from care_plans, and only ever to REFUSE: nothing is deleted
 *     while any of that bird's clip columns still references the uid. That
 *     makes "save first" a server guarantee, not just client call order — if the
 *     new ref didn't land, the old uid is still referenced and this refuses. It
 *     also means the worst any caller can do is garbage-collect a clip that is
 *     already unused. Reading user-writable data here can't escalate anything:
 *     the only people who can unreference a clip are that bird's editors, who
 *     could replace it anyway.
 *
 * The Cloudflare call is AWAITED before returning. Vercel freezes work left
 * running after a server function returns, so the fire-and-forget belongs on
 * the client, never inside this handler.
 */
export async function retireReplacedClipWith(
  callerSb: SupabaseClient,
  uid: string,
): Promise<{ deleted: boolean }> {
  let birdId: string;
  try {
    ({ birdId } = await resolveAuthorizedClip(callerSb, uid));
  } catch {
    return { deleted: false };
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // uid is 32-hex (uidInput), so it is safe inside the PostgREST `or` filter.
  const ref = cfRef(uid);
  const filter = CLIP_COLUMNS.map((col) => `${col}.eq.${ref}`).join(",");
  const { data: stillUsed, error } = await supabaseAdmin
    .from("care_plans")
    .select("id")
    .eq("bird_id", birdId)
    .or(filter)
    .limit(1);
  if (error) {
    console.error(`[retireReplacedClip] uid=${uid} bird=${birdId}: reference check failed: ${error.message}`);
    return { deleted: false };
  }
  if (stillUsed?.length) return { deleted: false };

  const { deleteStreamUids, forgetClipUids } = await import("./birdMedia.functions");
  const { deletedUids, failures } = await deleteStreamUids([uid]);
  if (failures.length) {
    // Registry row deliberately KEPT: it is the only record left that this
    // video exists, and the bird/account sweep reclaims it from there.
    console.error(`[retireReplacedClip] uid=${uid} bird=${birdId}: ${failures[0].reason}`);
    return { deleted: false };
  }
  // Confirmed gone from Cloudflare, so drop the registry row — the same rule the
  // deletion sweep follows, so clip_assets keeps one meaning: uids that may
  // still exist on Cloudflare.
  await forgetClipUids(supabaseAdmin, deletedUids);
  return { deleted: true };
}

export const retireReplacedClip = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { uid: string }) => uidInput.parse(d))
  .handler(async ({ data, context }) =>
    retireReplacedClipWith((context as any).supabase as SupabaseClient, data.uid),
  );
