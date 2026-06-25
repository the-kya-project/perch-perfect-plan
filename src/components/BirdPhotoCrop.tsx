// The SINGLE source of truth for rendering a bird photo cropped to its stored
// focal point. Every flock / foster / thumbnail tile AND the reposition tool's
// "Flock card" preview render through this, so "what your card will look like"
// is literally the same pixels the card draws.
//
// The parent MUST be `position: relative; overflow: hidden` and sized (fixed
// px or aspect-ratio). The crop is object-fit: cover + object-position = the
// focal point (a CSS "X% Y%" string), identical to the bird-record hero.
//
// IMPORTANT: callers must feed this the SAME signed image URL across surfaces.
// A smaller Supabase width-transform (e.g. 256px) was observed to crop to a
// different effective aspect than the 800px the hero/preview use, so the tile
// diverged from the preview. Resolve tile photos at the same width the
// reposition preview uses.
export function BirdPhotoCrop({
  url,
  original,
  position,
  alt = "",
  eager = false,
}: {
  url: string;
  original?: string | null;
  position?: string | null;
  alt?: string;
  eager?: boolean;
}) {
  return (
    <img
      src={url}
      alt={alt}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      onError={(e) => {
        if (original && e.currentTarget.src !== original) e.currentTarget.src = original;
      }}
      style={{ objectPosition: position ?? "50% 50%" }}
      className="absolute inset-0 block size-full object-cover"
    />
  );
}
