import { useEffect, useId, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Plus, ShieldCheck, Stethoscope, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { K, KyaLink, KyaPrimaryButton } from "@/components/kya";
import { ClipPlayer } from "@/components/ClipPlayer";
import { FlockSubPage } from "@/components/flock/FlockSubPage";
import { ChoiceChips, FlockOnlySheet, FlowFooter, HowOthersDidIt, JourneyEyebrow, SkillAbout } from "@/components/flock/JourneyParts";
import { DietNotForBird, DietVetCard } from "@/components/flock/JourneyDiet";
import { PodOptIn } from "@/components/flock/PodParts";
import { podWait, usePodCanWait, useInvalidatePods } from "@/lib/flockPods";
import {
  startJourney, useFinisherTips, useInvalidateJourneys, useJourneyAccess, useJourneyBirds, useJourneyTemplates, useSkillJourneys, useSkillVideo,
} from "@/lib/journeyData";
import {
  CUSTOM_MAX, CUSTOM_NAME_MAX, DIET_SLUG, MILESTONE_MAX, RHYTHMS, customProblem, defaultVisibility, isNectarEater, possessive,
  trimTrailingBlanks, vetCheckLine, visibilityChoices, youngOrUnknownAge, type JourneyRhythm, type JourneyVisibility, type VetCheck,
} from "@/lib/journeys";

// A skill's page and its setup (journeys redesign, screen 3): the short
// description, the video if there is one, the safety notes, and "How others
// did it" (finisher tips and community journeys; a free account gets the
// "Part of the Flock" sheet instead). Setup asks only how often and who sees
// it (Flock: the community by default; free: just me); the bird was picked
// on the way in. Diet conversion first shows the vet card (both answers
// continue; the answer is saved on the journey) and isn't offered to lories
// and lorikeets; its safeguards stay (1.20d reworks its screens). "Your own
// skill" (?custom) keeps its name and steps until 1.20c. A skill also offers
// "Pair me with buddies working on this too" (buddy pods, backlog 1.11).
export const Route = createFileRoute("/_authenticated/flock/journeys/setup")({
  validateSearch: (s: Record<string, unknown>): { bird: string; template?: string; custom?: boolean } => ({
    bird: typeof s.bird === "string" ? s.bird : "",
    template: typeof s.template === "string" ? s.template : undefined,
    custom: s.custom === true || s.custom === "true" ? true : undefined,
  }),
  component: SetupJourney,
});

function rhythmLabel(t: TFunction, r: JourneyRhythm): string {
  switch (r) {
    case "most_days": return t("flock.journeys.rhythm.mostDays", "Most days");
    case "few_times_week": return t("flock.journeys.rhythm.fewTimes", "A few times a week");
    case "weekends": return t("flock.journeys.rhythm.weekends", "Weekends");
  }
}

function SetupJourney() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const invalidate = useInvalidateJourneys();
  const invalidatePods = useInvalidatePods();
  const nameId = useId();
  const { bird: birdId, template: slug, custom } = Route.useSearch();
  const { data: birds } = useJourneyBirds();
  const { data: templates } = useJourneyTemplates();
  const { data: access } = useJourneyAccess();
  const bird = birds?.find((b) => b.id === birdId);
  const template = templates?.find((x) => x.slug === slug);
  const community = !!access?.can_view_community;
  const { data: finisherTips } = useFinisherTips(custom ? null : slug, community);
  const { data: others } = useSkillJourneys(custom ? null : slug, community);
  const { data: video } = useSkillVideo(slug, !custom && !!template?.video_ref);

  const [name, setName] = useState("");
  const [rows, setRows] = useState<string[]>(["", "", ""]);
  const [rhythm, setRhythm] = useState<JourneyRhythm>("few_times_week");
  const [visibility, setVisibility] = useState<JourneyVisibility | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [vetChoice, setVetChoice] = useState<VetCheck | null>(null);
  const [flockSheet, setFlockSheet] = useState(false);
  const [buddies, setBuddies] = useState(false);
  const { data: canWait } = usePodCanWait(!custom);

  useEffect(() => { if (access && visibility === null) setVisibility(defaultVisibility(access)); }, [access, visibility]);

  const problem = custom ? customProblem(name, rows) : null;
  const diet = !custom && template?.slug === DIET_SLUG;
  const vetLine = template ? vetCheckLine(template) : null;
  // Diet conversion's vet card replaces the one-line vet suggestion; its
  // safeguards stay as they are until 1.20d.
  const vet = diet ? null : vetLine;
  const safeguards = diet ? (template?.safeguards.filter((s) => s !== vetLine) ?? []) : [];
  const customNotes = templates?.[0]?.safety_notes.slice(0, 3) ?? [];

  const ready = !!bird && !!visibility && !saving && (custom ? problem === null : !!template);

  const start = async () => {
    if (!ready || !bird || !visibility) return;
    setSaving(true);
    setError(null);
    try {
      const id = await startJourney({
        birdId: bird.id,
        templateSlug: custom ? null : template!.slug,
        customName: custom ? name.trim() : null,
        customMilestones: custom ? trimTrailingBlanks(rows).map((r) => r.trim()) : null,
        rhythm,
        visibility,
        vetCheck: diet ? vetChoice : null,
      });
      // The journey has started either way; a failed pairing shows on its page.
      if (buddies && !custom) await podWait(id).catch(() => undefined);
      await Promise.all([invalidate(), invalidatePods()]);
      void navigate({ to: "/flock/journeys/$journeyId", params: { journeyId: id }, replace: true });
    } catch (e) {
      setError(friendlyStartError(t, e));
      setSaving(false);
    }
  };

  const title = custom ? t("flock.journeys.start.ownSkill", "Your own skill") : (template?.name ?? " ");
  const line = bird ? t("flock.journeys.setup.forBird", "for {{name}}", { name: bird.name }) : " ";

  if (diet && bird && (isNectarEater(bird.species) || !vetChoice)) {
    return (
      <FlockSubPage title={title} line={line} fallback="/flock/journeys/start">
        {isNectarEater(bird.species)
          ? <DietNotForBird birdName={bird.name} />
          : <DietVetCard birdName={bird.name} young={youngOrUnknownAge(bird.birth_date)} onChoose={(c) => { setVetChoice(c); window.scrollTo(0, 0); }} />}
      </FlockSubPage>
    );
  }

  return (
    <FlockSubPage title={title} line={line} fallback="/flock/journeys/start">
      <div className="flex flex-col gap-3" data-testid="journey-setup">
        {template && !custom && (
          <>
            {video && (
              <div className="overflow-hidden rounded-[16px]" style={{ background: "#1d3328" }} data-testid="skill-video">
                <ClipPlayer src={video.player} label={t("flock.journeys.skill.video", "{{skill}} video", { skill: template.name })} className="aspect-video w-full" />
              </div>
            )}
            <SkillAbout description={template.purpose} notes={template.safety_notes} />
          </>
        )}
        {vet && (
          <div className="flex gap-3 rounded-[16px] p-3.5" style={{ background: K.amberBg, color: K.amberText }} data-testid="vet-check">
            <Stethoscope className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
            <p className="m-0 text-[14.5px] leading-[1.45]">{vet}</p>
          </div>
        )}
        {safeguards.length > 0 && (
          <section className="rounded-[16px] bg-white p-3.5" data-testid="safeguards">
            <h2 className="m-0 text-[14.5px] font-[700]" style={{ color: K.forest }}>{t("flock.journeys.setup.safeguards", "Safeguards built into this journey")}</h2>
            <ul className="m-0 mt-2 flex list-none flex-col gap-1.5 p-0">
              {safeguards.map((s) => (
                <li key={s} className="flex gap-2 text-[14px] leading-[1.45]" style={{ color: K.ink }}>
                  <ShieldCheck className="mt-0.5 size-4 shrink-0" style={{ color: K.moss }} aria-hidden="true" />{s}
                </li>
              ))}
            </ul>
          </section>
        )}
        {template && !custom && access && (
          <HowOthersDidIt skill={template.name} tips={finisherTips} journeys={others} canView={community} onLocked={() => setFlockSheet(true)} />
        )}

        {custom && (
          <>
            <label htmlFor={nameId} className="text-[14.5px] font-[700]" style={{ color: K.forest }}>{t("flock.journeys.setup.nameLabel", "What's the goal?")}</label>
            <input id={nameId} value={name} maxLength={CUSTOM_NAME_MAX} data-testid="custom-name" onChange={(e) => setName(e.target.value)}
              placeholder={t("flock.journeys.setup.namePlaceholder", "Bath time, harness, quieter mornings…")}
              className="h-12 w-full rounded-[14px] border bg-white px-3.5 text-[16px] outline-none focus:border-[#1a3d2e]" style={{ borderColor: "#c9d3c8", color: K.forest }} />
            <span className="pt-1 text-[14.5px] font-[700]" style={{ color: K.forest }}>
              {t("flock.journeys.setup.milestonesLabel", "Milestones")} <span className="font-[400]" style={{ color: K.quiet }}>{t("flock.journeys.setup.milestonesHint", "3 to 8 small steps, in order.")}</span>
            </span>
            <ol className="m-0 flex list-none flex-col gap-1.5 p-0" data-testid="custom-milestones">
              {rows.map((r, i) => (
                <li key={i} className="flex items-center gap-2">
                  <span className="grid size-7 shrink-0 place-items-center rounded-full text-[12.5px] font-[700]" style={{ background: K.lime, color: K.forest }}>{i + 1}</span>
                  <input value={r} maxLength={MILESTONE_MAX} aria-label={t("flock.journeys.setup.milestoneAria", "Milestone {{n}}", { n: i + 1 })}
                    onChange={(e) => setRows((xs) => xs.map((x, j) => (j === i ? e.target.value : x)))}
                    className="h-11 min-w-0 flex-1 rounded-[12px] border bg-white px-3 text-[15px] outline-none focus:border-[#1a3d2e]" style={{ borderColor: "#c9d3c8", color: K.forest }} />
                  {rows.length > 3 && (
                    <button type="button" aria-label={t("flock.journeys.setup.removeMilestone", "Remove milestone {{n}}", { n: i + 1 })}
                      onClick={() => setRows((xs) => xs.filter((_, j) => j !== i))} className="grid size-10 shrink-0 place-items-center rounded-full" style={{ color: K.quiet }}>
                      <X className="size-4" aria-hidden="true" />
                    </button>
                  )}
                </li>
              ))}
            </ol>
            {rows.length < CUSTOM_MAX && (
              <KyaLink onClick={() => setRows((xs) => [...xs, ""])} className="self-start">
                <span className="inline-flex items-center gap-1"><Plus className="size-4" aria-hidden="true" />{t("flock.journeys.setup.addMilestone", "Add a milestone")}</span>
              </KyaLink>
            )}
          </>
        )}

        <div className="pt-1.5"><JourneyEyebrow>{t("flock.journeys.setup.setUp", "Set it up")}</JourneyEyebrow></div>
        <span className="text-[14.5px] font-[700]" style={{ color: K.forest }}>{t("flock.journeys.setup.rhythm", "How often will you practice?")}</span>
        <ChoiceChips label={t("flock.journeys.setup.rhythm", "How often will you practice?")} testId="rhythm" value={rhythm} onChange={setRhythm}
          options={RHYTHMS.map((r) => ({ value: r, label: rhythmLabel(t, r) }))} />

        <span className="pt-1 text-[14.5px] font-[700]" style={{ color: K.forest }}>{t("flock.journeys.setup.who", "Who sees it?")}</span>
        <ChoiceChips label={t("flock.journeys.setup.who", "Who sees it?")} testId="visibility" value={visibility} onChange={setVisibility}
          options={visibilityChoices(access).map((v) => ({ value: v, label: v === "community" ? t("flock.journeys.setup.community", "The community") : t("flock.journeys.setup.justMe", "Just me") }))} />
        {access && !access.can_share && (
          <span className="-mt-1 text-[12.5px]" style={{ color: K.quiet }}>{t("flock.journeys.setup.shareNote", "Sharing journeys with the community comes with Flock membership.")}</span>
        )}

        {custom && customNotes.length > 0 && (
          <section className="rounded-[16px] p-3.5" style={{ background: "#eef4ec" }} data-testid="safety-notes">
            <h2 className="m-0 text-[14.5px] font-[700]" style={{ color: K.forest }}>{t("flock.journeys.setup.safety", "Every session")}</h2>
            <ul className="m-0 mt-2 flex list-none flex-col gap-1 p-0">
              {customNotes.map((n) => <li key={n} className="text-[14px] leading-[1.45]" style={{ color: K.ink }}>{n}</li>)}
            </ul>
          </section>
        )}

        {!custom && canWait !== undefined && (
          <PodOptIn on={buddies && canWait} onChange={setBuddies} disabled={!canWait} justMe={visibility === "private"} />
        )}

        {error && <p role="alert" className="m-0 text-[15px]" style={{ color: K.red }}>{error}</p>}
      </div>
      <FlowFooter>
        <KyaPrimaryButton onClick={() => void start()} disabled={!ready}>
          {saving ? t("flock.setup.saving", "Saving…") : t("flock.journeys.setup.cta", "Start {{name}} journey", { name: bird ? possessive(bird.name) : "" })}
        </KyaPrimaryButton>
      </FlowFooter>
      {flockSheet && template && <FlockOnlySheet reason="how_others" skill={template.name} onClose={() => setFlockSheet(false)} />}
    </FlockSubPage>
  );
}

/** The database's refusals, in words a member can act on. */
function friendlyStartError(t: TFunction, e: unknown): string {
  const msg = (e as { message?: string })?.message ?? "";
  if (/diet_not_for_nectar_eaters/.test(msg)) return t("flock.journeys.setup.errNectar", "This journey isn't made for lories and lorikeets. Your avian vet is the best guide for any changes.");
  if (/already has this journey going/.test(msg)) return t("flock.journeys.setup.errGoing", "This bird already has this journey going.");
  if (/comes with Flock membership/.test(msg)) return t("flock.journeys.setup.errShare", "Sharing with the community comes with Flock membership.");
  if (/one custom journey at a time/.test(msg)) return t("flock.journeys.customLimit.title", "One custom journey at a time");
  return t("flock.journeys.setup.error", "We couldn't start the journey. Check your connection and try again.");
}
