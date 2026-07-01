import { Link, useLocation } from "@tanstack/react-router";
import { Home, Calendar, Activity, Compass } from "lucide-react";

// Bottom navigation — ONE set for every authenticated account: Home / Sits /
// Scans / Explore. Owning a bird is derived (not a signup type), so there's no
// owner-vs-caregiver nav split; a sit you're covering surfaces as a section on
// Home, not a separate "Today" tab. Settings (gear) and notifications (bell)
// stay as header icons. Every scroll container under _authenticated uses the
// `.pb-nav` utility so the fixed bar never clips content.
export type OwnerTab = "home" | "sits" | "activity" | "explore";

type TabSpec = { key: OwnerTab; label: string; to: string; Icon: typeof Home };
const HOME_TAB: TabSpec = { key: "home", label: "Home", to: "/dashboard", Icon: Home };
const SITS_TAB: TabSpec = { key: "sits", label: "Sits", to: "/sits", Icon: Calendar };
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
  // ONE nav for every authenticated account — owning a bird is derived, not a
  // signup type, so there's no owner-vs-caregiver nav split (a recurring bug
  // source). A sit you're covering shows as a section on Home, not a nav tab.
  const TABS: TabSpec[] = [HOME_TAB, SITS_TAB, ACTIVITY_TAB, EXPLORE_TAB];
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
