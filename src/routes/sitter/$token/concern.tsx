import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Phone, Loader2, ChevronRight } from "lucide-react";
import { useSitterContext } from "./route";
import { pauseSitterReminders } from "@/lib/sitter.functions";
import { PathDetail, PATH_CHOICE_LABELS, type PassingPath, type VetContact } from "@/components/PassingGuidance";
import { toast } from "sonner";

// "Something's wrong" — the sitter's flow when a bird has passed or is in
// serious trouble during a sit. Pause (this bird's reminders, this sit only) →
// the owner is urgently notified → the sitter taps the path the owner asked for
// and gets the body-care steps. The sitter NEVER marks the bird as passed and
// never changes the record; only the owner does that. The guidance is summoned
// by this flow only, never ambient.
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

  // Already paused (this visit or a previous one) → straight to the paths, so
  // the sitter can get back to the steps without re-pausing.
  const [step, setStep] = useState<"pause" | "paths" | PassingPath>(
    (ctx as any).remindersPaused ? "paths" : "pause",
  );

  const m = useMutation({
    mutationFn: () => pauseFn({ data: { token, birdId: ctx.activeBirdId as string } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sitter-ctx", token] });
      qc.invalidateQueries({ queryKey: ["sitter-dashboard", token] });
      setStep("paths");
      window.scrollTo(0, 0);
    },
    onError: (e: any) => toast.error(e?.message ?? "Couldn't pause the reminders. Please try again."),
  });

  return (
    <div className="min-h-screen bg-[#f4f1e8]">
      <header className="border-b border-[#e0d8c4] bg-[#f4f1e8]">
        <div className="mx-auto flex max-w-md items-center gap-3 px-5 py-3">
          {step === "pause" || step === "paths" ? (
            <Link to="/sitter/$token" params={{ token }} className="rounded p-1 text-[#5f5e5a]"><ArrowLeft className="size-5" /></Link>
          ) : (
            <button type="button" onClick={() => setStep("paths")} className="rounded p-1 text-[#5f5e5a]"><ArrowLeft className="size-5" /></button>
          )}
          <h1 className="text-sm font-medium text-[#1a3d2e]">{name}</h1>
        </div>
      </header>

      {step === "pause" && (
        <main className="mx-auto max-w-md space-y-4 px-5 py-6">
          <h2 className="text-xl font-medium text-[#1a3d2e]">Is {name} okay?</h2>
          <p className="text-sm leading-relaxed text-[#5f5e5a]">
            If {name} has passed or is in serious trouble, first call {owner} so she knows. We can pause {name}'s reminders so your phone isn't asking you to check on them.
          </p>
          {ownerPhone && (
            <a
              href={`tel:${ownerPhone}`}
              className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-[#1a3d2e] text-sm font-medium text-white active:scale-[0.99]"
            >
              <Phone className="size-4" /> Call {owner}
            </a>
          )}
          <button
            type="button"
            disabled={m.isPending}
            onClick={() => m.mutate()}
            className="flex min-h-[48px] w-full items-center justify-center rounded-xl border border-[#c8bfa6] bg-white text-sm font-medium text-[#1a3d2e] active:scale-[0.99] disabled:opacity-60"
          >
            {m.isPending ? <Loader2 className="size-4 animate-spin" /> : `Pause ${name}'s reminders`}
          </button>
          <p className="text-xs leading-relaxed text-[#5f5e5a]">
            Pausing won't change {name}'s record. {owner} decides what happens next.
          </p>
        </main>
      )}

      {step === "paths" && (
        <main className="mx-auto max-w-md space-y-4 px-5 py-6">
          <p className="text-[11px] font-medium uppercase tracking-widest text-[#5f5e5a]">Reminders paused · {owner} notified</p>
          <h2 className="text-xl font-medium text-[#1a3d2e]">Thank you for caring for {name}.</h2>
          <p className="text-sm leading-relaxed text-[#5f5e5a]">
            {owner} would rather you have this here than talk it through right now. Tap what she asked you to do.
          </p>
          <div className="space-y-2 pt-1">
            {(["necropsy", "burial", "vet"] as PassingPath[]).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => { setStep(p); window.scrollTo(0, 0); }}
                className="flex min-h-[52px] w-full items-center gap-3 rounded-xl border border-[#e0d8c4] bg-white px-4 text-left active:scale-[0.99]"
              >
                <span className="flex-1 text-sm font-medium text-[#1a3d2e]">{PATH_CHOICE_LABELS[p](name)}</span>
                <ChevronRight className="size-4 shrink-0 text-[#8a897f]" />
              </button>
            ))}
          </div>
        </main>
      )}

      {(step === "necropsy" || step === "burial" || step === "vet") && (
        <main className="mx-auto max-w-md space-y-4 px-5 py-6">
          <PathDetail path={step} name={name} ownerName={owner} vet={vet} audience="sitter" />
        </main>
      )}
    </div>
  );
}
