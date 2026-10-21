import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSitterContext } from "./route";
import { submitHealthScan, getSitterScans } from "@/lib/sitter.functions";
import { isOwnerPreview } from "@/lib/sitterPreviewMode";
import { SCAN_FIELDS, type ScanFieldKey } from "@/lib/triage";
import { FullHealthCheck, type FullCheckSubmit } from "@/components/FullHealthCheck";
import { K, KyaBody, KyaCard, KyaPage } from "@/components/kya";
import { PageHeader } from "@/components/headers";
import { scanQuestionFor } from "@/lib/scanFieldLabels";
import { ChevronDown, History, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { track } from "@/lib/analytics";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { friendlyError } from "@/lib/errorMessage";
import { pickVet } from "@/lib/emergency";
import { ownerFirstName } from "@/components/sitter/sitterShared";
import { localDateISO } from "@/lib/localDay";

export const Route = createFileRoute("/sitter/$token/scan")({
  component: ScanPage,
});

// Map each scan question to its daily_logs column so past scans render the same
// per-question detail the owner sees.
const COL_BY_KEY: Record<ScanFieldKey, string> = {
  alertness: "alertness_status",
  food: "food_status",
  droppings: "droppings_status",
  breathing: "breathing_status",
  posture: "posture_status",
  noise: "behavior_status",
  fluffed: "energy_status",
  vomiting: "vomiting_status",
  injury: "injury_status",
  exposure: "exposure_status",
};

/** Answer pill: forest for Normal, amber for Not sure / Concerning (as in the check). */
function answerStyle(a: string | null | undefined) {
  return a === "concerning" || a === "not_sure"
    ? { background: K.amberBg, color: K.amberText }
    : a === "normal"
    ? { background: K.lime, color: K.forest }
    : { background: K.mist, color: K.quiet };
}
function answerLabel(a: string | null | undefined, t: TFunction) {
  return a === "concerning"
    ? t("sitter.scan.answer.concerning", "Concerning")
    : a === "not_sure"
    ? t("sitter.scan.answer.notSure", "Not sure")
    : a === "normal"
    ? t("sitter.scan.answer.normal", "Normal")
    : "—";
}
function statusLabel(s: string | null | undefined, t: TFunction) {
  return s === "red"
    ? t("sitter.scan.history.statusRed", "Call the vet")
    : s === "yellow"
    ? t("sitter.scan.history.statusYellow", "Things to watch")
    : t("sitter.scan.history.statusGreen", "All normal");
}

function ScanPage() {
  const { token } = Route.useParams();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: ctx } = useSitterContext(token);
  const birdId = ctx.activeBirdId as string;
  const [showHistory, setShowHistory] = useState(false);

  // Close (no save) and a successful save both return to Today on this bird.
  const toToday = useCallback(
    (saved?: boolean) => navigate({ to: "/sitter/$token", params: { token }, search: saved ? ({ birdId, saved: 1 } as any) : { birdId } }),
    [navigate, token, birdId],
  );

  const submit = useServerFn(submitHealthScan);
  const qc = useQueryClient();
  const m = useMutation({
    // Same payload the sitter ScanForm sent: the 10 answers, per-item notes,
    // notes, photo data URL and grams. No meal (the sitter save has no field).
    mutationFn: async (p: FullCheckSubmit) =>
      submit({
        data: {
          token,
          birdId,
          answers: p.answers,
          itemNotes: p.itemNotes,
          notes: p.notes,
          photoDataUrl: p.photoDataUrl,
          weightGrams: p.weightGrams,
          today: localDateISO(),
          preview: isOwnerPreview(),
        },
      }),
    onSuccess: async (res, p) => {
      track("health_scan_run", { severity: (res.triage as any)?.status ?? "unknown", had_photo: !!p.photoDataUrl });
      // Refresh the Today check card + the multi-bird dashboard so "Done at"
      // shows as soon as Today renders.
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["sitter-ctx", token] }),
        qc.invalidateQueries({ queryKey: ["sitter-dashboard", token] }),
        qc.invalidateQueries({ queryKey: ["sitter-scans", token, birdId] }),
      ]);
      toToday(true);
    },
    onError: (e: any) => toast.error(friendlyError(e, t("sitter.scan.errorToast", "Could not log health check."), t)),
  });

  // One vet record (avian, else after-hours), so the name and number match.
  const vet = pickVet(ctx.contacts as any);

  return (
    <>
      {/* The form stays mounted while past checks are open, so answers survive a peek. */}
      <div style={showHistory ? { display: "none" } : undefined}>
        <FullHealthCheck
          key={birdId}
          variant="sitter"
          birdId={birdId}
          name={ctx.bird.name}
          sex={(ctx.bird as any).sex}
          vet={vet}
          ownerName={ownerFirstName(ctx, t)}
          submitting={m.isPending}
          onSubmit={(p) => m.mutate(p)}
          onLeave={() => toToday()}
          extra={
            <button
              type="button"
              onClick={() => { setShowHistory(true); window.scrollTo(0, 0); }}
              className="mt-2 inline-flex min-h-[44px] items-center gap-2 self-start text-[14px] font-[700]"
              style={{ color: K.moss }}
            >
              <History className="size-4" /> {t("sitter.scan.seePast", "See past checks for this sit")}
            </button>
          }
        />
      </div>
      {showHistory && <ScanHistory token={token} birdId={birdId} birdName={ctx.bird.name} onBack={() => setShowHistory(false)} />}
    </>
  );
}

function ScanHistory({ token, birdId, birdName, onBack }: { token: string; birdId: string; birdName: string; onBack: () => void }) {
  const { t, i18n } = useTranslation();
  const dloc = i18n.language === "nl" ? "nl-NL" : undefined;
  const fn = useServerFn(getSitterScans);
  const { data: scans = [], isLoading } = useQuery({
    queryKey: ["sitter-scans", token, birdId],
    queryFn: () => fn({ data: { token, birdId } }),
  });
  const [open, setOpen] = useState<string | null>(null);

  return (
    <KyaPage>
      <PageHeader
        title={t("sitter.scan.history.pageTitle", "{{name}}'s past checks", { name: birdName })}
        line={t("sitter.scan.history.subtitle", "Health checks you've logged during this sit, newest first.")}
        onBack={onBack}
      />
      <KyaBody className="pb-10">
        {isLoading ? (
          <KyaCard className="flex items-center gap-2 p-4 text-[14.5px]" style={{ color: K.quiet }}><Loader2 className="size-4 animate-spin" /> {t("sitter.scan.history.loading", "Loading…")}</KyaCard>
        ) : scans.length === 0 ? (
          <KyaCard className="p-4 text-[14.5px]" style={{ color: K.quiet }}>{t("sitter.scan.history.empty", "No health checks logged yet for this sit.")}</KyaCard>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {(scans as any[]).map((s) => {
              const isOpen = open === s.id;
              const flagged = s.triage_status === "red" || s.triage_status === "yellow";
              return (
                <li key={s.id}>
                  <KyaCard className="overflow-hidden" style={flagged ? { boxShadow: `inset 0 0 0 2px ${K.amberText}` } : undefined}>
                    <button onClick={() => setOpen(isOpen ? null : s.id)} className="flex min-h-[56px] w-full items-center justify-between gap-3 px-4 py-3 text-left" aria-expanded={isOpen}>
                      <span className="min-w-0">
                        <span className="block text-[15px] font-[700]">
                          {new Date(s.created_at).toLocaleString(dloc, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                        </span>
                        <span className="mt-1 inline-block rounded-full px-2.5 py-0.5 text-[12.5px] font-[700]" style={answerStyle(flagged ? "concerning" : "normal")}>
                          {statusLabel(s.triage_status, t)}
                        </span>
                      </span>
                      <ChevronDown className={`size-5 shrink-0 transition ${isOpen ? "rotate-180" : ""}`} style={{ color: K.quiet }} />
                    </button>
                    {isOpen && (
                      <div className="flex flex-col gap-3 px-4 pb-4 pt-3" style={{ borderTop: `1px solid ${K.line}` }}>
                        <ul className="m-0 flex list-none flex-col gap-2 p-0">
                          {SCAN_FIELDS.map((f) => (
                            <li key={f.key} className="flex items-center justify-between gap-3 text-[13.5px]">
                              <span>{scanQuestionFor(t, f, birdName).replace(/\?$/, "")}</span>
                              <span className="shrink-0 rounded-full px-2.5 py-0.5 text-[12px] font-[700]" style={answerStyle(s[COL_BY_KEY[f.key]])}>
                                {answerLabel(s[COL_BY_KEY[f.key]], t)}
                              </span>
                            </li>
                          ))}
                        </ul>
                        {s.notes && (
                          <div>
                            <p className="m-0 text-[12.5px] font-[700]" style={{ color: K.quiet }}>{t("sitter.scan.notesLabel", "Notes")}</p>
                            <p className="m-0 mt-1 text-[14px]">"{s.notes}"</p>
                          </div>
                        )}
                        {s.photos?.length > 0 && (
                          <div>
                            <p className="m-0 text-[12.5px] font-[700]" style={{ color: K.quiet }}>{t("sitter.scan.photoLabel", "Photo")}</p>
                            <div className="mt-2 grid grid-cols-3 gap-2">
                              {s.photos.map((p: any) => (
                                <a key={p.id} href={p.photo_url} target="_blank" rel="noreferrer" className="block aspect-square overflow-hidden rounded-[12px]" style={{ background: K.mist }}>
                                  <img src={p.photo_url} alt={t("sitter.scan.photoAltCheck", "Health check photo")} className="size-full object-cover" />
                                </a>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </KyaCard>
                </li>
              );
            })}
          </ul>
        )}
      </KyaBody>
    </KyaPage>
  );
}
