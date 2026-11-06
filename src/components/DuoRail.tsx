// The iPhone Duo side column (see lib/duo.ts for when it shows). It replaces
// the bottom tab bar on the edge where the status bar and camera sit (the
// right, unless the native app names the left; data-duo-rail on <html>): room for those at the top, then Back (or Close on a task), and the tabs
// at the bottom. The tabs show on every signed-in screen, tasks included, so a
// task's main button stays in the screen (TaskFooter, bottom of the right half)
// and the column never holds one.
//
// Headers don't know about the column: PageHeader / TaskHeader ask useDuoRail()
// and, when there is one, send their Back or Close into its top slot with a
// portal. With no column (every other screen size, and the sitter view, which
// has no AuthenticatedLayout) nothing changes.
import { createContext, useContext, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, Users, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useOwnerTabs } from "@/components/OwnerTabBar";
import { rememberMode } from "@/lib/flock";

export type DuoRailSlots = {
  /** The edge the column sits on. */
  edge: "left" | "right";
  /** Under the status bar: Back, or Close on a task. */
  top: HTMLElement | null;
};

const RailContext = createContext<DuoRailSlots | null>(null);
export const DuoRailProvider = RailContext.Provider;

/** The side column's slots, or null when the screen has no column. */
export function useDuoRail(): DuoRailSlots | null {
  return useContext(RailContext);
}

const FOREST = "#1a3d2e";

/** 52px forest circle for the column's top slot. */
function RailRoundButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="grid size-[52px] shrink-0 place-items-center rounded-full text-white active:scale-95"
      style={{ background: FOREST }}
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
    <RailRoundButton label={t("headers.back", "Back")} onClick={onBack}>
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
    <RailRoundButton label={t("headers.close", "Close")} onClick={onClose}>
      <X className="size-[22px]" strokeWidth={2.2} aria-hidden="true" />
    </RailRoundButton>,
    rail.top,
  );
}

/** The column itself. `setTop` is a callback ref for the Back / Close slot. */
export function DuoRail({ setTop }: { setTop: (el: HTMLElement | null) => void }) {
  const { t } = useTranslation();
  return (
    <nav aria-label={t("ownerTabs.navAria", "Primary")} className="duo-rail">
      <div ref={setTop} className="flex shrink-0 flex-col items-center gap-2" />
      <div className="duo-rail-spacer" />
      <RailTabs />
    </nav>
  );
}


type Fit = "comfortable" | "tight" | "icons" | "scroll";

// Each step's height for n tabs (px): tab height × n + the gaps between.
const FIT_HEIGHT: Record<Exclude<Fit, "scroll">, (n: number) => number> = {
  comfortable: (n) => n * 69 + (n - 1) * 8,
  tight: (n) => n * 58 + (n - 1) * 2,
  icons: (n) => n * 44 + (n - 1) * 4,
};

/**
 * The first step whose tabs fit the height left under Back: comfortable,
 * then tight spacing, then icons only, else the group scrolls. Only with the
 * native bridge's geometry (html[data-bar-geometry]); Safari and the PWA keep
 * today's layout.
 */
function useTabFit(group: React.RefObject<HTMLDivElement | null>, count: number): Fit {
  const [fit, setFit] = useState<Fit>("comfortable");
  useLayoutEffect(() => {
    const el = group.current;
    const nav = el?.parentElement;
    if (!el || !nav || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      if (!document.documentElement.hasAttribute("data-bar-geometry")) { setFit("comfortable"); return; }
      const cs = getComputedStyle(nav);
      const top = nav.firstElementChild as HTMLElement | null;
      const available = nav.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) - (top?.offsetHeight ?? 0) - 8;
      const next = (["comfortable", "tight", "icons"] as const).find((f) => FIT_HEIGHT[f](count) <= available) ?? "scroll";
      setFit(next);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(nav);
    if (nav.firstElementChild) ro.observe(nav.firstElementChild);
    const mo = new MutationObserver(measure);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-bar-geometry", "style"] });
    return () => { ro.disconnect(); mo.disconnect(); };
  }, [group, count]);
  return fit;
}

function RailTabs() {
  const { tabs, current, flock, flockLabel } = useOwnerTabs();
  const group = useRef<HTMLDivElement>(null);
  const fit = useTabFit(group, tabs.length + (flock ? 1 : 0));
  const tabClass = "duo-rail-tab relative flex w-20 flex-col items-center gap-[5px] rounded-[18px] pb-2.5 pt-3 text-[13px] leading-tight";
  return (
    <div ref={group} className="duo-rail-tabs flex flex-col items-center gap-2" data-fit={fit}>
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
            <Icon className="size-[26px] shrink-0" strokeWidth={on ? 2.4 : 1.9} aria-hidden="true" />
            <span className="duo-rail-tab-label">{label}</span>
          </Link>
        );
      })}
      {flock && (
        <Link to="/flock" onClick={() => rememberMode("flock")} data-coach="owner-tab-flock" className={`${tabClass} font-medium`} style={{ color: "#5f5e5a" }}>
          <Users className="size-[26px] shrink-0" strokeWidth={1.9} aria-hidden="true" />
          <span className="duo-rail-tab-label">{flockLabel}</span>
        </Link>
      )}
    </div>
  );
}
