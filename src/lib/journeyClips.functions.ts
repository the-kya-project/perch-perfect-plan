// Uploads for journey clips (Community). The care app's createClipUpload caps
// every clip at 60 seconds; a journey clip's cap depends on the member's tier
// (public.journey_limits: free 60 s, app premium 5 min, Flock 20 min) and a
// journey may have a clip limit (free 10, app premium 20, Flock none).
//
// The database decides, as the caller: journey_clip_allowance() checks they can
// use journeys, have access to the bird, and (for an existing journey) haven't
// reached its clip limit, and returns the cap. Cloudflare is then told that cap
// (maxDurationSeconds), so a longer clip is refused at upload, whatever the
// browser does. The uid is registered to the bird in clip_assets before it is
// handed out, exactly as createClipUpload does.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const createJourneyClipUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { uploadLength: number; birdId: string; journeyId?: string | null }) =>
    z.object({
      uploadLength: z.number().int().positive().max(2_000_000_000),
      birdId: z.string().uuid(),
      journeyId: z.string().uuid().nullish(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const callerSb = (context as any).supabase;
    const { data: rows, error } = await callerSb.rpc("journey_clip_allowance", {
      p_bird_id: data.birdId,
      p_journey_id: data.journeyId ?? null,
    });
    const allowance = (rows as { max_seconds: number; max_upload_bytes: number; can_add: boolean }[] | null)?.[0];
    if (error || !allowance) throw new Error("Not found.");
    if (!allowance.can_add) throw new Error("This journey has reached its clip limit.");
    if (data.uploadLength > allowance.max_upload_bytes) throw new Error("That video is too large. Please record a shorter clip.");

    const { createTusDirectUpload } = await import("@/lib/cloudflareStream.server");
    const upload = await createTusDirectUpload({
      uploadLength: data.uploadLength,
      maxDurationSeconds: allowance.max_seconds,
      creator: (context as any).userId,
    });

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: regErr } = await supabaseAdmin.from("clip_assets").insert({ uid: upload.uid, bird_id: data.birdId });
    if (regErr) {
      console.error(`[createJourneyClipUpload] clip_assets insert failed uid=${upload.uid}: ${regErr.message}`);
      throw new Error("Couldn't start the upload. Please try again.");
    }
    return upload;
  });

/** A clip the caller may touch: registered to a bird (clip_assets, written only
 *  by the upload functions) that the caller's own client can read (RLS). */
async function authorizedClipBird(callerSb: any, uid: string): Promise<string> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: asset } = await supabaseAdmin.from("clip_assets").select("bird_id").eq("uid", uid).maybeSingle();
  if (!asset) throw new Error("Not found.");
  const { data: bird } = await callerSb.from("birds").select("id").eq("id", asset.bird_id).maybeSingle();
  if (!bird) throw new Error("Not found.");
  return asset.bird_id as string;
}

/** Trim a journey clip before posting: a new private copy of start..end,
 *  registered to the same bird. The member still posts it through
 *  journey_post_update, which checks the limits. */
export const trimJourneyClip = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { uid: string; start: number; end: number }) =>
    z.object({
      uid: z.string().regex(/^[A-Za-z0-9]{8,64}$/),
      start: z.number().min(0).max(3600),
      end: z.number().min(1).max(3600),
    }).refine((x) => x.end - x.start >= 1, "Keep at least a second.").parse(d),
  )
  .handler(async ({ data, context }) => {
    const birdId = await authorizedClipBird((context as any).supabase, data.uid);
    const { clipVideo } = await import("@/lib/cloudflareStream.server");
    const out = await clipVideo(data.uid, data.start, data.end, (context as any).userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("clip_assets").insert({ uid: out.uid, bird_id: birdId });
    if (error) {
      console.error(`[trimJourneyClip] clip_assets insert failed uid=${out.uid}: ${error.message}`);
      throw new Error("Couldn't trim the clip. Please try again.");
    }
    return { ref: `cfstream:${out.uid}` };
  });
