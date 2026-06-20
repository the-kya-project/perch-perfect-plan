import { Link } from "@tanstack/react-router";
import { Home, Calendar, Activity, Compass } from "lucide-react";

// Owner bottom navigation. Four primary destinations; settings (gear) and
// notifications (bell) stay as header icons, not tabs. Render this on each of
// the four tab screens and give the page a bottom pad (pb-24) so the fixed bar
// never covers content.
export type OwnerTab = "home" | "sits" | "activity" | "explore";

const TABS: { key: OwnerTab; label: string; to: string; Icon: typeof Home }[] = [
  { key: "home", label: "Home", to: "/dashboard", Icon: Home },
  { key: "sits", label: "Sits", to: "/sits", Icon: Calendar },
  { key: "activity", label: "Activity", to: "/notifications", Icon: Activity },
  { key: "explore", label: "Explore", to: "/explore", Icon: Compass },
];

export function OwnerTabBar({ active }: { active: OwnerTab }) {
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-[#e3dcc9] bg-[#f4f1e8]/95 backdrop-blur-sm pb-[env(safe-area-inset-bottom)]"
    >
      <div className="mx-auto flex max-w-md items-stretch justify-around">
        {TABS.map(({ key, label, to, Icon }) => {
          const on = key === active;
          return (
            <Link
              key={key}
              to={to}
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
