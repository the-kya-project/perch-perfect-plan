import { createFileRoute } from "@tanstack/react-router";
import { FacetStub } from "@/components/FacetStub";

export const Route = createFileRoute("/_authenticated/birds/$birdId/identity")({
  head: () => ({ meta: [{ title: "Identity — Parrot Care Co-Pilot" }] }),
  component: () => {
    const { birdId } = Route.useParams();
    return <FacetStub birdId={birdId} title="Identity" blurb="Microchip, band number, sex, origin, and lineage — the formal record." />;
  },
});
