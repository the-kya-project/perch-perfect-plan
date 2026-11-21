// The sitter link's side column on the iPhone Duo (two panes, lib/duo.ts):
// the sitter's own bottom bar (EmergencyBar) moves into a column on the edge
// the status bar sits on, the same look as the owner's (components/DuoRail.tsx):
// a slot at the top for Back / Close (PageHeader and TaskHeader send theirs
// there through DuoRailProvider), then the tabs at the bottom, 80px wide with
// icon and label, the current one lit #d6ebc4. Emergency stays the loudest
// item: solid red, at the bottom.
//
// Home and Today show the same two-pane day on the Duo (the whole sit's
// checklist), so there is no separate Home tab here: Today is lit on both.
// The tabs keep the bottom bar's data-coach names so the walkthrough still
// points at them.
import { useEffect, type ReactNode } from "react";
import { Link, useLocation } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { AlertTriangle, BookOpen, ClipboardList, HelpCircle } from "lucide-react";
import { DUO } from "@/components/duo/DuoBlocks";
import { BrandLockup } from "@/components/BrandLogo";
import { SitterLanguageToggle } from "@/components/SitterLanguageToggle";
import { replaySitterOnboarding } from "@/components/SitterOnboarding";

/** html.duo (+ two panes, + the column's edge) while the column is up. */
function useDuoHtml(edge: "left" | "right") {
  useEffect(() => {
    const html = document.documentElement;
    html.classList.add("duo", "duo-two-pane");
    html.setAttribute("data-duo-rail", edge);
    return () => {
      html.classList.remove("duo", "duo-two-pane");
      html.removeAttribute("data-duo-rail");
    };
  }, [edge]);
}

const tabClass = "duo-rail-tab relative flex w-20 flex-col items-center gap-[5px] rounded-[18px] pb-2.5 pt-3 text-center text-[13px] leading-tight";

export function SitterDuoRail({ token, activeBirdId, edge, setTop }: {
  token: string;
  activeBirdId?: string;
  edge: "left" | "right";
  /** Callback ref for the Back / Close slot (DuoRailProvider's `top`). */
  setTop: (el: HTMLElement | null) => void;
}) {
  const { t } = useTranslation();
  useDuoHtml(edge);
  const pathname = useLocation({ select: (l) => l.pathname });
  const current = /\/guide\/?$/.test(pathname) ? "guide" : /\/emergency\/?$/.test(pathname) ? "emergency" : /^\/sitter\/[^/]+(\/home)?\/?$/.test(pathname) ? "today" : null;
  const tab = (on: boolean) => ({
    className: `${tabClass} ${on ? "font-bold" : "font-medium"}`,
    style: on ? { background: "#d6ebc4", color: DUO.forest } : { color: "#5f5e5a" },
  });
  return (
    <nav aria-label={t("sitter.duo.rail.aria", "Sitter menu")} className="duo-rail">
      <div ref={setTop} className="flex shrink-0 flex-col items-center gap-2" />
      <div className="duo-rail-spacer" />
      <div className="duo-rail-tabs flex flex-col items-center gap-2">
        <Link
          to="/sitter/$token"
          params={{ token }}
          search={activeBirdId ? { birdId: activeBirdId } : undefined}
          data-coach="nav-today"
          aria-current={current === "today" ? "page" : undefined}
          {...tab(current === "today")}
        >
          <ClipboardList className="size-[26px] shrink-0" strokeWidth={current === "today" ? 2.4 : 1.9} aria-hidden="true" />
          <span className="duo-rail-tab-label">{t("emergencyBar.nav.today", "Today")}</span>
        </Link>
        <Link
          to="/sitter/$token/guide"
          params={{ token }}
          data-coach="nav-guide"
          aria-current={current === "guide" ? "page" : undefined}
          {...tab(current === "guide")}
        >
          <BookOpen className="size-[26px] shrink-0" strokeWidth={current === "guide" ? 2.4 : 1.9} aria-hidden="true" />
          <span className="duo-rail-tab-label">{t("emergencyBar.nav.guide", "Parrots 101")}</span>
        </Link>
        <Link
          to="/sitter/$token/emergency"
          params={{ token }}
          data-coach="nav-emergency"
          aria-current={current === "emergency" ? "page" : undefined}
          className={`${tabClass} font-bold text-white`}
          style={{ background: DUO.red, boxShadow: current === "emergency" ? "0 0 0 3px #fff, 0 0 0 5px #a32d2d" : "0 6px 16px rgba(163,45,45,0.22)" }}
        >
          <AlertTriangle className="size-[26px] shrink-0" strokeWidth={2.2} aria-hidden="true" />
          <span className="duo-rail-tab-label">{t("emergencyBar.emergency", "Emergency")}</span>
        </Link>
      </div>
    </nav>
  );
}

/** The top of a sitter left pane: the logo, the EN/NL switch and Help
 *  (replays the walkthrough), as in the phone's tab header. `light` = on a
 *  light pane (the forest-on-clear logo instead of the forest box). */
export function SitterDuoTopBar({ token, light = false, children }: { token: string; light?: boolean; children?: ReactNode }) {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-[44px] items-center gap-2">
      <BrandLockup orientation="horizontal" variant={light ? "transparent" : "ink"} size={112} />
      <div className="flex-1" />
      {children}
      <SitterLanguageToggle token={token} />
      <button
        type="button"
        aria-label={t("sitter.header.replayWalkthrough", "Replay walkthrough")}
        onClick={replaySitterOnboarding}
        className="grid size-11 shrink-0 place-items-center rounded-full text-white active:scale-95"
        style={{ background: "#12291f" }}
      >
        <HelpCircle className="size-[18px]" aria-hidden="true" />
      </button>
    </div>
  );
}
