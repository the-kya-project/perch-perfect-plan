// Each bird's own normal weight, and how far the latest weigh-ins sit below it
// (backlog D1.1, with Brittany's D1.2 decisions). Pure: no database, no clock,
// no wording. The weight page (D1.2), the hourly shadow log
// (src/lib/weightBaselineShadow.ts) and the replay of real history
// (scripts/weight-baseline-replay.ts) all call `computeWeightBaseline`, so they
// can never disagree.
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
//     least 14 days. A typed normal weight never stands in for the learned one.
//   - Each bird's own range: its wobble is 1.4826 × the median absolute
//     difference from its normal, as a percent of the normal. Worth watching
//     is 2 wobbles below (kept between 2% and 3.5%), keep an eye on this 3
//     (3.5% to 5%), and the top level ("has shifted") 4 (5% to 10%).
//   - Never alert on one weigh-in. A tier counts only when the last two
//     weigh-ins of that kind, within 10 days, are both that far below ("keep an
//     eye on this" also needs the last 14 days' average there). Until a
//     re-weigh agrees, the answer is "weigh again" (`reweigh`) instead.
//   - Every drop must also be at least 2 g.
//   - The hard weight-loss alert (`hardLoss`, free) uses the top level once
//     learned, and a fixed 10% against the month before while still learning.
//   - The owner's ideal weight range (optional, private) only ever quiets:
//     when the latest weigh-in is at or above its low end, "worth watching",
//     "keep an eye on this" and their "weigh again" stay quiet. The top level,
//     the hard alert and the sudden drop are never quieted. `withoutIdeal`
//     says what it would have been, for the shadow log.
//   - The sudden drop ignores the usual and ideal weights: the latest weigh-in
//     against the median of up to 3 of the same kind from the 7 days before,
//     10% below (7% for a bird under 100 g) and at least 2 g. One low reading
//     asks for a re-weigh; a second of the same kind within 3 days confirms it.

import { WEIGHT_BASELINE_RULES } from "@/lib/healthRules";

export type MealState = "before_meal" | "after_meal" | "unlabeled";
export const MEAL_STATES: readonly MealState[] = ["before_meal", "after_meal", "unlabeled"];

export type WeighIn = { grams: number; measured_at: string; meal_relation?: string | null };

/** The owner's ideal weight range for a bird, in grams. Never shown anywhere but its own field. */
export type IdealRange = { low: number; high: number } | null;

export type WeightBaselineRules = { [K in keyof typeof WEIGHT_BASELINE_RULES]: number };

/** The values from the health rules file. */
export const DEFAULT_BASELINE_RULES: WeightBaselineRules = Object.fromEntries(
  Object.entries(WEIGHT_BASELINE_RULES).map(([k, r]) => [k, r.value]),
) as WeightBaselineRules;

export type Baseline =
  | { status: "learning"; count: number; days: number; needWeighIns: number; needDays: number }
  | {
      status: "learned";
      grams: number;
      low: number;
      high: number;
      count: number;
      days: number;
      /** The bird's usual wobble, in percent of its normal. */
      wobblePct: number;
    };

/** Lowest to highest. "learning" is never "all fine": check `hardLoss`, `reweigh` and `sudden` too. */
export type BaselineTier = "learning" | "none" | "worth_watching" | "keep_an_eye" | "shifted";
export const ALERT_TIERS = ["worth_watching", "keep_an_eye", "shifted"] as const;
export type AlertTier = (typeof ALERT_TIERS)[number];

/** The percent below the normal each alert needs, for the latest weigh-in's kind. */
export type Thresholds = {
  worthWatching: number;
  keepAnEye: number;
  shifted: number;
  hardLoss: number;
};

export type SuddenDrop = {
  /** One low reading: weigh again. */
  reweigh: boolean;
  /** A second low reading of the same kind agreed. */
  confirmed: boolean;
  /** How far below the comparison, in percent; null when there's nothing to compare with. */
  dropPct: number | null;
};

export type WeightBaselineResult = {
  /** The normal for each kind of weigh-in. */
  baselines: Record<MealState, Baseline>;
  /** The latest weigh-in, and the kind it's judged as. */
  latest: { grams: number; measured_at: string; mealState: MealState } | null;
  tier: BaselineTier;
  /** How far the latest weigh-in is below its normal, in percent (negative = above). */
  dropPct: number | null;
  /** The levels used; null while that kind is still learning (the hard alert's is fixed then). */
  thresholds: Thresholds | null;
  /** The free hard weight-loss alert: confirmed, and at least the hard level below. */
  hardLoss: boolean;
  /** How far below the hard alert's comparison point, in percent (null when there's none). */
  hardDropPct: number | null;
  /** The latest weigh-in alone would raise an alert (or a higher one) that no re-weigh has confirmed yet. */
  reweigh: boolean;
  sudden: SuddenDrop;
  /** The ideal range quieted something. */
  quietedByIdeal: boolean;
  /** The same answer with no ideal range, for the shadow log. */
  withoutIdeal: { tier: BaselineTier; reweigh: boolean };
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

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

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
  const normal = median(grams);
  const mad = median(grams.map((g) => Math.abs(g - normal)).sort((a, b) => a - b));
  return {
    status: "learned",
    grams: round1(normal),
    low: percentile(grams, r.rangeLowPercentile),
    high: percentile(grams, r.rangeHighPercentile),
    count: used.length,
    days: Math.floor(days),
    wobblePct: round2(((r.wobbleFactor * mad) / normal) * 100),
  };
}

/** Each tier's level for a learned normal: so many wobbles, between its floor and ceiling. */
export function personalThresholds(wobblePct: number, r: WeightBaselineRules): Thresholds {
  const w = Number.isFinite(wobblePct) ? wobblePct : 0;
  const shifted = round2(clamp(r.shiftedWobbles * w, r.shiftedMinPct, r.shiftedMaxPct));
  return {
    worthWatching: round2(
      clamp(r.worthWatchingWobbles * w, r.worthWatchingMinPct, r.worthWatchingMaxPct),
    ),
    keepAnEye: round2(clamp(r.keepAnEyeWobbles * w, r.keepAnEyeMinPct, r.keepAnEyeMaxPct)),
    shifted,
    hardLoss: shifted,
  };
}

function avg(xs: Reading[]): number {
  return xs.reduce((s, x) => s + x.grams, 0) / xs.length;
}

/** How far `grams` is below `ref`, if it clears both the percent and the grams floor. */
function below(ref: number, grams: number, pct: number, r: WeightBaselineRules): boolean {
  return ref > 0 && ref - grams >= r.minDropGrams && ((ref - grams) / ref) * 100 >= pct;
}

const pctBelow = (ref: number, grams: number) => round1(((ref - grams) / ref) * 100);

/** The sudden drop's comparison for reading `i` of `like`: the median of up to N before it, within the lookback. */
function suddenRef(like: Reading[], i: number, r: WeightBaselineRules): number | null {
  const x = like[i];
  const before = like
    .slice(0, i)
    .filter((y) => y.at >= x.at - r.suddenLookbackDays * DAY && y.at < x.at)
    .slice(-r.suddenCompareCount)
    .map((y) => y.grams)
    .sort((a, b) => a - b);
  return before.length ? median(before) : null;
}

function suddenLow(ref: number | null, grams: number, r: WeightBaselineRules): boolean {
  if (ref == null) return false;
  const pct = ref < r.suddenSmallBirdGrams ? r.suddenDropSmallPct : r.suddenDropPct;
  return below(ref, grams, pct, r);
}

function suddenDrop(like: Reading[], r: WeightBaselineRules): SuddenDrop {
  const i = like.length - 1;
  if (i < 0) return { reweigh: false, confirmed: false, dropPct: null };
  const last = like[i];
  const ref = suddenRef(like, i, r);
  // Confirmed: the reading before was low against its own comparison, it's recent, and the
  // latest is low against that same comparison (one from before the drop started).
  if (i >= 1) {
    const prev = like[i - 1];
    const prevRef = suddenRef(like, i - 1, r);
    if (
      last.at - prev.at <= r.suddenConfirmDays * DAY &&
      suddenLow(prevRef, prev.grams, r) &&
      suddenLow(prevRef, last.grams, r)
    ) {
      return { reweigh: false, confirmed: true, dropPct: pctBelow(prevRef!, last.grams) };
    }
  }
  const low = suddenLow(ref, last.grams, r);
  return {
    reweigh: low,
    confirmed: false,
    dropPct: ref == null ? null : pctBelow(ref, last.grams),
  };
}

/**
 * Works out each kind's normal and judges the latest weigh-in. `entries` may be
 * in any order; everything is measured from the latest weigh-in's own time, so
 * replaying history gives the answer the app would have shown at that moment.
 * `ideal` is the owner's ideal weight range, if they gave one.
 */
export function computeWeightBaseline(
  entries: readonly WeighIn[],
  rules: WeightBaselineRules = DEFAULT_BASELINE_RULES,
  ideal: IdealRange = null,
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
      thresholds: null,
      hardLoss: false,
      hardDropPct: null,
      reweigh: false,
      sudden: { reweigh: false, confirmed: false, dropPct: null },
      quietedByIdeal: false,
      withoutIdeal: { tier: "learning", reweigh: false },
    };

  const like = byMeal(last.meal);
  const base = baselines[last.meal];
  const latest = { grams: last.grams, measured_at: last.measured_at, mealState: last.meal };
  const sudden = suddenDrop(like, rules);
  const th = base.status === "learned" ? personalThresholds(base.wobblePct, rules) : null;

  // The weigh-ins that confirm the latest one (the latest included): the last few in a row,
  // all recent. "Keep an eye on this" also needs the recent average that far below.
  const inARow = like.slice(-rules.confirmMinReadings);
  const confirmable =
    inARow.length >= rules.confirmMinReadings && inARow[0].at > asOf - rules.confirmDays * DAY;
  const recent = like.filter((x) => x.at > asOf - rules.keepAnEyeDays * DAY);
  const recentAvg = recent.length >= rules.confirmMinReadings ? avg(recent) : null;

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
  const hardPct = th ? th.hardLoss : rules.hardLossPct;
  const hardLoss = hardRef != null && meets(hardRef, hardPct);
  const hardAlone = hardRef != null && alone(hardRef, hardPct);
  const hardDropPct = hardRef != null ? pctBelow(hardRef, last.grams) : null;
  const hardReweigh = hardAlone && !hardLoss;

  if (base.status === "learning" || !th) {
    return {
      baselines,
      latest,
      tier: "learning",
      dropPct: null,
      thresholds: null,
      hardLoss,
      hardDropPct,
      reweigh: hardReweigh,
      sudden,
      quietedByIdeal: false,
      withoutIdeal: { tier: "learning", reweigh: hardReweigh },
    };
  }

  const ref = base.grams;
  const fired: AlertTier | null = meets(ref, th.shifted)
    ? "shifted"
    : meets(ref, th.keepAnEye) && recentAvg != null && below(ref, recentAvg, th.keepAnEye, rules)
      ? "keep_an_eye"
      : meets(ref, th.worthWatching)
        ? "worth_watching"
        : null;
  const wouldBe: AlertTier | null = alone(ref, th.shifted)
    ? "shifted"
    : alone(ref, th.keepAnEye)
      ? "keep_an_eye"
      : alone(ref, th.worthWatching)
        ? "worth_watching"
        : null;
  const rank = (t: AlertTier | null) => (t ? ALERT_TIERS.indexOf(t) : -1);
  const tierReweigh = rank(wouldBe) > rank(fired);
  const tier: BaselineTier = fired ?? "none";
  const reweigh = tierReweigh || hardReweigh;

  // The ideal range quiets only the two lower tiers and their "weigh again", never the top level.
  const idealQuiets = ideal != null && Number.isFinite(ideal.low) && last.grams >= ideal.low;
  const quietTier = idealQuiets && (tier === "worth_watching" || tier === "keep_an_eye");
  const quietReweigh = idealQuiets && tierReweigh && wouldBe !== "shifted" && !hardReweigh;

  return {
    baselines,
    latest,
    tier: quietTier ? "none" : tier,
    dropPct: pctBelow(ref, last.grams),
    thresholds: th,
    hardLoss,
    hardDropPct,
    reweigh: quietReweigh ? false : reweigh,
    sudden,
    quietedByIdeal: quietTier || quietReweigh,
    withoutIdeal: { tier, reweigh },
  };
}

/** The one card the weight page shows, most serious first; null for nothing to say. */
export type BaselineCard =
  | "sudden_confirmed"
  | "shifted"
  | "hard_loss"
  | "sudden_reweigh"
  | "reweigh"
  | "keep_an_eye"
  | "worth_watching";

export function baselineCard(
  r: Pick<WeightBaselineResult, "tier" | "hardLoss" | "reweigh" | "sudden">,
): BaselineCard | null {
  if (r.sudden.confirmed) return "sudden_confirmed";
  if (r.tier === "shifted") return "shifted";
  if (r.hardLoss) return "hard_loss";
  if (r.sudden.reweigh) return "sudden_reweigh";
  if (r.reweigh) return "reweigh";
  if (r.tier === "keep_an_eye") return "keep_an_eye";
  if (r.tier === "worth_watching") return "worth_watching";
  return null;
}
