import { Link } from "@tanstack/react-router";
import { Check, Star } from "lucide-react";
import { Trans, useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { K } from "@/components/kya";
import {
  choiceColor, isDonationVote, rankedChoices, topNames, VOTE_GUARANTEED_PCT, voteDay,
  type RankedChoice, type Vote, type VoteChoice, type VoteState,
} from "@/lib/flockVotes";

// Do good voting (backlog 1.8, docs/flock/mockups/voting): the card at the top
// of Do good and on Today, the choice rows, and the results. An all-members
// vote shares the donation; a founders-only vote shows plain results.

export function voteStateLabel(t: TFunction, s: VoteState): string {
  return s === "draft" ? t("flock.votesAdmin.draft", "Draft") : s === "open" ? t("flock.votesAdmin.open", "Open") : t("flock.votesAdmin.closed", "Closed");
}

/** The small "Founders" pill on a founders-only vote. */
export function FoundersPill() {
  const { t } = useTranslation();
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-[700]" style={{ background: K.sunflower, color: K.forest }} data-testid="vote-founders">
      <Star className="size-3" fill="currentColor" aria-hidden="true" />
      {t("flock.votes.founders", "Founders")}
    </span>
  );
}

/** An open vote (lime, "Vote now") or a closed one pointing to its results (white). */
export function VoteCard({ vote }: { vote: Vote }) {
  const { t, i18n } = useTranslation();
  const open = vote.state === "open";
  const tops = topNames(vote);
  return (
    <div className="flex flex-col gap-2 rounded-[18px] px-4 py-3.5" style={{ background: open ? K.lime : "#fff", color: K.forest }}
      data-testid="vote-card" data-vote={vote.vote_id} data-state={vote.state}>
      <div className="flex items-center gap-2">
        <span className="flex-1 text-[11.5px] font-[700] uppercase tracking-[0.06em]" style={{ color: K.moss }}>
          {open
            ? t("flock.votes.openTag", "Vote open · closes {{day}}", { day: voteDay(vote.closes_at, i18n.language) })
            : t("flock.votes.closedTag", "Vote closed")}
        </span>
        {vote.audience === "founders" && <FoundersPill />}
      </div>
      <span className="text-[17px] font-[700] leading-[1.25]">{vote.question}</span>
      {open ? (
        <>
          {vote.description && <span className="text-[13px] leading-[1.45]" style={{ color: K.ink }}>{vote.description}</span>}
          <span className="text-[12.5px] leading-[1.45]" style={{ color: K.ink }} data-testid="vote-count">
            {vote.my_choice
              ? t("flock.votes.youVoted", "You voted · {{count}} members have voted", { count: vote.voters })
              : t("flock.votes.voted", "{{count}} members have voted", { count: vote.voters })}
          </span>
          <Link to="/flock/votes/$voteId" params={{ voteId: vote.vote_id }} data-testid="vote-now"
            className="inline-flex min-h-[44px] w-full items-center justify-center rounded-full px-4 text-[14px] font-[700]"
            style={{ background: K.sunflower, color: K.forest, border: `2px solid ${K.forest}` }}>
            {vote.my_choice ? t("flock.votes.seeYourVote", "See your vote") : t("flock.votes.voteNow", "Vote now")}
          </Link>
        </>
      ) : (
        <>
          <span className="text-[13.5px] leading-[1.45]" style={{ color: K.ink }} data-testid="vote-outcome">
            {isDonationVote(vote)
              ? (vote.voters > 0
                ? t("flock.votes.sharedOutcome", "Every partner gets at least 10%. Your votes decided the rest.")
                : t("flock.votes.sharedEvenly", "No votes were cast, so the donation is shared evenly."))
              : tops.length > 0
                ? t("flock.votes.foundersChose", "Founders chose {{names}}.", { names: tops.join(" and ") })
                : t("flock.votes.noResult", "No votes were cast.")}
          </span>
          <Link to="/flock/votes/$voteId" params={{ voteId: vote.vote_id }} data-testid="vote-results"
            className="inline-flex min-h-[44px] w-full items-center justify-center rounded-full px-4 text-[14px] font-[700]"
            style={{ background: K.mist, color: K.forest }}>
            {t("flock.votes.seeResults", "See the results")}
          </Link>
        </>
      )}
    </div>
  );
}

/** A choice to pick: a large logo tile, name, a sentence, a radio. */
export function ChoiceRow({ choice, index, photo, picked, disabled, onPick }: {
  choice: VoteChoice; index: number; photo?: string; picked: boolean; disabled?: boolean; onPick: () => void;
}) {
  return (
    <button type="button" role="radio" aria-checked={picked} disabled={disabled} onClick={onPick} data-choice={choice.choice_id}
      className="flex w-full items-center gap-3.5 rounded-[18px] bg-white p-3 text-left disabled:opacity-60"
      style={{ border: `2px solid ${picked ? K.forest : "#dbe3da"}`, color: K.forest, boxShadow: picked ? "0 6px 16px rgba(26,61,46,0.12)" : undefined }}>
      <ChoicePhoto name={choice.name} photo={photo} index={index} size={68} />
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-[16px] font-[700] leading-[1.25]">{choice.name}</span>
        {choice.blurb && <span className="text-[13px] leading-[1.4]" style={{ color: K.ink }}>{choice.blurb}</span>}
      </span>
      <span aria-hidden="true" className="grid size-6 shrink-0 place-items-center rounded-full"
        style={{ border: `2px solid ${K.forest}`, background: picked ? K.forest : "#fff" }}>
        {picked && <Check className="size-[13px]" color="#fff" strokeWidth={3.2} />}
      </span>
    </button>
  );
}

/** A choice's logo or photo, whole on white (a logo is never cropped), or its
 *  first letter on the choice's color. */
export function ChoicePhoto({ name, photo, index = 0, size = 68 }: { name: string; photo?: string; index?: number; size?: number }) {
  const color = choiceColor(index);
  return photo
    ? <img src={photo} alt={name} className="shrink-0 rounded-[16px] bg-white object-contain" style={{ width: size, height: size, border: "1px solid #e3ebe2" }} />
    : (
      <span role="img" aria-label={name} className="grid shrink-0 place-items-center rounded-[16px] font-[700]"
        style={{ width: size, height: size, background: color.solid, color: color.text, fontFamily: "'Newsreader', Georgia, serif", fontSize: Math.round(size * 0.38) }}>
        {name.trim().charAt(0).toUpperCase()}
      </span>
    );
}

/** The heading of a donation vote's results, for the page header. */
export function DonationHeading() {
  return (
    <Trans i18nKey="flock.votes.resultsTitle" defaults="How this quarter's donation is <em>handled</em>"
      components={{ em: <em style={{ color: K.sunflower, fontWeight: 600 }} /> }} />
  );
}

const RING_R = 56;
const RING_C = 2 * Math.PI * RING_R;
const RING_GAP = 4;

/** The ring chart and its legend. */
function ShareRing({ choices }: { choices: RankedChoice[] }) {
  const { t } = useTranslation();
  let at = 0;
  const label = t("flock.votes.ringLabel", "Donation shares: {{shares}}", { shares: choices.map((c) => `${c.name} ${c.share ?? 0}%`).join(", ") });
  return (
    <section className="relative flex items-center gap-4 rounded-[22px] bg-white p-[18px]" style={{ boxShadow: "0 10px 24px rgba(26,61,46,0.14)" }} data-testid="vote-ring">
      <div className="relative size-[140px] shrink-0">
        <svg width="140" height="140" viewBox="0 0 140 140" role="img" aria-label={label} style={{ transform: "rotate(-90deg)" }}>
          <circle cx="70" cy="70" r={RING_R} fill="none" stroke="#eef3ed" strokeWidth="20" />
          {choices.map((c) => {
            const len = ((c.share ?? 0) / 100) * RING_C;
            const offset = -at;
            at += len;
            return <circle key={c.choice_id} cx="70" cy="70" r={RING_R} fill="none" stroke={choiceColor(c.index).solid} strokeWidth="20"
              strokeDasharray={`${Math.max(1, len - RING_GAP)} ${RING_C}`} strokeDashoffset={offset} />;
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-[30px] font-[700] leading-none" style={{ fontFamily: "'Newsreader', Georgia, serif" }}>{choices.length}</span>
          <span className="text-[12px]" style={{ color: K.quiet }}>{t("flock.votes.partners", "partners")}</span>
        </div>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2.5">
        {choices.map((c) => (
          <div key={c.choice_id} className="flex items-center gap-2 text-[14px]" data-legend={c.choice_id}>
            <span className="size-3 shrink-0 rounded-[4px]" style={{ background: choiceColor(c.index).solid }} />
            <span className="min-w-0 flex-1 break-words leading-[1.2]">{c.name}</span>
            <strong>{c.share ?? 0}%</strong>
          </div>
        ))}
      </div>
    </section>
  );
}

/** The two-part bar: the guaranteed 10%, then what the votes added. */
function ShareBar({ choice, height = 12 }: { choice: RankedChoice; height?: number }) {
  const color = choiceColor(choice.index);
  return (
    <div className="flex overflow-hidden rounded-full" style={{ height, background: "#eef3ed" }} aria-hidden="true">
      <span style={{ width: `${VOTE_GUARANTEED_PCT}%`, background: color.pale }} />
      <span style={{ width: `${choice.from_votes ?? 0}%`, background: color.solid }} />
    </div>
  );
}

/** Results of a donation vote: the ring, then one card per partner by share. */
function DonationResults({ vote, photos }: { vote: Vote; photos?: Record<string, string> }) {
  const { t } = useTranslation();
  const choices = rankedChoices(vote);
  return (
    <div className="flex flex-col gap-3.5" data-testid="vote-results-card">
      <ShareRing choices={choices} />
      {choices.map((c) => (
        <section key={c.choice_id} className="flex flex-col gap-3 rounded-[20px] bg-white p-4" data-result={c.choice_id}>
          <div className="flex items-center gap-3.5">
            <ChoicePhoto name={c.name} photo={c.photo_path ? photos?.[c.photo_path] : undefined} index={c.index} size={60} />
            <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
              <span className="text-[16px] font-[700] leading-[1.25]">{c.name}</span>
              <span className="text-[13px]" style={{ color: K.quiet }}>{t("flock.votes.ofVotes", "{{percent}}% of the votes", { percent: c.percent ?? 0 })}</span>
            </span>
            <span className="text-[32px] font-[700] leading-none" style={{ fontFamily: "'Newsreader', Georgia, serif" }} data-testid="vote-share">{c.share ?? 0}%</span>
          </div>
          <ShareBar choice={c} />
          <span className="text-[13px]" style={{ color: K.ink }}>
            {t("flock.votes.shareSplit", "{{guaranteed}}% guaranteed + {{fromVotes}}% from votes", { guaranteed: VOTE_GUARANTEED_PCT, fromVotes: c.from_votes ?? 0 })}
          </span>
        </section>
      ))}
    </div>
  );
}

/** Results of a founders-only vote: no donation, the top choice and percentages. */
function PlainResults({ vote }: { vote: Vote }) {
  const { t } = useTranslation();
  const tops = topNames(vote);
  return (
    <div className="flex flex-col gap-2 rounded-[18px] bg-white px-4 py-3.5" style={{ color: K.forest }} data-testid="vote-results-card">
      <span className="text-[11.5px] font-[700] uppercase tracking-[0.06em]" style={{ color: K.moss }}>{t("flock.votes.foundersChoseTag", "Founders chose")}</span>
      <span className="text-[20px] font-[700] leading-[1.25]" data-testid="vote-top">
        {tops.length > 0 ? tops.join(" · ") : t("flock.votes.noResult", "No votes were cast.")}
      </span>
      {rankedChoices(vote).map((c) => (
        <div key={c.choice_id} className="flex flex-col gap-1.5" data-result={c.choice_id}>
          <div className="flex justify-between gap-3 text-[14px]" style={{ fontWeight: c.top ? 700 : 500 }}>
            <span>{c.name}</span>
            <span>{c.percent ?? 0}%</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full" style={{ background: "#dbe3da" }}>
            <div className="h-full" style={{ width: `${Math.max(0, Math.min(100, c.percent ?? 0))}%`, background: c.top ? K.moss : "#9bb5a8" }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/** A closed vote's results, for members. Admins also see the counts. */
export function VoteResults({ vote, admin, photos }: { vote: Vote; admin: boolean; photos?: Record<string, string> }) {
  return (
    <>
      {isDonationVote(vote) ? <DonationResults vote={vote} photos={photos} /> : <PlainResults vote={vote} />}
      {admin && <AdminCounts vote={vote} />}
    </>
  );
}

/** The admin's closed-vote view: the shares to send, then the counts. */
export function AdminVoteOutcome({ vote }: { vote: Vote }) {
  const { t } = useTranslation();
  if (!isDonationVote(vote)) return <VoteResults vote={vote} admin />;
  return (
    <section className="flex flex-col gap-3 rounded-[18px] bg-white p-4" style={{ color: K.forest }} data-testid="vote-admin-shares">
      <span className="text-[11.5px] font-[700] uppercase tracking-[0.06em]" style={{ color: K.moss }}>{t("flock.votesAdmin.sharesTitle", "How the donation is shared")}</span>
      <span className="text-[14px] leading-[1.45]" style={{ color: K.ink }}>
        {t("flock.votesAdmin.sharesHint", "10% guaranteed to each partner, the rest by votes. Use these shares when you send the donation.")}
      </span>
      {rankedChoices(vote).map((c) => (
        <div key={c.choice_id} className="flex flex-col gap-1.5" data-result={c.choice_id}>
          <div className="flex justify-between gap-3 text-[14px] font-[700]"><span>{c.name}</span><span>{c.share ?? 0}%</span></div>
          <ShareBar choice={c} height={10} />
        </div>
      ))}
      <AdminCounts vote={vote} />
    </section>
  );
}

/** Admins only: the count per choice, at any time. */
export function AdminCounts({ vote }: { vote: Vote }) {
  const { t } = useTranslation();
  return (
    <div className="mt-1 flex flex-col gap-1 rounded-[14px] p-3 text-[13.5px]" style={{ background: K.mist, color: K.forest }} data-testid="vote-admin-counts">
      <span className="font-[700]">{t("flock.votes.adminCounts", "Counts (admins only) · {{count}} votes", { count: vote.voters })}</span>
      {vote.choices.map((c) => (
        <span key={c.choice_id} className="flex justify-between gap-3"><span>{c.name}</span><span>{c.votes ?? 0}</span></span>
      ))}
    </div>
  );
}
