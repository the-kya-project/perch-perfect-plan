// Member onboarding context — resolves, for the signed-in user, the
// household(s) they were added to: the owner's display name and the bird names
// they help care for. Service-role (admin) because the owner's profile name and
// cross-owner bird rows aren't readable by a member through RLS. Read-only.
//
// Powers the household-member welcome ("You've been added to <Owner>'s household
// to help care for <birds>."). Owners don't use this — they get the owner flow.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function getAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export type MemberHousehold = { ownerId: string; ownerName: string; birdNames: string[] };
export type MemberOnboardingContext = { households: MemberHousehold[] };

export const getMemberOnboardingContext = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MemberOnboardingContext> => {
    const sb = await getAdmin();
    const me = context.userId as string;
    const empty: MemberOnboardingContext = { households: [] };

    // Birds I'm a household member of (not my own).
    const { data: memberRows } = await sb
      .from("bird_members")
      .select("bird_id")
      .eq("user_id", me)
      .eq("role", "household");
    const birdIds = Array.from(new Set(((memberRows ?? []) as any[]).map((r) => r.bird_id)));
    if (!birdIds.length) return empty;

    const { data: birds } = await sb
      .from("birds")
      .select("id, name, owner_id")
      .in("id", birdIds);
    const birdRows = ((birds ?? []) as any[]).filter((b) => b.owner_id && b.owner_id !== me);
    if (!birdRows.length) return empty;

    // Group bird names by owner.
    const namesByOwner = new Map<string, string[]>();
    for (const b of birdRows) {
      const list = namesByOwner.get(b.owner_id) ?? namesByOwner.set(b.owner_id, []).get(b.owner_id)!;
      if (b.name) list.push(b.name as string);
    }
    const ownerIds = Array.from(namesByOwner.keys());

    // Resolve owner display names (profiles, then auth metadata/email fallback).
    const nameByOwner = new Map<string, string>();
    const { data: profs } = await sb.from("profiles").select("id, display_name").in("id", ownerIds);
    for (const p of (profs ?? []) as any[]) nameByOwner.set(p.id, (p.display_name ?? "").toString().trim());
    await Promise.all(
      ownerIds.map(async (id) => {
        if (nameByOwner.get(id)) return;
        try {
          const { data: u } = await sb.auth.admin.getUserById(id);
          nameByOwner.set(id, u?.user?.user_metadata?.display_name?.toString().trim() || u?.user?.email?.split("@")[0] || "");
        } catch { /* ignore */ }
      }),
    );

    const households: MemberHousehold[] = ownerIds
      .map((id) => ({ ownerId: id, ownerName: nameByOwner.get(id)?.trim() || "your household's owner", birdNames: namesByOwner.get(id) ?? [] }))
      // Most-birds-first so the welcome leads with the primary household.
      .sort((a, b) => b.birdNames.length - a.birdNames.length);

    return { households };
  });
