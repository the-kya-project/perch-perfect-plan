// The setup screens' bottom sheet: white, rounded top, grab handle, over the
// dimmed page. Used to edit one food item or one medication at a time.
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";

/**
 * Bottom sheet for editing one item (a food, a medication). Rendered into <body>: inside the
 * setup shell's body it would sit under the sticky footer, which cut off its
 * bottom on phones.
 */
export function BottomSheet({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  const { t } = useTranslation();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  // Keep the page behind still while the sheet is open.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="setup-frame fixed inset-0 z-[70] flex items-end justify-center">
      <button type="button" aria-label={t("foodEditor.closeSheet", "Close")} onClick={onClose} className="absolute inset-0 bg-[#1a3d2e]/40" />
      {/* dvh: the visible height, so the sheet fits above the phone's keyboard and browser bars. */}
      <div role="dialog" aria-modal="true" className="relative max-h-[88vh] w-full max-w-md overflow-y-auto overscroll-contain rounded-t-[26px] bg-white px-5 pb-[max(env(safe-area-inset-bottom),24px)] pt-3 [max-height:88dvh]">
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-[#d5dfd5]" />
        {children}
      </div>
    </div>,
    document.body,
  );
}
