// The signed-in owner's birds (a sit can only cover birds you own), and the
// refresh every sit change needs.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getLocalUser } from "@/integrations/supabase/currentUser";
import { fetchBirdList } from "@/lib/birdListSelect";

export function useOwnedBirds() {
  const { data: birds, isLoading, isError } = useQuery({
    queryKey: ["birds"],
    queryFn: async () => {
      // Identical to the dashboard's fetch so the shared ["birds"] cache has one shape.
      const { data, error } = await fetchBirdList();
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: myId } = useQuery({
    queryKey: ["me-id"],
    queryFn: async () => (await getLocalUser()).data.user?.id ?? null,
  });
  const owned = ((birds ?? []) as any[]).filter((b) => b.owner_id === myId);
  return { birds: (birds ?? []) as any[], owned, myId: myId ?? null, loading: isLoading || myId === undefined, failed: isError && birds === undefined };
}

/** Invalidate every list that shows sits. */
export function useRefreshSits() {
  const qc = useQueryClient();
  return () => {
    ["sits-full", "all-sits", "sits-archive", "active-caregiver-sits", "dashboard-home"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  };
}
