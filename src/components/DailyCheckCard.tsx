// The daily weight & health check box. One component on the bird page, the
// one-bird Home and each section of the flock check. A normal day is: type a
// weight (optional), leave "Yes, looks normal" selected, save. The faded last
// weight in the box is a hint only; an empty box saves the health check alone.
// Visuals follow the Kya system: a lime card, white `kya-input` fields,
// check-chip choices (white with a border, forest when on), one sunflower
// save button, white secondary buttons, amber for "something's different".
import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { toast } from "sonner";
import { Check, CheckCircle2, AlertTriangle, Plus, Search } from "lucide-react";
import { K, SERIF, KyaHeading, KyaLabel, KyaLink, KyaSecondaryButton, KyaTag } from "@/components/kya";
import { CheckChip } from "@/components/setup/controls";
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

// Kya palette, plus the red message fill and the check-chip border.
const C = {
  lime: K.lime,
  ink: K.forest,
  moss: K.moss,
  sub: K.ink,
  mute: K.quiet,
  chipLine: "#c9d6c9",
  line2: K.line,
  amberFill: K.amberBg,
  amberInk: K.amberText,
  red: K.red,
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

/** A pick-one choice in the check-chip look (white with a border, forest
 *  when on; `amber` fills it amber instead, for "Concerning"). */
function RadioChip({ on, onClick, children, amber = false, className = "" }: { on: boolean; onClick: () => void; children: React.ReactNode; amber?: boolean; className?: string }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      onClick={onClick}
      className={`inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-full border-2 px-4 text-[15px] ${on ? "font-[700]" : "font-[500]"} ${className}`}
      style={on ? (amber ? { background: C.amberFill, borderColor: C.amberInk, color: C.amberInk } : { background: C.ink, borderColor: C.ink, color: "#fff" }) : { background: "#fff", borderColor: C.chipLine, color: C.ink }}
    >
      {on && <Check className="size-4 shrink-0" strokeWidth={3} aria-hidden="true" />}
      {children}
    </button>
  );
}

function MealButtons({ meal, setMeal, labelId }: { meal: Meal; setMeal: (m: Meal) => void; labelId: string }) {
  const { t } = useTranslation();
  return (
    <div role="radiogroup" aria-labelledby={labelId} className="grid grid-cols-2 gap-2">
      {(["before_meal", "after_meal"] as const).map((m) => {
        const on = meal === m;
        return (
          <RadioChip key={m} on={on} onClick={() => setMeal(on ? null : m)} className="px-2">
            {m === "before_meal" ? t("birdWeight.beforeMeal", "Before meal") : t("birdWeight.afterMeal", "After meal")}
          </RadioChip>
        );
      })}
    </div>
  );
}

function mealText(t: TFunction, m: string | null): string | null {
  return m === "before_meal" ? t("dailyCheck.beforeMealLower", "before meal") : m === "after_meal" ? t("dailyCheck.afterMealLower", "after meal") : null;
}

/** Save. Sunflower, unless the screen's main button is elsewhere (the flock
 *  check's "Check [bird] next"), then white secondary. */
function PrimaryBtn({ children, onClick, disabled, tall = true, secondary = false, className = "" }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; tall?: boolean; secondary?: boolean; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex w-full items-center justify-center rounded-full border-2 px-4 font-[700] disabled:opacity-45 ${secondary ? "text-[15px]" : "text-[16px]"} ${tall && !secondary ? "min-h-[52px]" : "min-h-[48px]"} ${className}`}
      style={{ background: secondary ? "#fff" : K.sunflower, borderColor: C.ink, color: C.ink }}
    >
      {children}
    </button>
  );
}

export function DailyCheckCard({
  birdId, name, today, surface, saveLabel, onSaved, canWeigh = true, showHeading = true, title, flat = false, saveSecondary = false, onDirtyChange,
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
  /** Save buttons are white secondary: the screen's main button is elsewhere
   *  (the flock check's pinned "Check [bird] next"). Home and the bird page
   *  leave this off, so Save stays sunflower there. */
  saveSecondary?: boolean;
  /** Told whether the card holds input that isn't saved yet (a typed weight,
   *  or "Something's different" with items or a note), so the flock check
   *  never moves on and drops it. */
  onDirtyChange?: (dirty: boolean) => void;
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
  const dirty = grams.trim() !== "" || (different && (Object.keys(changes).length > 0 || note.trim() !== ""));
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);
  const concerningRed = Object.entries(changes).some(([k, v]) => v === "concerning" && RED_KEYS.has(k as ScanFieldKey));

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
          className="flex flex-col gap-3.5 rounded-[20px] px-[18px] py-4"
          style={{ background: C.lime, color: C.ink }}
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
            <p className="m-0 text-[13px] font-[700]" style={{ color: C.moss }}>
              {latestW ? t("dailyCheck.todayAtEyebrow", "Today · {{time}}", { time: timeLabel(latestW.measured_at) }) : t("dailyCheck.today", "Today")}
            </p>
          )}
          {latestW ? (
            <>
              <p className="m-0 mt-1 text-[30px] font-[700] leading-none" style={{ fontFamily: SERIF }}>
                {latestW.grams}<span className="text-[16px] font-[500]" style={{ color: C.moss, fontFamily: "inherit" }}> g</span>
              </p>
              {(mealText(t, latestW.meal_relation) || weights.length > 1) && (
                <p className="m-0 mt-1.5 text-[13px]" style={{ color: C.mute }}>
                  {[mealText(t, latestW.meal_relation), weights.length > 1 ? t("dailyCheck.weighInsToday", "{{n}} today", { n: weights.length }) : null].filter(Boolean).join(" · ")}
                </p>
              )}
            </>
          ) : (
            <p className="m-0 mt-0.5 text-[16px] font-[700]">{t("dailyCheck.noWeightToday", "No weight today")}</p>
          )}
        </div>

        <button
          type="button"
          onClick={() => navigate({ to: "/birds/$birdId/scans/$scanId", params: { birdId, scanId: check.id } })}
          className="flex min-h-[60px] w-full items-center gap-3 rounded-[16px] border-0 bg-white px-3.5 py-2.5 text-left"
          style={{ color: C.ink }}
        >
          <span className="grid size-10 shrink-0 place-items-center rounded-[12px]" style={good ? { background: C.ink, color: C.lime } : { background: C.amberFill, color: C.amberInk }} aria-hidden="true">
            {good ? <CheckCircle2 className="size-[18px]" /> : <AlertTriangle className="size-[18px]" />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-[700]">
              {status === "red" ? t("dailyCheck.resultRed", "Health check: call your vet")
                : status === "yellow" ? t("dailyCheck.resultYellow", "Health check: something to check")
                : t("dailyCheck.resultGreen", "Health check: all normal")}
            </span>
            <span className="mt-0.5 block text-[13px]" style={{ color: C.mute }}>{t("dailyCheck.checkedAt", "Checked {{time}}", { time: timeLabel(check.created_at) })}</span>
          </span>
        </button>

        {result && result.triage.status !== "green" && (
          <div className="rounded-[14px] px-3.5 py-3 text-[14px] leading-[1.45]" style={result.triage.status === "red" ? { background: C.redFill, color: C.redInk } : { background: C.amberFill, color: C.amberInk }}>
            {triageMessageLabel(t, result.triage.message)}
            <button type="button" onClick={() => navigate({ to: "/birds/$birdId/emergency", params: { birdId } })} className="mt-1 flex min-h-[44px] items-center font-[700] underline">
              {t("ownerScan.emergencyContacts", "Emergency contacts")}
            </button>
          </div>
        )}

        {canWeigh && adding && (
          <ExtraWeight secondary={saveSecondary} birdId={birdId} name={name} lastGrams={latestW?.grams ?? today?.lastGrams ?? null} surface={surface} onDone={() => setAdding(false)} />
        )}
        {canWeigh && !adding && (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <KyaSecondaryButton onClick={() => setAdding(true)} icon={<Plus className="size-4" strokeWidth={2.4} />}>
              {latestW ? t("dailyCheck.addAnotherWeight", "Add another weight") : t("dailyCheck.addTodaysWeight", "Add today's weight")}
            </KyaSecondaryButton>
            <KyaLink onClick={() => navigate({ to: "/birds/$birdId/weight", params: { birdId } })} color={C.ink}>
              {t("dailyCheck.weightChart", "Weight chart →")}
            </KyaLink>
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
    <div className="rounded-[14px] px-3.5 py-3 text-[14px] leading-[1.45]" style={{ background: C.amberFill, color: C.amberInk }}>
      {confirmPct < 0
        ? t("dailyCheck.bigDrop", "That's {{pct}}% lower than last time. Save anyway?", { pct: Math.abs(confirmPct) })
        : t("dailyCheck.bigRise", "That's {{pct}}% higher than last time. Save anyway?", { pct: confirmPct })}
      <div className="mt-2 flex gap-2">
        <KyaSecondaryButton onClick={() => save(true)} className="flex-1">{t("dailyCheck.saveAnyway", "Save anyway")}</KyaSecondaryButton>
        <KyaSecondaryButton onClick={() => setConfirmPct(null)} className="flex-1">{t("dailyCheck.fix", "Fix")}</KyaSecondaryButton>
      </div>
    </div>
  );

  return shell(
    <>
      {showHeading && (
        <div className="flex items-start gap-2.5">
          <div className="min-w-0 flex-1">
            <KyaHeading size={21}>{title ?? t("dailyCheck.title", "Weight and health check")}</KyaHeading>
          </div>
          <KyaTag tone="amber">{t("dailyCheck.notDone", "Not done yet")}</KyaTag>
        </div>
      )}

      {canWeigh && (
        <div className="flex flex-col gap-3">
          <div>
            <div className="mb-1.5"><KyaLabel htmlFor={`dc-g-${birdId}`}>{t("birdWeight.gramsLabel", "Weight (grams)")}</KyaLabel></div>
            <input
              id={`dc-g-${birdId}`}
              className="kya-input"
              inputMode="decimal"
              value={grams}
              placeholder={hint}
              onChange={(e) => { setGrams(e.target.value.replace(/[^0-9.]/g, "")); setConfirmPct(null); }}
            />
            {weightInvalid && (
              <p className="m-0 mt-1.5 px-1 text-[13px]" style={{ color: C.amberInk }}>{t("birdWeight.range", "Enter a weight between {{min}} and {{max}} grams.", { min: MIN_WEIGHT_G, max: MAX_WEIGHT_G })}</p>
            )}
          </div>
          <div>
            <KyaLabel as="span">{t("birdWeight.whenLabel", "When")}</KyaLabel>
            <p className="m-0 mt-1 text-[15px]" style={{ color: C.sub }}>{t("dailyCheck.todayAt", "Today, {{time}}", { time: timeLabel(now) })}</p>
          </div>
          <div>
            <div className="mb-1.5"><span id={mealId}><KyaLabel as="span">{t("birdWeight.mealLabel", "Relative to a meal (optional)")}</KyaLabel></span></div>
            <MealButtons meal={meal} setMeal={setMeal} labelId={mealId} />
          </div>
        </div>
      )}

      {!weightFailed && (
        <>
          {canWeigh && <div className="h-px" style={{ background: C.divider }} />}
          <div className="flex flex-col gap-2">
            <span className="text-[17px] font-[700]">{t("dailyCheck.lookUsual", "Does {{name}} look like usual?", { name })}</span>

            {!different ? (
              <>
                <span className="text-[14px] leading-[1.45]" style={{ color: C.sub }}>{t("dailyCheck.usualHelp", "Alert, eating, normal droppings, breathing easy, perching well.")}</span>
                <div role="radiogroup" aria-label={t("dailyCheck.lookUsual", "Does {{name}} look like usual?", { name })} className="mt-0.5 grid grid-cols-2 gap-2">
                  <RadioChip on onClick={() => {}} className="px-2">{t("dailyCheck.looksNormal", "Yes, looks normal")}</RadioChip>
                  <RadioChip
                    on={false}
                    onClick={() => { track("daily_check_different_opened", { surface }); setDifferent(true); setConfirmPct(null); }}
                    className="px-2"
                  >
                    {t("dailyCheck.somethingDifferent", "Something's different")}
                  </RadioChip>
                </div>
                {confirm}
                {confirmPct == null && <PrimaryBtn onClick={() => save()} disabled={saving || weightInvalid} secondary={saveSecondary}>{label}</PrimaryBtn>}
              </>
            ) : (
              <div className="mt-1 flex flex-col gap-3 rounded-[18px] bg-white p-4">
                <div className="flex items-center gap-2.5">
                  <span className="grid size-10 shrink-0 place-items-center rounded-[12px]" style={{ background: C.amberFill, color: C.amberInk }} aria-hidden="true"><Search className="size-[18px]" /></span>
                  <span>
                    <span className="block text-[16px] font-[700]">{t("dailyCheck.whatsDifferent", "What's different with {{name}}?", { name })}</span>
                    <span className="block text-[13px]" style={{ color: C.mute }}>{t("dailyCheck.tapEverything", "Tap everything you noticed.")}</span>
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {ITEM_KEYS.map((k) => (
                    <CheckChip
                      key={k}
                      on={!!changes[k]}
                      onClick={() => setChanges((c) => { const n = { ...c }; if (n[k]) delete n[k]; else n[k] = "not_sure"; return n; })}
                    >
                      {itemLabel(t, k)}
                    </CheckChip>
                  ))}
                </div>
                {ITEM_KEYS.filter((k) => changes[k]).map((k) => (
                  <div key={k} className="flex flex-wrap items-center gap-2 pt-2.5" style={{ borderTop: `1px solid ${C.line2}` }}>
                    <span className="min-w-0 flex-1 text-[15px] font-[700]">{itemLabel(t, k)}</span>
                    <div role="radiogroup" aria-label={itemLabel(t, k)} className="flex gap-1.5">
                      {(["not_sure", "concerning"] as const).map((v) => (
                        <RadioChip
                          key={v}
                          on={changes[k] === v}
                          amber={v === "concerning"}
                          onClick={() => setChanges((c) => ({ ...c, [k]: v }))}
                          className="px-3 text-[14px]"
                        >
                          {v === "concerning" ? t("scanForm.answerConcerning", "Concerning") : t("scanForm.answerNotSure", "Not sure")}
                        </RadioChip>
                      ))}
                    </div>
                  </div>
                ))}
                {anyConcerning && (
                  // Amber, like the answer; red only when it's a call-the-vet-today sign.
                  <p className="m-0 rounded-[14px] px-3.5 py-3 text-[14px] leading-[1.45]" style={concerningRed ? { background: C.redFill, color: C.redInk } : { background: C.amberFill, color: C.amberInk }}>
                    <b className="block font-[700]">{t("dailyCheck.concerningSigns", "Concerning signs")}</b>
                    {concerningRed
                      ? t("dailyCheck.concerningRed", "Call your avian vet today. We'll keep this flagged on {{name}}'s page.", { name })
                      : t("dailyCheck.concerningWatch", "Keep a close eye, and call your avian vet if it continues. We'll keep this flagged on {{name}}'s page.", { name })}
                  </p>
                )}
                <div className="flex flex-col gap-1.5">
                  <KyaLabel htmlFor={`dc-note-${birdId}`}>{t("dailyCheck.noteLabel", "Note (optional)")}</KyaLabel>
                  <input
                    id={`dc-note-${birdId}`}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder={t("dailyCheck.notePlaceholder", "What did you notice?")}
                    className="kya-input"
                  />
                </div>
                {confirm}
                {confirmPct == null && (
                  <div className="flex gap-2">
                    <KyaLink onClick={() => { setDifferent(false); setChanges({}); setNote(""); }} className="shrink-0 px-2">
                      {t("dailyCheck.back", "Back")}
                    </KyaLink>
                    <PrimaryBtn onClick={() => save()} disabled={saving || weightInvalid} tall={false} secondary={saveSecondary} className="flex-1">{label}</PrimaryBtn>
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {weightFailed && <PrimaryBtn onClick={() => save()} disabled={saving || !hasWeight} secondary={saveSecondary}>{label}</PrimaryBtn>}
    </>,
  );
}

/** "Add another weight" after today's check: weight, When = now, meal, save. */
function ExtraWeight({ birdId, name, lastGrams, surface, onDone, secondary = false }: { secondary?: boolean; birdId: string; name: string; lastGrams: number | null; surface: DailyCheckSurface; onDone: () => void }) {
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
    <div className="flex flex-col gap-3 rounded-[18px] bg-white p-4" style={{ color: C.ink }}>
      <p className="m-0 text-[16px] font-[700]">{t("dailyCheck.addWeightFor", "Add a weight for {{name}}", { name })}</p>
      <div>
        <div className="mb-1.5"><KyaLabel htmlFor={`dc-x-${birdId}`}>{t("birdWeight.gramsLabel", "Weight (grams)")}</KyaLabel></div>
        <input id={`dc-x-${birdId}`} className="kya-input" inputMode="decimal" autoFocus value={grams} placeholder={lastGrams != null ? String(lastGrams) : ""} onChange={(e) => setGrams(e.target.value.replace(/[^0-9.]/g, ""))} />
        {parsed === undefined && <p className="m-0 mt-1.5 px-1 text-[13px]" style={{ color: C.amberInk }}>{t("birdWeight.range", "Enter a weight between {{min}} and {{max}} grams.", { min: MIN_WEIGHT_G, max: MAX_WEIGHT_G })}</p>}
      </div>
      <div>
        <KyaLabel as="span">{t("birdWeight.whenLabel", "When")}</KyaLabel>
        <p className="m-0 mt-1 text-[15px]" style={{ color: C.sub }}>{t("dailyCheck.todayAt", "Today, {{time}}", { time: timeLabel(new Date()) })}</p>
      </div>
      <div>
        <div className="mb-1.5"><span id={mealId}><KyaLabel as="span">{t("birdWeight.mealLabel", "Relative to a meal (optional)")}</KyaLabel></span></div>
        <MealButtons meal={meal} setMeal={setMeal} labelId={mealId} />
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={onDone} disabled={saving} className="min-h-[48px] shrink-0 border-0 bg-transparent px-3 text-[15px] font-[700] disabled:opacity-45" style={{ color: C.moss }}>
          {t("birdWeight.cancel", "Cancel")}
        </button>
        <PrimaryBtn onClick={save} disabled={!valid || saving} tall={false} secondary={secondary} className="flex-1">
          {saving ? t("birdWeight.saving", "Saving…") : t("dailyCheck.saveWeight", "Save weight")}
        </PrimaryBtn>
      </div>
    </div>
  );
}
