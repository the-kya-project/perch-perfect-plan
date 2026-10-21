import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { speciesLabel } from "@/lib/speciesLabel";
import { birdAgeLabel } from "@/lib/birdAge";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { FileText, Share2, Printer, ArrowRight } from "lucide-react";
import { computeWeightTrend } from "@/lib/weightTrend";
import { formatAmountUnitDisplay } from "@/lib/labels";
import { normalizeFeedTimes, feedTimeLabel } from "@/lib/feedTimes";
import { K, SERIF, KyaPage, KyaBody, KyaCard, KyaHeading, KyaIconTile, KyaLink, KyaPrimaryButton, KyaSecondaryButton } from "@/components/kya";
import { PageHeader, useGoBack } from "@/components/headers";
import { LoadError } from "@/components/LoadError";
import { useLoadState } from "@/lib/useTooLong";
import { useCapability } from "@/lib/useCapability";
import { flaggedAnswers } from "@/lib/healthHistory";
import { SCAN_FIELDS } from "@/lib/triage";
import { scanQuestionFor } from "@/lib/scanFieldLabels";
import { isNativeApp } from "@/lib/nativeApp";
import { formatLocalDate, formatLocalDateTime } from "@/lib/dates";
import i18next from "i18next";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";

type WeightRow = { id: string; grams: number; measured_at: string; source: string | null; meal_relation: string | null; note: string | null };

export const Route = createFileRoute("/_authenticated/birds/$birdId/vet-summary")({
  head: () => ({ meta: [{ title: i18next.t("vetSummary.metaTitle", "Vet summary — Kya & Co.") }] }),
  component: VetSummary,
});

const none = () => i18next.t("vetSummary.noneOnFile", "none on file");
function dietLabel(key: string): string {
  switch (key) {
    case "pelleted": return i18next.t("vetSummary.diet.pelleted", "Pelleted");
    case "seed": return i18next.t("vetSummary.diet.seed", "Seed mix");
    case "pellet_seed": return i18next.t("vetSummary.diet.pelletSeed", "Pellet & seed");
    case "chop": return i18next.t("vetSummary.diet.chop", "Fresh chop / formulated");
    case "other": return i18next.t("vetSummary.diet.other", "Other");
    default: return key;
  }
}
function sexMethodLabel(key: string | null | undefined): string {
  switch (key) {
    case "dna": return i18next.t("vetSummary.sexMethod.dna", "DNA");
    case "surgical": return i18next.t("vetSummary.sexMethod.surgical", "surgical");
    case "visual": return i18next.t("vetSummary.sexMethod.visual", "visual");
    default: return "";
  }
}
function sexLabel(sex: string): string {
  switch (sex.toLowerCase()) {
    case "male": return i18next.t("vetSummary.sex.male", "Male");
    case "female": return i18next.t("vetSummary.sex.female", "Female");
    case "unknown": return i18next.t("vetSummary.sex.unknown", "Unknown");
    default: return cap(sex);
  }
}

function VetSummary() {
  const { t, i18n } = useTranslation();
  const { birdId } = Route.useParams();
  const navigate = useNavigate();
  const [generated, setGenerated] = useState(false);
  const goBack = useGoBack(useCallback(() => navigate({ to: "/birds/$birdId", params: { birdId } }), [navigate, birdId]));
  // The "Add them" link opens the identity editor, which needs manage_flock.
  const canEditIdentity = useCapability("manage_flock", { birdId });

  // Every query here throws on a failed request: a summary rendered from a
  // failed load reads as a record full of "Not added", which is not the same
  // thing as a record that is genuinely empty.
  const birdQ = useQuery({
    queryKey: ["vet-bird", birdId],
    queryFn: async () => {
      const { data, error } = await supabase.from("birds")
        .select("name, species, sex, sex_method, age, birth_date, microchip, band_number, origin, medications, medical_conditions, owner_id")
        .eq("id", birdId).maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });
  const { data: bird } = birdQ;
  const planQ = useQuery({
    queryKey: ["vet-plan", birdId],
    queryFn: async () => {
      const { data, error } = await supabase.from("care_plans").select("*").eq("bird_id", birdId).maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });
  const { data: plan } = planQ;
  const weightsQ = useQuery({
    queryKey: ["weight-entries", birdId],
    queryFn: async () => {
      // IDENTICAL query to the weight page (same shared key, same shape) — the
      // two previously selected different columns under one key, so whichever
      // loaded last poisoned the other's cache. The full row feeds both the
      // trend line in the body AND the complete weight appendix.
      const { data, error } = await supabase.from("weight_entries")
        .select("*").eq("bird_id", birdId)
        .order("measured_at", { ascending: false }).limit(2000);
      if (error) throw error;
      return (data ?? []) as unknown as WeightRow[];
    },
  });
  const { data: weights } = weightsQ;

  // Flagged for review: every health check in the last 6 months where ANY item
  // came back not_sure/concerning — regardless of overall triage. Fetch the
  // window (indexed bird_id + log_date) and filter client-side. The questions
  // come from SCAN_FIELDS via flaggedAnswers, not a column list kept here: the
  // old hand-kept list left out vomiting_status, so those concerns never
  // reached the vet. "*" for the same reason as the health history: a status
  // column not yet in the database comes back absent instead of failing the
  // whole query.
  const flaggedQ = useQuery({
    queryKey: ["vet-flagged", birdId],
    queryFn: async () => {
      const cutoff = new Date(Date.now() - 183 * 86_400_000).toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from("daily_logs")
        .select("*")
        .eq("bird_id", birdId)
        .gte("log_date", cutoff)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return ((data ?? []) as any[]).filter((r) => flaggedAnswers(r).length > 0 || legacyWaterAnswer(r) !== null);
    },
  });
  const { data: flaggedScans } = flaggedQ;

  // A failed load (or one still waiting after 10 s) shows a retry instead of a
  // summary full of "Not added" — failure is not the same as empty.
  const load = useLoadState([birdQ, planQ, weightsQ, flaggedQ]);

  const name = bird?.name ?? t("vetSummary.thisBird", "This bird");
  const { current, baseline, trend, delta } = computeWeightTrend(weights ?? [], 90);

  // ---- assemble field values (string | null) ----
  const sexText = bird?.sex
    ? `${sexLabel(bird.sex)}${sexMethodLabel(bird.sex_method) ? ` (${sexMethodLabel(bird.sex_method)})` : ""}`
    : null;
  // [label, value, text when empty (default "None on file")]
  const identity: [string, string | null, string?][] = [
    [t("vetSummary.species", "Species"), bird?.species ? speciesLabel(t, bird.species) : null],
    [t("vetSummary.sex", "Sex"), sexText],
    [t("vetSummary.age", "Age"), birdAgeLabel(t, bird)],
    [
      t("vetSummary.hatchDate", "Hatch date"),
      bird?.birth_date ? formatLocalDate(new Date(`${bird.birth_date}T12:00:00`), { year: "numeric", month: "short", day: "numeric" }) : null,
      t("vetSummary.notAdded", "Not added"),
    ],
    [t("vetSummary.microchip", "Microchip"), bird?.microchip ?? null],
    [t("vetSummary.band", "Band"), bird?.band_number ?? null],
    [t("vetSummary.origin", "Origin"), bird?.origin ?? null],
  ];

  const weightText = current
    ? `${current.grams} g · ${trendLabel(trend, delta, baseline)} · ${t("vetSummary.lastWeighed", "last weighed {{date}}", { date: fmtDate(current.measured_at) })}`
    : null;

  const dietText = buildDiet(plan);
  const meds = [
    val(bird?.medications) && t("vetSummary.medicationsLine", "Medications: {{value}}", { value: bird.medications.trim() }),
    // birds.medications is only the joined NAMES. The dosing times and the
    // administration notes live in care_plans.medication_schedule, which this
    // page already loads. Leaving it out handed a vet "Metacam 0.1ml" with no
    // way to tell once-daily from twice-daily.
    val(plan?.medication_schedule) && t("vetSummary.dosingLine", "Dosing: {{value}}", { value: plan.medication_schedule.trim() }),
    val(bird?.medical_conditions) && t("vetSummary.conditionsLine", "Conditions: {{value}}", { value: bird.medical_conditions.trim() }),
  ].filter(Boolean).join("\n");
  // Handling = is the bird handleable, for the person about to handle it:
  // steps up (yes/no/sometimes + caveats), who can handle, bite risk, plus any
  // free-text handling rules. Out-of-cage/home routine is deliberately NOT
  // pulled in — not relevant to a vet visit.
  const stepUpRaw = (plan?.step_up ?? "").trim().toLowerCase();
  const stepUpLabel = stepUpRaw === "yes" ? t("vetSummary.stepUpYes", "Yes") : stepUpRaw === "no" ? t("vetSummary.stepUpNo", "No") : stepUpRaw === "sometimes" ? t("vetSummary.stepUpSometimes", "Sometimes") : null;
  const handling = [
    (stepUpLabel || val(plan?.step_up_notes)) &&
      t("vetSummary.stepsUpLine", "Steps up: {{value}}", { value: [stepUpLabel, val(plan?.step_up_notes) ? plan.step_up_notes.trim() : null].filter(Boolean).join(" · ") }),
    val(plan?.handlers) && t("vetSummary.whoCanHandleLine", "Who can handle: {{value}}", { value: plan.handlers.trim() }),
    val(plan?.bite_risk) && t("vetSummary.biteRiskLine", "Bite risk: {{value}}", { value: plan.bite_risk.trim() }),
    val(plan?.handling_rules) && plan.handling_rules.trim(),
  ].filter(Boolean).join("\n");

  function shareText(): string {
    const lines = [
      t("vetSummary.shareTitle", "{{name}} — vet summary", { name }),
      bird?.species ? t("vetSummary.shareSpecies", "Species: {{species}}", { species: speciesLabel(t, bird.species) }) : "",
      t("vetSummary.generated", "Generated {{date}}", { date: fmtDate(new Date().toISOString()) }),
      "",
      t("vetSummary.shareIdentityLabel", "Identity"),
      ...identity.map(([l, v, empty]) => `  ${l}: ${v ?? empty ?? none()}`),
      "",
      t("vetSummary.shareWeightLabel", "Weight: {{value}}", { value: weightText ?? none() }),
      "",
      t("vetSummary.shareDietLabel", "Diet: {{value}}", { value: dietText ?? none() }),
      "",
      t("vetSummary.shareMedsLabel", "Meds & health flags: {{value}}", { value: meds || none() }),
      "",
      t("vetSummary.shareHandlingLabel", "Handling: {{value}}", { value: handling || none() }),
      "",
      t("vetSummary.shareFlaggedLabel", "Flagged for review (last 6 months)"),
      ...(!(flaggedScans ?? []).length
        ? [`  ${t("vetSummary.noFlagged", "No flagged checks in the last 6 months.")}`]
        : (flaggedScans ?? []).map((r: any) => {
            const items = flaggedItems(t, r, bird?.name)
              .map((i) => `${i.question} · ${i.answerText}${i.note ? ` ("${i.note}")` : ""}`)
              .join("; ");
            return `  ${fmtDate(r.created_at)} · ${t("vetSummary.triageLevel", "triage {{level}}", { level: triageLevelLabel(r.triage_status) })} · ${r.resolved_at ? t("vetSummary.resolvedOn", "resolved {{date}}", { date: fmtDate(r.resolved_at) }) : t("vetSummary.unresolved", "unresolved")} — ${items}`;
          })),
      "",
      t("vetSummary.shareWeightHistoryLabel", "Weight history ({{n}} entries, newest first)", { n: (weights ?? []).length }),
      ...(weights ?? []).map((e) => {
        const bits = [
          `${e.grams} g`,
          mealLabel(e.meal_relation),
          e.source ? t("vetSummary.bySource", "by {{source}}", { source: sourceLabel(e.source) ?? e.source }) : null,
          e.note ? `"${e.note}"` : null,
        ].filter(Boolean).join(" · ");
        return `  ${fmtDate(e.measured_at)} — ${bits}`;
      }),
    ];
    return lines.filter((l) => l !== undefined).join("\n");
  }

  async function share() {
    const text = shareText();
    if (navigator.share) {
      // A rejection here is almost always the person dismissing the sheet.
      try {
        await navigator.share({ title: t("vetSummary.shareTitle", "{{name}} — vet summary", { name }), text });
      } catch { /* cancelled — nothing to report */ }
      return;
    }
    // The clipboard path is different: if it fails, nothing was shared and
    // nothing was copied, and the old catch-all reported neither.
    try {
      await navigator.clipboard.writeText(text);
      toast.success(t("vetSummary.copied", "Summary copied to clipboard."));
    } catch (e) {
      console.error("[vet summary] clipboard write failed", e);
      toast.error(t("vetSummary.copyFailed", "Couldn't copy the summary. Select the text and copy it manually."));
    }
  }

  // Identity fields the summary prints that are still empty on the record.
  // Same columns as the `identity` list above (species, sex, age, microchip,
  // band, origin), in plain lowercase words for the "Missing from" card.
  const missing: string[] = bird ? [
    !val(bird.species) && t("vetSummary.missingSpecies", "species"),
    !val(bird.sex) && t("vetSummary.missingSex", "sex"),
    !birdAgeLabel(t, bird) && t("vetSummary.missingAge", "age"),
    !val(bird.microchip) && t("vetSummary.missingMicrochip", "microchip"),
    !val(bird.band_number) && t("vetSummary.missingBand", "leg band"),
    !val(bird.origin) && t("vetSummary.missingOrigin", "origin"),
  ].filter((x): x is string => !!x) : [];
  const missingText = missing.length ? t("vetSummary.missingList", "{{items}}.", { items: cap(joinList(missing, i18n.language)) }) : null;

  return (
    <KyaPage>
      <div data-noprint>
        <PageHeader
          onBack={goBack}
          title={bird ? t("vetSummary.title", "{{name}}'s vet summary", { name: bird.name }) : t("vetSummary.titleFallback", "Vet summary")}
          line={t("vetSummary.line", "One clean sheet to bring to the vet or send ahead.")}
          action={generated ? { label: t("vetSummary.share", "Share"), icon: <Share2 className="size-4" />, onClick: share } : undefined}
        />
      </div>

      <KyaBody>
        {load.failed ? (
          <LoadError onRetry={load.retry} onBack={goBack} />
        ) : (
        <>
        {missingText && (
          <div data-noprint>
            <KyaCard className="flex items-start gap-3 p-4">
              <KyaIconTile size={40}><span className="text-[19px] font-[700]" style={{ fontFamily: SERIF }}>!</span></KyaIconTile>
              <div className="min-w-0 flex-1">
                <p className="m-0 text-[15px] font-[700]" style={{ color: K.forest }}>{t("vetSummary.missingTitle", "Missing from {{name}}'s record", { name })}</p>
                <p className="m-0 mt-0.5 text-[14px] leading-[1.45]" style={{ color: K.quiet }}>{missingText}</p>
                {canEditIdentity && (
                  <KyaLink onClick={() => navigate({ to: "/birds/$birdId/identity", params: { birdId }, search: { edit: 1 } })}>
                    {t("vetSummary.addThem", "Add them")} <ArrowRight className="size-4" aria-hidden="true" />
                  </KyaLink>
                )}
              </div>
            </KyaCard>
          </div>
        )}

        {!generated ? (
          <>
            <KyaCard className="p-5">
              <KyaHeading size={21}>{t("vetSummary.includedTitle", "What's included")}</KyaHeading>
              <div className="mt-3 flex flex-wrap gap-2">
                <IncludedTag>{t("vetSummary.tagIdentity", "Identity")}</IncludedTag>
                <IncludedTag>{t("vetSummary.tagWeightTrend", "Weight trend")}</IncludedTag>
                <IncludedTag>{t("vetSummary.tagDiet", "Diet")}</IncludedTag>
                <IncludedTag>{t("vetSummary.tagMedications", "Medications")}</IncludedTag>
                <IncludedTag>{t("vetSummary.tagHandling", "Handling notes")}</IncludedTag>
                <IncludedTag amber>{t("vetSummary.tagFlagged", "Flagged checks")}</IncludedTag>
              </div>
              <p className="m-0 mt-3 text-[13px] leading-[1.5]" style={{ color: K.quiet }}>{t("vetSummary.pulledFrom", "Pulled from {{name}}'s record, so it's always current.", { name })}</p>
            </KyaCard>
            <KyaPrimaryButton icon={<FileText className="size-5" />} onClick={() => setGenerated(true)}>
              {t("vetSummary.make", "Make {{name}}'s vet summary", { name })}
            </KyaPrimaryButton>
          </>
        ) : (
          <>
            {/* window.print() is a no-op inside the native shells: neither
                @capacitor/ios nor AppDelegate implements WebKit's print
                delegate, and Android's WebView has no window.print at all.
                Showing the button there is a control that silently does
                nothing. Share (header pill) still works natively
                (navigator.share), so there is still a way to get this to a
                vet. Proper fix is a generated PDF -- see today-wip-backup
                (43fd077). */}
            {!isNativeApp() && (
              <div data-noprint>
                <KyaSecondaryButton className="w-full" icon={<Printer className="size-4" />} onClick={() => window.print()}>{t("vetSummary.saveAsPdf", "Save as PDF")}</KyaSecondaryButton>
              </div>
            )}

            {/* The sheet */}
            <article id="vet-sheet" className="flex flex-col gap-3">
              <KyaCard className="p-5">
                <KyaHeading as="h2" size={26}>{name}</KyaHeading>
                {bird?.species && <p className="m-0 mt-1 text-[15px]" style={{ color: K.ink }}>{speciesLabel(t, bird.species)}</p>}
                <p className="m-0 mt-1 text-[13px]" style={{ color: K.quiet }}>{t("vetSummary.generated", "Generated {{date}}", { date: fmtDate(new Date().toISOString()) })}</p>
              </KyaCard>

              <Section label={t("vetSummary.identity", "Identity")}>
                <dl className="m-0 grid grid-cols-2 gap-x-4 gap-y-3">
                  {identity.map(([l, v, empty]) => (
                    <div key={l}>
                      <dt className="text-[13px]" style={{ color: K.quiet }}>{l}</dt>
                      <dd className={`m-0 mt-0.5 text-[15px] ${v ? "font-[600]" : "italic"}`} style={{ color: v ? K.forest : K.quiet }}>{v ?? empty ?? cap(none())}</dd>
                    </div>
                  ))}
                </dl>
              </Section>

              <Section label={t("vetSummary.weight", "Weight")}>
                {current ? (
                  <div>
                    <p className="m-0 text-[26px] font-[700] leading-tight" style={{ color: K.moss, fontFamily: SERIF }}>{current.grams} g</p>
                    <p className="m-0 mt-0.5 text-[13px]" style={{ color: K.quiet }}>{trendLabel(trend, delta, baseline)} · {t("vetSummary.lastWeighed", "last weighed {{date}}", { date: fmtDate(current.measured_at) })}</p>
                  </div>
                ) : (
                  <Value text={null} />
                )}
              </Section>
              <Section label={t("vetSummary.diet", "Diet")}><Value text={dietText} multiline /></Section>
              <Section label={t("vetSummary.medsHealthFlags", "Meds & health flags")}><Value text={meds} multiline /></Section>
              <FlaggedForReview scans={flaggedScans ?? []} birdName={bird?.name} />
              <Section label={t("vetSummary.handling", "Handling")}><Value text={handling} multiline /></Section>

              {/* Appendix — the complete raw weight series (the body keeps the
                  summarized trend; this is in addition, for the vet to read). */}
              <WeightAppendix entries={weights ?? []} />
            </article>
          </>
        )}
        </>
        )}
      </KyaBody>

      {/* Print only the sheet, regardless of app chrome. */}
      <style>{`@media print {
        body * { visibility: hidden !important; }
        #vet-sheet, #vet-sheet * { visibility: visible !important; }
        #vet-sheet { position: absolute; left: 0; top: 0; width: 100%; border: none !important; }
        #vet-sheet > section { box-shadow: none !important; border: 1px solid ${K.line}; }
        #vet-sheet .avoid-break { break-inside: avoid; page-break-inside: avoid; }
        [data-noprint] { display: none !important; }
      }`}</style>
    </KyaPage>
  );
}

/** "What's included" tag: mist/moss, or amber for flagged checks. */
function IncludedTag({ children, amber }: { children: ReactNode; amber?: boolean }) {
  return (
    <span className="inline-flex items-center rounded-full px-3 py-1.5 text-[13px] font-[700]" style={amber ? { background: K.amberBg, color: K.amberText } : { background: K.mist, color: K.moss }}>
      {children}
    </span>
  );
}

/** A check's Not sure / Concerning answers for the summary and its shared
 *  text: every daily-check question (from SCAN_FIELDS, via flaggedAnswers),
 *  worded as the check asks it today, with the owner's note for that item. */
function flaggedItems(t: TFunction, r: any, birdName: string | null | undefined) {
  const notes = (r.item_notes ?? {}) as Record<string, string>;
  const answerText = (answer: string) =>
    answer === "concerning" ? t("vetSummary.answerConcerning", "concerning") : t("vetSummary.answerNotSure", "not sure");
  const water = legacyWaterAnswer(r);
  const legacy = water
    ? [{ key: "water", answer: water, question: t("vetSummary.legacyWater", "Drinking water (asked in older checks)"), answerText: answerText(water), note: notes.water || null }]
    : [];
  return [...flaggedAnswers(r).map(({ key, answer }) => {
    const field = SCAN_FIELDS.find((f) => f.key === key)!;
    return {
      key,
      answer,
      question: scanQuestionFor(t, field, birdName),
      answerText: answerText(answer),
      note: notes[key] || null,
    };
  }), ...legacy];
}

/** Older checks asked about drinking water; that question is gone from
 *  SCAN_FIELDS, but a flag it recorded still belongs in the vet summary. */
function legacyWaterAnswer(r: any): "not_sure" | "concerning" | null {
  return r?.water_status === "not_sure" || r?.water_status === "concerning" ? r.water_status : null;
}

/** "a, b and c" in the reader's language. */
function joinList(items: string[], lang: string): string {
  try {
    return new Intl.ListFormat(lang || "en", { style: "long", type: "conjunction" }).format(items);
  } catch {
    return items.join(", ");
  }
}

// ---------------------------------------------------------------------------
// Flagged for review — every check in the last 6 months where any item came
// back not_sure/concerning. Grouped so the serious ones read first: scans with
// any 'concerning' item or a red triage, then not-sure-only scans. Purely
// descriptive: dates, items, the app-recorded triage, owner notes, resolution.
// ---------------------------------------------------------------------------
export function FlaggedForReview({ scans, birdName }: { scans: any[]; birdName?: string | null }) {
  const { t } = useTranslation();
  const isSerious = (r: any) => r.triage_status === "red" || flaggedAnswers(r).some((a) => a.answer === "concerning") || legacyWaterAnswer(r) === "concerning";
  const serious = scans.filter(isSerious);
  const milder = scans.filter((r) => !isSerious(r));

  // Triage chip — shows the app-RECORDED level in its own color (data, not
  // editorializing). Red/yellow/green map to the app's red/amber/pale palettes.
  const TriageChip = ({ level }: { level: string }) => {
    const style =
      level === "red"
        ? { background: RED_BG, color: K.red }
        : level === "yellow"
          ? { background: K.amberBg, color: K.amberText }
          : { background: K.lime, color: K.forest };
    return <span className="inline-flex rounded-full px-2.5 py-0.5 text-[12px] font-[700]" style={style}>{cap(triageLevelLabel(level))}</span>;
  };

  const ScanRow = ({ r, serious: seriousRow }: { r: any; serious: boolean }) => {
    const flagged = flaggedItems(t, r, birdName);
    return (
      <div
        className="avoid-break mt-2 rounded-[14px] p-3"
        style={{ border: `1px solid ${K.line}`, borderLeft: `3px solid ${seriousRow ? K.red : K.line}` }}
      >
        <div className="flex items-center justify-between gap-3">
          <p className="m-0 text-[14px] font-[700]" style={{ color: K.forest }}>{fmtDate(r.created_at)}</p>
          <p className="m-0 flex shrink-0 items-center gap-1.5">
            <TriageChip level={r.triage_status} />
            <span className={`text-[12.5px] ${r.resolved_at ? "" : "font-[700]"}`} style={{ color: r.resolved_at ? K.quiet : K.forest }}>
              {r.resolved_at ? t("vetSummary.resolvedOn", "resolved {{date}}", { date: fmtDate(r.resolved_at) }) : t("vetSummary.unresolved", "unresolved")}
            </span>
          </p>
        </div>
        <ul className="m-0 mt-1.5 list-none space-y-1 p-0">
          {flagged.map((i) => (
            <li key={i.key} className="text-[14px] leading-snug">
              <span className="font-[700]" style={{ color: K.forest }}>{i.question}</span>
              <span className="font-[700]" style={{ color: i.answer === "concerning" ? K.red : K.amberText }}>
                {" "}· {i.answerText}
              </span>
              {i.note && <span className="block text-[13px] italic" style={{ color: K.quiet }}>"{i.note}"</span>}
            </li>
          ))}
        </ul>
      </div>
    );
  };

  return (
    <Section label={t("vetSummary.flaggedTitle", "Flagged for review (last 6 months)")}>
      {scans.length === 0 ? (
        <p className="m-0 text-[15px] italic" style={{ color: K.quiet }}>{t("vetSummary.noFlagged", "No flagged checks in the last 6 months.")}</p>
      ) : (
        <>
          {serious.length > 0 && (
            <div className="avoid-break">
              <p className="m-0 mt-1 text-[13px] font-[700]" style={{ color: K.red }}>{t("vetSummary.seriousGroup", "Concerning items or red triage")}</p>
              {serious.map((r) => <ScanRow key={r.id} r={r} serious />)}
            </div>
          )}
          {milder.length > 0 && (
            <div className={serious.length > 0 ? "mt-4" : ""}>
              <p className="m-0 mt-1 text-[13px] font-[700]" style={{ color: K.quiet }}>{t("vetSummary.milderGroup", "Marked \"not sure\" only")}</p>
              {milder.map((r) => <ScanRow key={r.id} r={r} serious={false} />)}
            </div>
          )}
        </>
      )}
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Weight appendix — the complete raw series, most recent first, with the
// context we capture per entry (date/time, grams, meal relation, who logged,
// note). Complements the summarized trend in the body.
// ---------------------------------------------------------------------------
const mealLabel = (m: string | null | undefined): string | null =>
  m === "before_meal" ? i18next.t("vetSummary.beforeMeal", "before meal") : m === "after_meal" ? i18next.t("vetSummary.afterMeal", "after meal") : null;
const sourceLabel = (s: string | null | undefined): string | null =>
  s === "owner" ? i18next.t("vetSummary.sourceOwner", "owner") : s === "household" ? i18next.t("vetSummary.sourceHousehold", "household") : s === "sitter" ? i18next.t("vetSummary.sourceSitter", "sitter") : null;
// The app-recorded triage level (stored "red"/"yellow"/"green"), displayed.
function triageLevelLabel(level: string | null | undefined): string {
  switch (level) {
    case "red": return i18next.t("vetSummary.triageRed", "red");
    case "yellow": return i18next.t("vetSummary.triageYellow", "yellow");
    case "green": return i18next.t("vetSummary.triageGreen", "green");
    default: return level ?? "";
  }
}
function fmtDateTime(iso: string): string {
  return formatLocalDateTime(new Date(iso), { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function WeightAppendix({ entries }: { entries: WeightRow[] }) {
  const { t } = useTranslation();
  if (entries.length === 0) return null;
  return (
    <KyaCard className="p-5">
      <KyaHeading as="h3" size={19}>{t("vetSummary.appendixHeading", "Appendix: weight history")}</KyaHeading>
      <p className="m-0 mt-1 text-[13px]" style={{ color: K.quiet }}>{entries.length === 1 ? t("vetSummary.entriesOne", "{{n}} entry, newest first", { n: entries.length }) : t("vetSummary.entriesOther", "{{n}} entries, newest first", { n: entries.length })}</p>
      {/* Column headers so the series reads as a table at a glance. Two
          columns that fit 375px: date with its context underneath, weight on
          the right (no fixed widths squeezing the context). */}
      <div className="mt-3 flex items-baseline justify-between gap-3 border-b pb-1.5" style={{ borderColor: K.line }}>
        <span className="min-w-0 flex-1 text-[13px] font-[700]" style={{ color: K.quiet }}>{t("vetSummary.colDate", "Date")}</span>
        <span className="shrink-0 text-right text-[13px] font-[700]" style={{ color: K.quiet }}>{t("vetSummary.colWeight", "Weight")}</span>
      </div>
      <div>
        {entries.map((e, i) => {
          const context = [mealLabel(e.meal_relation), sourceLabel(e.source) && t("vetSummary.loggedBy", "logged by {{source}}", { source: sourceLabel(e.source) })].filter(Boolean).join(" · ");
          return (
            <div key={e.id} className="avoid-break flex items-baseline justify-between gap-3 py-2" style={{ borderBottom: i === entries.length - 1 ? undefined : `1px solid ${K.line}` }}>
              <span className="min-w-0 flex-1">
                <span className="block text-[13px]" style={{ color: K.forest }}>{fmtDateTime(e.measured_at)}</span>
                {(context || e.note) && (
                  <span className="mt-0.5 block text-[13px] leading-snug [overflow-wrap:anywhere]" style={{ color: K.quiet }}>
                    {context}
                    {e.note && <span className="italic" style={{ color: K.ink }}>{context ? " · " : ""}"{e.note}"</span>}
                  </span>
                )}
              </span>
              <span className="shrink-0 whitespace-nowrap text-right text-[14px] font-[700]" style={{ color: K.forest }}>{e.grams} g</span>
            </div>
          );
        })}
      </div>
    </KyaCard>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <KyaCard className="p-5">
      <KyaHeading as="h3" size={19}>{label}</KyaHeading>
      <div className="mt-2">{children}</div>
    </KyaCard>
  );
}

function Value({ text, multiline }: { text: string | null | undefined; multiline?: boolean }) {
  if (!text) return <p className="m-0 text-[15px] italic" style={{ color: K.quiet }}>{cap(none())}</p>;
  if (!multiline) return <p className="m-0 text-[15px]" style={{ color: K.forest }}>{text}</p>;
  // Multiline values are "Label: detail" lines (Medications:, Conditions:,
  // Out of cage:, Pelleted:, …) — bold the label before the first colon so
  // each line's subject reads at a glance.
  return (
    <div className="space-y-1">
      {text.split("\n").map((line, i) => {
        const m = line.match(/^([^:]{1,60}):\s*(.*)$/);
        return (
          <p key={i} className="m-0 text-[15px] leading-[1.5]" style={{ color: K.forest }}>
            {m ? (<><span className="font-[700]">{m[1]}:</span> {m[2]}</>) : line}
          </p>
        );
      })}
    </div>
  );
}


// Light red behind red-triage chips (the K palette has the red ink only).
const RED_BG = "#f6dede";

function cap(s: string): string { return s.charAt(0).toUpperCase() + s.slice(1); }
function val(s: unknown): s is string { return typeof s === "string" && s.trim().length > 0; }
function fmtDate(iso: string): string {
  return formatLocalDate(new Date(iso), { year: "numeric", month: "short", day: "numeric" });
}
function trendLabel(trend: "steady" | "up" | "down", delta: number, baseline?: unknown): string {
  // computeWeightTrend reports "steady" when there is nothing to compare
  // against, which on a single entry reads as a clinical claim we cannot make.
  if (!baseline) return i18next.t("vetSummary.trendFirst", "first recorded weight");
  if (trend === "down") return i18next.t("vetSummary.trendDown", "down {{n}} g", { n: Math.abs(delta) });
  if (trend === "up") return i18next.t("vetSummary.trendUp", "up {{n}} g", { n: delta });
  return i18next.t("vetSummary.trendSteady", "steady");
}

function buildDiet(plan: any): string | null {
  if (!plan) return null;
  const types = (plan.diet_types ?? []) as string[];
  const details = (plan.diet_details ?? {}) as Record<string, any[]>;
  const lines: string[] = [];
  for (const dietKey of types) {
    const label = dietLabel(dietKey);
    const items = (details[dietKey] ?? []).filter((it) => (it.name ?? "").trim() || it.freeFed);
    if (!items.length) { lines.push(label); continue; }
    const parts = items.map((it) => {
      const amt = it.freeFed ? i18next.t("vetSummary.freeFed", "free-fed") : formatAmountUnitDisplay(it.amount, it.unit, i18next.t);
      const when = it.freeFed ? "" : normalizeFeedTimes(it.times).map((ft) => feedTimeLabel(ft, "period")).join(", ");
      return [it.name?.trim() || label, [amt, when].filter(Boolean).join(" @ ")].filter(Boolean).join(" — ");
    });
    lines.push(`${label}: ${parts.join("; ")}`);
  }
  const never = (plan.never_feed ?? []) as string[];
  if (never.length) lines.push(i18next.t("vetSummary.neverFeedLine", "Never feed: {{value}}", { value: never.join(", ") }));
  return lines.length ? lines.join("\n") : null;
}
