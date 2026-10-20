// The signed-in owner's account emergency info and display name. The
// ["owner-defaults"] cache holds the whole owner_emergency_defaults row.
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getLocalUser } from "@/integrations/supabase/currentUser";

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
