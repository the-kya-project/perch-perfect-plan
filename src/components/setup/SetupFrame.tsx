// The new setup shell: forest header with the bird, step pills and title; a
// white body tucked under the header's rounded corners; a sticky footer.
// Screens move onto it one at a time as they're restyled — the older
// SetupShell still frames the rest of the walkthrough until then.
import { useEffect, useRef, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { Check, ChevronLeft } from "lucide-react";
import { S, SERIF } from "./controls";

/** The six steps an owner sees, in flow order. */
export const SETUP_PILLS = ["details", "food", "health", "behavior", "tips", "day"] as const;
export type SetupPill = (typeof SETUP_PILLS)[number];

function pillLabel(t: TFunction, pill: SetupPill): string {
  switch (pill) {
    case "details": return t("setupFrame.pillDetails", "Details");
    case "food": return t("planEditor.tabFood", "Food");
    case "health": return t("planEditor.tabHealth", "Health");
    case "behavior": return t("planEditor.tabBehavior", "Behavior");
    case "tips": return t("setupFrame.pillTips", "Tips");
    case "day": return t("setupFrame.pillDay", "Day");
  }
}

export function SetupFrame({
  birdName,
  current,
  page,
  title,
  intro,
  headerPanel,
  onBack,
  footer,
  children,
}: {
  birdName?: string | null;
  current: SetupPill;
  /** Sub-pages of the current step, e.g. [2, 2] → "Details · 2 of 2". */
  page?: [number, number];
  title: ReactNode;
  intro?: ReactNode;
  headerPanel?: ReactNode;
  onBack: () => void;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const name = birdName?.trim() || "";
  const currentIndex = SETUP_PILLS.indexOf(current);

  // Bring the current pill into view on load, scrolling only the strip.
  const stripRef = useRef<HTMLDivElement>(null);
  const currentRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const strip = stripRef.current;
    const pill = currentRef.current;
    if (!strip || !pill) return;
    strip.scrollLeft = Math.max(0, pill.offsetLeft - (strip.clientWidth - pill.offsetWidth) / 2);
  }, [current]);

  return (
    <div className="setup-frame flex min-h-screen flex-col bg-white" style={{ color: S.forest }}>
      <header className="text-white" style={{ background: S.forest }}>
        <div className="mx-auto max-w-md px-4 pb-[52px] pt-[max(env(safe-area-inset-top),14px)]">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onBack}
              aria-label={t("setupFrame.back", "Back")}
              className="grid size-11 shrink-0 place-items-center rounded-full text-white"
              style={{ background: S.forestDeep }}
            >
              <ChevronLeft className="size-6" aria-hidden="true" />
            </button>
            <span
              aria-hidden="true"
              className="grid size-10 shrink-0 place-items-center rounded-full text-[17px] font-[700]"
              style={{ background: S.lime, color: S.forest }}
            >
              {name ? name.slice(0, 1).toUpperCase() : ""}
            </span>
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block text-[13px]" style={{ color: S.mist }}>{t("setupFrame.settingUp", "Setting up")}</span>
              <span className="block truncate text-[17px] font-[700] text-white">{name || t("setupFrame.newBird", "New bird")}</span>
            </span>
            <span className="shrink-0 text-[13px]" style={{ color: S.mist }}>
              {t("setupShell.stepOf", "Step {{step}} of {{total}}", { step: currentIndex + 1, total: SETUP_PILLS.length })}
            </span>
          </div>

          <div ref={stripRef} className="-mx-4 mt-4 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <ol className="m-0 flex w-max list-none gap-2 p-0">
              {SETUP_PILLS.map((pill, i) => {
                const state = i < currentIndex ? "done" : i === currentIndex ? "current" : "upcoming";
                const label = pillLabel(t, pill);
                const text = state === "current" && page
                  ? t("setupFrame.pillPage", "{{step}} · {{n}} of {{total}}", { step: label, n: page[0], total: page[1] })
                  : label;
                const style =
                  state === "done" ? { background: S.forestDeep, color: S.lime, borderColor: S.forestDeep }
                  : state === "current" ? { background: S.lime, color: S.forest, borderColor: S.lime }
                  : { background: "transparent", color: S.mist, borderColor: S.pillLine };
                return (
                  <li key={pill}>
                    <span
                      ref={state === "current" ? currentRef : undefined}
                      aria-current={state === "current" ? "step" : undefined}
                      className="inline-flex h-[34px] items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 text-[13px] font-[700]"
                      style={style}
                    >
                      {state === "done" && <Check className="size-3.5" strokeWidth={3} aria-hidden="true" />}
                      {text}
                      {state === "done" && <span className="sr-only"> {t("setupFrame.done", "(done)")}</span>}
                    </span>
                  </li>
                );
              })}
            </ol>
          </div>

          <h1
            className="m-0 mt-5 text-[34px] font-[700] leading-[1.06] tracking-[-0.02em] text-white [text-wrap:balance]"
            style={{ fontFamily: SERIF }}
          >
            {title}
          </h1>
          {intro && <p className="m-0 mt-2.5 text-[15.5px] leading-[1.55]" style={{ color: S.mist }}>{intro}</p>}
          {headerPanel && <div className="mt-4">{headerPanel}</div>}
        </div>
      </header>

      <main className="relative z-[1] -mt-[26px] flex-1 rounded-t-[26px] bg-white">
        <div className="mx-auto flex max-w-md flex-col gap-[14px] px-4 py-[22px]">{children}</div>
      </main>

      {footer && (
        <footer className="sticky bottom-0 z-10 border-t bg-white" style={{ borderColor: S.footerLine }}>
          <div className="mx-auto max-w-md px-5 pb-[max(env(safe-area-inset-bottom),26px)] pt-[14px]">{footer}</div>
        </footer>
      )}
    </div>
  );
}
