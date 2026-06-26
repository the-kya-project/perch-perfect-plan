// Client-side capability check — UX ONLY. RLS (has_capability /
// has_household_capability) is the real enforcement; this just hides controls a
// member would otherwise tap and have fail. It MUST mirror those functions, so
// it keys off the same shared constants (src/lib/capabilities.ts) and the same
// owner short-circuit. If they ever diverge, RLS wins.
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getLocalUser } from "@/integrations/supabase/currentUser";
import { useBirdRole } from "@/lib/useBirdRole";
import type { Capability } from "@/lib/capabilities";

export type CapabilityCheck = Capability | "view";

// The current user's id + their stored capabilities per household (owner_id ->
// Set<capability>). Members can read their OWN household_member_permissions rows
// (RLS "hmp select" allows member_user_id = auth.uid()).
export function useMyPermissions() {
  return useQuery({
    queryKey: ["my-permissions"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data: u } = await getLocalUser();
      const myId = u.user?.id ?? null;
      const byOwner = new Map<string, Set<Capability>>();
      if (myId) {
        const { data } = await supabase
          .from("household_member_permissions")
          .select("owner_id, capabilities")
          .eq("member_user_id", myId);
        for (const r of (data ?? []) as any[]) {
          byOwner.set(r.owner_id, new Set(((r.capabilities ?? []) as string[]) as Capability[]));
        }
      }
      return { myId, byOwner };
    },
  });
}

// The bird's household owner (mirrors has_capability resolving birds.owner_id).
function useBirdOwner(birdId: string | undefined) {
  return useQuery({
    queryKey: ["bird-owner", birdId],
    enabled: !!birdId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase.from("birds").select("owner_id").eq("id", birdId!).maybeSingle();
      return (data?.owner_id as string | undefined) ?? null;
    },
  });
}

/** Per-bird capability (mirrors has_capability(bird_id, uid, cap)). */
export function useCapability(capability: CapabilityCheck, opts: { birdId: string | undefined }): boolean {
  const role = useBirdRole(opts.birdId);
  const { data: perms } = useMyPermissions();
  const { data: ownerId } = useBirdOwner(opts.birdId);
  if (role === "owner") return true;          // owner short-circuit
  if (role == null) return false;             // no access / still loading
  if (capability === "view") return true;     // baseline for any member
  if (!ownerId || !perms) return false;       // still loading
  return perms.byOwner.get(ownerId)?.has(capability as Capability) ?? false;
}

/** Household-keyed capability (mirrors has_household_capability(owner_id, uid, cap)). */
export function useHouseholdCapability(capability: CapabilityCheck, ownerId: string | null | undefined): boolean {
  const { data: perms } = useMyPermissions();
  if (!ownerId || !perms) return false;
  if (perms.myId === ownerId) return true;    // owner short-circuit
  const caps = perms.byOwner.get(ownerId);
  if (capability === "view") return !!caps;   // member of that household
  return caps?.has(capability as Capability) ?? false;
}
