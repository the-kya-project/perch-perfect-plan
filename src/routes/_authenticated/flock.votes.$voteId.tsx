import { useState, type ReactNode } from "react";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { CalendarDays, Check, Heart, Users, Vote as VoteIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { K, KyaBackRow, KyaBody, KyaHeader, KyaHeading, KyaPrimaryButton } from "@/components/kya";
import { FlockSubPage } from "@/components/flock/FlockSubPage";
import { FlockEmpty } from "@/components/flock/FlockChips";
import { AdminCounts, ChoicePhoto, ChoiceRow, DonationHeading, FoundersPill, VoteResults } from "@/components/flock/VoteParts";
import { useIsAdmin } from "@/lib/flockData";
import { castVote, isDonationVote, useInvalidateVotes, useVote, useVotePhotoUrls, voteDay, type Vote } from "@/lib/flockVotes";

// One vote (backlog 1.8, docs/flock/mockups/voting). While it's open: pick one
// choice and vote, once (VoteVote, VotePicked). After voting: the thank-you
// (VoteVoted). Once closed: how the donation is shared and Brittany's note
// (VoteResults), or plain results on a founders-only vote. Admins also see
// the counts at any time.
const ID = /^[0-9a-f-]{36}$/i;
export const Route = createFileRoute("/_authenticated/flock/votes/$voteId")({
  component: VotePage,
});

function useBack() {
  const router = useRouter();
  return () => {
    if (typeof window !== "undefined" && window.history.length > 1) router.history.back();
    else void router.navigate({ to: "/flock", search: { space: "good" } as never });
  };
}

function VoteHeader({ eyebrow, title, line, pill }: { eyebrow: string; title: ReactNode; line?: string; pill?: boolean }) {
  const { t } = useTranslation();
  const back = useBack();
  return (
    <KyaHeader>
      <KyaBackRow label={t("headers.back", "Back")} onBack={back} right={pill ? <FoundersPill /> : undefined} />
      <p className="m-0 mt-4 text-[12px] font-[700] uppercase tracking-[0.1em]" style={{ color: K.lime }} data-testid="vote-eyebrow">{eyebrow}</p>
      <KyaHeading as="h1" size={30} className="mt-2 text-white">{title}</KyaHeading>
      {line && <p className="m-0 mt-2 text-[15px] leading-[1.5]" style={{ color: K.paleGreen }}>{line}</p>}
    </KyaHeader>
  );
}

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

  const day = voteDay(vote.closes_at, i18n.language);
  const donation = isDonationVote(vote);
  const founders = vote.audience === "founders";
  const manage = isAdmin ? (
    <Link to="/admin/votes/$voteId" params={{ voteId: vote.vote_id }} className="inline-flex min-h-[44px] items-center justify-center text-[14px] font-[700]" style={{ color: K.moss }}>
      {t("flock.votes.manage", "Manage this vote")}
    </Link>
  ) : null;

  if (vote.state === "closed") {
    const eyebrow = donation
      ? t("flock.votes.closedEyebrow", "Do good vote · closed {{day}} · {{count}} votes", { day, count: vote.voters })
      : t("flock.votes.foundersClosedEyebrow", "Founders vote · closed {{day}} · {{count}} votes", { day, count: vote.voters });
    return (
      <>
        <VoteHeader eyebrow={eyebrow} pill={founders} title={donation ? <DonationHeading /> : vote.question}
          line={donation
            ? (vote.voters > 0
              ? t("flock.votes.sharedOutcome", "Every partner gets at least 10%. Your votes decided the rest.")
              : t("flock.votes.sharedEvenly", "No votes were cast, so the donation is shared evenly."))
            : undefined} />
        <KyaBody>
          <div className="flex flex-col gap-3.5" style={{ color: K.forest }} data-testid="vote-page" data-state="closed">
            <VoteResults vote={vote} admin={!!isAdmin} photos={photos} />
            {vote.announcement && <BrittanyNote text={vote.announcement} />}
            {manage}
          </div>
        </KyaBody>
      </>
    );
  }

  const mine = vote.my_choice ? vote.choices.find((c) => c.choice_id === vote.my_choice) ?? null : null;
  if (vote.state === "open" && mine) {
    const mineIndex = vote.choices.indexOf(mine);
    return <VotedScreen vote={vote} day={day} name={mine.name} index={mineIndex} photo={mine.photo_path ? photos?.[mine.photo_path] : undefined} admin={!!isAdmin} manage={manage} />;
  }

  const open = vote.state === "open";
  const eyebrow = !open
    ? t("flock.votes.draftLine", "Draft · only admins can see it")
    : founders
      ? t("flock.votes.foundersOpenEyebrow", "Founders vote · closes {{day}}", { day })
      : t("flock.votes.openEyebrow", "Do good vote · closes {{day}}", { day });
  const choice = vote.choices.find((c) => c.choice_id === picked) ?? null;

  const submit = async () => {
    if (!choice) return;
    setBusy(true); setError(null);
    try {
      await castVote(vote.vote_id, choice.choice_id);
      await invalidate();
    } catch (e) {
      const msg = (e as { message?: string })?.message;
      if (msg === "already_voted") {
        // Voted already (another device, or a double tap): show that vote.
        await invalidate();
      } else {
        setError(msg === "vote_closed"
          ? t("flock.votes.closedError", "This vote has closed, so it can't take new votes.")
          : t("flock.votes.error", "Your vote didn't save. Try again."));
        if (msg === "vote_closed") await invalidate();
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <VoteHeader eyebrow={eyebrow} title={vote.question} pill={founders} />
      <KyaBody>
        <div className="flex flex-col gap-3" style={{ color: K.forest }} data-testid="vote-page" data-state={vote.state}>
          <section className="flex items-start gap-3 rounded-[18px] px-4 py-3.5" style={{ background: K.sunflower, border: `2px solid ${K.forest}` }} data-testid="vote-note">
            <span className="grid size-[34px] shrink-0 place-items-center rounded-full" style={{ background: K.forest, color: K.sunflower }}>
              <Heart className="size-4" aria-hidden="true" />
            </span>
            <span className="text-[14px] leading-[1.45]">
              {donation
                ? t("flock.votes.howItWorks", "Every partner gets at least 10%. Your vote decides how the rest is shared. You can vote once.")
                : t("flock.votes.howItWorksFounders", "You can vote once. Results show when the vote closes.")}
            </span>
          </section>
          {vote.description && <p className="m-0 px-1 text-[14px] leading-[1.45]" style={{ color: K.ink }}>{vote.description}</p>}
          <div role="radiogroup" aria-label={vote.question} className="flex flex-col gap-2.5">
            {vote.choices.map((c, i) => (
              <ChoiceRow key={c.choice_id} choice={c} index={i} photo={c.photo_path ? photos?.[c.photo_path] : undefined}
                picked={picked === c.choice_id} disabled={!open || busy} onPick={() => setPicked(c.choice_id)} />
            ))}
          </div>
          <span className="text-center text-[13px]" style={{ color: K.quiet }} data-testid={choice ? "vote-final" : "vote-count"}>
            {choice
              ? t("flock.votes.finalNote", "Your vote is final once you tap the button.")
              : t("flock.votes.voted", "{{count}} members have voted", { count: vote.voters })}
          </span>
          {error && <p role="alert" className="m-0 text-[14px]" style={{ color: K.red }}>{error}</p>}
          {open && (
            <KyaPrimaryButton onClick={() => void submit()} disabled={!choice || busy}>
              {choice ? t("flock.votes.voteFor", "Vote for {{name}}", { name: choice.name }) : t("flock.votes.pickOne", "Pick one to vote")}
            </KyaPrimaryButton>
          )}
          {isAdmin && <AdminCounts vote={vote} />}
          {manage}
        </div>
      </KyaBody>
    </>
  );
}

function VotedScreen({ vote, day, name, index, photo, admin, manage }: {
  vote: Vote; day: string; name: string; index: number; photo?: string; admin: boolean; manage: ReactNode;
}) {
  const { t } = useTranslation();
  const back = useBack();
  const donation = isDonationVote(vote);
  return (
    <>
      <KyaHeader>
        <KyaBackRow label={t("headers.back", "Back")} onBack={back} right={vote.audience === "founders" ? <FoundersPill /> : undefined} />
        <div className="mt-2 flex flex-col items-center gap-3.5 text-center">
          <span className="grid size-[76px] place-items-center rounded-full" style={{ background: K.sunflower, border: "3px solid #fff", color: K.forest }}>
            <Check className="size-9" strokeWidth={3} aria-hidden="true" />
          </span>
          <div role="status"><KyaHeading as="h1" size={34} className="text-white">{t("flock.votes.thanks", "Thanks for voting")}</KyaHeading></div>
          <p className="m-0 text-[16px] leading-[1.5]" style={{ color: K.paleGreen }}>
            {donation
              ? t("flock.votes.thanksLine", "You've helped decide where this quarter's donation goes.")
              : t("flock.votes.thanksLineFounders", "You've helped decide what the Flock does first.")}
          </p>
        </div>
      </KyaHeader>
      <KyaBody>
        <div className="flex flex-col gap-3.5" style={{ color: K.forest }} data-testid="vote-page" data-state="voted">
          <section className="flex items-center gap-3.5 rounded-[20px] bg-white p-4" data-testid="vote-saved">
            <ChoicePhoto name={name} photo={photo} index={index} size={68} />
            <span className="flex min-w-0 flex-col gap-1">
              <span className="text-[12px] font-[700] uppercase tracking-[0.08em]" style={{ color: K.moss }}>{t("flock.votes.yourVote", "Your vote")}</span>
              <span className="text-[17px] font-[700] leading-[1.25]">{name}</span>
            </span>
          </section>
          <section className="flex flex-col gap-3 rounded-[20px] bg-white p-4">
            <InfoRow bg={K.lime} icon={<CalendarDays className="size-5" aria-hidden="true" />}>
              {t("flock.votes.resultsWhen", "Results show when the vote closes on {{day}}.", { day })}
            </InfoRow>
            <InfoRow bg="#d6e8dc" icon={<Users className="size-5" aria-hidden="true" />}>
              <span data-testid="vote-count">{t("flock.votes.votedSoFar", "{{count}} members have voted so far.", { count: vote.voters })}</span>
            </InfoRow>
            {donation && (
              <InfoRow bg="#f6e7c4" icon={<Heart className="size-5" aria-hidden="true" />}>
                {t("flock.votes.tenPercentLine", "Every partner gets at least 10%, and the votes share out the rest.")}
              </InfoRow>
            )}
          </section>
          {admin && <AdminCounts vote={vote} />}
          <Link to="/flock" search={{ space: "good" } as never} data-testid="vote-back-good"
            className="flex min-h-[56px] items-center justify-center rounded-full text-[17px] font-[700]"
            style={{ background: K.sunflower, color: K.forest, border: `2px solid ${K.forest}` }}>
            {t("flock.votes.backToGood", "Back to Do good")}
          </Link>
          {manage}
        </div>
      </KyaBody>
    </>
  );
}

function InfoRow({ bg, icon, children }: { bg: string; icon: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="grid size-10 shrink-0 place-items-center rounded-[12px]" style={{ background: bg, color: K.forest }}>{icon}</span>
      <span className="text-[15px] leading-[1.4]">{children}</span>
    </div>
  );
}

/** The dark "A note from Brittany" card. */
function BrittanyNote({ text }: { text: string }) {
  const { t } = useTranslation();
  return (
    <section className="flex flex-col gap-3 rounded-[20px] p-[18px] text-white" style={{ background: K.forest }} data-testid="vote-announcement">
      <div className="flex items-center gap-3">
        <span className="grid size-11 place-items-center rounded-full text-[20px] font-[700]" style={{ background: K.lime, color: K.forest, fontFamily: "'Newsreader', Georgia, serif" }} aria-hidden="true">B</span>
        <span className="flex flex-col gap-0.5">
          <span className="text-[15px] font-[700]">{t("flock.votes.note", "A note from Brittany")}</span>
          <span className="text-[12px]" style={{ color: K.paleGreen }}>{t("flock.votes.noteFrom", "The Kya Project")}</span>
        </span>
      </div>
      <p className="m-0 whitespace-pre-line text-[18px] leading-[1.45]" style={{ fontFamily: "'Newsreader', Georgia, serif" }}>{text}</p>
    </section>
  );
}
