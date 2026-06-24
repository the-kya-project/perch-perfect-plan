// Kya & Co. brand components — the ONLY way the brand renders in the app.
// No ad-hoc <img> tags pointing at /brand/*, no recreating the wordmark in
// HTML/CSS. The serif typography lives inside the SVG assets; the rest of
// the interface stays sans (Inter) per the visual system.

type MarkVariant = "cream" | "white" | "ink" | "lime";
type LockupVariant = "cream" | "ink" | "transparent";
type LockupOrientation = "horizontal" | "stacked";

const MARK_SRC: Record<MarkVariant, string> = {
  cream: "/brand/parrot-cream.svg",
  white: "/brand/parrot-white.svg",
  ink: "/brand/parrot-ink.svg",
  lime: "/brand/parrot-lime.svg",
};

function lockupSrc(orientation: LockupOrientation, variant: LockupVariant): string {
  return `/brand/lockups/${orientation}-${variant}.svg`;
}

// Just the parrot illustration — used wherever a single mark is appropriate
// (icon-only headers, tight badges). Pick a variant whose tone reads against
// the surrounding background: "ink" on cream/light, "lime"/"cream" on ink.
export function BrandMark({
  variant = "ink",
  size = 40,
  className = "",
  alt = "",
}: {
  variant?: MarkVariant;
  size?: number;
  className?: string;
  alt?: string;
}) {
  return (
    <img
      src={MARK_SRC[variant]}
      width={size}
      height={size}
      alt={alt}
      className={`shrink-0 ${className}`}
      style={{ width: size, height: size }}
    />
  );
}

// Full lockup: parrot + "Kya & Co." wordmark + "by The Kya Project" attribution.
// `orientation` picks horizontal (header use) or stacked (hero/splash use);
// `variant` picks the SVG variant matched to the surface (cream on light,
// ink on cream-light, transparent over imagery). `size` is the width in
// pixels — the SVG's intrinsic aspect ratio handles height.
export function BrandLockup({
  orientation = "horizontal",
  variant = "ink",
  size = 200,
  className = "",
  alt = "Kya & Co.",
}: {
  orientation?: LockupOrientation;
  variant?: LockupVariant;
  size?: number;
  className?: string;
  alt?: string;
}) {
  return (
    <img
      src={lockupSrc(orientation, variant)}
      width={size}
      alt={alt}
      className={`shrink-0 ${className}`}
      style={{ width: size, height: "auto" }}
    />
  );
}

// ---------------------------------------------------------------------------
// Back-compat: the older BrandLogo component (variant: "light"|"dark", size:
// "sm"|"md"|"lg") was used in OwnerOnboarding and a few other places. Map it
// onto BrandLockup so nothing breaks while we sweep callers over to the new
// API. New code should import BrandMark/BrandLockup directly and stop using
// this default export.
type LegacyVariant = "light" | "dark";
type LegacySize = "sm" | "md" | "lg";
const LEGACY_WIDTH: Record<LegacySize, number> = { sm: 180, md: 220, lg: 280 };

export function BrandLogo({
  variant = "light",
  size = "md",
  className = "",
}: {
  variant?: LegacyVariant;
  size?: LegacySize;
  showTagline?: boolean; // accepted for back-compat; the SVG always carries the attribution
  className?: string;
}) {
  return (
    <BrandLockup
      orientation="horizontal"
      variant={variant === "dark" ? "transparent" : "ink"}
      size={LEGACY_WIDTH[size]}
      className={className}
    />
  );
}
