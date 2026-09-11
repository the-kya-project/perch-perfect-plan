// Server functions for the Cloudflare Stream clip pipeline. Owner-authenticated;
// the Cloudflare token is read server-side only (cloudflareStream.server.ts).

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { CLIP_COLUMNS, CF_UID_RE, cfRef } from "@/lib/clipRef";

const MAX_CLIP_SECONDS = 60;

// A Cloudflare uid is 32 hex chars. Validating the exact shape (not just a
// length) also keeps the value safe to interpolate into the PostgREST `or`
// filter below — no commas, dots or parens can reach it.
const uidInput = z.object({ uid: z.string().regex(CF_UID_RE) });

/**
 * Refuse unless the caller can see a care plan that references this clip.
 *
 * Runs through the CALLER'S client (context.supabase: publishable key + their
 * own bearer token), so the existing `care_plans read` RLS policy decides —
 * has_capability(bird_id, auth.uid(), 'view'), true for the owner and every
 * household member, false for everyone else. No second copy of the access
 * rules to drift.
 *
 * Checked BEFORE Cloudflare is contacted, and every refusal is the same
 * "Not found." whether or not the uid exists, so an unauthorized caller learns
 * nothing about existence — not from the message and not from triggering a
 * Cloudflare 404 versus a 200.
 *
 * Sitters never reach this: they are not Supabase users (requireSupabaseAuth
 * refuses them first), and they get clips from sitter.functions via the
 * invite token instead.
 */
async function assertCallerCanSeeClip(sb: SupabaseClient, uid: string): Promise<void> {
  const ref = cfRef(uid);
  const filter = CLIP_COLUMNS.map((col) => `${col}.eq.${ref}`).join(",");
  const { data, error } = await sb.from("care_plans").select("id").or(filter).limit(1);
  if (error || !data?.length) throw new Error("Not found.");
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

/** Poll a video's transcode status (owner shows "Processing…" until ready). */
export const getClipStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { uid: string }) => uidInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertCallerCanSeeClip((context as any).supabase, data.uid);
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
    await assertCallerCanSeeClip((context as any).supabase, data.uid);
    const { signedIframeUrl } = await import("@/lib/cloudflareStream.server");
    return { url: await signedIframeUrl(data.uid) };
  });
