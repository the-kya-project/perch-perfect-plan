import { Link, useLocation } from "@tanstack/react-router";
import { Home, Calendar, Activity, Compass } from "lucide-react";

// Owner bottom navigation. Four primary destinations; settings (gear) and
// notifications (bell) stay as header icons, not tabs. Render this on each of
// the four tab screens and give the page a bottom pad (pb-24) so the fixed bar
// never covers content.
export type OwnerTab = "home" | "sits" | "activity" | "explore";

const TABS: { key: OwnerTab; label: string; to: string; Icon: typeof Home }[] = [
  { key: "home", label: "Home", to: "/dashboard", Icon: Home },
  { key: "sits", label: "Sits", to: "/sits", Icon: Calendar },
  { key: "activity", label: "Scans", to: "/notifications", Icon: Activity },
  { key: "explore", label: "Explore", to: "/explore", Icon: Compass },
];

// `active` is optional — during the setup flow no tab is highlighted. Pass
// `embedded` to drop the fixed positioning so it can be stacked inside another
// fixed container (e.g. above the setup footer).
function tabForPath(pathname: string): OwnerTab | undefined {
  if (pathname.startsWith("/dashboard")) return "home";
  if (pathname.startsWith("/sits")) return "sits";
  if (pathname.startsWith("/notifications")) return "activity";
  if (pathname.startsWith("/explore")) return "explore";
  return undefined; // deeper screens (bird editor, account, …) highlight nothing
}

export function OwnerTabBar({ active, embedded }: { active?: OwnerTab; embedded?: boolean }) {
  const pathname = useLocation({ select: (l) => l.pathname });
  const current = active ?? tabForPath(pathname);
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
