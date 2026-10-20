// The owner's full health check: ten questions, an optional weigh-in, photo and
// note, then one save. A task screen (Close, progress, pinned save button, no
// bottom nav). This file is the form only; the route owns the save so the
// daily_logs row is written exactly as before.
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { Camera, Loader2, Phone, Upload } from "lucide-react";
import { toast } from "sonner";
import { K, KyaField, KyaHeading, KyaPage, KyaPrimaryButton } from "@/components/kya";
import { TaskFooter, TaskHeader, TASK_FOOTER_SPACE, useLeaveGuard } from "@/components/headers";
import { MemberContextBanner } from "@/components/MemberContextBanner";
import { SCAN_FIELDS, type ScanAnswer, type ScanFieldKey } from "@/lib/triage";
import { scanHint, scanQuestionFor } from "@/lib/scanFieldLabels";
import { weightToSave, MIN_WEIGHT_G, MAX_WEIGHT_G } from "@/lib/dailyLog";
import type { Meal } from "@/lib/dailyCheck";
import { compressImageToDataUrl, dataUrlBytes, MAX_UPLOAD_BYTES } from "@/lib/imageUpload";

export type FullCheckSubmit = {
  answers: Record<ScanFieldKey, ScanAnswer>;
  /** Only for items still marked Not sure / Concerning that were given a note. */
  itemNotes?: Partial<Record<ScanFieldKey, string>>;
  notes?: string;
  photoDataUrl?: string;
  /** Validated grams (weightToSave), or undefined for no weigh-in. */
  weightGrams?: number;
  meal: Meal;
};

type Sex = "m" | "f" | "";

function sexOf(sex: string | null | undefined): Sex {
  const s = (sex ?? "").trim().toLowerCase();
  if (s.startsWith("f")) return "f";
  if (s.startsWith("m")) return "m";
  return "";
}

const TOTAL = SCAN_FIELDS.length;
const LINE = "#e3ebe2";
const FIELD_BORDER = "#d5dfd5";
// KyaSecondaryButton's look, for <label>/<a> elements that can't be a <button>.
const SECONDARY = "inline-flex min-h-[48px] cursor-pointer items-center justify-center gap-2 rounded-full border-2 bg-white px-4 text-[15px] font-[700] active:scale-[0.99]";

/** Short lowercase noun per question, for "You weren't sure about Max's …". */
function itemNoun(t: TFunction, k: ScanFieldKey): string {
  switch (k) {
    case "alertness": return t("fullCheck.noun.alertness", "alertness");
    case "food": return t("fullCheck.noun.food", "eating");
    case "droppings": return t("fullCheck.noun.droppings", "droppings");
    case "breathing": return t("fullCheck.noun.breathing", "breathing");
    case "posture": return t("fullCheck.noun.posture", "perching");
    case "noise": return t("fullCheck.noun.noise", "vocalizing");
    case "fluffed": return t("fullCheck.noun.fluffed", "posture");
    case "vomiting": return t("fullCheck.noun.vomiting", "face");
    case "injury": return t("fullCheck.noun.injury", "injury");
    case "exposure": return t("fullCheck.noun.exposure", "exposure to hazards");
  }
}

/** The same noun capitalized, to start "… looked concerning". */
function itemNounCap(t: TFunction, k: ScanFieldKey): string {
  switch (k) {
    case "alertness": return t("fullCheck.nounCap.alertness", "Alertness");
    case "food": return t("fullCheck.nounCap.food", "Eating");
    case "droppings": return t("fullCheck.nounCap.droppings", "Droppings");
    case "breathing": return t("fullCheck.nounCap.breathing", "Breathing");
    case "posture": return t("fullCheck.nounCap.posture", "Perching");
    case "noise": return t("fullCheck.nounCap.noise", "Vocalizing");
    case "fluffed": return t("fullCheck.nounCap.fluffed", "Posture");
    case "vomiting": return t("fullCheck.nounCap.vomiting", "Face");
    case "injury": return t("fullCheck.nounCap.injury", "Injury");
    case "exposure": return t("fullCheck.nounCap.exposure", "Exposure to hazards");
  }
}

function headerLine(t: TFunction, name: string, sex: Sex): string {
  if (sex === "m") return t("fullCheck.line_male", "A careful once-over to make sure {{name}} is feeling like himself.", { name });
  if (sex === "f") return t("fullCheck.line_female", "A careful once-over to make sure {{name}} is feeling like herself.", { name });
  return t("fullCheck.line_other", "A careful once-over to make sure {{name}} is feeling like themselves.", { name });
}

function weighLine(t: TFunction, sex: Sex): string {
  if (sex === "m") return t("fullCheck.weighLine_male", "Optional. It goes straight to his weight history.");
  if (sex === "f") return t("fullCheck.weighLine_female", "Optional. It goes straight to her weight history.");
  return t("fullCheck.weighLine_other", "Optional. It goes straight to their weight history.");
}

export function FullHealthCheck({ birdId, name, sex, vetPhone, submitting, onSubmit, onLeave }: {
  birdId: string;
  name: string;
  /** The birds.sex column as stored ("Male" / "Female" / null). */
  sex: string | null | undefined;
  /** The bird's effective avian vet phone, or null to hide Call vet. */
  vetPhone: string | null;
  submitting: boolean;
  onSubmit: (p: FullCheckSubmit) => void;
  onLeave: () => void;
}) {
  const { t } = useTranslation();
  const sx = sexOf(sex);
  const [answers, setAnswers] = useState<Partial<Record<ScanFieldKey, ScanAnswer>>>({});
  const [itemNotes, setItemNotes] = useState<Partial<Record<ScanFieldKey, string>>>({});
  const [notes, setNotes] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [grams, setGrams] = useState("");
  const [meal, setMeal] = useState<Meal>(null);

  const answered = SCAN_FIELDS.filter((f) => answers[f.key]).length;
  const allAnswered = answered === TOTAL;
  const parsedWeight = weightToSave(grams);
  const weightInvalid = parsedWeight === undefined;
  const dirty = answered > 0 || Object.values(itemNotes).some((v) => (v ?? "").trim()) || !!notes.trim() || !!grams.trim() || !!photo;
  const { requestClose, guard } = useLeaveGuard(dirty, onLeave);

  const flagged = SCAN_FIELDS.filter((f) => answers[f.key] === "not_sure" || answers[f.key] === "concerning");
  const telHref = vetPhone ? `tel:${vetPhone.replace(/[^\d+]/g, "")}` : null;

  const handlePhoto = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setPhotoBusy(true);
    try {
      // Same path as the sitter's ScanForm: compress to a data URL here; the
      // route uploads it to scan-photos (inline fallback) on save.
      const dataUrl = await compressImageToDataUrl(file);
      if (dataUrlBytes(dataUrl) > MAX_UPLOAD_BYTES) {
        toast.error(t("scanForm.photoTooLarge", "That photo's a bit too large even after resizing. Try a different one."));
        return;
      }
      setPhoto(dataUrl);
    } catch {
      toast.error(t("scanForm.photoProcessError", "Couldn't process that photo. Try a different one."));
    } finally {
      setPhotoBusy(false);
    }
  }, [t]);

  function submit() {
    if (!allAnswered || submitting || photoBusy || weightInvalid) return;
    const cleaned: Partial<Record<ScanFieldKey, string>> = {};
    for (const f of SCAN_FIELDS) {
      const a = answers[f.key];
      const note = (itemNotes[f.key] ?? "").trim();
      if ((a === "concerning" || a === "not_sure") && note) cleaned[f.key] = note;
    }
    onSubmit({
      answers: Object.fromEntries(SCAN_FIELDS.map((f) => [f.key, answers[f.key]!])) as Record<ScanFieldKey, ScanAnswer>,
      itemNotes: Object.keys(cleaned).length ? cleaned : undefined,
      notes: notes || undefined,
      photoDataUrl: photo || undefined,
      weightGrams: typeof parsedWeight === "number" ? parsedWeight : undefined,
      meal: typeof parsedWeight === "number" ? meal : null,
    });
  }

  const optionLabel = (o: ScanAnswer) =>
    o === "normal" ? t("scanForm.answerNormal", "Normal") : o === "not_sure" ? t("scanForm.answerNotSure", "Not sure") : t("scanForm.answerConcerning", "Concerning");
  const watchTitle = t("fullCheck.watchCount", "{{count}} things to watch", { count: flagged.length, defaultValue_one: "{{count}} thing to watch" });
  const saveLabel = submitting ? t("fullCheck.saving", "Saving…") : t("fullCheck.save", "Save {{name}}'s check", { name });

  return (
    <KyaPage>
      <TaskHeader
        title={t("fullCheck.title", "{{name}}'s full health check", { name })}
        line={headerLine(t, name, sx)}
        onClose={requestClose}
        progress={{ label: t("fullCheck.progress", "{{n}} of {{total}} answered", { n: answered, total: TOTAL }), value: answered / TOTAL }}
      />
      <main className={`relative mx-auto -mt-[26px] flex max-w-md flex-col rounded-t-[26px] bg-white px-5 pt-3 ${TASK_FOOTER_SPACE}`} style={{ color: K.forest }}>
        <MemberContextBanner birdId={birdId} className="mt-2" />

        {SCAN_FIELDS.map((f, i) => {
          const a = answers[f.key];
          const hint = scanHint(t, f);
          const qid = `fc-q-${f.key}`;
          return (
            <section key={f.key} className="py-5" style={i > 0 ? { borderTop: `1px solid ${LINE}` } : undefined}>
              <p id={qid} className="m-0 text-[15.5px] font-[700] leading-[1.35]">{scanQuestionFor(t, f, name)}</p>
              {hint && <p className="m-0 mt-1 text-[13px] leading-[1.4]" style={{ color: K.quiet }}>{hint}</p>}
              <div role="radiogroup" aria-labelledby={qid} className="mt-3 grid grid-cols-3 gap-2">
                {(["normal", "not_sure", "concerning"] as ScanAnswer[]).map((o) => {
                  const on = a === o;
                  const style = on
                    ? o === "normal"
                      ? { background: K.forest, borderColor: K.forest, color: "#fff" }
                      : { background: K.amberBg, borderColor: K.amberText, color: K.amberText }
                    : { background: "#fff", borderColor: FIELD_BORDER, color: K.forest };
                  return (
                    <button
                      key={o}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => setAnswers((prev) => ({ ...prev, [f.key]: o }))}
                      className="min-h-[44px] rounded-full border-[1.5px] px-1 text-[14px] font-[700] active:scale-[0.98]"
                      style={style}
                    >
                      {optionLabel(o)}
                    </button>
                  );
                })}
              </div>
              {(a === "not_sure" || a === "concerning") && (
                <textarea
                  aria-label={t("fullCheck.itemNoteAria", "Note about this answer")}
                  value={itemNotes[f.key] ?? ""}
                  onChange={(e) => setItemNotes((prev) => ({ ...prev, [f.key]: e.target.value }))}
                  placeholder={t("fullCheck.itemNotePlaceholder", "What did you notice?")}
                  rows={2}
                  className="mt-3 w-full resize-none rounded-[16px] border-[1.5px] bg-white px-4 py-3 text-[16px] outline-none focus:border-[#2d6a4f]"
                  style={{ borderColor: FIELD_BORDER, color: K.forest }}
                />
              )}
            </section>
          );
        })}

        <section className="flex flex-col gap-3 py-5" style={{ borderTop: `1px solid ${LINE}` }}>
          <div>
            <KyaHeading size={20}>{t("fullCheck.weighTitle", "Weigh {{name}} too?", { name })}</KyaHeading>
            <p className="m-0 mt-1 text-[13px] leading-[1.4]" style={{ color: K.quiet }}>{weighLine(t, sx)}</p>
          </div>
          <KyaField
            id="fc-grams"
            label={t("fullCheck.gramsLabel", "Weight in grams")}
            inputMode="decimal"
            value={grams}
            placeholder={t("fullCheck.gramsPlaceholder", "e.g. 95")}
            onChange={(e) => setGrams(e.target.value.replace(/[^0-9.]/g, ""))}
            hint={weightInvalid ? <span style={{ color: K.amberText }}>{t("birdWeight.range", "Enter a weight between {{min}} and {{max}} grams.", { min: MIN_WEIGHT_G, max: MAX_WEIGHT_G })}</span> : undefined}
          />
          <div role="radiogroup" aria-label={t("birdWeight.mealLabel", "Relative to a meal (optional)")} className="grid grid-cols-2 gap-2 rounded-full p-1" style={{ background: K.mist }}>
            {(["before_meal", "after_meal"] as const).map((m) => {
              const on = meal === m;
              return (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setMeal(on ? null : m)}
                  className="min-h-[44px] rounded-full text-[14px] font-[700]"
                  style={on ? { background: K.forest, color: "#fff" } : { background: "transparent", color: K.forest }}
                >
                  {m === "before_meal" ? t("birdWeight.beforeMeal", "Before meal") : t("birdWeight.afterMeal", "After meal")}
                </button>
              );
            })}
          </div>
        </section>

        <section className="flex flex-col gap-3 py-5" style={{ borderTop: `1px solid ${LINE}` }}>
          <div>
            <KyaHeading size={20}>{t("fullCheck.photoTitle", "Add a photo?")}</KyaHeading>
            <p className="m-0 mt-1 text-[13px] leading-[1.4]" style={{ color: K.quiet }}>{t("fullCheck.photoLine", "Helpful if anything looks off.")}</p>
          </div>
          {photoBusy ? (
            <div className="flex min-h-[48px] items-center justify-center gap-2 text-[14px] font-[700]" style={{ color: K.quiet }}>
              <Loader2 className="size-4 animate-spin" /> {t("scanForm.processing", "Processing…")}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2.5">
              <label className={SECONDARY} style={{ borderColor: K.forest, color: K.forest }}>
                <Camera className="size-[18px]" /> {t("scanForm.takePhoto", "Take photo")}
                <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={handlePhoto} />
              </label>
              <label className={SECONDARY} style={{ borderColor: K.forest, color: K.forest }}>
                <Upload className="size-[18px]" /> {t("fullCheck.upload", "Upload")}
                <input type="file" accept="image/*" className="sr-only" onChange={handlePhoto} />
              </label>
            </div>
          )}
          {photo && !photoBusy && (
            <div className="flex items-end gap-3">
              <img src={photo} alt={t("scanForm.photoAlt", "Health check photo preview")} className="max-h-40 rounded-[14px]" />
              <button type="button" onClick={() => setPhoto(null)} className="min-h-[44px] text-[14px] font-[700]" style={{ color: K.moss }}>
                {t("fullCheck.removePhoto", "Remove")}
              </button>
            </div>
          )}
        </section>

        <section className="flex flex-col gap-3 py-5" style={{ borderTop: `1px solid ${LINE}` }}>
          <KyaHeading size={20}>{t("fullCheck.notesTitle", "Anything else?")}</KyaHeading>
          <textarea
            aria-label={t("fullCheck.notesTitle", "Anything else?")}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={t("fullCheck.notesPlaceholder", "Notes for {{name}}'s health log", { name })}
            rows={3}
            className="w-full resize-none rounded-[16px] border-[1.5px] bg-white px-4 py-3 text-[16px] outline-none focus:border-[#2d6a4f]"
            style={{ borderColor: FIELD_BORDER, color: K.forest }}
          />
        </section>

        {flagged.length > 0 && (
          <section className="mb-2 flex flex-col gap-2.5 rounded-[20px] p-4" style={{ background: K.amberBg, color: K.amberText }} aria-live="polite">
            <p className="m-0 text-[15.5px] font-[700]">{watchTitle}</p>
            <ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-[14px] leading-[1.45]">
              {flagged.map((f) => (
                <li key={f.key}>
                  {answers[f.key] === "concerning"
                    ? t("fullCheck.watchConcerning", "{{item}} looked concerning. Call your avian vet.", { item: itemNounCap(t, f.key) })
                    : t("fullCheck.watchNotSure", "You weren't sure about {{name}}'s {{item}}. If it doesn't clear up, call your avian vet.", { name, item: itemNoun(t, f.key) })}
                </li>
              ))}
            </ul>
            {telHref && (
              <a href={telHref} className={`${SECONDARY} mt-1 self-start`} style={{ borderColor: K.forest, color: K.forest }}>
                <Phone className="size-[18px]" /> {t("fullCheck.callVet", "Call vet")}
              </a>
            )}
          </section>
        )}
      </main>

      <TaskFooter>
        <KyaPrimaryButton onClick={submit} disabled={!allAnswered || submitting || photoBusy || weightInvalid}>{saveLabel}</KyaPrimaryButton>
      </TaskFooter>
      {guard}
    </KyaPage>
  );
}
