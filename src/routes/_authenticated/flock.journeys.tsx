import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Route as RouteIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { FlockBody, FlockHeader } from "@/components/FlockShell";
import { FlockChips, FlockEmpty } from "@/components/flock/FlockChips";
import { JOURNEYS_FILTERS, pickOptional, type JourneysFilter } from "@/lib/flockNav";

// Journeys: members' progress stories. Species filters come in a later step.
export const Route = createFileRoute("/_authenticated/flock/journeys")({
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
      line: t("flock.journeys.empty.forYou", "Journeys are members' stories told one step at a time: a new trick, a calmer bird, a better diet. The first ones will appear here."),
    };
    case "following": return {
      title: t("flock.journeys.empty.followingTitle", "Not following anyone yet"),
      line: t("flock.journeys.empty.following", "Follow a member's journey and each new step they share will show up here."),
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

function FlockJourneys() {
  const { t } = useTranslation();
  const { filter } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const current: JourneysFilter = filter ?? "for-you";
  const empty = emptyCopy(t, current);
  return (
    <>
      <FlockHeader title={t("flock.journeys.title", "Journeys")} />
      <FlockBody>
        <FlockChips
          label={t("flock.journeys.filterAria", "Filter journeys")}
          testId="journeys-chips"
          options={JOURNEYS_FILTERS.map((f) => ({ value: f, label: chipLabel(t, f) }))}
          value={current}
          onChange={(v) => void navigate({ search: { filter: !v || v === "for-you" ? undefined : v }, replace: true })}
        />
        <FlockEmpty icon={<RouteIcon className="size-6" />} title={empty.title}>{empty.line}</FlockEmpty>
      </FlockBody>
    </>
  );
}
