import { createFileRoute } from "@tanstack/react-router";
import { FacetStub } from "@/components/FacetStub";

export const Route = createFileRoute("/_authenticated/birds/$birdId/weight")({
  head: () => ({ meta: [{ title: "Weight — Parrot Care Co-Pilot" }] }),
  component: () => {
    const { birdId } = Route.useParams();
    return <FacetStub birdId={birdId} title="Weight" blurb="Track weight over time — log a number and watch the trend." />;
  },
});
