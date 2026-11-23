import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Vote as VoteIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { K, KyaPrimaryButton } from "@/components/kya";
import { FlockSubPage } from "@/components/flock/FlockSubPage";
import { FlockEmpty } from "@/components/flock/FlockChips";
import { AdminCounts, ChoiceRow, FoundersPill, VoteResults } from "@/components/flock/VoteParts";
import { useIsAdmin } from "@/lib/flockData";
import { castVote, useInvalidateVotes, useVote, useVotePhotoUrls, voteDay } from "@/lib/flockVotes";

// One vote (backlog 1.8, SpecVoting screens 2 and 3). While it's open: pick
// one choice and vote, or change your vote; only how many have voted shows.
// Once it's closed: the results and Brittany's note, or "too few votes to
// share". Admins also see the counts at any time.
const ID = /^[0-9a-f-]{36}$/i;
export const Route = createFileRoute("/_authenticated/flock/votes/$voteId")({
  component: VotePage,
});

function VotePage() {
  const { t, i18n } = useTranslation();
  const { voteId } = Route.useParams();
  const valid = ID.test(voteId);
  const { data: vote, isLoading } = useVote(valid ? voteId : "00000000-0000-0000-0000-000000000000");
  const { data: isAdmin } = useIsAdmin();
  const { data: photos } = useVotePhotoUrls(vote?.choices.map((c) => c.photo_path) ?? []);
  const invalidate = useInvalidateVotes();
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  // Start from the member's own vote once it loads.
  const mine = vote?.my_choice ?? null;
  useEffect(() => { setPicked(mine); }, [mine]);

  const title = t("flock.votes.title", "Vote");
  if (isLoading) return <FlockSubPage title={title} fallback="/flock">{null}</FlockSubPage>;
  if (!valid || !vote) {
    return (
      <FlockSubPage title={title} fallback="/flock">
        <FlockEmpty icon={<VoteIcon className="size-6" />} title={t("flock.votes.missingTitle", "This vote isn't here")}>
          {t("flock.votes.missing", "It may have been removed, or it's only for founding members.")}
        </FlockEmpty>
      </FlockSubPage>
    );
  }

  const open = vote.state === "open";
  const line = vote.state === "draft"
    ? t("flock.votes.draftLine", "Draft · only admins can see it")
    : open
      ? t("flock.votes.closesLine", "Closes {{day}}", { day: voteDay(vote.closes_at, i18n.language) })
      : t("flock.votes.closedLine", "Closed · {{count}} votes", { count: vote.voters });
  const choice = vote.choices.find((c) => c.choice_id === picked) ?? null;

  const submit = async () => {
    if (!choice) return;
    setBusy(true); setError(null); setSaved(false);
    try {
      await castVote(vote.vote_id, choice.choice_id);
      await invalidate();
      setSaved(true);
    } catch (e) {
      const msg = (e as { message?: string })?.message;
      setError(msg === "vote_closed"
        ? t("flock.votes.closedError", "This vote has closed, so it can't take new votes.")
        : t("flock.votes.error", "Your vote didn't save. Try again."));
      if (msg === "vote_closed") await invalidate();
    } finally {
      setBusy(false);
    }
  };

  return (
    <FlockSubPage title={title} line={line} fallback="/flock">
      <div className="flex flex-col gap-3" style={{ color: K.forest }} data-testid="vote-page" data-state={vote.state}>
        <div className="flex items-start gap-2">
          <h2 className="m-0 flex-1 text-[18px] font-[700] leading-[1.25]">{vote.question}</h2>
          {vote.audience === "founders" && <FoundersPill />}
        </div>
        {vote.description && <p className="m-0 text-[14px] leading-[1.5]" style={{ color: K.ink }}>{vote.description}</p>}

        {vote.state === "closed" ? (
          <>
            <VoteResults vote={vote} admin={!!isAdmin} />
            {vote.announcement && (
              <div className="flex flex-col gap-1.5 rounded-[18px] bg-white px-4 py-3.5" data-testid="vote-announcement">
                <span className="text-[14px] font-[700]">{t("flock.votes.note", "A note from Brittany")}</span>
                <span className="whitespace-pre-line text-[13.5px] leading-[1.45]">{vote.announcement}</span>
              </div>
            )}
          </>
        ) : (
          <>
            <p className="m-0 text-[13px] leading-[1.45]" style={{ color: K.ink }}>
              {t("flock.votes.howItWorks", "You can change your vote until it closes. Results show after.")}
            </p>
            <div role="radiogroup" aria-label={vote.question} className="flex flex-col gap-2.5">
              {vote.choices.map((c) => (
                <ChoiceRow key={c.choice_id} choice={c} photo={c.photo_path ? photos?.[c.photo_path] : undefined}
                  picked={picked === c.choice_id} disabled={!open || busy} onPick={() => { setPicked(c.choice_id); setSaved(false); }} />
              ))}
            </div>
            <span className="text-[12.5px]" style={{ color: K.ink }} data-testid="vote-count">
              {t("flock.votes.voted", "{{count}} members have voted", { count: vote.voters })}
            </span>
            {error && <p role="alert" className="m-0 text-[14px]" style={{ color: K.red }}>{error}</p>}
            {saved && (
              <p role="status" className="m-0 rounded-[14px] px-4 py-3 text-[14.5px] font-[700]" style={{ background: K.lime }} data-testid="vote-saved">
                {t("flock.votes.saved", "Thanks for voting. You can change it until the vote closes.")}
              </p>
            )}
            {open && (
              <KyaPrimaryButton onClick={() => void submit()} disabled={!choice || busy || choice.choice_id === mine}>
                {choice
                  ? (mine && choice.choice_id !== mine
                    ? t("flock.votes.changeTo", "Change my vote to {{name}}", { name: choice.name })
                    : t("flock.votes.voteFor", "Vote for {{name}}", { name: choice.name }))
                  : t("flock.votes.pickOne", "Pick one to vote")}
              </KyaPrimaryButton>
            )}
            {isAdmin && <AdminCounts vote={vote} />}
          </>
        )}
        {isAdmin && (
          <Link to="/admin/votes/$voteId" params={{ voteId: vote.vote_id }} className="inline-flex min-h-[44px] items-center justify-center text-[14px] font-[700]" style={{ color: K.moss }}>
            {t("flock.votes.manage", "Manage this vote")}
          </Link>
        )}
      </div>
    </FlockSubPage>
  );
}
