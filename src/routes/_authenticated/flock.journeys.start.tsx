import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { K, KyaLink } from "@/components/kya";
import { FlockSubPage } from "@/components/flock/FlockSubPage";
import { BirdThumb } from "@/components/flock/FlockPeople";
import { CustomLimitSheet, FlowFooter, JourneyEyebrow, PremiumSheet, TemplateRow } from "@/components/flock/JourneyParts";
import { useOwnBirdPhotoUrls } from "@/lib/flockData";
import { useBirdJourneys, useBirdSkills, useJourneyAccess, useJourneyBirds, useJourneyTemplates } from "@/lib/journeyData";
import { canStartCustom, groupTemplates, isLocked, type JourneyTemplate } from "@/lib/journeys";

// Start a journey (JourneyFlow, screen 1): the basics (free), then tricks and
// more (premium, locked for free accounts), known skills marked, and "Write
// your own journey" at the bottom. With more than one bird, pick the bird first.
export const Route = createFileRoute("/_authenticated/flock/journeys/start")({
  validateSearch: (s: Record<string, unknown>): { bird?: string } => ({ bird: typeof s.bird === "string" ? s.bird : undefined }),
  component: StartJourney,
});

function StartJourney() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { bird: birdParam } = Route.useSearch();
  const { data: birds } = useJourneyBirds();
  const bird = birds?.find((b) => b.id === birdParam) ?? (birds?.length === 1 ? birds[0] : undefined);
  const { data: templates } = useJourneyTemplates();
  const { data: access } = useJourneyAccess();
  const { data: skills } = useBirdSkills(bird?.id);
  const { data: open } = useBirdJourneys(bird?.id);
  const { data: photos } = useOwnBirdPhotoUrls(birds, 96);
  const [sheet, setSheet] = useState<"premium" | "custom" | null>(null);

  if (birds && !bird) {
    return (
      <FlockSubPage title={t("flock.journeys.start.title", "Start a journey")} fallback="/flock/journeys">
        <div className="flex flex-col gap-2" data-testid="pick-bird">
          <JourneyEyebrow>{t("flock.journeys.start.whichBird", "Which bird?")}</JourneyEyebrow>
          {birds.length === 0 && (
            <p className="m-0 text-[15px]" style={{ color: K.quiet }}>{t("flock.journeys.start.noBirds", "Add a bird in My birds first, then start a journey for them here.")}</p>
          )}
          {birds.map((b) => (
            <button key={b.id} type="button" data-bird={b.id}
              onClick={() => void navigate({ to: "/flock/journeys/start", search: { bird: b.id }, replace: true })}
              className="flex min-h-[60px] items-center gap-3 rounded-[14px] bg-white px-3.5 py-2 text-left active:scale-[0.99]" style={{ color: K.forest }}>
              <BirdThumb name={b.name} photo={photos[b.id]} size={40} />
              <span className="flex flex-col"><span className="text-[15px] font-[700]">{b.name}</span>{b.species && <span className="text-[12.5px]" style={{ color: K.quiet }}>{b.species}</span>}</span>
            </button>
          ))}
        </div>
      </FlockSubPage>
    );
  }

  const groups = groupTemplates(templates ?? []);
  const knownIds = new Set((skills ?? []).map((s) => s.template_id).filter(Boolean));
  const goingIds = new Set((open ?? []).map((j) => j.template_id).filter(Boolean));
  const meta = (tp: JourneyTemplate) => t("flock.journeys.start.meta", "{{count}} milestones · usually {{length}}", { count: tp.milestones.length, length: tp.typical_length });
  const pick = (tp: JourneyTemplate) => {
    if (!bird) return;
    if (isLocked(tp, access)) { setSheet("premium"); return; }
    void navigate({ to: "/flock/journeys/setup", search: { bird: bird.id, template: tp.slug } });
  };
  const row = (tp: JourneyTemplate) => (
    <TemplateRow
      key={tp.id}
      testId={tp.slug}
      name={tp.name}
      meta={meta(tp)}
      known={bird && knownIds.has(tp.id) ? t("flock.journeys.start.knows", "{{name}} knows this", { name: bird.name }) : null}
      going={goingIds.has(tp.id) ? t("flock.journeys.start.going", "Going now") : null}
      locked={isLocked(tp, access)}
      onClick={() => pick(tp)}
    />
  );

  return (
    <FlockSubPage title={t("flock.journeys.start.title", "Start a journey")} line={bird ? t("flock.journeys.start.for", "for {{name}}", { name: bird.name }) : " "} fallback="/flock/journeys">
      <div className="flex flex-col gap-2" data-testid="template-list">
        {bird && (
          <KyaLink onClick={() => void navigate({ to: "/flock/journeys/known", search: { bird: bird.id } })} className="self-start">
            {t("flock.journeys.start.markKnown", "Mark what {{name}} already knows", { name: bird.name })}
          </KyaLink>
        )}
        <JourneyEyebrow>{t("flock.journeys.start.basics", "The basics · free")}</JourneyEyebrow>
        {groups.basics.map(row)}
        <div className="pt-1.5"><JourneyEyebrow>{t("flock.journeys.start.more", "Tricks and more · premium")}</JourneyEyebrow></div>
        {groups.more.map(row)}
      </div>
      <FlowFooter>
        <button
          type="button"
          data-testid="write-own"
          onClick={() => {
            if (!bird) return;
            if (!canStartCustom(access)) { setSheet("custom"); return; }
            void navigate({ to: "/flock/journeys/setup", search: { bird: bird.id, custom: true } });
          }}
          className="min-h-[48px] w-full rounded-[14px] text-[14.5px] font-[700] active:scale-[0.99]"
          style={{ border: `1px dashed ${K.moss}`, background: "#f4f7f4", color: K.forest }}
        >
          {t("flock.journeys.start.writeOwn", "Write your own journey")}
        </button>
      </FlowFooter>
      {sheet === "premium" && <PremiumSheet onClose={() => setSheet(null)} />}
      {sheet === "custom" && <CustomLimitSheet onClose={() => setSheet(null)} />}
    </FlockSubPage>
  );
}
