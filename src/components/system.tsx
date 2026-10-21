import type { ReactNode } from "react";
import { BrandLockup } from "@/components/BrandLogo";
import { useTranslation } from "react-i18next";

// The last piece of the pre-Kya owner visual system, kept only for the public
// legal pages (privacy, terms) until they move onto the Kya components.

// InkHero — the dark-green anchor block at the top of (almost) every screen.
export function InkHero({
  eyebrow, headline, body, backIcon, onBack, trailingIcons, children, showBrand, brandSize = 118,
}: {
  eyebrow?: ReactNode;
  headline: ReactNode;
  body?: ReactNode;
  backIcon?: ReactNode;
  onBack?: () => void;
  trailingIcons?: ReactNode;
  children?: ReactNode;
  // Brand lockup as quiet chrome in the top-left. OFF by default: per the
  // brand-placement principle the lockup appears in-app only on Home (where it
  // confirms which app you're in during normal use) and on sign-up; everywhere
  // else the screen's own content carries the moment. Opt in with showBrand.
  showBrand?: boolean;
  // Lockup width; default 118 ≈ 36px tall (the asset is ~3.27:1).
  brandSize?: number;
}) {
  const { t } = useTranslation();
  const showLockup = !!showBrand;
  // Only render the top chrome row when there's something in it (a lockup or
  // icon controls). On screens with neither (accept-invite/handoff), the hero
  // content sits directly under the safe-area inset.
  const hasChrome = showLockup || !!backIcon || !!trailingIcons;
  return (
    // Full-bleed background, phone-width content. Callers render the hero inside
    // their `mx-auto max-w-md` column, so the ink block used to stop at 448px
    // and float as a detached box on anything wider — an iPad (the app ships
    // with TARGETED_DEVICE_FAMILY "1,2", so review sees it) or a desktop
    // browser. `mx-[calc(50%-50vw)]` pulls the edges out to the viewport and is
    // a NO-OP on phones, where the column already is the viewport. Safe against
    // horizontal scrollbars because html/body are `overflow-x: clip`.
    <header className="mx-[calc(50%-50vw)] bg-[var(--ink)] text-white">
      <div className="mx-auto max-w-md px-[22px] pb-[26px] pt-[max(env(safe-area-inset-top),18px)]">
      {hasChrome && (
        // `mt-1.5` keeps the icon row clear of the native shell's frosted
        // status-bar scrim (`html.native-app body::before`, styles.css). The
        // scrim is exactly env(safe-area-inset-top) tall and this container's
        // padding-top resolves to the same value, so the row would start flush
        // against it -- and the bell's unread badge, which overhangs 2px via
        // `-top-0.5`, would sit UNDER the blur and read as clipped. Only
        // visible when there are unread scans, which is why it comes and goes.
        <div className="mt-1.5 flex min-h-9 items-center gap-2">
          {showLockup ? <BrandLockup orientation="horizontal" variant="ink" size={brandSize} /> : <span />}
          <div className="flex-1" />
          {backIcon && (
            <button type="button" onClick={onBack} aria-label={t("system.back", "Back")} className="grid size-9 place-items-center rounded-full text-white/90 active:bg-white/10">{backIcon}</button>
          )}
          {trailingIcons && <div className="flex items-center gap-2">{trailingIcons}</div>}
        </div>
      )}
      {/* Generous gap below the chrome row so brand and content read as separate
          layers; no gap when there's no chrome row. */}
      <div className={hasChrome ? "mt-12" : undefined}>
        {eyebrow && <p className="t-eyebrow text-[var(--teal)]">{eyebrow}</p>}
        <h1 className="t-hero mt-1 text-white">{headline}</h1>
        {body && <p className="t-body mt-2 text-white/85">{body}</p>}
        {children && <div className="mt-4">{children}</div>}
      </div>
      </div>
    </header>
  );
}
