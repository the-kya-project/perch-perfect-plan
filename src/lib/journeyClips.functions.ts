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
