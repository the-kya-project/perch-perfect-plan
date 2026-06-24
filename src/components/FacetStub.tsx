import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

// Placeholder for a bird-record facet screen that hasn't been built yet. Gives
// the record-home rows/actions a real destination with a calm empty state and a
// back link to the record home. Each facet gets its own full screen in a later
// prompt; this just holds the route.
export function FacetStub({ birdId, title, blurb }: { birdId: string; title: string; blurb: string }) {
  return (
    <div className="min-h-screen bg-[#f4f1e8] pb-nav">
      <header className="sticky top-0 z-10 border-b border-[#e3ded0] bg-[#f4f1e8]/95 backdrop-blur">
        <div className="mx-auto flex max-w-md items-center gap-3 px-5 py-3">
          <Link to="/birds/$birdId" params={{ birdId }} aria-label="Back" className="-ml-1 rounded p-1 text-[#1a3d2e]">
            <ArrowLeft className="size-5" />
          </Link>
          <h1 className="text-base font-medium text-[#1a3d2e]">{title}</h1>
        </div>
      </header>
      <main className="mx-auto max-w-md px-5 py-10">
        <div className="rounded-2xl bg-[#efe9da] p-8 text-center">
          <p className="text-sm text-[#1a3d2e]">{blurb}</p>
          <p className="mt-2 text-xs text-[#8a897f]">Coming soon.</p>
        </div>
      </main>
    </div>
  );
}
