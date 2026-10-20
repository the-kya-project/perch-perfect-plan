// "View as your sitter": a token for the real sitter view of one bird, without
// creating a sit. The token lives in sitter_previews, which only server code can
// read, and the sitter view's loader turns it into a read-only stand-in sit for
// that request (sitter.functions.ts). So a preview never shows up as a sit, a
// sitter, or activity anywhere: the Health tab, Sits, emails, The Flock Report.
//
// Reusing a person's live token for the same bird keeps revisits instant.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const PREVIEW_DAYS = 30;

export const getSitterPreviewToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { birdId: string }) => z.object({ birdId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    // Whoever can see the bird may preview it: the owner and household members.
    // Asked through the caller's own client, so RLS answers it.
    const { data: bird } = await context.supabase.from("birds").select("id").eq("id", data.birdId).maybeSingle();
    if (!bird) throw new Error("Couldn't load this bird.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // sitter_previews postdates the generated types.
    const sb = supabaseAdmin as any;
    const userId = context.userId as string;
    const { data: existing } = await sb
      .from("sitter_previews")
      .select("token")
      .eq("bird_id", data.birdId)
      .eq("created_by", userId)
      .gt("expires_at", new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString())
      .limit(1)
      .maybeSingle();
    if (existing) return { token: existing.token as string };

    const expires = new Date(Date.now() + PREVIEW_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const { data: row, error } = await sb
      .from("sitter_previews")
      .insert({ bird_id: data.birdId, created_by: userId, expires_at: expires })
      .select("token")
      .single();
    if (error || !row) throw new Error(error?.message ?? "Couldn't build the sitter preview.");
    return { token: row.token as string };
  });
