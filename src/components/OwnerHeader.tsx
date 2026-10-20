import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Bell, Settings, HelpCircle } from "lucide-react";
import { fetchScanFeed, getNotifSeenAt, isUnreadScan } from "@/lib/notificationsFeed";
import { useMyPermissions } from "@/lib/useCapability";
import { replayOwnerOnboarding } from "@/components/OwnerOnboarding";
import { useTranslation } from "react-i18next";

// THE single shared top-right hero icon cluster — help (replay tour), bell
// (with unread badge), settings (gear) — in a consistent dark-circle treatment.
// Used on every in-app hero (Home, Sits, Scans, scan detail, Explore). Keeping
// it in one place means the unread badge is ALWAYS the same lime-on-ink chip,
// not red on one screen and lime on another.
const HERO_ICON_BTN = "grid size-9 place-items-center rounded-full text-white active:scale-95";
const HERO_ICON_BG = { background: "rgba(255,255,255,0.12)" } as const;
const HERO_ICON_BTN_LG = "grid size-11 place-items-center rounded-full text-white active:scale-95";
const HERO_ICON_BG_LG = { background: "#12291f" } as const;

/** `large`: 44px circles in darker forest (the Kya & Co. look on Home). */
export function OwnerHeaderIcons({ large = false }: { large?: boolean } = {}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: scanFeed = [] } = useQuery({ queryKey: ["scan-feed"], queryFn: fetchScanFeed });
  const seenAt = getNotifSeenAt();
  const myId = useMyPermissions().data?.myId;
  const unread = (scanFeed as any[]).filter((n) => isUnreadScan(n, seenAt, myId)).length;

  // "?" replays the onboarding tour. It navigates Home first (the tour lives on
  // the dashboard); replayOwnerOnboarding sets a session flag so the tour
  // re-triggers once the dashboard mounts, plus dispatches an event for the
  // already-on-Home case.
  function replayTour() {
    navigate({ to: "/dashboard" });
    replayOwnerOnboarding();
  }

  const btn = large ? HERO_ICON_BTN_LG : HERO_ICON_BTN;
  const bg = large ? HERO_ICON_BG_LG : HERO_ICON_BG;
  return (
    <div className="flex items-center gap-2 text-white">
      <button type="button" onClick={replayTour} className={btn} style={bg} aria-label={t("ownerHeader.replayAppTour", "Replay app tour")}>
        <HelpCircle className="size-[18px]" />
      </button>
      <Link to="/scans" className={`relative ${btn}`} style={bg} aria-label={t("ownerHeader.scans", "Scans")}>
        <Bell className="size-[18px]" />
        {/* Unread badge: lime fill, ink text, no border — the ONE canonical
            treatment, tied to count not to which page you're on. */}
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 grid min-w-[16px] place-items-center rounded-full bg-[var(--lime)] px-1 text-[10px] font-medium leading-4 text-[var(--ink)]">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </Link>
      <Link to="/account" className={btn} style={bg} aria-label={t("ownerHeader.accountSettings", "Account settings")}>
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
