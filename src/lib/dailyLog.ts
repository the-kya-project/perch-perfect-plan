// One shape for a health check row, whoever writes it: the full owner scan, the
// daily weight & health check box, and the flock check all build their
// daily_logs insert here so the column mapping lives in one place.
// No imports beyond triage, so it is safe to unit test without a client.
import { computeTriage, SCAN_FIELDS, type ScanAnswer, type ScanFieldKey, type TriageResult } from "./triage";
import type { CheckKind } from "./checkKind";

export type ScanAnswers = Record<ScanFieldKey, ScanAnswer>;

/** "Yes, looks normal": every question answered normal. */
export function allNormalAnswers(): ScanAnswers {
  return Object.fromEntries(SCAN_FIELDS.map((f) => [f.key, "normal"])) as ScanAnswers;
}

/** Start from all-normal and apply only what the owner marked as different. */
export function answersWithChanges(changes: Partial<Record<ScanFieldKey, Exclude<ScanAnswer, "normal">>>): ScanAnswers {
  return { ...allNormalAnswers(), ...changes };
}

export type DailyLogContext = {
  /** Which check wrote the row: the daily check card or the full health check. */
  kind: CheckKind;
  birdId: string;
  sitId: string | null;
  source: "owner" | "household";
  runBy: string | null;
  logDate: string;
  notes?: string | null;
  itemNotes?: unknown;
};

/** The daily_logs insert for a set of answers, plus its triage. vomiting_status
 *  is returned separately: the scan has always written it as a follow-up update.
 *  Insert it with insertWithKind (checkKind.ts) so a database without the kind
 *  column still takes the row. */
export function buildDailyLogRow(answers: ScanAnswers, ctx: DailyLogContext): { row: Record<string, unknown>; vomiting: ScanAnswer; triage: TriageResult } {
  const triage = computeTriage(answers);
  const a = answers;
  return {
    triage,
    vomiting: a.vomiting,
    row: {
      bird_id: ctx.birdId,
      sit_id: ctx.sitId,
      source: ctx.source,
      run_by: ctx.runBy,
      log_date: ctx.logDate,
      kind: ctx.kind,
      alertness_status: a.alertness,
      food_status: a.food,
      droppings_status: a.droppings,
      breathing_status: a.breathing,
      posture_status: a.posture,
      behavior_status: a.noise,
      energy_status: a.fluffed,
      injury_status: a.injury,
      exposure_status: a.exposure,
      notes: ctx.notes ?? null,
      item_notes: ctx.itemNotes ?? null,
      triage_status: triage.status,
      triage_reasons: triage.reasons.join(" | "),
      triage_reason_codes: triage.reasonCodes,
    },
  };
}

export const MIN_WEIGHT_G = 1;
export const MAX_WEIGHT_G = 5000;

/** The weight to save from the box. The faded last weight is a hint only: an
 *  empty box saves no weight, never yesterday's. Undefined = not a valid number. */
export function weightToSave(input: string): number | null | undefined {
  const s = input.trim();
  if (s === "") return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n < MIN_WEIGHT_G || n > MAX_WEIGHT_G) return undefined;
  return Math.round(n * 10) / 10;
}

/** Percent change from the last weight when it is big enough to be a likely
 *  typo (e.g. 1090 for 109), else null. */
export function bigWeightChange(prev: number | null | undefined, next: number, thresholdPct = 10): number | null {
  if (!prev || prev <= 0) return null;
  const pct = Math.round(((next - prev) / prev) * 100);
  return Math.abs(pct) > thresholdPct ? pct : null;
}
