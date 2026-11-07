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
import { CalendarPlus, Search } from "lucide-react";
import { FlockChips } from "@/components/flock/FlockChips";
import { FlockAvatar, FounderBadge } from "@/components/flock/FlockPeople";
import { useAvatarUrls } from "@/lib/flockData";
import { birdsLine, filterRoster, topGroups, useChapterRoster, type SpeciesGroup } from "@/lib/flockMembers";
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
    case "members": return t("flock.chapter.members", "Members");
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
    case "members": return {
      title: t("flock.members.emptyTitle", "No members here yet"),
      line: t("flock.members.empty", "When members join your chapter, you'll find them here."),
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
            <Link to="/flock/chapter" search={{ tab: "members" }} className="font-[700] text-white underline underline-offset-4">{t("flock.chapter.seeMembers", "See members")}</Link>
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
              ) : current === "members" ? (
                <ChapterMembers slug={slug!} empty={<FlockEmpty icon={<MapPin className="size-6" />} title={empty.title}>{empty.line}</FlockEmpty>} />
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

const GROUP_LABELS: Record<string, [string, string]> = {
  macaws: ["flock.members.group.macaws", "Macaws"], amazons: ["flock.members.group.amazons", "Amazons"],
  cockatoos: ["flock.members.group.cockatoos", "Cockatoos"], greys: ["flock.members.group.greys", "Greys"],
  cockatiels: ["flock.members.group.cockatiels", "Cockatiels"], conures: ["flock.members.group.conures", "Conures"],
  parakeets: ["flock.members.group.parakeets", "Parakeets"], lovebirds: ["flock.members.group.lovebirds", "Lovebirds"],
  caiques: ["flock.members.group.caiques", "Caiques"], eclectus: ["flock.members.group.eclectus", "Eclectus"],
  parrotlets: ["flock.members.group.parrotlets", "Parrotlets"], pionus: ["flock.members.group.pionus", "Pionus"],
  lories: ["flock.members.group.lories", "Lories"], quakers: ["flock.members.group.quakers", "Quakers"],
  poicephalus: ["flock.members.group.poicephalus", "Poicephalus"],
};

/** The chapter's members (Batch 5, screen 7): search by name or species,
 *  species chips, badges, and only first names and shown birds. */
function ChapterMembers({ slug, empty }: { slug: string; empty: React.ReactNode }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: roster, isLoading } = useChapterRoster(slug);
  const { data: urls } = useAvatarUrls((roster ?? []).map((m) => m.photo_path));
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<SpeciesGroup | "everyone">("everyone");
  const list = roster ?? [];
  const groups = topGroups(list);
  const shown = filterRoster(list, query, group === "everyone" ? null : group);
  const groupLabel = (g: string) => (GROUP_LABELS[g] ? t(GROUP_LABELS[g][0], GROUP_LABELS[g][1]) : g.charAt(0).toUpperCase() + g.slice(1));
  if (!isLoading && list.length === 0) return <>{empty}</>;
  return (
    <div className="flex flex-col gap-3" data-testid="chapter-members-tab">
      <label className="flex min-h-[48px] items-center gap-2 rounded-full bg-white px-4" style={{ color: K.quiet }}>
        <Search className="size-4 shrink-0" aria-hidden="true" />
        <span className="sr-only">{t("flock.members.search", "Search by name or species")}</span>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("flock.members.search", "Search by name or species")}
          className="min-w-0 flex-1 bg-transparent text-[16px] outline-none" style={{ color: K.forest }} data-testid="members-search" />
      </label>
      {groups.length > 0 && (
        <FlockChips label={t("flock.members.groupsAria", "Filter by species")} testId="members-chips" value={group}
          onChange={(v) => setGroup(v ?? "everyone")}
          options={[{ value: "everyone", label: t("flock.members.everyone", "Everyone") }, ...groups.map((g) => ({ value: g, label: groupLabel(g) }))]} />
      )}
      {shown.length === 0 ? (
        <p className="m-0 py-4 text-center text-[14px]" style={{ color: K.quiet }} data-testid="members-none">{t("flock.members.noMatch", "No one matches that yet.")}</p>
      ) : (
        <ul className="m-0 flex list-none flex-col overflow-hidden rounded-[18px] bg-white p-0" data-testid="chapter-members">
          {shown.map((m, i) => (
            <li key={m.user_id} style={{ borderTop: i ? `1px solid ${K.line}` : undefined }}>
              <button type="button" onClick={() => void navigate({ to: "/flock/members/$userId", params: { userId: m.user_id } })} data-member={m.user_id}
                className="flex min-h-[64px] w-full items-center gap-3 px-4 py-2.5 text-left" style={{ color: K.forest }}>
                <FlockAvatar name={m.display_name} url={m.photo_path ? urls?.get(m.photo_path) : null} size={44} />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex flex-wrap items-center gap-1.5 text-[15.5px] font-[700]">
                    {m.display_name}
                    {m.is_lead && (
                      <span className="rounded-full px-2 py-0.5 text-[11.5px] font-[700]" style={{ background: K.lime, color: K.forest }} data-testid="lead-badge">
                        {t("flock.members.lead", "Chapter lead")}
                      </span>
                    )}
                    {m.is_founder && <FounderBadge />}
                  </span>
                  <span className="truncate text-[13px]" style={{ color: K.quiet }}>
                    {m.birds.length ? birdsLine(m.birds, t("flock.members.and", "and")) : t("flock.members.noBirds", "No birds shown")}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="m-0 px-2 text-center text-[13px]" style={{ color: K.quiet }} data-testid="members-footer">
        {t("flock.members.footer", "Only first names and birds show here. Members choose what else to share.")}
      </p>
    </div>
  );
}
