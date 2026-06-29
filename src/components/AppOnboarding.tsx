import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getLocalUser } from "@/integrations/supabase/currentUser";
import { useMyPermissions } from "@/lib/useCapability";
import { OwnerOnboarding } from "@/components/OwnerOnboarding";
import { MemberOnboarding } from "@/components/MemberOnboarding";

// First-run onboarding router. Branches by account role so a household member
// gets the contextual member tour instead of the owner's demo/first-bird flow:
//
//   owns ≥1 bird (or brand-new account) -> OwnerOnboarding (unchanged)
//   joined a household, owns no birds    -> MemberOnboarding
//
// Owns-birds wins, so a user who is BOTH an owner and a member elsewhere is
// treated as an owner for onboarding (their member experience stays contextual,
// not a second onboarding). Both flows share the profiles.welcome_seen_at gate,
// so whichever runs, it runs once. We wait until the role resolves before
// mounting either — otherwise the wrong welcome could flash for a beat.

function useOwnsBirds() {
  return useQuery({
    queryKey: ["onboarding-owns-birds"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data: u } = await getLocalUser();
      if (!u.user) return null;
      const { count } = await supabase.from("birds").select("id", { count: "exact", head: true }).eq("owner_id", u.user.id);
      return count ?? 0;
    },
  });
}

export function AppOnboarding() {
  const { data: ownedCount } = useOwnsBirds();
  const { data: perms } = useMyPermissions();

  // Still resolving — render nothing rather than guess the flow.
  if (ownedCount == null || !perms) return null;

  const isMember = perms.byOwner.size > 0;
  // Owns birds (or has neither role yet = brand-new owner) -> owner flow.
  if (ownedCount > 0 || !isMember) return <OwnerOnboarding />;
  return <MemberOnboarding />;
}
