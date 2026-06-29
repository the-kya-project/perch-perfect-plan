import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ArrowLeft, FileText, Share2, FileDown } from "lucide-react";
import { computeWeightTrend } from "@/lib/weightTrend";
import { mergeEmergency, ASPCA_POISON_CONTROL } from "@/lib/emergency";
import { formatAmountUnit } from "@/lib/labels";
import { normalizeFeedTimes, feedTimeLabel } from "@/lib/feedTimes";
import { InkHero, PrimaryButton, Card } from "@/components/system";

export const Route = createFileRoute("/_authenticated/birds/$birdId/vet-summary")({
  head: () => ({ meta: [{ title: "Vet summary — Kya & Co." }] }),
  component: VetSummary,
});

const NONE = "none on file";
const DIET_LABELS: Record<string, string> = {
  pelleted: "Pelleted", seed: "Seed mix", pellet_seed: "Pellet & seed", chop: "Fresh chop / formulated", other: "Other",
};
const SEX_METHOD: Record<string, string> = { dna: "DNA", surgical: "surgical", visual: "visual", unknown: "" };
const KIND_LABEL: Record<string, string> = {
  molt: "Molt", meds: "Meds", vet: "Vet visit", behavior: "Behavior", note: "Note", other: "Other",
};
// before/after-meal label — show only what's recorded; never inferred.
const mealLabel = (m: string | null | undefined): string | null =>
  m === "before_meal" ? "before meal" : m === "after_meal" ? "after meal" : null;

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
      const { data } = await supabase.from("weight_entries")
        .select("grams, measured_at, meal_relation").eq("bird_id", birdId)
        .order("measured_at", { ascending: false }).limit(1000);
      return (data ?? []) as { grams: number; measured_at: string; meal_relation: string | null }[];
    },
  });
  const { data: journal } = useQuery({
    queryKey: ["vet-journal", birdId],
    queryFn: async () => {
      const { data } = await supabase.from("journal_entries")
        .select("kind, title, body, occurred_on").eq("bird_id", birdId)
        .order("occurred_on", { ascending: true }).limit(1000);
      return (data ?? []) as { kind: string; title: string | null; body: string | null; occurred_on: string }[];
    },
  });
  const { data: contacts } = useQuery({
    queryKey: ["contacts", birdId],
    queryFn: async () => {
      const { data } = await supabase.from("emergency_contacts").select("*").eq("bird_id", birdId).maybeSingle();
      return data as any;
    },
  });
  const { data: defaults } = useQuery({
    queryKey: ["owner-defaults"],
    enabled: !!bird?.owner_id,
    queryFn: async () => {
      const { data } = await supabase.from("owner_emergency_defaults").select("*").eq("owner_id", bird.owner_id).maybeSingle();
      return data as any;
    },
  });

  const name = bird?.name ?? "This bird";
  const { current, trend, delta } = computeWeightTrend(weights ?? [], 90);
  const em = mergeEmergency(contacts ?? null, defaults ?? null);

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
    val(plan?.when_to_call_vet) && `Call the vet if: ${plan.when_to_call_vet.trim()}`,
  ].filter(Boolean).join("\n");
  const handling = [
    val(plan?.handling_rules) && plan.handling_rules.trim(),
    val(plan?.out_of_cage_rules) && `Out of cage: ${plan.out_of_cage_rules.trim()}`,
  ].filter(Boolean).join("\n");

  // ---- appendix: weights + journal (all-time, oldest-first to read as a trend) ----
  const weightsAsc = [...(weights ?? [])].sort((a, b) => a.measured_at.localeCompare(b.measured_at));
  const appendixWeights = weightsAsc.map((w) => ({
    date: fmtDate(w.measured_at), time: fmtTime(w.measured_at), grams: w.grams, meal: mealLabel(w.meal_relation),
  }));
  const weightSummary = (() => {
    if (!weightsAsc.length) return null;
    const g = weightsAsc.map((w) => w.grams);
    const min = Math.min(...g), max = Math.max(...g);
    const recent = weightsAsc[weightsAsc.length - 1];
    const range = min === max ? `${min} g` : `${min}–${max} g`;
    return `${weightsAsc.length} ${weightsAsc.length === 1 ? "entry" : "entries"} · ${range} · most recent ${recent.grams} g (${fmtDate(recent.measured_at)})`;
  })();
  const appendixJournal = (journal ?? []).map((j) => ({
    date: fmtDate(j.occurred_on),
    kind: KIND_LABEL[j.kind] ?? null,
    title: val(j.title) ? j.title!.trim() : null,
    body: val(j.body) ? j.body!.trim() : "",
  }));

  const [downloading, setDownloading] = useState(false);
  function buildPdfData() {
    return {
      name,
      species: bird?.species ?? null,
      generated: fmtDate(new Date().toISOString()),
      fileDate: new Date().toISOString().slice(0, 10),
      identity,
      weightText,
      dietText,
      meds: meds || null,
      handling: handling || null,
      emergency: [
        { label: "Avian vet", value: [em.avian_vet_name, em.avian_vet_phone].filter(Boolean).join(" · ") },
        { label: "Emergency vet", value: [em.emergency_vet_name, em.emergency_vet_phone].filter(Boolean).join(" · ") },
        { label: "Owner", value: em.owner_phone ?? "" },
        { label: "Backup", value: [em.backup_name, em.backup_phone].filter(Boolean).join(" · ") },
        { label: "Poison control", value: em.poison_control || ASPCA_POISON_CONTROL },
      ],
      weightSummary,
      weights: appendixWeights,
      journal: appendixJournal,
    };
  }
  async function savePdf() {
    setDownloading(true);
    try {
      // Lazy-load the renderer so @react-pdf stays out of the entry bundle.
      const { downloadVetSummaryPdf } = await import("@/lib/vetSummaryPdf");
      await downloadVetSummaryPdf(buildPdfData());
    } catch {
      toast.error("Couldn't generate the PDF. Please try again.");
    } finally {
      setDownloading(false);
    }
  }

  function shareText(): string {
    const lines = [
      `${name} — vet & emergency summary`,
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
      "EMERGENCY CONTACTS",
      `  Avian vet: ${[em.avian_vet_name, em.avian_vet_phone].filter(Boolean).join(" · ") || NONE}`,
      `  Emergency vet: ${[em.emergency_vet_name, em.emergency_vet_phone].filter(Boolean).join(" · ") || NONE}`,
      `  Owner: ${em.owner_phone || NONE}`,
      `  Backup: ${[em.backup_name, em.backup_phone].filter(Boolean).join(" · ") || NONE}`,
      `  Poison control: ${em.poison_control || ASPCA_POISON_CONTROL}`,
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
              <p className="t-body mx-auto mt-3 text-[var(--ink)]">A clean one-page snapshot for the vet — identity, weight, diet, meds, handling, and emergency contacts, pulled from {name}'s record.</p>
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
                  <PrimaryButton tone="lime" icon={<FileDown className="size-4" />} onPress={savePdf} disabled={downloading}>{downloading ? "Saving…" : "Save as PDF"}</PrimaryButton>
                </div>
              </div>

              {/* The sheet */}
              <article id="vet-sheet">
                <Card className="p-5">
                  <header className="border-b border-[var(--line2)] pb-3">
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

                  <Section label="Weight"><Value text={weightText} /></Section>
                  <Section label="Diet"><Value text={dietText} multiline /></Section>
                  <Section label="Meds & health flags"><Value text={meds} multiline /></Section>
                  <Section label="Handling"><Value text={handling} multiline /></Section>

                  {/* Emergency — the one red block (legitimate emergency use) */}
                  <section className="mt-4 rounded-[12px] border p-3" style={{ borderColor: "var(--red-line)", backgroundColor: "var(--red-fill)" }}>
                    <p className="t-eyebrow" style={{ color: "var(--red-ink)" }}>Emergency contacts</p>
                    <dl className="mt-1.5 space-y-1" style={{ color: "var(--red-deep)" }}>
                      <EmRow label="Avian vet" value={[em.avian_vet_name, em.avian_vet_phone].filter(Boolean).join(" · ")} />
                      <EmRow label="Emergency vet" value={[em.emergency_vet_name, em.emergency_vet_phone].filter(Boolean).join(" · ")} />
                      <EmRow label="Owner" value={em.owner_phone ?? ""} />
                      <EmRow label="Backup" value={[em.backup_name, em.backup_phone].filter(Boolean).join(" · ")} />
                      <EmRow label="Poison control" value={em.poison_control || ASPCA_POISON_CONTROL} />
                    </dl>
                  </section>

                  {/* Appendix — full weight log + journal, all-time, oldest-first */}
                  <section className="mt-6 border-t border-[var(--line)] pt-4">
                    <p className="t-eyebrow text-[var(--teal-on-cream)]">Appendix · Weight log</p>
                    {weightSummary && <p className="t-meta mt-1">{weightSummary}</p>}
                    {appendixWeights.length === 0 ? (
                      <p className="t-body mt-2 italic text-[var(--mute2)]">No weight entries recorded.</p>
                    ) : (
                      <div className="mt-2">
                        <div className="flex border-b border-[var(--ink)] pb-1.5">
                          <span className="t-eyebrow w-[30%] text-[var(--mute)]">Date</span>
                          <span className="t-eyebrow w-[22%] text-[var(--mute)]">Time</span>
                          <span className="t-eyebrow w-[20%] text-[var(--mute)]">Weight</span>
                          <span className="t-eyebrow w-[28%] text-[var(--mute)]">Context</span>
                        </div>
                        {appendixWeights.map((w, i) => (
                          <div key={i} className="flex border-b border-[var(--line2)] py-1.5 text-[13px] text-[var(--ink)]">
                            <span className="w-[30%]">{w.date}</span>
                            <span className="w-[22%]">{w.time}</span>
                            <span className="w-[20%]">{w.grams} g</span>
                            <span className={`w-[28%] ${w.meal ? "" : "text-[var(--mute2)]"}`}>{w.meal ?? "—"}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    <p className="t-eyebrow mt-6 text-[var(--teal-on-cream)]">Appendix · Journal</p>
                    {appendixJournal.length === 0 ? (
                      <p className="t-body mt-2 italic text-[var(--mute2)]">No journal entries recorded.</p>
                    ) : (
                      <div className="mt-2 space-y-3">
                        {appendixJournal.map((j, i) => (
                          <div key={i}>
                            <p className="text-[13px] font-[500] text-[var(--ink)]">
                              {j.date}
                              {j.kind && <span className="font-[400] text-[var(--mute)]">{"  ·  "}{j.kind}</span>}
                              {j.title ? `  —  ${j.title}` : ""}
                            </p>
                            {j.body && <p className="t-body mt-0.5 whitespace-pre-line text-[var(--ink)]">{j.body}</p>}
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                </Card>
              </article>
            </>
          )}
        </main>
      </div>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="mt-4">
      <p className="t-eyebrow text-[var(--amber-line)]">{label}</p>
      <div className="mt-1">{children}</div>
    </section>
  );
}

function Value({ text, multiline }: { text: string | null | undefined; multiline?: boolean }) {
  if (!text) return <p className="t-body italic text-[var(--mute2)]">{NONE}</p>;
  return <p className={`t-body text-[var(--ink)] ${multiline ? "whitespace-pre-line" : ""}`}>{text}</p>;
}

function EmRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2 text-[14px] font-[400]">
      <dt className="w-28 shrink-0 font-[500]">{label}</dt>
      <dd className={value ? "" : "italic opacity-70"}>{value || NONE}</dd>
    </div>
  );
}

function cap(s: string): string { return s.charAt(0).toUpperCase() + s.slice(1); }
function val(s: unknown): s is string { return typeof s === "string" && s.trim().length > 0; }
function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}
function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
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
