// The four header types every owner screen uses (the sitter view is separate):
//   TabHeader  — Home, Sits, Health, Explore: logo + help/bell/account, title.
//   PageHeader — anything opened from a tab: back top left, at most one
//                labeled action pill top right, title naming the bird.
//   TaskHeader — something you do and finish: Close top left, progress top
//                right, no bottom nav, one pinned button (TaskFooter).
//   Sheets use KyaSheet (components/kya.tsx).
import { useCallback, useState, type ReactNode } from "react";
import { useCanGoBack, useRouter } from "@tanstack/react-router";
import { ArrowLeft, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { K, KyaHeader, KyaHeading, KyaIconButton, KyaPrimaryButton, KyaSecondaryButton, KyaSheet } from "@/components/kya";
import { BrandLockup } from "@/components/BrandLogo";
import { OwnerHeaderIcons } from "@/components/OwnerHeader";

/** Back in history, or to `fallback` when there's none (deep link, push). */
export function useGoBack(fallback: () => void) {
  const router = useRouter();
  const canGoBack = useCanGoBack();
  return useCallback(() => (canGoBack ? router.history.back() : fallback()), [canGoBack, router, fallback]);
}

/** 1 · Tab home header. */
export function TabHeader({ title, line, children }: { title: ReactNode; line?: ReactNode; children?: ReactNode }) {
  return (
    <KyaHeader>
      <div className="mt-1.5 flex items-center gap-2">
        <BrandLockup orientation="horizontal" variant="ink" size={118} />
        <div className="flex-1" />
        <OwnerHeaderIcons />
      </div>
      <KyaHeading as="h1" size={31} className="mt-9 text-white">{title}</KyaHeading>
      {line && <p className="m-0 mt-2 text-[15px] leading-[1.5]" style={{ color: K.paleGreen }}>{line}</p>}
      {children}
    </KyaHeader>
  );
}

export type HeaderAction = { label: string; icon?: ReactNode; onClick: () => void; disabled?: boolean };

/** The one labeled action pill a page header may carry (darker forest). */
export function HeaderPill({ action }: { action: HeaderAction }) {
  return (
    <button
      type="button"
      onClick={action.onClick}
      disabled={action.disabled}
      className="inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-full px-4 text-[15px] font-[700] text-white active:scale-95 disabled:opacity-50"
      style={{ background: K.forestDeep }}
    >
      {action.icon}{action.label}
    </button>
  );
}

/** 2 · Page header: back top left, optional action pill top right. */
export function PageHeader({ title, line, onBack, action, children, titleSize = 30 }: {
  title: ReactNode;
  line?: ReactNode;
  onBack: () => void;
  action?: HeaderAction;
  children?: ReactNode;
  titleSize?: number;
}) {
  const { t } = useTranslation();
  return (
    <KyaHeader>
      <div className="mt-1.5 flex items-center justify-between gap-3">
        <KyaIconButton label={t("headers.back", "Back")} onClick={onBack}><ArrowLeft className="size-5" /></KyaIconButton>
        {action && <HeaderPill action={action} />}
      </div>
      <KyaHeading as="h1" size={titleSize} className="mt-5 text-white">{title}</KyaHeading>
      {line && <p className="m-0 mt-2 text-[15px] leading-[1.5]" style={{ color: K.paleGreen }}>{line}</p>}
      {children}
    </KyaHeader>
  );
}

/** 3 · Task header: Close top left, progress top right (+ bar). */
export function TaskHeader({ title, line, onClose, progress, children }: {
  title: ReactNode;
  line?: ReactNode;
  onClose: () => void;
  /** e.g. { label: "3 of 10 answered", value: 0.3 }. The bar shows when value is set. */
  progress?: { label: ReactNode; value?: number };
  children?: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <KyaHeader>
      <div className="mt-1.5 flex items-center justify-between gap-3">
        <KyaIconButton label={t("headers.close", "Close")} onClick={onClose}><X className="size-5" /></KyaIconButton>
        {progress && <span className="text-[14px] font-[700]" style={{ color: K.lime }}>{progress.label}</span>}
      </div>
      <KyaHeading as="h1" size={30} className="mt-5 text-white">{title}</KyaHeading>
      {line && <p className="m-0 mt-2 text-[15px] leading-[1.5]" style={{ color: K.paleGreen }}>{line}</p>}
      {progress?.value !== undefined && (
        <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full" style={{ background: "rgba(255,255,255,0.18)" }} aria-hidden="true">
          <div className="h-full rounded-full transition-[width]" style={{ width: `${Math.round(Math.max(0, Math.min(1, progress.value)) * 100)}%`, background: K.lime }} />
        </div>
      )}
      {children}
    </KyaHeader>
  );
}

/** The white footer pinned to the bottom of a task, holding one main button. */
export function TaskFooter({ children }: { children: ReactNode }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-white pb-[max(env(safe-area-inset-bottom),12px)] pt-3" style={{ borderColor: K.line }}>
      <div className="mx-auto max-w-md px-4">{children}</div>
    </div>
  );
}

/** Room at the end of a task's content so the pinned footer never covers it. */
export const TASK_FOOTER_SPACE = "pb-[calc(env(safe-area-inset-bottom)+104px)]";

/**
 * Close for a task: leaves straight away when nothing has changed, else asks
 * "Leave without saving?". Render `guard` somewhere in the task.
 */
export function useLeaveGuard(dirty: boolean, leave: () => void) {
  const { t } = useTranslation();
  const [asking, setAsking] = useState(false);
  const requestClose = useCallback(() => (dirty ? setAsking(true) : leave()), [dirty, leave]);
  const guard = asking ? (
    <KyaSheet
      onClose={() => setAsking(false)}
      closeLabel={t("headers.close", "Close")}
      title={<KyaHeading size={24}>{t("headers.leaveTitle", "Leave without saving?")}</KyaHeading>}
    >
      <p className="m-0 text-[15px] leading-[1.5]" style={{ color: K.quiet }}>{t("headers.leaveBody", "What you've entered so far won't be kept.")}</p>
      <div className="mt-4 flex flex-col gap-2.5">
        <KyaPrimaryButton onClick={() => setAsking(false)}>{t("headers.keepGoing", "Keep going")}</KyaPrimaryButton>
        <KyaSecondaryButton className="w-full" onClick={() => { setAsking(false); leave(); }}>{t("headers.leave", "Leave")}</KyaSecondaryButton>
      </div>
    </KyaSheet>
  ) : null;
  return { requestClose, guard };
}
