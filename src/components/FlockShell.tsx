import type { ReactNode } from "react";
import { Link, useLocation } from "@tanstack/react-router";
import { Newspaper, MessagesSquare, BookOpen, HeartPulse } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { K, KyaHeading } from "@/components/kya";
import { BrandLockup } from "@/components/BrandLogo";
import { AccountAvatar } from "@/components/AccountAvatar";
import { rememberMode } from "@/lib/flock";

// The Flock's own chrome: a bottom bar on phones, a left sidebar from 1024px.
// Same four destinations in the same order either way. "My birds" (back to
// care) is last (far right on the bar), in the slot the Community button
// occupies on the care tab bar, so switching back is one tap in a familiar
// place. Admins only until launch; the /flock route guard is what keeps
// everyone else out (see routes/.../flock.tsx).

type FlockDest = "feed" | "spaces" | "learn" | "care";
type DestSpec = { key: FlockDest; to: string; Icon: typeof Newspaper };
const DESTS: DestSpec[] = [
  { key: "feed", to: "/flock", Icon: Newspaper },
  { key: "spaces", to: "/flock/spaces", Icon: MessagesSquare },
  { key: "learn", to: "/flock/learn", Icon: BookOpen },
  { key: "care", to: "/dashboard", Icon: HeartPulse },
];

function destLabel(t: TFunction, key: FlockDest): string {
  switch (key) {
    case "feed": return t("flock.nav.feed", "Feed");
    case "spaces": return t("flock.nav.spaces", "Spaces");
    case "learn": return t("flock.nav.learn", "Learn");
    case "care": return t("flock.nav.care", "My birds");
  }
}

function destForPath(pathname: string): FlockDest {
  if (pathname.startsWith("/flock/spaces")) return "spaces";
  if (pathname.startsWith("/flock/learn")) return "learn";
  return "feed";
}

/** Phone: fixed bottom bar, same height, border and safe-area padding as the
 *  care OwnerTabBar, so the two modes feel like one app. */
function FlockTabBar({ current }: { current: FlockDest }) {
  const { t } = useTranslation();
  return (
    <nav
      aria-label={t("flock.nav.aria", "Community")}
      className="fixed inset-x-0 bottom-0 z-40 border-t border-[#d5dfd5] bg-white pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      <div className="mx-auto flex max-w-md items-stretch justify-around">
        {DESTS.map(({ key, to, Icon }) => {
          const on = key === current;
          return (
            <Link
              key={key}
              to={to}
              onClick={key === "care" ? () => rememberMode("care") : undefined}
              aria-current={on ? "page" : undefined}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] transition-colors ${
                on ? "font-bold text-[#1a3d2e]" : "font-medium text-[#5f5e5a]"
              }`}
            >
              <Icon className="size-6" strokeWidth={on ? 2.4 : 1.9} />
              {destLabel(t, key)}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

/** Wide screens: the same destinations as a fixed left sidebar. */
function FlockSidebar({ current }: { current: FlockDest }) {
  const { t } = useTranslation();
  return (
    <nav
      aria-label={t("flock.nav.aria", "Community")}
      className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-[#d5dfd5] bg-white px-3 pb-6 pt-[calc(env(safe-area-inset-top)+20px)] lg:flex"
    >
      <div className="px-3 pb-6">
        <BrandLockup orientation="horizontal" variant="transparent" size={118} />
      </div>
      <div className="flex flex-col gap-1">
        {DESTS.map(({ key, to, Icon }) => {
          const on = key === current;
          return (
            <Link
              key={key}
              to={to}
              onClick={key === "care" ? () => rememberMode("care") : undefined}
              aria-current={on ? "page" : undefined}
              className={`flex min-h-[44px] items-center gap-3 rounded-xl px-3 text-[15px] transition-colors ${
                on ? "font-bold text-[#1a3d2e]" : "font-medium text-[#5f5e5a] hover:bg-[#f1f5f0]"
              }`}
              style={on ? { background: K.mist } : undefined}
            >
              <Icon className="size-5" strokeWidth={on ? 2.4 : 1.9} />
              {destLabel(t, key)}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

/** Frame for every Flock screen: nav for the current width, and room for it. */
export function FlockShell({ children }: { children: ReactNode }) {
  const pathname = useLocation({ select: (l) => l.pathname });
  const current = destForPath(pathname);
  return (
    <div className="min-h-screen pb-nav lg:pb-10 lg:pl-60" style={{ background: K.mist, color: K.forest }}>
      {children}
      <FlockTabBar current={current} />
      <FlockSidebar current={current} />
    </div>
  );
}

/** A Flock screen's forest header: wordmark and avatar on top, then the title
 *  and one line, in the same rhythm as the care TabHeader. */
export function FlockHeader({ title, line }: { title: ReactNode; line?: ReactNode }) {
  return (
    <header className="text-white" style={{ background: K.forest }}>
      <div className="mx-auto max-w-md px-5 pb-[46px] pt-[calc(env(safe-area-inset-top)+14px)] lg:max-w-2xl">
        <div className="mt-1.5 flex items-center gap-2">
          <span className="lg:invisible">
            <BrandLockup orientation="horizontal" variant="ink" size={118} />
          </span>
          <div className="flex-1" />
          <AccountAvatar />
        </div>
        <KyaHeading as="h1" size={31} className="mt-9 text-white">{title}</KyaHeading>
        {line && <p className="m-0 mt-2 text-[15px] leading-[1.5]" style={{ color: K.paleGreen }}>{line}</p>}
      </div>
    </header>
  );
}

/** Placeholder until each destination is built: header only, plus the mist
 *  body's rounded top so it reads as the start of a page. */
export function FlockPlaceholder({ title, line }: { title: ReactNode; line: ReactNode }) {
  return (
    <>
      <FlockHeader title={title} line={line} />
      <main className="relative mx-auto -mt-[26px] min-h-[40vh] max-w-md rounded-t-[26px] px-4 pb-6 pt-5 lg:max-w-2xl" style={{ background: K.mist }} />
    </>
  );
}
