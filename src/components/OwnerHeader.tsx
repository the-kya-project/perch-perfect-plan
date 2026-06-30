import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Bell, Settings, HelpCircle } from "lucide-react";
import { fetchScanConcern, getNotifSeenAt } from "@/lib/notificationsFeed";
import { replayOwnerOnboarding } from "@/components/OwnerOnboarding";

// THE single shared top-right hero icon cluster — help (replay tour), bell
// (with unread badge), settings (gear) — in a consistent dark-circle treatment.
// Used on every in-app hero (Home, Sits, Scans, scan detail, Explore). Keeping
// it in one place means the unread badge is ALWAYS the same lime-on-ink chip,
// not red on one screen and lime on another.
const HERO_ICON_BTN = "grid size-9 place-items-center rounded-full text-white active:scale-95";
const HERO_ICON_BG = { background: "rgba(255,255,255,0.12)" } as const;

export function OwnerHeaderIcons() {
  const navigate = useNavigate();
  // Bell count uses the lean feed (shared with the dashboard), not the full one.
  const { data: scanFeed = [] } = useQuery({ queryKey: ["scan-feed-lean"], queryFn: fetchScanConcern });
  const seenAt = getNotifSeenAt();
  const unread = (scanFeed as any[]).filter((n) => new Date(n.created_at).getTime() > seenAt).length;

  // "?" replays the onboarding tour. It navigates Home first (the tour lives on
  // the dashboard); replayOwnerOnboarding sets a session flag so the tour
  // re-triggers once the dashboard mounts, plus dispatches an event for the
  // already-on-Home case.
  function replayTour() {
    navigate({ to: "/dashboard" });
    replayOwnerOnboarding();
  }

  return (
    <div className="flex items-center gap-2 text-white">
      <button type="button" onClick={replayTour} className={HERO_ICON_BTN} style={HERO_ICON_BG} aria-label="Replay app tour">
        <HelpCircle className="size-[18px]" />
      </button>
      <Link to="/scans" className={`relative ${HERO_ICON_BTN}`} style={HERO_ICON_BG} aria-label="Scans">
        <Bell className="size-[18px]" />
        {/* Unread badge: lime fill, ink text, no border — the ONE canonical
            treatment, tied to count not to which page you're on. */}
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 grid min-w-[16px] place-items-center rounded-full bg-[var(--lime)] px-1 text-[10px] font-medium leading-4 text-[var(--ink)]">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </Link>
      <Link to="/account" className={HERO_ICON_BTN} style={HERO_ICON_BG} aria-label="Account settings">
        <Settings className="size-[18px]" />
      </Link>
    </div>
  );
}

// Shared owner-screen header: dark-green brand band with a title and the two
// header icons. The dashboard keeps its own bespoke header (greeting + sign
// out); this is for the other primary tab screens (e.g. Sits).
export function OwnerHeader({ title }: { title: string }) {
  return (
    <header className="bg-[#1a3d2e] pt-[max(env(safe-area-inset-top),1rem)]">
      <div className="mx-auto flex max-w-md items-center justify-between gap-3 px-5 pb-6 pt-3">
        <h1 className="text-[27px] font-medium leading-tight text-white">{title}</h1>
        <OwnerHeaderIcons />
      </div>
    </header>
  );
}
