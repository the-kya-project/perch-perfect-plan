import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Flag, Hand, Heart, MessageCircle, MoreHorizontal, Star } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { K, KyaHeading, KyaSheet } from "@/components/kya";
import { BirdThumb, FlockAvatar } from "@/components/flock/FlockPeople";
import { reactionLabel } from "@/components/flock/JourneyBrowse";
import { spaceLabel } from "@/components/flock/SpacesSheet";
import type { FlockPhotoSrc } from "@/lib/flockData";
import { react, useInvalidatePosts, type Counts, type FlockPost, type ReactSubject } from "@/lib/flockPostData";
import type { PostPhoto } from "@/lib/flockPostMedia.functions";
import { AAV_FIND_A_VET_URL, type PostSpace, type VetTier } from "@/lib/flockPosts";
import { REACTIONS, type ReactionKind } from "@/lib/journeyData";

/** "5m", "2h", or "Nov 3". */
export function timeAgo(t: TFunction, iso: string, lang: string, now: Date = new Date()): string {
  const mins = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 60_000));
  if (mins < 1) return t("flock.posts.justNow", "Just now");
  if (mins < 60) return t("flock.journeys.story.minutes", "{{count}}m", { count: mins });
  if (mins < 24 * 60) return t("flock.journeys.story.hours", "{{count}}h", { count: Math.round(mins / 60) });
  return new Date(iso).toLocaleDateString(lang, { month: "short", day: "numeric" });
}

/** "Learn together", "Do good", "Great Lakes chapter", "Start here". */
export function postSpaceLabel(t: TFunction, space: PostSpace, chapterName?: string | null): string {
  if (space === "chapter") return t("flock.posts.chapterSpace", "{{name}} chapter", { name: chapterName ?? t("flock.posts.myChapter", "My") });
  return spaceLabel(t, space);
}

// ---- Press and hold --------------------------------------------------------------------

/** Press and hold (or right-click) opens a menu; a hold that fired swallows
 *  the click that follows. Moving more than a few pixels (a scroll) cancels. */
export function useLongPress(onLong: () => void, ms = 480) {
  const timer = useRef<number | null>(null);
  const fired = useRef(false);
  const origin = useRef<{ x: number; y: number } | null>(null);
  const cancel = () => { if (timer.current != null) { window.clearTimeout(timer.current); timer.current = null; } };
  return {
    onPointerDown: (e: React.PointerEvent) => {
      fired.current = false;
      origin.current = { x: e.clientX, y: e.clientY };
      cancel();
      timer.current = window.setTimeout(() => { fired.current = true; timer.current = null; onLong(); }, ms);
    },
    onPointerMove: (e: React.PointerEvent) => {
      const o = origin.current;
      if (o && Math.hypot(e.clientX - o.x, e.clientY - o.y) > 10) cancel();
    },
    onPointerUp: cancel,
    onPointerLeave: cancel,
    onPointerCancel: cancel,
    onContextMenu: (e: React.MouseEvent) => { e.preventDefault(); cancel(); if (!fired.current) { fired.current = true; onLong(); } },
    onClickCapture: (e: React.MouseEvent) => { if (fired.current) { e.stopPropagation(); e.preventDefault(); fired.current = false; } },
  };
}

/** The press-and-hold menu: Edit / Delete / Cancel on your own; Reply /
 *  Report / Cancel on someone else's. */
export function ActionSheet({ title, actions, onClose }: {
  title: string;
  actions: { key: string; label: string; danger?: boolean; onClick: () => void }[];
  onClose: () => void;
}) {
  const { t } = useTranslation();
  return (
    <KyaSheet onClose={onClose} closeLabel={t("flock.region.close", "Close")} title={<span className="sr-only">{title}</span>}>
      <div className="flex flex-col gap-2" data-testid="action-sheet">
        {actions.map((a) => (
          <button key={a.key} type="button" data-action={a.key} onClick={a.onClick}
            className="min-h-[52px] rounded-[14px] text-[16px] font-[700]"
            style={{ background: K.mist, color: a.danger ? K.red : K.forest }}>
            {a.label}
          </button>
        ))}
        <button type="button" data-action="cancel" onClick={onClose} className="min-h-[52px] rounded-[14px] border text-[16px] font-[700]"
          style={{ borderColor: "#c9d3c8", color: K.forest }}>
          {t("flock.posts.cancel", "Cancel")}
        </button>
      </div>
    </KyaSheet>
  );
}

export function ConfirmSheet({ title, line, confirm, onConfirm, onClose, busy, extra }: {
  title: string; line: string; confirm: string; onConfirm: () => void; onClose: () => void; busy?: boolean; extra?: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <KyaSheet onClose={onClose} closeLabel={t("flock.region.close", "Close")} title={<KyaHeading size={23}>{title}</KyaHeading>}>
      <p className="m-0 text-[15px] leading-[1.5]" style={{ color: K.ink }}>{line}</p>
      {extra}
      <div className="mt-4 flex flex-col gap-2">
        <button type="button" data-testid="confirm-delete" disabled={busy} onClick={onConfirm}
          className="min-h-[52px] rounded-full text-[16px] font-[700] text-white disabled:opacity-60" style={{ background: K.red }}>{confirm}</button>
        <button type="button" onClick={onClose} className="min-h-[52px] rounded-full border text-[16px] font-[700]" style={{ borderColor: "#c9d3c8", color: K.forest }}>
          {t("flock.posts.cancel", "Cancel")}
        </button>
      </div>
    </KyaSheet>
  );
}

// ---- Reactions ------------------------------------------------------------------------------

const REACTION_STYLE: Record<ReactionKind, { bg: string; Icon: typeof Star }> = {
  great_job: { bg: K.sunflower, Icon: Star },
  been_there: { bg: K.teal, Icon: Hand },
  rooting_for_you: { bg: K.lime, Icon: Flag },
  love_this: { bg: "#f6c9c4", Icon: Heart },
};

export function ReactionIcon({ kind, size = 22 }: { kind: ReactionKind; size?: number }) {
  const { bg, Icon } = REACTION_STYLE[kind];
  return (
    <span className="inline-grid shrink-0 place-items-center rounded-full border-2 border-white" style={{ width: size, height: size, background: bg }} aria-hidden="true">
      <Icon style={{ width: size * 0.55, height: size * 0.55 }} strokeWidth={2.2} color={K.forest} />
    </span>
  );
}

export function totalReactions(c: Counts): number {
  return c.great_job + c.been_there + c.rooting_for_you + c.love_this;
}

/** Optimistic reaction state for one subject. */
export function useReactionState(type: ReactSubject, id: string, initial: Counts) {
  const invalidate = useInvalidatePosts();
  const [state, setState] = useState<Counts>(initial);
  const [seen, setSeen] = useState(initial);
  if (seen !== initial) { setSeen(initial); setState(initial); }
  const toggle = async (k: ReactionKind, on: boolean) => {
    const apply = (s: Counts, v: boolean): Counts => ({ ...s, [k]: Math.max(0, s[k] + (v ? 1 : -1)), mine: v ? [...s.mine.filter((x) => x !== k), k] : s.mine.filter((x) => x !== k) });
    setState((s) => apply(s, on));
    try { await react(type, id, k, on); await invalidate(); }
    catch { setState((s) => apply(s, !on)); }
  };
  return { counts: state, toggle };
}

/** The four reactions, big, for press-and-hold on "Great job" (Comments mockup). */
export function ReactionPicker({ mine, onPick, onClose }: { mine: ReactionKind[]; onPick: (k: ReactionKind) => void; onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <KyaSheet onClose={onClose} closeLabel={t("flock.region.close", "Close")} title={<KyaHeading size={21}>{t("flock.posts.reactTitle", "React")}</KyaHeading>}>
      <div className="flex justify-around pb-2" data-testid="reaction-picker">
        {REACTIONS.map((k) => (
          <button key={k} type="button" data-pick={k} aria-pressed={mine.includes(k)} onClick={() => onPick(k)}
            className="flex w-[76px] flex-col items-center gap-1.5 text-center text-[12px] font-[700]" style={{ color: K.forest }}>
            <span className="rounded-full p-0.5" style={{ boxShadow: mine.includes(k) ? `0 0 0 2px ${K.forest}` : undefined }}><ReactionIcon kind={k} size={48} /></span>
            {reactionLabel(t, k)}
          </button>
        ))}
      </div>
    </KyaSheet>
  );
}

/** Stacked reaction icons and a count; opens Who reacted. */
export function ReactionSummary({ counts, type, id, testId }: { counts: Counts; type: ReactSubject; id: string; testId?: string }) {
  const { t } = useTranslation();
  const total = totalReactions(counts);
  if (total === 0) return null;
  const kinds = REACTIONS.filter((k) => counts[k] > 0);
  return (
    <Link to="/flock/reactions/$subjectType/$subjectId" params={{ subjectType: type, subjectId: id }} data-testid={testId ?? "reaction-summary"}
      className="inline-flex min-h-[36px] items-center gap-2 text-[13px]" style={{ color: K.quiet }}
      aria-label={t("flock.posts.whoReactedAria", "See who reacted ({{count}})", { count: total })}>
      <span className="flex">{kinds.map((k, i) => <span key={k} style={{ marginLeft: i ? -6 : 0 }}><ReactionIcon kind={k} /></span>)}</span>
      {t("flock.posts.reactionCount", "{{count}} reactions", { count: total })}
    </Link>
  );
}

/** "Great job" (tap) with the other three on press and hold, and Comment. */
export function ActionRow({ counts, onToggle, onComment, commentLabel, canReact = true }: {
  counts: Counts; onToggle: (k: ReactionKind, on: boolean) => void; onComment?: () => void; commentLabel?: string; canReact?: boolean;
}) {
  const { t } = useTranslation();
  const [picking, setPicking] = useState(false);
  const hold = useLongPress(() => setPicking(true));
  const current = REACTIONS.find((k) => counts.mine.includes(k));
  return (
    <div className="grid border-y" style={{ borderColor: K.line, gridTemplateColumns: onComment ? "1fr 1fr" : "1fr" }}>
      {canReact && (
        <button type="button" {...hold} data-testid="react-button" aria-pressed={!!current}
          aria-label={current ? reactionLabel(t, current) : t("flock.journeys.react.greatJob", "Great job")}
          aria-description={t("flock.posts.holdForMore", "Press and hold for more reactions")}
          onClick={() => (current ? onToggle(current, false) : onToggle("great_job", true))}
          className="flex min-h-[44px] select-none items-center justify-center gap-2 text-[14px] font-[700] [-webkit-touch-callout:none]"
          style={{ color: K.forest, background: current ? "#f3f8ee" : "transparent" }}>
          {current && <ReactionIcon kind={current} size={20} />}
          {current ? reactionLabel(t, current) : t("flock.journeys.react.greatJob", "Great job")}
        </button>
      )}
      {onComment && (
        <button type="button" onClick={onComment} data-testid="comment-button" className="flex min-h-[44px] items-center justify-center gap-2 text-[14px] font-[700]" style={{ color: K.forest }}>
          <MessageCircle className="size-4" aria-hidden="true" />
          {commentLabel ?? t("flock.posts.comment", "Comment")}
        </button>
      )}
      {picking && (
        <ReactionPicker mine={counts.mine} onClose={() => setPicking(false)}
          onPick={(k) => { setPicking(false); const on = !counts.mine.includes(k); if (on && current && current !== k) onToggle(current, false); onToggle(k, on); }} />
      )}
    </div>
  );
}

// ---- Photos ------------------------------------------------------------------------------

export function PhotoGrid({ photos, count, alt }: { photos: PostPhoto[] | undefined; count: number; alt: string }) {
  if (count === 0) return null;
  const items = Array.from({ length: count }, (_, i) => photos?.[i]);
  return (
    <div className={`grid gap-1 overflow-hidden rounded-[14px] ${count === 1 ? "grid-cols-1" : "grid-cols-2"}`} data-testid="post-photos">
      {items.map((p, i) => (
        <div key={i} className={`relative overflow-hidden ${count === 1 ? "aspect-[4/3]" : count === 3 && i === 0 ? "col-span-2 aspect-[2/1]" : "aspect-square"}`} style={{ background: "#e7ece6" }}>
          {p && <img src={p.url} onError={(e) => { if (p.original && e.currentTarget.src !== p.original) e.currentTarget.src = p.original; }}
            alt={count > 1 ? `${alt} (${i + 1}/${count})` : alt} loading="lazy" decoding="async" className="absolute inset-0 size-full object-cover" />}
        </div>
      ))}
    </div>
  );
}

// ---- The vet nudge -------------------------------------------------------------------------

/** The red card (Batch 3, screen 6), in two tiers: "today" (call your avian
 *  vet today) and "urgent" (this could be an emergency; urgent wins when both
 *  match). Never diagnoses and never blocks: the member can always post anyway.
 *  Both cards and their phrase lists are drafts until an avian vet reviews them. */
export function VetNudgeCard({ onPostAnyway, busy, tier = "today" }: { onPostAnyway: () => void; busy?: boolean; tier?: VetTier }) {
  const { t } = useTranslation();
  const ref = useRef<HTMLElement>(null);
  useEffect(() => { ref.current?.scrollIntoView?.({ block: "nearest", behavior: "smooth" }); }, []);
  return (
    <section ref={ref} role="alert" className="flex flex-col gap-3 rounded-[18px] p-4" style={{ background: "#fbe9e7", border: `2px solid ${K.red}`, color: K.forest }}
      data-testid="vet-nudge" data-tier={tier}>
      {tier === "urgent" ? (
        <>
          <KyaHeading size={20} as="h2" className="!text-[#7a1f1f]">{t("flock.posts.vet.urgentTitle", "This could be an emergency")}</KyaHeading>
          <p className="m-0 text-[15px] leading-[1.5]" style={{ color: K.ink }}>
            {t("flock.posts.vet.urgentBody", "Call your avian vet or an emergency vet now. Please don't wait for replies here.")}
          </p>
          <a href={AAV_FIND_A_VET_URL} target="_blank" rel="noopener noreferrer" data-testid="find-vet"
            className="inline-flex min-h-[50px] items-center justify-center rounded-full px-5 text-[16px] font-[700] text-white" style={{ background: K.red }}>
            {t("flock.posts.vet.urgentFind", "Find an emergency vet")}
          </a>
          <button type="button" onClick={onPostAnyway} disabled={busy} data-testid="post-anyway"
            className="min-h-[44px] self-center text-[15px] font-[700] underline underline-offset-2 disabled:opacity-60" style={{ color: "#7a1f1f" }}>
            {t("flock.posts.vet.anyway", "Post anyway, after I've called")}
          </button>
        </>
      ) : (
        <>
          <KyaHeading size={20} as="h2" className="!text-[#7a1f1f]">{t("flock.posts.vet.title", "This sounds like something for your avian vet")}</KyaHeading>
          <p className="m-0 text-[15px] leading-[1.5]" style={{ color: K.ink }}>
            {t("flock.posts.vet.body", "Changes like these can be early signs a bird is unwell. Birds hide illness, so it's worth calling today rather than waiting on replies.")}
          </p>
          <a href={AAV_FIND_A_VET_URL} target="_blank" rel="noopener noreferrer" data-testid="find-vet"
            className="inline-flex min-h-[50px] items-center justify-center rounded-full px-5 text-[16px] font-[700] text-white" style={{ background: K.red }}>
            {t("flock.posts.vet.find", "Find an avian vet near me")}
          </a>
          <button type="button" onClick={onPostAnyway} disabled={busy} data-testid="post-anyway"
            className="min-h-[48px] rounded-full border-2 px-5 text-[15px] font-[700] disabled:opacity-60" style={{ borderColor: K.red, color: "#7a1f1f", background: "#fff" }}>
            {t("flock.posts.vet.anyway", "Post anyway, after I've called")}
          </button>
        </>
      )}
    </section>
  );
}

// ---- A post -------------------------------------------------------------------------------

export function StatusPill({ post }: { post: FlockPost }) {
  const { t } = useTranslation();
  if (!post.is_mine || post.status === "live") return null;
  const label = post.status === "pending" ? t("flock.posts.status.pending", "Waiting for review")
    : post.status === "changes_requested" ? t("flock.posts.status.changes", "Changes requested")
    : post.status === "declined" ? t("flock.posts.status.declined", "Not approved")
    : t("flock.posts.status.removed", "Removed");
  return (
    <span className="self-start rounded-full px-2.5 py-1 text-[12px] font-[700]" style={{ background: K.amberBg, color: K.amberText }} data-testid="post-status">{label}</span>
  );
}

/** A post in a feed, or at the top of its comments. */
export function PostCard({ post, avatar, photos, birdPhoto, full = false, onMenu }: {
  post: FlockPost; avatar: FlockPhotoSrc; photos: PostPhoto[] | undefined; birdPhoto: FlockPhotoSrc; full?: boolean; onMenu: () => void;
}) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { counts, toggle } = useReactionState("post", post.post_id, post);
  const hold = useLongPress(onMenu);
  const live = post.status === "live";
  const open = (focus: boolean) => void navigate({ to: "/flock/post/$postId", params: { postId: post.post_id }, search: focus ? { focus: 1 } : {} });
  const name = post.author_name ?? t("flock.posts.member", "A member");
  return (
    <article className="flex flex-col gap-2.5 rounded-[18px] bg-white p-4" data-post={post.post_id} style={{ color: K.forest }}>
      <div className="flex items-center gap-2.5" {...hold}>
        <FlockAvatar name={name} url={avatar} size={36} />
        <span className="min-w-0 flex-1 text-[12.5px] leading-[1.35]" style={{ color: K.quiet }}>
          <b className="block text-[14px]" style={{ color: K.forest }}>{name}{post.is_mine ? ` ${t("flock.posts.you", "(you)")}` : ""}</b>
          {[postSpaceLabel(t, post.space, post.region_name), timeAgo(t, post.created_at, i18n.language), post.edited_at ? t("flock.posts.edited", "edited") : null].filter(Boolean).join(" · ")}
        </span>
        <button type="button" onClick={onMenu} aria-label={t("flock.posts.more", "More options")} data-testid="post-more"
          className="grid size-11 shrink-0 place-items-center rounded-full" style={{ color: K.quiet }}>
          <MoreHorizontal className="size-5" aria-hidden="true" />
        </button>
      </div>
      <StatusPill post={post} />
      {post.is_mine && post.review_note && post.status !== "live" && (
        <p className="m-0 rounded-[12px] p-3 text-[14px] leading-[1.45]" style={{ background: K.mist, color: K.ink }} data-testid="review-note">{post.review_note}</p>
      )}
      <div {...hold} onClick={full ? undefined : () => open(false)} className={full ? "" : "cursor-pointer"} data-testid="post-body">
        {post.title && <KyaHeading size={19} as="h3" className="mb-1">{post.title}</KyaHeading>}
        <p className={`m-0 whitespace-pre-wrap text-[15px] leading-[1.45] ${full ? "" : "line-clamp-6"}`}>{post.body}</p>
      </div>
      <PhotoGrid photos={photos} count={post.photo_count} alt={t("flock.posts.photoAlt", "Photo from {{name}}", { name })} />
      {post.bird_name && (
        <span className="inline-flex items-center gap-2 self-start rounded-full py-1 pl-1 pr-3 text-[13px] font-[700]" style={{ background: K.mist }} data-testid="post-bird">
          <BirdThumb name={post.bird_name} photo={birdPhoto} size={28} />{post.bird_name}
        </span>
      )}
      {live && (
        <>
          <div className="flex items-center gap-3">
            <span className="flex-1"><ReactionSummary counts={counts} type="post" id={post.post_id} /></span>
            {post.comment_count > 0 && (
              <button type="button" onClick={() => open(false)} className="min-h-[36px] text-[13px]" style={{ color: K.quiet }} data-testid="comment-count">
                {t("flock.posts.commentCount", "{{count}} comments", { count: post.comment_count })}
              </button>
            )}
          </div>
          <ActionRow counts={counts} onToggle={(k, on) => void toggle(k, on)} onComment={() => open(true)} />
        </>
      )}
    </article>
  );
}

export function EmptyLine({ children }: { children: ReactNode }) {
  return <p className="m-0 py-6 text-center text-[14px]" style={{ color: K.quiet }}>{children}</p>;
}
