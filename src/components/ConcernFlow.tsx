import { useEffect, useState } from "react";
import { ArrowLeft, Phone, Loader2, ChevronRight } from "lucide-react";
import { PathDetail, PATH_CHOICE_LABELS, type PassingPath, type VetContact } from "@/components/PassingGuidance";

// The ONE "something's wrong" flow — pause screen → path choice → path detail.
// Rendered by BOTH the token sitter route and the authenticated covering-member
// route, so a household member in charge of a sit gets the identical flow and
// copy as a sitter-link account. The host supplies chrome + the pause action;
// this owns the exact strings. Copy-exact: do not paraphrase.
export function ConcernFlow({
  name, ownerName, ownerPhone, vet, paused, onPause, pausePending,
}: {
  name: string;
  ownerName: string;
  ownerPhone: string | null;
  vet: VetContact;
  /** Live paused state for this bird (advances the flow once the pause lands,
   *  and lets a return visit land straight on the paths). */
  paused: boolean;
  onPause: () => void;
  pausePending: boolean;
}) {
  const [step, setStep] = useState<"pause" | "paths" | PassingPath>(paused ? "paths" : "pause");
  useEffect(() => {
    if (paused && step === "pause") setStep("paths");
  }, [paused, step]);

  if (step === "pause") {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-medium text-[#1a3d2e]">Is {name} okay?</h2>
        <p className="text-sm leading-relaxed text-[#5f5e5a]">
          If {name} has passed or is in serious trouble, first call {ownerName} so she knows. We can pause {name}'s reminders so your phone isn't asking you to check on them.
        </p>
        {ownerPhone && (
          <a
            href={`tel:${ownerPhone}`}
            className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-[#1a3d2e] text-sm font-medium text-white active:scale-[0.99]"
          >
            <Phone className="size-4" /> Call {ownerName}
          </a>
        )}
        <button
          type="button"
          disabled={pausePending}
          onClick={onPause}
          className="flex min-h-[48px] w-full items-center justify-center rounded-xl border border-[#c8bfa6] bg-white text-sm font-medium text-[#1a3d2e] active:scale-[0.99] disabled:opacity-60"
        >
          {pausePending ? <Loader2 className="size-4 animate-spin" /> : `Pause ${name}'s reminders`}
        </button>
        <p className="text-xs leading-relaxed text-[#5f5e5a]">
          Pausing won't change {name}'s record. {ownerName} decides what happens next.
        </p>
      </div>
    );
  }

  if (step === "paths") {
    return (
      <div className="space-y-4">
        <p className="text-[11px] font-medium uppercase tracking-widest text-[#5f5e5a]">Reminders paused · {ownerName} notified</p>
        <h2 className="text-xl font-medium text-[#1a3d2e]">Thank you for caring for {name}.</h2>
        <p className="text-sm leading-relaxed text-[#5f5e5a]">
          {ownerName} would rather you have this here than talk it through right now. Tap what she asked you to do.
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
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => { setStep("paths"); window.scrollTo(0, 0); }}
        className="flex items-center gap-1.5 text-sm font-medium text-[#5f5e5a]"
      >
        <ArrowLeft className="size-4" /> Back
      </button>
      <PathDetail path={step} name={name} ownerName={ownerName} vet={vet} audience="sitter" />
    </div>
  );
}
