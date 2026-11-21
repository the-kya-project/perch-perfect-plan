import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ConfirmSheet } from "@/components/flock/PostParts";
import { blockMember, blockName, useInvalidateAfterBlock } from "@/lib/flockBlocks";

/** "Block {name}?": a short, calm confirmation. The other person is never told. */
export function BlockSheet({ userId, name, onClose, onBlocked }: {
  userId: string; name: string | null | undefined; onClose: () => void; onBlocked?: () => void;
}) {
  const { t } = useTranslation();
  const invalidate = useInvalidateAfterBlock();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const who = blockName(t, name);
  return (
    <ConfirmSheet busy={busy} onClose={onClose}
      title={t("flock.block.title", "Block {{name}}?", { name: who })}
      line={error ?? t("flock.block.line", "You won't see each other's posts, comments, journeys or profile in the Flock. They won't be told. You can unblock them any time in Flock settings.")}
      confirm={t("flock.block.confirm", "Block")}
      onConfirm={async () => {
        setBusy(true); setError(null);
        try { await blockMember(userId); await invalidate(); onBlocked?.(); onClose(); }
        catch { setError(t("flock.block.error", "That didn't go through. Try again.")); }
        finally { setBusy(false); }
      }} />
  );
}
