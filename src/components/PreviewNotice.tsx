import type { ReactNode } from "react";
import { Eye, Loader2, X } from "lucide-react";
import { K, KyaBody, KyaCard, KyaHeader, KyaHeading, KyaIconButton, KyaSecondaryButton } from "@/components/kya";
import { BrandLockup } from "@/components/BrandLogo";

// The owner's sitter-preview screens (/sit-preview/$sitId, View as your
// sitter) when there's nothing to preview: the sitter view's own chrome (forest
// header with the logo, like its link error screens) with the preview's Close
// top left and the mode line, then one white card on mist.
export function PreviewNotice({ closeLabel, onClose, mode, title, body, action, loading }: {
  closeLabel: string;
  onClose: () => void;
  /** The mode line, e.g. "Sitter preview". Omitted while it isn't known. */
  mode?: ReactNode;
  title?: ReactNode;
  body?: ReactNode;
  /** The one white secondary button, e.g. Back to Sits. */
  action?: { label: string; onClick: () => void };
  /** A short wait (resolving, or redirecting) instead of a message. */
  loading?: ReactNode;
}) {
  return (
    <div className="setup-frame min-h-[100dvh]" style={{ background: K.mist, color: K.forest }}>
      <KyaHeader>
        <div className="mt-1.5 flex min-h-[44px] items-center gap-3">
          <KyaIconButton label={closeLabel} onClick={onClose}><X className="size-5" aria-hidden="true" /></KyaIconButton>
          <BrandLockup orientation="horizontal" variant="ink" size={118} />
        </div>
        {mode && (
          <p className="m-0 mt-4 flex items-center gap-2 text-[15px] leading-[1.4]" style={{ color: K.paleGreen }}>
            <Eye className="size-4 shrink-0" aria-hidden="true" />
            <span className="min-w-0">{mode}</span>
          </p>
        )}
      </KyaHeader>
      <KyaBody>
        {loading ? (
          <div className="flex min-h-[120px] items-center justify-center gap-2 text-[15px]" style={{ color: K.quiet }} role="status">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            {loading}
          </div>
        ) : (
          <KyaCard className="p-5">
            {title && <KyaHeading size={22}>{title}</KyaHeading>}
            {body && <p className="m-0 mt-2 text-[15px] leading-[1.5]" style={{ color: K.ink }}>{body}</p>}
            {action && (
              <div className="mt-5">
                <KyaSecondaryButton className="w-full" onClick={action.onClick}>{action.label}</KyaSecondaryButton>
              </div>
            )}
          </KyaCard>
        )}
      </KyaBody>
    </div>
  );
}
