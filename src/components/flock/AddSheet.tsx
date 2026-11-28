import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { K, KyaHeading, isTopmostDialog } from "@/components/kya";

/**
 * Add something, from the bar's gold center button (backlog CR1): the sheet
 * in the app's look (white, 26px top corners, grab handle, round Close). Its
 * rows (Weigh & check, Post to the community, Post a journey update) come in
 * CR6; until then it's the empty sheet. A real dialog: focus moves in and
 * stays in, Escape and a tap on the dimmed page close it, and FlockShell puts
 * focus back on the button afterwards.
 */
export function AddSheet({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (!isTopmostDialog(dialogRef.current)) return;
      if (e.key === "Escape") { e.preventDefault(); onClose(); return; }
      // One focusable control for now, so Tab stays on it.
      if (e.key === "Tab") { e.preventDefault(); closeRef.current?.focus(); }
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="setup-frame fixed inset-0 z-[70] flex items-end justify-center">
      <button type="button" aria-label={t("flock.add.close", "Close")} tabIndex={-1} onClick={onClose} className="absolute inset-0 bg-black/50" />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-testid="add-sheet"
        className="relative flex w-full max-w-md flex-col overflow-hidden rounded-t-[26px] bg-white px-5 pb-[max(env(safe-area-inset-bottom),24px)] pt-2.5"
        style={{ color: K.forest }}
      >
        <div className="mx-auto h-1 w-10 rounded-full bg-[#d5dfd5]" />
        <div className="mt-2 flex items-center gap-3">
          <KyaHeading as="h2" size={23} className="min-w-0 flex-1"><span id={titleId}>{t("flock.add.title", "Add something")}</span></KyaHeading>
          <button ref={closeRef} type="button" aria-label={t("flock.add.close", "Close")} onClick={onClose} className="grid size-11 shrink-0 place-items-center rounded-full active:scale-95" style={{ background: K.mist, color: K.forest }}>
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
