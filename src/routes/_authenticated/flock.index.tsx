import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { FlockPlaceholder } from "@/components/FlockShell";

export const Route = createFileRoute("/_authenticated/flock/")({
  component: FlockFeed,
});

/** The Flock's home. A placeholder until posts exist. */
function FlockFeed() {
  const { t } = useTranslation();
  return (
    <FlockPlaceholder
      title={t("flock.feed.title", "Feed")}
      line={t("flock.feed.line", "This is where the flock gathers. Posts will show up here soon.")}
    />
  );
}
