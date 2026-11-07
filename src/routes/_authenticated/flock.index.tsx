import { createFileRoute, useNavigate } from "@tanstack/react-router";
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
        <FlockEmpty icon={<Sun className="size-6" />} title={empty.title}>{empty.line}</FlockEmpty>
      </FlockBody>
    </>
  );
}
