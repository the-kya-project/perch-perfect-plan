import { Link, useLocation } from "@tanstack/react-router";
import { Home, Calendar, Activity, Compass, CheckSquare } from "lucide-react";
import { useActiveCaregiver } from "@/components/CaregiverHome";

// Owner bottom navigation. Four primary destinations; settings (gear) and
// notifications (bell) stay as header icons, not tabs. Every owner scroll
// container under _authenticated uses the `.pb-nav` utility (= --nav-spacer +
// buffer) so the fixed bar never clips content. Fixed footers on top of the
// nav (Hand off, Export) sit at `bottom-[var(--nav-spacer)]`.
//
// During an active household-caregiver assignment the SECOND tab swaps
// Sits → Today so the daily checklist is one tap away. /sits is still
// reachable directly. Reverts automatically when the sit window closes.
export type OwnerTab = "home" | "sits" | "activity" | "explore";

type TabSpec = { key: OwnerTab; label: string; to: string; Icon: typeof Home };
const HOME_TAB: TabSpec = { key: "home", label: "Home", to: "/dashboard", Icon: Home };
const SITS_TAB: TabSpec = { key: "sits", label: "Sits", to: "/sits", Icon: Calendar };
const TODAY_TAB: TabSpec = { key: "sits", label: "Today", to: "/today", Icon: CheckSquare };
const ACTIVITY_TAB: TabSpec = { key: "activity", label: "Scans", to: "/scans", Icon: Activity };
const EXPLORE_TAB: TabSpec = { key: "explore", label: "Explore", to: "/explore", Icon: Compass };

// `active` is optional — during the setup flow no tab is highlighted. Pass
// `embedded` to drop the fixed positioning so it can be stacked inside another
// fixed container (e.g. above the setup footer).
function tabForPath(pathname: string): OwnerTab | undefined {
  if (pathname.startsWith("/dashboard")) return "home";
  if (pathname.startsWith("/today")) return "sits";
  if (pathname.startsWith("/sits")) return "sits";
  if (pathname.startsWith("/scans")) return "activity";
  if (pathname.startsWith("/explore")) return "explore";
  return undefined; // deeper screens (bird editor, account, …) highlight nothing
}

export function OwnerTabBar({ active, embedded }: { active?: OwnerTab; embedded?: boolean }) {
  const pathname = useLocation({ select: (l) => l.pathname });
  const current = active ?? tabForPath(pathname);
  // Active-caregiver state drives the Sits ↔ Today swap on the second tab.
  // Single query, deduped by the existing hook — same key used by /today and
  // /dashboard. Fails open to "Sits" (the data isn't load-bearing for nav).
  const { data: caregiver } = useActiveCaregiver();
  const isActiveCaregiver = !!caregiver?.sits?.length;
  const TABS: TabSpec[] = [HOME_TAB, isActiveCaregiver ? TODAY_TAB : SITS_TAB, ACTIVITY_TAB, EXPLORE_TAB];
  return (
    <nav
      aria-label="Primary"
      className={`${embedded ? "" : "fixed inset-x-0 bottom-0 z-40 "}border-t border-[#e3dcc9] bg-[#f4f1e8]/95 backdrop-blur-sm pb-[env(safe-area-inset-bottom)]`}
    >
      <div className="mx-auto flex max-w-md items-stretch justify-around">
        {TABS.map(({ key, label, to, Icon }) => {
          const on = key === current;
          return (
            <Link
              key={key}
              to={to}
              data-coach={`owner-tab-${key}`}
              aria-current={on ? "page" : undefined}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition-colors ${
                on ? "text-[#1a3d2e]" : "text-[#8a897f]"
              }`}
            >
              <Icon className="size-6" strokeWidth={on ? 2.4 : 1.9} />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
