// The new setup shell: forest header with the bird, step pills and title; a
// white body tucked under the header's rounded corners; a sticky footer.
// Every setup screen renders inside it (SetupShell wraps it for the guided
// walkthrough; Add a bird and "Who else helps?" use it directly).
import { createContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { Check, Home, X } from "lucide-react";
import { S, SERIF } from "./controls";

/** The six steps an owner sees, in flow order. */
export const SETUP_PILLS = ["details", "food", "health", "behavior", "tips", "day"] as const;
export type SetupPill = (typeof SETUP_PILLS)[number];

/** The two "Your home" screens, shared by every bird. */
export type HomePill = "reminders" | "emergency";

/** True inside a SetupFrame body — older step pieces use it to match the new look. */
export const InSetupFrame = createContext(false);
/** The header's intro slot, so a step's own intro line can render up there. */
export const SetupIntroSlot = createContext<HTMLElement | null>(null);
/** The bottom of the header, so a step can put a panel there ("Start from another bird?"). */
export const SetupHeaderPanelSlot = createContext<HTMLElement | null>(null);

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
  stepLabel,
  title,
  intro,
  headerPanel,
  onBack,
  backLabel,
  onPill,
  footer,
  belowFooter,
  tinted,
  home,
  allDone,
  children,
}: {
  birdName?: string | null;
  /** The current step's pill, or null on screens after the six steps (all done). */
  current: SetupPill | null;
  /** Sub-pages of the current step, e.g. [2, 2] → "Details · 2 of 2". */
  page?: [number, number];
  /** Replaces "Step N of 6" (screens outside the six steps). */
  stepLabel?: string;
  title: ReactNode;
  intro?: ReactNode;
  headerPanel?: ReactNode;
  onBack: () => void;
  backLabel?: string;
  /** Makes the other pills tappable (jump to that step). */
  onPill?: (pill: SetupPill) => void;
  footer?: ReactNode;
  /** Rendered under the footer, inside the sticky area (the owner tab bar). */
  belowFooter?: ReactNode;
  /** A light green body instead of white, for screens of white cards (Day). */
  tinted?: boolean;
  /** The "Your home" screens: a house instead of the bird, "Your home" over
   *  `subline`, no step count, and Reminders / Emergency contacts as the pills. */
  home?: { current: HomePill; subline: string; onPill?: (pill: HomePill) => void };
  /** The finishing screen: no pills, and this label (lime, bold) where the step count sits. */
  allDone?: string;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const name = birdName?.trim() || "";
  const currentIndex = current ? SETUP_PILLS.indexOf(current) : SETUP_PILLS.length;
  const [introSlot, setIntroSlot] = useState<HTMLElement | null>(null);
  const [panelSlot, setPanelSlot] = useState<HTMLElement | null>(null);

  // Bring the current pill into view on load, scrolling only the strip.
  const stripRef = useRef<HTMLDivElement>(null);
  const currentRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const strip = stripRef.current;
    const pill = currentRef.current;
    if (!strip || !pill) return;
    strip.scrollLeft = Math.max(0, pill.offsetLeft - (strip.clientWidth - pill.offsetWidth) / 2);
  }, [current]);

  return (
    <div className="setup-frame flex min-h-screen flex-col bg-white" style={{ color: S.forest }}>
      <header className="text-white" style={{ background: S.forest }}>
        <div className="mx-auto max-w-md px-4 pb-[52px] pt-[calc(env(safe-area-inset-top)+14px)]">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onBack}
              aria-label={backLabel ?? t("setupFrame.close", "Close")}
              className="grid size-11 shrink-0 place-items-center rounded-full text-white"
              style={{ background: S.forestDeep }}
            >
              <X className="size-5" aria-hidden="true" />
            </button>
            <span
              aria-hidden="true"
              className="grid size-10 shrink-0 place-items-center rounded-full text-[17px] font-[700]"
              style={{ background: S.lime, color: S.forest }}
            >
              {home ? <Home className="size-5" aria-hidden="true" /> : name ? name.slice(0, 1).toUpperCase() : ""}
            </span>
            {home ? (
              <span className="min-w-0 flex-1 leading-tight">
                <span className="block text-[17px] font-[700] text-white">{t("setupShell.yourHome", "Your home")}</span>
                <span className="block truncate text-[13px]" style={{ color: S.mist }}>{home.subline}</span>
              </span>
            ) : (
              <>
                <span className="min-w-0 flex-1 leading-tight">
                  <span className="block text-[13px]" style={{ color: S.mist }}>{t("setupFrame.settingUp", "Setting up")}</span>
                  <span className="block truncate text-[17px] font-[700] text-white">{name || t("setupFrame.newBird", "New bird")}</span>
                </span>
                <span className="shrink-0 text-[14px] font-[700]" style={{ color: S.lime }}>
                  {allDone ?? stepLabel ?? t("setupShell.stepOf", "Step {{step}} of {{total}}", { step: currentIndex + 1, total: SETUP_PILLS.length })}
                </span>
              </>
            )}
          </div>

          {!allDone && <div ref={stripRef} className="-mx-4 mt-4 overflow-x-auto px-4 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <ol className="m-0 flex w-max list-none gap-2 p-0">
              {home && (["reminders", "emergency"] as HomePill[]).map((pill) => {
                const on = pill === home.current;
                const label = pill === "reminders" ? t("setupFrame.pillReminders", "Reminders") : t("setupFrame.pillEmergency", "Emergency contacts");
                const cls = "relative inline-flex h-[34px] items-center whitespace-nowrap rounded-full border px-3.5 text-[13px] font-[700]";
                const style = on ? { background: S.lime, color: S.forest, borderColor: S.lime } : { background: "transparent", color: S.mist, borderColor: S.pillLine };
                return (
                  <li key={pill}>
                    {!on && home.onPill ? (
                      <button type="button" onClick={() => home.onPill!(pill)} className={cls} style={style}>{label}</button>
                    ) : (
                      <span ref={on ? (el) => { currentRef.current = el; } : undefined} aria-current={on ? "step" : undefined} className={cls} style={style}>{label}</span>
                    )}
                  </li>
                );
              })}
              {!home && SETUP_PILLS.map((pill, i) => {
                const state = i < currentIndex ? "done" : i === currentIndex ? "current" : "upcoming";
                const label = pillLabel(t, pill);
                const text = state === "current" && page
                  ? t("setupFrame.pillPage", "{{step}} · {{n}} of {{total}}", { step: label, n: page[0], total: page[1] })
                  : label;
                const style =
                  state === "done" ? { background: S.forestDeep, color: S.lime, borderColor: S.forestDeep }
                  : state === "current" ? { background: S.lime, color: S.forest, borderColor: S.lime }
                  : { background: "transparent", color: S.mist, borderColor: S.pillLine };
                const cls = "relative inline-flex h-[34px] items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 text-[13px] font-[700]";
                const content = (
                  <>
                    {state === "done" && <Check className="size-3.5" strokeWidth={3} aria-hidden="true" />}
                    {text}
                    {state === "done" && <span className="sr-only"> {t("setupFrame.done", "(done)")}</span>}
                  </>
                );
                // Details is edited on the bird's page once saved, so it never jumps.
                const tappable = !!onPill && state !== "current" && pill !== "details";
                return (
                  <li key={pill}>
                    {tappable ? (
                      <button type="button" onClick={() => onPill!(pill)} className={cls} style={style}>{content}</button>
                    ) : (
                      <span
                        ref={state === "current" ? (el) => { currentRef.current = el; } : undefined}
                        aria-current={state === "current" ? "step" : undefined}
                        className={cls}
                        style={style}
                      >
                        {content}
                      </span>
                    )}
                  </li>
                );
              })}
            </ol>
          </div>}

          <h1
            className="m-0 mt-5 text-[34px] font-[700] leading-[1.06] tracking-[-0.02em] text-white [text-wrap:balance]"
            style={{ fontFamily: SERIF }}
          >
            {title}
          </h1>
          <div ref={setIntroSlot} className="text-[15.5px] leading-[1.55] empty:hidden [&>*]:m-0 [&>*]:mt-2.5" style={{ color: S.mist }}>
            {intro && <p>{intro}</p>}
          </div>
          {headerPanel && <div className="mt-4">{headerPanel}</div>}
          <div ref={setPanelSlot} className="empty:hidden [&>*]:mt-5" />
        </div>
      </header>

      <main className="relative z-[1] -mt-[26px] flex-1 rounded-t-[26px]" style={{ background: tinted ? S.card : "#fff" }}>
        <div className="mx-auto flex max-w-md flex-col gap-[14px] px-4 py-[22px]">
          <InSetupFrame.Provider value={true}>
            <SetupIntroSlot.Provider value={introSlot}>
              <SetupHeaderPanelSlot.Provider value={panelSlot}>{children}</SetupHeaderPanelSlot.Provider>
            </SetupIntroSlot.Provider>
          </InSetupFrame.Provider>
        </div>
      </main>

      {(footer || belowFooter) && (
        <div className="sticky bottom-0 z-40">
          {footer && (
            <footer className="border-t bg-white" style={{ borderColor: S.footerLine }}>
              <div className={`mx-auto max-w-md px-5 pt-[14px] ${belowFooter ? "pb-[14px]" : "pb-[max(env(safe-area-inset-bottom),26px)]"}`}>{footer}</div>
            </footer>
          )}
          {belowFooter}
        </div>
      )}
    </div>
  );
}
