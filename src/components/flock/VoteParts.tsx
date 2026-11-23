import { Link } from "@tanstack/react-router";
import { Check, Star } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { K } from "@/components/kya";
import { voteDay, winnerNames, type Vote, type VoteChoice, type VoteState } from "@/lib/flockVotes";

// Do good voting (backlog 1.8, SpecVoting): the card at the top of Do good
// and on Today, the choice rows, and the results.

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

/** An open vote (lime, "Vote now") or a closed one's results (white). */
export function VoteCard({ vote }: { vote: Vote }) {
  const { t, i18n } = useTranslation();
  const open = vote.state === "open";
  const winners = winnerNames(vote);
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
            {vote.my_choice ? t("flock.votes.change", "Change your vote") : t("flock.votes.voteNow", "Vote now")}
          </Link>
        </>
      ) : (
        <>
          <span className="text-[13.5px] leading-[1.45]" style={{ color: K.ink }} data-testid="vote-outcome">
            {vote.too_few
              ? t("flock.votes.tooFew", "Too few votes to share.")
              : winners.length > 0
                ? t("flock.votes.chose", "The Flock chose {{names}}.", { names: winners.join(" and ") })
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

/** A choice to pick (SpecVoting screen 2): photo, name, a sentence, a radio. */
export function ChoiceRow({ choice, photo, picked, disabled, onPick }: {
  choice: VoteChoice; photo?: string; picked: boolean; disabled?: boolean; onPick: () => void;
}) {
  return (
    <button type="button" role="radio" aria-checked={picked} disabled={disabled} onClick={onPick} data-choice={choice.choice_id}
      className="flex w-full items-center gap-3 rounded-[16px] bg-white p-2.5 text-left disabled:opacity-60"
      style={{ border: `2px solid ${picked ? K.forest : "#dbe3da"}`, color: K.forest }}>
      <ChoicePhoto name={choice.name} photo={photo} />
      <span className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="text-[14.5px] font-[700] leading-[1.25]">{choice.name}</span>
        {choice.blurb && <span className="text-[12.5px] leading-[1.45]" style={{ color: K.ink }}>{choice.blurb}</span>}
      </span>
      <span aria-hidden="true" className="grid size-[22px] shrink-0 place-items-center rounded-full"
        style={{ border: `2px solid ${K.forest}`, background: picked ? K.forest : "#fff" }}>
        {picked && <Check className="size-3.5" color="#fff" strokeWidth={3} />}
      </span>
    </button>
  );
}

export function ChoicePhoto({ name, photo, size = 56 }: { name: string; photo?: string; size?: number }) {
  return photo
    ? <img src={photo} alt={name} className="shrink-0 rounded-[12px] object-cover" style={{ width: size, height: size }} />
    : (
      <span role="img" aria-label={name} className="grid shrink-0 place-items-center rounded-[12px] text-[18px] font-[700]"
        style={{ width: size, height: size, background: "linear-gradient(160deg,#9bcab8,#2d6a4f)", color: "#fff" }}>
        {name.trim().charAt(0).toUpperCase()}
      </span>
    );
}

/** Results after closing (SpecVoting screen 3): "The Flock chose", one bar
 *  per choice; admins also see each choice's count. */
export function VoteResults({ vote, admin }: { vote: Vote; admin: boolean }) {
  const { t } = useTranslation();
  const winners = winnerNames(vote);
  return (
    <div className="flex flex-col gap-2 rounded-[18px] bg-white px-4 py-3.5" style={{ color: K.forest }} data-testid="vote-results-card">
      {vote.too_few ? (
        <span className="text-[15px] leading-[1.45]" data-testid="vote-too-few">
          {t("flock.votes.tooFewLong", "Too few votes to share. Results show once at least 10 members have voted.")}
        </span>
      ) : (
        <>
          <span className="text-[11.5px] font-[700] uppercase tracking-[0.06em]" style={{ color: K.moss }}>{t("flock.votes.flockChose", "The Flock chose")}</span>
          <span className="text-[20px] font-[700] leading-[1.25]" data-testid="vote-winner">
            {winners.length > 0 ? winners.join(" · ") : t("flock.votes.noResult", "No votes were cast.")}
          </span>
          {vote.choices.map((c) => (
            <div key={c.choice_id} className="flex flex-col gap-1.5" data-result={c.choice_id}>
              <div className="flex justify-between gap-3 text-[14px]" style={{ fontWeight: c.winner ? 700 : 500 }}>
                <span>{c.name}</span>
                <span>{c.percent ?? 0}%</span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full" style={{ background: "#dbe3da" }}>
                <div className="h-full" style={{ width: `${Math.max(0, Math.min(100, c.percent ?? 0))}%`, background: c.winner ? K.moss : "#9bb5a8" }} />
              </div>
            </div>
          ))}
        </>
      )}
      {admin && <AdminCounts vote={vote} />}
    </div>
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
