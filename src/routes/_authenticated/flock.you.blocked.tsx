import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { UserX } from "lucide-react";
import { useTranslation } from "react-i18next";
import { K, KyaCard } from "@/components/kya";
import { FlockSubPage } from "@/components/flock/FlockSubPage";
import { FlockEmpty } from "@/components/flock/FlockChips";
import { FlockAvatar } from "@/components/flock/FlockPeople";
import { ConfirmSheet } from "@/components/flock/PostParts";
import { useAvatarUrls } from "@/lib/flockData";
import { blockName, unblockMember, useInvalidateAfterBlock, useMyBlocks, type BlockedMember } from "@/lib/flockBlocks";

// Blocked members: who you've blocked, and Unblock. Only your own blocks
// (flock_my_blocks); nobody can see who blocked them.
export const Route = createFileRoute("/_authenticated/flock/you/blocked")({
  component: FlockBlocked,
});

function FlockBlocked() {
  const { t } = useTranslation();
  const { data: blocks, isLoading } = useMyBlocks();
  const { data: urls } = useAvatarUrls((blocks ?? []).map((b) => b.photo_path));
  const invalidate = useInvalidateAfterBlock();
  const [confirmFor, setConfirmFor] = useState<BlockedMember | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const list = blocks ?? [];
  return (
    <FlockSubPage title={t("flock.blocked.title", "Blocked members")}
      line={t("flock.blocked.line", "You and the people you block don't see each other's posts, comments, journeys or profile in the Flock. They aren't told.")}
      fallback="/flock/you">
      {!isLoading && list.length === 0 ? (
        <FlockEmpty icon={<UserX className="size-6" />} title={t("flock.blocked.emptyTitle", "No one is blocked")}>
          {t("flock.blocked.empty", "You can block someone from the menu on their post, comment, journey or profile.")}
        </FlockEmpty>
      ) : (
        <KyaCard className="overflow-hidden p-0">
          <ul className="m-0 flex list-none flex-col p-0" data-testid="blocked-list">
            {list.map((b, i) => (
              <li key={b.user_id} className="flex min-h-[64px] items-center gap-3 px-4 py-2.5" style={{ borderTop: i ? `1px solid ${K.line}` : undefined }} data-blocked={b.user_id}>
                <FlockAvatar name={blockName(t, b.display_name)} url={b.photo_path ? urls?.get(b.photo_path) : null} size={40} />
                <span className="min-w-0 flex-1 truncate text-[15.5px] font-[700]" style={{ color: K.forest }}>{blockName(t, b.display_name)}</span>
                <button type="button" onClick={() => setConfirmFor(b)} data-testid="unblock"
                  className="min-h-[40px] shrink-0 rounded-full px-4 text-[14px] font-[700]" style={{ background: K.mist, color: K.forest }}>
                  {t("flock.blocked.unblock", "Unblock")}
                </button>
              </li>
            ))}
          </ul>
        </KyaCard>
      )}
      {confirmFor && (
        <ConfirmSheet busy={busy} onClose={() => { setConfirmFor(null); setError(null); }}
          title={t("flock.blocked.confirmTitle", "Unblock {{name}}?", { name: blockName(t, confirmFor.display_name) })}
          line={error ?? t("flock.blocked.confirmLine", "You'll see each other's posts, comments and journeys in the Flock again, unless they've blocked you too. They won't be told.")}
          confirm={t("flock.blocked.unblock", "Unblock")}
          onConfirm={async () => {
            setBusy(true); setError(null);
            try { await unblockMember(confirmFor.user_id); await invalidate(); setConfirmFor(null); }
            catch { setError(t("flock.block.error", "That didn't go through. Try again.")); }
            finally { setBusy(false); }
          }} />
      )}
    </FlockSubPage>
  );
}
