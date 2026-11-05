// The guided walkthrough on the iPhone Duo (lib/duo.ts): SetupShell renders
// this in place of SetupFrame when the two panes apply. Left (dark forest):
// whatever SetupShell is given as `left` (the ring and the steps,
// SetupStepsPane). Right: the step in one pop-out card (eyebrow, the question
// as the title, the step's own intro line), and the step's own footer pinned
// to the bottom of the right half (Back, Skip / Save & exit, the one gold
// button), exactly the controls the phone shows. Close goes to the column.
//
// The step components are the walkthrough's own, unchanged: this provides the
// same slots SetupFrame does (InSetupFrame, the intro slot, the header panel
// slot), so their intro lines and "Start from another bird?" land in the card.
import { useState, type ReactNode } from "react";
import { InSetupFrame, SetupHeaderPanelSlot, SetupIntroSlot } from "@/components/setup/SetupFrame";
import { S } from "@/components/setup/controls";
import { RailClose } from "@/components/DuoRail";
import { DuoTwoPane, PopOutCard } from "@/components/duo/DuoBlocks";

export function SetupDuoFrame({ left, eyebrow, title, intro, homeSubline, onClose, footer, tinted, children }: {
  left: ReactNode;
  eyebrow?: ReactNode;
  title: ReactNode;
  intro?: ReactNode;
  /** "Your home" screens: the line under the title. */
  homeSubline?: string;
  onClose: () => void;
  footer?: ReactNode;
  /** Screens made of white cards (Day, Reminders, Emergency): a light green well. */
  tinted?: boolean;
  children: ReactNode;
}) {
  const [introSlot, setIntroSlot] = useState<HTMLElement | null>(null);
  const [panelSlot, setPanelSlot] = useState<HTMLElement | null>(null);

  const right = (
    <>
      <PopOutCard eyebrow={eyebrow} title={title}>
        <div ref={setIntroSlot} className="-mt-2 mb-4 text-[16px] leading-[1.5] empty:hidden [&>*]:m-0 [&>*+*]:mt-2" style={{ color: S.helper }}>
          {homeSubline && <p>{homeSubline}</p>}
          {intro && <p>{intro}</p>}
        </div>
        <div ref={setPanelSlot} className="mb-4 empty:hidden" />
        <div className={`flex flex-col gap-[14px] ${tinted ? "rounded-[20px] p-3" : ""}`} style={tinted ? { background: S.card } : undefined}>
          <InSetupFrame.Provider value={true}>
            <SetupIntroSlot.Provider value={introSlot}>
              <SetupHeaderPanelSlot.Provider value={panelSlot}>{children}</SetupHeaderPanelSlot.Provider>
            </SetupIntroSlot.Provider>
          </InSetupFrame.Provider>
        </div>
      </PopOutCard>
      {footer && (
        <>
          {/* Room for the pinned footer, so the end of the step stays reachable. */}
          <div aria-hidden="true" className="h-[120px] shrink-0" />
          <div className="duo-task-footer">{footer}</div>
        </>
      )}
    </>
  );

  return (
    <>
      <RailClose onClose={onClose} />
      <DuoTwoPane dark left={left} right={right} />
    </>
  );
}
