import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getLocalUser } from "@/integrations/supabase/currentUser";
import { completePdfHandoff } from "@/lib/handoff.functions";
import { pdfHandoffFailedText } from "@/lib/i18n/serverErrors";
import { toast } from "sonner";
import { ArrowLeft, Printer, Share2, Loader2, AlertTriangle } from "lucide-react";
import { isNativeApp } from "@/lib/nativeApp";
import { formatLocalDate } from "@/lib/dates";
import i18next from "i18next";
import { useTranslation } from "react-i18next";

// PDF / offline handoff. Renders a print-optimized full-record sheet the sender
// can "Save as PDF" and give to an adopter who isn't on the app. Confirming the
// handoff snapshots Past birds and removes the bird (completePdfHandoff).
export const Route = createFileRoute("/_authenticated/birds/$birdId/export")({
  head: () => ({ meta: [{ title: i18next.t("exportRecord.metaTitle", "Export record — Kya & Co.") }] }),
  component: ExportRecord,
});

const none = () => i18next.t("exportRecord.noneOnFile", "none on file");
function dietLabel(key: string): string {
  switch (key) {
    case "pelleted": return i18next.t("exportRecord.diet.pelleted", "Pelleted");
    case "seed": return i18next.t("exportRecord.diet.seed", "Seed mix");
    case "pellet_seed": return i18next.t("exportRecord.diet.pelletSeed", "Pellet & seed");
    case "chop": return i18next.t("exportRecord.diet.chop", "Fresh chop / formulated");
    case "other": return i18next.t("exportRecord.diet.other", "Other");
    default: return key;
  }
}
function sexLabel(sex: string): string {
  switch (sex.toLowerCase()) {
    case "male": return i18next.t("exportRecord.sex.male", "Male");
    case "female": return i18next.t("exportRecord.sex.female", "Female");
    case "unknown": return i18next.t("exportRecord.sex.unknown", "Unknown");
    default: return cap(sex);
  }
}

function ExportRecord() {
  const { t } = useTranslation();
  const { birdId } = Route.useParams();
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);
  const [recipientName, setRecipientName] = useState("");

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
  const name = row?.name ?? t("exportRecord.thisBird", "This bird");
  const complete = useServerFn(completePdfHandoff);
  const [busy, setBusy] = useState(false);
  const notOwner = row && bird?.uid && row.owner_id !== bird.uid;
  if (notOwner) { navigate({ to: "/birds/$birdId", params: { birdId }, replace: true }); return null; }

  async function confirmHandoff() {
    setBusy(true);
    try {
      await complete({ data: { birdId, recipientName: recipientName.trim() || undefined } });
      toast.success(t("exportRecord.handedOff", "{{name}}'s record was handed off. They're in Past birds now.", { name }));
      navigate({ to: "/dashboard" });
    } catch (e: any) {
      // Never e.message — same standard as the delete-bird screens. The server
      // logs the detail; the sender gets the one shared, retryable message.
      console.error("[handoff] PDF handoff failed", e);
      toast.error(pdfHandoffFailedText(name));
      setBusy(false);
    }
  }

  const identity: [string, string | null][] = [
    [t("exportRecord.species", "Species"), row?.species ?? null], [t("exportRecord.sex", "Sex"), row?.sex ? sexLabel(row.sex) : null], [t("exportRecord.age", "Age"), row?.age ?? null],
    [t("exportRecord.microchip", "Microchip"), row?.microchip ?? null], [t("exportRecord.band", "Band"), row?.band_number ?? null], [t("exportRecord.origin", "Origin"), row?.origin ?? null],
    [t("exportRecord.cameToYou", "Came to you"), row?.intake_date ? fmtDate(row.intake_date) : null],
  ];
  const dietText = buildDiet(plan);
  const meds = [
    val(row?.medications) && t("exportRecord.medicationsLine", "Medications: {{value}}", { value: row.medications.trim() }),
    val(row?.medical_conditions) && t("exportRecord.conditionsLine", "Conditions: {{value}}", { value: row.medical_conditions.trim() }),
    val(plan?.when_to_call_vet) && t("exportRecord.callVetLine", "Call the vet if: {{value}}", { value: plan.when_to_call_vet.trim() }),
  ].filter(Boolean).join("\n");
  const routine = [
    val(plan?.handling_rules) && plan.handling_rules.trim(),
    val(plan?.out_of_cage_rules) && t("exportRecord.outOfCageLine", "Out of cage: {{value}}", { value: plan.out_of_cage_rules.trim() }),
    val(plan?.sleep_routine) && t("exportRecord.sleepLine", "Sleep: {{value}}", { value: plan.sleep_routine.trim() }),
  ].filter(Boolean).join("\n");

  const native = isNativeApp();

  // Share the sheet exactly as rendered. Reading the article's text keeps this
  // honest — whatever the adopter receives is what the page shows — and avoids
  // a second, drift-prone serialiser for the same record.
  async function shareRecord() {
    const text = document.getElementById("export-sheet")?.innerText?.trim() ?? "";
    if (!text) { toast.error(t("exportRecord.nothingToShare", "Nothing to share yet — give the record a moment to load.")); return; }
    if (navigator.share) {
      try {
        await navigator.share({ title: t("exportRecord.shareTitle", "{{name}} — full record", { name }), text });
      } catch { /* dismissed — nothing to report */ }
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      toast.success(t("exportRecord.copied", "Record copied to clipboard."));
    } catch (e) {
      console.error("[export] clipboard write failed", e);
      toast.error(t("exportRecord.copyFailed", "Couldn't copy the record. Select the text below and copy it manually."));
    }
  }

  return (
    <div className="min-h-screen bg-[#f4f1e8] pb-[calc(var(--nav-spacer)+6rem)]">
      <header data-noprint className="sticky top-0 z-10 border-b border-[#e3ded0] bg-[#f4f1e8]/95 backdrop-blur">
        <div className="mx-auto flex max-w-md items-center gap-3 px-5 pt-safe pb-3">
          <Link to="/birds/$birdId/handoff" params={{ birdId }} aria-label={t("exportRecord.back", "Back")} className="-ml-1 rounded p-1 text-[#1a3d2e]"><ArrowLeft className="size-5" /></Link>
          <h1 className="text-base font-medium text-[#1a3d2e]">{t("exportRecord.title", "Export {{name}}'s record", { name })}</h1>
        </div>
      </header>

      <main className="mx-auto max-w-md px-5 py-5">
        {/* window.print() does nothing inside the native shells — no WebKit print
            delegate on iOS, no window.print at all in Android's WebView (see
            BUG-7). Here that mattered more than on the vet summary: this is the
            ONLY way to hand a bird to an adopter who isn't on the app, the copy
            instructs you to produce a PDF, there is no other affordance on the
            screen, and the next step is irreversible. So natively we share the
            sheet instead, which does work, and say so. */}
        <div data-noprint className="mb-4 space-y-2">
          <p className="text-sm leading-relaxed text-[#5f5e5a]">
            {native
              ? t("exportRecord.introNative", "Share {{name}}'s record with the adopter, then confirm the handoff below. Once you confirm, {{name}} moves to your Past birds and leaves your flock.", { name })
              : t("exportRecord.introWeb", "Save this as a PDF and give it to the adopter, then confirm the handoff below. Once you confirm, {{name}} moves to your Past birds and leaves your flock.", { name })}
          </p>
          {native ? (
            <button type="button" onClick={shareRecord} className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-[14px] bg-[#1a3d2e] text-sm font-medium text-white">
              <Share2 className="size-4" /> {t("exportRecord.shareRecord", "Share record")}
            </button>
          ) : (
            <button type="button" onClick={() => window.print()} className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-[14px] bg-[#1a3d2e] text-sm font-medium text-white">
              <Printer className="size-4" /> {t("exportRecord.saveAsPdf", "Save as PDF")}
            </button>
          )}
        </div>

        <article id="export-sheet" className="rounded-[14px] border border-[#d8d0bd] bg-white p-5">
          <header className="border-b border-[#e3dcc9] pb-3">
            <h2 className="text-xl font-medium text-[#1a3d2e]">{name}</h2>
            {row?.species && <p className="mt-0.5 text-sm italic text-[#5f5e5a]">{row.species}</p>}
            <p className="mt-1 text-xs text-[#8a897f]">{t("exportRecord.generated", "Full record · generated {{date}}", { date: fmtDate(new Date().toISOString()) })}</p>
          </header>

          <Section label={t("exportRecord.identity", "Identity")}>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5">
              {identity.map(([l, v]) => (
                <div key={l}>
                  <dt className="text-[10px] font-semibold uppercase tracking-wider text-[#8a897f]">{l}</dt>
                  <dd className={`text-sm ${v ? "text-[#1a3d2e]" : "italic text-[#9a978c]"}`}>{v ?? none()}</dd>
                </div>
              ))}
            </dl>
          </Section>

          <Section label={t("exportRecord.diet", "Diet")}><Value text={dietText} multiline /></Section>
          <Section label={t("exportRecord.medsHealth", "Meds & health")}><Value text={meds} multiline /></Section>
          <Section label={t("exportRecord.routineHandling", "Routine & handling")}><Value text={routine} multiline /></Section>

          <Section label={t("exportRecord.weightHistory", "Weight history")}>
            {weights && weights.length ? (
              <ul className="text-sm text-[#1a3d2e]">
                {weights.map((w, i) => <li key={i} className="flex justify-between border-b border-[#f0ebdd] py-0.5"><span>{fmtDate(w.measured_at)}</span><span className="tabular-nums">{w.grams} g</span></li>)}
              </ul>
            ) : <Value text={null} />}
          </Section>

          <Section label={t("exportRecord.moments", "Moments")}>
            {moments && moments.length ? (
              <ul className="space-y-0.5 text-sm text-[#1a3d2e]">
                {moments.map((m, i) => <li key={i} className="flex justify-between gap-3"><span>{m.title}</span><span className="shrink-0 text-[#8a897f]">{fmtDate(m.on_date)}</span></li>)}
              </ul>
            ) : <Value text={null} />}
          </Section>

          <Section label={t("exportRecord.journal", "Journal")}>
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
              {native
                ? t("exportRecord.confirmPromptNative", "I shared it with them — did you hand off {{name}}?", { name })
                : t("exportRecord.confirmPromptWeb", "I gave them the PDF — did you hand off {{name}}?", { name })}
            </button>
          ) : (
            <div className="space-y-2 rounded-[14px] p-3" style={{ background: "#FCEBEB", border: "1px solid #E24B4A" }}>
              <p className="flex items-start gap-2 text-sm" style={{ color: "#791F1F" }}>
                <AlertTriangle className="mt-0.5 size-4 shrink-0" style={{ color: "#A32D2D" }} />
                <span><span className="font-medium">{t("exportRecord.cantUndo", "This can't be undone.")}</span> {t("exportRecord.willLeave", "{{name}} will leave your flock and move to Past birds.", { name })}</span>
              </p>
              <input value={recipientName} maxLength={120} onChange={(e) => setRecipientName(e.target.value)} placeholder={t("exportRecord.recipientPlaceholder", "Who did they go to? (optional)")} className="w-full rounded-[10px] border border-[#e3a0a0] bg-white px-3 py-2 text-sm outline-none" />
              <div className="flex gap-2">
                <button type="button" disabled={busy} onClick={() => setConfirming(false)} className="min-h-[44px] flex-1 rounded-[12px] border border-[#c8bfa6] bg-white text-sm font-medium text-[#1a3d2e] disabled:opacity-50">{t("exportRecord.notYet", "Not yet")}</button>
                <button type="button" disabled={busy} onClick={confirmHandoff} className="flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-[12px] text-sm font-medium text-white disabled:opacity-50" style={{ background: "#A32D2D" }}>
                  {busy ? <Loader2 className="size-4 animate-spin" /> : null} {t("exportRecord.yesHandOff", "Yes, hand off {{name}}", { name })}
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
  if (!text) return <p className="text-sm italic text-[#9a978c]">{none()}</p>;
  return <p className={`text-sm text-[#1a3d2e] ${multiline ? "whitespace-pre-line" : ""}`}>{text}</p>;
}
function cap(s: string): string { return s.charAt(0).toUpperCase() + s.slice(1); }
function val(s: unknown): s is string { return typeof s === "string" && s.trim().length > 0; }
function fmtDate(iso: string): string { return formatLocalDate(new Date(iso), { year: "numeric", month: "short", day: "numeric" }); }

function buildDiet(plan: any): string | null {
  if (!plan) return null;
  const types = (plan.diet_types ?? []) as string[];
  const lines: string[] = types.map((dietKey) => dietLabel(dietKey));
  const never = (plan.never_feed ?? []) as string[];
  if (never.length) lines.push(i18next.t("exportRecord.neverFeedLine", "Never feed: {{value}}", { value: never.join(", ") }));
  return lines.length ? lines.join("\n") : null;
}
