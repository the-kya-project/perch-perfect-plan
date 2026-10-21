import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Phone, Loader2, ChevronRight } from "lucide-react";
import { PathDetail, type PassingPath, type VetContact } from "@/components/PassingGuidance";
import { K, KyaHeading, KyaTag } from "@/components/kya";

// The ONE "something's wrong" flow — pause screen → path choice → path detail.
// Rendered by BOTH the token sitter route and the authenticated covering-member
// route, so a household member in charge of a sit gets the identical flow and
// copy as a sitter-link account. The host supplies chrome + the pause action;
// this owns the exact strings. Copy-exact: do not paraphrase.
export function ConcernFlow({
  name, ownerName, ownerPhone, vet, paused, onPause, pausePending, ownerCallShown,
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
  /** Sitter view only: the host already shows the owner's call row above the
   *  flow, so the pause step leaves out its own "Call [owner]" button.
   *  Unset (owner app) = unchanged. */
  ownerCallShown?: boolean;
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

  return (
    <KyaConcernSteps
      step={step} setStep={setStep} name={name} ownerName={ownerName} ownerPhone={ownerPhone}
      vet={vet} onPause={onPause} pausePending={pausePending} pathChoiceLabel={pathChoiceLabel}
      ownerCallShown={ownerCallShown}
    />
  );
}

// The three steps in the current Kya look: Newsreader headings, 15px K.ink
// body, sunflower call button, amber "Reminders paused" tag.
function KyaConcernSteps({
  step, setStep, name, ownerName, ownerPhone, vet, onPause, pausePending, pathChoiceLabel, ownerCallShown,
}: {
  step: "pause" | "paths" | PassingPath;
  setStep: (s: "pause" | "paths" | PassingPath) => void;
  name: string;
  ownerName: string;
  ownerPhone: string | null;
  vet: VetContact;
  onPause: () => void;
  pausePending: boolean;
  pathChoiceLabel: (p: PassingPath, birdName: string) => string;
  ownerCallShown?: boolean;
}) {
  const { t } = useTranslation();
  const body = "m-0 text-[15px] leading-[1.5]";

  if (step === "pause") {
    return (
      <div className="flex flex-col gap-4" style={{ color: K.forest }}>
        <KyaHeading size={24}>{t("concernFlow.pauseTitle", "Is {{name}} okay?", { name })}</KyaHeading>
        <p className={body} style={{ color: K.ink }}>
          {t("concernFlow.pauseBody", "If {{name}} has passed or is in serious trouble, call {{ownerName}} first. We can pause {{name}}'s reminders so your phone isn't asking you to check on them.", { name, ownerName })}
        </p>
        {ownerPhone && !ownerCallShown && (
          <a
            href={`tel:${ownerPhone}`}
            className="inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-full border-2 px-6 text-[16px] font-[700] active:scale-[0.99]"
            style={{ background: K.sunflower, borderColor: K.forest, color: K.forest }}
          >
            <Phone className="size-5" /> {t("concernFlow.callOwner", "Call {{ownerName}}", { ownerName })}
          </a>
        )}
        <button
          type="button"
          disabled={pausePending}
          onClick={onPause}
          className="inline-flex min-h-[48px] w-full items-center justify-center rounded-full border-2 bg-white px-4 text-[15px] font-[700] active:scale-[0.99] disabled:opacity-60"
          style={{ borderColor: K.forest, color: K.forest }}
        >
          {pausePending ? <Loader2 className="size-4 animate-spin" /> : t("concernFlow.pauseButton", "Pause {{name}}'s reminders", { name })}
        </button>
        <p className="m-0 text-[13.5px] leading-[1.5]" style={{ color: K.quiet }}>
          {t("concernFlow.pauseFootnote", "Pausing won't change {{name}}'s record. {{ownerName}} decides what happens next.", { name, ownerName })}
        </p>
      </div>
    );
  }

  if (step === "paths") {
    return (
      <div className="flex flex-col gap-4" style={{ color: K.forest }}>
        <div><KyaTag tone="amber">{t("concernFlow.pausedBadge", "Reminders paused · {{ownerName}} notified", { ownerName })}</KyaTag></div>
        <KyaHeading size={24}>{t("concernFlow.pathsHeading", "Thank you for caring for {{name}}", { name })}</KyaHeading>
        <p className={body} style={{ color: K.ink }}>
          {t("concernFlow.pathsBody", "{{ownerName}} would rather you have this here than talk it through right now. Tap what {{ownerName}} asked you to do.", { ownerName })}
        </p>
        <div className="overflow-hidden rounded-[16px] border" style={{ borderColor: K.line }}>
          {(["necropsy", "burial", "vet"] as PassingPath[]).map((p, i, all) => (
            <button
              key={p}
              type="button"
              onClick={() => { setStep(p); window.scrollTo(0, 0); }}
              className="flex min-h-[60px] w-full items-center gap-3 bg-white px-4 py-3 text-left active:bg-black/[0.03]"
              style={{ borderBottom: i === all.length - 1 ? undefined : `1px solid ${K.line}`, color: K.forest }}
            >
              <span className="flex-1 text-[15px] font-[700]">{pathChoiceLabel(p, name)}</span>
              <ChevronRight className="size-[18px] shrink-0" style={{ color: K.quiet }} aria-hidden="true" />
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3" style={{ color: K.forest }}>
      <button
        type="button"
        onClick={() => { setStep("paths"); window.scrollTo(0, 0); }}
        className="inline-flex min-h-[44px] items-center gap-1.5 self-start text-[15px] font-[700]"
        style={{ color: K.moss }}
      >
        <ArrowLeft className="size-4" /> {t("concernFlow.back", "Back")}
      </button>
      <PathDetail path={step} name={name} ownerName={ownerName} vet={vet} audience="sitter" look="kya" />
    </div>
  );
}
