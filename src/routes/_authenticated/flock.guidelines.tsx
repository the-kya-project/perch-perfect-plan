import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { KyaCard } from "@/components/kya";
import { FlockSubPage } from "@/components/flock/FlockSubPage";
import { FlockGuidelinesText } from "@/components/flock/FlockGuidelines";

// The community guidelines in full (src/flock/guidelines/content.ts), for
// members to find again anytime: the top of the Spaces sheet, and Flock
// settings → Community guidelines. "Questions? Write to …" sits at the bottom.
// Open before agreeing too: the walk-through's "Read the full guidelines →"
// opens it, and Back returns to that screen.
export const Route = createFileRoute("/_authenticated/flock/guidelines")({
  component: FlockGuidelinesPage,
});

function FlockGuidelinesPage() {
  const { t } = useTranslation();
  return (
    <FlockSubPage title={t("flock.guidelines.title", "Community guidelines")}
      line={t("flock.guidelines.line", "What everyone in the Flock agrees to.")}
      fallback="/flock">
      <KyaCard className="p-5 sm:p-6">
        <FlockGuidelinesText />
      </KyaCard>
    </FlockSubPage>
  );
}
