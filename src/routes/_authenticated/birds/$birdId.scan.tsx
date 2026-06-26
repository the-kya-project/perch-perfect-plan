import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getLocalUser } from "@/integrations/supabase/currentUser";
import { useBirdRole } from "@/lib/useBirdRole";
import { useCapability, useMyPermissions } from "@/lib/useCapability";
import { useActiveSitIdForBird } from "@/components/CaregiverHome";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { computeTriage, type ScanFieldKey, type ScanAnswer } from "@/lib/triage";
import { ScanForm, type ScanSubmit } from "@/components/ScanForm";
import { track } from "@/lib/analytics";

// Owner-run health scan. Uses the SAME ScanForm + triage as the sitter; on submit
// it writes a daily_logs row (source='owner', run_by, no sit) + optional photo +
// weight_entries(source='owner') via the authenticated client under has_bird_access
// RLS. No notifications (the owner ran it themselves).
export const Route = createFileRoute("/_authenticated/birds/$birdId/scan")({
  head: () => ({ meta: [{ title: "Health scan — Kya & Co." }] }),
  component: OwnerScan,
});

function OwnerScan() {
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
  const [result, setResult] = useState<{ status: string; message: string; reasons: string[] } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const { data: bird } = useQuery({
    queryKey: ["bird-name", birdId],
    queryFn: async () => {
      const { data } = await supabase.from("birds").select("name").eq("id", birdId).maybeSingle();
      return data as { name: string } | null;
    },
  });
  const name = bird?.name ?? "this bird";

  async function onSubmit(p: ScanSubmit) {
    setSubmitting(true);
    try {
      const { data: u } = await getLocalUser();
      const triage = computeTriage(p.answers as Record<ScanFieldKey, ScanAnswer>);
      const a = p.answers;
      const { data: row, error } = await supabase
        .from("daily_logs")
        .insert({
          bird_id: birdId,
          sit_id: activeSitId,
          source: scanSource,
          run_by: u.user?.id ?? null,
          log_date: new Date().toISOString().slice(0, 10),
          alertness_status: a.alertness,
          food_status: a.food,
          droppings_status: a.droppings,
          breathing_status: a.breathing,
          posture_status: a.posture,
          behavior_status: a.noise,
          energy_status: a.fluffed,
          injury_status: a.injury,
          exposure_status: a.exposure,
          notes: p.notes ?? null,
          triage_status: triage.status,
          triage_reasons: triage.reasons.join(" | "),
        })
        .select()
        .single();
      if (error) throw error;

      // vomiting_status / photo / weight — best-effort, never block the scan.
      if (a.vomiting) await supabase.from("daily_logs").update({ vomiting_status: a.vomiting } as any).eq("id", row.id);
      if (p.photoDataUrl) {
        await supabase.from("photo_logs").insert({ bird_id: birdId, daily_log_id: row.id, photo_type: "other", photo_url: p.photoDataUrl, notes: "Attached to health scan", ...(activeSitId ? { sit_id: activeSitId } : {}) });
      }
      if (typeof p.weightGrams === "number") {
        await supabase.from("weight_entries").insert({ bird_id: birdId, grams: p.weightGrams, source: scanSource, logged_by: u.user?.id ?? null, ...(activeSitId ? { sit_id: activeSitId } : {}) });
      }

      track("health_scan_run", { severity: triage.status, had_photo: !!p.photoDataUrl, source: scanSource });
      setResult(triage);
      // Show up immediately in the Scans tab, the record-home recent feed, and the weight timeline.
      ["scan-feed", "bird-checkins", "weight-entries", "bird-weights"].forEach((k) =>
        qc.invalidateQueries({ queryKey: k === "scan-feed" ? ["scan-feed"] : [k, birdId] }));
    } catch (e: any) {
      toast.error(e?.message ?? "Couldn't log the scan.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#f4f1e8] pb-nav">
      <header className="sticky top-0 z-10 border-b border-[#e3ded0] bg-[#f4f1e8]/95 backdrop-blur">
        <div className="mx-auto flex max-w-md items-center gap-3 px-5 pt-safe pb-3">
          <Link to="/birds/$birdId" params={{ birdId }} aria-label="Back to bird record" className="-ml-1 rounded p-1 text-[#1a3d2e]">
            <ArrowLeft className="size-5" />
          </Link>
          <h1 className="text-base font-medium text-[#1a3d2e]">Health scan — {name}</h1>
        </div>
      </header>

      {result ? (
        <main className="mx-auto max-w-md space-y-4 px-5 py-6">
          <div className={`rounded-2xl p-6 text-white ${result.status === "red" ? "bg-warn-red" : result.status === "yellow" ? "bg-warn-amber" : "bg-warn-green"}`}>
            <p className="text-[11px] font-medium uppercase tracking-widest opacity-80">{result.status === "red" ? "Call your vet now" : result.status === "yellow" ? "Keep a close eye" : "All clear logged"}</p>
            <h2 className="mt-1 text-2xl font-medium leading-tight">{result.message}</h2>
          </div>
          {result.reasons.length > 0 && (
            <div className="rounded-xl bg-[#efe9da] p-4">
              <p className="text-[11px] font-medium uppercase tracking-widest text-[#5f5e5a]">What you flagged</p>
              <ul className="mt-2 list-disc pl-5 text-sm text-[#1a3d2e]">{result.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>
            </div>
          )}
          <div className="flex gap-2">
            {result.status !== "green" && (
              <Link to="/birds/$birdId/plan/editor" params={{ birdId }} search={{ tab: "emergency" }} className="flex-1 rounded-xl bg-[#1a3d2e] py-3 text-center text-sm font-medium text-white">Emergency contacts</Link>
            )}
            <button type="button" onClick={() => navigate({ to: "/birds/$birdId", params: { birdId } })} className="flex-1 rounded-xl border border-[#c8bfa6] py-3 text-center text-sm font-medium text-[#1a3d2e]">Back to record</button>
          </div>
        </main>
      ) : (
        <ScanForm submitting={submitting} submitLabel="Log scan" onSubmit={onSubmit} />
      )}
    </div>
  );
}
