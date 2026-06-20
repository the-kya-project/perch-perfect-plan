import { ReactNode, useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, Check, ChevronDown } from "lucide-react";
import { OwnerTabBar } from "@/components/OwnerTabBar";

export const SETUP_STEPS = [
  { key: "basics", title: "The basics", short: "Basics" },
  { key: "day", title: "A day in the life", short: "Routine" },
  { key: "food", title: "Food & water", short: "Food" },
  { key: "personality", title: "Personality & handling", short: "Behavior" },
  { key: "environment", title: "Environment & safety", short: "Home" },
  { key: "health", title: "Health baseline", short: "Health" },
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
  onExit?: () => void; // header back arrow -> bird profile
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const birdLabel = birdName?.trim() || "Bird";

  return (
    <div className={`min-h-screen bg-sage-50 ${hideFooter ? "pb-28" : "pb-44"}`}>
      <header className="sticky top-0 z-10 border-b border-sage-100 bg-white/95 backdrop-blur">
        {/* Top bar: back-to-profile link + context */}
        <div className="mx-auto flex max-w-md items-center gap-3 px-5 py-3">
          <button
            type="button"
            onClick={handleExit}
            disabled={!onExit}
            className="-ml-1 flex items-center gap-1 rounded p-1 text-sm font-semibold text-sage-700 disabled:opacity-40"
            aria-label={`Back to ${birdLabel}`}
          >
            <ArrowLeft className="size-5 shrink-0" />
            <span className="max-w-[8rem] truncate">{birdLabel}</span>
          </button>
          <div className="min-w-0 flex-1 text-right">
            <p className="truncate text-sm font-semibold leading-tight text-sage-900">
              Care plan setup
            </p>
            {birdSpecies?.trim() && (
              <p className="truncate text-[11px] text-sage-600">{birdSpecies}</p>
            )}
          </div>
        </div>

        {/* Desktop: clickable pill tabs */}
        <div className="hidden md:block">
          <div className="mx-auto max-w-md px-5 pb-2">
            <div className="relative">
            <div ref={pillStripRef} onScroll={updatePillFades} className="flex gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {SETUP_STEPS.map((s, i) => {
                const state = stepState(i, step);
                const base =
                  "flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-xs transition";
                const cls =
                  state === "completed"
                    ? "bg-sage-100 text-sage-700 hover:bg-sage-200"
                    : state === "active"
                      ? "bg-white font-medium text-sage-900 shadow-sm ring-1 ring-sage-300"
                      : "bg-transparent text-sage-400 hover:text-sage-600";
                return (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => goToStep(i + 1)}
                    aria-current={state === "active" ? "step" : undefined}
                    className={`${base} ${cls}`}
                  >
                    {state === "completed" ? (
                      <Check className="size-3.5" />
                    ) : state === "upcoming" ? (
                      <span className="text-[10px] font-semibold">{i + 1}</span>
                    ) : null}
                    {s.short}
                  </button>
                );
              })}
              {/* trailing spacer so the last pill scrolls clear of the fade */}
              <span aria-hidden className="shrink-0 pl-1" />
            </div>
            {!pillAtStart && <div className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-white to-transparent" />}
            {!pillAtEnd && <div className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-white to-transparent" />}
            </div>
          </div>
        </div>

        {/* Mobile: compact step bar with "All steps" drawer trigger */}
        <div className="mx-auto flex max-w-md items-stretch md:hidden">
          <div className="flex min-w-0 flex-1 items-center gap-3 px-4 py-2">
            <div className="flex shrink-0 items-center gap-1" aria-hidden="true">
              {SETUP_STEPS.map((s, i) => {
                const state = stepState(i, step);
                return (
                  <span
                    key={s.key}
                    className={`h-1.5 rounded-full transition-all ${
                      state === "active"
                        ? "w-4 bg-sage-600"
                        : state === "completed"
                          ? "w-1.5 bg-sage-600"
                          : "w-1.5 bg-sage-200"
                    }`}
                  />
                );
              })}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium leading-tight text-sage-900">
                {current?.short}
              </p>
              <p className="text-[11px] leading-tight text-sage-600">
                Step {step} of {TOTAL_STEPS}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="flex shrink-0 items-center gap-1 border-l border-sage-100 px-4 text-xs font-semibold text-sage-700"
          >
            All steps
            <ChevronDown className="size-4" />
          </button>
        </div>

        {/* Thin progress bar */}
        <div className="h-[3px] w-full bg-sage-100">
          <div className="h-full bg-sage-600 transition-all" style={{ width: `${pct}%` }} />
        </div>
      </header>

      <main className="mx-auto max-w-md space-y-4 px-5 py-5">
        {subtitle && <p className="text-sm text-sage-600">{subtitle}</p>}
        {children}
      </main>

      {/* Bottom region: the flow's own controls (Back / Save & exit / Next)
          stacked above the owner bottom nav. The nav is additive — leaving via
          it preserves the current step (autosave flushes on unmount). */}
      <div className="fixed inset-x-0 bottom-0 z-40">
        {!hideFooter && (
          <div className="border-t border-sage-100 bg-white/95 backdrop-blur">
            <div className="mx-auto flex max-w-md items-center gap-2 px-5 py-3">
              <button
                type="button"
                onClick={onBack}
                disabled={backDisabled || saving}
                aria-label="Previous step"
                className="grid size-11 shrink-0 place-items-center rounded-xl border border-sage-200 bg-white text-sage-700 disabled:opacity-40"
              >
                <ArrowLeft className="size-5" />
              </button>
              {onSaveAndExit && (
                <button
                  type="button"
                  onClick={onSaveAndExit}
                  disabled={saving}
                  className="shrink-0 px-2 text-xs font-semibold text-sage-700 underline disabled:opacity-50"
                >
                  Save &amp; exit
                </button>
              )}
              <button
                type="button"
                onClick={onNext}
                disabled={nextDisabled || saving}
                className="flex-1 rounded-xl bg-sage-600 py-3 text-sm font-semibold text-white disabled:opacity-50"
              >
                {saving ? "Saving…" : nextLabel}
              </button>
            </div>
          </div>
        )}
        <OwnerTabBar embedded />
      </div>

      {/* Mobile "All steps" bottom sheet */}
      <div
        className={`fixed inset-0 z-50 md:hidden ${drawerOpen ? "" : "pointer-events-none"}`}
        aria-hidden={!drawerOpen}
      >
        <div
          onClick={() => setDrawerOpen(false)}
          className={`absolute inset-0 bg-sage-900/40 transition-opacity ${
            drawerOpen ? "opacity-100" : "opacity-0"
          }`}
        />
        <div
          role="dialog"
          aria-label="All steps"
          className={`absolute inset-x-0 bottom-0 rounded-t-2xl bg-white pb-[max(1rem,env(safe-area-inset-bottom))] shadow-xl transition-transform duration-200 ${
            drawerOpen ? "translate-y-0" : "translate-y-full"
          }`}
        >
          <div className="flex justify-center pt-3">
            <span className="h-1 w-10 rounded-full bg-sage-200" />
          </div>
          <p className="px-5 pb-2 pt-3 text-[10px] font-semibold uppercase tracking-widest text-sage-600">
            All steps
          </p>
          <ul className="max-h-[60vh] overflow-y-auto px-2 pb-2">
            {SETUP_STEPS.map((s, i) => {
              const state = stepState(i, step);
              return (
                <li key={s.key}>
                  <button
                    type="button"
                    onClick={() => goToStep(i + 1)}
                    className="flex min-h-[48px] w-full items-center gap-3 rounded-xl px-3 text-left hover:bg-sage-50"
                  >
                    {state === "completed" ? (
                      <span className="grid size-7 shrink-0 place-items-center rounded-full bg-sage-600 text-white">
                        <Check className="size-4" />
                      </span>
                    ) : state === "active" ? (
                      <span className="grid size-7 shrink-0 place-items-center rounded-full bg-sage-900 text-xs font-semibold text-white">
                        {i + 1}
                      </span>
                    ) : (
                      <span className="grid size-7 shrink-0 place-items-center rounded-full bg-sage-100 text-xs font-semibold text-sage-500">
                        {i + 1}
                      </span>
                    )}
                    <span className="flex-1 text-sm font-medium text-sage-900">{s.short}</span>
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-sage-500">
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
          <div className="absolute inset-0 bg-sage-900/40" onClick={() => setConfirmExit(false)} />
          <div
            role="alertdialog"
            aria-label="Leave this step"
            className="relative w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl"
          >
            <h2 className="text-base font-bold text-sage-900">Leave this step?</h2>
            <p className="mt-1 text-sm text-sage-600">Your progress is saved — you can pick up right where you left off.</p>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmExit(false)}
                className="flex-1 rounded-xl border border-sage-200 bg-white py-2.5 text-sm font-semibold text-sage-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmExit(false);
                  onExit?.();
                }}
                className="flex-1 rounded-xl bg-sage-600 py-2.5 text-sm font-semibold text-white"
              >
                Leave
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
