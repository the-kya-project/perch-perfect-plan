import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { K, KyaHeading, KyaPrimaryButton, KyaSheet } from "@/components/kya";
import { REPORT_REASONS, report, useInvalidateModeration, type ReportReason, type ReportSubject } from "@/lib/flockModeration";
import { blockMember, blockName, useInvalidateAfterBlock } from "@/lib/flockBlocks";

export function reasonLabel(t: TFunction, r: ReportReason): string {
  switch (r) {
    case "unkind": return t("flock.report.unkind", "Unkind or harassing");
    case "unsafe": return t("flock.report.unsafe", "Unsafe advice for birds");
    case "spam": return t("flock.report.spam", "Spam or selling");
    case "other": return t("flock.report.other", "Something else");
  }
}

/** Report a post, comment, journey update or member skill: a reason, an optional note.
 *  With `alsoBlock` ("Block and report"), the report goes first, then the
 *  block, so the report never depends on the block. */
export function ReportSheet({ type, id, onClose, alsoBlock, onBlocked }: {
  type: ReportSubject; id: string; onClose: () => void;
  alsoBlock?: { userId: string; name: string | null | undefined }; onBlocked?: () => void;
}) {
  const { t } = useTranslation();
  const invalidate = useInvalidateModeration();
  const invalidateBlocks = useInvalidateAfterBlock();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const send = async () => {
    if (!reason) return;
    setBusy(true);
    setError(null);
    try {
      await report(type, id, reason, note);
      if (alsoBlock) { await blockMember(alsoBlock.userId); void invalidateBlocks(); }
      setDone(true); void invalidate();
    }
    catch { setError(t("flock.report.error", "We couldn't send that. Try again.")); }
    finally { setBusy(false); }
  };
  const close = () => { if (done && alsoBlock) onBlocked?.(); onClose(); };
  const title = alsoBlock ? t("flock.block.reportTitle", "Block and report")
    : type === "comment" ? t("flock.report.titleComment", "Report this comment")
    : type === "journey_update" ? t("flock.report.titleUpdate", "Report this update")
    : type === "journey" ? t("flock.report.titleSkill", "Report this skill")
    : t("flock.report.titlePost", "Report this post");
  return (
    <KyaSheet onClose={close} closeLabel={t("flock.region.close", "Close")} title={<KyaHeading size={23}>{done ? t("flock.report.thanksTitle", "Thanks for telling us") : title}</KyaHeading>}>
      {done ? (
        <div className="flex flex-col gap-4" data-testid="report-done">
          <p className="m-0 text-[15px] leading-[1.5]" style={{ color: K.ink }}>
            {alsoBlock
              ? t("flock.block.reportThanks", "We'll take a look. You've also blocked {{name}}, so you won't see each other in the Flock. Neither the report nor the block is shown to them.", { name: blockName(t, alsoBlock.name) })
              : t("flock.report.thanks", "We'll take a look. Your report is private: the person who posted it won't know it was you.")}
          </p>
          <KyaPrimaryButton onClick={close}>{t("flock.report.close", "Done")}</KyaPrimaryButton>
        </div>
      ) : (
        <div className="flex flex-col gap-3" data-testid="report-sheet">
          <p className="m-0 text-[14px]" style={{ color: K.quiet }}>{t("flock.report.why", "What's wrong with it?")}</p>
          <div role="radiogroup" aria-label={t("flock.report.why", "What's wrong with it?")} className="flex flex-col gap-2">
            {REPORT_REASONS.map((r) => (
              <button key={r} type="button" role="radio" aria-checked={reason === r} data-reason={r} onClick={() => setReason(r)}
                className="flex min-h-[52px] items-center rounded-[14px] px-4 text-left text-[16px] font-[700]"
                style={reason === r ? { background: K.lime, border: `2px solid ${K.forest}`, color: K.forest } : { background: K.mist, border: "2px solid transparent", color: K.forest }}>
                {reasonLabel(t, r)}
              </button>
            ))}
          </div>
          <label className="flex flex-col gap-1.5 text-[14px] font-[700]" style={{ color: K.forest }}>
            {t("flock.report.noteLabel", "Anything we should know? (optional)")}
            <textarea value={note} maxLength={500} rows={3} onChange={(e) => setNote(e.target.value)} data-testid="report-note"
              className="resize-none rounded-[14px] border p-3 text-[15px] font-normal outline-none" style={{ borderColor: "#c9d3c8" }} />
          </label>
          {error && <p role="alert" className="m-0 text-[14px]" style={{ color: K.red }}>{error}</p>}
          <KyaPrimaryButton onClick={() => void send()} disabled={!reason || busy}>
            {busy ? t("flock.report.sending", "Sending…") : alsoBlock ? t("flock.block.reportSend", "Report and block") : t("flock.report.send", "Send report")}
          </KyaPrimaryButton>
        </div>
      )}
    </KyaSheet>
  );
}
