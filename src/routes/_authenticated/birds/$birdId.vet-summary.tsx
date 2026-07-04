import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ArrowLeft, FileText, Share2, Printer } from "lucide-react";
import { computeWeightTrend } from "@/lib/weightTrend";
import { formatAmountUnit } from "@/lib/labels";
import { normalizeFeedTimes, feedTimeLabel } from "@/lib/feedTimes";
import { InkHero, PrimaryButton, Card } from "@/components/system";
import { SCAN_COLS } from "./$birdId.scans.$scanId";

type WeightRow = { id: string; grams: number; measured_at: string; source: string | null; meal_relation: string | null; note: string | null };

export const Route = createFileRoute("/_authenticated/birds/$birdId/vet-summary")({
  head: () => ({ meta: [{ title: "Vet summary — Kya & Co." }] }),
  component: VetSummary,
});

const NONE = "none on file";
const DIET_LABELS: Record<string, string> = {
  pelleted: "Pelleted", seed: "Seed mix", pellet_seed: "Pellet & seed", chop: "Fresh chop / formulated", other: "Other",
};
const SEX_METHOD: Record<string, string> = { dna: "DNA", surgical: "surgical", visual: "visual", unknown: "" };

function VetSummary() {
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
        .select("id, log_date, created_at, triage_status, triage_reasons, resolved_at, item_notes, alertness_status, food_status, water_status, droppings_status, energy_status, breathing_status, posture_status, behavior_status, injury_status, exposure_status")
        .eq("bird_id", birdId)
        .gte("log_date", cutoff)
        .order("created_at", { ascending: false });
      return ((data ?? []) as any[]).filter((r) =>
        SCAN_COLS.some((c) => r[c.col] === "not_sure" || r[c.col] === "concerning"),
      );
    },
  });

  const name = bird?.name ?? "This bird";
  const { current, trend, delta } = computeWeightTrend(weights ?? [], 90);

  // ---- assemble field values (string | null) ----
  const sexText = bird?.sex
    ? `${cap(bird.sex)}${bird.sex_method && SEX_METHOD[bird.sex_method] ? ` (${SEX_METHOD[bird.sex_method]})` : ""}`
    : null;
  const identity: [string, string | null][] = [
    ["Species", bird?.species ?? null],
    ["Sex", sexText],
    ["Age", bird?.age ?? null],
    ["Microchip", bird?.microchip ?? null],
    ["Band", bird?.band_number ?? null],
    ["Origin", bird?.origin ?? null],
  ];

  const weightText = current
    ? `${current.grams} g · ${trendLabel(trend, delta)} · last weighed ${fmtDate(current.measured_at)}`
    : null;

  const dietText = buildDiet(plan);
  const meds = [
    val(bird?.medications) && `Medications: ${bird.medications.trim()}`,
    val(bird?.medical_conditions) && `Conditions: ${bird.medical_conditions.trim()}`,
  ].filter(Boolean).join("\n");
  // Handling = is the bird handleable, for the person about to handle it:
  // steps up (yes/no/sometimes + caveats), who can handle, bite risk, plus any
  // free-text handling rules. Out-of-cage/home routine is deliberately NOT
  // pulled in — not relevant to a vet visit.
  const stepUpRaw = (plan?.step_up ?? "").trim().toLowerCase();
  const stepUpLabel = stepUpRaw === "yes" ? "Yes" : stepUpRaw === "no" ? "No" : stepUpRaw === "sometimes" ? "Sometimes" : null;
  const handling = [
    (stepUpLabel || val(plan?.step_up_notes)) &&
      `Steps up: ${[stepUpLabel, val(plan?.step_up_notes) ? plan.step_up_notes.trim() : null].filter(Boolean).join(" · ")}`,
    val(plan?.handlers) && `Who can handle: ${plan.handlers.trim()}`,
    val(plan?.bite_risk) && `Bite risk: ${plan.bite_risk.trim()}`,
    val(plan?.handling_rules) && plan.handling_rules.trim(),
  ].filter(Boolean).join("\n");

  function shareText(): string {
    const lines = [
      `${name} — vet summary`,
      bird?.species ? `Species: ${bird.species}` : "",
      `Generated ${fmtDate(new Date().toISOString())}`,
      "",
      "IDENTITY",
      ...identity.map(([l, v]) => `  ${l}: ${v ?? NONE}`),
      "",
      `WEIGHT: ${weightText ?? NONE}`,
      "",
      `DIET: ${dietText ?? NONE}`,
      "",
      `MEDS & HEALTH FLAGS: ${meds || NONE}`,
      "",
      `HANDLING: ${handling || NONE}`,
      "",
      "FLAGGED FOR REVIEW (LAST 6 MONTHS)",
      ...(!(flaggedScans ?? []).length
        ? ["  No flagged checks in the last 6 months."]
        : (flaggedScans ?? []).map((r: any) => {
            const items = SCAN_COLS
              .filter((c) => r[c.col] === "not_sure" || r[c.col] === "concerning")
              .map((c) => `${c.label}: ${r[c.col] === "concerning" ? "concerning" : "not sure"}${((r.item_notes ?? {}) as any)[c.fkey] ? ` ("${((r.item_notes ?? {}) as any)[c.fkey]}")` : ""}`)
              .join("; ");
            return `  ${fmtDate(r.created_at)} · triage ${r.triage_status} · ${r.resolved_at ? `resolved ${fmtDate(r.resolved_at)}` : "unresolved"} — ${items}`;
          })),
      "",
      `WEIGHT HISTORY (${(weights ?? []).length} entries, newest first)`,
      ...(weights ?? []).map((e) => {
        const bits = [
          `${e.grams} g`,
          e.meal_relation === "before_meal" ? "before meal" : e.meal_relation === "after_meal" ? "after meal" : null,
          e.source ? `by ${e.source}` : null,
          e.note ? `"${e.note}"` : null,
        ].filter(Boolean).join(" · ");
        return `  ${fmtDate(e.measured_at)} — ${bits}`;
      }),
    ];
    return lines.filter((l) => l !== undefined).join("\n");
  }

  async function share() {
    const text = shareText();
    try {
      if (navigator.share) { await navigator.share({ title: `${name} — vet summary`, text }); return; }
      await navigator.clipboard.writeText(text);
      toast.success("Summary copied to clipboard.");
    } catch { /* user cancelled share — ignore */ }
  }

  return (
    <div className="min-h-screen bg-[var(--cream)] pb-nav">
      <div className="mx-auto max-w-md">
        <div data-noprint>
          <InkHero
            backIcon={<ArrowLeft className="size-5" />}
            onBack={() => navigate({ to: "/birds/$birdId", params: { birdId } })}
            eyebrow="Vet summary"
            headline="One sheet for the vet."
          />
        </div>

        <main className="px-5 pt-5">
          {!generated ? (
            <Card className="px-8 py-8 text-center">
              <FileText className="mx-auto size-7 text-[var(--moss)]" />
              <p className="t-body mx-auto mt-3 text-[var(--ink)]">A clean snapshot for the vet — identity, weight, diet, meds, handling, and flagged health checks, pulled from {name}'s record.</p>
              <div className="mt-4">
                <PrimaryButton tone="ink" icon={<FileText className="size-4" />} onPress={() => setGenerated(true)}>Generate summary</PrimaryButton>
              </div>
            </Card>
          ) : (
            <>
              {/* Actions */}
              <div data-noprint className="mb-4 flex gap-2">
                <button type="button" onClick={share} className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-[12px] bg-white px-[18px] py-[11px] text-[15px] font-[500] text-[var(--ink)] ring-1 ring-[var(--line)] active:scale-[0.99]">
                  <Share2 className="size-4" /> Share
                </button>
                <div className="flex-1">
                  <PrimaryButton tone="lime" icon={<Printer className="size-4" />} onPress={() => window.print()}>Save as PDF</PrimaryButton>
                </div>
              </div>

              {/* The sheet */}
              <article id="vet-sheet">
                <Card className="p-5">
                  {/* Sections below each carry their own top hairline. */}
                  <header className="pb-1">
                    <h2 className="t-section text-[20px]">{name}</h2>
                    {bird?.species && <p className="t-body mt-0.5 italic text-[var(--mute)]">{bird.species}</p>}
                    <p className="t-meta mt-1">Generated {fmtDate(new Date().toISOString())}</p>
                  </header>

                  <Section label="Identity">
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                      {identity.map(([l, v]) => (
                        <div key={l}>
                          <dt className="t-eyebrow text-[var(--mute2)]">{l}</dt>
                          <dd className={`t-body ${v ? "text-[var(--ink)]" : "italic text-[var(--mute2)]"}`}>{v ?? NONE}</dd>
                        </div>
                      ))}
                    </dl>
                  </Section>

                  <Section label="Weight">
                    {current ? (
                      <div>
                        <p className="text-[22px] font-[550] leading-tight text-[var(--moss)]">{current.grams} g</p>
                        <p className="t-meta mt-0.5">{trendLabel(trend, delta)} · last weighed {fmtDate(current.measured_at)}</p>
                      </div>
                    ) : (
                      <Value text={null} />
                    )}
                  </Section>
                  <Section label="Diet"><Value text={dietText} multiline /></Section>
                  <Section label="Meds & health flags"><Value text={meds} multiline /></Section>
                  <FlaggedForReview scans={flaggedScans ?? []} />
                  <Section label="Handling"><Value text={handling} multiline /></Section>

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
    return <span className="inline-flex rounded-full px-2 py-0.5 text-[10.5px] font-[600] uppercase tracking-wide" style={style}>{level}</span>;
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
              {r.resolved_at ? `resolved ${fmtDate(r.resolved_at)}` : "unresolved"}
            </span>
          </p>
        </div>
        <ul className="mt-1.5 space-y-1">
          {flagged.map((c) => (
            <li key={c.col} className="text-[13px] leading-snug">
              <span className="font-[550] text-[var(--ink)]">{c.label}</span>
              <span className="font-[550]" style={{ color: r[c.col] === "concerning" ? "var(--red-ink)" : "var(--amber-ink)" }}>
                {" "}· {r[c.col] === "concerning" ? "concerning" : "not sure"}
              </span>
              {notes[c.fkey] && <span className="block pl-0 text-[12.5px] italic text-[var(--mute)]">"{notes[c.fkey]}"</span>}
            </li>
          ))}
        </ul>
        {r.triage_reasons && <p className="t-meta mt-1.5">{String(r.triage_reasons).replace(/ \| /g, " · ")}</p>}
      </div>
    );
  };

  return (
    <Section label="Flagged for review (last 6 months)">
      {scans.length === 0 ? (
        <p className="t-body italic text-[var(--mute2)]">No flagged checks in the last 6 months.</p>
      ) : (
        <>
          {serious.length > 0 && (
            <div className="avoid-break">
              <p className="mt-1 text-[12px] font-[650] uppercase tracking-wide" style={{ color: "var(--red-ink)" }}>Concerning items or red triage</p>
              {serious.map((r) => <ScanRow key={r.id} r={r} serious />)}
            </div>
          )}
          {milder.length > 0 && (
            <div className={serious.length > 0 ? "mt-4" : ""}>
              <p className="mt-1 text-[12px] font-[650] uppercase tracking-wide text-[var(--mute)]">Marked "not sure" only</p>
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
  m === "before_meal" ? "before meal" : m === "after_meal" ? "after meal" : null;
const sourceLabel = (s: string | null | undefined): string | null =>
  s === "owner" ? "owner" : s === "household" ? "household" : s === "sitter" ? "sitter" : null;
function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function WeightAppendix({ entries }: { entries: WeightRow[] }) {
  if (entries.length === 0) return null;
  return (
    <Card className="mt-4 p-5">
      <p className="t-eyebrow text-[var(--teal-on-cream)]">Appendix · weight history</p>
      <p className="t-meta mt-0.5">{entries.length} {entries.length === 1 ? "entry" : "entries"}, newest first</p>
      {/* Column headers so the series reads as a table at a glance. */}
      <div className="mt-3 flex items-baseline gap-3 border-b border-[var(--line)] pb-1.5">
        <span className="w-40 shrink-0 text-[10.5px] font-[600] uppercase tracking-wide text-[var(--mute2)]">Date</span>
        <span className="w-14 shrink-0 text-[10.5px] font-[600] uppercase tracking-wide text-[var(--mute2)]">Weight</span>
        <span className="min-w-0 flex-1 text-[10.5px] font-[600] uppercase tracking-wide text-[var(--mute2)]">Context</span>
      </div>
      <div>
        {entries.map((e, i) => {
          const context = [mealLabel(e.meal_relation), sourceLabel(e.source) && `logged by ${sourceLabel(e.source)}`].filter(Boolean).join(" · ");
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
  if (!text) return <p className="t-body italic text-[var(--mute2)]">{NONE}</p>;
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
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}
function trendLabel(trend: "steady" | "up" | "down", delta: number): string {
  if (trend === "down") return `down ${Math.abs(delta)} g`;
  if (trend === "up") return `up ${delta} g`;
  return "steady";
}

function buildDiet(plan: any): string | null {
  if (!plan) return null;
  const types = (plan.diet_types ?? []) as string[];
  const details = (plan.diet_details ?? {}) as Record<string, any[]>;
  const lines: string[] = [];
  for (const t of types) {
    const label = DIET_LABELS[t] ?? t;
    const items = (details[t] ?? []).filter((it) => (it.name ?? "").trim() || it.freeFed);
    if (!items.length) { lines.push(label); continue; }
    const parts = items.map((it) => {
      const amt = it.freeFed ? "free-fed" : formatAmountUnit(it.amount, it.unit);
      const when = it.freeFed ? "" : normalizeFeedTimes(it.times).map((ft) => feedTimeLabel(ft, "period")).join(", ");
      return [it.name?.trim() || label, [amt, when].filter(Boolean).join(" @ ")].filter(Boolean).join(" — ");
    });
    lines.push(`${label}: ${parts.join("; ")}`);
  }
  const never = (plan.never_feed ?? []) as string[];
  if (never.length) lines.push(`Never feed: ${never.join(", ")}`);
  return lines.length ? lines.join("\n") : null;
}
