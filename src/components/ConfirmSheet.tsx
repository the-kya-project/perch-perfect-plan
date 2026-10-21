// The one confirm step for destructive actions (delete, remove, discard). It
// replaces the browser's confirm(): a standard sheet with a Newsreader title,
// one line of explanation, a red button for the destructive action, and a
// white "Keep" / "Cancel" that backs out.
//
//   const { confirm, sheet } = useConfirm();
//   ...
//   if (!(await confirm({ title: "Delete this entry?", body: "This can't be undone.", confirmLabel: "Delete" }))) return;
//   ...
//   return <>{...}{sheet}</>;
import { useCallback, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { K, KyaHeading, KyaSecondaryButton, KyaSheet } from "@/components/kya";

export type ConfirmOptions = {
  title: ReactNode;
  /** One line saying what happens. */
  body?: ReactNode;
  /** The destructive action, e.g. "Delete". */
  confirmLabel: string;
  /** Defaults to "Cancel". Use "Keep" when backing out keeps something. */
  cancelLabel?: string;
};

/** Red pill for the destructive choice: same size as the sunflower main button. */
function DestructiveButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex min-h-[52px] w-full items-center justify-center rounded-full border-2 px-6 text-[16px] font-[700] text-white active:scale-[0.99]"
      style={{ background: K.red, borderColor: K.red }}
    >
      {children}
    </button>
  );
}

export function ConfirmSheet({ open, options, onAnswer }: { open: boolean; options: ConfirmOptions | null; onAnswer: (yes: boolean) => void }) {
  const { t } = useTranslation();
  if (!open || !options) return null;
  return (
    <KyaSheet
      onClose={() => onAnswer(false)}
      closeLabel={t("confirmSheet.close", "Close")}
      title={<KyaHeading size={24}>{options.title}</KyaHeading>}
    >
      {options.body && <p className="m-0 text-[15px] leading-[1.5]" style={{ color: K.quiet }}>{options.body}</p>}
      <div className="mt-4 flex flex-col gap-2.5">
        <DestructiveButton onClick={() => onAnswer(true)}>{options.confirmLabel}</DestructiveButton>
        <KyaSecondaryButton className="w-full" onClick={() => onAnswer(false)}>
          {options.cancelLabel ?? t("confirmSheet.cancel", "Cancel")}
        </KyaSecondaryButton>
      </div>
    </KyaSheet>
  );
}

/** `confirm(options)` resolves true for the destructive choice, false otherwise. Render `sheet`. */
export function useConfirm() {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((yes: boolean) => void) | null>(null);
  const confirm = useCallback((opts: ConfirmOptions) => {
    resolver.current?.(false);
    setOptions(opts);
    return new Promise<boolean>((resolve) => { resolver.current = resolve; });
  }, []);
  const answer = useCallback((yes: boolean) => {
    resolver.current?.(yes);
    resolver.current = null;
    setOptions(null);
  }, []);
  const sheet = <ConfirmSheet open={!!options} options={options} onAnswer={answer} />;
  return { confirm, sheet };
}
