// "Something's wrong" for a covering household member, on the iPhone Duo (two
// panes). Same flow, same state and same copy as ConcernFlow (COPY-EXACT):
// the steps on the dark left pane (Is … okay?, then the three paths once the
// reminders are paused), the current step on the right. The one main button is
// "Call [owner]" on the pause step (Pause, when there's no owner number).
// Only the authenticated route renders this; the sitter view keeps ConcernFlow.
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ClipboardList, Flower2, HeartPulse, Phone, Loader2, Stethoscope } from "lucide-react";
import { K, KyaTag } from "@/components/kya";
import { RailBack } from "@/components/DuoRail";
import { DUO, DuoMainButton, DuoTwoPane, PopOutCard, StepList, type Step } from "@/components/duo/DuoBlocks";
import { FlowHeading } from "@/components/duo/flows/FlowParts";
import { useConcernStep, usePathChoiceLabel } from "@/components/ConcernFlow";
import { PathDetail, pathTitle, type PassingPath, type VetContact } from "@/components/PassingGuidance";

export function ConcernDuo({ title, name, ownerName, ownerPhone, vet, paused, onPause, pausePending, onBack }: {
  title: string;
  name: string;
  ownerName: string;
  ownerPhone: string | null;
  vet: VetContact;
  paused: boolean;
  onPause: () => void;
  pausePending: boolean;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const pathChoiceLabel = usePathChoiceLabel();
  const [step, setStep] = useConcernStep(paused);
  const body = "m-0 text-[16px] leading-[1.55]";
  const pausedBadge = t("concernFlow.pausedBadge", "Reminders paused · {{ownerName}} notified", { ownerName });

  const icons: Record<PassingPath, ReactNode> = { necropsy: <ClipboardList />, burial: <Flower2 />, vet: <Stethoscope /> };
  const steps: Step[] = [
    { key: paused ? "paths" : "pause", title: t("concernFlow.pauseTitle", "Is {{name}} okay?", { name }), status: paused ? pausedBadge : undefined, done: paused, icon: <HeartPulse /> },
    ...(paused ? (["necropsy", "burial", "vet"] as PassingPath[]).map((p) => ({ key: p, title: pathChoiceLabel(p, name), icon: icons[p] })) : []),
  ];

  const pauseButton = (main: boolean) => main ? (
    <DuoMainButton disabled={pausePending} onClick={onPause}>
      {pausePending ? <Loader2 className="size-4 animate-spin" /> : t("concernFlow.pauseButton", "Pause {{name}}'s reminders", { name })}
    </DuoMainButton>
  ) : (
    <button
      type="button"
      disabled={pausePending}
      onClick={onPause}
      className="inline-flex min-h-[56px] w-full items-center justify-center rounded-full border-2 bg-white px-4 text-[16px] font-[700] active:scale-[0.99] disabled:opacity-60"
      style={{ borderColor: K.forest, color: K.forest }}
    >
      {pausePending ? <Loader2 className="size-4 animate-spin" /> : t("concernFlow.pauseButton", "Pause {{name}}'s reminders", { name })}
    </button>
  );

  let right;
  if (step === "pause") {
    right = (
      <PopOutCard
        title={t("concernFlow.pauseTitle", "Is {{name}} okay?", { name })}
        action={ownerPhone ? (
          <a
            href={`tel:${ownerPhone}`}
            className="inline-flex min-h-[56px] w-full items-center justify-center gap-2 rounded-full border-2 px-6 text-[17px] font-[700] active:scale-[0.99]"
            style={{ background: "#f2b33d", borderColor: DUO.forest, color: DUO.forest }}
          >
            <Phone className="size-5" /> {t("concernFlow.callOwner", "Call {{ownerName}}", { ownerName })}
          </a>
        ) : pauseButton(true)}
      >
        <div className="flex flex-col gap-4">
          <p className={body} style={{ color: K.ink }}>
            {t("concernFlow.pauseBody", "If {{name}} has passed or is in serious trouble, call {{ownerName}} first. We can pause {{name}}'s reminders so your phone isn't asking you to check on them.", { name, ownerName })}
          </p>
          {ownerPhone && pauseButton(false)}
          <p className="m-0 text-[14px] leading-[1.5]" style={{ color: K.quiet }}>
            {t("concernFlow.pauseFootnote", "Pausing won't change {{name}}'s record. {{ownerName}} decides what happens next.", { name, ownerName })}
          </p>
        </div>
      </PopOutCard>
    );
  } else if (step === "paths") {
    right = (
      <PopOutCard title={t("concernFlow.pathsHeading", "Thank you for caring for {{name}}", { name })}>
        <div className="flex flex-col gap-4">
          <div><KyaTag tone="amber">{pausedBadge}</KyaTag></div>
          <p className={body} style={{ color: K.ink }}>
            {t("concernFlow.pathsBody", "{{ownerName}} would rather you have this here than talk it through right now. Tap what {{ownerName}} asked you to do.", { ownerName })}
          </p>
        </div>
      </PopOutCard>
    );
  } else {
    right = (
      <PopOutCard eyebrow={pathChoiceLabel(step, name)} title={pathTitle(t, step, name)}>
        <PathDetail key={step} path={step} name={name} ownerName={ownerName} vet={vet} audience="sitter" look="kya" hideTitle />
      </PopOutCard>
    );
  }

  return (
    <DuoTwoPane
      dark
      leftLabel={title}
      left={
        <>
          <RailBack onBack={onBack} />
          <FlowHeading dark title={title} />
          <div className="mt-6">
            <StepList label={title} steps={steps} current={step} onSelect={(k) => setStep(k as typeof step)} />
          </div>
        </>
      }
      right={right}
    />
  );
}
