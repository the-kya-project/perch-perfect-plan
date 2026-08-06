import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Phone, Loader2, ChevronRight } from "lucide-react";
import { PathDetail, type PassingPath, type VetContact } from "@/components/PassingGuidance";

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
  const { t } = useTranslation();
  // Literal-key path-choice labels (moved off PassingGuidance's module-scope
  // PATH_CHOICE_LABELS so i18next-parser can extract them and the sitter sees
  // Dutch). Owner renders these through the English-pinned instance → the
  // defaults below reproduce the original output byte-for-byte.
  const pathChoiceLabel = (p: PassingPath, birdName: string): string => {
    switch (p) {
      case "necropsy": return t("passingGuidance.pathChoice.necropsy", "Keep {{name}} for a necropsy", { name: birdName });
      case "burial": return t("passingGuidance.pathChoice.burial", "Prepare {{name}} for burial or cremation", { name: birdName });
      case "vet": return t("passingGuidance.pathChoice.vet", "Bring {{name}} to the vet", { name: birdName });
    }
  };
  const [step, setStep] = useState<"pause" | "paths" | PassingPath>(paused ? "paths" : "pause");
  useEffect(() => {
    if (paused && step === "pause") setStep("paths");
  }, [paused, step]);

  if (step === "pause") {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-medium text-[#1a3d2e]">{t("concernFlow.pauseTitle", "Is {{name}} okay?", { name })}</h2>
        <p className="text-sm leading-relaxed text-[#5f5e5a]">
          {t("concernFlow.pauseBody", "If {{name}} has passed or is in serious trouble, first call {{ownerName}} so she knows. We can pause {{name}}'s reminders so your phone isn't asking you to check on them.", { name, ownerName })}
        </p>
        {ownerPhone && (
          <a
            href={`tel:${ownerPhone}`}
            className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-[#1a3d2e] text-sm font-medium text-white active:scale-[0.99]"
          >
            <Phone className="size-4" /> {t("concernFlow.callOwner", "Call {{ownerName}}", { ownerName })}
          </a>
        )}
        <button
          type="button"
          disabled={pausePending}
          onClick={onPause}
          className="flex min-h-[48px] w-full items-center justify-center rounded-xl border border-[#c8bfa6] bg-white text-sm font-medium text-[#1a3d2e] active:scale-[0.99] disabled:opacity-60"
        >
          {pausePending ? <Loader2 className="size-4 animate-spin" /> : t("concernFlow.pauseButton", "Pause {{name}}'s reminders", { name })}
        </button>
        <p className="text-xs leading-relaxed text-[#5f5e5a]">
          {t("concernFlow.pauseFootnote", "Pausing won't change {{name}}'s record. {{ownerName}} decides what happens next.", { name, ownerName })}
        </p>
      </div>
    );
  }

  if (step === "paths") {
    return (
      <div className="space-y-4">
        <p className="text-[11px] font-medium uppercase tracking-widest text-[#5f5e5a]">{t("concernFlow.pausedBadge", "Reminders paused · {{ownerName}} notified", { ownerName })}</p>
        <h2 className="text-xl font-medium text-[#1a3d2e]">{t("concernFlow.pathsTitle", "Thank you for caring for {{name}}.", { name })}</h2>
        <p className="text-sm leading-relaxed text-[#5f5e5a]">
          {t("concernFlow.pathsBody", "{{ownerName}} would rather you have this here than talk it through right now. Tap what she asked you to do.", { ownerName })}
        </p>
        <div className="space-y-2 pt-1">
          {(["necropsy", "burial", "vet"] as PassingPath[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => { setStep(p); window.scrollTo(0, 0); }}
              className="flex min-h-[52px] w-full items-center gap-3 rounded-xl border border-[#e0d8c4] bg-white px-4 text-left active:scale-[0.99]"
            >
              <span className="flex-1 text-sm font-medium text-[#1a3d2e]">{pathChoiceLabel(p, name)}</span>
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
        <ArrowLeft className="size-4" /> {t("concernFlow.back", "Back")}
      </button>
      <PathDetail path={step} name={name} ownerName={ownerName} vet={vet} audience="sitter" />
    </div>
  );
}
