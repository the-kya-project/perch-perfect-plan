// What a page shows when its data didn't arrive: a white card with a Newsreader
// heading, one line of copy, "Try again" and, where there's somewhere to go,
// "Go back". `missing` is for a record that came back empty (deleted, or no
// longer shared with you): retrying won't change that, so it only offers the
// way back. Pages keep their normal header around this so there's always a
// way out. Pair with useLoadState / useTooLong (src/lib/useTooLong.ts).
import { useTranslation } from "react-i18next";
import { K, KyaCard, KyaHeading, KyaPrimaryButton, KyaSecondaryButton } from "@/components/kya";

export function LoadError({ onRetry, onBack, backLabel, missing, className = "" }: {
  onRetry?: () => void;
  onBack?: () => void;
  /** Label for the way back; defaults to "Go back". */
  backLabel?: string;
  /** The record isn't there (deleted, or no access): no retry. */
  missing?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();
  const back = backLabel ?? t("loadError.goBack", "Go back");
  return (
    <KyaCard className={`px-5 py-6 ${className}`}>
      <div role="alert">
        <KyaHeading size={22}>
          {missing ? t("loadError.missingTitle", "This bird isn't available") : t("loadError.title", "Couldn't load this")}
        </KyaHeading>
        <p className="m-0 mt-2 text-[15px] leading-[1.5]" style={{ color: K.ink }}>
          {missing
            ? t("loadError.missingBody", "It may have been removed, or you may no longer have access to it.")
            : t("loadError.body", "Check your connection and try again.")}
        </p>
      </div>
      <div className="mt-5 flex flex-col gap-2.5">
        {!missing && onRetry && <KyaPrimaryButton onClick={onRetry}>{t("loadError.tryAgain", "Try again")}</KyaPrimaryButton>}
        {onBack && (missing
          ? <KyaPrimaryButton onClick={onBack}>{back}</KyaPrimaryButton>
          : <KyaSecondaryButton className="w-full" onClick={onBack}>{back}</KyaSecondaryButton>)}
      </div>
    </KyaCard>
  );
}

/** Placeholder rows while a list loads (same look as Home's skeleton). */
export function ListSkeleton({ rows = 2 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-[20px] bg-white p-3">
          <div className="size-[52px] shrink-0 animate-pulse rounded-[14px] bg-[#e3ebe2]" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-1/3 animate-pulse rounded bg-[#e3ebe2]" />
            <div className="h-3 w-1/4 animate-pulse rounded bg-[#e3ebe2]" />
          </div>
        </div>
      ))}
    </div>
  );
}
