import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useCommentCounts } from "@/lib/flockPostData";
import { Flag, X } from "lucide-react";
import { ReportSheet } from "@/components/flock/ReportSheet";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { K } from "@/components/kya";
import { BirdThumb } from "@/components/flock/FlockPeople";
import { useCardBirdPhotos } from "@/components/flock/JourneyBrowse";
import {
  reactTo, useInvalidateJourneys, useJourneyAccess, useJourneyClips, useJourneyFollowing, useJourneyView, useJourneyViewUpdates,
} from "@/lib/journeyData";

// The story viewer (JourneyEverywhere, screen 7): a journey's clips play like
// stories. "[owner] · time · Milestone N of M", one-tap "Go [bird]" (a Great
// job), tap the sides or swipe for the previous or next clip; from the rings
// in Today (?queue=following) the last clip moves on to the next bird.
// Clips come only as short-lived signed links for people allowed to see them.
export const Route = createFileRoute("/_authenticated/flock/journeys/$journeyId/story")({
  validateSearch: (s: Record<string, unknown>): { u?: string; queue?: "following" } => ({
    u: typeof s.u === "string" ? s.u : undefined,
    queue: s.queue === "following" ? "following" : undefined,
  }),
  component: Story,
});

/** "5m", "2h", or the date. */
function ago(t: TFunction, iso: string, lang: string, now: Date = new Date()): string {
  const mins = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 60_000));
  if (mins < 60) return t("flock.journeys.story.minutes", "{{count}}m", { count: Math.max(1, mins) });
  if (mins < 24 * 60) return t("flock.journeys.story.hours", "{{count}}h", { count: Math.round(mins / 60) });
  return new Date(iso).toLocaleDateString(lang, { month: "short", day: "numeric" });
}

function Story() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const router = useRouter();
  const invalidate = useInvalidateJourneys();
  const { journeyId } = Route.useParams();
  const { u, queue } = Route.useSearch();
  const { data: card } = useJourneyView(journeyId);
  const { data: updates } = useJourneyViewUpdates(journeyId);
  const { data: clips } = useJourneyClips(journeyId, !!card);
  const { data: access } = useJourneyAccess();
  const { data: following } = useJourneyFollowing();
  const photos = useCardBirdPhotos(card ? [card] : undefined, 120);
  // Oldest first, clips only.
  const reel = useMemo(() => [...(updates ?? [])].filter((x) => x.has_clip).reverse(), [updates]);
  const { data: comments } = useCommentCounts("journey_update", reel.map((x) => x.update_id));
  const [i, setI] = useState(0);
  const [cheered, setCheered] = useState<Set<string>>(new Set());
  const started = useRef(false);
  useEffect(() => {
    if (started.current || reel.length === 0) return;
    started.current = true;
    const at = u ? reel.findIndex((x) => x.update_id === u) : Math.max(0, reel.length - 3);
    setI(at < 0 ? 0 : at);
  }, [reel, u]);

  const close = () => {
    if (typeof window !== "undefined" && window.history.length > 1) router.history.back();
    else void navigate({ to: "/flock/journeys/$journeyId", params: { journeyId } });
  };
  const nextBird = () => {
    const list = following ?? [];
    const k = list.findIndex((c) => c.journey_id === journeyId);
    const next = k >= 0 ? list[k + 1] : undefined;
    if (queue === "following" && next) void navigate({ to: "/flock/journeys/$journeyId/story", params: { journeyId: next.journey_id }, search: { queue: "following" }, replace: true });
    else close();
  };
  const go = (d: number) => {
    const n = i + d;
    if (n < 0) return;
    if (n >= reel.length) { nextBird(); return; }
    setI(n);
  };
  const touch = useRef<number | null>(null);
  const [reporting, setReporting] = useState<string | null>(null);

  const cur = reel[i];
  const clip = cur ? clips?.[cur.update_id] : undefined;
  const name = card?.bird_name ?? "";
  const tag = !cur ? "" : cur.is_milestone && cur.milestone_position
    ? t("flock.journeys.story.milestone", "Milestone {{n}} of {{total}}", { n: cur.milestone_position, total: card?.total ?? 0 })
    : cur.is_question ? t("flock.journeys.tag.question", "Question") : cur.is_day_one ? t("flock.journeys.tag.dayOne", "Day one") : "";
  const isCheered = !!cur && (cheered.has(cur.update_id) || cur.mine.includes("great_job"));

  return (
    <div className="fixed inset-0 z-30 flex flex-col" style={{ background: "#0f1f18", color: "#fff" }} data-testid="story"
      onTouchStart={(e) => { touch.current = e.touches[0].clientX; }}
      onTouchEnd={(e) => { if (touch.current == null) return; const dx = e.changedTouches[0].clientX - touch.current; touch.current = null; if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1); }}>
      <div className="flex gap-1 px-3 pt-[max(10px,env(safe-area-inset-top))]" aria-hidden="true">
        {reel.map((x, k) => <span key={x.update_id} className="h-[3px] flex-1 rounded-full" style={{ background: k <= i ? "#fff" : "rgba(255,255,255,0.3)" }} />)}
      </div>
      <div className="flex items-center gap-2.5 px-3 py-2.5">
        {card && <BirdThumb name={name} photo={photos[card.bird_id]} size={36} />}
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[14px] font-[700]" style={{ color: K.lime }} data-testid="story-title">{card ? `${name} · ${card.skill}` : " "}</span>
          <span className="truncate text-[12.5px]" style={{ color: K.paleGreen }} data-testid="story-line">
            {[card?.owner_name, cur ? ago(t, cur.created_at, i18n.language) : null, tag || null].filter(Boolean).join(" · ")}
          </span>
        </span>
        {access?.can_share && card && !card.is_mine && cur && (
          <button type="button" onClick={() => setReporting(cur.update_id)} aria-label={t("flock.report.titleUpdate", "Report this update")} data-testid="story-report"
            className="grid size-11 place-items-center rounded-full" style={{ color: K.paleGreen }}>
            <Flag className="size-4" aria-hidden="true" />
          </button>
        )}
        <button type="button" onClick={close} aria-label={t("flock.journeys.post.close", "Close")} className="grid size-11 place-items-center rounded-full">
          <X className="size-5" aria-hidden="true" />
        </button>
      </div>
      <div className="relative flex-1" data-testid="story-clip" data-update={cur?.update_id}>
        {clip ? (
          <iframe key={cur!.update_id} src={`${clip.player}?autoplay=true&muted=true&preload=true&controls=false`} title={t("flock.journeys.story.clip", "{{name}}'s clip", { name })}
            className="absolute inset-0 size-full border-0" allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;" />
        ) : (
          <div className="absolute inset-0 grid place-items-center text-[14px]" style={{ color: K.paleGreen, background: "linear-gradient(180deg,#3b5d4c,#1d3328)" }}>
            {reel.length === 0 ? t("flock.journeys.story.none", "No clips yet.") : t("flock.journeys.story.loading", "Loading the clip…")}
          </div>
        )}
        <button type="button" aria-label={t("flock.journeys.story.prev", "Previous clip")} onClick={() => go(-1)} className="absolute inset-y-0 left-0 w-1/4" data-testid="story-prev" />
        <button type="button" aria-label={t("flock.journeys.story.next", "Next clip")} onClick={() => go(1)} className="absolute inset-y-0 right-0 w-1/4" data-testid="story-next" />
        {cur?.caption && (
          <p className="pointer-events-none absolute inset-x-0 bottom-0 m-0 px-4 pb-4 pt-10 text-[15px] leading-[1.45]"
            style={{ background: "linear-gradient(180deg,transparent,rgba(15,31,24,.85))" }} data-testid="story-caption">{cur.caption}</p>
        )}
      </div>
      <div className="flex items-center gap-2.5 px-3 pb-[max(14px,env(safe-area-inset-bottom))] pt-3">
        <div className="flex-1" data-testid="comments-slot">
          {access?.can_share && cur && (
            <Link to="/flock/comments/$subjectType/$subjectId" params={{ subjectType: "journey_update", subjectId: cur.update_id }}
              search={{ j: journeyId, ...((comments?.[cur.update_id] ?? 0) > 0 ? {} : { focus: 1 as const }) }} data-testid="story-comment"
              className="flex min-h-[46px] items-center rounded-full border px-4 text-[14px]" style={{ borderColor: "rgba(255,255,255,0.35)", color: "#fff" }}>
              <span className="truncate">
                {(comments?.[cur.update_id] ?? 0) > 0
                  ? t("flock.posts.commentCount", "{{count}} comments", { count: comments![cur.update_id] })
                  : card?.is_mine ? t("flock.posts.addComment", "Add a comment") : t("flock.posts.saySomething", "Say something to {{name}}", { name: (card?.owner_name ?? "").split(/\s+/)[0] || name })}
              </span>
            </Link>
          )}
        </div>
        {access?.can_share && cur && (
          <button type="button" data-testid="go-bird" aria-pressed={isCheered} disabled={isCheered}
            onClick={async () => {
              setCheered((s) => new Set(s).add(cur.update_id));
              try { await reactTo("journey_update", cur.update_id, "great_job", true); await invalidate(); }
              catch { setCheered((s) => { const n = new Set(s); n.delete(cur.update_id); return n; }); }
            }}
            className="min-h-[46px] rounded-full px-5 text-[15px] font-[700]" style={{ background: isCheered ? K.moss : K.lime, color: isCheered ? "#fff" : K.forest }}>
            {isCheered ? t("flock.journeys.story.cheered", "Cheered") : t("flock.journeys.story.go", "Go {{name}}", { name })}
          </button>
        )}
      </div>
      {reporting && <ReportSheet type="journey_update" id={reporting} onClose={() => setReporting(null)} />}
    </div>
  );
}
