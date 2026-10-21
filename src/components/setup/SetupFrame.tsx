// The setup shell: the task header (Close, step count, title naming the bird,
// progress bar); a white body tucked under the header's rounded corners; a
// pinned white footer with the sunflower button.
// Every setup screen renders inside it (SetupShell wraps it for the guided
// walkthrough; Add a bird and "Who else helps?" use it directly).
import { createContext, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
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

export function SetupFrame({
  current,
  page,
  stepLabel,
  title,
  intro,
  headerPanel,
  onBack,
  backLabel,
  footer,
  belowFooter,
  tinted,
  home,
  allDone,
  children,
}: {
  /** Kept for callers; the task header names the bird in the title instead. */
  birdName?: string | null;
  /** The current step's pill, or null on screens after the six steps (all done). */
  current: SetupPill | null;
  /** Sub-pages of the current step, e.g. [2, 2]: the bar fills part-way through the step. */
  page?: [number, number];
  /** Replaces "Step N of 6" (screens outside the six steps). */
  stepLabel?: string;
  title: ReactNode;
  intro?: ReactNode;
  headerPanel?: ReactNode;
  /** Close (top left). */
  onBack: () => void;
  backLabel?: string;
  footer?: ReactNode;
  /** Rendered under the footer, inside the sticky area. */
  belowFooter?: ReactNode;
  /** A light green body instead of white, for screens of white cards (Day). */
  tinted?: boolean;
  /** The "Your home" screens: no step count, and `subline` under the title. */
  home?: { current: HomePill; subline: string };
  /** The finishing screen: this label where the step count sits. */
  allDone?: string;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const currentIndex = current ? SETUP_PILLS.indexOf(current) : SETUP_PILLS.length;
  const [introSlot, setIntroSlot] = useState<HTMLElement | null>(null);
  const [panelSlot, setPanelSlot] = useState<HTMLElement | null>(null);

  // Task header: Close top left, the step count top right, the title naming
  // the bird, then a 6px bar. Screens past the six steps show a full bar.
  const label = allDone ?? stepLabel ?? t("setupShell.stepOf", "Step {{step}} of {{total}}", { step: currentIndex + 1, total: SETUP_PILLS.length });
  const progress = current
    ? (currentIndex + (page ? page[0] / page[1] : 1)) / SETUP_PILLS.length
    : 1;

  return (
    <div className="setup-frame flex min-h-screen flex-col bg-white" style={{ color: S.forest }}>
      <header className="text-white" style={{ background: S.forest }}>
        <div className="mx-auto max-w-md px-4 pb-[52px] pt-[calc(env(safe-area-inset-top)+14px)]">
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={onBack}
              aria-label={backLabel ?? t("setupFrame.close", "Close")}
              className="grid size-11 shrink-0 place-items-center rounded-full text-white active:scale-95"
              style={{ background: S.forestDeep }}
            >
              <X className="size-5" aria-hidden="true" />
            </button>
            <span className="min-w-0 truncate text-[14px] font-[700]" style={{ color: S.lime }}>{label}</span>
          </div>

          <h1
            className="m-0 mt-5 text-[30px] font-[700] leading-[1.1] tracking-[-0.01em] text-white [text-wrap:balance]"
            style={{ fontFamily: SERIF }}
          >
            {title}
          </h1>
          <div ref={setIntroSlot} className="text-[15px] leading-[1.5] empty:hidden [&>*]:m-0 [&>*]:mt-2" style={{ color: S.mist }}>
            {home && <p>{home.subline}</p>}
            {intro && <p>{intro}</p>}
          </div>
          <div
            className="mt-4 h-1.5 w-full overflow-hidden rounded-full"
            style={{ background: "rgba(255,255,255,0.18)" }}
            role="progressbar"
            aria-label={label}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress * 100)}
          >
            <div className="h-full rounded-full transition-[width]" style={{ width: `${Math.round(Math.max(0, Math.min(1, progress)) * 100)}%`, background: S.lime }} />
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
