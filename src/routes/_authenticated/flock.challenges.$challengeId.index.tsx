import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Flag } from "lucide-react";
import { useTranslation } from "react-i18next";
import { K, KyaBackRow, KyaBody, KyaGroupLabel, KyaHeader, KyaHeading, KyaSwitch, KyaTitle } from "@/components/kya";
import { FlockSubPage } from "@/components/flock/FlockSubPage";
import { FlockEmpty } from "@/components/flock/FlockChips";
import { BirdThumb } from "@/components/flock/FlockPeople";
import { BadgeCircle } from "@/components/flock/BadgeParts";
import { ChallengeFaces, challengeProgress, challengeSummary, PromptChecklist } from "@/components/flock/ChallengeParts";
import { LoadMore, PostList } from "@/components/flock/PostFeed";
import { useIsAdmin, useOwnBirdPhotoUrls, useOwnBirds } from "@/lib/flockData";
import {
  challengeError, joinChallenge, nextPrompt, setChallengeFeature, useChallenge, useChallengeEntries, useInvalidateChallenges,
  type Challenge, type ChallengeEntry,
} from "@/lib/flockChallenges";

// One challenge (backlog 1.10, SpecChallenges screen 2): the caller's progress
// (the prompt checklist, or whether their journey ended with "learned it";
// journeys have no milestones since 1.20b) and "Post today's
// entry", then the entries feed. Before joining: pick a bird and whether your
// entries may be featured. After the end day the feed stays readable and the
// wrap-up shows. ?finished=1 (after the last entry) shows the celebration.
const ID = /^[0-9a-f-]{36}$/i;
export const Route = createFileRoute("/_authenticated/flock/challenges/$challengeId/")({
  validateSearch: (s: Record<string, unknown>): { finished?: 1 } => (s.finished === 1 || s.finished === "1" ? { finished: 1 } : {}),
  component: ChallengePage,
});

function ChallengePage() {
  const { t } = useTranslation();
  const { challengeId } = Route.useParams();
  const { finished: justFinished } = Route.useSearch();
  const valid = ID.test(challengeId);
  const { data: c, isLoading } = useChallenge(valid ? challengeId : "");
  const entries = useChallengeEntries(valid && c ? challengeId : "");
  const { data: isAdmin } = useIsAdmin();
  const title = t("flock.challenges.title", "Challenge");

  if (isLoading) return <FlockSubPage title={title} fallback="/flock">{null}</FlockSubPage>;
  if (!valid || !c) {
    return (
      <FlockSubPage title={title} fallback="/flock">
        <FlockEmpty icon={<Flag className="size-6" />} title={t("flock.challenges.missingTitle", "This challenge isn't here")}>
          {t("flock.challenges.missing", "It may have ended a while ago, or it's for another chapter.")}
        </FlockEmpty>
      </FlockSubPage>
    );
  }

  const list = (entries.data?.pages ?? []).flat();
  const pinned = c.pinned_post_id ? list.find((e) => e.post_id === c.pinned_post_id) : undefined;
  const featured = c.featured_post_ids.flatMap((id) => list.filter((e) => e.post_id === id));
  const rest = list.filter((e) => e.post_id !== c.pinned_post_id);
  return (
    <>
      <ChallengeHeader c={c} />
      <KyaBody>
        <div className="flex flex-col gap-3" style={{ color: K.forest }} data-testid="challenge-page" data-state={c.state} data-kind={c.kind}>
          {c.description && <p className="m-0 text-[14.5px] leading-[1.5]" style={{ color: K.ink }}>{c.description}</p>}
          {(c.state === "draft" || c.state === "upcoming") && (
            <p className="m-0 rounded-[14px] p-3 text-[14px]" style={{ background: K.amberBg, color: K.amberText }} data-testid="challenge-not-started">
              {t("flock.challenges.notStarted", "Only admins see this challenge until it starts.")}
            </p>
          )}
          {(c.finished || justFinished) && <FinishedCard c={c} />}
          {c.state === "open" && !c.joined && <JoinCard c={c} />}
          {c.joined && <ProgressCard c={c} />}
          {c.state === "closed" && (
            <p className="m-0 text-[14px] leading-[1.5]" style={{ color: K.ink }} data-testid="challenge-closed">
              {t("flock.challenges.closedLine", "This challenge has closed. Its entries stay here to read.")}
            </p>
          )}
          {c.wrap_up && (
            <section className="flex flex-col gap-2 rounded-[18px] bg-white px-4 py-3.5" data-testid="challenge-wrap-up">
              <span className="text-[11.5px] font-[700] uppercase tracking-[0.06em]" style={{ color: K.moss }}>{t("flock.challenges.wrapUp", "Wrap-up")}</span>
              <p className="m-0 whitespace-pre-wrap text-[14.5px] leading-[1.5]">{c.wrap_up}</p>
            </section>
          )}
          {featured.length > 0 && (
            <>
              <KyaGroupLabel>{t("flock.challenges.featured", "Featured entries")}</KyaGroupLabel>
              <div className="flex flex-col gap-3" data-testid="challenge-featured"><EntryList entries={featured} c={c} /></div>
            </>
          )}
          {pinned && (
            <>
              <KyaGroupLabel>{t("flock.challenges.pinned", "Pinned entry")}</KyaGroupLabel>
              <div data-testid="challenge-pinned"><EntryList entries={[pinned]} c={c} /></div>
            </>
          )}
          <KyaGroupLabel>{t("flock.challenges.entries", "Entries")}</KyaGroupLabel>
          {rest.length > 0 ? (
            <div className="flex flex-col gap-3" data-testid="challenge-entries">
              <EntryList entries={rest} c={c} />
              <LoadMore hasMore={!!entries.hasNextPage} loading={entries.isFetchingNextPage} onMore={() => void entries.fetchNextPage()} />
            </div>
          ) : !entries.isLoading && (
            <p className="m-0 text-[14px]" style={{ color: K.ink }} data-testid="challenge-no-entries">
              {c.state === "closed"
                ? t("flock.challenges.noEntriesClosed", "Nobody posted an entry this time.")
                : t("flock.challenges.noEntries", "No entries yet. Yours could be the first.")}
            </p>
          )}
          {isAdmin && (
            <Link to="/admin/challenges/$challengeId" params={{ challengeId: c.challenge_id }} data-testid="challenge-manage"
              className="inline-flex min-h-[44px] items-center justify-center text-[14px] font-[700]" style={{ color: K.moss }}>
              {t("flock.challenges.manage", "Manage this challenge")}
            </Link>
          )}
        </div>
      </KyaBody>
    </>
  );
}

/** The forest header: the title and "Juno · 3 of 7 done" (mockup screen 2). */
function ChallengeHeader({ c }: { c: Challenge }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const back = () => {
    if (typeof window !== "undefined" && window.history.length > 1) window.history.back();
    else void navigate({ to: "/flock" });
  };
  return (
    <KyaHeader>
      <KyaBackRow label={t("headers.back", "Back")} onBack={back} />
      <KyaTitle title={c.title} line={c.joined ? challengeProgress(t, c) : challengeSummary(t, c)} />
    </KyaHeader>
  );
}

/** Each entry with the prompt it answers ("Day 3" in the mockup). */
function EntryList({ entries, c }: { entries: ChallengeEntry[]; c: Challenge }) {
  const { t } = useTranslation();
  const prompts = new Map(c.prompts.map((p) => [p.position, p.body]));
  return (
    <>
      {entries.map((e) => (
        <div key={e.post_id} className="flex flex-col gap-1" data-entry={e.post_id}>
          {e.prompt !== null && prompts.has(e.prompt) && (
            <span className="text-[12px] font-[700]" style={{ color: K.moss }} data-testid="entry-prompt">
              {t("flock.challenges.entryPrompt", "{{n}}. {{prompt}}", { n: e.prompt, prompt: prompts.get(e.prompt) })}
            </span>
          )}
          <PostList posts={[e]} />
        </div>
      ))}
    </>
  );
}

/** Before joining: which bird, and whether entries may be featured. */
function JoinCard({ c }: { c: Challenge }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const invalidate = useInvalidateChallenges();
  const { data: birds } = useOwnBirds();
  const { data: photos } = useOwnBirdPhotoUrls(birds ?? [], 120);
  const [bird, setBird] = useState<string | null>(null);
  const [feature, setFeature] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const picked = bird ?? (birds?.length === 1 ? birds[0].id : null);
  const join = async () => {
    if (!picked) return;
    setBusy(true);
    setError(null);
    try {
      const journey = await joinChallenge(c, picked, feature);
      await invalidate();
      // A journey challenge with no journey yet goes straight to starting it.
      if (c.kind === "journey" && !journey && c.template_slug) {
        void navigate({ to: "/flock/journeys/setup", search: { bird: picked, template: c.template_slug } });
      }
    } catch (e) {
      setError(challengeError(e) === "challenge_closed"
        ? t("flock.challenges.closedJoin", "This challenge has closed.")
        : t("flock.challenges.joinError", "We couldn't join you up. Try again."));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="flex flex-col gap-3 rounded-[18px] px-4 py-3.5" style={{ background: K.lime }} data-testid="challenge-join">
      <ChallengeFaces faces={c.faces} />
      {(birds ?? []).length === 0 ? (
        <p className="m-0 text-[14px]">{t("flock.challenges.noBirds", "Add a bird in the care app to join a challenge.")}</p>
      ) : (
        <>
          <span className="text-[14px] font-[700]" id="join-bird">{t("flock.challenges.whichBird", "Who's taking part?")}</span>
          <div role="group" aria-labelledby="join-bird" className="flex flex-wrap gap-2" data-testid="join-birds">
            {(birds ?? []).map((b) => {
              const on = b.id === picked;
              return (
                <button key={b.id} type="button" aria-pressed={on} data-bird={b.id} onClick={() => setBird(b.id)}
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-white py-1 pl-1 pr-3.5 text-[14px] font-[700]"
                  style={{ border: on ? `2px solid ${K.forest}` : "1px solid #c9d3c8" }}>
                  <BirdThumb name={b.name} photo={photos[b.id]} size={32} />{b.name}
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-3">
            <span className="flex-1 text-[14px] leading-[1.45]">{t("flock.challenges.featureOk", "It's OK to feature my entries in the wrap-up.")}</span>
            <KyaSwitch checked={feature} onChange={setFeature} label={t("flock.challenges.featureOk", "It's OK to feature my entries in the wrap-up.")} />
          </div>
          {error && <p role="alert" className="m-0 text-[14px]" style={{ color: K.red }}>{error}</p>}
          <button type="button" onClick={() => void join()} disabled={!picked || busy} data-testid="challenge-join-button"
            className="inline-flex min-h-[44px] w-full items-center justify-center rounded-full px-4 text-[14px] font-[700] disabled:opacity-50"
            style={{ background: K.sunflower, color: K.forest, border: `2px solid ${K.forest}` }}>
            {busy ? t("flock.challenges.joining", "Joining…") : t("flock.challenges.join", "Join the challenge")}
          </button>
        </>
      )}
    </section>
  );
}

/** After joining: the checklist (standalone) or the journey's progress, the
 *  next step, and the feature switch. */
function ProgressCard({ c }: { c: Challenge }) {
  const { t } = useTranslation();
  const invalidate = useInvalidateChallenges();
  const next = nextPrompt(c);
  const open = c.state === "open";
  const [feature, setFeature] = useState(c.feature_ok);
  return (
    <section className="flex flex-col gap-2.5 rounded-[18px] bg-white px-4 py-3.5" data-testid="challenge-progress">
      {c.kind === "standalone" ? (
        <>
          <PromptChecklist prompts={c.prompts} current={next?.position ?? null} />
          {open && next && (
            <Link to="/flock/challenges/$challengeId/entry" params={{ challengeId: c.challenge_id }} search={{ prompt: next.position }} data-testid="challenge-post"
              className="inline-flex min-h-[44px] w-full items-center justify-center rounded-full px-4 text-[14px] font-[700]"
              style={{ background: K.sunflower, color: K.forest, border: `2px solid ${K.forest}` }}>
              {t("flock.challenges.postEntry", "Post today's entry")}
            </Link>
          )}
        </>
      ) : (
        <>
          <span className="text-[15px] font-[700]">{c.template_name}</span>
          <span className="text-[13.5px] leading-[1.45]" style={{ color: K.ink }} data-testid="challenge-journey-progress">
            {c.finished
              ? t("flock.challenges.journeyDone", "{{name}} learned it. You finished the challenge!", { name: c.my_bird_name ?? "" })
              : t("flock.challenges.journeyHow", "Finish the journey with “learned it” by the last day to complete the challenge.")}
          </span>
          {c.my_journey_id ? (
            <Link to="/flock/journeys/$journeyId" params={{ journeyId: c.my_journey_id }} data-testid="challenge-open-journey"
              className="inline-flex min-h-[44px] w-full items-center justify-center rounded-full px-4 text-[14px] font-[700]"
              style={{ background: K.sunflower, color: K.forest, border: `2px solid ${K.forest}` }}>
              {t("flock.challenges.openJourney", "Open the journey")}
            </Link>
          ) : open && c.my_bird_id && c.template_slug && (
            <Link to="/flock/journeys/setup" search={{ bird: c.my_bird_id, template: c.template_slug }} data-testid="challenge-start-journey"
              className="inline-flex min-h-[44px] w-full items-center justify-center rounded-full px-4 text-[14px] font-[700]"
              style={{ background: K.sunflower, color: K.forest, border: `2px solid ${K.forest}` }}>
              {t("flock.challenges.startJourney", "Start the journey")}
            </Link>
          )}
          {open && (
            <Link to="/flock/challenges/$challengeId/entry" params={{ challengeId: c.challenge_id }} search={{}} data-testid="challenge-post"
              className="inline-flex min-h-[44px] w-full items-center justify-center rounded-full px-4 text-[14px] font-[700]"
              style={{ background: K.mist, color: K.forest }}>
              {t("flock.challenges.postJourneyEntry", "Post an entry")}
            </Link>
          )}
        </>
      )}
      <div className="flex items-center gap-3 border-t pt-2" style={{ borderColor: K.line }}>
        <span className="flex-1 text-[13.5px] leading-[1.45]" style={{ color: K.ink }}>{t("flock.challenges.featureOk", "It's OK to feature my entries in the wrap-up.")}</span>
        <KyaSwitch checked={feature} label={t("flock.challenges.featureOk", "It's OK to feature my entries in the wrap-up.")}
          onChange={(v) => { setFeature(v); void setChallengeFeature(c.challenge_id, v).then(invalidate).catch(() => setFeature(!v)); }} />
      </div>
    </section>
  );
}

/** The small celebration: finishing is the goal, so no ranks or prizes. */
function FinishedCard({ c }: { c: Challenge }) {
  const { t } = useTranslation();
  return (
    <section className="flex flex-col items-center gap-2 rounded-[18px] px-4 py-4 text-center" style={{ background: K.forest, color: "#fff" }} data-testid="challenge-finished">
      <BadgeCircle badge="challenge_champ" earned size={64} />
      <KyaHeading size={22} className="text-white">{t("flock.challenges.finishedTitle", "You finished!")}</KyaHeading>
      <p className="m-0 text-[14.5px] leading-[1.5]" style={{ color: K.paleGreen }}>
        {c.my_bird_name
          ? t("flock.challenges.finishedLine", "You and {{bird}} finished {{title}}. That earns the Challenge champ badge.", { bird: c.my_bird_name, title: c.title })
          : t("flock.challenges.finishedLineNoBird", "You finished {{title}}. That earns the Challenge champ badge.", { title: c.title })}
      </p>
      <Link to="/flock/you/badges" className="inline-flex min-h-[44px] items-center text-[14px] font-[700]" style={{ color: K.lime }}>
        {t("flock.challenges.seeBadges", "See your badges")}
      </Link>
    </section>
  );
}
