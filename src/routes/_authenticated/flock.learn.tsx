import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { FlockPlaceholder } from "@/components/FlockShell";

export const Route = createFileRoute("/_authenticated/flock/learn")({
  component: FlockLearn,
});

function FlockLearn() {
  const { t } = useTranslation();
  return (
    <FlockPlaceholder
      title={t("flock.learn.title", "Learn")}
      line={t("flock.learn.line", "Guides, recordings, and the podcast will live here.")}
    />
  );
}
