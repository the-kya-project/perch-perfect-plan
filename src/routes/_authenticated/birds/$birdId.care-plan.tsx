import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { speciesLabel } from "@/lib/speciesLabel";
import { ageLabel } from "@/components/BirdPickers";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import i18next from "i18next";
import { useServerFn } from "@tanstack/react-start";
import { getHouseholdCarePlanView } from "@/lib/household.functions";
import { useCapability } from "@/lib/useCapability";
import { MemberContextBanner } from "@/components/MemberContextBanner";
import { CarePlanView, CARE_PLAN_SECTIONS, type CareSection } from "@/components/CarePlanView";
import { K, KyaPage, KyaBody, KyaCard } from "@/components/kya";
import { PageHeader } from "@/components/headers";
import { Loader2 } from "lucide-react";

// Owner / household-member read-only care plan. Thin data layer: fetches the
// plan via the authenticated server fn and hands it to the shared CarePlanView
// (the Kya-look read view, also the walkthrough's Review). Standard page
// header with back to the overview, mist body. All sections; edit entry gated
// by edit_care_plans (UX only — RLS enforces).

export const Route = createFileRoute("/_authenticated/birds/$birdId/care-plan")({
  head: () => ({ meta: [{ title: i18next.t("planEditor.metaTitle", "Care plan — Kya & Co.") }] }),
  // Deep-link target: ?section=food|behavior|home|health|routine|emergency|tips.
  validateSearch: (search: Record<string, unknown>): { section?: CareSection } => {
    const s = search.section;
    return { section: typeof s === "string" && (CARE_PLAN_SECTIONS as readonly string[]).includes(s) ? (s as CareSection) : undefined };
  },
  component: HouseholdCarePlan,
});

function HouseholdCarePlan() {
  const { t } = useTranslation();
  const { birdId } = Route.useParams();
  const { section } = Route.useSearch();
  const navigate = useNavigate();
  const canEdit = useCapability("edit_care_plans", { birdId });
  const getView = useServerFn(getHouseholdCarePlanView);
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["household-care-plan", birdId],
    queryFn: () => getView({ data: { birdId } }),
    retry: false,
  });

  const bird = (data?.bird ?? {}) as any;
  const name = (bird.name ?? t("planEditor.thisBird", "this bird")) as string;
  const speciesAge = [bird.species ? speciesLabel(t, bird.species) : null, bird.age ? ageLabel(t, bird.age) : null].filter((x: any) => (x ?? "").toString().trim()).join(" · ");

  return (
    <KyaPage>
      <div className="mx-auto max-w-md">
        <PageHeader
          onBack={() => navigate({ to: "/birds/$birdId/plan", params: { birdId } })}
          title={data ? t("planOverview.titleNamed", "{{name}}'s care plan", { name }) : t("carePlanPage.title", "Care plan")}
          line={speciesAge || undefined}
        />
        <KyaBody>
          {isLoading ? (
            <p className="m-0 flex items-center justify-center gap-2 py-10 text-[15px]" style={{ color: K.quiet }}>
              <Loader2 className="size-4 animate-spin" aria-hidden="true" /> {t("carePlanPage.loading", "Loading the care plan…")}
            </p>
          ) : isError || !data ? (
            <KyaCard className="p-6 text-center">
              <p className="m-0 text-[15px]" style={{ color: K.quiet }}>{t("carePlanPage.loadError", "Couldn't load this care plan.")}</p>
            </KyaCard>
          ) : (
            <CarePlanView
              data={data}
              // An expired signed clip link: refetch the plan view (the same
              // path that minted it) and hand back that clip's fresh URL.
              refreshClipUrl={async (key) => {
                const r = await refetch();
                if (key === "baseline") return r.data?.baselineClipUrl ?? null;
                return ((r.data?.watchClips ?? []) as { key: string; url: string }[]).find((x) => x.key === key)?.url ?? null;
              }}
              targetSection={section}
              canEdit={canEdit}
              onEdit={() => navigate({ to: "/birds/$birdId/plan/editor", params: { birdId }, search: { tab: "food" } })}
              contextBanner={<MemberContextBanner birdId={birdId} />}
              showViewOnlyTag={!canEdit}
              footer={
                !canEdit ? (
                  <p className="m-0 px-1 text-center text-[13px]" style={{ color: K.quiet }}>
                    {t("carePlanPage.readOnlyFooter", "Read-only. Only {{name}}'s owner can make changes.", { name })}
                  </p>
                ) : undefined
              }
            />
          )}
        </KyaBody>
      </div>
    </KyaPage>
  );
}
