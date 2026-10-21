// The birds a viewer can take through the daily health check (/check), shared
// by the Health tab's "Weigh & check your flock" button and the /check page so
// the button never opens an empty check.
//
// A daily check writes a daily_logs row, which RLS gates on
// has_capability(bird, me, 'record_health'): true for the owner, else the
// household member's stored capabilities (household_member_permissions). So the
// set is: the viewer's own birds, then birds they help with in a household
// whose permissions include record_health. Order follows Home: own flock
// (newest first, as fetchBirdList returns them), own fosters, then helped
// birds grouped by household in the order those households first appear.
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchBirdList } from "@/lib/birdListSelect";
import { useMyPermissions } from "@/lib/useCapability";
import type { Capability } from "@/lib/capabilities";

type ListBird = { id: string; owner_id: string; is_foster?: boolean | null };
type Perms = { myId: string | null; byOwner: Map<string, Set<Capability>> };

export function dailyCheckBirds<B extends ListBird>(all: readonly B[], perms: Perms): B[] {
  const { myId, byOwner } = perms;
  if (!myId) return [];
  const own = all.filter((b) => b.owner_id === myId);
  const helped = all.filter((b) => b.owner_id !== myId && (byOwner.get(b.owner_id)?.has("record_health") ?? false));
  const households = [...new Set(helped.map((b) => b.owner_id))];
  return [
    ...own.filter((b) => !b.is_foster),
    ...own.filter((b) => b.is_foster),
    ...households.flatMap((o) => helped.filter((b) => b.owner_id === o)),
  ];
}

/** The shared ["birds"] list (same query as Home) narrowed to dailyCheckBirds. */
export function useDailyCheckBirds() {
  const birdsQ = useQuery({
    queryKey: ["birds"],
    queryFn: async () => {
      const { data, error } = await fetchBirdList();
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
  const permsQ = useMyPermissions();
  const birds = useMemo(
    () => (birdsQ.data && permsQ.data ? dailyCheckBirds(birdsQ.data as (ListBird & Record<string, any>)[], permsQ.data) : []),
    [birdsQ.data, permsQ.data],
  );
  return { birds, birdsQ, permsQ };
}
