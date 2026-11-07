import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation } from "@tanstack/react-router";
import { Sun, Route as RouteIcon, MapPin, Library, Bird, LayoutGrid } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { K, KyaHeading } from "@/components/kya";
import { FlockAvatar } from "@/components/flock/FlockPeople";
import { useAvatarUrls, useCareName, useMyProfile } from "@/lib/flockData";
import { defaultDisplayName } from "@/lib/flockProfile";
import { RAIL_TAB_CLASS, RAIL_TAB_OFF_STYLE, RAIL_TAB_ON_STYLE, useDuoRail, useTabFit } from "@/components/DuoRail";
import { SpacesSheet } from "@/components/flock/SpacesSheet";
import { rememberMode } from "@/lib/flock";
import { FLOCK_DESTS, destForPath, isFlockFullScreenPath, isFlockOnboardingPath, type FlockDest } from "@/lib/flockNav";

// The Community's own chrome (the Flock; admins only until launch, the /flock
// route guard keeps everyone else out). Five destinations in the same order
// everywhere: Today, Journeys, Chapter, Library, then My birds, which goes back
// to care from the slot the Community button holds on the care tab bar.
//   - Phones: a bottom bar, same height, border and safe area as OwnerTabBar.
//   - iPhone Duo sideways (lib/duo.ts): the authenticated layout keeps its side
//     column and leaves an empty tab group in it (DuoRail `tabs`); the tabs are
//     sent there, looking exactly like the care tabs.
//   - Wide desktop windows (1024px+, no Duo column): the same column, drawn
//     here, so both wide layouts match.

const ICONS: Record<FlockDest, typeof Sun> = {
  today: Sun,
  journeys: RouteIcon,
  chapter: MapPin,
  library: Library,
  care: Bird,
};

export function flockDestLabel(t: TFunction, key: FlockDest): string {
  switch (key) {
    case "today": return t("flock.nav.today", "Today");
    case "journeys": return t("flock.nav.journeys", "Journeys");
    case "chapter": return t("flock.nav.chapter", "Chapter");
    case "library": return t("flock.nav.library", "Library");
    case "care": return t("flock.nav.care", "My birds");
  }
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
        {FLOCK_DESTS.map(({ key, to }) => {
          const on = key === current;
          const Icon = ICONS[key];
          return (
            <Link
              key={key}
              to={to}
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
      {FLOCK_DESTS.map(({ key, to }) => {
        const on = key === current;
        const Icon = ICONS[key];
        return (
          <Link
            key={key}
            to={to}
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
  const fit = useTabFit(ref, FLOCK_DESTS.length);
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

type SpacesApi = { open: (trigger: HTMLElement | null) => void };
const SpacesContext = createContext<SpacesApi | null>(null);

/** Frame for every Community screen: nav for the current layout, room for it,
 *  and the Spaces sheet the header opens. */
export function FlockShell({ children }: { children: ReactNode }) {
  const pathname = useLocation({ select: (l) => l.pathname });
  const current = destForPath(pathname);
  const onboarding = isFlockOnboardingPath(pathname) || isFlockFullScreenPath(pathname);
  const rail = useDuoRail();
  const [spacesOpen, setSpacesOpen] = useState(false);
  const trigger = useRef<HTMLElement | null>(null);
  const api = useMemo<SpacesApi>(() => ({ open: (el) => { trigger.current = el; setSpacesOpen(true); } }), []);
  // A new screen closes the sheet (picking a space navigates).
  useEffect(() => { setSpacesOpen(false); }, [pathname]);

  return (
    <SpacesContext.Provider value={api}>
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
      {spacesOpen && (
        <SpacesSheet
          onClose={() => {
            setSpacesOpen(false);
            // Back to the Spaces button, as a dialog should.
            requestAnimationFrame(() => trigger.current?.focus());
          }}
        />
      )}
    </SpacesContext.Provider>
  );
}

/** The header's Spaces button: opens the sheet. */
function SpacesButton() {
  const { t } = useTranslation();
  const spaces = useContext(SpacesContext);
  const ref = useRef<HTMLButtonElement>(null);
  return (
    <button
      ref={ref}
      type="button"
      onClick={() => spaces?.open(ref.current)}
      aria-haspopup="dialog"
      className="inline-flex h-11 items-center gap-2 rounded-full px-4 text-[15px] font-[700] text-white active:scale-95"
      style={{ background: K.forestDeep, boxShadow: `0 0 0 2px ${K.teal}` }}
    >
      <LayoutGrid className="size-[18px]" strokeWidth={2.2} aria-hidden="true" />
      {t("flock.spaces.button", "Spaces")}
    </button>
  );
}

/** Your photo or initial, opening You (your Community profile). The care
 *  app's AccountAvatar stays as it is; this one is Community's own. */
function MeAvatarLink() {
  const { t } = useTranslation();
  const { data: me } = useMyProfile();
  const { data: care } = useCareName();
  const { data: urls } = useAvatarUrls([me?.photo_path]);
  const name = me?.display_name ?? defaultDisplayName(care?.first_name, care?.full_name);
  return (
    <Link to="/flock/you" aria-label={t("flock.you.open", "You")} className="shrink-0 rounded-full active:scale-95">
      <FlockAvatar name={name} url={me?.photo_path ? urls?.get(me.photo_path) : null} size={44} ring={K.teal} />
    </Link>
  );
}

/** Every Community screen's forest header: the title on the left; Spaces and
 *  the account avatar on the right; an optional line under the title. */
export function FlockHeader({ title, line }: { title: ReactNode; line?: ReactNode }) {
  return (
    <header className="text-white" style={{ background: K.forest }}>
      <div className="mx-auto max-w-md px-5 pb-[46px] pt-[calc(env(safe-area-inset-top)+18px)] lg:max-w-2xl">
        <div className="flex items-center gap-3">
          <KyaHeading as="h1" size={30} className="min-w-0 flex-1 truncate text-white">{title}</KyaHeading>
          <SpacesButton />
          <MeAvatarLink />
        </div>
        {line && <p className="m-0 mt-2 text-[15px] leading-[1.5]" style={{ color: K.paleGreen }}>{line}</p>}
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
