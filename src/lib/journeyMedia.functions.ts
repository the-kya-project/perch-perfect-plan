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

/** A journey clip for viewers. `ready`: signed player, thumbnail and HLS links.
 *  `processing`: Cloudflare is still preparing it (no links yet; ask again).
 *  `failed`: it can't be played (processing error, or signing failed). */
export type JourneyClip =
  | { updateId: string; status: "ready"; player: string; thumbnail: string; hls: string }
  | { updateId: string; status: "processing" | "failed" };

const TTL = 3600;
// Cloudflare is asked about a clip only while it's new: a clip that was ready
// once stays ready, and asking for every old clip on every view would be slow.
const CHECK_NEWER_THAN_MS = 30 * 60_000;

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
    const { signPlaybackToken, getVideoStatus, signedClipUrls } = await import("@/lib/cloudflareStream.server");
    // When each update was posted (the caller may see them all: journey_clip_refs checked).
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: when } = await (supabaseAdmin as any).from("journey_updates").select("id, created_at").in("id", refs.map((r) => r.update_id));
    const postedAt = new Map(((when ?? []) as { id: string; created_at: string }[]).map((w) => [w.id, Date.parse(w.created_at)]));
    return Promise.all(refs.map(async (r): Promise<JourneyClip> => {
      const uid = r.clip_ref.slice("cfstream:".length);
      const posted = postedAt.get(r.update_id) ?? 0;
      if (Date.now() - posted < CHECK_NEWER_THAN_MS) {
        try {
          const st = await getVideoStatus(uid);
          if (st.state === "error") {
            console.error(`[getJourneyClips] clip ${uid} failed processing: ${st.errorReason ?? "unknown"}`);
            return { updateId: r.update_id, status: "failed" };
          }
          if (!st.readyToStream) return { updateId: r.update_id, status: "processing" };
        } catch (e: any) {
          // Status unknown: try to play it rather than trap it in "processing".
          console.error(`[getJourneyClips] status ${uid}: ${e?.message ?? e}`);
        }
      }
      try {
        const token = await signPlaybackToken(uid, TTL);
        return { updateId: r.update_id, status: "ready", ...signedClipUrls(token) };
      } catch (e: any) {
        console.error(`[getJourneyClips] sign ${uid}: ${e?.message ?? e}`);
        return { updateId: r.update_id, status: "failed" };
      }
    }));
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
