import { createFileRoute } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import { K, KyaCard } from "@/components/kya";
import { FlockSubPage } from "@/components/flock/FlockSubPage";
import { FlockEmpty } from "@/components/flock/FlockChips";
import { useJourney, useJourneyBirds } from "@/lib/journeyData";

// A journey, for now: its name, where it stands and its milestones. The full
// page (clips grid, Post an update, Day one vs. now, the menu) comes with
// step 3's third PR.
export const Route = createFileRoute("/_authenticated/flock/journeys/$journeyId")({
  component: JourneyPage,
});

function JourneyPage() {
  const { t } = useTranslation();
  const { journeyId } = Route.useParams();
  const { data: journey, isLoading } = useJourney(journeyId);
  const { data: birds } = useJourneyBirds();
  const bird = birds?.find((b) => b.id === journey?.bird_id);
  if (!isLoading && !journey) {
    return (
      <FlockSubPage title={t("flock.journeys.page.missingTitle", "Journey not found")} fallback="/flock/journeys">
        <FlockEmpty icon={<Check className="size-6" />} title={t("flock.journeys.page.missingTitle", "Journey not found")}>
          {t("flock.journeys.page.missing", "This journey isn't available.")}
        </FlockEmpty>
      </FlockSubPage>
    );
  }
  const skill = journey?.template?.name ?? journey?.custom_name ?? "";
  const ms = journey?.milestones ?? [];
  const done = ms.filter((m) => m.state !== "todo").length;
  const next = ms.find((m) => m.state === "todo");
  return (
    <FlockSubPage title={journey ? `${bird?.name ?? ""} · ${skill}` : " "} fallback="/flock/journeys">
      <div data-testid="journey-page" className="flex flex-col gap-3">
        <p className="m-0 text-[15px] font-[700]" style={{ color: K.forest }} data-testid="journey-progress">
          {next
            ? t("flock.journeys.page.progress", "{{done}} of {{total}} · next: {{next}}", { done, total: ms.length, next: next.title })
            : t("flock.journeys.page.progressDone", "{{done}} of {{total}}", { done, total: ms.length })}
        </p>
        <div className="flex gap-1" aria-hidden="true">
          {ms.map((m) => <span key={m.id} className="h-2 flex-1 rounded-full" style={{ background: m.state === "todo" ? "#dfe7dd" : K.moss }} />)}
        </div>
        <KyaCard className="p-0">
          <ol className="m-0 list-none p-0">
            {ms.map((m, i) => (
              <li key={m.id} className="flex min-h-[48px] items-center gap-3 px-4 py-2" style={{ borderBottom: i === ms.length - 1 ? undefined : `1px solid ${K.line}`, color: K.forest }}>
                <span className="grid size-6 shrink-0 place-items-center rounded-full" style={m.state === "todo" ? { border: "2px solid #c9d3c8" } : { background: K.moss }}>
                  {m.state !== "todo" && <Check className="size-3.5 text-white" strokeWidth={3} aria-hidden="true" />}
                </span>
                <span className={`flex-1 text-[14px] leading-[1.35] ${m === next ? "font-[700]" : ""}`}>{m.title}</span>
                {m.state === "already" && <span className="text-[12.5px]" style={{ color: K.quiet }}>{t("flock.journeys.setup.already", "Already")}</span>}
              </li>
            ))}
          </ol>
        </KyaCard>
      </div>
    </FlockSubPage>
  );
}
