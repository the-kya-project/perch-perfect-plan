// Server functions for the Cloudflare Stream clip pipeline. Owner-authenticated;
// the Cloudflare token is read server-side only (cloudflareStream.server.ts).

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const MAX_CLIP_SECONDS = 60;

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

/** Poll a video's transcode status (owner shows "Processing…" until ready). */
export const getClipStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { uid: string }) => z.object({ uid: z.string().min(1).max(120) }).parse(d))
  .handler(async ({ data }) => {
    const { getVideoStatus } = await import("@/lib/cloudflareStream.server");
    return await getVideoStatus(data.uid);
  });

/** A signed, private playback iframe URL for the owner's own preview. */
export const getOwnerClipUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { uid: string }) => z.object({ uid: z.string().min(1).max(120) }).parse(d))
  .handler(async ({ data }) => {
    const { signedIframeUrl } = await import("@/lib/cloudflareStream.server");
    return { url: await signedIframeUrl(data.uid) };
  });
