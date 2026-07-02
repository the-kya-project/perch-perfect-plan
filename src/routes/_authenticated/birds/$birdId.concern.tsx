import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Loader2 } from "lucide-react";
import { getCaregiverConcernContext, pauseCaregiverReminders } from "@/lib/caregiver.functions";
import { ConcernFlow } from "@/components/ConcernFlow";
import { toast } from "sonner";

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
  const { birdId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const ctxFn = useServerFn(getCaregiverConcernContext);
  const pauseFn = useServerFn(pauseCaregiverReminders);

  const { data: ctx, isLoading } = useQuery({
    queryKey: ["caregiver-concern", birdId],
    queryFn: () => ctxFn({ data: { birdId } }),
  });

  const m = useMutation({
    mutationFn: () => pauseFn({ data: { birdId } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["caregiver-concern", birdId] });
      qc.invalidateQueries({ queryKey: ["active-caregiver-sits"] });
      window.scrollTo(0, 0);
    },
    onError: (e: any) => toast.error(e?.message ?? "Couldn't pause the reminders. Please try again."),
  });

  // Not covering (or bird gone) → this screen isn't for them.
  if (ctx && !ctx.covering) {
    navigate({ to: "/birds/$birdId", params: { birdId }, replace: true });
    return null;
  }

  return (
    <div className="min-h-screen bg-[#f4f1e8] pb-nav">
      <header className="border-b border-[#e0d8c4] bg-[#f4f1e8]">
        <div className="mx-auto flex max-w-md items-center gap-3 px-5 pt-safe pb-3">
          <button
            type="button"
            onClick={() => navigate({ to: "/birds/$birdId", params: { birdId } })}
            aria-label="Back"
            className="-ml-1 rounded p-1 text-[#5f5e5a]"
          >
            <ArrowLeft className="size-5" />
          </button>
          <h1 className="text-sm font-medium text-[#1a3d2e]">{ctx?.covering ? ctx.birdName : ""}</h1>
        </div>
      </header>
      <main className="mx-auto max-w-md px-5 py-6">
        {isLoading || !ctx?.covering ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-[#5f5e5a]">
            <Loader2 className="size-4 animate-spin" /> Loading…
          </div>
        ) : (
          <ConcernFlow
            name={ctx.birdName}
            ownerName={ctx.ownerName}
            ownerPhone={ctx.ownerPhone}
            vet={{ name: ctx.vetName, phone: ctx.vetPhone }}
            paused={ctx.paused || m.isSuccess}
            onPause={() => m.mutate()}
            pausePending={m.isPending}
          />
        )}
      </main>
    </div>
  );
}
