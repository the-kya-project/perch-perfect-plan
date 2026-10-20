import { useState } from "react";
import { createFileRoute, useNavigate, useRouter, useCanGoBack, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ArrowLeft, Check, AlertTriangle, HelpCircle, Minus, Loader2, Siren, Trash2 } from "lucide-react";
import { InkHero, Card, StatusPill, SectionHead, IconTile } from "@/components/system";
import { useCapability } from "@/lib/useCapability";
import { useBirdRole } from "@/lib/useBirdRole";
import { OwnerHeaderIcons } from "@/components/OwnerHeader";
import { resolveScanPhotoUrls } from "@/lib/scanPhoto";
import { friendlyError } from "@/lib/errorMessage";
import { formatLocalDateTime } from "@/lib/dates";
import i18next from "i18next";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";

// Focused, read-only view of one submitted health scan. Reached from the Scans
// inbox (replaces the old deep-link into the care-plan editor's logs tab, which
// read as "the care plan"). Owner/household read via RLS on daily_logs.
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
  { col: "exposure_status", fkey: "exposure", label: "No exposure to fumes / unsafe items" },
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
    case "exposure_status": return t("scanDetail.col.exposure", "No exposure to fumes / unsafe items");
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

function ScanDetail() {
  const { t } = useTranslation();
  const { birdId, scanId } = Route.useParams();
  const canHealth = useCapability("record_health", { birdId });
  const canEmergency = useCapability("manage_emergency", { birdId });
  const isOwner = useBirdRole(birdId) === "owner";
  const navigate = useNavigate();
  const router = useRouter();
  const qc = useQueryClient();
  const canGoBack = useCanGoBack();
  const [resolving, setResolving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const goBack = () => (canGoBack ? router.history.back() : navigate({ to: "/scans" }));

  // Owner-only delete (RLS also enforces birds.owner_id). Removes the health check
  // and refreshes concern surfacing (scan feed + record check-ins), then leaves
  // the now-gone detail for the Scans list.
  async function deleteScan() {
    if (!window.confirm(t("scanDetail.confirmDelete", "Delete this health check? This can't be undone."))) return;
    setDeleting(true);
    const { error } = await supabase.from("daily_logs").delete().eq("id", scanId);
    setDeleting(false);
    if (error) { toast.error(friendlyError(error)); return; }
    toast.success(t("scanDetail.deleted", "Health check deleted."));
    qc.invalidateQueries({ queryKey: ["scan-feed"] });
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
        if (r.sit?.sitter_name || r.sit?.sitter_email) actor = r.sit.sitter_name || r.sit.sitter_email;
        else if (r.run_by) {
          const { data: p } = await supabase.from("profiles").select("display_name").eq("id", r.run_by).maybeSingle();
          actor = (p?.display_name ?? "").trim() || null;
        }
      }
      const { data: bird } = await supabase.from("birds").select("name").eq("id", birdId).maybeSingle();
      // Photos attached to this check. photo_url is either a legacy inline data:
      // URL or a scan-photos Storage path — resolve both to a displayable URL
      // (data: passes through, paths are signed) via the shared helper.
      const { data: photos } = await supabase
        .from("photo_logs")
        .select("id, photo_url")
        .eq("daily_log_id", scanId)
        .order("created_at", { ascending: true });
      const scanUrls = await resolveScanPhotoUrls(supabase.storage, (photos ?? []).map((p) => p.photo_url));
      const resolvedPhotos = (photos ?? [])
        .map((p) => ({ id: p.id, photo_url: scanUrls.get(p.photo_url) ?? p.photo_url }))
        .filter((p) => !!p.photo_url);
      return { row: row as any, actor, birdName: (bird?.name ?? null) as string | null, photos: resolvedPhotos as { id: string; photo_url: string }[] };
    },
  });

  const row = data?.row;

  if (isLoading) {
    return (
      <Shell eyebrow={t("scanDetail.eyebrow", "Health check")} headline={t("scanDetail.loading", "Loading…")} onBack={goBack}>
        <div className="flex items-center justify-center gap-2 py-10 text-[14px] text-[var(--mute)]"><Loader2 className="size-4 animate-spin" /> {t("scanDetail.loading", "Loading…")}</div>
      </Shell>
    );
  }
  if (!row) {
    return (
      <Shell eyebrow={t("scanDetail.eyebrow", "Health check")} headline={t("scanDetail.notFound", "Health check not found.")} onBack={goBack}>
        <Card className="p-6 text-center">
          <p className="t-body text-[var(--ink2)]">{t("scanDetail.notAvailable", "This health check isn't available — it may have been removed.")}</p>
        </Card>
      </Shell>
    );
  }

  const triage = (row.triage_status ?? "green") as string;
  const concern = triage === "red" || triage === "yellow";
  const headline = triage === "red" ? t("scanDetail.headlineRed", "Concern flagged.") : triage === "yellow" ? t("scanDetail.headlineYellow", "Something to check.") : t("scanDetail.headlineGreen", "All clear.");
  const when = formatLocalDateTime(new Date(row.created_at), { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  const actor = data!.actor;
  const runBy = actor === null ? t("scanDetail.runByYou", "Run by you") : t("scanDetail.runBy", "Run by {{name}}", { name: actor });
  const birdName = data!.birdName ?? t("scanDetail.yourBird", "your bird");
  const notSure = SCAN_COLS.filter((f) => row[f.col] === "not_sure");
  const reasonsText = formatTriageReasons(t, row);

  return (
    <Shell eyebrow={t("scanDetail.eyebrow", "Health check")} headline={headline} body={`${birdName} · ${runBy} · ${when}`} onBack={goBack}>
      {/* Summary banner — amber for concern, pale-green for clear (no red: a
          flagged scan is attention, not an emergency-contact block). */}
      <div
        className="flex items-start gap-3 rounded-[16px] p-4"
        style={concern ? { background: "var(--amber-fill)" } : { background: "var(--pale)" }}
      >
        <IconTile size={34} tone={concern ? "amber" : "pale"} icon={concern ? <AlertTriangle className="size-4" /> : <Check className="size-4" />} />
        <div className="min-w-0 flex-1">
          <p className="t-item" style={{ color: concern ? "var(--amber-ink)" : "var(--ink)" }}>
            {triage === "red" ? t("scanDetail.bannerRed", "Needs attention") : triage === "yellow" ? t("scanDetail.bannerYellow", "Worth a closer look") : t("scanDetail.bannerGreen", "Everything looked normal")}
          </p>
          {reasonsText && (
            <p className="mt-0.5 text-[13px]" style={{ color: concern ? "var(--amber-ink)" : "var(--ink2)" }}>
              {reasonsText}
            </p>
          )}
          {notSure.length > 0 && (
            <p className="mt-1 text-[13px] text-[var(--amber-ink)]">
              {actor === null
                ? notSure.length === 1
                  ? t("scanDetail.notSureYouOne", "{{n}} item you weren't sure about.", { n: notSure.length })
                  : t("scanDetail.notSureYouOther", "{{n}} items you weren't sure about.", { n: notSure.length })
                : notSure.length === 1
                  ? t("scanDetail.notSureOtherOne", "{{n}} item {{name}} wasn't sure about.", { n: notSure.length, name: actor.split(/\s+/)[0] })
                  : t("scanDetail.notSureOtherOther", "{{n}} items {{name}} wasn't sure about.", { n: notSure.length, name: actor.split(/\s+/)[0] })}
            </p>
          )}
        </div>
      </div>

      {/* Concern actions — emergency contacts (manage_emergency) + resolve
          (record_health). Each gated so members don't see controls that fail. */}
      {concern && (
        <div className="space-y-2">
          {canEmergency && (
          <Link
            to="/birds/$birdId/plan/editor"
            params={{ birdId }}
            search={{ tab: "emergency" }}
            className="flex min-h-[48px] items-center justify-center gap-2 rounded-[13px] bg-[var(--ink)] text-[15px] font-[500] text-white active:scale-[0.99]"
          >
            <Siren className="size-4" /> {t("scanDetail.emergencyContacts", "Emergency contacts")}
          </Link>
          )}
          {row.resolved_at ? (
            <p className="flex items-center justify-center gap-1.5 py-1 text-[13px] font-[500] text-[var(--moss)]">
              <Check className="size-4" /> {t("scanDetail.markedResolved", "Marked resolved")}
            </p>
          ) : canHealth ? (
            <button
              type="button"
              onClick={markResolved}
              disabled={resolving}
              className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-[13px] border border-[var(--ink)] text-[15px] font-[500] text-[var(--ink)] active:scale-[0.99] disabled:opacity-50"
            >
              {resolving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} {t("scanDetail.markResolved", "Mark resolved")}
            </button>
          ) : null}
        </div>
      )}

      {/* Per-item checklist */}
      <section>
        <SectionHead title={t("scanDetail.theCheck", "The check")} />
        <Card>
          {SCAN_COLS.map((f, i) => {
            const note = (row.item_notes as Record<string, string> | null)?.[f.fkey];
            return (
              <div key={f.col} className={`px-4 py-2.5 ${i === SCAN_COLS.length - 1 ? "" : "border-b border-[var(--line2)]"}`}>
                <div className="flex min-h-[44px] items-center gap-3">
                  <AnswerIcon value={row[f.col]} />
                  <span className="t-item flex-1 font-[400]">{scanColLabel(t, f.col, f.label)}</span>
                  <AnswerPill value={row[f.col]} />
                </div>
                {note && (
                  <p className="mt-1 rounded-lg px-3 py-2 text-[13px] leading-relaxed" style={{ background: "var(--amber-fill)", color: "var(--amber-ink)" }}>
                    {note}
                  </p>
                )}
              </div>
            );
          })}
        </Card>
      </section>

      {row.notes && (
        <section>
          <SectionHead title={t("scanDetail.notes", "Notes")} />
          <Card className="p-4">
            <p className="t-body whitespace-pre-line text-[var(--ink2)]">{row.notes}</p>
          </Card>
        </section>
      )}

      {/* Photos attached to this check (data: URLs — render directly). */}
      {(data?.photos?.length ?? 0) > 0 && (
        <section>
          <SectionHead title={data!.photos.length === 1 ? t("scanDetail.photo", "Photo") : t("scanDetail.photos", "Photos")} />
          <div className="space-y-3">
            {data!.photos.map((p) => (
              <Card key={p.id} className="overflow-hidden">
                <img src={p.photo_url} alt={t("scanDetail.photoAlt", "Photo attached to this health check")} className="block w-full object-contain" />
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* Delete — owner-only (RLS also enforces birds.owner_id). */}
      {isOwner && (
        <button
          type="button"
          onClick={deleteScan}
          disabled={deleting}
          className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-[13px] border border-[var(--red-line)] text-[15px] font-[500] text-[var(--red-ink)] active:scale-[0.99] disabled:opacity-50"
        >
          {deleting ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />} {deleting ? t("scanDetail.deleting", "Deleting…") : t("scanDetail.deleteCheck", "Delete health check")}
        </button>
      )}
    </Shell>
  );
}

function Shell({ eyebrow, headline, body, onBack, children }: { eyebrow: string; headline: string; body?: string; onBack: () => void; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[var(--cream)] pb-nav">
      <div className="mx-auto max-w-md">
        <InkHero backIcon={<ArrowLeft className="size-5" />} onBack={onBack} eyebrow={eyebrow} headline={headline} body={body} trailingIcons={<OwnerHeaderIcons />} />
        <main className="space-y-4 px-5 pt-5">{children}</main>
      </div>
    </div>
  );
}

function AnswerIcon({ value }: { value: string | null }) {
  if (value === "normal") return <Check className="size-4 shrink-0 text-[var(--moss)]" />;
  if (value === "concerning") return <AlertTriangle className="size-4 shrink-0 text-[var(--amber-ink)]" />;
  if (value === "not_sure") return <HelpCircle className="size-4 shrink-0 text-[var(--amber-ink)]" />;
  return <Minus className="size-4 shrink-0 text-[var(--mute2)]" />;
}
function AnswerPill({ value }: { value: string | null }) {
  const { t } = useTranslation();
  if (value === "normal") return <StatusPill tone="good">{t("scanDetail.answerNormal", "Normal")}</StatusPill>;
  if (value === "concerning") return <StatusPill tone="attention">{t("scanDetail.answerConcerning", "Concerning")}</StatusPill>;
  if (value === "not_sure") return <StatusPill tone="attention">{t("scanDetail.answerNotSure", "Not sure")}</StatusPill>;
  return <span className="t-meta">—</span>;
}
