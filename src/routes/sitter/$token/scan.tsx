import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSitterContext } from "./route";
import { submitHealthScan, getSitterScans } from "@/lib/sitter.functions";
import { SCAN_FIELDS, type ScanAnswer, type ScanFieldKey, computeTriage } from "@/lib/triage";
import { ScanForm, type ScanSubmit } from "@/components/ScanForm";
import { ArrowLeft, History, ChevronDown, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { track } from "@/lib/analytics";

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

function answerStyle(a: string | null | undefined) {
  return a === "concerning"
    ? "bg-warn-red/10 text-warn-red"
    : a === "not_sure"
    ? "bg-warn-amber/10 text-warn-amber"
    : a === "normal"
    ? "bg-warn-green/10 text-warn-green"
    : "bg-[#e8e1d0] text-[#8a897f]";
}
function answerLabel(a: string | null | undefined) {
  return a === "concerning" ? "Concerning" : a === "not_sure" ? "Not sure" : a === "normal" ? "Normal" : "—";
}

function ScanPage() {
  const { token } = Route.useParams();
  const { data: ctx } = useSitterContext(token);
  const [mode, setMode] = useState<"form" | "history">("form");
  const [result, setResult] = useState<{ status: string; message: string; reasons: string[] } | null>(null);

  // Reset when the selected bird changes; the form's own state lives in ScanForm
  // and is reset by re-keying it on activeBirdId.
  useEffect(() => { setResult(null); setMode("form"); }, [ctx.activeBirdId]);

  const submit = useServerFn(submitHealthScan);
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: async (p: ScanSubmit) =>
      submit({
        data: {
          token,
          birdId: ctx.activeBirdId,
          answers: p.answers,
          itemNotes: p.itemNotes,
          notes: p.notes,
          photoDataUrl: p.photoDataUrl,
          weightGrams: p.weightGrams,
        },
      }),
    onSuccess: (res, p) => {
      setResult(res.triage as any);
      track("health_scan_run", { severity: (res.triage as any)?.status ?? "unknown", had_photo: !!p.photoDataUrl });
      toast.success("Health scan logged.");
      // Refresh the Today scan card + the multi-bird dashboard so the new
      // done/flagged state shows immediately.
      qc.invalidateQueries({ queryKey: ["sitter-ctx", token] });
      qc.invalidateQueries({ queryKey: ["sitter-dashboard", token] });
    },
    onError: (e: any) => toast.error(e.message ?? "Could not log health check."),
  });

  if (mode === "history") {
    return <ScanHistory token={token} birdId={ctx.activeBirdId} birdName={ctx.bird.name} onBack={() => setMode("form")} />;
  }

  if (result) {
    const color = result.status === "red" ? "bg-warn-red" : result.status === "yellow" ? "bg-warn-amber" : "bg-warn-green";
    return (
      <main className="mx-auto max-w-md space-y-4 px-5 py-6">
        <div className={`rounded-2xl ${color} p-6 text-white`}>
          <p className="text-[11px] font-medium uppercase tracking-widest opacity-80">{result.status === "red" ? "Call vet now" : result.status === "yellow" ? "Monitor & message owner" : "All clear logged"}</p>
          <h1 className="mt-1 text-2xl font-medium leading-tight">{result.message}</h1>
        </div>
        {result.reasons.length > 0 && (
          <div className="rounded-xl bg-[#efe9da] p-4">
            <p className="text-[11px] font-medium uppercase tracking-widest text-[#5f5e5a]">What you flagged</p>
            <ul className="mt-2 list-disc pl-5 text-sm text-[#1a3d2e]">
              {result.reasons.map((r, i) => <li key={i}>{r}</li>)}
            </ul>
          </div>
        )}
        <div className="flex gap-2">
          {result.status !== "green" && (
            <Link to="/sitter/$token/emergency" params={{ token }} className="flex-1 rounded-xl bg-[#1a3d2e] py-3 text-center text-sm font-medium text-white">Open emergency contacts</Link>
          )}
          <Link to="/sitter/$token" params={{ token }} className="flex-1 rounded-xl border border-[#e0d8c4] py-3 text-center text-sm font-medium">Back to today</Link>
        </div>
        <button onClick={() => setMode("history")} className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#efe9da] py-3 text-sm font-medium text-[#1a3d2e]">
          <History className="size-4" /> See past health checks for this sit
        </button>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-[#f4f1e8]">
      <header className="border-b border-[#e0d8c4] bg-[#f4f1e8]">
        <div className="mx-auto flex max-w-md items-center gap-3 px-5 py-3">
          <Link to="/sitter/$token" params={{ token }} className="rounded p-1 text-[#5f5e5a]"><ArrowLeft className="size-5" /></Link>
          <h1 className="flex-1 text-sm font-medium">Daily health check — {ctx.bird.name}</h1>
          <button
            onClick={() => setMode("history")}
            className="inline-flex items-center gap-1.5 rounded-full bg-[#efe9da] px-3 py-1.5 text-xs font-medium text-[#1a3d2e]"
          >
            <History className="size-3.5" /> Past health checks
          </button>
        </div>
      </header>
      <p className="mx-auto max-w-md px-5 pt-4 text-sm leading-relaxed text-[#5f5e5a]">A quick once-over to make sure {ctx.bird.name}'s doing well.</p>
      <ScanForm key={ctx.activeBirdId} submitting={m.isPending} onSubmit={(p) => m.mutate(p)} />
    </div>
  );
}

function ScanHistory({ token, birdId, birdName, onBack }: { token: string; birdId: string; birdName: string; onBack: () => void }) {
  const fn = useServerFn(getSitterScans);
  const { data: scans = [], isLoading } = useQuery({
    queryKey: ["sitter-scans", token, birdId],
    queryFn: () => fn({ data: { token, birdId } }),
  });
  const [open, setOpen] = useState<string | null>(null);

  return (
    <div className="min-h-screen bg-[#f4f1e8]">
      <header className="border-b border-[#e0d8c4] bg-[#f4f1e8]">
        <div className="mx-auto flex max-w-md items-center gap-3 px-5 py-3">
          <button onClick={onBack} className="rounded p-1 text-[#5f5e5a]"><ArrowLeft className="size-5" /></button>
          <h1 className="text-sm font-medium">Past health checks — {birdName}</h1>
        </div>
      </header>
      <main className="mx-auto max-w-md space-y-3 px-5 py-5 pb-32">
        <p className="text-xs text-[#5f5e5a]">Health checks you've logged during this sit, newest first.</p>
        {isLoading ? (
          <div className="flex items-center gap-2 rounded-xl bg-[#efe9da] p-4 text-sm text-[#5f5e5a]"><Loader2 className="size-4 animate-spin" /> Loading…</div>
        ) : scans.length === 0 ? (
          <div className="rounded-xl bg-[#efe9da] p-4 text-sm text-[#5f5e5a]">No health checks logged yet for this sit.</div>
        ) : (
          <ul className="space-y-3">
            {(scans as any[]).map((s) => {
              const isOpen = open === s.id;
              const wrap = s.triage_status === "red"
                ? "border-2 border-warn-red bg-warn-red/5"
                : s.triage_status === "yellow"
                ? "border-2 border-warn-amber bg-warn-amber/5"
                : "border border-[#e0d8c4] bg-[#efe9da]";
              return (
                <li key={s.id} className={`rounded-xl ${wrap}`}>
                  <button onClick={() => setOpen(isOpen ? null : s.id)} className="flex w-full items-center justify-between gap-2 p-3 text-left" aria-expanded={isOpen}>
                    <div className="flex items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${answerStyle(s.triage_status === "red" ? "concerning" : s.triage_status === "yellow" ? "not_sure" : "normal")}`}>
                        {s.triage_status}
                      </span>
                      <span className="text-[11px] text-[#5f5e5a]">{new Date(s.created_at).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
                    </div>
                    <ChevronDown className={`size-4 shrink-0 text-[#8a897f] transition ${isOpen ? "rotate-180" : ""}`} />
                  </button>
                  {isOpen && (
                    <div className="space-y-3 border-t border-[#e0d8c4] px-3 py-3">
                      <ul className="space-y-1.5">
                        {SCAN_FIELDS.map((f) => (
                          <li key={f.key} className="flex items-center justify-between gap-3 text-xs">
                            <span className="text-[#1a3d2e]">{f.question.replace(/\?$/, "")}</span>
                            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${answerStyle(s[COL_BY_KEY[f.key]])}`}>
                              {answerLabel(s[COL_BY_KEY[f.key]])}
                            </span>
                          </li>
                        ))}
                      </ul>
                      {s.notes && (
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-widest text-[#5f5e5a]">Notes</p>
                          <p className="mt-1 text-xs italic text-[#1a3d2e]">"{s.notes}"</p>
                        </div>
                      )}
                      {s.photos?.length > 0 && (
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-widest text-[#5f5e5a]">Photo</p>
                          <div className="mt-2 grid grid-cols-3 gap-2">
                            {s.photos.map((p: any) => (
                              <a key={p.id} href={p.photo_url} target="_blank" rel="noreferrer" className="block aspect-square overflow-hidden rounded-lg bg-[#e8e1d0]">
                                <img src={p.photo_url} alt="Scan photo" className="size-full object-cover" />
                              </a>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}
