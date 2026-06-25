import type { ReactNode } from "react";
import { ArrowRight, ChevronRight, Feather, Camera } from "lucide-react";
import { BrandLockup } from "@/components/BrandLogo";

// ===========================================================================
// Owner visual system ("Explore-grade"). Build once, reuse everywhere.
// Tokens live in styles.css (--ink, --lime, … and .t-* type classes). These
// components are the ONLY approved styling for what they cover — no one-off
// card/heading/pill styling on individual screens.
//
// Router-agnostic: navigation is via onPress/onClick callbacks so callers wrap
// with their own <Link>/navigate. Light theme only; everything reads CSS vars,
// so a future dark theme is a token swap.
// ===========================================================================

type CtaTone = "lime" | "arrow";
export type HeroCta = { label: string; icon?: ReactNode; onPress?: () => void; tone?: CtaTone; disabled?: boolean };

// 1) InkHero — the dark-green anchor block at the top of (almost) every screen.
export function InkHero({
  eyebrow, headline, body, cta, backIcon, onBack, trailingIcons, children, showBrand,
}: {
  eyebrow?: ReactNode;
  headline: ReactNode;
  body?: ReactNode;
  cta?: HeroCta;
  backIcon?: ReactNode;
  onBack?: () => void;
  trailingIcons?: ReactNode;
  children?: ReactNode;
  // Show the Kya & Co. lockup as quiet chrome in the top row (default on). The
  // lockup is small (~31px tall) and sits as a peer to any icon controls — it's
  // chrome, not the focal point; the eyebrow/headline below carry the screen.
  // Set false on screens that supply their own brand treatment.
  showBrand?: boolean;
}) {
  const showLockup = showBrand ?? true;
  return (
    <header className="bg-[var(--ink)] px-[22px] pb-[26px] pt-[max(env(safe-area-inset-top),18px)] text-white">
      {/* Brand-as-chrome row: small lockup left, icon controls right — peers on
          one baseline. A small chrome size (~31px tall via size 100; the lockup
          is ~3.27:1) keeps the brand quiet so it never competes with content. */}
      <div className="flex min-h-9 items-center gap-2">
        {showLockup ? <BrandLockup orientation="horizontal" variant="ink" size={100} /> : <span />}
        <div className="flex-1" />
        {backIcon && (
          <button type="button" onClick={onBack} aria-label="Back" className="grid size-9 place-items-center rounded-full text-white/90 active:bg-white/10">{backIcon}</button>
        )}
        {trailingIcons && <div className="flex items-center gap-2">{trailingIcons}</div>}
      </div>
      {/* Generous gap so the brand chrome and the hero content read as separate
          layers, not one composed block. */}
      <div className="mt-12">
        {eyebrow && <p className="t-eyebrow text-[var(--teal)]">{eyebrow}</p>}
        <h1 className="t-hero mt-1 text-white">{headline}</h1>
        {body && <p className="t-body mt-2 text-white/85">{body}</p>}
        {children && <div className="mt-4">{children}</div>}
        {cta && (
          <div className="mt-4">
            {cta.tone === "arrow"
              ? <CtaLink label={cta.label} icon={cta.icon} onPress={cta.onPress} onInk />
              : <PrimaryButton tone="lime" icon={cta.icon} onPress={cta.onPress} disabled={cta.disabled}>{cta.label}</PrimaryButton>}
          </div>
        )}
      </div>
    </header>
  );
}

// 2) PhotoHero — full-bleed photo zone with a calm gradient fallback (never an
// empty/broken state). Top controls float in translucent round buttons.
const SAGE_FALLBACK = "linear-gradient(150deg,#cdeab0,#9ec694 55%,#7fae7e)";
export function PhotoHero({
  src, fallbackGradient = SAGE_FALLBACK, height = 280, alt = "", objectPosition, onBack, onShare, onDots, onEditPhoto,
}: {
  src?: string | null;
  fallbackGradient?: string;
  height?: number;
  alt?: string;
  // CSS object-position (the bird's stored focal point, e.g. "50% 30%") so the
  // same photo frames correctly here and on small tiles via object-fit: cover.
  objectPosition?: string;
  onBack?: () => void;
  onShare?: () => void;
  onDots?: () => void;
  // Renders a camera button bottom-right → open the photo-management sheet.
  onEditPhoto?: () => void;
}) {
  return (
    <div className="relative w-full overflow-hidden" style={{ height, background: fallbackGradient }}>
      {src ? (
        <img src={src} alt={alt} loading="eager" decoding="async" className="absolute inset-0 size-full object-cover" style={{ objectPosition: objectPosition ?? "50% 50%" }} />
      ) : (
        <div className="absolute inset-0 grid place-items-center"><Feather className="size-10 text-white/70" /></div>
      )}
      {(onBack || onShare || onDots) && (
        <div className="absolute inset-x-0 top-0 flex items-center justify-between px-3 pt-[max(env(safe-area-inset-top),12px)]">
          {onBack ? <CircleControl label="Back" onPress={onBack}><ArrowRight className="size-5 rotate-180" /></CircleControl> : <span className="size-9" />}
          <div className="flex items-center gap-2">
            {onShare && <CircleControl label="Share" onPress={onShare}><ShareGlyph /></CircleControl>}
            {onDots && <CircleControl label="More" onPress={onDots}><DotsGlyph /></CircleControl>}
          </div>
        </div>
      )}
      {onEditPhoto && (
        <button type="button" aria-label="Change photo" onClick={onEditPhoto} className="absolute bottom-3 right-3 grid size-11 place-items-center rounded-full text-white active:scale-95" style={{ background: "rgba(0,0,0,0.32)" }}>
          <Camera className="size-5" />
        </button>
      )}
    </div>
  );
}
function CircleControl({ children, label, onPress }: { children: ReactNode; label: string; onPress?: () => void }) {
  return (
    <button type="button" aria-label={label} onClick={onPress} className="grid size-9 place-items-center rounded-full text-white active:scale-95" style={{ background: "rgba(0,0,0,0.32)" }}>
      {children}
    </button>
  );
}
function ShareGlyph() { return <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5 8.6 10.5"/></svg>; }
function DotsGlyph() { return <svg viewBox="0 0 24 24" className="size-[18px]" fill="currentColor"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>; }

// 3) IconTile — the square anchor icon. Ink-with-lime by default.
type TileTone = "ink-lime" | "pale" | "amber" | "red";
const TILE: Record<TileTone, { bg: string; fg: string }> = {
  "ink-lime": { bg: "var(--ink)", fg: "var(--lime)" },
  pale: { bg: "var(--pale2)", fg: "var(--moss)" },
  amber: { bg: "var(--amber-fill)", fg: "var(--amber-ink)" },
  red: { bg: "var(--red-fill)", fg: "var(--red-deep)" },
};
export function IconTile({ icon, size = 38, tone = "ink-lime" }: { icon: ReactNode; size?: number; tone?: TileTone }) {
  const c = TILE[tone];
  return (
    <span className="grid shrink-0 place-items-center rounded-[11px]" style={{ width: size, height: size, background: c.bg, color: c.fg }}>
      {icon}
    </span>
  );
}

// 4) LimeStat — the prominent metric card (e.g. Latest weight).
export function LimeStat({ eyebrow, value, meta, action }: { eyebrow?: ReactNode; value: ReactNode; meta?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-[18px] bg-[var(--lime)] px-[18px] py-[16px]" style={{ boxShadow: "0 8px 20px -12px rgba(45,106,79,.45)" }}>
      <div className="min-w-0 flex-1">
        {eyebrow && <p className="t-eyebrow text-[var(--moss)]">{eyebrow}</p>}
        <p className="mt-0.5 text-[30px] font-[400] leading-none tracking-[-0.015em] text-[var(--ink)]">{value}</p>
        {meta && <div className="mt-1.5 flex items-center gap-2">{meta}</div>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

// 5) StatusPill — the small rounded pill.
type PillTone = "ready" | "good" | "attention" | "on" | "off" | "household";
const PILL: Record<PillTone, string> = {
  ready: "bg-[var(--pale)] text-[var(--ink)]",
  good: "bg-[var(--pale)] text-[var(--ink)]",
  attention: "bg-[var(--amber-fill)] text-[var(--amber-ink)]",
  on: "bg-[var(--ink)] text-[var(--lime)]",
  off: "bg-white text-[var(--mute)] ring-1 ring-[var(--line)]",
  household: "bg-[#dbe9ef] text-[var(--house)]",
};
export function StatusPill({ tone, children }: { tone: PillTone; children: ReactNode }) {
  return <span className={`inline-flex items-center gap-1 rounded-full px-[9px] py-[3px] text-[11.5px] font-[500] ${PILL[tone]}`}>{children}</span>;
}

// 6) SectionHead — the small header above a content block.
export function SectionHead({ title, trailing }: { title: ReactNode; trailing?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3 px-0.5">
      <h2 className="t-section">{title}</h2>
      {trailing && <div className="flex shrink-0 items-center gap-2">{trailing}</div>}
    </div>
  );
}

// 7) CtaLink — small moss text link with an arrow (lime on ink surfaces).
export function CtaLink({ label, icon, onPress, onInk }: { label: ReactNode; icon?: ReactNode; onPress?: () => void; onInk?: boolean }) {
  return (
    <button type="button" onClick={onPress} className={`inline-flex items-center gap-1 text-[13px] font-[500] active:opacity-70 ${onInk ? "text-[var(--lime)]" : "text-[var(--moss)]"}`}>
      {label} {icon ?? <ArrowRight className="size-3.5" />}
    </button>
  );
}

// 8) PrimaryButton — every primary CTA. lime-on-ink for ink contexts,
// ink-on-cream (ink fill, white text) for cream contexts.
export function PrimaryButton({
  children, tone = "ink", icon, onPress, disabled, type = "button", full = true,
}: {
  children: ReactNode;
  tone?: "lime" | "ink" | "outline";
  icon?: ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  type?: "button" | "submit";
  full?: boolean;
}) {
  const cls = tone === "lime"
    ? "bg-[var(--lime)] text-[var(--ink)]"
    : tone === "outline"
      ? "bg-white text-[var(--ink)] ring-1 ring-[var(--line)]"
      : "bg-[var(--ink)] text-white";
  return (
    <button
      type={type}
      onClick={onPress}
      disabled={disabled}
      className={`inline-flex min-h-[44px] items-center justify-center gap-2 rounded-[12px] px-[18px] py-[11px] text-[15px] font-[500] active:scale-[0.99] disabled:opacity-50 ${full ? "w-full" : ""} ${cls}`}
    >
      {icon}{children}
    </button>
  );
}

// 9) RecordRow — the standard row inside a card.
export function RecordRow({
  leading, title, subtitle, trailing, onClick, chevron, last,
}: {
  leading?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  trailing?: ReactNode;
  onClick?: () => void;
  chevron?: boolean;
  last?: boolean;
}) {
  const showChevron = chevron ?? !!onClick;
  const inner = (
    <>
      {leading && <span className="shrink-0">{leading}</span>}
      <span className="min-w-0 flex-1">
        <span className="t-item block truncate">{title}</span>
        {subtitle && <span className="t-meta mt-0.5 block truncate">{subtitle}</span>}
      </span>
      {trailing && <span className="shrink-0">{trailing}</span>}
      {showChevron && <ChevronRight className="size-4 shrink-0 text-[var(--mute2)]" />}
    </>
  );
  const cls = `flex w-full min-h-[44px] items-center gap-3 px-4 py-3 text-left ${last ? "" : "border-b border-[var(--line2)]"}`;
  return onClick
    ? <button type="button" onClick={onClick} className={`${cls} active:bg-black/[0.03]`}>{inner}</button>
    : <div className={cls}>{inner}</div>;
}

// Convenience: a plain white card surface that RecordRows sit inside.
export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`overflow-hidden rounded-[18px] bg-white ring-1 ring-[var(--line2)] ${className}`} style={{ boxShadow: "0 1px 0 rgba(40,50,40,.02), 0 6px 14px -8px rgba(40,50,40,.08)" }}>
      {children}
    </div>
  );
}
