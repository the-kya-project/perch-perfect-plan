import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { photoFrame } from "@/lib/flockPhotos";
import type { PostPhoto } from "@/lib/flockPostMedia.functions";

// Post and comment photos at their own shape (src/lib/flockPhotos.ts), and a
// full-screen viewer: tap a photo to see it whole, swipe between a post's photos.

const PLACEHOLDER = "#e7ece6";

/** One photo in a frame of its own shape. Before its size is known the frame
 *  is 4:3; the image's natural size takes over once it loads. */
export function FramedPhoto({ photo, alt, onOpen, className = "", testId }: {
  photo: PostPhoto | undefined; alt: string; onOpen?: () => void; className?: string; testId?: string;
}) {
  const [loaded, setLoaded] = useState<{ width: number; height: number } | null>(null);
  const frame = photoFrame(photo?.width && photo?.height ? photo : loaded);
  const img = photo && (
    <img src={photo.url} alt={alt} loading="lazy" decoding="async"
      onLoad={(e) => { if (!photo.width) setLoaded({ width: e.currentTarget.naturalWidth, height: e.currentTarget.naturalHeight }); }}
      onError={(e) => { if (photo.original && e.currentTarget.src !== photo.original) e.currentTarget.src = photo.original; }}
      className="absolute inset-0 size-full object-cover" style={{ objectPosition: frame.position }} />
  );
  return (
    <div className={`relative w-full overflow-hidden ${className}`} style={{ aspectRatio: String(frame.ratio), background: PLACEHOLDER }}
      data-testid={testId} data-ratio={frame.ratio.toFixed(3)} data-cropped={frame.cropped ? "true" : "false"}>
      {onOpen && photo ? (
        <button type="button" onClick={onOpen} aria-label={alt} className="absolute inset-0 size-full">{img}</button>
      ) : img}
    </div>
  );
}

/** A post's photos: one at its own shape, or several in a swipeable row at the
 *  first photo's shape (the others fit inside it, never cropped). Tap opens the
 *  full-screen viewer. */
export function PhotoGrid({ photos, count, alt }: { photos: PostPhoto[] | undefined; count: number; alt: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState<number | null>(null);
  const [index, setIndex] = useState(0);
  const rowRef = useRef<HTMLDivElement>(null);
  if (count === 0) return null;
  const items = Array.from({ length: count }, (_, i) => photos?.[i]);
  const labelOf = (i: number) => (count > 1 ? `${alt} (${i + 1}/${count})` : alt);
  const viewer = open !== null && photos?.length ? (
    <PhotoViewer photos={photos} start={open} alt={alt} onClose={() => setOpen(null)} />
  ) : null;

  if (count === 1) {
    return (
      <div className="overflow-hidden rounded-[14px]" data-testid="post-photos">
        <FramedPhoto photo={items[0]} alt={labelOf(0)} onOpen={() => setOpen(0)} testId="post-photo" />
        {viewer}
      </div>
    );
  }

  const first = photoFrame(items[0]);
  return (
    <div className="relative overflow-hidden rounded-[14px]" data-testid="post-photos">
      <div ref={rowRef} className="flex snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        onScroll={(e) => { const el = e.currentTarget; setIndex(Math.round(el.scrollLeft / Math.max(1, el.clientWidth))); }}>
        {items.map((p, i) => {
          const own = photoFrame(p);
          return (
            <div key={i} className="relative w-full shrink-0 snap-center" style={{ aspectRatio: String(first.ratio), background: PLACEHOLDER }} data-testid="post-photo"
              data-ratio={first.ratio.toFixed(3)}>
              {p && (
                <button type="button" onClick={() => setOpen(i)} aria-label={labelOf(i)} className="absolute inset-0 size-full">
                  <img src={p.url} alt={labelOf(i)} loading="lazy" decoding="async"
                    onError={(e) => { if (p.original && e.currentTarget.src !== p.original) e.currentTarget.src = p.original; }}
                    className={`absolute inset-0 size-full ${i === 0 ? "object-cover" : "object-contain"}`} style={{ objectPosition: i === 0 ? first.position : own.position }} />
                </button>
              )}
            </div>
          );
        })}
      </div>
      <span className="pointer-events-none absolute right-2.5 top-2.5 rounded-full px-2 py-0.5 text-[12px] font-[700] text-white" style={{ background: "rgba(18,41,31,.6)" }}
        data-testid="photo-count" aria-live="polite">
        {t("flock.posts.photoOf", "{{n}} of {{total}}", { n: index + 1, total: count })}
      </span>
      <div className="pointer-events-none absolute inset-x-0 bottom-2 flex justify-center gap-1.5" aria-hidden="true">
        {items.map((_, i) => <span key={i} className="size-1.5 rounded-full" style={{ background: i === index ? "#fff" : "rgba(255,255,255,.5)" }} />)}
      </div>
      {viewer}
    </div>
  );
}

/** Full screen, full size, swipe between photos; Escape or × closes. */
export function PhotoViewer({ photos, start, alt, onClose }: { photos: PostPhoto[]; start: number; alt: string; onClose: () => void }) {
  const { t } = useTranslation();
  const rowRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(start);
  useEffect(() => {
    const el = rowRef.current;
    if (el) el.scrollLeft = start * el.clientWidth;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight" && el) el.scrollBy({ left: el.clientWidth, behavior: "smooth" });
      if (e.key === "ArrowLeft" && el) el.scrollBy({ left: -el.clientWidth, behavior: "smooth" });
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [start, onClose]);
  if (typeof document === "undefined") return null;
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={alt} className="fixed inset-0 z-[80] flex flex-col bg-black" data-testid="photo-viewer">
      <div className="flex items-center justify-between px-3 pt-[max(10px,env(safe-area-inset-top))] text-white">
        <span className="text-[14px] font-[700]" data-testid="photo-viewer-count">
          {photos.length > 1 ? t("flock.posts.photoOf", "{{n}} of {{total}}", { n: index + 1, total: photos.length }) : ""}
        </span>
        <button type="button" onClick={onClose} aria-label={t("flock.region.close", "Close")} className="grid size-11 place-items-center rounded-full" data-testid="photo-viewer-close">
          <X className="size-6" aria-hidden="true" />
        </button>
      </div>
      <div ref={rowRef} className="flex flex-1 snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        onScroll={(e) => { const el = e.currentTarget; setIndex(Math.round(el.scrollLeft / Math.max(1, el.clientWidth))); }}>
        {photos.map((p, i) => (
          <div key={i} className="relative h-full w-full shrink-0 snap-center">
            <img src={p.original} alt={photos.length > 1 ? `${alt} (${i + 1}/${photos.length})` : alt} decoding="async"
              className="absolute inset-0 size-full object-contain" data-testid="photo-viewer-image" />
          </div>
        ))}
      </div>
      <div className="h-[max(14px,env(safe-area-inset-bottom))]" />
    </div>,
    document.body,
  );
}
