import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Bell, Settings, HelpCircle } from "lucide-react";
import { useUpdates } from "@/lib/updates";
import { replayOwnerOnboarding } from "@/components/OwnerOnboarding";
import { HelpSheet } from "@/components/HelpSheet";
import { useTranslation } from "react-i18next";

// THE single shared top-right hero icon cluster — help (the help sheet), bell
// (Updates, with an unread dot), settings (gear) — in a consistent
// dark-circle treatment. Used on every in-app hero (Home, Sits, Health,
// Explore).
const HERO_ICON_BTN = "grid size-9 place-items-center rounded-full text-white active:scale-95";
const HERO_ICON_BG = { background: "rgba(255,255,255,0.12)" } as const;
const HERO_ICON_BTN_LG = "grid size-11 place-items-center rounded-full text-white active:scale-95";
const HERO_ICON_BG_LG = { background: "#12291f" } as const;

/** `large`: 44px circles in darker forest (the Kya & Co. look on Home). */
export function OwnerHeaderIcons({ large = false }: { large?: boolean } = {}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { unread } = useUpdates();
  const [helpOpen, setHelpOpen] = useState(false);

  // "Take the tour" in the help sheet replays the onboarding tour. It navigates
  // Home first (the tour lives on the dashboard); replayOwnerOnboarding sets a
  // session flag so the tour re-triggers once the dashboard mounts, plus
  // dispatches an event for the already-on-Home case.
  function replayTour() {
    setHelpOpen(false);
    navigate({ to: "/dashboard" });
    replayOwnerOnboarding();
  }

  const btn = large ? HERO_ICON_BTN_LG : HERO_ICON_BTN;
  const bg = large ? HERO_ICON_BG_LG : HERO_ICON_BG;
  return (
    <div className="flex items-center gap-2 text-white">
      <button type="button" onClick={() => setHelpOpen(true)} className={btn} style={bg} aria-label={t("ownerHeader.help", "Help")}>
        <HelpCircle className="size-[18px]" />
      </button>
      <Link to="/updates" className={`relative ${btn}`} style={bg} aria-label={unread > 0 ? t("ownerHeader.updatesUnread", "Updates, new") : t("ownerHeader.updates", "Updates")}>
        <Bell className="size-[18px]" />
        {/* Unread: a small sunflower dot with a forest outline. */}
        {unread > 0 && <span className="absolute right-[7px] top-[7px] size-[10px] rounded-full" style={{ background: "#f2b33d", boxShadow: "0 0 0 2px #1a3d2e" }} aria-hidden="true" />}
      </Link>
      <Link to="/account" className={btn} style={bg} aria-label={t("ownerHeader.accountSettings", "Account settings")}>
        <Settings className="size-[18px]" />
      </Link>
      <HelpSheet open={helpOpen} onClose={() => setHelpOpen(false)} onTakeTour={replayTour} />
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
