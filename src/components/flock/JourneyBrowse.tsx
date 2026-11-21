import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Check, Pause, Play, Share, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { K, KyaHeading, KyaPrimaryButton, KyaSheet } from "@/components/kya";
import { BirdThumb } from "@/components/flock/FlockPeople";
import { ChoiceChips } from "@/components/flock/JourneyParts";
import { useBirdPhotoUrls, useOwnBirdPhotoUrls, type FlockPhotoSrc } from "@/lib/flockData";
import { REACTIONS, useJourneyBirds, type JourneyCard, type ReactionKind } from "@/lib/journeyData";
import { visibilityChoices, type JourneyStatus, type JourneyVisibility } from "@/lib/journeys";

/** Bird photos for journey cards: your own birds signed as usual; other
 *  members' only when the database says the bird is shown (bird_has_photo). */
export function useCardBirdPhotos(cards: { bird_id: string; bird_has_photo: boolean; is_mine?: boolean }[] | undefined, width = 400): Record<string, FlockPhotoSrc> {
  const { data: mine } = useJourneyBirds();
  const own = (mine ?? []).filter((b) => (cards ?? []).some((c) => c.bird_id === b.id));
  const { data: ownPhotos } = useOwnBirdPhotoUrls(own, width);
  const others = (cards ?? []).filter((c) => c.bird_has_photo && !own.some((b) => b.id === c.bird_id)).map((c) => c.bird_id);
  const { data: otherPhotos } = useBirdPhotoUrls(others, width);
  return { ...(otherPhotos ?? {}), ...ownPhotos };
}

export function reactionLabel(t: TFunction, k: ReactionKind): string {
  switch (k) {
    case "great_job": return t("flock.journeys.react.greatJob", "Great job");
    case "been_there": return t("flock.journeys.react.beenThere", "Been there");
    case "rooting_for_you": return t("flock.journeys.react.rooting", "Rooting for you");
    case "love_this": return t("flock.journeys.react.love", "Love this");
  }
}

/** Great job / Been there / Rooting for you / Love this, with counts. Members
 *  tap to add or take back; everyone else sees the counts. */
export function ReactionChips({ counts, mine, canReact, onToggle, testId }: {
  counts: Record<ReactionKind, number>; mine: ReactionKind[]; canReact: boolean;
  onToggle: (k: ReactionKind, on: boolean) => void; testId?: string;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap gap-2" data-testid={testId}>
      {REACTIONS.map((k) => {
        const on = mine.includes(k);
        const n = counts[k];
        if (!canReact && n === 0) return null;
        return (
          <button key={k} type="button" disabled={!canReact} aria-pressed={on} data-reaction={k}
            onClick={() => onToggle(k, !on)}
            className="min-h-[38px] rounded-full px-3 text-[13px] disabled:cursor-default"
            style={on
              ? { background: "#cdeab0", border: `2px solid ${K.forest}`, color: K.forest, fontWeight: 700 }
              : { background: "#fff", border: "1px solid #c9d3c8", color: K.forest, padding: "0 13px" }}>
            {reactionLabel(t, k)}{n > 0 ? ` · ${n}` : ""}
          </button>
        );
      })}
    </div>
  );
}

/** "Today", or "Oct 18". */
export function shortDay(t: TFunction, iso: string, lang: string, now: Date = new Date()): string {
  const d = new Date(iso);
  if (d.toDateString() === now.toDateString()) return t("flock.journeys.today", "Today");
  return d.toLocaleDateString(lang, { month: "short", day: "numeric" });
}

/** A big photo card on the Journeys tab: the bird, the skill, progress, owner. */
export function JourneyBigCard({ card, photo }: { card: JourneyCard; photo: FlockPhotoSrc }) {
  const { t } = useTranslation();
  return (
    <Link to="/flock/journeys/$journeyId" params={{ journeyId: card.journey_id }} data-journey-card={card.journey_id}
      className="block overflow-hidden rounded-[22px] bg-white active:scale-[0.995]" style={{ color: K.forest, border: `1px solid ${K.line}` }}>
      <div className="relative grid aspect-[4/3] place-items-center" style={{ background: "linear-gradient(180deg,#3b5d4c,#1d3328)" }}>
        <BirdThumb name={card.bird_name} photo={photo} size={132} />
        {card.status === "finished" && (
          <span className="absolute left-3 top-3 rounded-full px-2.5 py-1 text-[11.5px] font-[700]" style={{ background: K.lime, color: K.forest }}>
            {t("flock.journeys.card.finished", "Finished")}
          </span>
        )}
      </div>
      <div className="flex flex-col gap-1.5 p-4">
        <span className="text-[17px] font-[700]">{card.bird_name} · {card.skill}</span>
        <div className="flex gap-1" aria-hidden="true">
          {Array.from({ length: card.total }, (_, i) => <span key={i} className="h-1.5 flex-1 rounded-full" style={{ background: i < card.done ? K.moss : "#dfe7dd" }} />)}
        </div>
        <span className="text-[13px]" style={{ color: K.quiet }}>
          {t("flock.journeys.card.progress", "{{done}} of {{total}}", { done: card.done, total: card.total })}
          {card.owner_name ? ` · ${card.owner_name}` : ""}
          {card.followers > 0 ? ` · ${t("flock.journeys.card.following", "{{count}} following", { count: card.followers })}` : ""}
        </span>
      </div>
    </Link>
  );
}

/** Followed journeys as rings across the top of Today. */
export function FollowRings({ cards, photos, onOpen }: { cards: JourneyCard[]; photos: Record<string, FlockPhotoSrc>; onOpen: (id: string) => void }) {
  const { t } = useTranslation();
  if (cards.length === 0) return null;
  return (
    <section data-testid="follow-rings">
      <h2 className="m-0 mb-2 text-[11.5px] font-[700] uppercase tracking-[0.06em]" style={{ color: "#5a8c7a" }}>{t("flock.today.following", "Journeys you follow")}</h2>
      <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1">
        {cards.map((c) => {
          const size = 62;
          const r = (size - 4) / 2;
          const circ = 2 * Math.PI * r;
          const pct = c.total ? c.done / c.total : 0;
          return (
            <button key={c.journey_id} type="button" data-ring={c.journey_id} onClick={() => onOpen(c.journey_id)}
              aria-label={t("flock.today.ringAria", "{{name}}'s {{skill}}, {{done}} of {{total}}", { name: c.bird_name, skill: c.skill, done: c.done, total: c.total })}
              className="flex w-[70px] shrink-0 flex-col items-center gap-1">
              <span className="relative grid place-items-center" style={{ width: size, height: size }}>
                <svg width={size} height={size} className="absolute inset-0 -rotate-90" aria-hidden="true">
                  <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#dfe7dd" strokeWidth={3} />
                  <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={K.moss} strokeWidth={3} strokeLinecap="round" strokeDasharray={`${circ * pct} ${circ}`} />
                </svg>
                <BirdThumb name={c.bird_name} photo={photos[c.bird_id]} size={size - 10} />
              </span>
              <span className="w-full truncate text-center text-[12px]" style={{ color: K.forest }}>{c.bird_name}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

/** A clip tile in a journey's grid, with its Milestone / Question / Day one tag. */
export function ClipTile({ thumbnail, date, tag, onOpen, testId, status }: {
  thumbnail?: string | null; date: string; tag: "milestone" | "question" | "day_one" | null; onOpen: () => void; testId?: string;
  /** Still being prepared, or can't be played (JourneyClipView). */
  status?: ReactNode;
}) {
  const { t } = useTranslation();
  const tagStyle = tag === "milestone" ? { background: K.lime, color: K.forest }
    : tag === "question" ? { background: K.amberBg, color: K.amberText } : { background: "#fff", color: K.forest };
  return (
    <button type="button" onClick={onOpen} data-tile={testId} data-tag={tag ?? undefined}
      className="relative aspect-[3/4] overflow-hidden" style={{ background: "linear-gradient(180deg,#3b5d4c,#1d3328)" }}>
      {thumbnail && <img src={thumbnail} alt="" className="absolute inset-0 size-full object-cover" loading="lazy" />}
      {status}
      {tag && (
        <span className="absolute left-1.5 top-1.5 rounded-full px-2 py-0.5 text-[10.5px] font-[700]" style={tagStyle}>
          {tag === "milestone" ? t("flock.journeys.tag.milestone", "Milestone") : tag === "question" ? t("flock.journeys.tag.question", "Question") : t("flock.journeys.tag.dayOne", "Day one")}
        </span>
      )}
      <span className="absolute bottom-1.5 left-1.5 text-[11px] font-[700] text-white" style={{ textShadow: "0 1px 2px rgba(0,0,0,.5)" }}>{date}</span>
    </button>
  );
}

/** The journey's menu (Batch 4, screen 5). */
export function JourneyMenuSheet({ status, visibility, canShare, clipCount, onPause, onResume, onHappy, onVisibility, onDelete, onClose }: {
  status: JourneyStatus; visibility: JourneyVisibility; canShare: boolean; clipCount: number;
  onPause: () => void; onResume: () => void; onHappy: () => void; onVisibility: (v: JourneyVisibility) => void; onDelete: () => void; onClose: () => void;
}) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<"menu" | "who" | "delete">("menu");
  const row = (icon: ReactNode, title: string, line: string, onClick: () => void, color: string = K.forest, testId?: string) => (
    <button type="button" onClick={onClick} data-menu={testId}
      className="flex min-h-[58px] w-full items-start gap-3 py-2.5 text-left" style={{ borderBottom: `1px solid ${K.line}`, color }}>
      <span className="mt-0.5 shrink-0">{icon}</span>
      <span className="flex flex-col"><span className="text-[15px]">{title}</span><span className="text-[12.5px]" style={{ color: K.quiet }}>{line}</span></span>
    </button>
  );
  return (
    <KyaSheet onClose={onClose} closeLabel={t("flock.region.close", "Close")}
      title={mode === "who" ? <KyaHeading size={23}>{t("flock.journeys.setup.who", "Who sees it?")}</KyaHeading>
        : mode === "delete" ? <KyaHeading size={23}>{t("flock.journeys.menu.deleteTitle", "Delete this journey?")}</KyaHeading> : undefined}>
      {mode === "menu" && (
        <div className="flex flex-col" data-testid="journey-menu">
          {status === "active" && row(<Pause className="size-4" aria-hidden="true" />, t("flock.journeys.menu.pause", "Pause this journey"),
            t("flock.journeys.menu.pauseLine", "Keeps everything. Drops out of the callout until you resume."), onPause, K.forest, "pause")}
          {status === "paused" && row(<Play className="size-4" aria-hidden="true" />, t("flock.journeys.menu.resume", "Resume this journey"),
            t("flock.journeys.menu.resumeLine", "Picks up where you left off."), onResume, K.forest, "resume")}
          {(status === "active" || status === "paused") && row(<Check className="size-4" aria-hidden="true" />, t("flock.journeys.menu.happy", "We're happy where we are"),
            t("flock.journeys.menu.happyLine", "Ends it gently. No badge, no judgment."), onHappy, K.forest, "happy")}
          {canShare && row(<Share className="size-4" aria-hidden="true" />, t("flock.journeys.menu.who", "Change who sees it"),
            t("flock.journeys.menu.whoLine", "Community or just me"), () => setMode("who"), K.forest, "who")}
          {row(<Trash2 className="size-4" aria-hidden="true" />, t("flock.journeys.menu.delete", "Delete journey"),
            t("flock.journeys.menu.deleteLine", "Removes the journey and its clips"), () => setMode("delete"), K.red, "delete")}
        </div>
      )}
      {mode === "who" && (
        <ChoiceChips label={t("flock.journeys.setup.who", "Who sees it?")} testId="menu-visibility" value={visibility} onChange={onVisibility}
          options={visibilityChoices({ can_share: canShare }).map((v) => ({ value: v, label: v === "community" ? t("flock.journeys.setup.community", "The community") : t("flock.journeys.setup.justMe", "Just me") }))} />
      )}
      {mode === "delete" && (
        <div className="flex flex-col gap-3" data-testid="delete-confirm">
          <p className="m-0 text-[15px] leading-[1.5]" style={{ color: K.ink }}>
            {t("flock.journeys.menu.deleteLineLong", "This removes the journey, its milestones and its {{count}} clips for good. It can't be undone.", { count: clipCount })}
          </p>
          <button type="button" onClick={onDelete} className="min-h-[52px] rounded-full text-[16px] font-[700] text-white" style={{ background: K.red }}>
            {t("flock.journeys.menu.deleteConfirm", "Delete journey")}
          </button>
          <KyaPrimaryButton onClick={() => setMode("menu")}>{t("flock.journeys.menu.keep", "Keep it")}</KyaPrimaryButton>
        </div>
      )}
    </KyaSheet>
  );
}

