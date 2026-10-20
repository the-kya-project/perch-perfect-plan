// The daily weight & health check box. One component on the bird page, the
// one-bird Home and each section of the flock check. A normal day is: type a
// weight (optional), leave "Yes, looks normal" selected, save. The faded last
// weight in the box is a hint only; an empty box saves the health check alone.
// Visuals follow the "Daily health check" mock-ups: a lime card, white inputs,
// ink primary buttons, amber for "something's different".
import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { toast } from "sonner";
import { Check, CheckCircle2, AlertTriangle, Plus, Search } from "lucide-react";
import { useBirdRole } from "@/lib/useBirdRole";
import { useActiveSitIdForBird } from "@/components/CaregiverHome";
import { answersWithChanges, allNormalAnswers, weightToSave, bigWeightChange, MIN_WEIGHT_G, MAX_WEIGHT_G } from "@/lib/dailyLog";
import { saveDailyCheck, saveWeight, invalidateAfterCheck, type BirdToday, type Meal, type SaveResult } from "@/lib/dailyCheck";
import { SCAN_FIELDS, type ScanFieldKey } from "@/lib/triage";
import { track } from "@/lib/analytics";
import { friendlyError } from "@/lib/errorMessage";
import { triageMessageLabel } from "@/lib/triageLabels";
import { dailyCheckItemLabel } from "@/lib/dailyCheckLabels";

export type DailyCheckSurface = "bird_page" | "home_one" | "flock";

// Mock-up palette (Kya design system values used across the app's lime cards).
const C = {
  lime: "#cdeab0",
  ink: "#1a3d2e",
  moss: "#2d6a4f",
  sub: "#2b3a31",
  mute: "#5b6b61",
  line: "#e0d8c4",
  line2: "#eee6d4",
  cream: "#f4f1e8",
  amber: "#c47e1e",
  amberFill: "#f6e7c4",
  amberInk: "#854f0b",
  red: "#a32d2d",
  redFill: "#fcebeb",
  redInk: "#791f1f",
  divider: "rgba(45,106,79,0.25)",
};

const ITEM_KEYS: ScanFieldKey[] = ["alertness", "food", "droppings", "breathing", "posture", "noise", "fluffed", "vomiting", "injury", "exposure"];
const RED_KEYS = new Set(SCAN_FIELDS.filter((f) => f.redOnConcerning).map((f) => f.key));

const itemLabel = dailyCheckItemLabel;

function timeLabel(iso: string | Date): string {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }).toLowerCase();
}

const LABEL = "mb-1 block text-[12px] font-[500]";
const EYEBROW = "text-[11px] font-[500] uppercase tracking-[0.13em]";
const inputStyle = { boxShadow: `inset 0 0 0 1px ${C.line}`, color: C.ink };
const INPUT = "box-border h-11 w-full rounded-[12px] border-0 bg-white px-3 text-[18px] font-[500] outline-none placeholder:font-[400] placeholder:text-[#9a9684] focus:shadow-[inset_0_0_0_2px_#2d6a4f]";

function MealButtons({ meal, setMeal, labelId }: { meal: Meal; setMeal: (m: Meal) => void; labelId: string }) {
  const { t } = useTranslation();
  return (
    <div role="radiogroup" aria-labelledby={labelId} className="grid grid-cols-2 gap-2">
      {(["before_meal", "after_meal"] as const).map((m) => {
        const on = meal === m;
        return (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => setMeal(on ? null : m)}
            className="min-h-[44px] rounded-[12px] border-0 text-[14px] font-[500]"
            style={on ? { background: C.ink, color: "#fff" } : { background: "#fff", color: C.ink, boxShadow: `inset 0 0 0 1px ${C.line}` }}
          >
            {m === "before_meal" ? t("birdWeight.beforeMeal", "Before meal") : t("birdWeight.afterMeal", "After meal")}
          </button>
        );
      })}
    </div>
  );
}

function mealText(t: TFunction, m: string | null): string | null {
  return m === "before_meal" ? t("dailyCheck.beforeMealLower", "before meal") : m === "after_meal" ? t("dailyCheck.afterMealLower", "after meal") : null;
}

function PrimaryBtn({ children, onClick, disabled, tall = true, className = "" }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; tall?: boolean; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex w-full items-center justify-center rounded-[12px] border-0 text-[15px] font-[500] text-white disabled:opacity-50 ${tall ? "min-h-[50px]" : "min-h-[46px]"} ${className}`}
      style={{ background: C.ink }}
    >
      {children}
    </button>
  );
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
  /** Inside another lime card (the flock check): no card surface of its own. */
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
  const anyConcerning = Object.values(changes).some((v) => v === "concerning");

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

  // The lime card surface (bird page, Home); the flock check supplies its own.
  // A plain function, not a component, so inputs keep focus across renders.
  const shell = (children: React.ReactNode, busy?: boolean) =>
    flat
      ? <div className="flex flex-col gap-3" style={{ color: C.ink }}>{children}</div>
      : (
        <section
          aria-busy={busy || undefined}
          className="flex flex-col gap-3 rounded-[18px] px-[18px] py-4"
          style={{ background: C.lime, color: C.ink, boxShadow: "0 8px 20px -12px rgba(45,106,79,.45)" }}
        >
          {children}
        </section>
      );

  if (!today && !result) {
    return shell(<div className="h-36 animate-pulse rounded-[12px] bg-white/40" />, true);
  }

  // ---------------------------------------------------------------- done
  if (done && check) {
    const weights = today?.weights ?? [];
    const latestW = weights[0];
    const status = check.triage_status;
    const good = status === "green";
    return shell(
      <>
        <div>
          {showHeading && (
            <p className={EYEBROW} style={{ color: C.moss }}>
              {latestW ? t("dailyCheck.todayAtEyebrow", "Today · {{time}}", { time: timeLabel(latestW.measured_at) }) : t("dailyCheck.today", "Today")}
            </p>
          )}
          {latestW ? (
            <>
              <p className="mt-0.5 text-[30px] font-[400] leading-none tracking-[-0.015em]">
                {latestW.grams}<span className="text-[16px]" style={{ color: C.moss }}> g</span>
              </p>
              {(mealText(t, latestW.meal_relation) || weights.length > 1) && (
                <p className="mt-1.5 text-[11.5px]" style={{ color: C.mute }}>
                  {[mealText(t, latestW.meal_relation), weights.length > 1 ? t("dailyCheck.weighInsToday", "{{n}} today", { n: weights.length }) : null].filter(Boolean).join(" · ")}
                </p>
              )}
            </>
          ) : (
            <p className="mt-0.5 text-[16px] font-[500]">{t("dailyCheck.noWeightToday", "No weight today")}</p>
          )}
        </div>

        <button
          type="button"
          onClick={() => navigate({ to: "/birds/$birdId/scans/$scanId", params: { birdId, scanId: check.id } })}
          className="flex w-full items-center gap-3 rounded-[12px] border-0 bg-white px-3 py-2.5 text-left"
        >
          <span className="grid size-8 shrink-0 place-items-center rounded-[10px]" style={good ? { background: "#e8f0ec", color: C.moss } : { background: C.amberFill, color: C.amberInk }}>
            {good ? <CheckCircle2 className="size-[18px]" /> : <AlertTriangle className="size-[18px]" />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[14px] font-[500]">
              {status === "red" ? t("dailyCheck.resultRed", "Health check: call your vet")
                : status === "yellow" ? t("dailyCheck.resultYellow", "Health check: something to check")
                : t("dailyCheck.resultGreen", "Health check: all normal")}
            </span>
            <span className="mt-px block text-[11.5px]" style={{ color: "#8a8270" }}>{t("dailyCheck.checkedAt", "Checked {{time}}", { time: timeLabel(check.created_at) })}</span>
          </span>
        </button>

        {result && result.triage.status !== "green" && (
          <div className="rounded-[12px] px-3 py-2.5 text-[12.5px] leading-[1.45]" style={result.triage.status === "red" ? { background: C.redFill, color: C.redInk } : { background: C.amberFill, color: C.amberInk }}>
            {triageMessageLabel(t, result.triage.message)}
            <button type="button" onClick={() => navigate({ to: "/birds/$birdId/plan/editor", params: { birdId }, search: { tab: "emergency" } as any })} className="mt-1.5 block font-[500] underline">
              {t("ownerScan.emergencyContacts", "Emergency contacts")}
            </button>
          </div>
        )}

        {canWeigh && adding && (
          <ExtraWeight birdId={birdId} name={name} lastGrams={latestW?.grams ?? today?.lastGrams ?? null} surface={surface} onDone={() => setAdding(false)} />
        )}
        {canWeigh && !adding && (
          <div className="flex items-center justify-between">
            <button type="button" onClick={() => setAdding(true)} className="inline-flex min-h-[36px] items-center gap-1.5 rounded-full border-0 px-3 text-[12.5px] font-[500]" style={{ background: C.ink, color: C.lime }}>
              <Plus className="size-3.5" strokeWidth={2.4} /> {latestW ? t("dailyCheck.addAnotherWeight", "Add another weight") : t("dailyCheck.addTodaysWeight", "Add today's weight")}
            </button>
            <button type="button" onClick={() => navigate({ to: "/birds/$birdId/weight", params: { birdId } })} className="min-h-[36px] text-[13px] font-[500]" style={{ color: C.ink }}>
              {t("dailyCheck.weightChart", "Weight chart →")}
            </button>
          </div>
        )}
      </>,
    );
  }

  // ---------------------------------------------------------------- form
  const label = saving
    ? t("birdWeight.saving", "Saving…")
    : weightFailed
      ? t("dailyCheck.retryWeight", "Save weight")
      : saveLabel ?? (hasWeight ? t("dailyCheck.saveBoth", "Save weight & health check") : t("dailyCheck.saveCheck", "Save health check"));
  const mealId = `dc-meal-${birdId}`;

  const confirm = confirmPct != null && (
    <div className="rounded-[12px] px-3 py-2.5 text-[13px]" style={{ background: C.amberFill, color: C.amberInk }}>
      {confirmPct < 0
        ? t("dailyCheck.bigDrop", "That's {{pct}}% lower than last time. Save anyway?", { pct: Math.abs(confirmPct) })
        : t("dailyCheck.bigRise", "That's {{pct}}% higher than last time. Save anyway?", { pct: confirmPct })}
      <div className="mt-2 flex gap-2">
        <button type="button" onClick={() => save(true)} className="min-h-[40px] flex-1 rounded-[10px] border-0 text-[13.5px] font-[500] text-white" style={{ background: C.ink }}>{t("dailyCheck.saveAnyway", "Save anyway")}</button>
        <button type="button" onClick={() => setConfirmPct(null)} className="min-h-[40px] flex-1 rounded-[10px] border-0 bg-white text-[13.5px] font-[500]" style={{ color: C.ink, boxShadow: `inset 0 0 0 1px ${C.line}` }}>{t("dailyCheck.fix", "Fix")}</button>
      </div>
    </div>
  );

  return shell(
    <>
      {showHeading && (
        <div className="flex items-start gap-2.5">
          <div className="min-w-0 flex-1">
            <p className={EYEBROW} style={{ color: C.moss }}>{t("dailyCheck.today", "Today")}</p>
            <h2 className="mt-0.5 text-[16px] font-[500]">{title ?? t("dailyCheck.title", "Weight and health check")}</h2>
          </div>
          <span className="shrink-0 rounded-full px-[9px] py-[3px] text-[11.5px] font-[500]" style={{ background: C.amberFill, color: C.amberInk }}>{t("dailyCheck.notDone", "Not done yet")}</span>
        </div>
      )}

      {canWeigh && (
        <div className="flex flex-col gap-3">
          <div>
            <label htmlFor={`dc-g-${birdId}`} className={LABEL} style={{ color: C.sub }}>{t("birdWeight.gramsLabel", "Weight (grams)")}</label>
            <input
              id={`dc-g-${birdId}`}
              className={INPUT}
              style={inputStyle}
              inputMode="decimal"
              value={grams}
              placeholder={hint}
              onChange={(e) => { setGrams(e.target.value.replace(/[^0-9.]/g, "")); setConfirmPct(null); }}
            />
            {weightInvalid && (
              <p className="mt-1 text-[11px]" style={{ color: C.amberInk }}>{t("birdWeight.range", "Enter a weight between {{min}} and {{max}} grams.", { min: MIN_WEIGHT_G, max: MAX_WEIGHT_G })}</p>
            )}
          </div>
          <div>
            <span className={LABEL} style={{ color: C.sub }}>{t("birdWeight.whenLabel", "When")}</span>
            <p className="text-[14px]">{t("dailyCheck.todayAt", "Today, {{time}}", { time: timeLabel(now) })}</p>
          </div>
          <div>
            <span id={mealId} className={LABEL} style={{ color: C.sub }}>{t("birdWeight.mealLabel", "Relative to a meal (optional)")}</span>
            <MealButtons meal={meal} setMeal={setMeal} labelId={mealId} />
          </div>
        </div>
      )}

      {!weightFailed && (
        <>
          {canWeigh && <div className="h-px" style={{ background: C.divider }} />}
          <div className="flex flex-col gap-2">
            <span className={EYEBROW} style={{ color: C.moss }}>{t("dailyCheck.healthCheck", "Health check")}</span>
            <span className="text-[16px] font-[500]">{t("dailyCheck.lookUsual", "Does {{name}} look like usual?", { name })}</span>

            {!different ? (
              <>
                <span className="text-[12px] leading-[1.45]" style={{ color: C.sub }}>{t("dailyCheck.usualHelp", "Alert, eating, normal droppings, breathing easy, perching well.")}</span>
                <div role="radiogroup" aria-label={t("dailyCheck.lookUsual", "Does {{name}} look like usual?", { name })} className="mt-0.5 grid grid-cols-2 gap-1.5">
                  <button type="button" role="radio" aria-checked="true" className="flex min-h-[46px] items-center justify-center gap-1.5 rounded-[12px] border-0 bg-white text-[14px] font-[500]" style={{ color: C.ink, boxShadow: `inset 0 0 0 2px ${C.ink}` }}>
                    <Check className="size-[15px]" strokeWidth={2.6} /> {t("dailyCheck.looksNormal", "Yes, looks normal")}
                  </button>
                  <button
                    type="button"
                    role="radio"
                    aria-checked="false"
                    onClick={() => { track("daily_check_different_opened", { surface }); setDifferent(true); setConfirmPct(null); }}
                    className="flex min-h-[46px] items-center justify-center rounded-[12px] border-0 text-[14px] font-[500]"
                    style={{ background: "rgba(255,255,255,0.55)", color: C.sub }}
                  >
                    {t("dailyCheck.somethingDifferent", "Something's different")}
                  </button>
                </div>
                {confirm}
                {confirmPct == null && <PrimaryBtn onClick={() => save()} disabled={saving || weightInvalid}>{label}</PrimaryBtn>}
              </>
            ) : (
              <div className="mt-1 flex flex-col gap-3 rounded-[18px] bg-white p-4" style={{ boxShadow: "0 6px 16px -10px rgba(26,61,46,.35)" }}>
                <div className="flex items-center gap-2.5">
                  <span className="grid size-[34px] shrink-0 place-items-center rounded-[11px]" style={{ background: C.amberFill, color: C.amberInk }}><Search className="size-[18px]" /></span>
                  <span>
                    <span className="block text-[16px] font-[500]">{t("dailyCheck.whatsDifferent", "What's different with {{name}}?", { name })}</span>
                    <span className="block text-[12px]" style={{ color: C.mute }}>{t("dailyCheck.tapEverything", "Tap everything you noticed.")}</span>
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {ITEM_KEYS.map((k) => {
                    const on = !!changes[k];
                    return (
                      <button
                        key={k}
                        type="button"
                        aria-pressed={on}
                        onClick={() => setChanges((c) => { const n = { ...c }; if (n[k]) delete n[k]; else n[k] = "not_sure"; return n; })}
                        className="min-h-[36px] rounded-full border-0 px-3 text-[12.5px] font-[500]"
                        style={on ? { background: C.amber, color: "#fff" } : { background: C.cream, color: C.sub, boxShadow: `inset 0 0 0 1px ${C.line}` }}
                      >
                        {itemLabel(t, k)}
                      </button>
                    );
                  })}
                </div>
                {ITEM_KEYS.filter((k) => changes[k]).map((k) => (
                  <div key={k} className="flex items-center gap-2 pt-2" style={{ borderTop: `1px solid ${C.line2}` }}>
                    <span className="flex-1 text-[13px] font-[500]">{itemLabel(t, k)}</span>
                    <div role="radiogroup" aria-label={itemLabel(t, k)} className="flex gap-1">
                      {(["not_sure", "concerning"] as const).map((v) => {
                        const on = changes[k] === v;
                        const onStyle = v === "concerning" ? { background: C.red, color: "#fff" } : { background: C.amber, color: "#fff" };
                        return (
                          <button
                            key={v}
                            type="button"
                            role="radio"
                            aria-checked={on}
                            onClick={() => setChanges((c) => ({ ...c, [k]: v }))}
                            className="min-h-[34px] rounded-[9px] border-0 px-2.5 text-[12px] font-[500]"
                            style={on ? onStyle : { background: C.cream, color: C.sub, boxShadow: `inset 0 0 0 1px ${C.line}` }}
                          >
                            {v === "concerning" ? t("scanForm.answerConcerning", "Concerning") : t("scanForm.answerNotSure", "Not sure")}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
                {anyConcerning && (
                  <p className="rounded-[12px] px-3 py-2.5 text-[12.5px] leading-[1.45]" style={{ background: C.redFill, color: C.redInk }}>
                    <b className="font-[500]">{t("dailyCheck.concerningTitle", "Concerning signs.")}</b>{" "}
                    {[...Object.entries(changes)].some(([k, v]) => v === "concerning" && RED_KEYS.has(k as ScanFieldKey))
                      ? t("dailyCheck.concerningRed", "Call your avian vet today. We'll keep this flagged on {{name}}'s page.", { name })
                      : t("dailyCheck.concerningWatch", "Keep a close eye, and call your avian vet if it continues. We'll keep this flagged on {{name}}'s page.", { name })}
                  </p>
                )}
                <label className="flex flex-col gap-1 text-[12px]" style={{ color: C.mute }}>
                  {t("dailyCheck.noteLabel", "Note (optional)")}
                  <input
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder={t("dailyCheck.notePlaceholder", "What did you notice?")}
                    className="min-h-[40px] rounded-[10px] bg-white px-2.5 text-[16px] outline-none"
                    style={{ border: `1px solid ${C.line}`, color: C.ink }}
                  />
                </label>
                {confirm}
                {confirmPct == null && (
                  <div className="flex gap-2">
                    <button type="button" onClick={() => { setDifferent(false); setChanges({}); setNote(""); }} className="min-h-[46px] rounded-[12px] border-0 bg-transparent px-3.5 text-[14px] font-[500]" style={{ color: C.ink }}>
                      {t("dailyCheck.back", "Back")}
                    </button>
                    <PrimaryBtn onClick={() => save()} disabled={saving || weightInvalid} tall={false} className="flex-1">{label}</PrimaryBtn>
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {weightFailed && <PrimaryBtn onClick={() => save()} disabled={saving || !hasWeight}>{label}</PrimaryBtn>}
    </>,
  );
}

/** "Add another weight" after today's check: weight, When = now, meal, save. */
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
  const mealId = `dc-xmeal-${birdId}`;

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
    <div className="flex flex-col gap-3 rounded-[18px] bg-white p-4" style={{ color: C.ink, boxShadow: "0 6px 16px -10px rgba(26,61,46,.35)" }}>
      <p className="text-[16px] font-[500]">{t("dailyCheck.addWeightFor", "Add a weight for {{name}}", { name })}</p>
      <div>
        <label htmlFor={`dc-x-${birdId}`} className={LABEL} style={{ color: C.mute }}>{t("birdWeight.gramsLabel", "Weight (grams)")}</label>
        <input id={`dc-x-${birdId}`} className={INPUT} style={inputStyle} inputMode="decimal" autoFocus value={grams} placeholder={lastGrams != null ? String(lastGrams) : ""} onChange={(e) => setGrams(e.target.value.replace(/[^0-9.]/g, ""))} />
        {parsed === undefined && <p className="mt-1 text-[11px]" style={{ color: C.amberInk }}>{t("birdWeight.range", "Enter a weight between {{min}} and {{max}} grams.", { min: MIN_WEIGHT_G, max: MAX_WEIGHT_G })}</p>}
      </div>
      <div>
        <span className={LABEL} style={{ color: C.mute }}>{t("birdWeight.whenLabel", "When")}</span>
        <p className="text-[14px]">{t("dailyCheck.todayAt", "Today, {{time}}", { time: timeLabel(new Date()) })}</p>
      </div>
      <div>
        <span id={mealId} className={LABEL} style={{ color: C.mute }}>{t("birdWeight.mealLabel", "Relative to a meal (optional)")}</span>
        <MealButtons meal={meal} setMeal={setMeal} labelId={mealId} />
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={onDone} disabled={saving} className="min-h-[46px] rounded-[12px] border-0 bg-transparent px-3.5 text-[14px] font-[500]" style={{ color: C.ink }}>
          {t("birdWeight.cancel", "Cancel")}
        </button>
        <PrimaryBtn onClick={save} disabled={!valid || saving} tall={false} className="flex-1">
          {saving ? t("birdWeight.saving", "Saving…") : t("dailyCheck.saveWeight", "Save weight")}
        </PrimaryBtn>
      </div>
    </div>
  );
}
