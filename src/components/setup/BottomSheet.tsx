// The setup screens' bottom sheet: white, rounded top, grab handle, over the
// dimmed page. Used to edit one food item, one medication, or one clip.
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";

/**
 * Bottom sheet for editing one item (a food, a medication). Rendered into <body>: inside the
 * setup shell's body it would sit under the sticky footer, which cut off its
 * bottom on phones.
 */
export function BottomSheet({ onClose, children, footer, hidden = false }: {
  onClose: () => void;
  children: React.ReactNode;
  /** Pinned under the scrolling content (e.g. a Done button). */
  footer?: React.ReactNode;
  /** Keep the content mounted but out of sight (e.g. a clip still uploading). */
  hidden?: boolean;
}) {
  const { t } = useTranslation();
  useEffect(() => {
    if (hidden) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, hidden]);
  // Keep the page behind still while the sheet is open.
  useEffect(() => {
    if (hidden) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [hidden]);
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className={`setup-frame fixed inset-0 z-[70] items-end justify-center ${hidden ? "hidden" : "flex"}`}>
      <button type="button" aria-label={t("foodEditor.closeSheet", "Close")} onClick={onClose} className="absolute inset-0 bg-[#1a3d2e]/40" />
      {/* dvh: the visible height, so the sheet fits above the phone's keyboard and browser bars. */}
      <div role="dialog" aria-modal="true" className="relative flex max-h-[88vh] w-full max-w-md flex-col overflow-hidden rounded-t-[26px] bg-white [max-height:88dvh]">
        <div className={`min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pt-3 ${footer ? "pb-5" : "pb-[max(env(safe-area-inset-bottom),24px)]"}`}>
          <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-[#d5dfd5]" />
          {children}
        </div>
        {footer && (
          <div className="shrink-0 border-t border-[#e3eae2] bg-white px-5 pb-[max(env(safe-area-inset-bottom),16px)] pt-3">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
