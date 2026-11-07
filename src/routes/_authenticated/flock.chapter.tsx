import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { MapPin } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { supabase } from "@/integrations/supabase/client";
import { getLocalUser } from "@/integrations/supabase/currentUser";
import { FlockBody, FlockHeader } from "@/components/FlockShell";
import { FlockEmpty, FlockSubTabs } from "@/components/flock/FlockChips";
import { CHAPTER_TABS, chapterLine, pickOptional, type ChapterTab } from "@/lib/flockNav";

// Chapter: the members near you. The chapter is the region on the member's
// Flock profile (a founding claim sets it); chapters map one-to-one onto
// regions for now.
export const Route = createFileRoute("/_authenticated/flock/chapter")({
  validateSearch: (s: Record<string, unknown>): { tab?: ChapterTab } => ({ tab: pickOptional(s.tab, CHAPTER_TABS) }),
  component: FlockChapter,
});

type MyChapter = { name: string; states: string[] } | null;

async function fetchMyChapter(): Promise<MyChapter> {
  const { data: u } = await getLocalUser();
  if (!u.user) return null;
  const { data, error } = await supabase
    .from("flock_profiles")
    .select("region_slug, regions(name, states)")
    .eq("user_id", u.user.id)
    .maybeSingle();
  if (error || !data) return null;
  const r = (data as unknown as { regions: { name: string; states: string[] | null } | null }).regions;
  return r ? { name: r.name, states: r.states ?? [] } : null;
}

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
  const current: ChapterTab = tab ?? "posts";
  const { data: chapter, isLoading } = useQuery({ queryKey: ["flock-my-chapter"], queryFn: fetchMyChapter, staleTime: 5 * 60_000 });
  const line = isLoading ? " " : chapter ? chapterLine(chapter.name, chapter.states) : t("flock.chapter.noChapterLine", "No chapter yet");
  const empty = !isLoading && !chapter
    ? {
      title: t("flock.chapter.empty.noChapterTitle", "No chapter yet"),
      line: t("flock.chapter.empty.noChapter", "Once you choose your region, the members near you will show up here."),
    }
    : emptyCopy(t, current);
  return (
    <>
      <FlockHeader title={t("flock.chapter.title", "Chapter")} line={<span data-testid="chapter-line">{line}</span>} />
      <FlockBody>
        <FlockSubTabs
          label={t("flock.chapter.tabsAria", "Chapter sections")}
          options={CHAPTER_TABS.map((c) => ({ value: c, label: tabLabel(t, c) }))}
          value={current}
          onChange={(v) => void navigate({ search: { tab: v === "posts" ? undefined : v }, replace: true })}
        />
        <div role="tabpanel" aria-label={tabLabel(t, current)}>
          <FlockEmpty icon={<MapPin className="size-6" />} title={empty.title}>{empty.line}</FlockEmpty>
        </div>
      </FlockBody>
    </>
  );
}
