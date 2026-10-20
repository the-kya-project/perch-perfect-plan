import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { speciesLabel } from "@/lib/speciesLabel";
import { ageLabel } from "@/components/BirdPickers";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ArrowLeft, FileText, Share2, Printer } from "lucide-react";
import { computeWeightTrend } from "@/lib/weightTrend";
import { formatAmountUnitDisplay } from "@/lib/labels";
import { normalizeFeedTimes, feedTimeLabel } from "@/lib/feedTimes";
import { InkHero, PrimaryButton, Card } from "@/components/system";
import { SCAN_COLS, scanColLabel, formatTriageReasons } from "./$birdId.scans.$scanId";
import { isNativeApp } from "@/lib/nativeApp";
import { formatLocalDate, formatLocalDateTime } from "@/lib/dates";
import i18next from "i18next";
import { useTranslation } from "react-i18next";

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
  const { t } = useTranslation();
  const { birdId } = Route.useParams();
  const navigate = useNavigate();
  const [generated, setGenerated] = useState(false);

  const { data: bird } = useQuery({
    queryKey: ["vet-bird", birdId],
    queryFn: async () => {
      const { data } = await supabase.from("birds")
        .select("name, species, sex, sex_method, age, microchip, band_number, origin, medications, medical_conditions, owner_id")
        .eq("id", birdId).maybeSingle();
      return data as any;
    },
  });
  const { data: plan } = useQuery({
    queryKey: ["vet-plan", birdId],
    queryFn: async () => {
      const { data } = await supabase.from("care_plans").select("*").eq("bird_id", birdId).maybeSingle();
      return data as any;
    },
  });
  const { data: weights } = useQuery({
    queryKey: ["weight-entries", birdId],
    queryFn: async () => {
      // IDENTICAL query to the weight page (same shared key, same shape) — the
      // two previously selected different columns under one key, so whichever
      // loaded last poisoned the other's cache. The full row feeds both the
      // trend line in the body AND the complete weight appendix.
      const { data } = await supabase.from("weight_entries")
        .select("*").eq("bird_id", birdId)
        .order("measured_at", { ascending: false }).limit(2000);
      return (data ?? []) as unknown as WeightRow[];
    },
  });

  // Flagged for review: every health check in the last 6 months where ANY item
  // came back not_sure/concerning — regardless of overall triage. Fetch the
  // window (indexed bird_id + log_date) and filter client-side.
  const { data: flaggedScans } = useQuery({
    queryKey: ["vet-flagged", birdId],
    queryFn: async () => {
      const cutoff = new Date(Date.now() - 183 * 86_400_000).toISOString().slice(0, 10);
      const { data } = await supabase
        .from("daily_logs")
        .select("id, log_date, created_at, triage_status, triage_reasons, triage_reason_codes, resolved_at, item_notes, alertness_status, food_status, water_status, droppings_status, energy_status, breathing_status, posture_status, behavior_status, injury_status, exposure_status")
        .eq("bird_id", birdId)
        .gte("log_date", cutoff)
        .order("created_at", { ascending: false });
      return ((data ?? []) as any[]).filter((r) =>
        SCAN_COLS.some((c) => r[c.col] === "not_sure" || r[c.col] === "concerning"),
      );
    },
  });

  const name = bird?.name ?? t("vetSummary.thisBird", "This bird");
  const { current, baseline, trend, delta } = computeWeightTrend(weights ?? [], 90);

  // ---- assemble field values (string | null) ----
  const sexText = bird?.sex
    ? `${sexLabel(bird.sex)}${sexMethodLabel(bird.sex_method) ? ` (${sexMethodLabel(bird.sex_method)})` : ""}`
    : null;
  const identity: [string, string | null][] = [
    [t("vetSummary.species", "Species"), bird?.species ? speciesLabel(t, bird.species) : null],
    [t("vetSummary.sex", "Sex"), sexText],
    [t("vetSummary.age", "Age"), bird?.age ? ageLabel(t, bird.age) : null],
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
      t("vetSummary.shareIdentity", "IDENTITY"),
      ...identity.map(([l, v]) => `  ${l}: ${v ?? none()}`),
      "",
      t("vetSummary.shareWeight", "WEIGHT: {{value}}", { value: weightText ?? none() }),
      "",
      t("vetSummary.shareDiet", "DIET: {{value}}", { value: dietText ?? none() }),
      "",
      t("vetSummary.shareMeds", "MEDS & HEALTH FLAGS: {{value}}", { value: meds || none() }),
      "",
      t("vetSummary.shareHandling", "HANDLING: {{value}}", { value: handling || none() }),
      "",
      t("vetSummary.shareFlagged", "FLAGGED FOR REVIEW (LAST 6 MONTHS)"),
      ...(!(flaggedScans ?? []).length
        ? [`  ${t("vetSummary.noFlagged", "No flagged checks in the last 6 months.")}`]
        : (flaggedScans ?? []).map((r: any) => {
            const items = SCAN_COLS
              .filter((c) => r[c.col] === "not_sure" || r[c.col] === "concerning")
              .map((c) => `${scanColLabel(t, c.col, c.label)}: ${r[c.col] === "concerning" ? t("vetSummary.answerConcerning", "concerning") : t("vetSummary.answerNotSure", "not sure")}${((r.item_notes ?? {}) as any)[c.fkey] ? ` ("${((r.item_notes ?? {}) as any)[c.fkey]}")` : ""}`)
              .join("; ");
            return `  ${fmtDate(r.created_at)} · ${t("vetSummary.triageLevel", "triage {{level}}", { level: triageLevelLabel(r.triage_status) })} · ${r.resolved_at ? t("vetSummary.resolvedOn", "resolved {{date}}", { date: fmtDate(r.resolved_at) }) : t("vetSummary.unresolved", "unresolved")} — ${items}`;
          })),
      "",
      t("vetSummary.shareWeightHistory", "WEIGHT HISTORY ({{n}} entries, newest first)", { n: (weights ?? []).length }),
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

  return (
    <div className="min-h-screen bg-[var(--cream)] pb-nav">
      <div className="mx-auto max-w-md">
        <div data-noprint>
          <InkHero
            backIcon={<ArrowLeft className="size-5" />}
            onBack={() => navigate({ to: "/birds/$birdId", params: { birdId } })}
            eyebrow={t("vetSummary.eyebrow", "Vet summary")}
            headline={t("vetSummary.headline", "One sheet for the vet.")}
          />
        </div>

        <main className="px-5 pt-5">
          {!generated ? (
            <Card className="px-8 py-8 text-center">
              <FileText className="mx-auto size-7 text-[var(--moss)]" />
              <p className="t-body mx-auto mt-3 text-[var(--ink)]">{t("vetSummary.intro", "A clean snapshot for the vet — identity, weight, diet, meds, handling, and flagged health checks, pulled from {{name}}'s record.", { name })}</p>
              <div className="mt-4">
                <PrimaryButton tone="ink" icon={<FileText className="size-4" />} onPress={() => setGenerated(true)}>{t("vetSummary.generate", "Generate summary")}</PrimaryButton>
              </div>
            </Card>
          ) : (
            <>
              {/* Actions */}
              <div data-noprint className="mb-4 flex gap-2">
                <button type="button" onClick={share} className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-[12px] bg-white px-[18px] py-[11px] text-[15px] font-[500] text-[var(--ink)] ring-1 ring-[var(--line)] active:scale-[0.99]">
                  <Share2 className="size-4" /> {t("vetSummary.share", "Share")}
                </button>
                {/* window.print() is a no-op inside the native shells: neither
                    @capacitor/ios nor AppDelegate implements WebKit's print
                    delegate, and Android's WebView has no window.print at all.
                    Showing the button there is a control that silently does
                    nothing. Share still works natively (navigator.share), so
                    there is still a way to get this to a vet. Proper fix is a
                    generated PDF -- see today-wip-backup (43fd077). */}
                {!isNativeApp() && (
                  <div className="flex-1">
                    <PrimaryButton tone="lime" icon={<Printer className="size-4" />} onPress={() => window.print()}>{t("vetSummary.saveAsPdf", "Save as PDF")}</PrimaryButton>
                  </div>
                )}
              </div>

              {/* The sheet */}
              <article id="vet-sheet">
                <Card className="p-5">
                  {/* Sections below each carry their own top hairline. */}
                  <header className="pb-1">
                    <h2 className="t-section text-[20px]">{name}</h2>
                    {bird?.species && <p className="t-body mt-0.5 italic text-[var(--mute)]">{speciesLabel(t, bird.species)}</p>}
                    <p className="t-meta mt-1">{t("vetSummary.generated", "Generated {{date}}", { date: fmtDate(new Date().toISOString()) })}</p>
                  </header>

                  <Section label={t("vetSummary.identity", "Identity")}>
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                      {identity.map(([l, v]) => (
                        <div key={l}>
                          <dt className="t-eyebrow text-[var(--mute2)]">{l}</dt>
                          <dd className={`t-body ${v ? "text-[var(--ink)]" : "italic text-[var(--mute2)]"}`}>{v ?? none()}</dd>
                        </div>
                      ))}
                    </dl>
                  </Section>

                  <Section label={t("vetSummary.weight", "Weight")}>
                    {current ? (
                      <div>
                        <p className="text-[22px] font-[550] leading-tight text-[var(--moss)]">{current.grams} g</p>
                        <p className="t-meta mt-0.5">{trendLabel(trend, delta, baseline)} · {t("vetSummary.lastWeighed", "last weighed {{date}}", { date: fmtDate(current.measured_at) })}</p>
                      </div>
                    ) : (
                      <Value text={null} />
                    )}
                  </Section>
                  <Section label={t("vetSummary.diet", "Diet")}><Value text={dietText} multiline /></Section>
                  <Section label={t("vetSummary.medsHealthFlags", "Meds & health flags")}><Value text={meds} multiline /></Section>
                  <FlaggedForReview scans={flaggedScans ?? []} />
                  <Section label={t("vetSummary.handling", "Handling")}><Value text={handling} multiline /></Section>

                </Card>

                {/* Appendix — the complete raw weight series (the body keeps the
                    summarized trend; this is in addition, for the vet to read). */}
                <WeightAppendix entries={weights ?? []} />
              </article>
            </>
          )}
        </main>
      </div>

      {/* Print only the sheet, regardless of app chrome. */}
      <style>{`@media print {
        body * { visibility: hidden !important; }
        #vet-sheet, #vet-sheet * { visibility: visible !important; }
        #vet-sheet { position: absolute; left: 0; top: 0; width: 100%; border: none !important; }
        #vet-sheet > div { box-shadow: none !important; }
        #vet-sheet .avoid-break { break-inside: avoid; page-break-inside: avoid; }
        [data-noprint] { display: none !important; }
      }`}</style>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Flagged for review — every check in the last 6 months where any item came
// back not_sure/concerning. Grouped so the serious ones read first: scans with
// any 'concerning' item or a red triage, then not-sure-only scans. Purely
// descriptive: dates, items, the app-recorded triage, owner notes, resolution.
// ---------------------------------------------------------------------------
export function FlaggedForReview({ scans }: { scans: any[] }) {
  const { t } = useTranslation();
  const isSerious = (r: any) => r.triage_status === "red" || SCAN_COLS.some((c) => r[c.col] === "concerning");
  const serious = scans.filter(isSerious);
  const milder = scans.filter((r) => !isSerious(r));

  // Triage chip — shows the app-RECORDED level in its own color (data, not
  // editorializing). Red/yellow/green map to the app's red/amber/pale palettes.
  const TriageChip = ({ level }: { level: string }) => {
    const style =
      level === "red"
        ? { background: "var(--red-fill)", color: "var(--red-ink)" }
        : level === "yellow"
          ? { background: "var(--amber-fill)", color: "var(--amber-ink)" }
          : { background: "var(--pale)", color: "var(--moss)" };
    return <span className="inline-flex rounded-full px-2 py-0.5 text-[10.5px] font-[600] uppercase tracking-wide" style={style}>{triageLevelLabel(level)}</span>;
  };

  const ScanRow = ({ r, serious: seriousRow }: { r: any; serious: boolean }) => {
    const flagged = SCAN_COLS.filter((c) => r[c.col] === "not_sure" || r[c.col] === "concerning");
    const notes = (r.item_notes ?? {}) as Record<string, string>;
    return (
      <div
        className="avoid-break mt-2 rounded-[10px] border border-[var(--line2)] p-2.5"
        style={{ borderLeft: `3px solid ${seriousRow ? "var(--red-line)" : "var(--line)"}` }}
      >
        <div className="flex items-center justify-between gap-3">
          <p className="text-[14px] font-[550] text-[var(--ink)]">{fmtDate(r.created_at)}</p>
          <p className="flex shrink-0 items-center gap-1.5">
            <TriageChip level={r.triage_status} />
            <span className={`text-[12px] ${r.resolved_at ? "text-[var(--mute)]" : "font-[550] text-[var(--ink)]"}`}>
              {r.resolved_at ? t("vetSummary.resolvedOn", "resolved {{date}}", { date: fmtDate(r.resolved_at) }) : t("vetSummary.unresolved", "unresolved")}
            </span>
          </p>
        </div>
        <ul className="mt-1.5 space-y-1">
          {flagged.map((c) => (
            <li key={c.col} className="text-[13px] leading-snug">
              <span className="font-[550] text-[var(--ink)]">{scanColLabel(t, c.col, c.label)}</span>
              <span className="font-[550]" style={{ color: r[c.col] === "concerning" ? "var(--red-ink)" : "var(--amber-ink)" }}>
                {" "}· {r[c.col] === "concerning" ? t("vetSummary.answerConcerning", "concerning") : t("vetSummary.answerNotSure", "not sure")}
              </span>
              {notes[c.fkey] && <span className="block pl-0 text-[12.5px] italic text-[var(--mute)]">"{notes[c.fkey]}"</span>}
            </li>
          ))}
        </ul>
        {formatTriageReasons(t, r) && <p className="t-meta mt-1.5">{formatTriageReasons(t, r)}</p>}
      </div>
    );
  };

  return (
    <Section label={t("vetSummary.flaggedTitle", "Flagged for review (last 6 months)")}>
      {scans.length === 0 ? (
        <p className="t-body italic text-[var(--mute2)]">{t("vetSummary.noFlagged", "No flagged checks in the last 6 months.")}</p>
      ) : (
        <>
          {serious.length > 0 && (
            <div className="avoid-break">
              <p className="mt-1 text-[12px] font-[650] uppercase tracking-wide" style={{ color: "var(--red-ink)" }}>{t("vetSummary.seriousGroup", "Concerning items or red triage")}</p>
              {serious.map((r) => <ScanRow key={r.id} r={r} serious />)}
            </div>
          )}
          {milder.length > 0 && (
            <div className={serious.length > 0 ? "mt-4" : ""}>
              <p className="mt-1 text-[12px] font-[650] uppercase tracking-wide text-[var(--mute)]">{t("vetSummary.milderGroup", "Marked \"not sure\" only")}</p>
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
    <Card className="mt-4 p-5">
      <p className="t-eyebrow text-[var(--teal-on-cream)]">{t("vetSummary.appendixTitle", "Appendix · weight history")}</p>
      <p className="t-meta mt-0.5">{entries.length === 1 ? t("vetSummary.entriesOne", "{{n}} entry, newest first", { n: entries.length }) : t("vetSummary.entriesOther", "{{n}} entries, newest first", { n: entries.length })}</p>
      {/* Column headers so the series reads as a table at a glance. */}
      <div className="mt-3 flex items-baseline gap-3 border-b border-[var(--line)] pb-1.5">
        <span className="w-40 shrink-0 text-[10.5px] font-[600] uppercase tracking-wide text-[var(--mute2)]">{t("vetSummary.colDate", "Date")}</span>
        <span className="w-14 shrink-0 text-[10.5px] font-[600] uppercase tracking-wide text-[var(--mute2)]">{t("vetSummary.colWeight", "Weight")}</span>
        <span className="min-w-0 flex-1 text-[10.5px] font-[600] uppercase tracking-wide text-[var(--mute2)]">{t("vetSummary.colContext", "Context")}</span>
      </div>
      <div>
        {entries.map((e, i) => {
          const context = [mealLabel(e.meal_relation), sourceLabel(e.source) && t("vetSummary.loggedBy", "logged by {{source}}", { source: sourceLabel(e.source) })].filter(Boolean).join(" · ");
          return (
            <div key={e.id} className={`avoid-break flex items-baseline gap-3 py-1.5 ${i === entries.length - 1 ? "" : "border-b border-[var(--line2)]"}`}>
              <span className="w-40 shrink-0 text-[12.5px] text-[var(--mute)]">{fmtDateTime(e.measured_at)}</span>
              <span className="w-14 shrink-0 text-[14px] font-[600] text-[var(--ink)]">{e.grams} g</span>
              <span className="min-w-0 flex-1 text-[12.5px] leading-snug text-[var(--mute)]">
                {context}
                {e.note && <span className="italic text-[var(--ink2)]">{context ? " · " : ""}"{e.note}"</span>}
              </span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="mt-5 border-t border-[var(--line2)] pt-4">
      <p className="t-eyebrow text-[var(--teal-on-cream)]">{label}</p>
      <div className="mt-1.5">{children}</div>
    </section>
  );
}

function Value({ text, multiline }: { text: string | null | undefined; multiline?: boolean }) {
  if (!text) return <p className="t-body italic text-[var(--mute2)]">{none()}</p>;
  if (!multiline) return <p className="t-body text-[var(--ink)]">{text}</p>;
  // Multiline values are "Label: detail" lines (Medications:, Conditions:,
  // Out of cage:, Pelleted:, …) — bold the label before the first colon so
  // each line's subject reads at a glance.
  return (
    <div className="space-y-0.5">
      {text.split("\n").map((line, i) => {
        const m = line.match(/^([^:]{1,60}):\s*(.*)$/);
        return (
          <p key={i} className="t-body text-[var(--ink)]">
            {m ? (<><span className="font-[600]">{m[1]}:</span> {m[2]}</>) : line}
          </p>
        );
      })}
    </div>
  );
}


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
