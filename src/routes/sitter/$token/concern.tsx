import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft } from "lucide-react";
import { useSitterContext } from "./route";
import { pauseSitterReminders } from "@/lib/sitter.functions";
import { ConcernFlow } from "@/components/ConcernFlow";
import type { VetContact } from "@/components/PassingGuidance";
import { toast } from "sonner";

// "Something's wrong" — sitter-link entry into the shared ConcernFlow (pause →
// path choice → path detail). The flow + copy live in ConcernFlow, shared with
// the authenticated covering-member route, so both caregivers get the identical
// experience. The sitter never marks the bird as passed; only the owner does.
export const Route = createFileRoute("/sitter/$token/concern")({
  component: ConcernPage,
});

function ConcernPage() {
  const { token } = Route.useParams();
  const { data: ctx } = useSitterContext(token);
  const qc = useQueryClient();
  const pauseFn = useServerFn(pauseSitterReminders);

  const name = ctx.bird.name as string;
  const owner = ((ctx as any).ownerName ?? "the owner") as string;
  const ownerPhone = ((ctx.contacts as any)?.owner_phone ?? null) as string | null;
  const vet: VetContact = {
    name: ((ctx.contacts as any)?.avian_vet_name ?? (ctx.contacts as any)?.emergency_vet_name ?? null) as string | null,
    phone: ((ctx.contacts as any)?.avian_vet_phone ?? (ctx.contacts as any)?.emergency_vet_phone ?? null) as string | null,
  };

  const m = useMutation({
    mutationFn: () => pauseFn({ data: { token, birdId: ctx.activeBirdId as string } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sitter-ctx", token] });
      qc.invalidateQueries({ queryKey: ["sitter-dashboard", token] });
      window.scrollTo(0, 0);
    },
    onError: (e: any) => toast.error(e?.message ?? "Couldn't pause the reminders. Please try again."),
  });

  return (
    <div className="min-h-screen bg-[#f4f1e8]">
      <header className="border-b border-[#e0d8c4] bg-[#f4f1e8]">
        <div className="mx-auto flex max-w-md items-center gap-3 px-5 py-3">
          <Link to="/sitter/$token" params={{ token }} className="rounded p-1 text-[#5f5e5a]"><ArrowLeft className="size-5" /></Link>
          <h1 className="text-sm font-medium text-[#1a3d2e]">{name}</h1>
        </div>
      </header>
      <main className="mx-auto max-w-md px-5 py-6">
        <ConcernFlow
          name={name}
          ownerName={owner}
          ownerPhone={ownerPhone}
          vet={vet}
          paused={!!(ctx as any).remindersPaused || m.isSuccess}
          onPause={() => m.mutate()}
          pausePending={m.isPending}
        />
      </main>
    </div>
  );
}
