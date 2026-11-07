// Photos of other members' birds in the Community. The bird-photos bucket is
// private and only owners (and their household) can sign their own. For other
// members we sign here, for shown birds only:
//   1. ask the database, as the caller, which of these birds they may see
//      (flock_visible_birds: caller can use the Flock, bird shown, owner a
//      member, bird not passed) — anything else is dropped;
//   2. read those birds' photo paths with the service role and sign them with
//      signOwnerPhoto (one hour), which also refuses a path outside the
//      owner's folder; for a path that passed, also sign a copy resized to
//      `width` (Supabase image transforms, as the care app's Home does), so a
//      small circle doesn't download a full-size photo. The original stays as
//      the fallback if the resized one fails.
// The caller never sees a storage path, only short-lived URLs.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type FlockPhoto = { url: string; original: string };

export const getFlockBirdPhotos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { birdIds: string[]; width?: number }) =>
    z.object({ birdIds: z.array(z.string().uuid()).max(200), width: z.number().int().min(32).max(1200).optional() }).parse(d))
  .handler(async ({ data, context }): Promise<Record<string, FlockPhoto | null>> => {
    if (data.birdIds.length === 0) return {};
    const { data: visible, error } = await (context.supabase as any)
      .rpc("flock_visible_birds", { p_owner_ids: null, p_bird_ids: data.birdIds });
    if (error) throw new Error("Couldn't load these photos.");
    const allowed = ((visible ?? []) as { bird_id: string; has_photo: boolean }[]).filter((b) => b.has_photo).map((b) => b.bird_id);
    const out: Record<string, FlockPhoto | null> = Object.fromEntries(data.birdIds.map((id) => [id, null]));
    if (allowed.length === 0) return out;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { signOwnerPhoto } = await import("@/lib/mediaSigning.server");
    const { data: birds } = await (supabaseAdmin as any)
      .from("birds").select("id, owner_id, photo_url").in("id", allowed);
    await Promise.all(((birds ?? []) as { id: string; owner_id: string; photo_url: string | null }[]).map(async (b) => {
      const original = await signOwnerPhoto(supabaseAdmin, b.photo_url, b.owner_id);
      if (!original) return;
      let url = original;
      const isPath = !!b.photo_url && !b.photo_url.startsWith("data:") && !b.photo_url.startsWith("http");
      if (data.width && isPath) {
        const { data: sized } = await (supabaseAdmin as any).storage.from("bird-photos")
          .createSignedUrl(b.photo_url, 3600, { transform: { width: data.width, quality: 70 } });
        if (sized?.signedUrl) url = sized.signedUrl;
      }
      out[b.id] = { url, original };
    }));
    return out;
  });
