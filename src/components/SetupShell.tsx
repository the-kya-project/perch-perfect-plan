import { ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { KyaHeading, KyaPrimaryButton, KyaSecondaryButton, KyaSheet } from "@/components/kya";

export { SETUP_STEPS, TOTAL_STEPS, NUMBERED_STEPS, setupStepNumber, type SetupStepKey } from "@/lib/setupSteps";
import { SETUP_STEPS, setupStepNumber, type SetupStepKey } from "@/lib/setupSteps";
import { SetupFrame, type SetupPill, type HomePill } from "@/components/setup/SetupFrame";
import { SetupPrimaryButton, SetupTextButton } from "@/components/setup/controls";

/** Display title for a setup step (SETUP_STEPS stays the English source). */
export function setupStepTitle(t: TFunction, key: SetupStepKey): string {
  switch (key) {
    case "food": return t("setupShell.titleFood", "Food & water");
    case "personality": return t("setupShell.titlePersonality", "Personality & handling");
    case "environment": return t("setupShell.titleReminders", "Reminders for your sitter");
    case "health": return t("setupShell.titleHealth", "Health baseline");
    case "day": return t("setupShell.titleDay", "A day in the life");
    case "clips": return t("setupShell.titleClips", "Tips from the owner");
    case "emergency": return t("setupShell.titleEmergencyContacts", "Emergency contacts");
    case "review": return t("setupShell.titleReview", "Review & finish");
  }
}

// Which of the six step pills each walkthrough step sits under. Reminders,
// Emergency contacts and Review come after the six steps (all pills done).
const STEP_PILL: Partial<Record<SetupStepKey, SetupPill>> = {
  food: "food",
  health: "health",
  personality: "behavior",
  clips: "tips",
  day: "day",
};
const PILL_STEP: Partial<Record<SetupPill, SetupStepKey>> = { food: "food", health: "health", behavior: "personality", tips: "clips", day: "day" };

export function SetupShell({
  step,
  title,
  subtitle,
  children,
  birdName,
  onNavigateStep,
  onExit,
  exitLabel,
  exitConfirmTitle: exitConfirmTitleProp,
  exitConfirmBody: exitConfirmBodyProp,
  exitConfirmCta: exitConfirmCtaProp,
  isDirty,
  onBack,
  onNext,
  onSaveAndExit,
  nextLabel: nextLabelProp,
  nextDisabled,
  footerNote,
  footerNoteWarn,
  tinted,
  homeSubline,
  onSkip,
  saving,
  backDisabled,
  hideFooter,
  eyebrow,
  footer: footerProp,
  page,
}: {
  step: number; // 1-indexed
  title: string;
  subtitle?: string;
  children: ReactNode;
  birdName?: string;
  birdSpecies?: string;
  onNavigateStep?: (target: number) => void; // pill navigation (1-indexed)
  onExit?: () => void; // Back on the first step -> bird profile
  exitLabel?: string;
  exitConfirmTitle?: string;
  exitConfirmBody?: string;
  exitConfirmCta?: string;
  isDirty?: boolean;
  onBack?: () => void; // header Back: previous step
  onNext?: () => void;
  onSaveAndExit?: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
  /** A short line above the footer buttons, e.g. why Next is waiting. */
  footerNote?: string | null;
  /** Show the footer note as an amber warning. */
  footerNoteWarn?: boolean;
  /** Light green body for screens made of white cards. */
  tinted?: boolean;
  /** "Your home" screens: the line under "Your home" (default "Shared by every bird"). */
  homeSubline?: string;
  /** Shows "Skip for now" in place of "Save & exit". */
  onSkip?: () => void;
  saving?: boolean;
  backDisabled?: boolean;
  hideFooter?: boolean;
  eyebrow?: string | null; // replaces "Step N of 6"
  footer?: ReactNode; // replaces the standard Save & exit / Next footer
  page?: [number, number]; // sub-page of the current step, e.g. Food · 2 of 2
}) {
  const { t } = useTranslation();
  const exitConfirmTitle = exitConfirmTitleProp ?? t("setupShell.exitConfirmTitle", "Leave this step?");
  const exitConfirmBody = exitConfirmBodyProp ?? t("setupShell.exitConfirmBody", "Your progress is saved — you can pick up right where you left off.");
  const exitConfirmCta = exitConfirmCtaProp ?? t("setupShell.exitConfirmCta", "Leave");
  const nextLabel = nextLabelProp ?? t("setupShell.next", "Next");
  const [confirmExit, setConfirmExit] = useState(false);

  const current = SETUP_STEPS[step - 1];
  // Callers pass the English SETUP_STEPS title; show its translation.
  const displayTitle = current && title === current.title ? setupStepTitle(t, current.key) : title;
  const pill = current ? STEP_PILL[current.key] ?? null : null;
  const homePill: HomePill | null = current?.key === "environment" ? "reminders" : current?.key === "emergency" ? "emergency" : null;
  const stepLabel = eyebrow
    ?? (current?.key === "review"
      ? t("setupShell.lastLook", "Last look")
      : !pill && current ? t("setupShell.yourHome", "Your home") : undefined);

  function handleExit() {
    if (!onExit) return;
    if (isDirty) setConfirmExit(true);
    else onExit();
  }

  const footer = footerProp ?? (hideFooter ? null : (
    <>
    {footerNote && (footerNoteWarn ? (
      <p role="status" className="m-0 mb-2.5 rounded-[14px] px-3.5 py-2.5 text-[14px] font-[500]" style={{ background: "#f6e7c4", color: "#854f0b" }}>{footerNote}</p>
    ) : (
      <p role="status" className="m-0 mb-2.5 text-center text-[14px] text-[#3d4f45]">{footerNote}</p>
    ))}
    <div className="flex items-center gap-3">
      {onSkip ? (
        <SetupTextButton onClick={onSkip} disabled={saving}>{t("setupShell.skipForNow", "Skip for now")}</SetupTextButton>
      ) : onSaveAndExit && (
        <SetupTextButton onClick={onSaveAndExit} disabled={saving}>{t("setupShell.saveAndExit", "Save & exit")}</SetupTextButton>
      )}
      <div className="min-w-0 flex-1">
        <SetupPrimaryButton onClick={onNext} disabled={nextDisabled || saving}>
          {saving ? t("setupShell.saving", "Saving…") : nextLabel}
        </SetupPrimaryButton>
      </div>
    </div>
    </>
  ));

  return (
    <>
      <SetupFrame
        birdName={birdName}
        current={pill}
        page={page}
        stepLabel={stepLabel}
        title={displayTitle}
        intro={subtitle}
        // Task rule: the top-left button closes the task (asking first when
        // there are unsaved changes). Earlier steps stay one tap away in the
        // step pills.
        onBack={handleExit}
        backLabel={exitLabel ?? t("setupFrame.close", "Close")}
        onPill={onNavigateStep ? (p) => { const key = PILL_STEP[p]; if (key) onNavigateStep(setupStepNumber(key)); } : undefined}
        footer={footer}
        tinted={tinted}
        allDone={current?.key === "review" ? t("setupShell.allStepsDone", "All 6 steps done") : undefined}
        home={homePill ? {
          current: homePill,
          subline: homeSubline ?? t("setupShell.sharedByEveryBird", "Shared by every bird"),
          onPill: onNavigateStep ? (p) => onNavigateStep(setupStepNumber(p === "reminders" ? "environment" : "emergency")) : undefined,
        } : undefined}
      >
        {children}
      </SetupFrame>

      {/* Unsaved-changes confirmation before closing the task */}
      {confirmExit && (
        <KyaSheet
          onClose={() => setConfirmExit(false)}
          closeLabel={t("setupShell.cancel", "Cancel")}
          title={<KyaHeading size={24}>{exitConfirmTitle}</KyaHeading>}
        >
          <p className="m-0 text-[15px] leading-[1.5] text-[#5f5e5a]">{exitConfirmBody}</p>
          <div className="mt-4 flex flex-col gap-2.5">
            <KyaPrimaryButton onClick={() => setConfirmExit(false)}>{t("headers.keepGoing", "Keep going")}</KyaPrimaryButton>
            <KyaSecondaryButton className="w-full" onClick={() => { setConfirmExit(false); onExit?.(); }}>{exitConfirmCta}</KyaSecondaryButton>
          </div>
        </KyaSheet>
      )}
    </>
  );
}
