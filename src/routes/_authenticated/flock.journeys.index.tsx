import { useState } from "react";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { ChevronRight, Plus, Route as RouteIcon, Settings2 } from "lucide-react";
import { useIsAdmin } from "@/lib/flockData";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { FlockBody, FlockHeader } from "@/components/FlockShell";
import { FlockChips, FlockEmpty } from "@/components/flock/FlockChips";
import { K } from "@/components/kya";
import { DayBadge, JourneyEyebrow, WhichJourneySheet } from "@/components/flock/JourneyParts";
import { JourneyBigCard, useCardBirdPhotos } from "@/components/flock/JourneyBrowse";
import { ChallengeCard } from "@/components/flock/ChallengeParts";
import { useCurrentChallenges } from "@/lib/flockChallenges";
import { useJourneyAccess, useJourneyFeed, useYourJourneys, type JourneysFilterKey, type YourJourney } from "@/lib/journeyData";
import { daysSince, journeyDay, journeyDays, sortYourJourneys } from "@/lib/journeys";
import { JOURNEYS_FILTERS, pickOptional, type JourneysFilter } from "@/lib/flockNav";

// Journeys (journeys redesign, screen 1): "Your journeys" (active and paused,
// then finished), "Start something new", and for Flock members "From the
// Flock": other members' community journeys, with the filter chips. Member
// skills join "From the Flock" in 1.20c.
export const Route = createFileRoute("/_authenticated/flock/journeys/")({
  validateSearch: (s: Record<string, unknown>): { filter?: JourneysFilter } => ({ filter: pickOptional(s.filter, JOURNEYS_FILTERS) }),
  component: FlockJourneys,
});

function chipLabel(t: TFunction, f: JourneysFilter): string {
  switch (f) {
    case "for-you": return t("flock.journeys.forYou", "For you");
    case "following": return t("flock.journeys.following", "Following");
    case "tricks": return t("flock.journeys.tricks", "Tricks");
    case "basics": return t("flock.journeys.basics", "Basics");
  }
}

function emptyCopy(t: TFunction, f: JourneysFilter): { title: string; line: string } {
  switch (f) {
    case "for-you": return {
      title: t("flock.journeys.empty.forYouTitle", "No journeys yet"),
      line: t("flock.journeys.empty.forYouSkills", "Journeys are members' stories of teaching their birds: a new trick, a calmer vet visit, a better diet. The first ones will appear here."),
    };
    case "following": return {
      title: t("flock.journeys.empty.followingTitle", "Not following anyone yet"),
      line: t("flock.journeys.empty.followingUpdates", "Follow a member's journey and each update they share will show up here."),
    };
    case "tricks": return {
      title: t("flock.journeys.empty.tricksTitle", "No trick journeys yet"),
      line: t("flock.journeys.empty.tricks", "Training stories, from a first target touch to a reliable recall, will collect here."),
    };
    case "basics": return {
      title: t("flock.journeys.empty.basicsTitle", "No basics journeys yet"),
      line: t("flock.journeys.empty.basics", "Stories about the everyday foundations, like diet changes, sleep, and stepping up, will collect here."),
    };
  }
}

/** One of your journeys: Day N (or how it ended), the bird and skill, and
 *  where it stands. */
function YourJourneyRow({ j }: { j: YourJourney }) {
  const { t } = useTranslation();
  const skill = j.template?.name ?? j.custom_name ?? "";
  const since = daysSince(j.last_posted);
  const line = j.status === "finished"
    ? t("flock.journeys.card.learned", "Learned it · {{count}} days", { count: journeyDays(j.started_at, j.finished_at) })
    : j.status === "happy_where_we_are" ? t("flock.journeys.card.happy", "Happy where we are")
    : j.status === "paused" ? t("flock.journeys.yours.paused", "Paused")
    : since == null ? t("flock.journeys.which.never", "Nothing posted yet")
    : since === 0 ? t("flock.journeys.which.today", "Last posted today")
    : since === 1 ? t("flock.journeys.which.yesterday", "Last posted yesterday")
    : t("flock.journeys.which.days", "Last posted {{count}} days ago", { count: since });
  return (
    <Link to="/flock/journeys/$journeyId" params={{ journeyId: j.id }} data-your-journey={j.id} data-status={j.status}
      className="flex min-h-[60px] items-center gap-3 rounded-[14px] bg-white px-3 py-2" style={{ color: K.forest }}>
      <DayBadge day={j.status === "active" || j.status === "paused" ? journeyDay(j.started_at) : journeyDays(j.started_at, j.finished_at)} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[15px] font-[700]">{j.bird?.name ?? ""} · {skill}</span>
        <span className="text-[12.5px]" style={{ color: K.quiet }}>{line}</span>
      </span>
      <ChevronRight className="size-[18px] shrink-0" aria-hidden="true" />
    </Link>
  );
}

function FlockJourneys() {
  const { t } = useTranslation();
  const { filter } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const current: JourneysFilter = filter ?? "for-you";
  const empty = emptyCopy(t, current);
  const { data: access } = useJourneyAccess();
  const community = !!access?.can_view_community;
  const { data: yours } = useYourJourneys();
  const sorted = sortYourJourneys(yours ?? []);
  const active = sorted.filter((j) => j.status === "active");
  const key: JourneysFilterKey = current === "for-you" ? "for_you" : current;
  const { data: feed, isLoading: feedLoading } = useJourneyFeed(key);
  const others = (feed ?? []).filter((c) => !c.is_mine);
  const photos = useCardBirdPhotos(others);
  const { data: challenges } = useCurrentChallenges();
  const { data: isAdmin } = useIsAdmin();
  const [picking, setPicking] = useState(false);
  const postUpdate = () => {
    if (!active.length) return;
    if (active.length === 1) void navigate({ to: "/flock/journeys/$journeyId/post", params: { journeyId: active[0].id }, search: {} });
    else setPicking(true);
  };
  return (
    <>
      <FlockHeader title={t("flock.journeys.title", "Journeys")} />
      <FlockBody>
        {sorted.length > 0 && (
          <section className="flex flex-col gap-2" data-testid="your-journeys">
            <JourneyEyebrow>{t("flock.journeys.yours.title", "Your journeys")}</JourneyEyebrow>
            {sorted.map((j) => <YourJourneyRow key={j.id} j={j} />)}
          </section>
        )}
        {active.length > 0 && (
          <button type="button" onClick={postUpdate} data-testid="post-update-any"
            className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-full border-2 bg-white px-5 text-[15px] font-[700] active:scale-[0.99]"
            style={{ borderColor: K.forest, color: K.forest }}>
            {t("flock.journeys.page.post", "Post an update")}
          </button>
        )}
        <Link
          to="/flock/journeys/start"
          data-testid="start-journey"
          className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-full border-2 px-5 text-[15px] font-[700] active:scale-[0.99]"
          style={{ background: K.sunflower, borderColor: K.forest, color: K.forest }}
        >
          <Plus className="size-4" aria-hidden="true" />{t("flock.journeys.startSomething", "Start something new")}
        </Link>
        {/* Challenges (1.10): open ones, Flock-wide first. */}
        {isAdmin && (
          <Link to="/admin/challenges" data-testid="manage-challenges"
            className="inline-flex min-h-[44px] items-center gap-2 self-end rounded-full bg-white px-4 text-[14px] font-[700]" style={{ color: K.forest, border: `1.5px solid ${K.line}` }}>
            <Settings2 className="size-4" aria-hidden="true" />{t("flock.challenges.manageAll", "Manage challenges")}
          </Link>
        )}
        {(challenges ?? []).map((c) => <ChallengeCard key={c.challenge_id} challenge={c} />)}
        {community && (
          <section className="flex flex-col gap-3" data-testid="from-the-flock">
            <div className="pt-1.5"><JourneyEyebrow>{t("flock.journeys.fromFlock", "From the Flock")}</JourneyEyebrow></div>
            <FlockChips
              label={t("flock.journeys.filterAria", "Filter journeys")}
              testId="journeys-chips"
              options={JOURNEYS_FILTERS.map((f) => ({ value: f, label: chipLabel(t, f) }))}
              value={current}
              onChange={(v) => void navigate({ search: { filter: !v || v === "for-you" ? undefined : v }, replace: true })}
            />
            {others.length > 0 ? (
              <div className="flex flex-col gap-3" data-testid="journey-cards">
                {others.map((c) => <JourneyBigCard key={c.journey_id} card={c} photo={photos[c.bird_id]} />)}
              </div>
            ) : !feedLoading ? (
              <FlockEmpty icon={<RouteIcon className="size-6" />} title={empty.title}>{empty.line}</FlockEmpty>
            ) : null}
          </section>
        )}
        {picking && active.length > 0 && (
          <WhichJourneySheet
            journeys={active.map((j) => ({
              id: j.id, title: `${j.bird?.name ?? ""} · ${j.template?.name ?? j.custom_name ?? ""}`, day: journeyDay(j.started_at), daysSince: daysSince(j.last_posted),
            }))}
            onPick={(id) => void navigate({ to: "/flock/journeys/$journeyId/post", params: { journeyId: id }, search: {} })}
            onStartNew={() => void navigate({ to: "/flock/journeys/start" })}
            onClose={() => setPicking(false)}
          />
        )}
      </FlockBody>
    </>
  );
}
