import { useState } from "react";
import { createFileRoute, useNavigate, useRouter, useCanGoBack, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Phone } from "lucide-react";
import { K, KyaPage, KyaBody, KyaCard, KyaHeading, KyaLink, KyaSecondaryButton } from "@/components/kya";
import { PageHeader } from "@/components/headers";
import { useCapability, useMyPermissions } from "@/lib/useCapability";
import { useBirdRole } from "@/lib/useBirdRole";
import { resolveScanPhotoUrls } from "@/lib/scanPhoto";
import { friendlyError } from "@/lib/errorMessage";
import { formatLocalDate, formatLocalTime, monthDay } from "@/lib/dates";
import { localDateISO } from "@/lib/localDay";
import { mergeEmergency, pickVet } from "@/lib/emergency";
import { useBirdOwnerEmergency } from "@/lib/useOwnerEmergency";
import { isStored } from "@/lib/healthHistory";
import { fetchDisplayNames } from "@/lib/resolveNames";
import type { ScanFieldKey } from "@/lib/triage";
import i18next from "i18next";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";

// One daily check: what needed watching (with Mark resolved and Call vet),
// every answer, the weight logged that day, and the photo. Reached from the
// Health tab and Health history. Owner/household read via RLS on daily_logs.
export const Route = createFileRoute("/_authenticated/birds/$birdId/scans/$scanId")({
  head: () => ({ meta: [{ title: i18next.t("scanDetail.metaTitle", "Health check — Kya & Co.") }] }),
  component: ScanDetail,
});

// `fkey` = the scan FIELD key that item_notes is keyed by (the status column and
// the field key differ for noise→behavior and fluffed→energy).
// Exported: the vet summary's "Flagged for review" section reuses these labels.
export const SCAN_COLS: { col: string; fkey: string; label: string }[] = [
  { col: "alertness_status", fkey: "alertness", label: "Alert and responsive" },
  { col: "food_status", fkey: "food", label: "Eating normally" },
  { col: "droppings_status", fkey: "droppings", label: "Droppings look normal" },
  { col: "breathing_status", fkey: "breathing", label: "Breathing normally" },
  { col: "posture_status", fkey: "posture", label: "Perched normally" },
  { col: "behavior_status", fkey: "noise", label: "Vocalizing as usual" },
  { col: "energy_status", fkey: "fluffed", label: "Not fluffed for long stretches" },
  { col: "vomiting_status", fkey: "vomiting", label: "Face clean, no vomiting" },
  { col: "injury_status", fkey: "injury", label: "No injury, fall, bite, or scratch" },
  { col: "exposure_status", fkey: "exposure", label: "No exposure to fumes or unsafe items" },
];

/** Display label for a SCAN_COLS row (the constant `label` stays English). */
export function scanColLabel(t: TFunction, col: string, en: string): string {
  switch (col) {
    case "alertness_status": return t("scanDetail.col.alertness", "Alert and responsive");
    case "food_status": return t("scanDetail.col.food", "Eating normally");
    case "droppings_status": return t("scanDetail.col.droppings", "Droppings look normal");
    case "breathing_status": return t("scanDetail.col.breathing", "Breathing normally");
    case "posture_status": return t("scanDetail.col.posture", "Perched normally");
    case "behavior_status": return t("scanDetail.col.behavior", "Vocalizing as usual");
    case "energy_status": return t("scanDetail.col.energy", "Not fluffed for long stretches");
    case "vomiting_status": return t("scanDetail.col.vomiting", "Face clean, no vomiting");
    case "injury_status": return t("scanDetail.col.injury", "No injury, fall, bite, or scratch");
    case "exposure_status": return t("scanDetail.col.exposure", "No exposure to fumes or unsafe items");
    default: return en;
  }
}

/** Question text (no trailing "?") for a triage reason code — mirrors
 *  email.scanReason.q.* and triage.ts englishReason() byte-for-byte in English. */
function scanReasonQuestion(t: TFunction, key: string): string | null {
  switch (key) {
    case "alertness": return t("scanDetail.reason.q.alertness", "Is the bird alert and responsive");
    case "food": return t("scanDetail.reason.q.food", "Is the bird eating normally");
    case "droppings": return t("scanDetail.reason.q.droppings", "Do the droppings look normal");
    case "breathing": return t("scanDetail.reason.q.breathing", "Is the bird breathing normally");
    case "posture": return t("scanDetail.reason.q.posture", "Is the bird perched normally");
    case "noise": return t("scanDetail.reason.q.noise", "Is the bird vocalizing as usual");
    case "fluffed": return t("scanDetail.reason.q.fluffed", "Is the bird fluffed for long stretches");
    case "vomiting": return t("scanDetail.reason.q.vomiting", "Is the face clean and dry, with no vomiting");
    case "injury": return t("scanDetail.reason.q.injury", "Is the bird free of any injury, fall, bite, or scratch");
    case "exposure": return t("scanDetail.reason.q.exposure", "Has the bird been kept away from fumes, unsafe foods, metals, plants, and other pets");
    default: return null;
  }
}

/** Render a scan's triage reasons in the reader's language. Uses the structured
 *  triage_reason_codes when present (and all keys are known), else falls back to
 *  the stored English triage_reasons text. Joined with " · " either way. */
export function formatTriageReasons(t: TFunction, row: { triage_reasons?: string | null; triage_reason_codes?: unknown }): string | null {
  const lines = triageReasonLines(t, row.triage_reason_codes);
  if (lines && lines.length > 0) return lines.join(" · ");
  return row.triage_reasons ? String(row.triage_reasons).replace(/ \| /g, " · ") : null;
}

/** Localized reason lines ("Concerning: <question>") from triage_reason_codes,
 *  or null when codes are absent or contain an unknown key (caller falls back
 *  to the stored English). */
export function triageReasonLines(t: TFunction, codes: unknown): string[] | null {
  if (!Array.isArray(codes) || codes.length === 0) return null;
  const lines: string[] = [];
  for (const c of codes as { key?: string; answer?: string }[]) {
    const q = c?.key ? scanReasonQuestion(t, c.key) : null;
    if (!q) return null;
    const mark = c.answer === "concerning" ? t("scanDetail.reason.concerning", "Concerning") : t("scanDetail.reason.notSure", "Not sure");
    lines.push(`${mark}: ${q}`);
  }
  return lines;
}

/** The thing a not-normal answer was about, for "wasn't sure about Max's …". */
function itemNoun(t: TFunction, fkey: string): string {
  switch (fkey) {
    case "alertness": return t("scanDetail.noun.alertness", "alertness");
    case "food": return t("scanDetail.noun.food", "eating");
    case "droppings": return t("scanDetail.noun.droppings", "droppings");
    case "breathing": return t("scanDetail.noun.breathing", "breathing");
    case "posture": return t("scanDetail.noun.posture", "perching");
    case "noise": return t("scanDetail.noun.noise", "vocalizing");
    case "fluffed": return t("scanDetail.noun.fluffed", "fluffed-up feathers");
    case "vomiting": return t("scanDetail.noun.vomiting", "face, for vomiting");
    case "injury": return t("scanDetail.noun.injury", "possible injury");
    case "exposure": return t("scanDetail.noun.exposure", "exposure to fumes or unsafe items");
    default: return fkey;
  }
}

function mealText(t: TFunction, m: string | null | undefined): string | null {
  if (m === "before_meal") return t("dailyCheck.beforeMealLower", "before meal");
  if (m === "after_meal") return t("dailyCheck.afterMealLower", "after meal");
  return null;
}

function ScanDetail() {
  const { t } = useTranslation();
  const { birdId, scanId } = Route.useParams();
  const canHealth = useCapability("record_health", { birdId });
  const isOwner = useBirdRole(birdId) === "owner";
  const myId = useMyPermissions().data?.myId;
  const navigate = useNavigate();
  const router = useRouter();
  const qc = useQueryClient();
  const canGoBack = useCanGoBack();
  const [resolving, setResolving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const goBack = () => (canGoBack ? router.history.back() : navigate({ to: "/scans" }));

  // Owner-only delete (RLS also enforces birds.owner_id).
  async function deleteScan() {
    if (!window.confirm(t("scanDetail.confirmDelete", "Delete this health check? This can't be undone."))) return;
    setDeleting(true);
    const { error } = await supabase.from("daily_logs").delete().eq("id", scanId);
    setDeleting(false);
    if (error) { toast.error(friendlyError(error)); return; }
    toast.success(t("scanDetail.deletedCheck", "Daily check deleted."));
    qc.invalidateQueries({ queryKey: ["scan-feed"] });
    qc.invalidateQueries({ queryKey: ["health-history"] });
    qc.invalidateQueries({ queryKey: ["bird-checkins", birdId] });
    qc.invalidateQueries({ queryKey: ["scan-detail", scanId] });
    navigate({ to: "/scans" });
  }

  async function markResolved() {
    if (!window.confirm(t("scanDetail.confirmResolve", "Mark this concern as resolved? Caregivers will see the bird's status return to normal."))) return;
    setResolving(true);
    const { error } = await supabase.from("daily_logs").update({ resolved_at: new Date().toISOString() } as any).eq("id", scanId);
    setResolving(false);
    if (error) { toast.error(friendlyError(error)); return; }
    toast.success(t("scanDetail.resolved", "Concern marked resolved."));
    qc.invalidateQueries({ queryKey: ["scan-detail", scanId] });
    qc.invalidateQueries({ queryKey: ["scan-feed"] });
    qc.invalidateQueries({ queryKey: ["health-history"] });
  }

  const { data, isLoading } = useQuery({
    queryKey: ["scan-detail", scanId],
    queryFn: async () => {
      const { data: row } = await supabase
        .from("daily_logs")
        .select("*, sit:sits(sitter_name, sitter_email)")
        .eq("id", scanId).eq("bird_id", birdId).maybeSingle();
      let actor: string | null = null;
      if (row) {
        const r = row as any;
        if (r.source === "sitter") actor = r.sit?.sitter_name || r.sit?.sitter_email || null;
        else if (r.run_by) {
          // Server-side: profiles RLS is self-only, so a direct read comes back empty.
          actor = (await fetchDisplayNames([r.run_by]))[r.run_by] || null;
        }
      }
      const { data: bird } = await supabase.from("birds").select("name, owner_id").eq("id", birdId).maybeSingle();
      // Photos attached to this check: legacy data: URLs or scan-photos paths.
      const { data: photos } = await supabase
        .from("photo_logs")
        .select("id, photo_url")
        .eq("daily_log_id", scanId)
        .order("created_at", { ascending: true });
      const scanUrls = await resolveScanPhotoUrls(supabase.storage, (photos ?? []).map((p) => p.photo_url));
      const resolvedPhotos = (photos ?? [])
        .map((p) => ({ id: p.id, photo_url: scanUrls.get(p.photo_url) ?? p.photo_url }))
        .filter((p) => !!p.photo_url);

      // The weight logged for this bird on the same local day.
      let weight: { grams: number; measured_at: string; meal_relation: string | null } | null = null;
      if (row) {
        const d = new Date((row as any).created_at);
        const from = new Date(d.getFullYear(), d.getMonth(), d.getDate());
        const to = new Date(from.getTime() + 86_400_000);
        const { data: ws } = await supabase.from("weight_entries").select("grams, measured_at, meal_relation")
          .eq("bird_id", birdId).gte("measured_at", from.toISOString()).lt("measured_at", to.toISOString())
          .order("measured_at", { ascending: false }).limit(1);
        weight = (ws?.[0] as any) ?? null;
      }

      // The bird's own vet details; the owner's account defaults fill the rest
      // (useBirdOwnerEmergency below — household members can't read those directly).
      const { data: ec } = await supabase.from("emergency_contacts").select("*").eq("bird_id", birdId).maybeSingle();

      return { row: row as any, actor, birdName: (bird?.name ?? null) as string | null, photos: resolvedPhotos as { id: string; photo_url: string }[], weight, contacts: ec ?? null };
    },
  });

  const row = data?.row;
  const { defaults: vetDefaults } = useBirdOwnerEmergency(birdId);
  // One vet record (avian, else after-hours), so the number is a real vet's.
  const vetPhone = pickVet(mergeEmergency(data?.contacts as any, vetDefaults ?? null))?.phone ?? null;

  if (isLoading || !row) {
    return (
      <Shell headline={isLoading ? t("scanDetail.loading", "Loading…") : t("scanDetail.notFoundCheck", "Daily check not found")} onBack={goBack}>
        <KyaCard className="p-6 text-center">
          {isLoading
            ? <span className="inline-flex items-center gap-2 text-[14px]" style={{ color: K.quiet }}><Loader2 className="size-4 animate-spin" /> {t("scanDetail.loading", "Loading…")}</span>
            : <p className="m-0 text-[15px]" style={{ color: K.quiet }}>{t("scanDetail.notAvailableCheck", "This daily check isn't available. It may have been removed.")}</p>}
        </KyaCard>
      </Shell>
    );
  }

  const birdName = data!.birdName ?? t("scanDetail.yourBird", "your bird");
  const at = new Date(row.created_at);
  const when = `${formatLocalDate(at, { weekday: "long", month: "long", day: "numeric" })}, ${formatLocalTime(at, { hour: "numeric", minute: "2-digit" })}`;
  const isSitter = row.source === "sitter";
  const mine = !isSitter && !!myId && row.run_by === myId;
  const actor = data!.actor;
  const sitterFallback = t("scanDetail.yourSitterLower", "your sitter");
  const memberFallback = t("scanDetail.householdMemberLower", "a household member");
  const by = mine
    ? t("scanDetail.byYou", "by you")
    : isSitter
      ? t("scanDetail.bySitter", "by {{name}}, sitter", { name: actor ?? sitterFallback })
      : t("scanDetail.byName", "by {{name}}", { name: actor ?? memberFallback });
  const whoShort = mine ? null : (actor?.split(/\s+/)[0] ?? (isSitter ? t("scanDetail.yourSitterCap", "Your sitter") : t("scanDetail.householdMemberCap", "A household member")));
  const notes = (row.item_notes ?? null) as Record<string, string> | null;
  // A question with no stored answer (vomiting before 20261020230000) uses its
  // triage code if it was flagged, else is left out rather than called unanswered.
  const codes = (Array.isArray(row.triage_reason_codes) ? row.triage_reason_codes : []) as { key?: string; answer?: string }[];
  const answerOf = (f: (typeof SCAN_COLS)[number]): string | null | undefined =>
    isStored(row, f.fkey as ScanFieldKey) ? row[f.col] : codes.find((c) => c.key === f.fkey)?.answer;
  const shownCols = SCAN_COLS.filter((f) => answerOf(f) !== undefined);
  const flagged = shownCols.filter((f) => answerOf(f) === "not_sure" || answerOf(f) === "concerning");
  // A flag with no per-question answers (older rows) still counts as one thing.
  const watchCount = flagged.length || (row.triage_status && row.triage_status !== "green" ? 1 : 0);
  const reasonsText = flagged.length ? null : formatTriageReasons(t, row);

  const sentence = (f: (typeof SCAN_COLS)[number]) => {
    const noun = itemNoun(t, f.fkey);
    const notSure = answerOf(f) === "not_sure";
    if (whoShort === null) {
      return notSure
        ? t("scanDetail.youNotSure", "You weren't sure about {{bird}}'s {{item}}", { bird: birdName, item: noun })
        : t("scanDetail.youConcerning", "You marked {{bird}}'s {{item}} as concerning", { bird: birdName, item: noun });
    }
    return notSure
      ? t("scanDetail.otherNotSure", "{{name}} wasn't sure about {{bird}}'s {{item}}", { name: whoShort, bird: birdName, item: noun })
      : t("scanDetail.otherConcerning", "{{name}} marked {{bird}}'s {{item}} as concerning", { name: whoShort, bird: birdName, item: noun });
  };

  return (
    <Shell
      headline={t("scanDetail.titleCheck", "{{name}}'s daily check", { name: birdName })}
      body={`${when} · ${by}`}
      onBack={goBack}
    >
      {watchCount > 0 && (
        <section className="rounded-[20px] p-4" style={{ background: K.amberBg, color: K.amberText }}>
          <KyaHeading size={20}>{t("scanDetail.thingsToWatch", "{{count}} things to watch", { count: watchCount })}</KyaHeading>
          <div className="mt-2 flex flex-col gap-2 text-[15px] leading-[1.45]">
            {flagged.map((f) => (
              <p key={f.col} className="m-0">
                {sentence(f)}{notes?.[f.fkey] ? `: “${notes[f.fkey]}”` : "."}
              </p>
            ))}
            {reasonsText && <p className="m-0">{reasonsText}</p>}
          </div>
          {row.resolved_at ? (
            <p className="m-0 mt-3 text-[15px] font-[700]">
              {t("scanDetail.markedResolvedOn", "Marked resolved {{date}}", { date: monthDay(localDateISO(new Date(row.resolved_at))) })}
            </p>
          ) : (canHealth || vetPhone) ? (
            <div className="mt-3 flex gap-2">
              {canHealth && (
                <KyaSecondaryButton className="flex-1" onClick={markResolved} disabled={resolving} icon={resolving ? <Loader2 className="size-4 animate-spin" /> : undefined}>
                  {t("scanDetail.markResolved", "Mark resolved")}
                </KyaSecondaryButton>
              )}
              {vetPhone && (
                <a
                  href={`tel:${vetPhone.replace(/[^\d+]/g, "")}`}
                  className="inline-flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-full border-2 bg-white px-4 text-[15px] font-[700] active:scale-[0.99]"
                  style={{ borderColor: K.forest, color: K.forest }}
                >
                  <Phone className="size-4" /> {t("scanDetail.callVet", "Call vet")}
                </a>
              )}
            </div>
          ) : null}
        </section>
      )}

      <KyaCard>
        <div className="px-4 pb-1 pt-4"><KyaHeading size={20}>{t("scanDetail.everyAnswer", "Every answer")}</KyaHeading></div>
        {shownCols.map((f, i) => {
          const note = notes?.[f.fkey];
          return (
            <div key={f.col} className="px-4 py-1.5" style={{ borderBottom: i === shownCols.length - 1 ? undefined : `1px solid ${K.line}` }}>
              <div className="flex min-h-[44px] items-center gap-3">
                <span className="min-w-0 flex-1 text-[15px]" style={{ color: K.forest }}>{scanColLabel(t, f.col, f.label)}</span>
                <AnswerTag value={answerOf(f) ?? null} />
              </div>
              {note && <p className="m-0 pb-2 text-[13px] leading-[1.45]" style={{ color: K.quiet }}>{note}</p>}
            </div>
          );
        })}
      </KyaCard>

      {row.notes && (
        <KyaCard className="p-4">
          <KyaHeading size={20}>{t("scanDetail.notes", "Notes")}</KyaHeading>
          <p className="m-0 mt-2 whitespace-pre-line text-[15px]" style={{ color: K.ink }}>{row.notes}</p>
        </KyaCard>
      )}

      {data!.weight && (
        <KyaCard className="p-4">
          <p className="m-0 text-[15px] font-[700]">{t("scanDetail.weightThatDay", "Weight that day")}</p>
          <p className="m-0 mt-1 text-[14px]" style={{ color: K.quiet }}>
            {[
              t("healthHistory.grams", "{{n}} g", { n: Number(data!.weight.grams).toLocaleString() }),
              formatLocalTime(new Date(data!.weight.measured_at), { hour: "numeric", minute: "2-digit" }),
              mealText(t, data!.weight.meal_relation),
            ].filter(Boolean).join(" · ")}
          </p>
        </KyaCard>
      )}

      {(data?.photos?.length ?? 0) > 0 && (
        <KyaCard className="p-4">
          <KyaHeading size={20}>{data!.photos.length === 1 ? t("scanDetail.photo", "Photo") : t("scanDetail.photos", "Photos")}</KyaHeading>
          <div className="mt-3 flex flex-col gap-3">
            {data!.photos.map((p) => (
              <img key={p.id} src={p.photo_url} alt={t("scanDetail.photoAltCheck", "Photo attached to this daily check")} className="block w-full rounded-[14px] object-contain" />
            ))}
          </div>
        </KyaCard>
      )}

      {isOwner && (
        <div className="flex justify-center">
          <KyaLink color={K.red} onClick={deleting ? undefined : deleteScan}>
            {deleting ? t("scanDetail.deleting", "Deleting…") : t("scanDetail.deleteThisCheck", "Delete this check")}
          </KyaLink>
        </div>
      )}
    </Shell>
  );
}

function Shell({ headline, body, onBack, children }: { headline: string; body?: string; onBack: () => void; children: React.ReactNode }) {
  const { t } = useTranslation();
  return (
    <KyaPage>
      <div className="mx-auto max-w-md">
        <PageHeader onBack={onBack} title={headline} line={body} />
        <KyaBody className="gap-4">{children}</KyaBody>
      </div>
    </KyaPage>
  );
}

function AnswerTag({ value }: { value: string | null }) {
  const { t } = useTranslation();
  const cls = "inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-[12.5px] font-[700]";
  if (value === "normal") return <span className={cls} style={{ background: K.mist, color: K.moss }}>{t("scanDetail.answerNormal", "Normal")}</span>;
  if (value === "concerning") return <span className={cls} style={{ background: K.amberBg, color: K.amberText }}>{t("scanDetail.answerConcerning", "Concerning")}</span>;
  if (value === "not_sure") return <span className={cls} style={{ background: K.amberBg, color: K.amberText }}>{t("scanDetail.answerNotSure", "Not sure")}</span>;
  return <span className={cls} style={{ color: K.quiet }}>{t("scanDetail.notAnswered", "Not answered")}</span>;
}
