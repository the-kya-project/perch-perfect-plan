import { useEffect, useId, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "@tanstack/react-router";
import { Sprout, GraduationCap, HandHeart, ChevronRight, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { K, KyaHeading, isTopmostDialog } from "@/components/kya";
import { FLOCK_SPACES, type FlockSpace } from "@/lib/flockNav";

export function spaceLabel(t: TFunction, s: FlockSpace): string {
  switch (s) {
    case "start": return t("flock.space.start", "Start here");
    case "learn": return t("flock.space.learn", "Learn together");
    case "good": return t("flock.space.good", "Do good");
  }
}

function spaceLine(t: TFunction, s: FlockSpace): string {
  switch (s) {
    case "start": return t("flock.space.startLine", "New to the Flock? Introductions, first questions, and finding your feet.");
    case "learn": return t("flock.space.learnLine", "Questions, guides, and what members are working out with their birds.");
    case "good": return t("flock.space.goodLine", "Rescue, conservation, and ways to help parrots beyond your own home.");
  }
}

const SPACE_ICONS = { start: Sprout, learn: GraduationCap, good: HandHeart } as const;

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';
/** How far a downward drag has to go before the sheet closes. */
const SWIPE_CLOSE_PX = 80;

/**
 * The three spaces, as a bottom sheet in the app's look (white, 26px top
 * corners, grab handle, round Close). Picking one opens Today filtered to it.
 * A real dialog: focus moves in and stays in (Tab wraps), Escape closes, and
 * so does a swipe down or a tap on the dimmed page. FlockShell puts focus back
 * on the Spaces button afterwards.
 */
export function SpacesSheet({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const [dragY, setDragY] = useState(0);
  const drag = useRef<{ startY: number; pointerId: number } | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    // Focus the first space, so Enter picks it and screen readers start there.
    dialog?.querySelector<HTMLElement>("[data-space]")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (!isTopmostDialog(dialogRef.current)) return;
      if (e.key === "Escape") { e.preventDefault(); onClose(); return; }
      if (e.key !== "Tab" || !dialog) return;
      const items = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !dialog.contains(active))) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (active === last || !dialog.contains(active))) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  const pick = (space: FlockSpace) => {
    onClose();
    void navigate({ to: "/flock", search: { space } });
  };

  // Swipe down to close, from the handle and title area.
  const onPointerDown = (e: ReactPointerEvent) => {
    drag.current = { startY: e.clientY, pointerId: e.pointerId };
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: ReactPointerEvent) => {
    if (!drag.current || drag.current.pointerId !== e.pointerId) return;
    setDragY(Math.max(0, e.clientY - drag.current.startY));
  };
  const onPointerEnd = (e: ReactPointerEvent) => {
    if (!drag.current || drag.current.pointerId !== e.pointerId) return;
    const moved = e.clientY - drag.current.startY;
    drag.current = null;
    if (moved > SWIPE_CLOSE_PX) onClose();
    else setDragY(0);
  };

  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="setup-frame fixed inset-0 z-[70] flex items-end justify-center">
      <button type="button" aria-label={t("flock.spaces.close", "Close")} tabIndex={-1} onClick={onClose} className="absolute inset-0 bg-black/50" />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-testid="spaces-sheet"
        className="relative flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-t-[26px] bg-white [max-height:90dvh]"
        style={{ color: K.forest, transform: dragY ? `translateY(${dragY}px)` : undefined, transition: drag.current ? undefined : "transform 160ms ease-out" }}
      >
        <div
          className="touch-none px-5 pt-2.5"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
          data-testid="spaces-sheet-handle"
        >
          <div className="mx-auto h-1 w-10 rounded-full bg-[#d5dfd5]" />
          <div className="mt-2 flex items-start gap-3">
            <div className="min-w-0 flex-1 pt-2">
              <KyaHeading as="h2" size={23}><span id={titleId}>{t("flock.spaces.title", "Spaces")}</span></KyaHeading>
              <p className="m-0 mt-1 text-[15px] leading-[1.5]" style={{ color: K.quiet }}>
                {t("flock.spaces.intro", "Pick a space and Today shows just that corner of the Flock.")}
              </p>
            </div>
            <button type="button" aria-label={t("flock.spaces.close", "Close")} onClick={onClose} className="grid size-11 shrink-0 place-items-center rounded-full active:scale-95" style={{ background: K.mist, color: K.forest }}>
              <X className="size-5" aria-hidden="true" />
            </button>
          </div>
        </div>
        <ul className="m-0 flex list-none flex-col gap-2.5 overflow-y-auto overscroll-contain px-5 pb-[max(env(safe-area-inset-bottom),24px)] pt-4">
          {FLOCK_SPACES.map((s) => {
            const Icon = SPACE_ICONS[s];
            return (
              <li key={s}>
                <button
                  type="button"
                  data-space={s}
                  onClick={() => pick(s)}
                  className="flex min-h-[64px] w-full items-center gap-3 rounded-[18px] px-4 py-3 text-left active:scale-[0.99]"
                  style={{ background: K.mist }}
                >
                  <span className="grid size-10 shrink-0 place-items-center rounded-full" style={{ background: K.lime, color: K.forest }}>
                    <Icon className="size-5" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[16px] font-[700]">{spaceLabel(t, s)}</span>
                    <span className="block text-[14px] leading-[1.4]" style={{ color: K.quiet }}>{spaceLine(t, s)}</span>
                  </span>
                  <ChevronRight className="size-5 shrink-0" style={{ color: K.moss }} aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>,
    document.body,
  );
}
