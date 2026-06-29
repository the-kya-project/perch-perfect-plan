// Server functions for the Cloudflare Stream clip pipeline. Owner-authenticated;
// the Cloudflare token is read server-side only (cloudflareStream.server.ts).

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { CF_PREFIX } from "@/lib/clipRef";

const MAX_CLIP_SECONDS = 60;

// care_plans columns that can hold a "cfstream:<uid>" reference.
const CLIP_COLUMNS = [
  "clip_step_up_path", "clip_food_water_path", "clip_locations_path", "clip_bedtime_path", "baseline_clip_path",
] as const;

const FORBIDDEN = "Forbidden: you don't have access to this clip.";

// Is this uid stored on a care_plan the CALLER can view? Reads through the
// user-scoped (RLS) client from requireSupabaseAuth, so the care_plans SELECT
// policy (has_capability(bird_id, uid, 'view')) is the access check — the row
// only comes back if the caller is the owner or a permitted member. No parallel
// permission logic. Returns false when birdId is absent or nothing matches.
async function clipBelongsToViewableBird(sb: any, uid: string, birdId: string | undefined): Promise<boolean> {
  if (!birdId) return false;
  const ref = `${CF_PREFIX}${uid}`;
  const { data } = await sb
    .from("care_plans")
    .select(CLIP_COLUMNS.join(", "))
    .eq("bird_id", birdId)
    .maybeSingle();
  return !!data && CLIP_COLUMNS.some((c) => (data as any)[c] === ref);
}

/** Create a resumable (tus) direct-upload URL + video uid for the owner's
 *  browser to upload to. uploadLength is the file's byte size (tus needs it). */
export const createClipUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { uploadLength: number }) =>
    z.object({ uploadLength: z.number().int().positive().max(2_000_000_000) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { createTusDirectUpload } = await import("@/lib/cloudflareStream.server");
    return await createTusDirectUpload({
      uploadLength: data.uploadLength,
      maxDurationSeconds: MAX_CLIP_SECONDS,
      creator: (context as any).userId,
    });
  });

/** Poll a video's transcode status. Gated: the caller must either own/be a
 *  permitted member on a bird this uid is attached to (birdId), or be the
 *  uploader of a not-yet-persisted clip (Cloudflare `creator`). */
export const getClipStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { uid: string; birdId?: string }) =>
    z.object({ uid: z.string().min(1).max(120), birdId: z.string().uuid().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = (context as any).supabase;
    const userId = (context as any).userId as string;
    const { getVideoStatus } = await import("@/lib/cloudflareStream.server");

    // Proof (a): stored on a care_plan the caller can view → no extra CF call.
    if (await clipBelongsToViewableBird(sb, data.uid, data.birdId)) {
      return await getVideoStatus(data.uid);
    }
    // Proof (b): the caller uploaded it (creator stamped at upload). One CF call
    // serves both the gate and the returned status.
    const status = await getVideoStatus(data.uid);
    if (status.creator && status.creator === userId) return status;
    throw new Error(FORBIDDEN);
  });

/** A signed, private playback iframe URL. Gated identically to getClipStatus —
 *  never signs based on a caller-supplied uid alone. */
export const getOwnerClipUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { uid: string; birdId?: string }) =>
    z.object({ uid: z.string().min(1).max(120), birdId: z.string().uuid().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = (context as any).supabase;
    const userId = (context as any).userId as string;
    const { signedIframeUrl, getVideoStatus } = await import("@/lib/cloudflareStream.server");

    let allowed = await clipBelongsToViewableBird(sb, data.uid, data.birdId);
    if (!allowed) {
      const status = await getVideoStatus(data.uid);
      allowed = !!status.creator && status.creator === userId;
    }
    if (!allowed) throw new Error(FORBIDDEN);
    return { url: await signedIframeUrl(data.uid) };
  });
