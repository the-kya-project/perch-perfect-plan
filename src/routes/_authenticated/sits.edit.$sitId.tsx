import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import i18next from "i18next";
import { supabase } from "@/integrations/supabase/client";
import { SitForm } from "@/components/SitForm";
import { useOwnedBirds, useRefreshSits } from "@/lib/useOwnedBirds";

// "Edit sit" — the same screen as "Set up a sit", with the sit's values filled in.
export const Route = createFileRoute("/_authenticated/sits/edit/$sitId")({
  head: () => ({ meta: [{ title: i18next.t("sitForm.metaTitleEdit", "Edit sit — Kya & Co.") }] }),
  component: EditSit,
});

function EditSit() {
  const { sitId } = Route.useParams();
  const navigate = useNavigate();
  const { owned, loading } = useOwnedBirds();
  const refresh = useRefreshSits();
  const { data: sit, isLoading } = useQuery({
    queryKey: ["sit-edit", sitId],
    queryFn: async () => {
      const { data, error } = await supabase.from("sits").select("*, sit_birds(bird_id)").eq("id", sitId).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  // A sit that's gone (deleted, or not yours): back to the list.
  useEffect(() => { if (!isLoading && !sit) navigate({ to: "/sits" }); }, [isLoading, sit, navigate]);
  if (loading || isLoading || !sit) return <div className="min-h-screen bg-[#f1f5f0]" />;
  return <SitForm key={sit.id} birds={owned} editSit={sit} onSaved={refresh} onClose={() => navigate({ to: "/sits" })} />;
}
