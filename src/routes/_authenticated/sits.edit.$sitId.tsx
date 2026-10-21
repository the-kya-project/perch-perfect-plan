import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import i18next from "i18next";
import { supabase } from "@/integrations/supabase/client";
import { SitForm } from "@/components/SitForm";
import { SitFormLoading } from "./sits.new";
import { useTooLong } from "@/lib/useTooLong";
import { useOwnedBirds, useRefreshSits } from "@/lib/useOwnedBirds";

// "Edit sit" — the same screen as "Set up a sit", with the sit's values filled in.
export const Route = createFileRoute("/_authenticated/sits/edit/$sitId")({
  head: () => ({ meta: [{ title: i18next.t("sitForm.metaTitleEdit", "Edit sit — Kya & Co.") }] }),
  component: EditSit,
});

function EditSit() {
  const { sitId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { owned, loading, failed: birdsFailed } = useOwnedBirds();
  const refresh = useRefreshSits();
  const sitQ = useQuery({
    queryKey: ["sit-edit", sitId],
    queryFn: async () => {
      const { data, error } = await supabase.from("sits").select("*, sit_birds(bird_id)").eq("id", sitId).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const { data: sit } = sitQ;
  const close = () => navigate({ to: "/sits" });
  // A sit that's gone (deleted, or not yours): back to the list.
  const missing = sitQ.isSuccess && !sit;
  useEffect(() => { if (missing) navigate({ to: "/sits" }); }, [missing, navigate]);
  // While the sit and the birds load, show the form's chrome (with a working
  // Close) instead of a blank screen; a failed load — or one still waiting
  // after 10 s — offers a retry rather than hanging forever.
  const waiting = loading || (!sit && !sitQ.isError);
  const failed = sitQ.isError || birdsFailed;
  const { tooLong, restart } = useTooLong(waiting && !missing && !failed);
  const retry = () => { restart(); void qc.refetchQueries({ type: "active" }); };
  if (missing || waiting || failed || !sit) {
    return <SitFormLoading editing onClose={close} failed={failed || tooLong} onRetry={retry} />;
  }
  return <SitForm key={sit.id} birds={owned} editSit={sit} onSaved={refresh} onClose={close} />;
}
