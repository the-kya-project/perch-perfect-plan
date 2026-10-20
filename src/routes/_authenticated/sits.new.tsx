import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import i18next from "i18next";
import { SitForm } from "@/components/SitForm";
import { useOwnedBirds, useRefreshSits } from "@/lib/useOwnedBirds";

// "Set up a sit" — its own full screen. ?bird= preselects a bird (from a bird's
// setup or care plan).
export const Route = createFileRoute("/_authenticated/sits/new")({
  head: () => ({ meta: [{ title: i18next.t("sitForm.metaTitleNew", "Set up a sit — Kya & Co.") }] }),
  validateSearch: z.object({ bird: z.string().uuid().optional() }),
  component: NewSit,
});

function NewSit() {
  const { bird } = Route.useSearch();
  const navigate = useNavigate();
  const { owned, loading } = useOwnedBirds();
  const refresh = useRefreshSits();
  if (loading) return <div className="min-h-screen bg-[#f1f5f0]" />;
  return <SitForm birds={owned} preselectBirdId={bird} onSaved={refresh} onClose={() => navigate({ to: "/sits" })} />;
}
