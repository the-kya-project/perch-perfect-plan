import { useState } from "react";
import { Camera, Upload, Loader2 } from "lucide-react";
import { SCAN_FIELDS, computeTriage, type ScanAnswer, type ScanFieldKey } from "@/lib/triage";
import { compressImageToDataUrl, dataUrlBytes, MAX_UPLOAD_BYTES } from "@/lib/imageUpload";
import { toast } from "sonner";

// The ONE health-scan form. Rendered by both the sitter scan route and the owner
// scan route — same questions, same triage, same photo/weight/notes. The parent
// supplies the submit (sitter → server fn + notify; owner → authed insert), so
// there is no parallel scan UI.

export type ScanSubmit = {
  answers: Record<ScanFieldKey, ScanAnswer>;
  notes?: string;
  photoDataUrl?: string;
  weightGrams?: number;
};

export function ScanForm({
  submitting,
  submitLabel = "Submit health scan",
  onSubmit,
}: {
  submitting: boolean;
  submitLabel?: string;
  onSubmit: (payload: ScanSubmit) => void;
}) {
  const [answers, setAnswers] = useState<Partial<Record<ScanFieldKey, ScanAnswer>>>({});
  const [notes, setNotes] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [weight, setWeight] = useState("");
  const [showErrors, setShowErrors] = useState(false);

  const allAnswered = SCAN_FIELDS.every((f) => answers[f.key]);
  const preview = () =>
    computeTriage(Object.fromEntries(SCAN_FIELDS.map((f) => [f.key, answers[f.key]!])) as Record<ScanFieldKey, ScanAnswer>);

  async function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setPhotoBusy(true);
    try {
      const dataUrl = await compressImageToDataUrl(file);
      if (dataUrlBytes(dataUrl) > MAX_UPLOAD_BYTES) {
        toast.error("That photo's a bit too large even after resizing. Try a different one.");
        return;
      }
      setPhoto(dataUrl);
    } catch {
      toast.error("Couldn't process that photo. Try a different one.");
    } finally {
      setPhotoBusy(false);
    }
  }

  function handleSubmit() {
    const firstMissing = SCAN_FIELDS.find((f) => !answers[f.key]);
    if (firstMissing) {
      setShowErrors(true);
      document.getElementById(`scan-field-${firstMissing.key}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      toast.error("Please answer every question before submitting.");
      return;
    }
    onSubmit({
      answers: Object.fromEntries(SCAN_FIELDS.map((f) => [f.key, answers[f.key]!])) as Record<ScanFieldKey, ScanAnswer>,
      notes: notes || undefined,
      photoDataUrl: photo || undefined,
      weightGrams: weight.trim() && Number.isFinite(Number(weight)) ? Number(weight) : undefined,
    });
  }

  return (
    <main className="mx-auto max-w-md space-y-4 px-5 py-5 pb-32">
      {SCAN_FIELDS.map((f) => {
        const a = answers[f.key];
        const missing = showErrors && !a;
        return (
          <section key={f.key} id={`scan-field-${f.key}`} className={`rounded-2xl bg-[#efe9da] p-4 ${missing ? "ring-2 ring-warn-red" : ""}`}>
            <p className="text-sm font-medium">{f.question}</p>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {(["normal", "not_sure", "concerning"] as ScanAnswer[]).map((opt) => (
                <button
                  key={opt}
                  onClick={() => setAnswers({ ...answers, [f.key]: opt })}
                  className={`min-h-[44px] rounded-lg border px-1 py-2.5 text-[11px] font-medium ${a === opt
                    ? opt === "concerning" ? "border-warn-red bg-warn-red/10 text-warn-red"
                    : opt === "not_sure" ? "border-warn-amber bg-warn-amber/10 text-warn-amber"
                    : "border-warn-green bg-warn-green/10 text-warn-green"
                    : "border-[#e0d8c4] text-[#5f5e5a]"}`}
                >
                  {opt === "not_sure" ? "Not sure" : opt === "concerning" ? "Concerning" : "Normal"}
                </button>
              ))}
            </div>
            {missing && <p className="mt-3 text-[11px] font-medium text-warn-red">Please answer this before submitting.</p>}
            {a === "not_sure" && <p className="mt-3 rounded bg-warn-amber/10 p-2 text-[11px] leading-relaxed text-[#1a3d2e]"><b>Look again: </b>{f.helpNotSure}</p>}
            {a === "concerning" && <p className="mt-3 rounded bg-warn-red/10 p-2 text-[11px] leading-relaxed text-[#1a3d2e]"><b>Watch for: </b>{f.helpConcerning}</p>}
          </section>
        );
      })}

      <section className="rounded-2xl bg-[#efe9da] p-4">
        <p className="text-sm font-medium">Optional: add a photo</p>
        <p className="mt-1 text-xs text-[#5f5e5a]">{photo ? "Take a new photo or upload a different one." : "Take a photo or upload one if anything looks off."}</p>
        {photoBusy ? (
          <div className="mt-3 flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[#e0d8c4] py-3 text-sm font-medium text-[#5f5e5a] opacity-60">
            <Loader2 className="size-4 animate-spin" /> Processing…
          </div>
        ) : (
          <div className="mt-3 grid grid-cols-2 gap-2">
            <label className="flex min-h-[44px] cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[#e0d8c4] py-3 text-sm font-medium text-[#5f5e5a]">
              <Camera className="size-4" /> Take photo
              <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhoto} />
            </label>
            <label className="flex min-h-[44px] cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[#e0d8c4] py-3 text-sm font-medium text-[#5f5e5a]">
              <Upload className="size-4" /> Upload photo
              <input type="file" accept="image/*" className="hidden" onChange={handlePhoto} />
            </label>
          </div>
        )}
        {photo && !photoBusy && <img src={photo} alt="Scan photo preview" className="mt-2 max-h-40 rounded-lg" />}
      </section>

      <section className="rounded-2xl bg-[#efe9da] p-4">
        <label className="block">
          <span className="text-sm font-medium">Optional: weigh-in</span>
          <span className="mt-1 block text-xs text-[#5f5e5a]">If you weighed them, add the grams — it goes straight to the weight tracker.</span>
          <div className="mt-3 flex items-center gap-2">
            <input
              inputMode="decimal"
              value={weight}
              onChange={(e) => setWeight(e.target.value.replace(/[^0-9.]/g, ""))}
              placeholder="e.g. 410"
              className="h-11 w-32 rounded-xl border border-[#e0d8c4] bg-white px-3 text-center text-sm"
            />
            <span className="text-sm text-[#5f5e5a]">grams</span>
          </div>
        </label>
      </section>

      <section className="rounded-2xl bg-[#efe9da] p-4">
        <label className="block">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-[#5f5e5a]">Notes</span>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="w-full rounded-xl border border-[#e0d8c4] bg-white p-3 text-sm" />
        </label>
      </section>

      {allAnswered && (
        <div className="rounded-xl bg-[#efe9da] p-3 text-xs text-[#5f5e5a]">
          Preview: <b className="uppercase">{preview().status}</b> — {preview().message}
        </div>
      )}

      <button
        onClick={handleSubmit}
        disabled={submitting || photoBusy}
        className="min-h-[44px] w-full rounded-xl bg-[#1a3d2e] py-3.5 text-sm font-medium text-white disabled:opacity-60"
      >
        {submitting ? "Logging…" : submitLabel}
      </button>
    </main>
  );
}
