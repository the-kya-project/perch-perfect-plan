import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation } from "@tanstack/react-router";
import { Rows2, Route as RouteIcon, Library, Bird, Plus, Menu, Bell } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { K, KyaHeading, SERIF } from "@/components/kya";
import { RAIL_TAB_CLASS, RAIL_TAB_OFF_STYLE, RAIL_TAB_ON_STYLE, useDuoRail, useTabFit } from "@/components/DuoRail";
import { AddSheet } from "@/components/flock/AddSheet";
import { rememberMode } from "@/lib/flock";
import { trackFlockActive } from "@/lib/flockAnalytics";
import { useUnreadNotifications } from "@/lib/flockModeration";
import { FLOCK_BAR, FLOCK_DESTS, destForPath, isFlockFullScreenPath, isFlockOnboardingPath, type FlockDest } from "@/lib/flockNav";

// The Community's own chrome (the Flock; admins only until launch, the /flock
// route guard keeps everyone else out). Five items in the same order
// everywhere (backlog CR1): Feed, Journeys, the gold Add something button,
// Library, then My birds, which goes back to care from the slot the Community
// button holds on the care tab bar. Chapter is in the side menu (CR2).
//   - Phones: a bottom bar, same height, border and safe area as OwnerTabBar.
//   - iPhone Duo sideways (lib/duo.ts): the authenticated layout keeps its side
//     column and leaves an empty tab group in it (DuoRail `tabs`); the tabs are
//     sent there, looking exactly like the care tabs.
//   - Wide desktop windows (1024px+, no Duo column): the same column, drawn
//     here, so both wide layouts match.

const ICONS: Record<FlockDest, typeof Rows2> = {
  feed: Rows2,
  journeys: RouteIcon,
  library: Library,
  care: Bird,
};

const DEST_TO = Object.fromEntries(FLOCK_DESTS.map((d) => [d.key, d.to])) as Record<FlockDest, string>;

export function flockDestLabel(t: TFunction, key: FlockDest): string {
  switch (key) {
    case "feed": return t("flock.nav.feed", "Feed");
    case "journeys": return t("flock.nav.journeys", "Journeys");
    case "library": return t("flock.nav.library", "Library");
    case "care": return t("flock.nav.care", "My birds");
  }
}

type AddApi = { open: (trigger: HTMLElement | null) => void };
const AddContext = createContext<AddApi | null>(null);

/** The raised gold plus: opens Add something. A button, never lit. */
function AddButton({ column }: { column?: boolean }) {
  const { t } = useTranslation();
  const add = useContext(AddContext);
  const ref = useRef<HTMLButtonElement>(null);
  const circle = (
    <span
      className={`grid shrink-0 place-items-center rounded-full ${column ? "size-[52px]" : "size-14 border-4 border-white"}`}
      style={{ background: K.gold, color: K.forest, boxShadow: column ? undefined : "0 4px 12px rgba(15,30,24,.18)" }}
    >
      <Plus className="size-6" strokeWidth={2.6} aria-hidden="true" />
    </span>
  );
  return (
    <button
      ref={ref}
      type="button"
      data-flock-add
      aria-label={t("flock.nav.add", "Add something")}
      aria-haspopup="dialog"
      onClick={() => add?.open(ref.current)}
      className={column ? `${RAIL_TAB_CLASS} justify-center` : "flex flex-1 justify-center active:scale-95"}
      style={column ? RAIL_TAB_OFF_STYLE : undefined}
    >
      {column ? circle : <span className="-mt-[22px]">{circle}</span>}
    </button>
  );
}

/** Phone: fixed bottom bar. */
function FlockTabBar({ current }: { current: FlockDest | null }) {
  const { t } = useTranslation();
  return (
    <nav
      aria-label={t("flock.nav.aria", "Community")}
      className="fixed inset-x-0 bottom-0 z-40 border-t border-[#d5dfd5] bg-white pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      <div className="mx-auto flex max-w-md items-stretch justify-around">
        {FLOCK_BAR.map((key) => {
          if (key === "add") return <AddButton key={key} />;
          const on = key === current;
          const Icon = ICONS[key];
          return (
            <Link
              key={key}
              to={DEST_TO[key]}
              data-flock-tab={key}
              onClick={key === "care" ? () => rememberMode("care") : undefined}
              aria-current={on ? "page" : undefined}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] transition-colors ${
                on ? "font-bold text-[#1a3d2e]" : "font-medium text-[#5f5e5a]"
              }`}
            >
              <Icon className="size-6" strokeWidth={on ? 2.4 : 1.9} aria-hidden="true" />
              {flockDestLabel(t, key)}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

/** The column's tabs, in the Duo column's look (shared classes from DuoRail). */
function ColumnTabs({ current }: { current: FlockDest | null }) {
  const { t } = useTranslation();
  return (
    <>
      {FLOCK_BAR.map((key) => {
        if (key === "add") return <AddButton key={key} column />;
        const on = key === current;
        const Icon = ICONS[key];
        return (
          <Link
            key={key}
            to={DEST_TO[key]}
            data-flock-tab={key}
            onClick={key === "care" ? () => rememberMode("care") : undefined}
            aria-current={on ? "page" : undefined}
            className={`${RAIL_TAB_CLASS} ${on ? "font-bold" : "font-medium"}`}
            style={on ? RAIL_TAB_ON_STYLE : RAIL_TAB_OFF_STYLE}
          >
            <Icon className="size-[26px] shrink-0" strokeWidth={on ? 2.4 : 1.9} aria-hidden="true" />
            <span className="duo-rail-tab-label">{flockDestLabel(t, key)}</span>
          </Link>
        );
      })}
    </>
  );
}

/** Into the Duo column's empty tab group, sized the way the care tabs are. */
function DuoColumnTabs({ slot, current }: { slot: HTMLElement; current: FlockDest | null }) {
  const ref = useMemo(() => ({ current: slot as HTMLDivElement | null }), [slot]);
  const fit = useTabFit(ref, FLOCK_BAR.length);
  useLayoutEffect(() => { slot.dataset.fit = fit; }, [slot, fit]);
  return createPortal(<ColumnTabs current={current} />, slot);
}

/** Wide desktop windows: the Duo column's look, drawn by the Flock itself. */
function DesktopColumn({ current }: { current: FlockDest | null }) {
  const { t } = useTranslation();
  return (
    <nav
      aria-label={t("flock.nav.aria", "Community")}
      className="fixed inset-y-0 right-0 z-40 hidden w-[104px] flex-col items-center border-l border-[#dfe7df] bg-white pb-5 pt-6 lg:flex"
    >
      <div className="flex-1" />
      <div className="duo-rail-tabs flex flex-col items-center gap-2" data-fit="comfortable">
        <ColumnTabs current={current} />
      </div>
    </nav>
  );
}

/** Frame for every Community screen: nav for the current layout, room for it,
 *  and the Add something sheet the center button opens. */
export function FlockShell({ children }: { children: ReactNode }) {
  const pathname = useLocation({ select: (l) => l.pathname });
  const current = destForPath(pathname);
  const onboarding = isFlockOnboardingPath(pathname) || isFlockFullScreenPath(pathname);
  const rail = useDuoRail();
  const [addOpen, setAddOpen] = useState(false);
  const trigger = useRef<HTMLElement | null>(null);
  const api = useMemo<AddApi>(() => ({ open: (el) => { trigger.current = el; setAddOpen(true); } }), []);
  // A new screen closes the sheet.
  useEffect(() => { setAddOpen(false); }, [pathname]);
  // Daily active member (flock_active): only the first Flock screen of the
  // day sends, and only for a member or admin (src/lib/flockAnalytics.ts).
  useEffect(() => { trackFlockActive(); }, [pathname]);

  return (
    <AddContext.Provider value={api}>
      <div className={`min-h-screen ${onboarding ? "" : "pb-nav"} ${rail || onboarding ? "" : "lg:pb-10 lg:pr-[104px]"}`} style={{ background: K.mist, color: K.forest }}>
        {children}
        {onboarding ? null : rail
          ? rail.tabs && <DuoColumnTabs slot={rail.tabs} current={current} />
          : (
            <>
              <FlockTabBar current={current} />
              <DesktopColumn current={current} />
            </>
          )}
      </div>
      {addOpen && (
        <AddSheet
          onClose={() => {
            setAddOpen(false);
            // Back to the button that opened it, as a dialog should.
            requestAnimationFrame(() => trigger.current?.focus());
          }}
        />
      )}
    </AddContext.Provider>
  );
}

/** The header's menu tile. The side menu it opens comes in CR2, and the lime
 *  dot for new activity in CR3. */
function MenuButton() {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      data-testid="flock-menu-button"
      aria-label={t("flock.header.menu", "Menu")}
      className="relative grid size-[52px] shrink-0 place-items-center rounded-[16px] text-white active:scale-95"
      style={{ background: "rgba(255,255,255,.14)" }}
    >
      <Menu className="size-[26px]" strokeWidth={2.3} aria-hidden="true" />
    </button>
  );
}

/** Updates: Community notifications, with a lime dot while any are unread. */
function UpdatesBell() {
  const { t } = useTranslation();
  const { data: unread } = useUnreadNotifications();
  const dot = (unread ?? 0) > 0;
  return (
    <Link
      to="/flock/you/notifications"
      data-testid="flock-updates"
      aria-label={dot ? t("flock.header.updatesNew", "Updates, new activity") : t("flock.header.updates", "Updates")}
      className="relative grid size-11 shrink-0 place-items-center rounded-full text-white active:scale-95"
      style={{ background: "rgba(255,255,255,.12)" }}
    >
      <Bell className="size-5" strokeWidth={1.8} aria-hidden="true" />
      {dot && (
        <span data-testid="flock-updates-dot" aria-hidden="true" className="absolute right-[9px] top-[9px] size-2.5 rounded-full"
          style={{ background: K.lime, boxShadow: `0 0 0 2px ${K.forest}` }} />
      )}
    </Link>
  );
}

/** Every Community screen's forest header: the menu tile and the Kya & Co.
 *  wordmark on the left, the Updates bell on the right, the title below and
 *  an optional line under it. */
export function FlockHeader({ title, line }: { title: ReactNode; line?: ReactNode }) {
  return (
    <header className="text-white" style={{ background: K.forest }}>
      <div className="mx-auto max-w-md px-4 pb-[46px] pt-[calc(env(safe-area-inset-top)+18px)] lg:max-w-2xl">
        <div className="flex items-center gap-3">
          <MenuButton />
          <span className="min-w-0 flex-1 truncate text-[21px] font-[700] text-white" style={{ fontFamily: SERIF }}>Kya &amp; Co.</span>
          <UpdatesBell />
        </div>
        <div className="mt-3 px-1">
          <KyaHeading as="h1" size={30} className="truncate text-white">{title}</KyaHeading>
          {line && <p className="m-0 mt-2 text-[15px] leading-[1.5]" style={{ color: K.paleGreen }}>{line}</p>}
        </div>
      </div>
    </header>
  );
}

/** The mist body under the header, with the rounded top the care screens use. */
export function FlockBody({ children }: { children: ReactNode }) {
  return (
    <main className="relative mx-auto -mt-[26px] flex min-h-[40vh] max-w-md flex-col gap-4 rounded-t-[26px] px-4 pb-6 pt-5 lg:max-w-2xl" style={{ background: K.mist }}>
      {children}
    </main>
  );
}
