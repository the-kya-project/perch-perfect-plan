import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getLocalUser } from "@/integrations/supabase/currentUser";
import { useBirdRole } from "@/lib/useBirdRole";
import { useCapability, useMyPermissions } from "@/lib/useCapability";
import { useActiveSitIdForBird } from "@/components/CaregiverHome";
import { toast } from "sonner";
import { buildDailyLogRow, type ScanAnswers } from "@/lib/dailyLog";
import { FULL_CHECK_PHOTO_NOTE, insertWithKind } from "@/lib/checkKind";
import { saveWeight, invalidateAfterCheck } from "@/lib/dailyCheck";
import { mergeEmergency, pickVet } from "@/lib/emergency";
import { useBirdOwnerEmergency } from "@/lib/useOwnerEmergency";
import { FullHealthCheck, type FullCheckSubmit } from "@/components/FullHealthCheck";
import { K, KyaCard, KyaPage, KyaPrimaryButton, KyaSecondaryButton } from "@/components/kya";
import { TaskHeader, useGoBack } from "@/components/headers";
import { track } from "@/lib/analytics";
import { uploadScanPhotoOrInline } from "@/lib/scanPhoto";
import { friendlyError } from "@/lib/errorMessage";
import { localDateISO } from "@/lib/localDay";
import i18next from "i18next";
import { useTranslation } from "react-i18next";
import { triageReasonLines } from "./$birdId.scans.$scanId";
import { triageMessageLabel } from "@/lib/triageLabels";

// Owner-run full health check. Same questions + triage as the sitter's scan; on
// submit it writes a daily_logs row (source owner/household, run_by, sit_id when
// covering a sit) + optional photo + weight_entries via the authenticated client
// under has_bird_access RLS. No notifications (the owner ran it themselves).
export const Route = createFileRoute("/_authenticated/birds/$birdId/scan")({
  head: () => ({ meta: [{ title: i18next.t("ownerScan.metaTitle", "Health check — Kya & Co.") }] }),
  component: OwnerScan,
});

type Result = { status: string; message: string; reasons: string[]; reasonCodes?: unknown };

function OwnerScan() {
  const { t } = useTranslation();
  const { birdId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const role = useBirdRole(birdId);
  // Running a scan needs record_health. Entries are gated, but redirect on
  // direct nav too (wait for perms so the owner/cap member isn't bounced).
  const canHealth = useCapability("record_health", { birdId });
  const { data: perms } = useMyPermissions();
  useEffect(() => {
    if (role === "owner") return;
    if (role == null || !perms) return;
    if (!canHealth) navigate({ to: "/birds/$birdId", params: { birdId }, replace: true });
  }, [role, perms, canHealth, birdId, navigate]);
  const scanSource = role === "household" ? "household" : "owner";
  // When the household member is the assigned caregiver covering this bird,
  // tag the daily_log, the inline photo_log, and the inline weight_entry with
  // the sit_id so the sit's activity view can pull them by attribution.
  const activeSitId = useActiveSitIdForBird(birdId);
  const [result, setResult] = useState<Result | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const { data: bird } = useQuery({
    queryKey: ["full-check-bird", birdId],
    queryFn: async () => {
      const { data } = await supabase.from("birds").select("name, sex, owner_id").eq("id", birdId).maybeSingle();
      const b = data as { name: string; sex: string | null; owner_id: string | null } | null;
      // The bird's own vet details; the owner's account defaults fill the rest
      // (useBirdOwnerEmergency — household members can't read those directly).
      const { data: ec } = await supabase.from("emergency_contacts").select("*").eq("bird_id", birdId).maybeSingle();
      return { name: b?.name ?? null, sex: b?.sex ?? null, contacts: ec ?? null };
    },
  });
  const name = bird?.name ?? t("ownerScan.thisBird", "this bird");
  const { defaults: vetDefaults } = useBirdOwnerEmergency(birdId);
  // One vet record (avian, else after-hours), so the name and number match.
  const vet = pickVet(mergeEmergency(bird?.contacts as any, vetDefaults ?? null));

  const toRecord = useCallback(() => navigate({ to: "/birds/$birdId", params: { birdId } }), [navigate, birdId]);
  const goBack = useGoBack(toRecord);

  /** True once the check is saved (FullHealthCheck then drops its draft). */
  async function onSubmit(p: FullCheckSubmit): Promise<boolean> {
    setSubmitting(true);
    try {
      const { data: u } = await getLocalUser();
      const runBy = u.user?.id ?? null;
      const { row: logRow, triage } = buildDailyLogRow(p.answers as ScanAnswers, {
        kind: "full", birdId, sitId: activeSitId, source: scanSource, runBy, logDate: localDateISO(),
        notes: p.notes ?? null, itemNotes: p.itemNotes ?? null,
      });
      const a = p.answers;
      const { data: row, error } = await insertWithKind(logRow, (r) => supabase
        .from("daily_logs")
        .insert(r as any)
        .select()
        .single());
      if (error) throw error;

      // vomiting_status / photo / weight — best-effort, never block the scan.
      if (a.vomiting) await supabase.from("daily_logs").update({ vomiting_status: a.vomiting } as any).eq("id", row.id);
      let photoFallback = false;
      if (p.photoDataUrl) {
        // New scans upload the image to the scan-photos bucket and store the
        // path; on any upload failure we fall back to the inline data URL so the
        // scan still saves (see uploadScanPhotoOrInline in scanPhoto.ts).
        const stored = await uploadScanPhotoOrInline(birdId, p.photoDataUrl);
        photoFallback = !stored.storedAsPath;
        await supabase.from("photo_logs").insert({ bird_id: birdId, daily_log_id: row.id, photo_type: "other", photo_url: stored.value, notes: FULL_CHECK_PHOTO_NOTE, ...(activeSitId ? { sit_id: activeSitId } : {}) });
      }
      if (typeof p.weightGrams === "number") {
        // Same weight_entries row as before (bird, grams, source, logged_by,
        // sit_id) plus meal_relation when chosen, via the daily check's helper.
        const err = await saveWeight({ birdId, grams: p.weightGrams, meal: p.meal, source: scanSource, sitId: activeSitId, loggedBy: runBy });
        if (err) toast.error(t("fullCheck.weightFailed", "The check saved, but the weight didn't. Add it from the weight page."));
      }

      track("health_scan_run", { severity: triage.status, had_photo: !!p.photoDataUrl, source: scanSource, photo_fallback: photoFallback });
      setResult(triage);
      // Show up immediately in the Scans tab, Health history, the record-home
      // recent feed, today's check box and the weight timeline; a weigh-in also
      // updates Home pills (weights embedded in the birds query).
      invalidateAfterCheck(qc, birdId);
      return true;
    } catch (e: any) {
      toast.error(friendlyError(e, t("ownerScan.logFailed", "Couldn't log the health check.")));
      return false;
    } finally {
      setSubmitting(false);
    }
  }

  if (!result) {
    return (
      <FullHealthCheck
        birdId={birdId}
        name={name}
        sex={bird?.sex}
        vet={vet}
        submitting={submitting}
        onSubmit={onSubmit}
        onLeave={goBack}
      />
    );
  }

  const tone = result.status === "red"
    ? { background: "#fcebeb", color: K.red }
    : result.status === "yellow"
      ? { background: K.amberBg, color: K.amberText }
      : { background: K.lime, color: K.forest };
  const title = result.status === "red"
    ? t("ownerScan.titleRed", "Call your vet about {{name}} now", { name })
    : result.status === "yellow"
      ? t("ownerScan.titleYellow", "Keep a close eye on {{name}}", { name })
      : t("ownerScan.titleGreen", "{{name}} looks good today", { name });
  const reasons = triageReasonLines(t, result.reasonCodes) ?? result.reasons;

  return (
    <KyaPage>
      <TaskHeader title={title} line={t("fullCheck.savedLine", "{{name}}'s check is saved to the health log.", { name })} onClose={toRecord} />
      <main className="relative mx-auto -mt-[26px] flex max-w-md flex-col gap-4 rounded-t-[26px] px-4 pb-8 pt-5" style={{ background: K.mist, color: K.forest }}>
        <section className="rounded-[20px] p-4 text-[15px] leading-[1.5]" style={tone}>
          {triageMessageLabel(t, result.message)}
        </section>
        {reasons.length > 0 && (
          <KyaCard className="p-4">
            <p className="m-0 text-[13px] font-[700]" style={{ color: K.quiet }}>{t("ownerScan.whatYouFlagged", "What you flagged")}</p>
            <ul className="m-0 mt-2 list-disc pl-5 text-[14.5px] leading-[1.5]">{reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>
          </KyaCard>
        )}
        <div className="flex flex-col gap-2.5">
          {result.status !== "green" && (
            <KyaPrimaryButton onClick={() => navigate({ to: "/birds/$birdId/emergency", params: { birdId } })}>{t("ownerScan.emergencyContacts", "Emergency contacts")}</KyaPrimaryButton>
          )}
          {result.status === "green"
            ? <KyaPrimaryButton onClick={toRecord}>{t("ownerScan.backToRecord", "Back to record")}</KyaPrimaryButton>
            : <KyaSecondaryButton className="w-full" onClick={toRecord}>{t("ownerScan.backToRecord", "Back to record")}</KyaSecondaryButton>}
        </div>
      </main>
    </KyaPage>
  );
}
