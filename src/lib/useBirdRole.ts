import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getLocalUser } from "@/integrations/supabase/currentUser";

export type BirdRole = "owner" | "household" | null;

/**
 * The current user's role on a bird: 'owner', 'household', or null (no access).
 * Reads the caller's own bird_members row (RLS lets any member read membership).
 * `undefined` while loading. Use for UI gating — RLS is the real enforcement.
 */
export function useBirdRole(birdId: string | undefined): BirdRole | undefined {
  const { data } = useQuery({
    queryKey: ["bird-role", birdId],
    enabled: !!birdId,
    staleTime: 60_000,
    queryFn: async (): Promise<BirdRole> => {
      const { data: u } = await getLocalUser();
      const uid = u.user?.id;
      if (!uid || !birdId) return null;
      const { data: row } = await supabase
        .from("bird_members")
        .select("role")
        .eq("bird_id", birdId)
        .eq("user_id", uid)
        .maybeSingle();
      return ((row?.role as BirdRole) ?? null);
    },
  });
  return data;
}
