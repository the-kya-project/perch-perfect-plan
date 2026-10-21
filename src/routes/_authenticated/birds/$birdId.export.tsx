import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { speciesLabel } from "@/lib/speciesLabel";
import { birdAgeLabel } from "@/lib/birdAge";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getLocalUser } from "@/integrations/supabase/currentUser";
import { completePdfHandoff } from "@/lib/handoff.functions";
import { pdfHandoffFailedText } from "@/lib/i18n/serverErrors";
import { toast } from "sonner";
import { Printer, Share2, Loader2, AlertTriangle } from "lucide-react";
import { K, KyaPage, KyaBody, KyaCard, KyaHeading, KyaField, KyaLink, KyaPrimaryButton, KyaSecondaryButton, KyaSheet } from "@/components/kya";
import { PageHeader, useGoBack } from "@/components/headers";
import { isNativeApp } from "@/lib/nativeApp";
import { formatLocalDate } from "@/lib/dates";
import { parseCalendarDate } from "@/lib/localDay";
import { ownerIntakeDate } from "@/lib/intakeDate";
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
  const goBack = useGoBack(useCallback(() => navigate({ to: "/birds/$birdId/handoff", params: { birdId } }), [navigate, birdId]));

  const { data: bird } = useQuery({
    queryKey: ["export-bird", birdId],
    queryFn: async () => {
      const { data: u } = await getLocalUser();
      const { data } = await supabase.from("birds")
        .select("*") // "*" so the page works before intake_date_source exists (lib/missingColumn.ts)
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
    queryFn: async () => ((await supabase.from("moments").select("title, on_date").eq("bird_id", birdId).order("on_date", { ascending: true }).limit(100)).data ?? []) as { title: string; on_date: string | null }[],
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
    [t("exportRecord.species", "Species"), row?.species ? speciesLabel(t, row.species) : null], [t("exportRecord.sex", "Sex"), row?.sex ? sexLabel(row.sex) : null], [t("exportRecord.age", "Age"), birdAgeLabel(t, row)],
    [t("exportRecord.microchip", "Microchip"), row?.microchip ?? null], [t("exportRecord.band", "Band"), row?.band_number ?? null], [t("exportRecord.origin", "Origin"), row?.origin ?? null],
  ];
  // When the bird came home (birds.acquired_on), else the intake date — but
  // only one the owner entered. New birds used to save their creation day as
  // the intake date automatically (intake_date_source 'auto'); that one is
  // never shown or handed on. Missing: "Not added", with an Add link to the
  // identity editor that stays off the PDF and the shared text.
  const cameToYou = row?.acquired_on || ownerIntakeDate(row);
  const cameToYouLabel = t("exportRecord.cameToYou", "Came to you");
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
    // Screen-only controls (the "Add" link) stay out of the shared text.
    const sheet = document.getElementById("export-sheet");
    const screenOnly = Array.from(sheet?.querySelectorAll<HTMLElement>("[data-noprint]") ?? []);
    screenOnly.forEach((el) => { el.style.display = "none"; });
    const text = sheet?.innerText?.trim() ?? "";
    screenOnly.forEach((el) => { el.style.display = ""; });
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
    <KyaPage>
      <PageHeader
        title={t("exportRecord.title", "Export {{name}}'s record", { name })}
        line={native
          ? t("exportRecord.introNative", "Share {{name}}'s record with the adopter, then confirm the handoff below. Once you confirm, {{name}} moves to your Past birds and leaves your flock.", { name })
          : t("exportRecord.introWeb", "Save this as a PDF and give it to the adopter, then confirm the handoff below. Once you confirm, {{name}} moves to your Past birds and leaves your flock.", { name })}
        onBack={goBack}
      />

      <KyaBody>
        {/* window.print() does nothing inside the native shells — no WebKit print
            delegate on iOS, no window.print at all in Android's WebView (see
            BUG-7). Here that mattered more than on the vet summary: this is the
            ONLY way to hand a bird to an adopter who isn't on the app, the copy
            instructs you to produce a PDF, there is no other affordance on the
            screen, and the next step is irreversible. So natively we share the
            sheet instead, which does work, and say so. */}
        <div data-noprint>
          {native ? (
            <KyaPrimaryButton onClick={shareRecord} icon={<Share2 className="size-4" />}>{t("exportRecord.shareRecord", "Share record")}</KyaPrimaryButton>
          ) : (
            <KyaPrimaryButton onClick={() => window.print()} icon={<Printer className="size-4" />}>{t("exportRecord.saveAsPdf", "Save as PDF")}</KyaPrimaryButton>
          )}
        </div>

        <KyaCard id="export-sheet" className="p-5" style={{ color: K.forest }}>
          <header className="pb-3" style={{ borderBottom: `1px solid ${K.line}` }}>
            <KyaHeading size={24}>{name}</KyaHeading>
            {row?.species && <p className="m-0 mt-0.5 text-[14px] italic" style={{ color: K.quiet }}>{speciesLabel(t, row.species)}</p>}
            <p className="m-0 mt-1 text-[13px]" style={{ color: K.quiet }}>{t("exportRecord.generated", "Full record · generated {{date}}", { date: fmtDate(new Date().toISOString()) })}</p>
          </header>

          <Section label={t("exportRecord.identity", "Identity")}>
            <dl className="m-0 grid grid-cols-2 gap-x-4 gap-y-2">
              {identity.map(([l, v]) => (
                <div key={l}>
                  <dt className="text-[12.5px] font-[700]" style={{ color: K.quiet }}>{l}</dt>
                  <dd className={`m-0 text-[14px] ${v ? "" : "italic"}`} style={v ? undefined : { color: K.quiet }}>{v ?? none()}</dd>
                </div>
              ))}
              <div>
                <dt className="text-[12.5px] font-[700]" style={{ color: K.quiet }}>{cameToYouLabel}</dt>
                {cameToYou ? (
                  <dd className="m-0 text-[14px]">{fmtDate(cameToYou)}</dd>
                ) : (
                  <dd className="m-0 flex flex-wrap items-center gap-x-2 text-[14px]">
                    <span className="italic" style={{ color: K.quiet }}>{t("exportRecord.notAdded", "Not added")}</span>
                    <span data-noprint>
                      <KyaLink onClick={() => navigate({ to: "/birds/$birdId/identity", params: { birdId }, search: { edit: 1 } })}>{t("exportRecord.add", "Add")}</KyaLink>
                    </span>
                  </dd>
                )}
              </div>
            </dl>
          </Section>

          <Section label={t("exportRecord.diet", "Diet")}><Value text={dietText} multiline /></Section>
          <Section label={t("exportRecord.medsHealth", "Meds & health")}><Value text={meds} multiline /></Section>
          <Section label={t("exportRecord.routineHandling", "Routine & handling")}><Value text={routine} multiline /></Section>

          <Section label={t("exportRecord.weightHistory", "Weight history")}>
            {weights && weights.length ? (
              <ul className="m-0 list-none p-0 text-[14px]">
                {weights.map((w, i) => <li key={i} className="flex justify-between py-1" style={{ borderBottom: `1px solid ${K.line}` }}><span>{fmtDate(w.measured_at)}</span><span className="tabular-nums">{w.grams} g</span></li>)}
              </ul>
            ) : <Value text={null} />}
          </Section>

          <Section label={t("exportRecord.moments", "Moments")}>
            {moments && moments.length ? (
              <ul className="m-0 list-none space-y-1 p-0 text-[14px]">
                {moments.map((m, i) => <li key={i} className="flex justify-between gap-3"><span>{m.title}</span><span className="shrink-0" style={{ color: K.quiet }}>{m.on_date ? fmtDate(m.on_date) : t("exportRecord.noDate", "No date")}</span></li>)}
              </ul>
            ) : <Value text={null} />}
          </Section>

          <Section label={t("exportRecord.journal", "Journal")}>
            {journal && journal.length ? (
              <ul className="m-0 list-none space-y-2 p-0 text-[14px]">
                {journal.map((j, i) => <li key={i}><span className="text-[12.5px]" style={{ color: K.quiet }}>{fmtDate(j.created_at)}</span><p className="m-0 whitespace-pre-line">{j.body}</p></li>)}
              </ul>
            ) : <Value text={null} />}
          </Section>
        </KyaCard>

        <div data-noprint>
          <KyaSecondaryButton className="w-full text-center" onClick={() => setConfirming(true)}>
            {native
              ? t("exportRecord.confirmPromptNative", "I shared it with them — did you hand off {{name}}?", { name })
              : t("exportRecord.confirmPromptWeb", "I gave them the PDF — did you hand off {{name}}?", { name })}
          </KyaSecondaryButton>
        </div>
      </KyaBody>

      <KyaSheet
        open={confirming}
        onClose={() => { if (!busy) setConfirming(false); }}
        closeLabel={t("exportRecord.close", "Close")}
        title={<KyaHeading size={24}>{t("exportRecord.confirmTitle", "Hand off {{name}}?", { name })}</KyaHeading>}
        footer={
          <div className="flex flex-col gap-2.5">
            <button
              type="button"
              disabled={busy}
              onClick={confirmHandoff}
              className="inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-full px-6 text-[16px] font-[700] text-white disabled:opacity-45"
              style={{ background: K.red }}
            >
              {busy && <Loader2 className="size-4 animate-spin" />} {t("exportRecord.yesHandOff", "Yes, hand off {{name}}", { name })}
            </button>
            <KyaSecondaryButton className="w-full" disabled={busy} onClick={() => setConfirming(false)}>{t("exportRecord.notYet", "Not yet")}</KyaSecondaryButton>
          </div>
        }
      >
        <div className="rounded-[16px] p-3.5" style={{ background: "#fcebeb", border: `1.5px solid ${K.red}` }}>
          <p className="m-0 flex items-start gap-2 text-[14px] leading-[1.5]" style={{ color: "#791f1f" }}>
            <AlertTriangle className="mt-0.5 size-4 shrink-0" style={{ color: K.red }} aria-hidden="true" />
            <span><span className="font-[700]">{t("exportRecord.cantUndo", "This can't be undone.")}</span> {t("exportRecord.willLeave", "{{name}} will leave your flock and move to Past birds.", { name })}</span>
          </p>
        </div>
        <div className="mt-4">
          <KyaField
            id="export-recipient"
            label={t("exportRecord.recipientLabel", "Who did they go to?")}
            tag={<span className="text-[12.5px] font-[400]" style={{ color: K.quiet }}>{t("exportRecord.optional", "Optional")}</span>}
            value={recipientName}
            maxLength={120}
            onChange={(e) => setRecipientName(e.target.value)}
            placeholder={t("exportRecord.recipientPlaceholder", "Who did they go to? (optional)")}
          />
        </div>
      </KyaSheet>

      <style>{`@media print {
        body * { visibility: hidden !important; }
        main:has(#export-sheet) { position: static !important; }
        #export-sheet, #export-sheet * { visibility: visible !important; }
        #export-sheet { position: absolute; left: 0; top: 0; width: 100%; border: none !important; }
        [data-noprint] { display: none !important; }
      }`}</style>
    </KyaPage>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="mt-5 break-inside-avoid">
      <KyaHeading as="h3" size={17}>{label}</KyaHeading>
      <div className="mt-1.5">{children}</div>
    </section>
  );
}
function Value({ text, multiline }: { text: string | null | undefined; multiline?: boolean }) {
  if (!text) return <p className="m-0 text-[14px] italic" style={{ color: K.quiet }}>{none()}</p>;
  return <p className={`m-0 text-[14px] ${multiline ? "whitespace-pre-line" : ""}`}>{text}</p>;
}
function cap(s: string): string { return s.charAt(0).toUpperCase() + s.slice(1); }
function val(s: unknown): s is string { return typeof s === "string" && s.trim().length > 0; }
// Date-only values (intake, came-home, moments) read as local calendar days.
function fmtDate(iso: string): string {
  const d = parseCalendarDate(iso);
  return d ? formatLocalDate(d, { year: "numeric", month: "short", day: "numeric" }) : "";
}

function buildDiet(plan: any): string | null {
  if (!plan) return null;
  const types = (plan.diet_types ?? []) as string[];
  const lines: string[] = types.map((dietKey) => dietLabel(dietKey));
  const never = (plan.never_feed ?? []) as string[];
  if (never.length) lines.push(i18next.t("exportRecord.neverFeedLine", "Never feed: {{value}}", { value: never.join(", ") }));
  return lines.length ? lines.join("\n") : null;
}
