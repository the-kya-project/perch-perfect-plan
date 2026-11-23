// Each bird's own normal weight, and how far the latest weigh-ins sit below it
// (backlog D1.1). Pure: no database, no clock, no wording. The screens (D1.2)
// and the replay of real history (scripts/weight-baseline-replay.ts) both call
// `computeWeightBaseline`, so they can never disagree.
//
// Every number comes from WEIGHT_BASELINE_RULES in src/lib/healthRules.ts,
// all "draft, pending vet review". Nothing here reaches an owner until the
// `weight_baseline` health switch is on for them.
//
// The rules, in plain words:
//   - Compare like with like. Weigh-ins before a meal, after a meal and with no
//     label each get their own normal, and the latest weigh-in is judged only
//     against the normal for its own kind.
//   - The normal is the median of that kind's weigh-ins from the last 90 days,
//     leaving out the last 7, so a drop now doesn't drag the normal down with
//     it. The range is the 10th to 90th percentile of the same weigh-ins.
//   - "Still learning" until those weigh-ins number at least 7 and span at
//     least 14 days.
//   - Never alert on one weigh-in. A tier counts only when the last two
//     weigh-ins of that kind, within 3 days, are both that far below ("keep an
//     eye on this" also needs the week's average there). Until a re-weigh
//     agrees, the answer is "weigh again" (`reweigh`) instead.
//   - Every drop must also be at least 2 g.
//   - The hard weight-loss alert (`hardLoss`, free) works while still
//     learning too, against the weigh-ins of the month before.

import { WEIGHT_BASELINE_RULES } from "@/lib/healthRules";

export type MealState = "before_meal" | "after_meal" | "unlabeled";
export const MEAL_STATES: readonly MealState[] = ["before_meal", "after_meal", "unlabeled"];

export type WeighIn = { grams: number; measured_at: string; meal_relation?: string | null };

export type WeightBaselineRules = { [K in keyof typeof WEIGHT_BASELINE_RULES]: number };

/** The values from the health rules file. */
export const DEFAULT_BASELINE_RULES: WeightBaselineRules = Object.fromEntries(
  Object.entries(WEIGHT_BASELINE_RULES).map(([k, r]) => [k, r.value]),
) as WeightBaselineRules;

export type Baseline =
  | { status: "learning"; count: number; days: number; needWeighIns: number; needDays: number }
  | { status: "learned"; grams: number; low: number; high: number; count: number; days: number };

/** Lowest to highest. "learning" is never "all fine": check `hardLoss` and `reweigh` too. */
export type BaselineTier =
  "learning" | "none" | "worth_watching" | "keep_an_eye" | "call_vet_today";
export const ALERT_TIERS = ["worth_watching", "keep_an_eye", "call_vet_today"] as const;
export type AlertTier = (typeof ALERT_TIERS)[number];

export type WeightBaselineResult = {
  /** The normal for each kind of weigh-in. */
  baselines: Record<MealState, Baseline>;
  /** The latest weigh-in, and the kind it's judged as. */
  latest: { grams: number; measured_at: string; mealState: MealState } | null;
  tier: BaselineTier;
  /** How far the latest weigh-in is below its normal, in percent (negative = above). */
  dropPct: number | null;
  /** The free hard weight-loss alert: confirmed, and at least hardLossPct below. */
  hardLoss: boolean;
  /** The latest weigh-in alone would raise an alert (or a higher one) that no re-weigh has confirmed yet. */
  reweigh: boolean;
};

const DAY = 86_400_000;

export function mealStateOf(meal: string | null | undefined): MealState {
  return meal === "before_meal" || meal === "after_meal" ? meal : "unlabeled";
}

function median(sorted: number[]): number {
  const n = sorted.length;
  return n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
}

/** Nearest-rank percentile of an ascending list. */
function percentile(sorted: number[], p: number): number {
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(sorted.length, Math.max(1, rank)) - 1];
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

type Reading = { grams: number; at: number; meal: MealState; measured_at: string };

function prepare(entries: readonly WeighIn[]): Reading[] {
  return entries
    .filter(
      (e) => Number.isFinite(e.grams) && e.grams > 0 && Number.isFinite(Date.parse(e.measured_at)),
    )
    .map((e) => ({
      grams: e.grams,
      at: Date.parse(e.measured_at),
      meal: mealStateOf(e.meal_relation),
      measured_at: e.measured_at,
    }))
    .sort((a, b) => a.at - b.at);
}

/** The normal for one kind of weigh-in, as of time `asOf` (the latest weigh-in's time). */
function baselineFor(like: Reading[], asOf: number, r: WeightBaselineRules): Baseline {
  const from = asOf - r.baselineWindowDays * DAY;
  const until = asOf - r.baselineSkipDays * DAY;
  const used = like.filter((x) => x.at >= from && x.at < until);
  const days = used.length ? (used[used.length - 1].at - used[0].at) / DAY : 0;
  if (used.length < r.minWeighIns || days < r.minDays) {
    return {
      status: "learning",
      count: used.length,
      days: Math.floor(days),
      needWeighIns: r.minWeighIns,
      needDays: r.minDays,
    };
  }
  const grams = used.map((x) => x.grams).sort((a, b) => a - b);
  return {
    status: "learned",
    grams: round1(median(grams)),
    low: percentile(grams, r.rangeLowPercentile),
    high: percentile(grams, r.rangeHighPercentile),
    count: used.length,
    days: Math.floor(days),
  };
}

function avg(xs: Reading[]): number {
  return xs.reduce((s, x) => s + x.grams, 0) / xs.length;
}

/** How far `grams` is below `ref`, if it clears both the percent and the grams floor. */
function below(ref: number, grams: number, pct: number, r: WeightBaselineRules): boolean {
  return ref > 0 && ref - grams >= r.minDropGrams && ((ref - grams) / ref) * 100 >= pct;
}

/**
 * Works out each kind's normal and judges the latest weigh-in. `entries` may be
 * in any order; everything is measured from the latest weigh-in's own time, so
 * replaying history gives the answer the app would have shown at that moment.
 */
export function computeWeightBaseline(
  entries: readonly WeighIn[],
  rules: WeightBaselineRules = DEFAULT_BASELINE_RULES,
): WeightBaselineResult {
  const readings = prepare(entries);
  const last = readings[readings.length - 1];
  const asOf = last?.at ?? 0;
  const byMeal = (m: MealState) => readings.filter((x) => x.meal === m);
  const baselines = Object.fromEntries(
    MEAL_STATES.map((m) => [m, baselineFor(byMeal(m), asOf, rules)]),
  ) as Record<MealState, Baseline>;
  if (!last)
    return {
      baselines,
      latest: null,
      tier: "learning",
      dropPct: null,
      hardLoss: false,
      reweigh: false,
    };

  const like = byMeal(last.meal);
  const base = baselines[last.meal];
  const latest = { grams: last.grams, measured_at: last.measured_at, mealState: last.meal };

  // The weigh-ins that confirm the latest one (the latest included): the last few in a row,
  // all recent. "Keep an eye on this" also needs the week's average that far below.
  const inARow = like.slice(-rules.confirmMinReadings);
  const confirmable =
    inARow.length >= rules.confirmMinReadings && inARow[0].at > asOf - rules.confirmDays * DAY;
  const week = like.filter((x) => x.at > asOf - rules.keepAnEyeDays * DAY);
  const weekAvg = week.length >= rules.confirmMinReadings ? avg(week) : null;

  const meets = (ref: number, pct: number) =>
    confirmable && inARow.every((x) => below(ref, x.grams, pct, rules));
  const alone = (ref: number, pct: number) => below(ref, last.grams, pct, rules);

  // The free hard alert's comparison point: the normal once learned, else the month before.
  let hardRef: number | null = null;
  if (base.status === "learned") hardRef = base.grams;
  else {
    const before = like
      .filter(
        (x) =>
          x.at >= asOf - rules.hardLossReferenceDays * DAY &&
          x.at <= asOf - rules.confirmDays * DAY,
      )
      .map((x) => x.grams)
      .sort((a, b) => a - b);
    if (before.length) hardRef = median(before);
  }
  const hardLoss = hardRef != null && meets(hardRef, rules.hardLossPct);
  const hardAlone = hardRef != null && alone(hardRef, rules.hardLossPct);

  if (base.status === "learning") {
    return {
      baselines,
      latest,
      tier: "learning",
      dropPct: null,
      hardLoss,
      reweigh: hardAlone && !hardLoss,
    };
  }

  const ref = base.grams;
  const fired: AlertTier | null = meets(ref, rules.callVetTodayPct)
    ? "call_vet_today"
    : meets(ref, rules.keepAnEyePct) &&
        weekAvg != null &&
        below(ref, weekAvg, rules.keepAnEyePct, rules)
      ? "keep_an_eye"
      : meets(ref, rules.worthWatchingPct)
        ? "worth_watching"
        : null;
  const wouldBe: AlertTier | null = alone(ref, rules.callVetTodayPct)
    ? "call_vet_today"
    : alone(ref, rules.keepAnEyePct)
      ? "keep_an_eye"
      : alone(ref, rules.worthWatchingPct)
        ? "worth_watching"
        : null;
  const rank = (t: AlertTier | null) => (t ? ALERT_TIERS.indexOf(t) : -1);

  return {
    baselines,
    latest,
    tier: fired ?? "none",
    dropPct: round1(((ref - last.grams) / ref) * 100),
    hardLoss,
    reweigh: rank(wouldBe) > rank(fired) || (hardAlone && !hardLoss),
  };
}
