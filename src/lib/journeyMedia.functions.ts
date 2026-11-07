// Journey clips for viewers, and deleting a journey with its videos.
//
// Playback: the database decides who may see a journey (journey_clip_refs,
// asked as the caller: the bird's household, or a community journey for app
// premium and Flock members, never a "Just me" journey from outside the
// household). Only then does the server sign short-lived Cloudflare tokens and
// hand back the player URL, a thumbnail and an HLS manifest. Nobody gets a
// clip reference or an unsigned link.
//
// Delete: journey_delete (as the caller: the bird's owner or whoever started
// it) removes the journey and returns its clip references; the server then
// deletes those videos from Cloudflare and their clip_assets rows.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type JourneyClip = { updateId: string; player: string; thumbnail: string; hls: string };

const TTL = 3600;

export const getJourneyClips = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { journeyId: string; updateIds?: string[] | null }) =>
    z.object({ journeyId: z.string().uuid(), updateIds: z.array(z.string().uuid()).max(200).nullish() }).parse(d),
  )
  .handler(async ({ data, context }): Promise<JourneyClip[]> => {
    const { data: rows, error } = await (context as any).supabase
      .rpc("journey_clip_refs", { p_journey_id: data.journeyId, p_update_ids: data.updateIds ?? null });
    if (error) throw new Error("Not found.");
    const refs = ((rows ?? []) as { update_id: string; clip_ref: string }[])
      .filter((r) => /^cfstream:[A-Za-z0-9]{8,64}$/.test(r.clip_ref));
    if (refs.length === 0) return [];
    const { signPlaybackToken } = await import("@/lib/cloudflareStream.server");
    const out = await Promise.all(refs.map(async (r) => {
      try {
        const token = await signPlaybackToken(r.clip_ref.slice("cfstream:".length), TTL);
        return {
          updateId: r.update_id,
          player: `https://iframe.videodelivery.net/${token}`,
          thumbnail: `https://videodelivery.net/${token}/thumbnails/thumbnail.jpg?time=1s&height=480`,
          hls: `https://videodelivery.net/${token}/manifest/video.m3u8`,
        };
      } catch {
        return null;
      }
    }));
    return out.filter((x): x is JourneyClip => !!x);
  });

export const deleteJourney = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { journeyId: string }) => z.object({ journeyId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<{ deleted: true; clips: number }> => {
    const { data: rows, error } = await (context as any).supabase.rpc("journey_delete", { p_journey_id: data.journeyId });
    if (error) throw new Error("Couldn't delete this journey.");
    const uids = ((rows ?? []) as { clip_ref: string }[])
      .map((r) => r.clip_ref).filter((r) => /^cfstream:[A-Za-z0-9]{8,64}$/.test(r)).map((r) => r.slice("cfstream:".length));
    if (uids.length) {
      const { deleteVideo } = await import("@/lib/cloudflareStream.server");
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      // The journey is already gone; a video that fails to delete is logged, not
      // retried in the member's face.
      await Promise.all(uids.map((uid) => deleteVideo(uid).catch((e) => console.error(`[deleteJourney] video ${uid}: ${e?.message ?? e}`))));
      await supabaseAdmin.from("clip_assets").delete().in("uid", uids);
    }
    return { deleted: true, clips: uids.length };
  });
