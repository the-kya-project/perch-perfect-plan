// Shared sitter-link helpers so the redesigned Sits cards keep the same
// behavior the old SitCard had: build the per-sit sitter URL, and copy it only
// after confirming the covered birds have the emergency contacts a sitter needs
// (owner phone + avian vet phone, per-bird or from account defaults).
import { supabase } from "@/integrations/supabase/client";
import { getLocalUser } from "@/integrations/supabase/currentUser";
import { toast } from "sonner";

type SitLike = { invite_token?: string | null; caregiver_user_id?: string | null };

export function sitterUrl(sit: SitLike): string {
  if (sit.caregiver_user_id) return ""; // household sits have no token/link
  return sit.invite_token && typeof window !== "undefined"
    ? `${window.location.origin}/sitter/${sit.invite_token}`
    : "";
}

export async function copySitterLink(sit: SitLike, birds: Array<{ id: string; name: string }>): Promise<void> {
  const url = sitterUrl(sit);
  if (!url) return;
  const birdIds = birds.map((b) => b.id);
  if (birdIds.length) {
    const [{ data: contacts }, { data: u }] = await Promise.all([
      supabase.from("emergency_contacts").select("bird_id, owner_phone, avian_vet_phone").in("bird_id", birdIds),
      getLocalUser(),
    ]);
    const { data: defaults } = u.user
      ? await supabase.from("owner_emergency_defaults").select("owner_phone, avian_vet_phone").eq("owner_id", u.user.id).maybeSingle()
      : { data: null };
    const byBird = new Map((contacts ?? []).map((c: any) => [c.bird_id, c]));
    const eff = (c: any, k: string) => (c?.[k]?.trim?.() || (defaults as any)?.[k]?.trim?.() || "");
    const missing = birds
      .map((b) => {
        const c = byBird.get(b.id);
        const needs: string[] = [];
        if (!eff(c, "owner_phone")) needs.push("your phone");
        if (!eff(c, "avian_vet_phone")) needs.push("avian vet phone");
        return needs.length ? `${b.name}: ${needs.join(" & ")}` : null;
      })
      .filter(Boolean);
    if (missing.length) {
      toast.error(
        `Add the required emergency contacts before sharing — ${missing.join("; ")}. Set account defaults on the dashboard or fill the bird's Emergency tab.`,
        { duration: 8000 },
      );
      return;
    }
  }
  await navigator.clipboard.writeText(url);
  toast.success("Link copied.");
}
