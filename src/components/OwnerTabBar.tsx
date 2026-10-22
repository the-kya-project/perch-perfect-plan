import { Link, useLocation } from "@tanstack/react-router";
import { Home, Calendar, Activity, Compass, Users } from "lucide-react";
import { rememberMode, useFlockEnabled } from "@/lib/flock";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";

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
const ACTIVITY_TAB: TabSpec = { key: "activity", label: "Health", to: "/scans", Icon: Activity };
const EXPLORE_TAB: TabSpec = { key: "explore", label: "Explore", to: "/explore", Icon: Compass };

// `label` stays the English source; translate only at display.
function tabLabel(t: TFunction, key: OwnerTab, fallback: string): string {
  switch (key) {
    case "home": return t("ownerTabs.home", "Home");
    case "sits": return t("ownerTabs.sits", "Sits");
    case "activity": return t("ownerTabs.health", "Health");
    case "explore": return t("ownerTabs.explore", "Explore");
  }
  return fallback;
}

// `active` is optional — during the setup flow no tab is highlighted. Pass
// `embedded` to drop the fixed positioning so it can be stacked inside another
// fixed container (e.g. above the setup footer).
function tabForPath(pathname: string): OwnerTab | undefined {
  if (pathname.startsWith("/dashboard")) return "home";
  if (pathname.startsWith("/sits")) return "sits";
  // Notification settings is a page: it highlights the tab you came from.
  if (pathname.startsWith("/scans/settings")) return undefined;
  if (pathname.startsWith("/scans")) return "activity";
  if (pathname.startsWith("/explore")) return "explore";
  return undefined;
}

/** A task screen: no bottom nav, Close instead of Back. Some pages become a
 *  task via a search param (identity's ?edit=1 drives its edit form), so the
 *  caller may pass the parsed search alongside the pathname. */
export function isTaskPath(pathname: string, search?: Record<string, unknown>): boolean {
  return pathname === "/check" || /^\/birds\/[^/]+\/scan$/.test(pathname) ||
    pathname === "/sits/new" || pathname.startsWith("/sits/edit/") ||
    /^\/birds\/[^/]+\/plan\/editor$/.test(pathname) ||
    (/^\/birds\/[^/]+\/identity$/.test(pathname) && !!search?.edit);
}

// Pages opened from a tab (a bird, account, a sit…) highlight the tab the
// person came from: the last tab screen visited, remembered for the session.
const LAST_TAB_KEY = "kya_last_tab";
function rememberedTab(): OwnerTab | undefined {
  try { return (sessionStorage.getItem(LAST_TAB_KEY) as OwnerTab | null) ?? undefined; } catch { return undefined; }
}

export function OwnerTabBar({ active, embedded }: { active?: OwnerTab; embedded?: boolean }) {
  const { t } = useTranslation();
  const pathname = useLocation({ select: (l) => l.pathname });
  const own = tabForPath(pathname);
  if (own && typeof window !== "undefined") {
    try { sessionStorage.setItem(LAST_TAB_KEY, own); } catch { /* ignore */ }
  }
  // /today opens with a Back header (a page, not a tab), so no tab is lit.
  const noTab = pathname.startsWith("/today");
  const current = noTab ? undefined : active ?? own ?? rememberedTab() ?? "home";
  // ONE nav for every authenticated account — owning a bird is derived, not a
  // signup type, so there's no owner-vs-caregiver nav split (a recurring bug
  // source). A sit you're covering shows as a section on Home, not a nav tab.
  const TABS: TabSpec[] = [HOME_TAB, SITS_TAB, ACTIVITY_TAB, EXPLORE_TAB];
  // The Community entry (the Flock): admins only until launch (flock_enabled() on the server).
  // While that loads, on any error, and for everyone else, nothing is added and
  // the bar is exactly the four tabs above.
  const flock = useFlockEnabled() === true;
  return (
    <nav
      aria-label={t("ownerTabs.navAria", "Primary")}
      className={`${embedded ? "" : "fixed inset-x-0 bottom-0 z-40 "}border-t border-[#d5dfd5] bg-white pb-[env(safe-area-inset-bottom)]`}
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
              className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] transition-colors ${
                on ? "font-bold text-[#1a3d2e]" : "font-medium text-[#5f5e5a]"
              }`}
            >
              <Icon className="size-6" strokeWidth={on ? 2.4 : 1.9} />
              {tabLabel(t, key, label)}
            </Link>
          );
        })}
        {flock && (
          <Link
            to="/flock"
            onClick={() => rememberMode("flock")}
            data-coach="owner-tab-flock"
            className="flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium text-[#5f5e5a] transition-colors"
          >
            <Users className="size-6" strokeWidth={1.9} />
            {t("ownerTabs.flock", "Community")}
          </Link>
        )}
      </div>
    </nav>
  );
}
