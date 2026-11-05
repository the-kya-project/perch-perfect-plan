// The walkthrough's left half on the iPhone Duo: the ring and the
// walkthrough's steps in flow order (SETUP_STEPS), Review last. Tapping a step
// goes through the walkthrough's own jumpToStep (flush, save progress, then
// ?step= with replace), exactly like its "All steps" list.
import { useTranslation } from "react-i18next";
import { SETUP_STEPS, setupStepNumber, type SetupStepKey } from "@/lib/setupSteps";
import { setupStepTitle } from "@/components/SetupShell";
import { PlanProgressPane, planRowIcon, type PlanStep } from "@/components/duo/plan/PlanProgress";

export function SetupStepsPane({ birdId, birdName, current, onJumpToStep }: {
  birdId: string;
  birdName: string;
  current: SetupStepKey;
  onJumpToStep: (step: number) => void;
}) {
  const { t } = useTranslation();
  const steps: PlanStep[] = SETUP_STEPS.map((s) => ({
    key: s.key,
    title: setupStepTitle(t, s.key),
    row: s.key === "review" ? undefined : s.key,
    icon: planRowIcon(s.key),
  }));
  return (
    <PlanProgressPane
      birdId={birdId}
      birdName={birdName}
      steps={steps}
      current={current}
      onSelect={(key) => onJumpToStep(setupStepNumber(key as SetupStepKey))}
    />
  );
}
