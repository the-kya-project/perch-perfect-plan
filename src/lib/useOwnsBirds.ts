import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMyPermissions } from "@/lib/useCapability";

// The shared owner-vs-member signal: does the signed-in user OWN at least one
// bird? Same criterion (birds.owner_id === my auth id) that drives the Home
// owner/caregiver routing, so Home and the bottom nav can't disagree.
//
// `resolved` stays false until identity (myId) AND the count have loaded, so
// callers can fail toward the OWNER view while uncertain (never flip an owner
// into the caregiver experience during load).
export function useOwnsBirds(): { ownsBirds: boolean; resolved: boolean } {
  const { data: perms } = useMyPermissions();
  const myId = perms?.myId ?? null;
  const { data: count, isFetched } = useQuery({
    queryKey: ["owns-birds", myId],
    enabled: !!myId,
    staleTime: 60_000,
    queryFn: async () => {
      const { count } = await supabase
        .from("birds")
        .select("id", { count: "exact", head: true })
        .eq("owner_id", myId!)
        .is("passed_at", null); // active birds only
      return count ?? 0;
    },
  });
  return { ownsBirds: (count ?? 0) > 0, resolved: !!myId && isFetched };
}
