// Served from the public/ folder at the site root, so the production
// domain serves them directly (no dependency on Lovable asset hosting).
const PARROT_TEAL = "/kya_parrot_icon_teal.png";
const PARROT_WHITE = "/kya_parrot_icon_white.png";

type Variant = "light" | "dark";
type Size = "sm" | "md" | "lg";

const ICON_SIZE: Record<Size, string> = {
  sm: "size-8",
  md: "size-10",
  lg: "size-14",
};

const TITLE_SIZE: Record<Size, string> = {
  sm: "text-sm",
  md: "text-base",
  lg: "text-xl",
};

const TAGLINE_SIZE: Record<Size, string> = {
  sm: "text-[10px]",
  md: "text-[11px]",
  lg: "text-xs",
};

/**
 * Full brand lockup: parrot icon + "Parrot Care Co-Pilot" / "by The Kya Project".
 * Use variant="dark" on dark/teal surfaces (renders white icon and white text).
 */
export function BrandLogo({
  variant = "light",
  size = "md",
  showTagline = true,
  className = "",
}: {
  variant?: Variant;
  size?: Size;
  showTagline?: boolean;
  className?: string;
}) {
  const isDark = variant === "dark";
  const iconSrc = isDark ? PARROT_WHITE : PARROT_TEAL;
  const titleColor = isDark ? "text-white" : "text-sage-900";
  const taglineColor = isDark ? "text-white/75" : "text-[#5f5e5a]";

  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <img
        src={iconSrc}
        alt=""
        className={`${ICON_SIZE[size]} shrink-0 object-contain`}
      />
      <div className="leading-tight">
        <div className={`${TITLE_SIZE[size]} font-medium tracking-tight ${titleColor}`}>
          Parrot Care Co-Pilot
        </div>
        {showTagline && (
          <div className={`${TAGLINE_SIZE[size]} ${taglineColor}`}>
            by The Kya Project
          </div>
        )}
      </div>
    </div>
  );
}
