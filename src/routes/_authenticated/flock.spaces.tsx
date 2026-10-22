import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { FlockPlaceholder } from "@/components/FlockShell";

export const Route = createFileRoute("/_authenticated/flock/spaces")({
  component: FlockSpaces,
});

function FlockSpaces() {
  const { t } = useTranslation();
  return (
    <FlockPlaceholder
      title={t("flock.spaces.title", "Spaces")}
      line={t("flock.spaces.line", "Spaces for every kind of question, coming soon.")}
    />
  );
}
