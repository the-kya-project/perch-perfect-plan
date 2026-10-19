// The daily weight & health check box. One component on the bird page, the
// one-bird Home and each section of the flock check. A normal day is: type a
// weight (optional), leave "Yes, looks normal" selected, save. The faded last
// weight in the box is a hint only; an empty box saves the health check alone.
import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { toast } from "sonner";
import { Check, Plus } from "lucide-react";
import { useBirdRole } from "@/lib/useBirdRole";
import { useActiveSitIdForBird } from "@/components/CaregiverHome";
import { answersWithChanges, allNormalAnswers, weightToSave, bigWeightChange, MIN_WEIGHT_G, MAX_WEIGHT_G } from "@/lib/dailyLog";
import { saveDailyCheck, saveWeight, invalidateAfterCheck, type BirdToday, type Meal, type SaveResult } from "@/lib/dailyCheck";
import type { ScanFieldKey } from "@/lib/triage";
import { track } from "@/lib/analytics";
import { friendlyError } from "@/lib/errorMessage";
import { triageMessageLabel } from "@/lib/triageLabels";

export type DailyCheckSurface = "bird_page" | "home_one" | "flock";

const ITEM_KEYS: ScanFieldKey[] = ["alertness", "food", "droppings", "breathing", "posture", "noise", "fluffed", "vomiting", "injury", "exposure"];

function itemLabel(t: TFunction, k: ScanFieldKey): string {
  switch (k) {
    case "alertness": return t("dailyCheck.item.alertness", "Alertness");
    case "food": return t("dailyCheck.item.food", "Eating");
    case "droppings": return t("dailyCheck.item.droppings", "Droppings");
    case "breathing": return t("dailyCheck.item.breathing", "Breathing");
    case "posture": return t("dailyCheck.item.posture", "Perching");
    case "noise": return t("dailyCheck.item.noise", "Vocalizing");
    case "fluffed": return t("dailyCheck.item.fluffed", "Fluffed up");
    case "vomiting": return t("dailyCheck.item.vomiting", "Face or vomiting");
    case "injury": return t("dailyCheck.item.injury", "Injury");
    case "exposure": return t("dailyCheck.item.exposure", "Fumes or toxins");
  }
}

function timeLabel(iso: string | Date): string {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }).toLowerCase();
}

const LABEL = "mb-1 block text-xs font-[500] text-[var(--mute)]";
const INPUT = "h-11 w-full rounded-xl bg-white px-3 text-lg font-[500] text-[var(--ink)] outline-none ring-1 ring-[var(--line)] placeholder:font-[400] placeholder:text-[var(--mute2)] focus:ring-[var(--moss)]";

function MealButtons({ meal, setMeal }: { meal: Meal; setMeal: (m: Meal) => void }) {
  const { t } = useTranslation();
  return (
    <div className="grid grid-cols-2 gap-2">
      {(["before_meal", "after_meal"] as const).map((m) => (
        <button
          key={m}
          type="button"
          aria-pressed={meal === m}
          onClick={() => setMeal(meal === m ? null : m)}
          className={`min-h-[44px] rounded-xl text-sm font-[500] ${meal === m ? "bg-[var(--ink)] text-white" : "bg-white text-[var(--ink)] ring-1 ring-inset ring-[var(--line)]"}`}
        >
          {m === "before_meal" ? t("birdWeight.beforeMeal", "Before meal") : t("birdWeight.afterMeal", "After meal")}
        </button>
      ))}
    </div>
  );
}

function mealText(t: TFunction, m: string | null): string | null {
  return m === "before_meal" ? t("dailyCheck.beforeMealLower", "before meal") : m === "after_meal" ? t("dailyCheck.afterMealLower", "after meal") : null;
}

export function DailyCheckCard({
  birdId, name, today, surface, saveLabel, onSaved, canWeigh = true, showHeading = true, title, flat = false,
}: {
  birdId: string;
  name: string;
  /** Today's state for this bird, from useDailyCheckToday. Undefined while loading. */
  today: BirdToday | undefined;
  surface: DailyCheckSurface;
  /** Overrides the save label (the flock check's "Save · next: Kiwi"). */
  saveLabel?: string;
  onSaved?: (r: SaveResult) => void;
  canWeigh?: boolean;
  showHeading?: boolean;
  /** Heading override, e.g. "Mango's weight and health check" on Home. */
  title?: string;
  /** Inside another card (the flock check): no outline or shadow of its own. */
  flat?: boolean;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const role = useBirdRole(birdId);
  const source = role === "household" ? "household" : "owner";
  const sitId = useActiveSitIdForBird(birdId);

  const [grams, setGrams] = useState("");
  const [meal, setMeal] = useState<Meal>(null);
  const [different, setDifferent] = useState(false);
  const [changes, setChanges] = useState<Partial<Record<ScanFieldKey, "not_sure" | "concerning">>>({});
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmPct, setConfirmPct] = useState<number | null>(null);
  const [weightFailed, setWeightFailed] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [result, setResult] = useState<(SaveResult & { at: string }) | null>(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => { track("daily_check_viewed", { surface }); }, [surface]);
  // "When" is filled in automatically and kept current while the box is open.
  useEffect(() => { const id = setInterval(() => setNow(new Date()), 30_000); return () => clearInterval(id); }, []);

  const parsed = weightToSave(grams);
  const weightInvalid = canWeigh && parsed === undefined;
  const hasWeight = canWeigh && typeof parsed === "number";
  const hint = today?.lastGrams != null ? String(today.lastGrams) : t("dailyCheck.gramsPlaceholder", "e.g. 95");

  async function save(skipConfirm = false) {
    if (saving || weightInvalid) return;
    const g = hasWeight ? (parsed as number) : null;
    if (g != null && !skipConfirm) {
      const pct = bigWeightChange(today?.lastGrams, g);
      if (pct != null) { setConfirmPct(pct); return; }
    }
    setConfirmPct(null);
    setSaving(true);
    try {
      // A retry after a failed weight only re-sends the weight.
      if (weightFailed && g != null) {
        const err = await saveWeight({ birdId, grams: g, meal, source, sitId });
        if (err) throw err;
        setWeightFailed(false);
        setGrams("");
        invalidateAfterCheck(qc, birdId);
        return;
      }
      const answers = different ? answersWithChanges(changes) : allNormalAnswers();
      const r = await saveDailyCheck({ birdId, answers, notes: different && note.trim() ? note.trim() : null, grams: g, meal, source, sitId });
      track("daily_check_saved", {
        surface, result: different && Object.keys(changes).length ? "different" : "normal",
        had_weight: r.weightSaved, meal_relation: g != null ? meal : null, triage: r.triage.status, local_hour: new Date().getHours(),
      });
      if (g != null && !r.weightSaved) {
        setWeightFailed(true);
        toast.error(t("dailyCheck.weightFailed", "Weight didn't save. Try again."));
      } else {
        setGrams("");
      }
      setResult({ ...r, at: new Date().toISOString() });
      setDifferent(false);
      setChanges({});
      setNote("");
      invalidateAfterCheck(qc, birdId);
      onSaved?.(r);
    } catch (e) {
      toast.error(friendlyError(e, t("ownerScan.logFailed", "Couldn't log the health check.")));
    } finally {
      setSaving(false);
    }
  }

  const check = result ? { id: result.logId, triage_status: result.triage.status, created_at: result.at } : today?.check ?? null;
  const done = !!check && !weightFailed;

  const shell = flat ? "bg-white p-4" : "rounded-[18px] bg-white p-4 ring-1 ring-[var(--line2)]";
  const shadow = flat ? undefined : { boxShadow: "0 6px 14px -8px rgba(40,50,40,.08)" };

  if (!today && !result) {
    return <section className={`${shell} h-40 animate-pulse`} style={shadow} aria-busy="true" />;
  }

  if (done && check) {
    const weights = today?.weights ?? [];
    const latestW = weights[0];
    const status = check.triage_status;
    return (
      <section className={shell} style={shadow}>
        {showHeading && <p className="t-eyebrow text-[var(--teal-on-cream)]">{t("dailyCheck.today", "Today")}</p>}
        <div className="mt-1 flex items-center gap-2">
          <span className="grid size-6 place-items-center rounded-full bg-[var(--lime)] text-[var(--ink)]"><Check className="size-3.5" /></span>
          <p className="t-item">{t("dailyCheck.doneTitle", "Weight and health check done")}</p>
        </div>

        <div className="mt-3 divide-y divide-[var(--line2)] rounded-xl ring-1 ring-[var(--line2)]">
          <button type="button" onClick={() => navigate({ to: "/birds/$birdId/weight", params: { birdId } })} className="flex min-h-[44px] w-full items-center gap-3 px-3 py-2 text-left">
            <span className="min-w-0 flex-1 text-[14px] text-[var(--ink)]">
              {latestW
                ? [t("dailyCheck.gramsValue", "{{n}} g", { n: latestW.grams }), timeLabel(latestW.measured_at), mealText(t, latestW.meal_relation)].filter(Boolean).join(" · ")
                : t("dailyCheck.noWeightToday", "No weight today")}
            </span>
            {weights.length > 1 && <span className="t-meta">{t("dailyCheck.weighInsToday", "{{n}} today", { n: weights.length })}</span>}
          </button>
          <button type="button" onClick={() => navigate({ to: "/birds/$birdId/scans/$scanId", params: { birdId, scanId: check.id } })} className="flex min-h-[44px] w-full items-center gap-3 px-3 py-2 text-left">
            <span className="min-w-0 flex-1 text-[14px] text-[var(--ink)]">
              {t("dailyCheck.healthCheckAt", "Health check ✓ · {{time}}", { time: timeLabel(check.created_at) })}
            </span>
            <span className={`rounded-full px-[9px] py-[3px] text-[11.5px] font-[500] ${status === "green" ? "bg-[var(--pale)] text-[var(--ink)]" : "bg-[var(--amber-fill)] text-[var(--amber-ink)]"}`}>
              {status === "red" ? t("ownerScan.eyebrowRed", "Call your vet now") : status === "yellow" ? t("ownerScan.eyebrowYellow", "Keep a close eye") : t("birdRecord.allNormal", "All normal")}
            </span>
          </button>
        </div>

        {result && result.triage.status !== "green" && (
          <div className="mt-3 rounded-xl p-3 text-[13.5px] leading-relaxed" style={{ background: "var(--amber-fill)", color: "var(--amber-ink)" }}>
            {triageMessageLabel(t, result.triage.message)}
            <button type="button" onClick={() => navigate({ to: "/birds/$birdId/plan/editor", params: { birdId }, search: { tab: "emergency" } as any })} className="mt-2 block font-[500] underline">
              {t("ownerScan.emergencyContacts", "Emergency contacts")}
            </button>
          </div>
        )}

        {canWeigh && (adding
          ? <ExtraWeight birdId={birdId} name={name} lastGrams={latestW?.grams ?? today?.lastGrams ?? null} surface={surface} onDone={() => setAdding(false)} />
          : (
            <button type="button" onClick={() => setAdding(true)} className="mt-3 inline-flex min-h-[44px] items-center gap-1.5 text-[14px] font-[500] text-[var(--moss)]">
              <Plus className="size-4" /> {latestW ? t("dailyCheck.addAWeight", "Add a weight") : t("dailyCheck.addTodaysWeight", "Add today's weight")}
            </button>
          ))}
      </section>
    );
  }

  const label = saving
    ? t("birdWeight.saving", "Saving…")
    : weightFailed
      ? t("dailyCheck.retryWeight", "Save weight")
      : saveLabel ?? (hasWeight ? t("dailyCheck.saveBoth", "Save weight & health check") : t("dailyCheck.saveCheck", "Save health check"));

  return (
    <section className={shell} style={shadow}>
      {showHeading && (
        <>
          <p className="t-eyebrow text-[var(--teal-on-cream)]">{t("dailyCheck.today", "Today")}</p>
          <p className="t-item mt-0.5">{title ?? t("dailyCheck.title", "Weight and health check")}</p>
          <p className="t-meta">{t("dailyCheck.notDone", "Not done yet")}</p>
        </>
      )}

      {canWeigh && (
        <>
          <div className="mt-3">
            <label htmlFor={`dc-g-${birdId}`} className={LABEL}>{t("birdWeight.gramsLabel", "Weight (grams)")}</label>
            <input
              id={`dc-g-${birdId}`}
              className={INPUT}
              inputMode="decimal"
              value={grams}
              placeholder={hint}
              onChange={(e) => { setGrams(e.target.value.replace(/[^0-9.]/g, "")); setConfirmPct(null); }}
            />
            {weightInvalid && (
              <p className="mt-1 text-[11px] text-[var(--amber-ink)]">{t("birdWeight.range", "Enter a weight between {{min}} and {{max}} grams.", { min: MIN_WEIGHT_G, max: MAX_WEIGHT_G })}</p>
            )}
          </div>
          <div className="mt-3">
            <span className={LABEL}>{t("birdWeight.whenLabel", "When")}</span>
            <p className="text-[14px] text-[var(--ink)]">{t("dailyCheck.todayAt", "Today, {{time}}", { time: timeLabel(now) })}</p>
          </div>
          <div className="mt-3">
            <span className={LABEL}>{t("birdWeight.mealLabel", "Relative to a meal (optional)")}</span>
            <MealButtons meal={meal} setMeal={setMeal} />
          </div>
        </>
      )}

      {!weightFailed && (
        <div className="mt-4">
          <span className={LABEL}>{t("dailyCheck.healthCheck", "Health check")}</span>
          <p className="mb-2 text-[14px] text-[var(--ink)]">{t("dailyCheck.lookUsual", "Does {{name}} look like usual?", { name })}</p>
          <div role="radiogroup" aria-label={t("dailyCheck.healthCheck", "Health check")} className="grid grid-cols-2 gap-2">
            {([false, true] as const).map((isDiff) => {
              const on = different === isDiff;
              return (
                <button
                  key={String(isDiff)}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => {
                    if (isDiff && !different) track("daily_check_different_opened", { surface });
                    setDifferent(isDiff);
                    if (!isDiff) { setChanges({}); setNote(""); }
                  }}
                  className={`flex min-h-[44px] items-center gap-2 rounded-xl px-3 text-left text-sm font-[500] ${on ? "bg-[var(--pale)] text-[var(--ink)] ring-1 ring-inset ring-[var(--moss)]" : "bg-white text-[var(--ink)] ring-1 ring-inset ring-[var(--line)]"}`}
                >
                  <span className={`grid size-4 shrink-0 place-items-center rounded-full ring-1 ${on ? "ring-[var(--moss)]" : "ring-[var(--line)]"}`}>
                    {on && <span className="size-2 rounded-full bg-[var(--moss)]" />}
                  </span>
                  {isDiff ? t("dailyCheck.somethingDifferent", "Something's different") : t("dailyCheck.looksNormal", "Yes, looks normal")}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {different && !weightFailed && (
        <div className="mt-3 rounded-xl bg-[var(--cream2)] p-3">
          <p className="t-item">{t("dailyCheck.whatsDifferent", "What's different with {{name}}?", { name })}</p>
          <p className="t-meta">{t("dailyCheck.tapEverything", "Tap everything you noticed.")}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {ITEM_KEYS.map((k) => {
              const on = !!changes[k];
              return (
                <button
                  key={k}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setChanges((c) => { const n = { ...c }; if (n[k]) delete n[k]; else n[k] = "not_sure"; return n; })}
                  className={`min-h-[36px] rounded-full px-3 text-[13px] font-[500] ${on ? "bg-[var(--ink)] text-white" : "bg-white text-[var(--ink)] ring-1 ring-inset ring-[var(--line)]"}`}
                >
                  {itemLabel(t, k)}
                </button>
              );
            })}
          </div>
          {ITEM_KEYS.filter((k) => changes[k]).map((k) => (
            <div key={k} className="mt-2 flex items-center gap-2">
              <span className="flex-1 text-[13px] font-[500] text-[var(--ink)]">{itemLabel(t, k)}</span>
              <div role="radiogroup" aria-label={itemLabel(t, k)} className="flex gap-1">
                {(["not_sure", "concerning"] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    role="radio"
                    aria-checked={changes[k] === v}
                    onClick={() => setChanges((c) => ({ ...c, [k]: v }))}
                    className={`min-h-[36px] rounded-lg px-2.5 text-[12.5px] font-[500] ${changes[k] === v ? (v === "concerning" ? "bg-[var(--amber-fill)] text-[var(--amber-ink)] ring-1 ring-inset ring-[var(--amber-line)]" : "bg-[var(--ink)] text-white") : "bg-white text-[var(--ink)] ring-1 ring-inset ring-[var(--line)]"}`}
                  >
                    {v === "concerning" ? t("scanForm.answerConcerning", "Concerning") : t("scanForm.answerNotSure", "Not sure")}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <label className="mt-3 block">
            <span className={LABEL}>{t("dailyCheck.noteLabel", "Note (optional)")}</span>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="w-full rounded-xl bg-white p-2.5 text-[14px] text-[var(--ink)] outline-none ring-1 ring-[var(--line)] focus:ring-[var(--moss)]" />
          </label>
          <button type="button" onClick={() => { setDifferent(false); setChanges({}); setNote(""); }} className="mt-1 min-h-[44px] text-[13.5px] font-[500] text-[var(--mute)]">
            {t("dailyCheck.back", "Back")}
          </button>
        </div>
      )}

      {confirmPct != null && (
        <div className="mt-3 rounded-xl p-3 text-[13.5px]" style={{ background: "var(--amber-fill)", color: "var(--amber-ink)" }}>
          {confirmPct < 0
            ? t("dailyCheck.bigDrop", "That's {{pct}}% lower than last time. Save anyway?", { pct: Math.abs(confirmPct) })
            : t("dailyCheck.bigRise", "That's {{pct}}% higher than last time. Save anyway?", { pct: confirmPct })}
          <div className="mt-2 flex gap-2">
            <button type="button" onClick={() => save(true)} className="min-h-[40px] flex-1 rounded-lg bg-[var(--ink)] text-[13.5px] font-[500] text-white">{t("dailyCheck.saveAnyway", "Save anyway")}</button>
            <button type="button" onClick={() => setConfirmPct(null)} className="min-h-[40px] flex-1 rounded-lg bg-white text-[13.5px] font-[500] text-[var(--ink)] ring-1 ring-inset ring-[var(--line)]">{t("dailyCheck.fix", "Fix")}</button>
          </div>
        </div>
      )}

      {confirmPct == null && (
        <button
          type="button"
          onClick={() => save()}
          disabled={saving || weightInvalid || (weightFailed && !hasWeight)}
          className="mt-4 flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-[12px] bg-[var(--ink)] text-[15px] font-[500] text-white disabled:opacity-50"
        >
          <Check className="size-4" /> {label}
        </button>
      )}
    </section>
  );
}

/** "Add a weight" after today's check: weight, When = now, meal, save. */
function ExtraWeight({ birdId, name, lastGrams, surface, onDone }: { birdId: string; name: string; lastGrams: number | null; surface: DailyCheckSurface; onDone: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const role = useBirdRole(birdId);
  const sitId = useActiveSitIdForBird(birdId);
  const [grams, setGrams] = useState("");
  const [meal, setMeal] = useState<Meal>(null);
  const [saving, setSaving] = useState(false);
  const parsed = weightToSave(grams);
  const valid = typeof parsed === "number";

  async function save() {
    if (!valid || saving) return;
    setSaving(true);
    const err = await saveWeight({ birdId, grams: parsed as number, meal, source: role === "household" ? "household" : "owner", sitId });
    setSaving(false);
    if (err) { toast.error(friendlyError(err, t("birdWeight.saveFailed", "Couldn't save the weight."))); return; }
    track("extra_weight_added", { surface });
    toast.success(t("birdWeight.logged", "Weight logged."));
    invalidateAfterCheck(qc, birdId);
    onDone();
  }

  return (
    <div className="mt-3 rounded-xl bg-[var(--cream2)] p-3">
      <p className="t-item">{t("dailyCheck.addWeightFor", "Add a weight for {{name}}", { name })}</p>
      <div className="mt-2">
        <label htmlFor={`dc-x-${birdId}`} className={LABEL}>{t("birdWeight.gramsLabel", "Weight (grams)")}</label>
        <input id={`dc-x-${birdId}`} className={INPUT} inputMode="decimal" autoFocus value={grams} placeholder={lastGrams != null ? String(lastGrams) : ""} onChange={(e) => setGrams(e.target.value.replace(/[^0-9.]/g, ""))} />
        {parsed === undefined && <p className="mt-1 text-[11px] text-[var(--amber-ink)]">{t("birdWeight.range", "Enter a weight between {{min}} and {{max}} grams.", { min: MIN_WEIGHT_G, max: MAX_WEIGHT_G })}</p>}
      </div>
      <div className="mt-2">
        <span className={LABEL}>{t("birdWeight.mealLabel", "Relative to a meal (optional)")}</span>
        <MealButtons meal={meal} setMeal={setMeal} />
      </div>
      <div className="mt-3 flex gap-2">
        <button type="button" onClick={save} disabled={!valid || saving} className="min-h-[44px] flex-1 rounded-[12px] bg-[var(--ink)] text-sm font-[500] text-white disabled:opacity-50">
          {saving ? t("birdWeight.saving", "Saving…") : t("birdWeight.save", "Save")}
        </button>
        <button type="button" onClick={onDone} disabled={saving} className="min-h-[44px] rounded-[12px] px-4 text-sm font-[500] text-[var(--mute)] ring-1 ring-[var(--line)]">
          {t("birdWeight.cancel", "Cancel")}
        </button>
      </div>
    </div>
  );
}
