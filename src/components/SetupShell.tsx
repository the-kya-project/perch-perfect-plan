import { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

export const SETUP_STEPS = [
  { key: "basics", title: "The basics" },
  { key: "day", title: "A day in the life" },
  { key: "food", title: "Food & water" },
  { key: "personality", title: "Personality & handling" },
  { key: "environment", title: "Environment & safety" },
  { key: "emergency", title: "Emergency info" },
  { key: "review", title: "Review & finish" },
] as const;

export const TOTAL_STEPS = SETUP_STEPS.length;

export function SetupShell({
  step,
  title,
  subtitle,
  children,
  onBack,
  onNext,
  onSaveAndExit,
  nextLabel = "Next",
  nextDisabled,
  saving,
  backDisabled,
}: {
  step: number; // 1-indexed
  title: string;
  subtitle?: string;
  children: ReactNode;
  onBack?: () => void;
  onNext?: () => void;
  onSaveAndExit?: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
  saving?: boolean;
  backDisabled?: boolean;
}) {
  const pct = Math.round((step / TOTAL_STEPS) * 100);
  return (
    <div className="min-h-screen bg-sage-50 pb-32">
      <header className="sticky top-0 z-10 border-b border-sage-100 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-md items-center gap-3 px-4 py-3">
          <Link to="/dashboard" className="rounded p-1 text-sage-600" aria-label="Back to dashboard">
            <ArrowLeft className="size-5" />
          </Link>
          <div className="flex-1">
            <p className="text-[10px] uppercase tracking-wider text-sage-600">
              Step {step} of {TOTAL_STEPS}
            </p>
            <h1 className="text-sm font-bold leading-tight">{title}</h1>
          </div>
        </div>
        <div className="h-1 w-full bg-sage-100">
          <div className="h-full bg-sage-600 transition-all" style={{ width: `${pct}%` }} />
        </div>
      </header>

      <main className="mx-auto max-w-md space-y-4 px-4 py-5">
        {subtitle && <p className="text-sm text-sage-600">{subtitle}</p>}
        {children}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-sage-100 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-md flex-col gap-2 px-4 py-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onBack}
              disabled={backDisabled || saving}
              className="flex-1 rounded-xl border border-sage-200 bg-white py-3 text-sm font-semibold text-sage-700 disabled:opacity-40"
            >
              Back
            </button>
            <button
              type="button"
              onClick={onNext}
              disabled={nextDisabled || saving}
              className="flex-[2] rounded-xl bg-sage-600 py-3 text-sm font-semibold text-white disabled:opacity-50"
            >
              {saving ? "Saving…" : nextLabel}
            </button>
          </div>
          {onSaveAndExit && (
            <button
              type="button"
              onClick={onSaveAndExit}
              disabled={saving}
              className="text-center text-xs font-semibold text-sage-700 underline disabled:opacity-50"
            >
              Save and finish later
            </button>
          )}
        </div>
      </nav>
    </div>
  );
}
