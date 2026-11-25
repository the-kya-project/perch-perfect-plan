import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { K, KyaLink } from "@/components/kya";
import { FlockSubPage } from "@/components/flock/FlockSubPage";
import { BirdThumb } from "@/components/flock/FlockPeople";
import { CustomLimitSheet, FlowFooter, JourneyEyebrow, TemplateRow } from "@/components/flock/JourneyParts";
import { useOwnBirdPhotoUrls } from "@/lib/flockData";
import { useBirdJourneys, useBirdSkills, useJourneyAccess, useJourneyBirds, useJourneyTemplates } from "@/lib/journeyData";
import { canStartCustom, groupSkills, type JourneyTemplate, type SkillGroup } from "@/lib/journeys";

// Pick a skill (journeys redesign, screen 2): one list of all 14, no
// free/Flock split, grouped Handling and health, Foundations, Food, Tricks.
// A skill the bird already knows says so and can still be started; one that's
// going now opens that journey. "Your own skill" at the bottom, then, for
// Flock members, "Skills from the Flock" (1.20c). With more than one bird,
// pick the bird first.
export const Route = createFileRoute("/_authenticated/flock/journeys/start")({
  validateSearch: (s: Record<string, unknown>): { bird?: string } => ({ bird: typeof s.bird === "string" ? s.bird : undefined }),
  component: StartJourney,
});

function groupLabel(t: TFunction, g: SkillGroup): string {
  switch (g) {
    case "husbandry": return t("flock.journeys.start.groupHusbandry", "Handling and health");
    case "foundations": return t("flock.journeys.start.groupFoundations", "Foundations");
    case "food": return t("flock.journeys.start.groupFood", "Food");
    case "tricks": return t("flock.journeys.start.groupTricks", "Tricks");
  }
}

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
  const [limitSheet, setLimitSheet] = useState(false);

  if (birds && !bird) {
    return (
      <FlockSubPage title={t("flock.journeys.start.pickTitle", "Pick a skill")} fallback="/flock/journeys">
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

  const groups = groupSkills(templates ?? []);
  const knownIds = new Set((skills ?? []).map((s) => s.template_id).filter(Boolean));
  const goingBy = new Map((open ?? []).filter((j) => j.template_id).map((j) => [j.template_id as string, j.id]));
  const pick = (tp: JourneyTemplate) => {
    if (!bird) return;
    const going = goingBy.get(tp.id);
    if (going) { void navigate({ to: "/flock/journeys/$journeyId", params: { journeyId: going } }); return; }
    void navigate({ to: "/flock/journeys/setup", search: { bird: bird.id, template: tp.slug } });
  };

  return (
    <FlockSubPage title={t("flock.journeys.start.pickTitle", "Pick a skill")} line={bird ? t("flock.journeys.start.for", "for {{name}}", { name: bird.name }) : " "} fallback="/flock/journeys">
      <div className="flex flex-col gap-2" data-testid="template-list">
        {bird && (
          <KyaLink onClick={() => void navigate({ to: "/flock/journeys/known", search: { bird: bird.id } })} className="self-start">
            {t("flock.journeys.start.markKnown", "Mark what {{name}} already knows", { name: bird.name })}
          </KyaLink>
        )}
        {groups.map((g, i) => (
          <div key={g.group} className="flex flex-col gap-2" data-skill-group={g.group}>
            <div className={i > 0 ? "pt-1.5" : undefined}><JourneyEyebrow>{groupLabel(t, g.group)}</JourneyEyebrow></div>
            {g.skills.map((tp) => (
              <TemplateRow
                key={tp.id}
                testId={tp.slug}
                name={tp.name}
                meta={tp.purpose}
                known={bird && knownIds.has(tp.id) ? t("flock.journeys.start.alreadyKnows", "{{name}} already knows this", { name: bird.name }) : null}
                going={goingBy.has(tp.id) ? t("flock.journeys.start.going", "Going now") : null}
                onClick={() => pick(tp)}
              />
            ))}
          </div>
        ))}
      </div>
      <FlowFooter>
        <button
          type="button"
          data-testid="write-own"
          onClick={() => {
            if (!bird) return;
            if (!canStartCustom(access)) { setLimitSheet(true); return; }
            void navigate({ to: "/flock/journeys/setup", search: { bird: bird.id, custom: true } });
          }}
          className="min-h-[48px] w-full rounded-[14px] text-[14.5px] font-[700] active:scale-[0.99]"
          style={{ border: `1px dashed ${K.moss}`, background: "#f4f7f4", color: K.forest }}
        >
          {t("flock.journeys.start.ownSkill", "Your own skill")}
        </button>
        {access?.can_view_community && (
          <button
            type="button"
            data-testid="from-flock-skills"
            onClick={() => void navigate({ to: "/flock/journeys/skills", search: bird ? { bird: bird.id } : {} })}
            className="mt-2 min-h-[48px] w-full rounded-[14px] text-[14.5px] font-[700] active:scale-[0.99]"
            style={{ border: `1px solid ${K.line}`, background: "#fff", color: K.forest }}
          >
            {t("flock.journeys.member.title", "Skills from the Flock")}
          </button>
        )}
      </FlowFooter>
      {limitSheet && <CustomLimitSheet onClose={() => setLimitSheet(false)} />}
    </FlockSubPage>
  );
}
