import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { K, KyaHeading, KyaSheet } from "@/components/kya";
import { FLAG_REASONS, report, useInvalidateModeration, type FlagReason, type ReportReason, type ReportSubject } from "@/lib/flockModeration";
import { blockName } from "@/lib/flockBlocks";

// Flagging (approved mockups docs/mockups/flock-guidelines-agreement/ 04–06;
// Brittany chose "flag" over "report", Nov 28, 2026). One options sheet opens
// from every ··· on a post, comment, journey update or member skill:
//   - someone else's: "Flag this …" and "Block [name]", then Cancel (04);
//   - your own: Edit and Delete, then Cancel.
// "Flag this …" opens the flag sheet: a reason, an optional note, "Send to the
// Kya team" (05), then "Thanks for looking out" (06). Built on KyaSheet, the
// app's bottom sheet. Replaces the old report menu and ReportSheet.

const MUTED = "#3d4f45";
const BORDER = "#d5dfd5";

/** Every stored reason's name, for the review queue (old reasons included). */
export function reasonLabel(t: TFunction, r: ReportReason): string {
  switch (r) {
    case "harmful": return t("flock.flag.harmful", "Harmful or unkind");
    case "care_standards": return t("flock.flag.careStandards", "Goes against Kya care standards");
    case "spam": return t("flock.flag.spam", "Spam or selling");
    case "other": return t("flock.flag.other", "Something else");
    case "unkind": return t("flock.report.unkind", "Unkind or harassing");
    case "unsafe": return t("flock.report.unsafe", "Unsafe advice for birds");
  }
}

function reasonLine(t: TFunction, r: FlagReason): string {
  switch (r) {
    case "harmful": return t("flock.flag.harmfulLine", "Harassment, hateful content, or harm to an animal.");
    case "care_standards": return t("flock.flag.careStandardsLine", "Like a seed-only diet, clipping, a cage that looks too small, or punishment-based training.");
    case "spam": return t("flock.flag.spamLine", "Ads, affiliate links, or selling or trading birds.");
    case "other": return t("flock.flag.otherLine", "Tell us a little in the note below.");
  }
}

function flagThis(t: TFunction, type: ReportSubject): string {
  switch (type) {
    case "post": return t("flock.flag.thisPost", "Flag this post");
    case "comment": return t("flock.flag.thisComment", "Flag this comment");
    case "journey_update": return t("flock.flag.thisUpdate", "Flag this update");
    case "journey": return t("flock.flag.thisSkill", "Flag this skill");
  }
}

const FlagIcon = () => (
  <svg aria-hidden="true" width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={K.moss} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
    <path d="M5 21V4" /><path d="M5 4h11l-2 4 2 4H5" />
  </svg>
);
const BlockIcon = () => (
  <svg aria-hidden="true" width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={K.moss} strokeWidth={1.8} strokeLinecap="round" className="shrink-0">
    <circle cx="12" cy="12" r="8" /><path d="M6.5 6.5l11 11" />
  </svg>
);

function OptionRow({ action, icon, title, line, danger, onClick }: {
  action: string; icon?: ReactNode; title: string; line?: string; danger?: boolean; onClick: () => void;
}) {
  return (
    <button type="button" data-action={action} onClick={onClick}
      className={`flex min-h-[52px] w-full items-center gap-3.5 rounded-[14px] px-4 py-3.5 text-left active:scale-[0.99] ${icon ? "" : "justify-center"}`}
      style={{ background: K.mist, color: danger ? K.red : K.forest }}>
      {icon}
      <span className="flex flex-col gap-0.5">
        <span className="text-[16px] font-[700]">{title}</span>
        {line && <span className="text-[13px] leading-[1.4]" style={{ color: MUTED }}>{line}</span>}
      </span>
    </button>
  );
}

/** The ··· sheet. `mine`: Edit (when `onEdit` is given) and Delete. Otherwise
 *  Flag (when `onFlag` is given) and Block (when `onBlock` is given). */
export function ContentOptionsSheet({ type, mine, authorName, onEdit, onDelete, onFlag, onBlock, onClose }: {
  type: ReportSubject; mine: boolean; authorName: string | null | undefined;
  onEdit?: () => void; onDelete?: () => void; onFlag?: () => void; onBlock?: () => void; onClose: () => void;
}) {
  const { t } = useTranslation();
  const name = blockName(t, authorName);
  const menuTitle = type === "comment" ? t("flock.posts.commentMenu", "Comment options")
    : type === "post" ? t("flock.posts.menuTitle", "Post options")
    : t("flock.flag.optionsTitle", "Options");
  return (
    <KyaSheet onClose={onClose} closeLabel={t("flock.region.close", "Close")} title={<span className="sr-only">{menuTitle}</span>}>
      <div className="flex flex-col gap-2.5" data-testid="options-sheet">
        {mine ? (
          <>
            {onEdit && <OptionRow action="edit" title={t("flock.posts.edit", "Edit")} onClick={onEdit} />}
            {onDelete && <OptionRow action="delete" title={t("flock.posts.delete", "Delete")} danger onClick={onDelete} />}
          </>
        ) : (
          <>
            {onFlag && (
              <OptionRow action="flag" icon={<FlagIcon />} title={flagThis(t, type)}
                line={t("flock.flag.optionLine", "The Kya team reviews it privately. {{name}} won't know who flagged it.", { name })}
                onClick={onFlag} />
            )}
            {onBlock && (
              <OptionRow action="block" icon={<BlockIcon />} title={t("flock.block.action", "Block {{name}}", { name })}
                line={t("flock.flag.blockLine", "You won't see each other's posts, comments, or journeys. You can undo this in Settings.")}
                onClick={onBlock} />
            )}
          </>
        )}
        <button type="button" data-action="cancel" onClick={onClose}
          className="min-h-[52px] rounded-[14px] border-2 bg-white text-[16px] font-[700]" style={{ borderColor: BORDER, color: K.forest }}>
          {t("flock.posts.cancel", "Cancel")}
        </button>
      </div>
    </KyaSheet>
  );
}

/** The flag sheet: pick a reason, add a note, send; then the thank-you.
 *  `doneLabel`: the thank-you's button ("Back to the Feed" from the feed). */
export function FlagSheet({ type, id, authorName, onClose, doneLabel }: {
  type: ReportSubject; id: string; authorName: string | null | undefined; onClose: () => void; doneLabel?: string;
}) {
  const { t } = useTranslation();
  const invalidate = useInvalidateModeration();
  const name = blockName(t, authorName);
  const [reason, setReason] = useState<FlagReason | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<FlagReason | null>(null);
  const [error, setError] = useState<string | null>(null);
  const doneRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (sent) doneRef.current?.focus(); }, [sent]);

  const send = async () => {
    if (!reason || busy) return;
    setBusy(true);
    setError(null);
    try { await report(type, id, reason, note); setSent(reason); void invalidate(); }
    catch { setError(t("flock.flag.error", "We couldn't send that. Check your connection and try again.")); }
    finally { setBusy(false); }
  };

  const button = "flex h-[54px] w-full items-center justify-center rounded-full border-2 text-[16px] font-[700] disabled:opacity-60";

  if (sent) {
    return (
      <KyaSheet onClose={onClose} closeLabel={t("flock.region.close", "Close")} title={<span className="sr-only">{t("flock.flag.sentTitle", "Thanks for looking out")}</span>}>
        <div className="flex flex-col items-start gap-3.5 pt-6" data-testid="flag-sent" data-reason={sent}>
          <span className="grid size-16 place-items-center rounded-full" style={{ background: K.lime }} aria-hidden="true">
            <svg width={30} height={30} viewBox="0 0 24 24" fill="none" stroke={K.forest} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
          </span>
          <KyaHeading as="h2" size={28}><span ref={doneRef} tabIndex={-1} className="outline-none">{t("flock.flag.sentTitle", "Thanks for looking out")}</span></KyaHeading>
          <p className="m-0 text-[15px] leading-[1.55]" style={{ color: MUTED }}>
            {t("flock.flag.sentLine", "The Kya team will take a look. If anything needs a follow-up, we'll reach out to {{name}} privately, so you won't see a public reply.", { name })}
          </p>
          <p className="m-0 text-[15px] leading-[1.55]" style={{ color: MUTED }} data-testid="flag-sent-next">
            {sent === "harmful"
              ? t("flock.flag.sentHarmful", "Flags like this one are reviewed within 24 hours.")
              : t("flock.flag.sentOther", "You can keep scrolling. There's nothing else you need to do.")}
          </p>
          <button type="button" onClick={onClose} className={`${button} mt-6`} style={{ background: K.sunflower, borderColor: K.forest, color: K.forest }} data-testid="flag-done">
            {doneLabel ?? t("flock.flag.done", "Done")}
          </button>
        </div>
      </KyaSheet>
    );
  }

  return (
    <KyaSheet onClose={onClose} closeLabel={t("flock.region.close", "Close")}
      title={(
        <div className="flex flex-col gap-1.5">
          <KyaHeading as="h2" size={26}>{t("flock.flag.title", "What's going on?")}</KyaHeading>
          <p className="m-0 text-[14px] leading-[1.5]" style={{ color: MUTED }}>
            {t("flock.flag.line", "The Kya team reviews every flag. {{name}} won't know who flagged it.", { name })}
          </p>
        </div>
      )}>
      <div className="flex flex-col gap-3.5" data-testid="flag-sheet">
        <div role="radiogroup" aria-label={t("flock.flag.reason", "Reason")} className="flex flex-col gap-2">
          {FLAG_REASONS.map((r) => {
            const on = reason === r;
            return (
              <button key={r} type="button" role="radio" aria-checked={on} data-reason={r} onClick={() => setReason(r)}
                className="flex items-start gap-3 rounded-[14px] px-3.5 py-3 text-left"
                style={{ background: on ? K.mist : "#ffffff", border: `2px solid ${on ? K.forest : BORDER}`, color: K.forest }}>
                <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border-2" style={{ borderColor: K.forest }} aria-hidden="true">
                  <span className="size-2.5 rounded-full" style={{ background: on ? K.forest : "transparent" }} />
                </span>
                <span className="flex flex-col gap-0.5">
                  <span className="text-[15px] font-[700]">{reasonLabel(t, r)}</span>
                  <span className="text-[13px] leading-[1.4]" style={{ color: MUTED }}>{reasonLine(t, r)}</span>
                </span>
              </button>
            );
          })}
        </div>
        <label className="flex flex-col gap-1.5 text-[14px] font-[700]" style={{ color: K.forest }}>
          {t("flock.flag.noteLabel", "Add a note (optional)")}
          <textarea value={note} maxLength={500} rows={3} onChange={(e) => setNote(e.target.value)} data-testid="flag-note"
            placeholder={t("flock.flag.notePlaceholder", "For example, I think this cage may be too small for a macaw.")}
            className="resize-none rounded-[14px] border-2 px-3.5 py-3 text-[14px] font-normal leading-[1.45] outline-none placeholder:text-[#5f5e5a]"
            style={{ borderColor: K.forest, color: K.forest }} />
        </label>
        {error && <p role="alert" className="m-0 text-[14px]" style={{ color: K.red }}>{error}</p>}
        <button type="button" onClick={() => void send()} disabled={!reason || busy} data-testid="flag-send"
          className={`${button} mt-2`}
          style={reason ? { background: K.sunflower, borderColor: K.forest, color: K.forest } : { background: K.mist, borderColor: BORDER, color: K.forest }}>
          {busy ? t("flock.flag.sending", "Sending…") : t("flock.flag.send", "Send to the Kya team")}
        </button>
      </div>
    </KyaSheet>
  );
}
