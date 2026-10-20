import { ReactNode, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { ArrowLeft, Check, ChevronDown } from "lucide-react";
import { OwnerTabBar } from "@/components/OwnerTabBar";

export const SETUP_STEPS = [
  // Details (name, species, photo…) is the Add-a-bird page, which saves the bird
  // before the wizard opens. Food → Health are the basics; the wizard then offers
  // a stop point before the pet-sitter details (Behavior, Tips, Day). Home and
  // Emergency come last until they move to the shared "Your home" section.
  // Food still comes before Day because Day auto-derives feeding/water items
  // from Food. Review is the finishing screen, not a numbered step.
  { key: "food", title: "Food & water", short: "Food" },
  { key: "health", title: "Health baseline", short: "Health" },
  { key: "personality", title: "Personality & handling", short: "Behavior" },
  { key: "clips", title: "Tips from the owner", short: "Clips" },
  { key: "day", title: "A day in the life", short: "Routine" },
  { key: "environment", title: "Environment & safety", short: "Home" },
  { key: "emergency", title: "Emergency info", short: "Emergency" },
  { key: "review", title: "Review & finish", short: "Review" },
] as const;

export const TOTAL_STEPS = SETUP_STEPS.length;
/** Steps counted in "Step N of M": everything before the Review screen. */
export const NUMBERED_STEPS = TOTAL_STEPS - 1;

export type SetupStepKey = (typeof SETUP_STEPS)[number]["key"];

/** 1-indexed position of a step in the current flow. */
export function setupStepNumber(key: SetupStepKey): number {
  return SETUP_STEPS.findIndex((s) => s.key === key) + 1;
}


/** Display title for a setup step (SETUP_STEPS stays the English source). */
export function setupStepTitle(t: TFunction, key: SetupStepKey): string {
  switch (key) {
    case "food": return t("setupShell.titleFood", "Food & water");
    case "personality": return t("setupShell.titlePersonality", "Personality & handling");
    case "environment": return t("setupShell.titleEnvironment", "Environment & safety");
    case "health": return t("setupShell.titleHealth", "Health baseline");
    case "day": return t("setupShell.titleDay", "A day in the life");
    case "clips": return t("setupShell.titleClips", "Tips from the owner");
    case "emergency": return t("setupShell.titleEmergency", "Emergency info");
    case "review": return t("setupShell.titleReview", "Review & finish");
  }
}

/** Short display label for a setup step (the "All steps" sheet). */
export function setupStepShort(t: TFunction, key: SetupStepKey): string {
  switch (key) {
    case "food": return t("planEditor.tabFood", "Food");
    case "personality": return t("planEditor.tabBehavior", "Behavior");
    case "environment": return t("planEditor.tabHome", "Home");
    case "health": return t("planEditor.tabHealth", "Health");
    case "day": return t("planEditor.tabRoutine", "Routine");
    case "clips": return t("planEditor.tabClips", "Clips");
    case "emergency": return t("planEditor.tabEmergency", "Emergency");
    case "review": return t("setupShell.shortReview", "Review");
  }
}

type StepState = "completed" | "active" | "upcoming";

function stepState(index: number, current: number): StepState {
  if (index + 1 < current) return "completed";
  if (index + 1 === current) return "active";
  return "upcoming";
}

export function SetupShell({
  step,
  title,
  subtitle,
  children,
  birdName,
  birdSpecies,
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
}: {
  step: number; // 1-indexed
  title: string;
  subtitle?: string;
  children: ReactNode;
  birdName?: string;
  birdSpecies?: string;
  onNavigateStep?: (target: number) => void; // tab / drawer navigation (1-indexed)
  onExit?: () => void; // header back arrow -> bird profile (or cancel, on the new-bird screen)
  exitLabel?: string; // header arrow label; defaults to the bird name. Pass "Cancel" when exiting discards.
  exitConfirmTitle?: string;
  exitConfirmBody?: string;
  exitConfirmCta?: string;
  isDirty?: boolean;
  onBack?: () => void; // footer: previous step
  onNext?: () => void;
  onSaveAndExit?: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
  saving?: boolean;
  backDisabled?: boolean;
  hideFooter?: boolean;
  eyebrow?: string; // replaces "Step N of M" (e.g. on the stop point)
}) {
  const { t } = useTranslation();
  const exitConfirmTitle = exitConfirmTitleProp ?? t("setupShell.exitConfirmTitle", "Leave this step?");
  const exitConfirmBody = exitConfirmBodyProp ?? t("setupShell.exitConfirmBody", "Your progress is saved — you can pick up right where you left off.");
  const exitConfirmCta = exitConfirmCtaProp ?? t("setupShell.exitConfirmCta", "Leave");
  const nextLabel = nextLabelProp ?? t("setupShell.next", "Next");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [confirmExit, setConfirmExit] = useState(false);

  // Edge fades so the desktop step-pill strip reads as scrollable.
  const pillStripRef = useRef<HTMLDivElement>(null);
  const [pillAtStart, setPillAtStart] = useState(true);
  const [pillAtEnd, setPillAtEnd] = useState(false);
  function updatePillFades() {
    const el = pillStripRef.current;
    if (!el) return;
    setPillAtStart(el.scrollLeft <= 1);
    setPillAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 1);
  }
  useEffect(() => {
    const raf = requestAnimationFrame(updatePillFades);
    window.addEventListener("resize", updatePillFades);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", updatePillFades); };
     
  }, [step]);

  const current = SETUP_STEPS[step - 1];
  // Callers pass the English SETUP_STEPS title; show its translation.
  const displayTitle = current && title === current.title ? setupStepTitle(t, current.key) : title;

  function handleExit() {
    if (!onExit) return;
    if (isDirty) setConfirmExit(true);
    else onExit();
  }

  function goToStep(target: number) {
    setDrawerOpen(false);
    onNavigateStep?.(target);
  }

  const birdLabel = exitLabel ?? (birdName?.trim() || t("setupShell.bird", "Bird"));

  return (
    <div className={`min-h-screen bg-[var(--cream)] ${hideFooter ? "pb-28" : "pb-44"}`}>
      {/* InkHero-style wizard header: Step N of M + section name + lime dots. */}
      <header className="bg-[var(--ink)] text-white">
        <div className="mx-auto max-w-md px-[22px] pb-[20px] pt-[max(env(safe-area-inset-top),18px)]">
          <div className="mb-3 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={handleExit}
              disabled={!onExit}
              aria-label={exitLabel ?? t("setupShell.backTo", "Back to {{name}}", { name: birdLabel })}
              className="-ml-1.5 flex items-center gap-1 text-white/90 disabled:opacity-40"
            >
              <ArrowLeft className="size-5 shrink-0" />
              <span className="max-w-[8rem] truncate text-[14px] font-[500]">{birdLabel}</span>
            </button>
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              className="flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-[12px] font-[500] text-white"
              style={{ background: "rgba(255,255,255,0.12)" }}
            >
              {t("setupShell.allSteps", "All steps")} <ChevronDown className="size-4" />
            </button>
          </div>
          <p className="t-eyebrow text-[var(--lime)]">
            {eyebrow ?? (step > NUMBERED_STEPS
              ? t("setupShell.lastLook", "Last look")
              : t("setupShell.stepOf", "Step {{step}} of {{total}}", { step, total: NUMBERED_STEPS }))}
          </p>
          <h1 className="t-hero mt-1 text-white">{displayTitle}</h1>
          <div className="mt-3 flex items-center gap-1" aria-hidden="true">
            {SETUP_STEPS.slice(0, NUMBERED_STEPS).map((s, i) => {
              const state = stepState(i, step);
              return (
                <span
                  key={s.key}
                  className={`h-1.5 rounded-full transition-all ${
                    state === "active" ? "w-5 bg-[var(--lime)]" : state === "completed" ? "w-1.5 bg-[var(--lime)]" : "w-1.5 bg-white/30"
                  }`}
                />
              );
            })}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-md space-y-4 px-5 py-5">
        {subtitle && <p className="t-body text-[var(--ink2)]">{subtitle}</p>}
        {children}
      </main>

      {/* Bottom region: the flow's own controls (Back / Save & exit / Next)
          stacked above the owner bottom nav. The nav is additive — leaving via
          it preserves the current step (autosave flushes on unmount). */}
      <div className="fixed inset-x-0 bottom-0 z-40">
        {!hideFooter && (
          <div className="border-t border-[var(--line)] bg-[var(--cream)]/95 backdrop-blur">
            <div className="mx-auto flex max-w-md items-center gap-2 px-5 py-3">
              <button
                type="button"
                onClick={onBack}
                disabled={backDisabled || saving}
                aria-label={t("setupShell.previousStep", "Previous step")}
                className="grid size-11 shrink-0 place-items-center rounded-xl border border-[var(--line)] bg-white text-[var(--ink)] disabled:opacity-40"
              >
                <ArrowLeft className="size-5" />
              </button>
              {onSaveAndExit && (
                <button
                  type="button"
                  onClick={onSaveAndExit}
                  disabled={saving}
                  className="shrink-0 px-2 text-[12px] font-[500] text-[var(--mute)] underline disabled:opacity-50"
                >
                  {t("setupShell.saveAndExit", "Save & exit")}
                </button>
              )}
              <button
                type="button"
                onClick={onNext}
                disabled={nextDisabled || saving}
                className="min-h-[44px] flex-1 rounded-xl bg-[var(--ink)] py-3 text-[15px] font-[500] text-white disabled:opacity-50"
              >
                {saving ? t("setupShell.saving", "Saving…") : nextLabel}
              </button>
            </div>
          </div>
        )}
        <OwnerTabBar embedded />
      </div>

      {/* "All steps" bottom sheet */}
      <div
        className={`fixed inset-0 z-50 ${drawerOpen ? "" : "pointer-events-none"}`}
        aria-hidden={!drawerOpen}
      >
        <div
          onClick={() => setDrawerOpen(false)}
          className={`absolute inset-0 bg-[var(--ink)]/40 transition-opacity ${
            drawerOpen ? "opacity-100" : "opacity-0"
          }`}
        />
        <div
          role="dialog"
          aria-label={t("setupShell.allSteps", "All steps")}
          className={`absolute inset-x-0 bottom-0 mx-auto max-w-md rounded-t-2xl bg-white pb-[max(1rem,env(safe-area-inset-bottom))] shadow-xl transition-transform duration-200 ${
            drawerOpen ? "translate-y-0" : "translate-y-full"
          }`}
        >
          <div className="flex justify-center pt-3">
            <span className="h-1 w-10 rounded-full bg-[var(--line)]" />
          </div>
          <p className="t-eyebrow px-5 pb-2 pt-3 text-[var(--mute2)]">{t("setupShell.allSteps", "All steps")}</p>
          <ul className="max-h-[60vh] overflow-y-auto px-2 pb-2">
            {SETUP_STEPS.map((s, i) => {
              const state = stepState(i, step);
              return (
                <li key={s.key}>
                  <button
                    type="button"
                    onClick={() => goToStep(i + 1)}
                    className="flex min-h-[48px] w-full items-center gap-3 rounded-xl px-3 text-left hover:bg-[var(--cream)]"
                  >
                    {state === "completed" ? (
                      <span className="grid size-7 shrink-0 place-items-center rounded-full bg-[var(--ink)] text-[var(--lime)]">
                        <Check className="size-4" />
                      </span>
                    ) : state === "active" ? (
                      <span className="grid size-7 shrink-0 place-items-center rounded-full bg-[var(--ink)] text-xs font-[500] text-white">
                        {i + 1}
                      </span>
                    ) : (
                      <span className="grid size-7 shrink-0 place-items-center rounded-full bg-[var(--pale2)] text-xs font-[500] text-[var(--mute)]">
                        {i + 1}
                      </span>
                    )}
                    <span className="t-item flex-1">{setupStepShort(t, s.key)}</span>
                    <span className="t-eyebrow text-[var(--mute2)]">
                      {state === "completed" ? t("setupShell.done", "Done") : state === "active" ? t("setupShell.hereNow", "Here now") : ""}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

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
    </div>
  );
}
