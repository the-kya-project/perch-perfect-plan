import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getHouseholdCarePlanView } from "@/lib/household.functions";
import { useCapability } from "@/lib/useCapability";
import { MemberContextBanner } from "@/components/MemberContextBanner";
import { CarePlanView, CARE_PLAN_SECTIONS, type CareSection } from "@/components/CarePlanView";
import { ArrowLeft, Loader2 } from "lucide-react";

// Owner / household-member read-only care plan. Thin data layer: fetches the
// plan via the authenticated server fn and hands it to the shared CarePlanView
// (the redesigned read view shared with the sitter care-sheet). All six
// sections; edit entry gated by edit_care_plans (UX only — RLS enforces).

export const Route = createFileRoute("/_authenticated/birds/$birdId/care-plan")({
  head: () => ({ meta: [{ title: "Care plan — Kya & Co." }] }),
  // Deep-link target: ?section=food|behavior|home|health|routine|emergency.
  validateSearch: (search: Record<string, unknown>): { section?: CareSection } => {
    const s = search.section;
    return { section: typeof s === "string" && (CARE_PLAN_SECTIONS as readonly string[]).includes(s) ? (s as CareSection) : undefined };
  },
  component: HouseholdCarePlan,
});

function HouseholdCarePlan() {
  const { birdId } = Route.useParams();
  const { section } = Route.useSearch();
  const navigate = useNavigate();
  const canEdit = useCapability("edit_care_plans", { birdId });
  const getView = useServerFn(getHouseholdCarePlanView);
  const { data, isLoading, isError } = useQuery({
    queryKey: ["household-care-plan", birdId],
    queryFn: () => getView({ data: { birdId } }),
    retry: false,
  });

  const bird = (data?.bird ?? {}) as any;
  const name = (bird.name ?? "this bird") as string;
  const speciesAge = [bird.species, bird.age].filter((x: any) => (x ?? "").toString().trim()).join(" · ");

  return (
    <div className="min-h-screen bg-[var(--cream)] pb-nav">
      {isLoading ? (
        <main className="mx-auto flex max-w-md items-center justify-center gap-2 px-5 py-10 text-sm text-[var(--mute)]">
          <Loader2 className="size-4 animate-spin" /> Loading the care plan…
        </main>
      ) : isError || !data ? (
        <main className="mx-auto max-w-md px-5 py-5">
          <div className="rounded-[18px] bg-white p-6 text-center text-sm text-[var(--mute)] ring-1 ring-[var(--line2)]">
            Couldn't load this care plan.
          </div>
        </main>
      ) : (
        <CarePlanView
          data={data}
          targetSection={section}
          canEdit={canEdit}
          onEdit={() => navigate({ to: "/birds/$birdId/plan/editor", params: { birdId }, search: { tab: "food" } })}
          contextBanner={<MemberContextBanner birdId={birdId} />}
          showViewOnlyTag={!canEdit}
          header={
            <div className="flex items-center gap-3">
              <Link to="/birds/$birdId/plan" params={{ birdId }} aria-label="Back to care plan" className="-ml-1 rounded p-1 text-[var(--ink)]">
                <ArrowLeft className="size-5" />
              </Link>
              <div className="min-w-0">
                <h1 className="truncate text-base font-medium leading-tight text-[var(--ink)]">{name}</h1>
                {speciesAge && <p className="truncate text-xs text-[var(--mute)]">{speciesAge}</p>}
              </div>
            </div>
          }
          footer={
            !canEdit ? (
              <p className="px-1 text-center text-[11px] text-[var(--mute)]">
                Read-only. Only {name}'s owner can edit the care plan.
              </p>
            ) : undefined
          }
        />
      )}
    </div>
  );
}
