import { createFileRoute } from "@tanstack/react-router";
import { FacetStub } from "@/components/FacetStub";

export const Route = createFileRoute("/_authenticated/birds/$birdId/vet-summary")({
  head: () => ({ meta: [{ title: "Vet summary — Parrot Care Co-Pilot" }] }),
  component: () => {
    const { birdId } = Route.useParams();
    return <FacetStub birdId={birdId} title="Vet summary" blurb="A printable snapshot for the vet — identity, weight trend, meds, and history." />;
  },
});
