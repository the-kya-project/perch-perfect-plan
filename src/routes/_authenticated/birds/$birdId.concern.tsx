import { useCallback, useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { K, KyaPage, KyaBody, KyaCard } from "@/components/kya";
import { PageHeader, useGoBack } from "@/components/headers";
import { getCaregiverConcernContext, pauseCaregiverReminders } from "@/lib/caregiver.functions";
import { ConcernFlow } from "@/components/ConcernFlow";
import { LoadError } from "@/components/LoadError";
import { useLoadState } from "@/lib/useTooLong";
import { toast } from "sonner";
import { friendlyError } from "@/lib/errorMessage";
import { useTranslation } from "react-i18next";

// "Something's wrong" for a HOUSEHOLD MEMBER covering an active sit — the
// authenticated twin of /sitter/$token/concern, rendering the same shared
// ConcernFlow (identical copy). Gated on the SITUATION: the server fn only
// answers for the assigned caregiver of an active sit containing this bird;
// anyone else is bounced back to the bird page.
export const Route = createFileRoute("/_authenticated/birds/$birdId/concern")({
  head: () => ({ meta: [{ title: "Kya & Co." }] }),
  component: CaregiverConcern,
});

function CaregiverConcern() {
  const { t } = useTranslation();
  const { birdId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const ctxFn = useServerFn(getCaregiverConcernContext);
  const pauseFn = useServerFn(pauseCaregiverReminders);
  const goBack = useGoBack(useCallback(() => navigate({ to: "/birds/$birdId", params: { birdId } }), [navigate, birdId]));

  const ctxQ = useQuery({
    queryKey: ["caregiver-concern", birdId],
    queryFn: () => ctxFn({ data: { birdId } }),
  });
  const { data: ctx } = ctxQ;
  // A failed request (or one still waiting after 10 s) offers a retry rather
  // than spinning forever.
  const load = useLoadState([ctxQ]);

  const m = useMutation({
    mutationFn: () => pauseFn({ data: { birdId } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["caregiver-concern", birdId] });
      qc.invalidateQueries({ queryKey: ["active-caregiver-sits"] });
      window.scrollTo(0, 0);
    },
    onError: (e: any) => toast.error(friendlyError(e, t("caregiverConcern.pauseFailed", "Couldn't pause the reminders. Please try again."))),
  });

  // Not covering (or bird gone) → this screen isn't for them. Redirect from an
  // effect, not during render (navigating while rendering is a React warning
  // and can loop); render nothing meanwhile.
  const notCovering = !!ctx && !ctx.covering;
  useEffect(() => {
    if (notCovering) navigate({ to: "/birds/$birdId", params: { birdId }, replace: true });
  }, [notCovering, navigate, birdId]);
  if (notCovering) return null;

  return (
    <KyaPage>
      <PageHeader
        title={ctx?.covering
          ? t("caregiverConcern.title", "Something's wrong with {{name}}", { name: ctx.birdName })
          : t("caregiverConcern.titleNoName", "Something's wrong")}
        onBack={goBack}
      />
      <KyaBody>
        {load.failed ? (
          <LoadError onRetry={load.retry} onBack={goBack} />
        ) : !ctx?.covering ? (
          <div className="flex items-center justify-center gap-2 py-12 text-[14px]" style={{ color: K.quiet }}>
            <Loader2 className="size-4 animate-spin" /> {t("caregiverConcern.loading", "Loading…")}
          </div>
        ) : (
          <KyaCard className="p-5">
            <ConcernFlow
              name={ctx.birdName}
              ownerName={ctx.ownerName || t("caregiverConcern.theOwner", "the owner")}
              ownerPhone={ctx.ownerPhone}
              vet={{ name: ctx.vetName, phone: ctx.vetPhone }}
              paused={ctx.paused || m.isSuccess}
              onPause={() => m.mutate()}
              pausePending={m.isPending}
              look="kya"
            />
          </KyaCard>
        )}
      </KyaBody>
    </KyaPage>
  );
}
