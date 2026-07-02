// "A bird has passed" — owner-side server functions. Marking as passed is
// OWNER-ONLY and preserves everything: it sets birds.passed_at (the bird leaves
// the active flock and daily reminders pause everywhere), never deletes.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function getAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export const markBirdPassed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { birdId: string }) => z.object({ birdId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = await getAdmin();
    const ownerId = context.userId as string;
    const { data: bird } = await sb.from("birds").select("id, owner_id, passed_at").eq("id", data.birdId).maybeSingle();
    if (!bird || (bird as any).owner_id !== ownerId) throw new Error("Not allowed.");
    if ((bird as any).passed_at) return { ok: true }; // already marked — idempotent

    const { error } = await sb.from("birds").update({ passed_at: new Date().toISOString() } as any).eq("id", data.birdId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
