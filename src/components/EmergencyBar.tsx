import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Home, ClipboardList, BookOpen, AlertTriangle } from "lucide-react";
import { K } from "@/components/kya";
import { useSitterShell } from "@/components/sitter/sitterShared";

// Sitter bottom bar (sitter view only — no owner screen uses it): Home, Today,
// Parrots 101, and the always-present red Emergency pill. White, with a 1px
// #d5dfd5 top rule. Home is hidden for one-bird sits (the one-bird rule, see
// SitterShellContext). Today carries the active bird so it's never blank.
// Emergency stays a solid red 48px pill with the warning icon — the loudest
// item, never muted.
//
// Fit at 375px with 2+ birds (all four items): the row is 375 - 2*16 = 343px.
// Emergency is about 131px (16 + 18 icon + 6 + ~75 text + 16), three 4px gaps
// are 12px, Home and Today 48px each (their labels are narrower), "Parrots 101"
// about 58px (bold, 11.5px): about 297px, 46px to spare. Dutch is the longest
// ("Papegaaien 101" ~82px, "Noodgeval" ~75px): about 321px, still fits. Labels
// never wrap (whitespace-nowrap), so a squeeze can't split "Parrots 101".
export function EmergencyBar({ token, activeBirdId }: { token: string; activeBirdId?: string }) {
  const { t } = useTranslation();
  const { multi } = useSitterShell();
  const item = "flex min-h-[48px] min-w-[48px] shrink-0 flex-col items-center justify-center gap-0.5 whitespace-nowrap text-[#5f5e5a] [&.active]:text-[#1a3d2e] [&.active_span]:font-[700]";
  return (
    <nav className="setup-frame fixed inset-x-0 bottom-0 z-30 border-t border-[#d5dfd5] bg-white px-4 pb-[max(env(safe-area-inset-bottom),0.625rem)] pt-2">
      <div className="mx-auto flex max-w-md items-center justify-between gap-1">
        {multi && (
          <Link to="/sitter/$token/home" params={{ token }} className={item} data-coach="nav-home">
            <Home className="size-[22px]" />
            <span className="text-[11.5px] font-[500]">{t("emergencyBar.nav.home", "Home")}</span>
          </Link>
        )}
        <Link
          to="/sitter/$token"
          params={{ token }}
          search={activeBirdId ? { birdId: activeBirdId } : undefined}
          activeOptions={{ exact: true, includeSearch: false }}
          className={item}
          data-coach="nav-today"
        >
          <ClipboardList className="size-[22px]" />
          <span className="text-[11.5px] font-[500]">{t("emergencyBar.nav.today", "Today")}</span>
        </Link>
        <Link to="/sitter/$token/guide" params={{ token }} className={item} data-coach="nav-guide">
          <BookOpen className="size-[22px]" />
          <span className="text-[11.5px] font-[500]">{t("emergencyBar.nav.guide", "Parrots 101")}</span>
        </Link>
        <Link
          to="/sitter/$token/emergency"
          params={{ token }}
          data-coach="nav-emergency"
          className="inline-flex h-12 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-4 text-[15px] font-[700] text-white active:scale-95"
          style={{ background: K.red, boxShadow: "0 6px 16px rgba(163,45,45,0.22)" }}
        >
          <AlertTriangle className="size-[18px] shrink-0" aria-hidden="true" />
          {t("emergencyBar.emergency", "Emergency")}
        </Link>
      </div>
    </nav>
  );
}
