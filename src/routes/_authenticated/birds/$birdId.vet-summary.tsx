import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ArrowLeft, FileText, Share2, Printer } from "lucide-react";
import { computeWeightTrend } from "@/lib/weightTrend";
import { mergeEmergency, ASPCA_POISON_CONTROL } from "@/lib/emergency";
import { formatAmountUnit } from "@/lib/labels";
import { normalizeFeedTimes, feedTimeLabel } from "@/lib/feedTimes";
import { InkHero, PrimaryButton, Card } from "@/components/system";

export const Route = createFileRoute("/_authenticated/birds/$birdId/vet-summary")({
  head: () => ({ meta: [{ title: "Vet summary — Parrot Care Co-Pilot" }] }),
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
      const { data } = await supabase.from("weight_entries")
        .select("grams, measured_at").eq("bird_id", birdId)
        .order("measured_at", { ascending: false }).limit(500);
      return (data ?? []) as { grams: number; measured_at: string }[];
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
    <div className="min-h-screen bg-[var(--cream)] pb-24">
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
                  <PrimaryButton tone="lime" icon={<Printer className="size-4" />} onPress={() => window.print()}>Save as PDF</PrimaryButton>
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
                </Card>
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
        [data-noprint] { display: none !important; }
      }`}</style>
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
