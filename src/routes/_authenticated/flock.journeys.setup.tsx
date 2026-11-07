import { useEffect, useId, useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Check, Plus, ShieldCheck, Stethoscope, Video, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { K, KyaLink, KyaPrimaryButton } from "@/components/kya";
import { ClipRecorder } from "@/components/ClipRecorder";
import { FlockSubPage } from "@/components/flock/FlockSubPage";
import { ChoiceChips, FinisherTipsCard, FlowFooter } from "@/components/flock/JourneyParts";
import { DietNotForBird, DietVetCard, HowToMakeItWork } from "@/components/flock/JourneyDiet";
import { createJourneyClipUpload } from "@/lib/journeyClips.functions";
import { startJourney, useFinisherTips, useInvalidateJourneys, useJourneyAccess, useJourneyBirds, useJourneyTemplates } from "@/lib/journeyData";
import {
  CUSTOM_MAX, CUSTOM_NAME_MAX, DIET_SLUG, MILESTONE_MAX, RHYTHMS, birdPronoun, customProblem, defaultVisibility, isNectarEater, possessive, startHere,
  trimTrailingBlanks, vetCheckLine, visibilityChoices, youngOrUnknownAge, type BirdPronoun, type JourneyRhythm, type JourneyVisibility, type VetCheck,
} from "@/lib/journeys";

// Set up a journey (JourneyFlow, screen 2): where the bird is starting, a
// day-one clip, how often you'll practice, who sees it, and the template's
// safety notes (Diet conversion adds its safeguards). Diet conversion first
// shows the vet card (both answers continue; the answer is saved on the
// journey), and isn't offered to lories and lorikeets. For
// "Write your own journey": a name and 3–8 milestones instead.
export const Route = createFileRoute("/_authenticated/flock/journeys/setup")({
  validateSearch: (s: Record<string, unknown>): { bird: string; template?: string; custom?: boolean } => ({
    bird: typeof s.bird === "string" ? s.bird : "",
    template: typeof s.template === "string" ? s.template : undefined,
    custom: s.custom === true || s.custom === "true" ? true : undefined,
  }),
  component: SetupJourney,
});

function whereLine(t: TFunction, p: BirdPronoun): string {
  switch (p) {
    case "she": return t("flock.journeys.setup.whereShe", "Tap anything she already does.");
    case "he": return t("flock.journeys.setup.whereHe", "Tap anything he already does.");
    case "they": return t("flock.journeys.setup.whereThey", "Tap anything they already do.");
  }
}

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
  const nameId = useId();
  const { bird: birdId, template: slug, custom } = Route.useSearch();
  const { data: birds } = useJourneyBirds();
  const { data: templates } = useJourneyTemplates();
  const { data: access } = useJourneyAccess();
  const bird = birds?.find((b) => b.id === birdId);
  const template = templates?.find((x) => x.slug === slug);
  const { data: finisherTips } = useFinisherTips(custom ? null : slug);

  const [already, setAlready] = useState<Set<number>>(new Set());
  const [name, setName] = useState("");
  const [rows, setRows] = useState<string[]>(["", "", ""]);
  const [rhythm, setRhythm] = useState<JourneyRhythm>("few_times_week");
  const [visibility, setVisibility] = useState<JourneyVisibility | null>(null);
  const [clip, setClip] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [clipBusy, setClipBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [vetChoice, setVetChoice] = useState<VetCheck | null>(null);

  useEffect(() => { if (access && visibility === null) setVisibility(defaultVisibility(access)); }, [access, visibility]);

  const count = template?.milestones.length ?? 0;
  const first = startHere(count, already);
  const problem = custom ? customProblem(name, rows) : null;
  const diet = !custom && template?.slug === DIET_SLUG;
  const vetLine = template ? vetCheckLine(template) : null;
  // Diet conversion's vet card replaces the one-line vet suggestion.
  const vet = diet ? null : vetLine;
  const safeguards = template?.safeguards.filter((s) => s !== vetLine) ?? [];
  const pronoun = birdPronoun(bird?.sex);
  const notes = template?.safety_notes ?? (templates?.[0]?.safety_notes ?? []);
  const limits = useMemo(() => !access || !bird ? undefined : {
    maxSeconds: access.max_clip_seconds,
    maxBytes: access.max_upload_bytes,
    createUpload: ({ uploadLength }: { uploadLength: number }) => createJourneyClipUpload({ data: { uploadLength, birdId: bird.id } }),
  }, [access, bird]);

  const ready = !!bird && !!visibility && !saving && !clipBusy && (custom ? problem === null : !!template && first !== null);

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
        already: custom ? [] : [...already].sort((a, b) => a - b),
        rhythm,
        visibility,
        dayOneClip: clip,
        vetCheck: diet ? vetChoice : null,
      });
      await invalidate();
      void navigate({ to: "/flock/journeys/$journeyId", params: { journeyId: id }, replace: true });
    } catch (e) {
      setError(friendlyStartError(t, e));
      setSaving(false);
    }
  };

  const title = custom ? t("flock.journeys.setup.customTitle", "Write your own journey") : (template?.name ?? " ");
  const line = bird ? t("flock.journeys.setup.line", "{{name}} new journey", { name: possessive(bird.name) }) : " ";

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

        {template && <HowToMakeItWork tips={template.tips} />}
        {template && <FinisherTipsCard skill={template.name} tips={finisherTips} />}

        {custom ? (
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
        ) : template && bird ? (
          <>
            <p className="m-0 text-[14.5px] font-[700]" style={{ color: K.forest }}>
              {t("flock.journeys.setup.where", "Where is {{name}} starting?", { name: bird.name })}{" "}
              <span className="font-[400]" style={{ color: K.quiet }}>{whereLine(t, pronoun)}</span>
            </p>
            <ol className="m-0 flex list-none flex-col gap-1.5 p-0" data-testid="setup-milestones">
              {template.milestones.map((m) => {
                const on = already.has(m.position);
                const here = first === m.position;
                return (
                  <li key={m.position}>
                    <button type="button" aria-pressed={on} data-position={m.position}
                      onClick={() => setAlready((s) => { const n = new Set(s); if (n.has(m.position)) n.delete(m.position); else n.add(m.position); return n; })}
                      className="flex min-h-[48px] w-full items-center gap-3 rounded-[14px] bg-white px-3.5 py-2 text-left active:scale-[0.99]"
                      style={{ color: K.forest, border: here ? `2px solid ${K.sunflower}` : "2px solid transparent" }}>
                      <span className="grid size-6 shrink-0 place-items-center rounded-full"
                        style={on ? { background: K.moss } : { border: `2px solid ${here ? K.sunflower : "#c9d3c8"}` }}>
                        {on && <Check className="size-3.5 text-white" strokeWidth={3} aria-hidden="true" />}
                      </span>
                      <span className={`flex-1 text-[14px] leading-[1.35] ${here ? "font-[700]" : ""}`}>{m.title}</span>
                      {on
                        ? <span className="shrink-0 text-[12.5px]" style={{ color: K.quiet }}>{t("flock.journeys.setup.already", "Already")}</span>
                        : here ? <span className="shrink-0 rounded-full px-2 py-[3px] text-[11px] font-[700]" style={{ background: K.amberBg, color: K.amberText }}>{t("flock.journeys.setup.startHere", "Start here")}</span> : null}
                    </button>
                  </li>
                );
              })}
            </ol>
            {first === null && (
              <p className="m-0 text-[14px]" style={{ color: K.amberText }}>{t("flock.journeys.setup.allAlready", "Leave at least one step to work on, or mark the whole skill as known instead.")}</p>
            )}
          </>
        ) : null}

        <span className="pt-1 text-[14.5px] font-[700]" style={{ color: K.forest }}>{t("flock.journeys.setup.dayOne", "Day-one clip")}</span>
        {clip && !recording ? (
          <div className="flex min-h-[56px] items-center gap-3 rounded-[14px] bg-white px-3.5" data-testid="day-one-added">
            <Video className="size-5 shrink-0" style={{ color: K.moss }} aria-hidden="true" />
            <span className="flex-1 text-[14.5px] font-[700]" style={{ color: K.forest }}>{t("flock.journeys.setup.clipAdded", "Day-one clip added")}</span>
            <KyaLink onClick={() => { setClip(null); setRecording(true); }}>{t("flock.journeys.setup.clipReplace", "Replace")}</KyaLink>
          </div>
        ) : bird && limits && (recording ? (
          <ClipRecorder birdId={bird.id} inPage limits={limits} onBusy={setClipBusy}
            onUploaded={(ref) => { setClip(ref); setRecording(false); }} />
        ) : (
          <button type="button" data-testid="day-one-add" onClick={() => setRecording(true)}
            className="flex h-[92px] items-center justify-center gap-2 rounded-[14px] bg-white text-[13.5px] font-[700] active:scale-[0.99]"
            style={{ border: "2px dashed #b9c4b8", color: K.moss }}>
            <Video className="size-5" aria-hidden="true" />{t("flock.journeys.setup.clipAdd", "Record or add a clip")}
          </button>
        ))}
        <span className="-mt-1 text-[12.5px]" style={{ color: K.quiet }}>{t("flock.journeys.setup.clipWhy", "You'll compare it with later clips. It's worth the 30 seconds.")}</span>

        <span className="pt-1 text-[14.5px] font-[700]" style={{ color: K.forest }}>{t("flock.journeys.setup.rhythm", "How often will you practice?")}</span>
        <ChoiceChips label={t("flock.journeys.setup.rhythm", "How often will you practice?")} testId="rhythm" value={rhythm} onChange={setRhythm}
          options={RHYTHMS.map((r) => ({ value: r, label: rhythmLabel(t, r) }))} />

        <span className="pt-1 text-[14.5px] font-[700]" style={{ color: K.forest }}>{t("flock.journeys.setup.who", "Who sees it?")}</span>
        <ChoiceChips label={t("flock.journeys.setup.who", "Who sees it?")} testId="visibility" value={visibility} onChange={setVisibility}
          options={visibilityChoices(access).map((v) => ({ value: v, label: v === "community" ? t("flock.journeys.setup.community", "The community") : t("flock.journeys.setup.justMe", "Just me") }))} />
        {access && !access.can_share && (
          <span className="-mt-1 text-[12.5px]" style={{ color: K.quiet }}>{t("flock.journeys.setup.shareNote", "Sharing journeys with the community comes with Flock membership.")}</span>
        )}

        {notes.length > 0 && (
          <section className="rounded-[16px] p-3.5" style={{ background: "#eef4ec" }} data-testid="safety-notes">
            <h2 className="m-0 text-[14.5px] font-[700]" style={{ color: K.forest }}>{t("flock.journeys.setup.safety", "Every session")}</h2>
            <ul className="m-0 mt-2 flex list-none flex-col gap-1 p-0">
              {notes.map((n) => <li key={n} className="text-[14px] leading-[1.45]" style={{ color: K.ink }}>{n}</li>)}
            </ul>
          </section>
        )}

        {error && <p role="alert" className="m-0 text-[15px]" style={{ color: K.red }}>{error}</p>}
      </div>
      <FlowFooter>
        <KyaPrimaryButton onClick={() => void start()} disabled={!ready}>
          {saving ? t("flock.setup.saving", "Saving…") : t("flock.journeys.setup.cta", "Start {{name}} journey", { name: bird ? possessive(bird.name) : "" })}
        </KyaPrimaryButton>
      </FlowFooter>
    </FlockSubPage>
  );
}

/** The database's refusals, in words a member can act on. */
function friendlyStartError(t: TFunction, e: unknown): string {
  const msg = (e as { message?: string })?.message ?? "";
  if (/diet_not_for_nectar_eaters/.test(msg)) return t("flock.journeys.setup.errNectar", "This journey isn't made for lories and lorikeets. Your avian vet is the best guide for any changes.");
  if (/already has this journey going/.test(msg)) return t("flock.journeys.setup.errGoing", "This bird already has this journey going.");
  if (/comes with app premium/.test(msg)) return t("flock.journeys.setup.errPremium", "This journey comes with app premium.");
  if (/comes with Flock membership/.test(msg)) return t("flock.journeys.setup.errShare", "Sharing with the community comes with Flock membership.");
  if (/one custom journey at a time/.test(msg)) return t("flock.journeys.customLimit.title", "One custom journey at a time");
  return t("flock.journeys.setup.error", "We couldn't start the journey. Check your connection and try again.");
}
