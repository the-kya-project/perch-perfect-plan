import { useEffect, useRef, useState, type ReactNode } from "react";
import { Camera, SendHorizontal, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { K, KyaHeading } from "@/components/kya";
import { FlockAvatar } from "@/components/flock/FlockPeople";
import { reactionLabel } from "@/components/flock/JourneyBrowse";
import { rateMessage } from "@/components/flock/PostCompose";
import { ReportSheet } from "@/components/flock/ReportSheet";
import { ActionSheet, ConfirmSheet, ReactionPicker, timeAgo, useLongPress, useReactionState, VetNudgeCard } from "@/components/flock/PostParts";
import { AvatarError } from "@/lib/flockAvatar";
import { useAvatarUrls, useMyProfile, type FlockPhotoSrc } from "@/lib/flockData";
import {
  createComment, deleteComment, discardPostPhotos, editComment, uploadPostPhoto, useComments, useInvalidatePosts, usePostPhotos, useVetSigns,
  type CommentSubject, type FlockComment,
} from "@/lib/flockPostData";
import type { PostPhoto } from "@/lib/flockPostMedia.functions";
import { findVetSigns, MAX_COMMENT, rateLimitKind, replyPrefix, threadComments } from "@/lib/flockPosts";
import { REACTIONS } from "@/lib/journeyData";
import { useFormInProgress } from "@/lib/formsInProgress";

/** One comment: bubble, photo, time, its reaction and Reply. Press and hold
 *  (or the ⋯ menu) for Edit / Delete on your own, Reply on someone else's. */
function CommentItem({ c, reply, avatar, photo, highlighted, onReply, onMenu, canReact }: {
  c: FlockComment; reply: boolean; avatar: FlockPhotoSrc; photo: PostPhoto | undefined; highlighted: boolean;
  onReply: () => void; onMenu: () => void; canReact: boolean;
}) {
  const { t, i18n } = useTranslation();
  const { counts, toggle } = useReactionState("comment", c.comment_id, c);
  const [picking, setPicking] = useState(false);
  const hold = useLongPress(onMenu);
  const reactHold = useLongPress(() => setPicking(true));
  const current = REACTIONS.find((k) => counts.mine.includes(k));
  const shown = current ?? REACTIONS.find((k) => counts[k] > 0) ?? "great_job";
  const n = counts[shown];
  const name = c.author_name ?? t("flock.posts.member", "A member");
  return (
    <div className="flex gap-2.5" style={{ paddingLeft: reply ? 44 : 0 }} data-comment={c.comment_id} data-reply={reply ? "true" : undefined}>
      <FlockAvatar name={name} url={avatar} size={34} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div {...hold} className="select-none rounded-[16px] px-3 py-2 text-[14px] leading-[1.4] [-webkit-touch-callout:none]"
          style={{ background: highlighted ? "#e3f1d4" : K.mist, boxShadow: highlighted ? `0 0 0 2px ${K.moss}` : undefined }} data-testid="comment-bubble">
          <b>{name}{c.is_mine ? ` ${t("flock.posts.you", "(you)")}` : ""}</b>
          <p className="m-0 whitespace-pre-wrap break-words">{c.body}</p>
        </div>
        {c.has_photo && (
          <div className="relative aspect-[4/3] w-48 overflow-hidden rounded-[12px]" style={{ background: "#e7ece6" }}>
            {photo && <img src={photo.url} alt={t("flock.posts.photoAlt", "Photo from {{name}}", { name })} loading="lazy" className="absolute inset-0 size-full object-cover" />}
          </div>
        )}
        <div className="flex items-center gap-3.5 pl-1.5 text-[12.5px]" style={{ color: K.quiet }}>
          <span>{timeAgo(t, c.created_at, i18n.language)}{c.edited_at ? ` · ${t("flock.posts.edited", "edited")}` : ""}</span>
          {canReact ? (
            <button type="button" {...reactHold} aria-pressed={!!current} data-testid="comment-react"
              onClick={() => (current ? void toggle(current, false) : void toggle("great_job", true))}
              className="min-h-[32px] select-none font-[700] [-webkit-touch-callout:none]" style={{ color: K.forest }}>
              {reactionLabel(t, shown)}{n > 0 ? ` · ${n}` : ""}
            </button>
          ) : n > 0 ? <span>{reactionLabel(t, shown)} · {n}</span> : null}
          {canReact && <button type="button" onClick={onReply} className="min-h-[32px] font-[700]" style={{ color: K.forest }} data-testid="comment-reply">{t("flock.posts.reply", "Reply")}</button>}
          <button type="button" onClick={onMenu} className="min-h-[32px] px-1 font-[700]" aria-label={t("flock.posts.more", "More options")} data-testid="comment-more">···</button>
        </div>
      </div>
      {picking && (
        <ReactionPicker mine={counts.mine} onClose={() => setPicking(false)}
          onPick={(k) => { setPicking(false); const on = !counts.mine.includes(k); if (on && current && current !== k) void toggle(current, false); void toggle(k, on); }} />
      )}
    </div>
  );
}

/** Comments on a post, journey update or milestone (Batch 3, screens 2–4):
 *  threaded one level deep, "Replying to [name]" with their name added, a photo
 *  button, and the box focused when `focus` (the keyboard comes up). */
export function CommentThread({ type, id, ownerName, focus, canComment, top }: {
  type: CommentSubject; id: string; ownerName: string | null; focus: boolean; canComment: boolean; top: ReactNode;
}) {
  const { t } = useTranslation();
  const invalidate = useInvalidatePosts();
  const { data: rows, isLoading, isError } = useComments(type, id);
  const { data: me } = useMyProfile();
  const { data: signs } = useVetSigns();
  const list = rows ?? [];
  const { data: avatars } = useAvatarUrls([...list.map((c) => c.author_photo_path), me?.photo_path]);
  const { data: photos } = usePostPhotos({ commentIds: list.filter((c) => c.has_photo).map((c) => c.comment_id), width: 600 });
  const threads = threadComments(list);

  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState<FlockComment | null>(null);
  const [editing, setEditing] = useState<FlockComment | null>(null);
  const [photo, setPhoto] = useState<{ preview: string; path: string | null } | null>(null);
  const [menuFor, setMenuFor] = useState<FlockComment | null>(null);
  const [confirmFor, setConfirmFor] = useState<FlockComment | null>(null);
  const [reportFor, setReportFor] = useState<FlockComment | null>(null);
  const [nudge, setNudge] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  useFormInProgress(!!text.trim() && !busy);

  useEffect(() => { if (focus && canComment) box.current?.focus(); }, [focus, canComment]);

  const startReply = (c: FlockComment) => {
    setEditing(null);
    setReplyTo(c);
    setText((cur) => (cur.trim() ? cur : replyPrefix(c.author_name)));
    setNudge(false);
    requestAnimationFrame(() => box.current?.focus());
  };
  const startEdit = (c: FlockComment) => {
    setReplyTo(null);
    setEditing(c);
    setText(c.body);
    setNudge(false);
    requestAnimationFrame(() => box.current?.focus());
  };
  const reset = () => { setText(""); setReplyTo(null); setEditing(null); setPhoto(null); setNudge(false); };

  const pickPhoto = async (f: File | undefined) => {
    if (!f) return;
    setPhoto({ preview: URL.createObjectURL(f), path: null });
    try { const path = await uploadPostPhoto(f); setPhoto((p) => (p ? { ...p, path } : p)); }
    catch (e) { setPhoto(null); setError(e instanceof AvatarError ? e.message : t("flock.posts.photoError", "We couldn't add that photo. Try again.")); }
  };

  const send = async (vetNudged: boolean) => {
    if (!text.trim() || busy || (photo && !photo.path)) return;
    setError(null);
    if (!editing && !vetNudged && findVetSigns(text, signs ?? []).length > 0) { setNudge(true); return; }
    setBusy(true);
    try {
      if (editing) await editComment(editing.comment_id, text);
      else await createComment({ type, id, replyTo: replyTo?.comment_id ?? null, body: text, photoPath: photo?.path ?? null, vetNudged });
      reset();
      await invalidate();
    } catch (e) {
      const k = rateLimitKind(e);
      setError(k ? rateMessage(t, k) : t("flock.posts.commentError", "We couldn't post that comment. Try again."));
    } finally {
      setBusy(false);
    }
  };

  const placeholder = ownerName
    ? t("flock.posts.commentFor", "Add a comment for {{name}}", { name: ownerName.split(/\s+/)[0] })
    : t("flock.posts.addComment", "Add a comment");

  return (
    <div className="flex min-h-[100dvh] flex-col" style={{ background: "#fff", color: K.forest }}>
      {top}
      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-3 px-4 pb-40 pt-3" data-testid="comments">
        {isLoading ? null : isError ? (
          <p className="m-0 py-6 text-center text-[14px]" style={{ color: K.quiet }}>{t("flock.posts.commentsError", "We couldn't load the comments.")}</p>
        ) : threads.length === 0 ? (
          <p className="m-0 py-6 text-center text-[14px]" style={{ color: K.quiet }} data-testid="no-comments">{t("flock.posts.noComments", "No comments yet. Say something kind.")}</p>
        ) : threads.map(({ comment, replies }) => (
          <div key={comment.comment_id} className="flex flex-col gap-3">
            {[comment, ...replies].map((c) => (
              <CommentItem key={c.comment_id} c={c} reply={c !== comment} canReact={canComment}
                avatar={c.author_photo_path ? avatars?.get(c.author_photo_path) : null}
                photo={photos?.[`comment:${c.comment_id}`]?.[0]}
                highlighted={replyTo?.comment_id === c.comment_id || editing?.comment_id === c.comment_id}
                onReply={() => startReply(c)} onMenu={() => setMenuFor(c)} />
            ))}
          </div>
        ))}
      </div>
      {canComment && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-white px-3 pb-[max(12px,env(safe-area-inset-bottom))] pt-2" style={{ borderColor: K.line }} data-testid="comment-composer">
          <div className="mx-auto flex max-w-xl flex-col gap-2">
            {nudge && <VetNudgeCard busy={busy} onPostAnyway={() => void send(true)} />}
            {(replyTo || editing) && (
              <div className="flex items-center gap-2 text-[13px]" style={{ color: K.quiet }} data-testid="replying-to">
                <span className="flex-1">
                  {editing ? t("flock.posts.editingComment", "Editing your comment") : <>{t("flock.posts.replyingTo", "Replying to")} <b style={{ color: K.forest }}>{replyTo?.author_name}</b></>}
                </span>
                <button type="button" onClick={reset} aria-label={t("flock.posts.cancel", "Cancel")} className="grid size-9 place-items-center rounded-full"><X className="size-4" aria-hidden="true" /></button>
              </div>
            )}
            {photo && (
              <div className="relative size-16 overflow-hidden rounded-[10px]">
                <img src={photo.preview} alt="" className="size-full object-cover" style={{ opacity: photo.path ? 1 : 0.5 }} />
                <button type="button" onClick={() => { if (photo.path) void discardPostPhotos([photo.path]); setPhoto(null); }}
                  aria-label={t("flock.posts.removePhoto", "Remove photo")} className="absolute right-0.5 top-0.5 grid size-6 place-items-center rounded-full bg-black/60 text-white"><X className="size-3" aria-hidden="true" /></button>
              </div>
            )}
            {error && <p role="alert" className="m-0 text-[14px]" style={{ color: K.red }} data-testid="comment-error">{error}</p>}
            <div className="flex items-end gap-2">
              <FlockAvatar name={me?.display_name ?? "?"} url={me?.photo_path ? avatars?.get(me.photo_path) : null} size={34} />
              <label className="sr-only" htmlFor="comment-box">{placeholder}</label>
              <textarea id="comment-box" ref={box} value={text} rows={1} maxLength={MAX_COMMENT} placeholder={placeholder} data-testid="comment-box"
                onChange={(e) => { setText(e.target.value); setNudge(false); }}
                className="max-h-32 min-h-[44px] flex-1 resize-none rounded-[22px] border px-4 py-2.5 text-[15px] outline-none" style={{ borderColor: "#c9d3c8", background: "#f4f7f4" }} />
              {!editing && (
                <>
                  <input ref={fileRef} type="file" accept="image/*" className="hidden" data-testid="comment-photo-input"
                    onChange={(e) => { void pickPhoto(e.target.files?.[0]); e.target.value = ""; }} />
                  <button type="button" onClick={() => fileRef.current?.click()} disabled={!!photo} aria-label={t("flock.posts.addPhoto", "Add a photo")}
                    className="grid size-11 shrink-0 place-items-center rounded-full disabled:opacity-40" style={{ color: K.forest }} data-testid="comment-photo">
                    <Camera className="size-5" aria-hidden="true" />
                  </button>
                </>
              )}
              <button type="button" onClick={() => void send(false)} disabled={!text.trim() || busy || (!!photo && !photo.path)} data-testid="comment-send"
                aria-label={editing ? t("flock.posts.save", "Save") : t("flock.posts.send", "Send")}
                className="grid size-11 shrink-0 place-items-center rounded-full disabled:opacity-40" style={{ background: K.forest, color: "#fff" }}>
                <SendHorizontal className="size-5" aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
      )}
      {menuFor && (
        <ActionSheet title={t("flock.posts.commentMenu", "Comment options")} onClose={() => setMenuFor(null)}
          actions={menuFor.is_mine
            ? [
              { key: "edit", label: t("flock.posts.edit", "Edit"), onClick: () => { const c = menuFor; setMenuFor(null); startEdit(c); } },
              { key: "delete", label: t("flock.posts.delete", "Delete"), danger: true, onClick: () => { const c = menuFor; setMenuFor(null); setConfirmFor(c); } },
            ]
            : [
              ...(canComment ? [{ key: "reply", label: t("flock.posts.reply", "Reply"), onClick: () => { const c = menuFor; setMenuFor(null); startReply(c); } }] : []),
              { key: "report", label: t("flock.report.action", "Report"), onClick: () => { const c = menuFor; setMenuFor(null); setReportFor(c); } },
            ]} />
      )}
      {reportFor && <ReportSheet type="comment" id={reportFor.comment_id} onClose={() => setReportFor(null)} />}
      {confirmFor && (
        <ConfirmSheet busy={busy} onClose={() => setConfirmFor(null)}
          title={t("flock.posts.deleteCommentTitle", "Delete this comment?")}
          line={confirmFor.parent_id ? t("flock.posts.deleteReplyLine", "This can't be undone.") : t("flock.posts.deleteCommentLine", "Replies to it go too. This can't be undone.")}
          confirm={t("flock.posts.deleteCommentConfirm", "Delete comment")}
          onConfirm={async () => {
            setBusy(true);
            try { await deleteComment(confirmFor.comment_id); await invalidate(); setConfirmFor(null); }
            catch { setError(t("flock.posts.deleteError", "We couldn't delete that. Try again.")); setConfirmFor(null); }
            finally { setBusy(false); }
          }} />
      )}
    </div>
  );
}

/** The forest top bar for comment and reaction screens. */
export function ThreadHeader({ title, onBack, children }: { title: string; onBack: () => void; children?: ReactNode }) {
  const { t } = useTranslation();
  return (
    <header className="sticky top-0 z-10 px-2 pb-3 pt-[max(10px,env(safe-area-inset-top))] text-white" style={{ background: K.forest }}>
      <div className="flex items-center gap-1">
        <button type="button" onClick={onBack} aria-label={t("headers.back", "Back")} className="grid size-11 place-items-center rounded-full">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
        </button>
        <KyaHeading as="h1" size={20} className="text-white">{title}</KyaHeading>
      </div>
      {children && <div className="px-3 pt-1 text-[13px]" style={{ color: K.teal }}>{children}</div>}
    </header>
  );
}
