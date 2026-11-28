import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { MessageCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { K } from "@/components/kya";
import { BirdThumb } from "@/components/flock/FlockPeople";
import { ReactionChips } from "@/components/flock/JourneyBrowse";
import { ClipTileState } from "@/components/flock/JourneyClipView";
import { MemberSuppliedTag } from "@/components/flock/JourneyParts";
import type { FlockPhotoSrc } from "@/lib/flockData";
import { reactTo, useInvalidateJourneys, useJourneyAccess, useJourneyClips, type MomentCard, type ReactionKind } from "@/lib/journeyData";
import { DIET_SLUG, isMemberSupplied, possessive, skillInSentence } from "@/lib/journeys";

/** A journey card in Today from a journey you follow (journeys redesign,
 *  screen 1): a "This was a big moment" update (who and when, "Big moment ·
 *  [Bird]'s [skill]", what they said, the clip, one-tap reactions, who
 *  reacted, and comments, all on the update), or a "learned it" finish that
 *  opens the journey. */
export function JourneyMomentCard({ card, photo, comments = 0 }: { card: MomentCard; photo: FlockPhotoSrc; comments?: number }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const invalidate = useInvalidateJourneys();
  const { data: access } = useJourneyAccess();
  const { data: clips } = useJourneyClips(card.journey_id, card.has_clip);
  const clip = card.update_id ? clips?.[card.update_id] : undefined;
  const [mine, setMine] = useState<ReactionKind[]>(card.mine);
  const [counts, setCounts] = useState({ great_job: card.great_job, been_there: card.been_there, rooting_for_you: card.rooting_for_you, love_this: card.love_this });
  const when = (() => {
    const mins = Math.max(1, Math.round((Date.now() - new Date(card.happened_at).getTime()) / 60_000));
    if (mins < 60) return t("flock.journeys.story.minutes", "{{count}}m", { count: mins });
    if (mins < 24 * 60) return t("flock.journeys.story.hours", "{{count}}h", { count: Math.round(mins / 60) });
    return new Date(card.happened_at).toLocaleDateString(i18n.language, { month: "short", day: "numeric" });
  })();
  const header = (
    <div className="flex items-center gap-2.5">
      <BirdThumb name={card.bird_name} photo={photo} size={36} />
      <span className="text-[12.5px]" style={{ color: K.quiet }}>
        {[card.owner_name, card.owner_region, when].filter(Boolean).join(" · ")}
      </span>
      {/* Cards come from other members' journeys you follow. */}
      {isMemberSupplied(card) && <MemberSuppliedTag className="ml-auto" />}
    </div>
  );

  if (card.card_kind === "learned" || !card.update_id) {
    return (
      <Link to="/flock/journeys/$journeyId" params={{ journeyId: card.journey_id }} data-moment-card={card.journey_id} data-kind="learned"
        className="flex flex-col gap-2.5 rounded-[18px] bg-white p-4" style={{ color: K.forest }}>
        {header}
        <span className="self-start rounded-full px-2.5 py-1 text-[12px] font-[700]" style={{ background: K.lime, color: K.forest }} data-testid="moment-pill">
          {t("flock.today.learnedPill", "Learned it · {{name}} {{skill}}", { name: possessive(card.bird_name, i18n.language), skill: skillInSentence(card.skill) })}
        </span>
        <p className="m-0 text-[15px] leading-[1.45]">
          {card.template_slug === DIET_SLUG
            ? t("flock.today.onNewDiet", "{{name}} is on the new diet!", { name: card.bird_name })
            : t("flock.today.learnedLine", "{{name}} learned {{skill}}!", { name: card.bird_name, skill: skillInSentence(card.skill) })}
        </p>
      </Link>
    );
  }

  const updateId = card.update_id;
  const toggle = async (k: ReactionKind, on: boolean) => {
    setMine((m) => on ? [...m, k] : m.filter((x) => x !== k));
    setCounts((c) => ({ ...c, [k]: Math.max(0, c[k] + (on ? 1 : -1)) }));
    try { await reactTo("journey_update", updateId, k, on); await invalidate(); }
    catch {
      setMine((m) => on ? m.filter((x) => x !== k) : [...m, k]);
      setCounts((c) => ({ ...c, [k]: Math.max(0, c[k] + (on ? -1 : 1)) }));
    }
  };
  return (
    <article className="flex flex-col gap-2.5 rounded-[18px] bg-white p-4" data-moment-card={updateId} data-kind="big_moment" style={{ color: K.forest }}>
      {header}
      <span className="self-start rounded-full px-2.5 py-1 text-[12px] font-[700]" style={{ background: K.lime, color: K.forest }} data-testid="moment-pill">
        {t("flock.today.bigMomentPill", "Big moment · {{name}} {{skill}}", { name: possessive(card.bird_name, i18n.language), skill: skillInSentence(card.skill) })}
      </span>
      {card.caption && <p className="m-0 text-[15px] leading-[1.45]">{card.caption}</p>}
      {card.has_clip && (
        <button type="button" onClick={() => void navigate({ to: "/flock/journeys/$journeyId/story", params: { journeyId: card.journey_id }, search: { u: updateId } })}
          className="relative aspect-video overflow-hidden rounded-[14px]" style={{ background: "#e7ece6" }} data-testid="card-clip"
          aria-label={t("flock.today.playClip", "Play {{name}}'s clip", { name: card.bird_name })}>
          {clip?.status === "ready" && <img src={clip.thumbnail} alt="" className="absolute inset-0 size-full object-cover" loading="lazy" />}
          <ClipTileState clip={clip} />
        </button>
      )}
      <ReactionChips testId="card-reactions" counts={counts} mine={mine} canReact={!!access?.can_share} onToggle={(k, on) => void toggle(k, on)} />
      <div className="flex items-center gap-3 border-t pt-2" style={{ borderColor: K.line }}>
        {counts.great_job + counts.been_there + counts.rooting_for_you + counts.love_this > 0 && (
          <Link to="/flock/reactions/$subjectType/$subjectId" params={{ subjectType: "journey_update", subjectId: updateId }}
            className="min-h-[40px] content-center text-[13px] font-[700]" style={{ color: K.moss }} data-testid="card-who-reacted">
            {t("flock.posts.whoReacted", "Who reacted")}
          </Link>
        )}
        <span className="flex-1" />
        {access?.can_share && (
          <Link to="/flock/comments/$subjectType/$subjectId" params={{ subjectType: "journey_update", subjectId: updateId }} search={{ j: card.journey_id, ...(comments ? {} : { focus: 1 as const }) }}
            className="inline-flex min-h-[40px] items-center gap-1.5 text-[13px] font-[700]" style={{ color: K.forest }} data-testid="card-comments">
            <MessageCircle className="size-4" aria-hidden="true" />
            {comments > 0 ? t("flock.posts.commentCount", "{{count}} comments", { count: comments }) : t("flock.posts.comment", "Comment")}
          </Link>
        )}
      </div>
    </article>
  );
}
