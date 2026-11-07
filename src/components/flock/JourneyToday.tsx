import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { K } from "@/components/kya";
import { BirdThumb } from "@/components/flock/FlockPeople";
import { ReactionChips } from "@/components/flock/JourneyBrowse";
import type { FlockPhotoSrc } from "@/lib/flockData";
import { reactTo, useInvalidateJourneys, useJourneyAccess, useJourneyClips, type MilestoneCard, type ReactionKind } from "@/lib/journeyData";
import { possessive, skillInSentence } from "@/lib/journeys";

/** A milestone from a followed journey, in Today (JourneyEverywhere, screen 8):
 *  who and when, "Milestone N of M · [Bird]'s [skill]", what they said, the
 *  clip, and one-tap reactions. Comments come in step 4. */
export function JourneyMilestoneCard({ card, photo }: { card: MilestoneCard; photo: FlockPhotoSrc }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const invalidate = useInvalidateJourneys();
  const { data: access } = useJourneyAccess();
  const { data: clips } = useJourneyClips(card.journey_id, card.has_clip);
  const clip = card.update_id ? clips?.[card.update_id] : undefined;
  const [mine, setMine] = useState<ReactionKind[]>(card.mine);
  const [counts, setCounts] = useState({ great_job: card.great_job, been_there: card.been_there, rooting_for_you: card.rooting_for_you, love_this: card.love_this });
  const when = (() => {
    const mins = Math.max(1, Math.round((Date.now() - new Date(card.reached_at).getTime()) / 60_000));
    if (mins < 60) return t("flock.journeys.story.minutes", "{{count}}m", { count: mins });
    if (mins < 24 * 60) return t("flock.journeys.story.hours", "{{count}}h", { count: Math.round(mins / 60) });
    return new Date(card.reached_at).toLocaleDateString(i18n.language, { month: "short", day: "numeric" });
  })();
  const toggle = async (k: ReactionKind, on: boolean) => {
    setMine((m) => on ? [...m, k] : m.filter((x) => x !== k));
    setCounts((c) => ({ ...c, [k]: Math.max(0, c[k] + (on ? 1 : -1)) }));
    try { await reactTo("journey_milestone", card.milestone_id, k, on); await invalidate(); }
    catch {
      setMine((m) => on ? m.filter((x) => x !== k) : [...m, k]);
      setCounts((c) => ({ ...c, [k]: Math.max(0, c[k] + (on ? -1 : 1)) }));
    }
  };
  return (
    <article className="flex flex-col gap-2.5 rounded-[18px] bg-white p-4" data-milestone-card={card.milestone_id} style={{ color: K.forest }}>
      <div className="flex items-center gap-2.5">
        <BirdThumb name={card.bird_name} photo={photo} size={36} />
        <span className="text-[12.5px]" style={{ color: K.quiet }}>
          {[card.owner_name, card.owner_region, when].filter(Boolean).join(" · ")}
        </span>
      </div>
      <span className="self-start rounded-full px-2.5 py-1 text-[12px] font-[700]" style={{ background: K.lime, color: K.forest }} data-testid="milestone-pill">
        {t("flock.today.milestonePill", "Milestone {{n}} of {{total}} · {{name}} {{skill}}", {
          n: card.milestone_position, total: card.total, name: possessive(card.bird_name), skill: skillInSentence(card.skill),
        })}
      </span>
      {card.caption && <p className="m-0 text-[15px] leading-[1.45]">{card.caption}</p>}
      {!card.caption && <p className="m-0 text-[15px] leading-[1.45]" style={{ color: K.ink }}>{card.title}</p>}
      {card.has_clip && card.update_id && (
        <button type="button" onClick={() => void navigate({ to: "/flock/journeys/$journeyId/story", params: { journeyId: card.journey_id }, search: { u: card.update_id! } })}
          className="relative aspect-video overflow-hidden rounded-[14px]" style={{ background: "#e7ece6" }} data-testid="card-clip"
          aria-label={t("flock.today.playClip", "Play {{name}}'s clip", { name: card.bird_name })}>
          {clip?.thumbnail && <img src={clip.thumbnail} alt="" className="absolute inset-0 size-full object-cover" loading="lazy" />}
        </button>
      )}
      <ReactionChips testId="card-reactions" counts={counts} mine={mine} canReact={!!access?.can_share} onToggle={(k, on) => void toggle(k, on)} />
      {/* Comments come in step 4. */}
    </article>
  );
}
