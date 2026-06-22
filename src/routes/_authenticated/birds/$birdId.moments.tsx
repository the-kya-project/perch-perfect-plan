import { createFileRoute } from "@tanstack/react-router";
import { FacetStub } from "@/components/FacetStub";

export const Route = createFileRoute("/_authenticated/birds/$birdId/moments")({
  head: () => ({ meta: [{ title: "Moments — Parrot Care Co-Pilot" }] }),
  component: () => {
    const { birdId } = Route.useParams();
    return <FacetStub birdId={birdId} title="Moments" blurb="Gotcha day, hatch day, years together — the days worth remembering." />;
  },
});
