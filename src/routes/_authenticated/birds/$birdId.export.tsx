import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getLocalUser } from "@/integrations/supabase/currentUser";
import { completePdfHandoff } from "@/lib/handoff.functions";
import { toast } from "sonner";
import { ArrowLeft, Printer, Loader2, AlertTriangle } from "lucide-react";

// PDF / offline handoff. Renders a print-optimized full-record sheet the sender
// can "Save as PDF" and give to an adopter who isn't on the app. Confirming the
// handoff snapshots Past birds and removes the bird (completePdfHandoff).
export const Route = createFileRoute("/_authenticated/birds/$birdId/export")({
  head: () => ({ meta: [{ title: "Export record — Kya & Co." }] }),
  component: ExportRecord,
});

const NONE = "none on file";
const DIET_LABELS: Record<string, string> = {
  pelleted: "Pelleted", seed: "Seed mix", pellet_seed: "Pellet & seed", chop: "Fresh chop / formulated", other: "Other",
};

function ExportRecord() {
  const { birdId } = Route.useParams();
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);
  const [recipientName, setRecipientName] = useState("");
  const [busy, setBusy] = useState(false);
  const complete = useServerFn(completePdfHandoff);

  const { data: bird } = useQuery({
    queryKey: ["export-bird", birdId],
    queryFn: async () => {
      const { data: u } = await getLocalUser();
      const { data } = await supabase.from("birds")
        .select("name, species, sex, age, microchip, band_number, origin, medications, medical_conditions, intake_date, is_foster, owner_id")
        .eq("id", birdId).maybeSingle();
      return { row: data as any, uid: u.user?.id ?? null };
    },
  });
  const { data: plan } = useQuery({
    queryKey: ["export-plan", birdId],
    queryFn: async () => (await supabase.from("care_plans").select("*").eq("bird_id", birdId).maybeSingle()).data as any,
  });
  const { data: weights } = useQuery({
    queryKey: ["export-weights", birdId],
    queryFn: async () => ((await supabase.from("weight_entries").select("grams, measured_at").eq("bird_id", birdId).order("measured_at", { ascending: false }).limit(40)).data ?? []) as { grams: number; measured_at: string }[],
  });
  const { data: journal } = useQuery({
    queryKey: ["export-journal", birdId],
    queryFn: async () => ((await supabase.from("journal_entries").select("body, created_at").eq("bird_id", birdId).order("created_at", { ascending: false }).limit(50)).data ?? []) as { body: string; created_at: string }[],
  });
  const { data: moments } = useQuery({
    queryKey: ["export-moments", birdId],
    queryFn: async () => ((await supabase.from("moments").select("title, on_date").eq("bird_id", birdId).order("on_date", { ascending: true }).limit(100)).data ?? []) as { title: string; on_date: string }[],
  });

  const row = bird?.row;
  const name = row?.name ?? "This bird";
  const notOwner = !!(row && bird?.uid && row.owner_id !== bird.uid);

  // Redirect non-owners via an effect — never call hooks below a conditional
  // return, and never navigate during render.
  useEffect(() => {
    if (notOwner) navigate({ to: "/birds/$birdId", params: { birdId }, replace: true });
  }, [notOwner, birdId, navigate]);

  async function confirmHandoff() {
    setBusy(true);
    try {
      await complete({ data: { birdId, recipientName: recipientName.trim() || undefined } });
      toast.success(`${name}'s record was handed off. They're in Past birds now.`);
      navigate({ to: "/dashboard" });
    } catch (e: any) { toast.error(e?.message ?? "Couldn't complete the handoff."); setBusy(false); }
  }

  const identity: [string, string | null][] = [
    ["Species", row?.species ?? null], ["Sex", row?.sex ? cap(row.sex) : null], ["Age", row?.age ?? null],
    ["Microchip", row?.microchip ?? null], ["Band", row?.band_number ?? null], ["Origin", row?.origin ?? null],
    ["Came to you", row?.intake_date ? fmtDate(row.intake_date) : null],
  ];
  const dietText = buildDiet(plan);
  const meds = [
    val(row?.medications) && `Medications: ${row.medications.trim()}`,
    val(row?.medical_conditions) && `Conditions: ${row.medical_conditions.trim()}`,
    val(plan?.when_to_call_vet) && `Call the vet if: ${plan.when_to_call_vet.trim()}`,
  ].filter(Boolean).join("\n");
  const routine = [
    val(plan?.handling_rules) && plan.handling_rules.trim(),
    val(plan?.out_of_cage_rules) && `Out of cage: ${plan.out_of_cage_rules.trim()}`,
    val(plan?.sleep_routine) && `Sleep: ${plan.sleep_routine.trim()}`,
  ].filter(Boolean).join("\n");

  if (notOwner) return null;

  return (
    <div className="min-h-screen bg-[#f4f1e8] pb-[calc(var(--nav-spacer)+6rem)]">
      <header data-noprint className="sticky top-0 z-10 border-b border-[#e3ded0] bg-[#f4f1e8]/95 backdrop-blur">
        <div className="mx-auto flex max-w-md items-center gap-3 px-5 pt-safe pb-3">
          <Link to="/birds/$birdId/handoff" params={{ birdId }} aria-label="Back" className="-ml-1 rounded p-1 text-[#1a3d2e]"><ArrowLeft className="size-5" /></Link>
          <h1 className="text-base font-medium text-[#1a3d2e]">Export {name}'s record</h1>
        </div>
      </header>

      <main className="mx-auto max-w-md px-5 py-5">
        <div data-noprint className="mb-4 space-y-2">
          <p className="text-sm leading-relaxed text-[#5f5e5a]">Save this as a PDF and give it to the adopter, then confirm the handoff below. Once you confirm, {name} moves to your Past birds and leaves your flock.</p>
          <button type="button" onClick={() => window.print()} className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-[14px] bg-[#1a3d2e] text-sm font-medium text-white">
            <Printer className="size-4" /> Save as PDF
          </button>
        </div>

        <article id="export-sheet" className="rounded-[14px] border border-[#d8d0bd] bg-white p-5">
          <header className="border-b border-[#e3dcc9] pb-3">
            <h2 className="text-xl font-medium text-[#1a3d2e]">{name}</h2>
            {row?.species && <p className="mt-0.5 text-sm italic text-[#5f5e5a]">{row.species}</p>}
            <p className="mt-1 text-xs text-[#8a897f]">Full record · generated {fmtDate(new Date().toISOString())}</p>
          </header>

          <Section label="Identity">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5">
              {identity.map(([l, v]) => (
                <div key={l}>
                  <dt className="text-[10px] font-semibold uppercase tracking-wider text-[#8a897f]">{l}</dt>
                  <dd className={`text-sm ${v ? "text-[#1a3d2e]" : "italic text-[#9a978c]"}`}>{v ?? NONE}</dd>
                </div>
              ))}
            </dl>
          </Section>

          <Section label="Diet"><Value text={dietText} multiline /></Section>
          <Section label="Meds & health"><Value text={meds} multiline /></Section>
          <Section label="Routine & handling"><Value text={routine} multiline /></Section>

          <Section label="Weight history">
            {weights && weights.length ? (
              <ul className="text-sm text-[#1a3d2e]">
                {weights.map((w, i) => <li key={i} className="flex justify-between border-b border-[#f0ebdd] py-0.5"><span>{fmtDate(w.measured_at)}</span><span className="tabular-nums">{w.grams} g</span></li>)}
              </ul>
            ) : <Value text={null} />}
          </Section>

          <Section label="Moments">
            {moments && moments.length ? (
              <ul className="space-y-0.5 text-sm text-[#1a3d2e]">
                {moments.map((m, i) => <li key={i} className="flex justify-between gap-3"><span>{m.title}</span><span className="shrink-0 text-[#8a897f]">{fmtDate(m.on_date)}</span></li>)}
              </ul>
            ) : <Value text={null} />}
          </Section>

          <Section label="Journal">
            {journal && journal.length ? (
              <ul className="space-y-2 text-sm text-[#1a3d2e]">
                {journal.map((j, i) => <li key={i}><span className="text-[11px] text-[#8a897f]">{fmtDate(j.created_at)}</span><p className="whitespace-pre-line">{j.body}</p></li>)}
              </ul>
            ) : <Value text={null} />}
          </Section>
        </article>
      </main>

      <footer data-noprint className="fixed inset-x-0 bottom-[var(--nav-spacer)] border-t border-[#e3ded0] bg-[#f4f1e8] px-5 py-3">
        <div className="mx-auto max-w-md">
          {!confirming ? (
            <button type="button" onClick={() => setConfirming(true)} className="min-h-[48px] w-full rounded-[14px] border border-[#c8bfa6] bg-white text-sm font-medium text-[#1a3d2e]">
              I gave them the PDF — did you hand off {name}?
            </button>
          ) : (
            <div className="space-y-2 rounded-[14px] p-3" style={{ background: "#FCEBEB", border: "1px solid #E24B4A" }}>
              <p className="flex items-start gap-2 text-sm" style={{ color: "#791F1F" }}>
                <AlertTriangle className="mt-0.5 size-4 shrink-0" style={{ color: "#A32D2D" }} />
                <span><span className="font-medium">This can't be undone.</span> {name} will leave your flock and move to Past birds.</span>
              </p>
              <input value={recipientName} maxLength={120} onChange={(e) => setRecipientName(e.target.value)} placeholder="Who did they go to? (optional)" className="w-full rounded-[10px] border border-[#e3a0a0] bg-white px-3 py-2 text-sm outline-none" />
              <div className="flex gap-2">
                <button type="button" disabled={busy} onClick={() => setConfirming(false)} className="min-h-[44px] flex-1 rounded-[12px] border border-[#c8bfa6] bg-white text-sm font-medium text-[#1a3d2e] disabled:opacity-50">Not yet</button>
                <button type="button" disabled={busy} onClick={confirmHandoff} className="flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-[12px] text-sm font-medium text-white disabled:opacity-50" style={{ background: "#A32D2D" }}>
                  {busy ? <Loader2 className="size-4 animate-spin" /> : null} Yes, hand off {name}
                </button>
              </div>
            </div>
          )}
        </div>
      </footer>

      <style>{`@media print {
        body * { visibility: hidden !important; }
        #export-sheet, #export-sheet * { visibility: visible !important; }
        #export-sheet { position: absolute; left: 0; top: 0; width: 100%; border: none !important; }
        [data-noprint] { display: none !important; }
      }`}</style>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="mt-4 break-inside-avoid">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-[#BA7517]">{label}</p>
      <div className="mt-1">{children}</div>
    </section>
  );
}
function Value({ text, multiline }: { text: string | null | undefined; multiline?: boolean }) {
  if (!text) return <p className="text-sm italic text-[#9a978c]">{NONE}</p>;
  return <p className={`text-sm text-[#1a3d2e] ${multiline ? "whitespace-pre-line" : ""}`}>{text}</p>;
}
function cap(s: string): string { return s.charAt(0).toUpperCase() + s.slice(1); }
function val(s: unknown): s is string { return typeof s === "string" && s.trim().length > 0; }
function fmtDate(iso: string): string { return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }); }

function buildDiet(plan: any): string | null {
  if (!plan) return null;
  const types = (plan.diet_types ?? []) as string[];
  const lines: string[] = types.map((t) => DIET_LABELS[t] ?? t);
  const never = (plan.never_feed ?? []) as string[];
  if (never.length) lines.push(`Never feed: ${never.join(", ")}`);
  return lines.length ? lines.join("\n") : null;
}
