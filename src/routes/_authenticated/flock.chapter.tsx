import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { MapPin } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { FlockBody, FlockHeader } from "@/components/FlockShell";
import { FlockEmpty, FlockSubTabs } from "@/components/flock/FlockChips";
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
            <div role="tabpanel" aria-label={tabLabel(t, current)}>
              <FlockEmpty icon={<MapPin className="size-6" />} title={empty.title}>{empty.line}</FlockEmpty>
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
