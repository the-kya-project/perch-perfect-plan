import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { useSitterContext } from "./route";
import { submitHealthScan, uploadDroppingsPhoto } from "@/lib/sitter.functions";
import { SCAN_FIELDS, type ScanAnswer, type ScanFieldKey, computeTriage } from "@/lib/triage";
import { ArrowLeft, Camera } from "lucide-react";
import { VetReviewBanner } from "@/components/Disclaimer";
import { toast } from "sonner";

export const Route = createFileRoute("/sitter/$token/scan")({
  component: ScanPage,
});

function ScanPage() {
  const { token } = Route.useParams();
  const { data: ctx } = useSitterContext(token);
  const [answers, setAnswers] = useState<Partial<Record<ScanFieldKey, ScanAnswer>>>({});
  const [notes, setNotes] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [result, setResult] = useState<{ status: string; message: string; reasons: string[] } | null>(null);
  const [showErrors, setShowErrors] = useState(false);

  const submit = useServerFn(submitHealthScan);
  const upload = useServerFn(uploadDroppingsPhoto);
  const m = useMutation({
    mutationFn: async () => {
      const filled = Object.fromEntries(
        SCAN_FIELDS.map((f) => [f.key, answers[f.key]!]),
      ) as Record<ScanFieldKey, ScanAnswer>;
      const res = await submit({ data: { token, birdId: ctx.activeBirdId, answers: filled, notes: notes || undefined } });
      if (photo) await upload({ data: { token, birdId: ctx.activeBirdId, dataUrl: photo, notes: "Attached to health scan" } });
      return res;
    },
    onSuccess: (res) => {
      setResult(res.triage as any);
      toast.success("Health scan logged.");
    },
    onError: (e: any) => toast.error(e.message ?? "Could not log scan."),
  });

  function previewTriage() {
    const filled = Object.fromEntries(
      SCAN_FIELDS.map((f) => [f.key, answers[f.key]!]),
    ) as Record<ScanFieldKey, ScanAnswer>;
    return computeTriage(filled);
  }

  function handleSubmit() {
    const firstMissing = SCAN_FIELDS.find((f) => !answers[f.key]);
    if (firstMissing) {
      setShowErrors(true);
      const el = document.getElementById(`scan-field-${firstMissing.key}`);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      toast.error("Please answer every question before submitting.");
      return;
    }
    m.mutate();
  }

  if (result) {
    const color = result.status === "red" ? "bg-warn-red" : result.status === "yellow" ? "bg-warn-amber" : "bg-warn-green";
    return (
      <main className="mx-auto max-w-md space-y-4 px-4 py-6">
        <div className={`rounded-2xl ${color} p-6 text-white`}>
          <p className="text-[11px] font-bold uppercase tracking-widest opacity-80">{result.status === "red" ? "Call vet now" : result.status === "yellow" ? "Monitor & message owner" : "All clear logged"}</p>
          <h1 className="mt-1 text-2xl font-bold leading-tight">{result.message}</h1>
        </div>
        {result.reasons.length > 0 && (
          <div className="rounded-xl bg-white p-4 ring-1 ring-sage-100">
            <p className="text-[11px] font-bold uppercase tracking-widest text-sage-600">What you flagged</p>
            <ul className="mt-2 list-disc pl-5 text-sm text-sage-900">
              {result.reasons.map((r, i) => <li key={i}>{r}</li>)}
            </ul>
          </div>
        )}
        <div className="flex gap-2">
          {result.status !== "green" && (
            <Link to="/sitter/$token/emergency" params={{ token }} className="flex-1 rounded-xl bg-sage-900 py-3 text-center text-sm font-semibold text-white">Open emergency contacts</Link>
          )}
          <Link to="/sitter/$token" params={{ token }} className="flex-1 rounded-xl border border-sage-200 py-3 text-center text-sm font-semibold">Back to today</Link>
        </div>
      </main>
    );
  }

  const allAnswered = SCAN_FIELDS.every((f) => answers[f.key]);

  function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 1_800_000) { toast.error("Photo too large — please pick a smaller one."); return; }
    const reader = new FileReader();
    reader.onload = () => setPhoto(reader.result as string);
    reader.readAsDataURL(file);
  }

  return (
    <>
      <header className="sticky top-0 z-10 border-b border-sage-100 bg-white">
        <div className="mx-auto flex max-w-md items-center gap-3 px-4 py-3">
          <Link to="/sitter/$token" params={{ token }} className="rounded p-1 text-sage-600"><ArrowLeft className="size-5" /></Link>
          <h1 className="text-sm font-bold">Daily health scan — {ctx.bird.name}</h1>
        </div>
      </header>
      <main className="mx-auto max-w-md space-y-4 px-4 py-5 pb-32">
        <VetReviewBanner />

        {SCAN_FIELDS.map((f) => {
          const a = answers[f.key];
          const missing = showErrors && !a;
          return (
            <section
              key={f.key}
              id={`scan-field-${f.key}`}
              className={`rounded-2xl bg-white p-4 ring-1 ${missing ? "ring-2 ring-warn-red" : "ring-sage-100"}`}
            >
              <p className="text-sm font-semibold">{f.question}</p>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {(["normal", "not_sure", "concerning"] as ScanAnswer[]).map((opt) => (
                  <button
                    key={opt}
                    onClick={() => setAnswers({ ...answers, [f.key]: opt })}
                    className={`rounded-lg border px-1 py-2.5 text-[11px] font-bold uppercase ${a === opt
                      ? opt === "concerning" ? "border-warn-red bg-warn-red/10 text-warn-red"
                      : opt === "not_sure" ? "border-warn-amber bg-warn-amber/10 text-warn-amber"
                      : "border-warn-green bg-warn-green/10 text-warn-green"
                      : "border-sage-100 text-sage-700"}`}
                  >
                    {opt === "not_sure" ? "Not sure" : opt}
                  </button>
                ))}
              </div>
              {missing && (
                <p className="mt-3 text-[11px] font-semibold text-warn-red">Please answer this before submitting.</p>
              )}
              {a === "not_sure" && (
                <p className="mt-3 rounded bg-warn-amber/10 p-2 text-[11px] leading-relaxed text-sage-900"><b>Look again: </b>{f.helpNotSure}</p>
              )}
              {a === "concerning" && (
                <p className="mt-3 rounded bg-warn-red/10 p-2 text-[11px] leading-relaxed text-sage-900"><b>Watch for: </b>{f.helpConcerning}</p>
              )}
            </section>
          );
        })}

        <section className="rounded-2xl bg-white p-4 ring-1 ring-sage-100">
          <p className="text-sm font-semibold">Optional: photo of droppings</p>
          <p className="mt-1 text-xs text-sage-600">Take a photo against white paper if anything looks off.</p>
          <label className="mt-3 flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-sage-200 py-3 text-sm font-semibold text-sage-700">
            <Camera className="size-4" /> {photo ? "Replace photo" : "Add photo"}
            <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhoto} />
          </label>
          {photo && <img src={photo} alt="droppings preview" className="mt-2 max-h-40 rounded-lg" />}
        </section>

        <section className="rounded-2xl bg-white p-4 ring-1 ring-sage-100">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-sage-600">Notes for the owner</span>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="w-full rounded-xl border border-sage-100 bg-sage-50 p-3 text-sm" />
          </label>
        </section>

        {allAnswered && (
          <div className="rounded-xl bg-sage-100 p-3 text-xs text-sage-700">
            Preview: <b className="uppercase">{previewTriage().status}</b> — {previewTriage().message}
          </div>
        )}

        <button
          onClick={handleSubmit}
          disabled={m.isPending}
          className="w-full rounded-xl bg-sage-900 py-3.5 text-sm font-semibold text-white disabled:opacity-60"
        >
          {m.isPending ? "Logging..." : "Submit health scan"}
        </button>
      </main>
    </>
  );
}
