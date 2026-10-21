// The signed-in owner's account emergency info and display name. The
// ["owner-defaults"] cache holds the whole owner_emergency_defaults row.
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getLocalUser } from "@/integrations/supabase/currentUser";
import { useServerFn } from "@tanstack/react-start";
import { useBirdRole } from "@/lib/useBirdRole";
import { getBirdOwnerEmergency } from "@/lib/household.functions";

export function useOwnerEmergency() {
  return useQuery({
    queryKey: ["owner-defaults"],
    queryFn: async () => {
      const { data: u } = await getLocalUser();
      if (!u.user) return null;
      const { data } = await supabase.from("owner_emergency_defaults").select("*").eq("owner_id", u.user.id).maybeSingle();
      return data ?? null;
    },
  });
}

export function useOwnerName() {
  return useQuery({
    queryKey: ["my-display-name"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data: u } = await getLocalUser();
      if (!u.user) return "";
      const { data } = await supabase.from("profiles").select("display_name").eq("id", u.user.id).maybeSingle();
      return (data?.display_name ?? "").toString().trim();
    },
  });
}

/**
 * The emergency info a bird falls back to: always its OWNER's account
 * defaults. For the owner that's their own row (the ["owner-defaults"] cache);
 * household members can't read another user's defaults under RLS, so theirs
 * come from a membership-checked server function. `defaults` is `undefined`
 * while loading AND when the load failed; `failed` tells them apart, so a
 * failed load is never shown as "the owner has no emergency info".
 * `viewerIsOwner` drives "You" vs the owner's name in labels.
 */
export function useBirdOwnerEmergency(birdId: string) {
  const role = useBirdRole(birdId);
  const viewerIsOwner = role === "owner";
  const own = useOwnerEmergency();
  const ownName = useOwnerName();
  const fetchOwner = useServerFn(getBirdOwnerEmergency);
  const other = useQuery({
    queryKey: ["bird-owner-emergency", birdId],
    enabled: role === "household",
    staleTime: 60_000,
    queryFn: () => fetchOwner({ data: { birdId } }),
  });
  if (role === undefined) return { defaults: undefined, ownerName: "", viewerIsOwner: false, failed: false };
  if (viewerIsOwner) {
    return { defaults: own.data, ownerName: ownName.data ?? "", viewerIsOwner: true, failed: own.isError && own.data === undefined };
  }
  if (role === null) return { defaults: null, ownerName: "", viewerIsOwner: false, failed: false };
  return {
    defaults: other.data ? other.data.defaults : undefined,
    ownerName: other.data?.ownerName ?? "",
    viewerIsOwner: false,
    failed: other.isError && !other.data,
  };
}
