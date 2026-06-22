import { supabase } from "@/integrations/supabase/client";

// "View as sitter" reuses the real token-based sitter view by provisioning a
// disposable preview sit per bird (sitter_name = "__preview__"). These are
// hidden from the owner's Sits list/dashboard (sitter_name.neq.__preview__) and
// rejected by every sitter WRITE server-fn (assertNotPreview), so the preview is
// strictly read-only. find-or-create so revisiting reuses the same token.

export const PREVIEW_SITTER_NAME = "__preview__";

export async function ensureSitterPreviewToken(birdId: string, ownerId: string): Promise<string> {
  const { data: existing } = await supabase
    .from("sits")
    .select("invite_token, token_expires_at, revoked, sit_birds(bird_id)")
    .eq("owner_id", ownerId)
    .eq("sitter_name", PREVIEW_SITTER_NAME)
    .eq("revoked", false);
  const match = (existing ?? []).find((s: any) =>
    (s.sit_birds ?? []).some((sb: any) => sb.bird_id === birdId) &&
    new Date(s.token_expires_at) > new Date(),
  );
  if (match) return match.invite_token as string;

  // Far-future expiry so the owner can revisit; it's disposable and hidden.
  const expires = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
  const today = new Date().toISOString().slice(0, 10);
  const { data: sit, error } = await supabase
    .from("sits")
    .insert({
      owner_id: ownerId,
      sitter_name: PREVIEW_SITTER_NAME,
      sitter_email: null,
      start_date: today,
      end_date: today,
      notes: "Owner preview",
      token_expires_at: expires,
      status: "upcoming",
    })
    .select()
    .single();
  if (error || !sit) throw new Error(error?.message ?? "Could not build the sitter preview.");
  const { error: linkErr } = await supabase.from("sit_birds").insert({ sit_id: sit.id, bird_id: birdId });
  if (linkErr) throw new Error(linkErr.message);
  return sit.invite_token as string;
}
