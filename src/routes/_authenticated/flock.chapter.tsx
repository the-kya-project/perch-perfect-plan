import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { MapPin } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { FlockBody, FlockHeader } from "@/components/FlockShell";
import { FlockEmpty, FlockSubTabs } from "@/components/flock/FlockChips";
import { ComposePrompt, LoadMore, PostList } from "@/components/flock/PostFeed";
import { EventCard } from "@/components/flock/EventParts";
import { useChapterEvents, useEventRules } from "@/lib/flockEvents";
import { CalendarPlus } from "lucide-react";
import { useFlockFeed } from "@/lib/flockPostData";
import { RegionSheet } from "@/components/flock/FlockPeople";
import { K } from "@/components/kya";
import { memberCountLine } from "@/lib/flockProfile";
import { saveFlockProfile, useChapter, useInvalidateFlock, useMyProfile, useRegions } from "@/lib/flockData";
import { CHAPTER_TABS, chapterLine, pickOptional, type ChapterTab } from "@/lib/flockNav";

// Chapter: the members near you. Your chapter is your profile's region
// (chapters map one-to-one onto regions); change the region and you move at
// once. "Other" means no chapter yet, with a way to pick one.
export const Route = createFileRoute("/_authenticated/flock/chapter")({
  validateSearch: (s: Record<string, unknown>): { tab?: ChapterTab } => ({ tab: pickOptional(s.tab, CHAPTER_TABS) }),
  component: FlockChapter,
});

function tabLabel(t: TFunction, tab: ChapterTab): string {
  switch (tab) {
    case "posts": return t("flock.chapter.posts", "Posts");
    case "events": return t("flock.chapter.events", "Events");
    case "resources": return t("flock.chapter.resources", "Resources");
  }
}

function emptyCopy(t: TFunction, tab: ChapterTab): { title: string; line: string } {
  switch (tab) {
    case "posts": return {
      title: t("flock.chapter.empty.postsTitle", "Your chapter is gathering"),
      line: t("flock.chapter.empty.posts", "Your chapter is the Flock members near you. Their posts will show up here."),
    };
    case "events": return {
      title: t("flock.chapter.empty.eventsTitle", "No events yet"),
      line: t("flock.chapter.empty.events", "Local meetups and online get-togethers for your chapter will be listed here."),
    };
    case "resources": return {
      title: t("flock.chapter.empty.resourcesTitle", "No resources yet"),
      line: t("flock.chapter.empty.resources", "Avian vets, rescues, and shops your chapter recommends will be collected here."),
    };
  }
}

function FlockChapter() {
  const { t } = useTranslation();
  const { tab } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const invalidate = useInvalidateFlock();
  const current: ChapterTab = tab ?? "posts";
  const { data: me, isLoading: meLoading } = useMyProfile();
  const { data: regions } = useRegions();
  const slug = me?.region_slug && me.region_slug !== "other" ? me.region_slug : null;
  const { data: chapter, isLoading: chapterLoading } = useChapter(slug);
  const [picking, setPicking] = useState(false);
  const [saving, setSaving] = useState(false);
  const loading = meLoading || (!!slug && chapterLoading);
  const noChapter = !loading && !slug;

  const pickRegion = async (s: string) => {
    if (!me) return;
    setSaving(true);
    try {
      await saveFlockProfile({ display_name: me.display_name, region_slug: s });
      await invalidate();
    } finally {
      setSaving(false);
      setPicking(false);
    }
  };

  const line = loading
    ? "\u00a0"
    : chapter
      ? (
        <>
          <span data-testid="chapter-line">{chapterLine(chapter.name, chapter.states)}</span>
          <span className="mt-1 block" data-testid="chapter-count">
            {memberCountLine(chapter.member_count)} ·{" "}
            <Link to="/flock/members" className="font-[700] text-white underline underline-offset-4">{t("flock.chapter.seeMembers", "See members")}</Link>
          </span>
        </>
      )
      : <span data-testid="chapter-line">{t("flock.chapter.noChapterLine", "No chapter yet")}</span>;
  const empty = noChapter
    ? {
      title: t("flock.chapter.empty.noChapterTitle", "No chapter yet"),
      line: t("flock.chapter.empty.noChapter", "Once you choose your region, the members near you will show up here."),
    }
    : emptyCopy(t, current);
  return (
    <>
      <FlockHeader title={t("flock.chapter.title", "Chapter")} line={line} />
      <FlockBody>
        {noChapter ? (
          <>
            <FlockEmpty icon={<MapPin className="size-6" />} title={empty.title}>{empty.line}</FlockEmpty>
            <button type="button" onClick={() => setPicking(true)} disabled={saving}
              className="inline-flex min-h-[52px] w-full items-center justify-center rounded-full border-2 px-6 text-[16px] font-[700] active:scale-[0.99] disabled:opacity-50"
              style={{ background: K.sunflower, borderColor: K.forest, color: K.forest }}>
              {t("flock.chapter.pickRegion", "Choose your region")}
            </button>
          </>
        ) : (
          <>
            <FlockSubTabs
              label={t("flock.chapter.tabsAria", "Chapter sections")}
              options={CHAPTER_TABS.map((c) => ({ value: c, label: tabLabel(t, c) }))}
              value={current}
              onChange={(v) => void navigate({ search: { tab: v === "posts" ? undefined : v }, replace: true })}
            />
            <div role="tabpanel" aria-label={tabLabel(t, current)} className="flex flex-col gap-3">
              {current === "posts" ? (
                <ChapterPosts name={chapter?.name ?? null} empty={<FlockEmpty icon={<MapPin className="size-6" />} title={empty.title}>{empty.line}</FlockEmpty>} />
              ) : current === "events" ? (
                <ChapterEvents empty={<FlockEmpty icon={<MapPin className="size-6" />} title={empty.title}>{empty.line}</FlockEmpty>} />
              ) : (
                <FlockEmpty icon={<MapPin className="size-6" />} title={empty.title}>{empty.line}</FlockEmpty>
              )}
            </div>
          </>
        )}
      </FlockBody>
      {picking && regions && (
        <RegionSheet regions={regions.filter((r) => r.slug !== "other")} value={null} onClose={() => setPicking(false)} onPick={(s) => void pickRegion(s)} />
      )}
    </>
  );
}

/** The chapter's posts, newest first, with a way to post to it. */
function ChapterPosts({ name, empty }: { name: string | null; empty: React.ReactNode }) {
  const { t } = useTranslation();
  const feed = useFlockFeed("chapter");
  const posts = (feed.data?.pages ?? []).flat();
  return (
    <>
      <ComposePrompt space="chapter" label={name ? t("flock.chapter.postPrompt", "Post to the {{name}} chapter", { name }) : undefined} />
      {posts.length > 0 ? (
        <div className="flex flex-col gap-3" data-testid="chapter-posts">
          <PostList posts={posts} />
          <LoadMore hasMore={!!feed.hasNextPage} loading={feed.isFetchingNextPage} onMore={() => void feed.fetchNextPage()} />
        </div>
      ) : !feed.isLoading && empty}
    </>
  );
}

/** Coming up and Past (Batch 5, screen 1), and a way to suggest one (or, for
 *  the chapter's lead and admins, to add one). */
function ChapterEvents({ empty }: { empty: React.ReactNode }) {
  const { t } = useTranslation();
  const { data: upcoming, isLoading } = useChapterEvents("upcoming");
  const { data: past } = useChapterEvents("past");
  const { data: rules } = useEventRules();
  const none = !isLoading && (upcoming ?? []).length === 0 && (past ?? []).length === 0;
  return (
    <>
      {none ? empty : (
        <>
          {(upcoming ?? []).length > 0 && (
            <section className="flex flex-col gap-2" data-testid="events-upcoming">
              <h2 className="m-0 text-[15px] font-[700]" style={{ color: K.forest }}>{t("flock.events.comingUp", "Coming up")}</h2>
              {(upcoming ?? []).map((e) => <EventCard key={e.event_id} e={e} past={false} />)}
            </section>
          )}
          {(past ?? []).length > 0 && (
            <section className="flex flex-col gap-2" data-testid="events-past">
              <h2 className="m-0 text-[15px] font-[700]" style={{ color: K.forest }}>{t("flock.events.past", "Past")}</h2>
              {(past ?? []).map((e) => <EventCard key={e.event_id} e={e} past />)}
            </section>
          )}
        </>
      )}
      <Link to="/flock/events/new" data-testid="suggest-event"
        className="inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-full border-2 px-6 text-[16px] font-[700]"
        style={{ background: K.sunflower, borderColor: K.forest, color: K.forest }}>
        <CalendarPlus className="size-5" aria-hidden="true" />
        {rules?.can_manage ? t("flock.events.new", "New event") : t("flock.events.suggest", "Suggest an event")}
      </Link>
    </>
  );
}
