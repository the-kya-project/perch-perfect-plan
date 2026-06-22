import { createFileRoute } from "@tanstack/react-router";
import { FacetStub } from "@/components/FacetStub";

export const Route = createFileRoute("/_authenticated/birds/$birdId/journal")({
  head: () => ({ meta: [{ title: "Journal — Parrot Care Co-Pilot" }] }),
  component: () => {
    const { birdId } = Route.useParams();
    return <FacetStub birdId={birdId} title="Journal" blurb="Molts, meds, vet visits, and notes — the running story of your bird." />;
  },
});
