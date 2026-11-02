// The iPhone Duo side column (see lib/duo.ts for when it shows). It replaces
// the bottom tab bar on the edge where the status bar and camera sit (the
// right, unless the native app names the left; data-duo-rail on <html>): room for those at the top, then Back (or Close on a task), and the tabs
// at the bottom. A task screen shows only Close and its main action, no tabs.
//
// Headers don't know about the column: PageHeader / TaskHeader / TaskFooter ask
// useDuoRail() and, when there is one, send their Back, Close and main button
// into its slots with a portal. With no column (every other screen size, and
// the sitter view, which has no AuthenticatedLayout) nothing changes.
import { createContext, useContext, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, Users, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useOwnerTabs } from "@/components/OwnerTabBar";
import { rememberMode } from "@/lib/flock";

export type DuoRailSlots = {
  /** The edge the column sits on. */
  edge: "left" | "right";
  task: boolean;
  /** Under the status bar: Back, or Close on a task. */
  top: HTMLElement | null;
  /** A task's main action (Save / Done). Null on regular pages. */
  action: HTMLElement | null;
};

const RailContext = createContext<DuoRailSlots | null>(null);
export const DuoRailProvider = RailContext.Provider;

/** The side column's slots, or null when the screen has no column. */
export function useDuoRail(): DuoRailSlots | null {
  return useContext(RailContext);
}

const FOREST = "#1a3d2e";
const FOREST_DEEP = "#10291e";

/** 52px round button for the column's top slot. */
function RailRoundButton({ label, onClick, task, children }: { label: string; onClick: () => void; task: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="grid size-[52px] shrink-0 place-items-center rounded-full text-white active:scale-95"
      style={{ background: task ? FOREST_DEEP : FOREST }}
    >
      {children}
    </button>
  );
}

/** Back, sent into the column. Renders nothing when there's no column slot. */
export function RailBack({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation();
  const rail = useDuoRail();
  if (!rail?.top) return null;
  return createPortal(
    <RailRoundButton label={t("headers.back", "Back")} onClick={onBack} task={rail.task}>
      <ArrowLeft className="size-[22px]" strokeWidth={2.2} aria-hidden="true" />
    </RailRoundButton>,
    rail.top,
  );
}

/** Close, sent into the column. */
export function RailClose({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const rail = useDuoRail();
  if (!rail?.top) return null;
  return createPortal(
    <RailRoundButton label={t("headers.close", "Close")} onClick={onClose} task={rail.task}>
      <X className="size-[22px]" strokeWidth={2.2} aria-hidden="true" />
    </RailRoundButton>,
    rail.top,
  );
}

/** A task's main action, sent into the column's bottom slot. */
export function RailAction({ children }: { children: ReactNode }) {
  const rail = useDuoRail();
  if (!rail?.action) return null;
  return createPortal(children, rail.action);
}

export type RailActionSpec = {
  /** Fits the 104px column: "Save", "Done", "Next". */
  label: string;
  /** The full label, for screen readers ("Save Echo's check"). */
  ariaLabel?: string;
  onClick: () => void;
  disabled?: boolean;
};

/** A task's main action as a column tile. Ready: gold with the forest border,
 *  as everywhere else. Not ready: an outline on the forest column, legible but
 *  plainly not tappable yet. */
export function RailActionButton({ label, ariaLabel, onClick, disabled }: RailActionSpec) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel && ariaLabel !== label ? ariaLabel : undefined}
      className="min-h-[56px] w-[84px] rounded-[18px] border-2 px-1.5 text-[15px] font-[700] leading-tight active:scale-95 disabled:active:scale-100"
      style={disabled
        ? { background: "transparent", borderColor: "rgba(255,255,255,0.35)", color: "rgba(255,255,255,0.6)" }
        : { background: "#f2b33d", borderColor: FOREST, color: FOREST }}
    >
      {label}
    </button>
  );
}

/** The column itself. `setTop` / `setAction` are callback refs for the slots. */
export function DuoRail({ task, setTop, setAction }: { task: boolean; setTop: (el: HTMLElement | null) => void; setAction: (el: HTMLElement | null) => void }) {
  const { t } = useTranslation();
  return (
    <nav
      aria-label={task ? t("ownerTabs.screenControls", "Screen controls") : t("ownerTabs.navAria", "Primary")}
      className={`duo-rail${task ? " duo-rail-task" : ""}`}
    >
      <div ref={setTop} className="flex flex-col items-center gap-2" />
      <div className="flex-1" />
      {task ? <div ref={setAction} className="duo-rail-action" /> : <RailTabs />}
    </nav>
  );
}

function RailTabs() {
  const { tabs, current, flock, flockLabel } = useOwnerTabs();
  const tabClass = "flex w-20 flex-col items-center gap-[5px] rounded-[18px] pb-2.5 pt-3 text-[13px] leading-tight";
  return (
    <div className="flex flex-col items-center gap-2">
      {tabs.map(({ key, label, to, Icon }) => {
        const on = key === current;
        return (
          <Link
            key={key}
            to={to}
            data-coach={`owner-tab-${key}`}
            aria-current={on ? "page" : undefined}
            className={`${tabClass} ${on ? "font-bold" : "font-medium"}`}
            style={on ? { background: "#d6ebc4", color: FOREST } : { color: "#5f5e5a" }}
          >
            <Icon className="size-[26px]" strokeWidth={on ? 2.4 : 1.9} aria-hidden="true" />
            {label}
          </Link>
        );
      })}
      {flock && (
        <Link to="/flock" onClick={() => rememberMode("flock")} data-coach="owner-tab-flock" className={`${tabClass} font-medium`} style={{ color: "#5f5e5a" }}>
          <Users className="size-[26px]" strokeWidth={1.9} aria-hidden="true" />
          {flockLabel}
        </Link>
      )}
    </div>
  );
}
