import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { JourneyMilestoneCard } from "@/components/flock/JourneyToday";
import { ComposePrompt, LoadMore, PostMenus, usePostMedia } from "@/components/flock/PostFeed";
import { PostCard } from "@/components/flock/PostParts";
import { TodaysIdeaCard } from "@/components/flock/IdeaParts";
import { useIdeaPhotos, useTodaysIdea } from "@/lib/flockIdeas";
import { useCommentCounts, useFlockFeed, type FlockPost } from "@/lib/flockPostData";
import { feedSpaceFor, mergeFeed } from "@/lib/flockPosts";
import { FollowRings, useCardBirdPhotos } from "@/components/flock/JourneyBrowse";
import { useJourneyFollowing, useMilestoneCards, useWeighReminders } from "@/lib/journeyData";
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
  const { data: cards } = useMilestoneCards();
  const photos = useCardBirdPhotos([...(following ?? []), ...(cards ?? [])]);
  const feed = useFlockFeed(feedSpaceFor(space));
  const posts = (feed.data?.pages ?? []).flat();
  const media = usePostMedia(posts);
  const [menuFor, setMenuFor] = useState<FlockPost | null>(null);
  const { data: idea } = useTodaysIdea();
  // Diet conversion: "Weigh [Bird] today" after a couple of days without a weigh-in.
  const { data: weighReminders } = useWeighReminders();
  const { data: ideaPhotos } = useIdeaPhotos(idea?.idea_id, !!idea?.has_photo);
  // Followed journeys and their milestones belong to Everything.
  const showJourneys = filter === "everything";
  const items = mergeFeed(posts, showJourneys ? cards ?? [] : [], !!feed.hasNextPage);
  const { data: cardComments } = useCommentCounts("journey_milestone", items.flatMap((x) => (x.kind === "milestone" ? [x.item.milestone_id] : [])));
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
        {(weighReminders ?? []).map((w) => <WeighTodayCard key={w.journey_id} birdId={w.bird_id} birdName={w.bird_name} />)}
        {idea && <TodaysIdeaCard idea={idea} photo={ideaPhotos?.find((p) => p.kind === "idea")?.url ?? null} />}
        <ComposePrompt space={space} />
        {showJourneys && following && following.length > 0 && (
          <FollowRings cards={following} photos={photos}
            onOpen={(id) => void navigate({ to: "/flock/journeys/$journeyId/story", params: { journeyId: id }, search: { queue: "following" } })} />
        )}
        {items.length > 0 ? (
          <div className="flex flex-col gap-3" data-testid="today-feed">
            {items.map((x) => x.kind === "post"
              ? <PostCard key={x.item.post_id} post={x.item} avatar={media.avatar(x.item)} photos={media.photos(x.item)} birdPhoto={media.bird(x.item)} onMenu={() => setMenuFor(x.item)} />
              : <JourneyMilestoneCard key={x.item.milestone_id} card={x.item} photo={photos[x.item.bird_id]} comments={cardComments?.[x.item.milestone_id] ?? 0} />)}
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
