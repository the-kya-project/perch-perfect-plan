import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { KyaCard } from "@/components/kya";
import { FlockSubPage } from "@/components/flock/FlockSubPage";
import { FlockGuidelinesText } from "@/components/flock/FlockGuidelines";

// The community guidelines, word for word as on the join step, for members to
// find again (Flock settings → Community guidelines). The contact line sits at
// the bottom. Open to someone mid-join too, from the join step's link.
export const Route = createFileRoute("/_authenticated/flock/guidelines")({
  component: FlockGuidelinesPage,
});

function FlockGuidelinesPage() {
  const { t } = useTranslation();
  return (
    <FlockSubPage title={t("flock.guidelines.title", "Community guidelines")}
      line={t("flock.guidelines.line", "What everyone in the Flock agrees to.")}
      fallback="/flock/you">
      <KyaCard className="p-5">
        <FlockGuidelinesText />
      </KyaCard>
    </FlockSubPage>
  );
}
