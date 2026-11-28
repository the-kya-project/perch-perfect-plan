import { useEffect, useId, useState } from "react";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { ShieldCheck, Stethoscope } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { K, KyaLink, KyaPrimaryButton } from "@/components/kya";
import { ClipPlayer } from "@/components/ClipPlayer";
import { FlockSubPage } from "@/components/flock/FlockSubPage";
import { ChoiceChips, FlockOnlySheet, FlowFooter, HowOthersDidIt, JourneyEyebrow, MemberSuppliedNote, SkillAbout } from "@/components/flock/JourneyParts";
import { DietEclectusAlert, DietNotForBird, DietVetCard } from "@/components/flock/JourneyDiet";
import { PodOptIn } from "@/components/flock/PodParts";
import { FlagSheet } from "@/components/flock/FlagSheets";
import { podWait, usePodCanWait, useInvalidatePods } from "@/lib/flockPods";
import { useHealthFeature } from "@/lib/useHealthFeature";
import {
  startJourney, startMemberSkill, useCustomAbout, useFinisherTips, useInvalidateJourneys, useJourneyAccess, useJourneyBirds, useJourneyTemplates,
  useJourneyView, useSkillJourneys, useSkillVideo,
} from "@/lib/journeyData";
import {
  CUSTOM_DESCRIPTION_MAX, CUSTOM_NAME_MAX, DIET_SLUG, RHYTHMS, customProblem, defaultVisibility, isEclectus, isNectarEater, matchingSkill, possessive,
  vetCheckLine, visibilityChoices, youngOrUnknownAge, type JourneyRhythm, type JourneyVisibility, type VetCheck,
} from "@/lib/journeys";

// A skill's page and its setup (journeys redesign, screen 3): the short
// description, the video if there is one, the safety notes, and "How others
// did it" (finisher tips and community journeys; a free account gets the
// "Part of the Flock" sheet instead). Setup asks only how often and who sees
// it (Flock: the community by default; free: just me); the bird was picked
// on the way in. Diet conversion first shows the vet card (both answers
// continue; the answer is saved on the journey), with the eclectus alert above
// it for an eclectus once its switch is on, and isn't offered to lories and
// lorikeets; its safeguards stay. A skill
// also offers "Pair me with buddies working on this too" (buddy pods, 1.11).
// "Your own skill" (?custom, screen 7): a name and a short description in the
// owner's words, no steps, and the matching skill suggested when the name is
// one of the 14. A member skill (?from=<journey>, screen 8): the "Member-
// supplied journey" note, its name and description, a link to the journey,
// "Report this skill", then "Start this skill" (which bird, when the member
// has more than one).
export const Route = createFileRoute("/_authenticated/flock/journeys/setup")({
  validateSearch: (s: Record<string, unknown>): { bird: string; template?: string; custom?: boolean; from?: string } => ({
    bird: typeof s.bird === "string" ? s.bird : "",
    template: typeof s.template === "string" ? s.template : undefined,
    custom: s.custom === true || s.custom === "true" ? true : undefined,
    from: typeof s.from === "string" ? s.from : undefined,
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
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const invalidate = useInvalidateJourneys();
  const invalidatePods = useInvalidatePods();
  const nameId = useId();
  const descId = useId();
  const { bird: birdId, template: slugParam, custom: customParam, from } = Route.useSearch();
  const custom = customParam && !from;
  const slug = from ? undefined : slugParam;
  const { data: birds } = useJourneyBirds();
  const { data: templates } = useJourneyTemplates();
  const { data: access } = useJourneyAccess();
  const [pickedBird, setPickedBird] = useState<string | null>(null);
  // A member skill can be opened from its journey, before a bird is chosen.
  const bird = birds?.find((b) => b.id === (birdId || pickedBird)) ?? (from && birds?.length === 1 ? birds[0] : undefined);
  const template = templates?.find((x) => x.slug === slug);
  const community = !!access?.can_view_community;
  const { data: finisherTips } = useFinisherTips(custom || from ? null : slug, community);
  const { data: others } = useSkillJourneys(custom || from ? null : slug, community);
  const { data: video } = useSkillVideo(slug, !custom && !from && !!template?.video_ref);
  const { data: source, isLoading: sourceLoading } = useJourneyView(from ?? "");
  const { data: sourceAbout } = useCustomAbout(from ?? "", !!from);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [reporting, setReporting] = useState(false);
  const [rhythm, setRhythm] = useState<JourneyRhythm>("few_times_week");
  const [visibility, setVisibility] = useState<JourneyVisibility | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [vetChoice, setVetChoice] = useState<VetCheck | null>(null);
  const [flockSheet, setFlockSheet] = useState(false);
  const [buddies, setBuddies] = useState(false);
  const { data: canWait } = usePodCanWait(!custom && !from);

  useEffect(() => { if (access && visibility === null) setVisibility(defaultVisibility(access)); }, [access, visibility]);

  const problem = custom ? customProblem(name, description) : null;
  // Your own skill named like one of the 14: suggest that skill instead.
  const suggestion = custom && templates ? matchingSkill(name, templates) : null;
  const diet = !custom && !from && template?.slug === DIET_SLUG;
  // The eclectus alert's switch is asked only on Diet conversion for an eclectus.
  const eclectusAlert = useHealthFeature("diet_eclectus_alert", diet && isEclectus(bird?.species)) === true;
  const vetLine = template ? vetCheckLine(template) : null;
  // Diet conversion's vet card replaces the one-line vet suggestion; its
  // safeguards stay.
  const vet = diet ? null : vetLine;
  const safeguards = diet ? (template?.safeguards.filter((s) => s !== vetLine) ?? []) : [];
  // Your own skill and member skills show the safety lines every skill shares.
  const customNotes = templates?.[0]?.safety_notes.slice(0, 3) ?? [];
  const memberSkill = !!from && !!source && !source.template_slug && !!sourceAbout?.is_member_skill;

  const ready = !!bird && !!visibility && !saving && (custom ? problem === null : from ? memberSkill : !!template);

  const start = async () => {
    if (!ready || !bird || !visibility) return;
    setSaving(true);
    setError(null);
    try {
      const id = from
        ? await startMemberSkill({ sourceId: from, birdId: bird.id, rhythm, visibility })
        : await startJourney({
          birdId: bird.id,
          templateSlug: custom ? null : template!.slug,
          customName: custom ? name.trim() : null,
          customDescription: custom ? description : null,
          rhythm,
          visibility,
          vetCheck: diet ? vetChoice : null,
        });
      // The journey has started either way; a failed pairing shows on its page.
      if (buddies && !custom && !from) await podWait(id).catch(() => undefined);
      await Promise.all([invalidate(), invalidatePods()]);
      void navigate({ to: "/flock/journeys/$journeyId", params: { journeyId: id }, replace: true });
    } catch (e) {
      setError(friendlyStartError(t, e));
      setSaving(false);
    }
  };

  const title = custom ? t("flock.journeys.start.ownSkill", "Your own skill") : from ? (source?.skill ?? " ") : (template?.name ?? " ");
  const line = bird ? t("flock.journeys.setup.forBird", "for {{name}}", { name: bird.name }) : " ";

  // A member skill that's gone (deleted, hidden, private or blocked) or isn't one.
  if (from && !sourceLoading && sourceAbout !== undefined && !memberSkill) {
    return (
      <FlockSubPage title={t("flock.journeys.member.goneTitle", "Skill not available")} fallback="/flock/journeys/skills">
        <p className="m-0 text-[15px]" style={{ color: K.quiet }} data-testid="member-skill-gone">
          {t("flock.journeys.member.gone", "This skill isn't shared any more.")}
        </p>
      </FlockSubPage>
    );
  }

  if (diet && bird && (isNectarEater(bird.species) || !vetChoice)) {
    return (
      <FlockSubPage title={title} line={line} fallback="/flock/journeys/start">
        {isNectarEater(bird.species)
          ? <DietNotForBird birdName={bird.name} />
          : <>
            {eclectusAlert && isEclectus(bird.species) && <DietEclectusAlert birdName={bird.name} />}
            <DietVetCard birdName={bird.name} young={youngOrUnknownAge(bird.birth_date)} onChoose={(c) => { setVetChoice(c); window.scrollTo(0, 0); }} />
          </>}
      </FlockSubPage>
    );
  }

  return (
    <FlockSubPage title={title} line={line} fallback="/flock/journeys/start">
      <div className="flex flex-col gap-3" data-testid="journey-setup">
        {from && source && memberSkill && (
          <>
            <MemberSuppliedNote />
            <SkillAbout description={sourceAbout?.description ?? null} notes={customNotes} />
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <Link to="/flock/journeys/$journeyId" params={{ journeyId: from }} data-testid="see-source"
                className="text-[14px] font-[700] underline underline-offset-4" style={{ color: K.moss }}>
                {t("flock.journeys.member.seeJourney", "See {{name}} journey", { name: possessive(source.bird_name, i18n.language) })}
              </Link>
              <KyaLink onClick={() => setReporting(true)}>{t("flock.flag.thisSkill", "Flag this skill")}</KyaLink>
            </div>
            {birds && birds.length > 1 && !birdId && (
              <>
                <span className="pt-1 text-[14.5px] font-[700]" style={{ color: K.forest }}>{t("flock.journeys.start.whichBird", "Which bird?")}</span>
                <ChoiceChips label={t("flock.journeys.start.whichBird", "Which bird?")} testId="which-bird" value={bird?.id ?? null} onChange={setPickedBird}
                  options={birds.map((b) => ({ value: b.id, label: b.name }))} />
              </>
            )}
          </>
        )}
        {template && !custom && !from && (
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
        {template && !custom && !from && access && (
          <HowOthersDidIt skill={template.name} tips={finisherTips} journeys={others} canView={community} onLocked={() => setFlockSheet(true)} />
        )}

        {custom && (
          <>
            <label htmlFor={nameId} className="text-[14.5px] font-[700]" style={{ color: K.forest }}>{t("flock.journeys.setup.nameLabel", "What's the goal?")}</label>
            <input id={nameId} value={name} maxLength={CUSTOM_NAME_MAX} data-testid="custom-name" onChange={(e) => setName(e.target.value)}
              placeholder={t("flock.journeys.setup.namePlaceholder", "Bath time, harness, quieter mornings…")}
              className="h-12 w-full rounded-[14px] border bg-white px-3.5 text-[16px] outline-none focus:border-[#1a3d2e]" style={{ borderColor: "#c9d3c8", color: K.forest }} />
            {suggestion && bird && (
              <div className="flex flex-col gap-1.5 rounded-[14px] px-3.5 py-2.5" style={{ background: "#eef4ec" }} data-testid="skill-suggestion">
                <p className="m-0 text-[14px] leading-[1.45]" style={{ color: K.ink }}>
                  {t("flock.journeys.setup.suggestion", "{{skill}} is one of our skills, with its description and safety notes.", { skill: suggestion.name })}
                </p>
                <KyaLink className="self-start" onClick={() => void navigate({ to: "/flock/journeys/setup", search: { bird: bird.id, template: suggestion.slug }, replace: true })}>
                  {t("flock.journeys.setup.useSuggestion", "Start {{skill}} instead", { skill: suggestion.name })}
                </KyaLink>
              </div>
            )}
            <label htmlFor={descId} className="pt-1 text-[14.5px] font-[700]" style={{ color: K.forest }}>
              {t("flock.journeys.setup.descriptionLabel", "What does it look like?")} <span className="font-[400]" style={{ color: K.quiet }}>{t("flock.journeys.setup.optional", "Optional")}</span>
            </label>
            <textarea id={descId} value={description} maxLength={CUSTOM_DESCRIPTION_MAX} rows={4} data-testid="custom-description"
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("flock.journeys.setup.descriptionPlaceholder", "In your own words: what will your bird do when it's learned?")}
              className="w-full resize-none rounded-[14px] border bg-white p-3.5 text-[16px] leading-[1.45] outline-none focus:border-[#1a3d2e]" style={{ borderColor: "#c9d3c8", color: K.forest }} />
            <span className="-mt-1 self-end text-[12.5px]" style={{ color: K.quiet }} data-testid="custom-description-count">
              {t("flock.journeys.setup.descriptionCount", "{{used}} of {{max}}", { used: description.length, max: CUSTOM_DESCRIPTION_MAX })}
            </span>
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

        {!custom && !from && canWait !== undefined && (
          <PodOptIn on={buddies && canWait} onChange={setBuddies} disabled={!canWait} justMe={visibility === "private"} />
        )}

        {error && <p role="alert" className="m-0 text-[15px]" style={{ color: K.red }}>{error}</p>}
      </div>
      <FlowFooter>
        <KyaPrimaryButton onClick={() => void start()} disabled={!ready}>
          {saving ? t("flock.setup.saving", "Saving…")
            : from ? t("flock.journeys.member.start", "Start this skill")
            : t("flock.journeys.setup.cta", "Start {{name}} journey", { name: bird ? possessive(bird.name, i18n.language) : "" })}
        </KyaPrimaryButton>
      </FlowFooter>
      {flockSheet && template && <FlockOnlySheet reason="how_others" skill={template.name} onClose={() => setFlockSheet(false)} />}
      {reporting && from && <FlagSheet type="journey" id={from} authorName={source?.owner_name} onClose={() => setReporting(false)} />}
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
