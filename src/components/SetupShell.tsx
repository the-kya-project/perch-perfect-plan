import { ReactNode, useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, Check, ChevronDown } from "lucide-react";
import { OwnerTabBar } from "@/components/OwnerTabBar";

export const SETUP_STEPS = [
  // Basics has moved to the bird main page; the wizard is now pure care
  // instructions. Daily rhythm sits after the descriptive sections so it can
  // be reviewed against the full care picture — Food still comes first because
  // the Routine step auto-derives feeding/water items from Food.
  { key: "food", title: "Food & water", short: "Food" },
  { key: "personality", title: "Personality & handling", short: "Behavior" },
  { key: "environment", title: "Environment & safety", short: "Home" },
  { key: "health", title: "Health baseline", short: "Health" },
  { key: "day", title: "A day in the life", short: "Routine" },
  { key: "clips", title: "Tips from the owner", short: "Clips" },
  { key: "emergency", title: "Emergency info", short: "Emergency" },
  { key: "review", title: "Review & finish", short: "Review" },
] as const;

export const TOTAL_STEPS = SETUP_STEPS.length;

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
  exitConfirmTitle = "Leave this step?",
  exitConfirmBody = "Your progress is saved — you can pick up right where you left off.",
  exitConfirmCta = "Leave",
  isDirty,
  onBack,
  onNext,
  onSaveAndExit,
  nextLabel = "Next",
  nextDisabled,
  saving,
  backDisabled,
  hideFooter,
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
}) {
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

  const completedCount = Math.max(0, step - 1);
  const pct = Math.round((completedCount / TOTAL_STEPS) * 100);
  const current = SETUP_STEPS[step - 1];

  function handleExit() {
    if (!onExit) return;
    if (isDirty) setConfirmExit(true);
    else onExit();
  }

  function goToStep(target: number) {
    setDrawerOpen(false);
    onNavigateStep?.(target);
  }

  const birdLabel = exitLabel ?? (birdName?.trim() || "Bird");

  return (
    <div className={`min-h-screen bg-[var(--cream)] ${hideFooter ? "pb-28" : "pb-44"}`}>
      {/* InkHero-style wizard header: Step N of 8 + section name + lime dots. */}
      <header className="bg-[var(--ink)] text-white">
        <div className="mx-auto max-w-md px-[22px] pb-[20px] pt-[max(env(safe-area-inset-top),18px)]">
          <div className="mb-3 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={handleExit}
              disabled={!onExit}
              aria-label={exitLabel ?? `Back to ${birdLabel}`}
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
              All steps <ChevronDown className="size-4" />
            </button>
          </div>
          <p className="t-eyebrow text-[var(--lime)]">Step {step} of {TOTAL_STEPS}</p>
          <h1 className="t-hero mt-1 text-white">{title}</h1>
          <div className="mt-3 flex items-center gap-1" aria-hidden="true">
            {SETUP_STEPS.map((s, i) => {
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
                aria-label="Previous step"
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
                  Save &amp; exit
                </button>
              )}
              <button
                type="button"
                onClick={onNext}
                disabled={nextDisabled || saving}
                className="min-h-[44px] flex-1 rounded-xl bg-[var(--ink)] py-3 text-[15px] font-[500] text-white disabled:opacity-50"
              >
                {saving ? "Saving…" : nextLabel}
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
          aria-label="All steps"
          className={`absolute inset-x-0 bottom-0 mx-auto max-w-md rounded-t-2xl bg-white pb-[max(1rem,env(safe-area-inset-bottom))] shadow-xl transition-transform duration-200 ${
            drawerOpen ? "translate-y-0" : "translate-y-full"
          }`}
        >
          <div className="flex justify-center pt-3">
            <span className="h-1 w-10 rounded-full bg-[var(--line)]" />
          </div>
          <p className="t-eyebrow px-5 pb-2 pt-3 text-[var(--mute2)]">All steps</p>
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
                    <span className="t-item flex-1">{s.short}</span>
                    <span className="t-eyebrow text-[var(--mute2)]">
                      {state === "completed" ? "Done" : state === "active" ? "Here now" : ""}
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
            aria-label="Leave this step"
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
                Cancel
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
