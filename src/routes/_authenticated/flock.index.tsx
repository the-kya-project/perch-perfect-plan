import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Settings2 } from "lucide-react";
import { K } from "@/components/kya";
import { VoteCard } from "@/components/flock/VoteParts";
import { TodayBadges } from "@/components/flock/BadgeParts";
import { ChallengeCard } from "@/components/flock/ChallengeParts";
import { useCurrentChallenges } from "@/lib/flockChallenges";
import { useIsAdmin } from "@/lib/flockData";
import { useCurrentVotes, votesFor } from "@/lib/flockVotes";
import { JourneyMomentCard } from "@/components/flock/JourneyToday";
import { ComposePrompt, LoadMore, PostMenus, usePostMedia } from "@/components/flock/PostFeed";
import { PostCard } from "@/components/flock/PostParts";
import { TodaysIdeaCard } from "@/components/flock/IdeaParts";
import { useIdeaPhotos, useTodaysIdea } from "@/lib/flockIdeas";
import { useCommentCounts, useFlockFeed, type FlockPost } from "@/lib/flockPostData";
import { feedSpaceFor, mergeFeed } from "@/lib/flockPosts";
import { FollowRings, useCardBirdPhotos } from "@/components/flock/JourneyBrowse";
import { useFollowingLatest, useJourneyFollowing, useMomentCards, useWeighReminders } from "@/lib/journeyData";
import { WeighTodayCard } from "@/components/flock/JourneyDiet";
import { Sun } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { FlockBody, FlockHeader } from "@/components/FlockShell";
import { FlockChips, FlockEmpty } from "@/components/flock/FlockChips";
import { spaceLabel } from "@/components/flock/SpacesSheet";
import { FLOCK_SPACES, TODAY_FILTERS, pickOptional, type FlockSpace, type TodayFilter } from "@/lib/flockNav";

// Today: one feed for everything in the Flock. A space (the chips, or the
// header's Spaces sheet) narrows it; ?space= keeps the choice across a reload.
export const Route = createFileRoute("/_authenticated/flock/")({
  validateSearch: (s: Record<string, unknown>): { space?: FlockSpace } => ({ space: pickOptional(s.space, FLOCK_SPACES) }),
  component: FlockToday,
});

function filterLabel(t: TFunction, f: TodayFilter): string {
  return f === "everything" ? t("flock.today.everything", "Everything") : spaceLabel(t, f);
}

function emptyCopy(t: TFunction, f: TodayFilter): { title: string; line: string } {
  switch (f) {
    case "everything": return {
      title: t("flock.today.empty.everythingTitle", "Quiet for now"),
      line: t("flock.today.empty.everything", "This is where the Flock's days come together. Posts, journeys, and today's idea will show up here."),
    };
    case "learn": return {
      title: t("flock.today.empty.learnTitle", "No questions yet"),
      line: t("flock.today.empty.learn", "When members ask, answer, and share what's working with their birds, it will gather here."),
    };
    case "good": return {
      title: t("flock.today.empty.goodTitle", "Nothing here yet"),
      line: t("flock.today.empty.good", "Rescue stories, conservation news, and ways to pitch in for parrots will gather here."),
    };
    case "start": return {
      title: t("flock.today.empty.startTitle", "Say hello soon"),
      line: t("flock.today.empty.start", "Introductions and first questions land here. It's the easiest place to begin once the Flock opens."),
    };
  }
}

function FlockToday() {
  const { t } = useTranslation();
  const { space } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const filter: TodayFilter = space ?? "everything";
  const empty = emptyCopy(t, filter);
  const { data: following } = useJourneyFollowing();
  const { data: latest } = useFollowingLatest(!!following?.length);
  const { data: cards } = useMomentCards();
  const photos = useCardBirdPhotos([...(following ?? []), ...(cards ?? [])]);
  const feed = useFlockFeed(feedSpaceFor(space));
  const posts = (feed.data?.pages ?? []).flat();
  const media = usePostMedia(posts);
  const [menuFor, setMenuFor] = useState<FlockPost | null>(null);
  const { data: idea } = useTodaysIdea();
  // Diet conversion: "Weigh [Bird] today" after a couple of days without a weigh-in.
  const { data: weighReminders } = useWeighReminders();
  const { data: ideaPhotos } = useIdeaPhotos(idea?.idea_id, !!idea?.has_photo);
  // Votes (1.8): open ones on Today; Do good also shows recent results.
  const { data: votes } = useCurrentVotes();
  const { data: isAdmin } = useIsAdmin();
  const { data: challenges } = useCurrentChallenges();
  const shownVotes = filter === "everything" ? votesFor(votes ?? [], "today") : filter === "good" ? votesFor(votes ?? [], "good") : [];
  // Followed journeys, their big moments and finishes belong to Everything.
  const showJourneys = filter === "everything";
  const items = mergeFeed(posts, showJourneys ? cards ?? [] : [], !!feed.hasNextPage);
  const { data: cardComments } = useCommentCounts("journey_update", items.flatMap((x) => (x.kind === "moment" && x.item.update_id ? [x.item.update_id] : [])));
  return (
    <>
      <FlockHeader title={t("flock.today.title", "Today")} />
      <FlockBody>
        <FlockChips
          label={t("flock.today.filterAria", "Filter Today")}
          testId="today-chips"
          options={TODAY_FILTERS.map((f) => ({ value: f, label: filterLabel(t, f) }))}
          value={filter}
          onChange={(v) => void navigate({ search: { space: !v || v === "everything" ? undefined : v }, replace: true })}
        />
        {filter === "good" && isAdmin && (
          <Link to="/admin/votes" data-testid="manage-votes"
            className="inline-flex min-h-[44px] items-center gap-2 self-end rounded-full bg-white px-4 text-[14px] font-[700]" style={{ color: K.forest, border: `1.5px solid ${K.line}` }}>
            <Settings2 className="size-4" aria-hidden="true" />{t("flock.votes.manageAll", "Manage votes")}
          </Link>
        )}
        {/* Badges (1.13a): what history earned, once, then each new one. */}
        <TodayBadges />
        {/* Challenges (1.10): open ones, Flock-wide first, on Everything. */}
        {filter === "everything" && (challenges ?? []).map((c) => <ChallengeCard key={c.challenge_id} challenge={c} />)}
        {shownVotes.map((v) => <VoteCard key={v.vote_id} vote={v} />)}
        {(weighReminders ?? []).map((w) => <WeighTodayCard key={w.journey_id} birdId={w.bird_id} birdName={w.bird_name} />)}
        {idea && <TodaysIdeaCard idea={idea} photo={ideaPhotos?.find((p) => p.kind === "idea")?.url ?? null} />}
        <ComposePrompt space={space} />
        {showJourneys && following && following.length > 0 && (
          <FollowRings cards={following} photos={photos} latest={latest}
            onOpen={(id) => void navigate({ to: "/flock/journeys/$journeyId/story", params: { journeyId: id }, search: { queue: "following" } })} />
        )}
        {items.length > 0 ? (
          <div className="flex flex-col gap-3" data-testid="today-feed">
            {items.map((x) => x.kind === "post"
              ? <PostCard key={x.item.post_id} post={x.item} avatar={media.avatar(x.item)} photos={media.photos(x.item)} birdPhoto={media.bird(x.item)} onMenu={() => setMenuFor(x.item)} />
              : <JourneyMomentCard key={`${x.item.card_kind}:${x.item.update_id ?? x.item.journey_id}`} card={x.item} photo={photos[x.item.bird_id]}
                  comments={x.item.update_id ? cardComments?.[x.item.update_id] ?? 0 : 0} />)}
            <LoadMore hasMore={!!feed.hasNextPage} loading={feed.isFetchingNextPage} onMore={() => void feed.fetchNextPage()} />
          </div>
        ) : !feed.isLoading && (
          <FlockEmpty icon={<Sun className="size-6" />} title={empty.title}>{empty.line}</FlockEmpty>
        )}
        <PostMenus menuFor={menuFor} setMenuFor={setMenuFor} />
      </FlockBody>
    </>
  );
}
