import { ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { OwnerTabBar } from "@/components/OwnerTabBar";

export { SETUP_STEPS, TOTAL_STEPS, NUMBERED_STEPS, setupStepNumber, type SetupStepKey } from "@/lib/setupSteps";
import { SETUP_STEPS, setupStepNumber, type SetupStepKey } from "@/lib/setupSteps";
import { SetupFrame, type SetupPill } from "@/components/setup/SetupFrame";
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
    <div className="flex items-center gap-3">
      {onSaveAndExit && (
        <SetupTextButton onClick={onSaveAndExit} disabled={saving}>{t("setupShell.saveAndExit", "Save & exit")}</SetupTextButton>
      )}
      <div className="min-w-0 flex-1">
        <SetupPrimaryButton onClick={onNext} disabled={nextDisabled || saving}>
          {saving ? t("setupShell.saving", "Saving…") : nextLabel}
        </SetupPrimaryButton>
      </div>
    </div>
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
        onBack={() => (onBack && !backDisabled ? onBack() : handleExit())}
        backLabel={onBack && !backDisabled ? t("setupShell.previousStep", "Previous step") : exitLabel ?? t("setupFrame.back", "Back")}
        onPill={onNavigateStep ? (p) => { const key = PILL_STEP[p]; if (key) onNavigateStep(setupStepNumber(key)); } : undefined}
        footer={footer}
        // The owner nav stays under the footer: leaving through it keeps the
        // current step (autosave flushes on unmount).
        belowFooter={<OwnerTabBar embedded />}
      >
        {children}
      </SetupFrame>

      {/* Unsaved-changes confirmation before exiting to the bird profile */}
      {confirmExit && (
        <div className="fixed inset-0 z-[60] grid place-items-center p-6">
          <div className="absolute inset-0 bg-[var(--ink)]/40" onClick={() => setConfirmExit(false)} />
          <div
            role="alertdialog"
            aria-label={t("setupShell.leaveThisStep", "Leave this step")}
            className="relative w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl"
          >
            <h2 className="t-section">{exitConfirmTitle}</h2>
            <p className="t-body mt-1 text-[var(--ink2)]">{exitConfirmBody}</p>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmExit(false)}
                className="min-h-[44px] flex-1 rounded-xl border border-[var(--line)] bg-white py-2.5 text-[15px] font-[500] text-[var(--ink)]"
              >
                {t("setupShell.cancel", "Cancel")}
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmExit(false);
                  onExit?.();
                }}
                className="min-h-[44px] flex-1 rounded-xl bg-[var(--ink)] py-2.5 text-[15px] font-[500] text-white"
              >
                {exitConfirmCta}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
