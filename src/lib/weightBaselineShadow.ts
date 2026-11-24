// The weight baseline's shadow log (backlog D1.2). Every hour,
// /api/public/hooks/weight-baseline-shadow takes the weigh-ins logged since the
// last run, for every bird, and records what `computeWeightBaseline` would have
// said about each one, with and without the owner's ideal weight range, in
// public.weight_baseline_shadow (20261124110000_weight_baseline_shadow.sql).
// Nobody sees the table but the service role (and Brittany in the SQL editor),
// so the would-be alerts can be checked against what actually happened before
// any owner is shown or sent one.
//
// It runs after the fact, from the saved rows, so it can never slow down or
// block a weigh-in, whichever screen it came from (the weight page, the daily
// check, a sitter's check, the care plan's normal weight).
//
// Pure apart from the calls it's given, so scripts/weight-baseline.test.ts pins
// it with fakes.

import {
  baselineCard,
  computeWeightBaseline,
  DEFAULT_BASELINE_RULES,
  type BaselineCard,
  type BaselineTier,
  type IdealRange,
  type MealState,
  type WeighIn,
  type WeightBaselineRules,
} from "@/lib/weightBaseline";

export type PendingEntry = WeighIn & { id: string; bird_id: string };
/** A weigh-in from the bird's history; `id` lets the pending entry itself be told apart. */
export type HistoryEntry = WeighIn & { id?: string };

export type ShadowRow = {
  weight_entry_id: string;
  bird_id: string;
  measured_at: string;
  grams: number;
  meal_state: MealState;
  learned: boolean;
  normal_grams: number | null;
  wobble_pct: number | null;
  worth_watching_pct: number | null;
  keep_an_eye_pct: number | null;
  shifted_pct: number | null;
  drop_pct: number | null;
  hard_drop_pct: number | null;
  tier: BaselineTier;
  reweigh: boolean;
  hard_loss: boolean;
  sudden_reweigh: boolean;
  sudden_confirmed: boolean;
  sudden_drop_pct: number | null;
  has_ideal: boolean;
  tier_with_ideal: BaselineTier;
  reweigh_with_ideal: boolean;
  card: BaselineCard | null;
  card_with_ideal: BaselineCard | null;
  rules_version: string;
};

export type ShadowDeps = {
  /** Weigh-ins with no shadow row yet, oldest first (weight_baseline_shadow_pending). */
  pending: (limit: number) => Promise<PendingEntry[]>;
  /** A bird's weigh-ins measured up to `until` (enough history for the baseline). */
  history: (birdId: string, since: string, until: string) => Promise<HistoryEntry[]>;
  /** Ideal weight ranges for these birds; birds without one are left out. */
  ideals: (birdIds: string[]) => Promise<Map<string, { low: number; high: number }>>;
  /** Saves rows, ignoring any already there; returns how many were new. */
  save: (rows: ShadowRow[]) => Promise<number>;
};

export type ShadowResult = {
  /** Rows written. */
  logged: number;
  /** Birds whose history couldn't be read; their weigh-ins wait for the next run. */
  failedBirds: number;
  /** True when the batch limit was reached and more may be waiting. */
  more: boolean;
};

export const SHADOW_BATCH = 500;
const DAY = 86_400_000;

/** A short fingerprint of the rule values, so rows made under different values can be told apart. */
export function rulesVersion(rules: WeightBaselineRules = DEFAULT_BASELINE_RULES): string {
  const text = JSON.stringify(Object.entries(rules).sort(([a], [b]) => (a < b ? -1 : 1)));
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/**
 * What the baseline would have said when `entry` was logged: computed from the
 * bird's weigh-ins up to and including it.
 */
export function shadowRowFor(
  entry: PendingEntry,
  history: readonly HistoryEntry[],
  ideal: IdealRange,
  rules: WeightBaselineRules = DEFAULT_BASELINE_RULES,
): ShadowRow {
  const at = Date.parse(entry.measured_at);
  // The entry itself, plus every other weigh-in measured no later than it.
  const upTo: WeighIn[] = [
    ...history.filter((h) => h.id !== entry.id && Date.parse(h.measured_at) <= at),
    entry,
  ];
  const withIdeal = computeWeightBaseline(upTo, rules, ideal);
  const base = withIdeal.latest ? withIdeal.baselines[withIdeal.latest.mealState] : null;
  const th = withIdeal.thresholds;
  return {
    weight_entry_id: entry.id,
    bird_id: entry.bird_id,
    measured_at: entry.measured_at,
    grams: entry.grams,
    meal_state: withIdeal.latest?.mealState ?? "unlabeled",
    learned: base?.status === "learned",
    normal_grams: base?.status === "learned" ? base.grams : null,
    wobble_pct: base?.status === "learned" ? base.wobblePct : null,
    worth_watching_pct: th?.worthWatching ?? null,
    keep_an_eye_pct: th?.keepAnEye ?? null,
    shifted_pct: th?.shifted ?? null,
    drop_pct: withIdeal.dropPct,
    hard_drop_pct: withIdeal.hardDropPct,
    tier: withIdeal.withoutIdeal.tier,
    reweigh: withIdeal.withoutIdeal.reweigh,
    hard_loss: withIdeal.hardLoss,
    sudden_reweigh: withIdeal.sudden.reweigh,
    sudden_confirmed: withIdeal.sudden.confirmed,
    sudden_drop_pct: withIdeal.sudden.dropPct,
    has_ideal: ideal != null,
    tier_with_ideal: withIdeal.tier,
    reweigh_with_ideal: withIdeal.reweigh,
    card: baselineCard({ ...withIdeal, ...withIdeal.withoutIdeal }),
    card_with_ideal: baselineCard(withIdeal),
    rules_version: rulesVersion(rules),
  };
}

export async function runWeightBaselineShadow(
  deps: ShadowDeps,
  opts: { batch?: number; rules?: WeightBaselineRules } = {},
): Promise<ShadowResult> {
  const batch = opts.batch ?? SHADOW_BATCH;
  const rules = opts.rules ?? DEFAULT_BASELINE_RULES;
  const pending = await deps.pending(batch);
  const out: ShadowResult = { logged: 0, failedBirds: 0, more: pending.length >= batch };
  if (!pending.length) return out;

  const byBird = new Map<string, PendingEntry[]>();
  for (const e of pending) {
    const list = byBird.get(e.bird_id);
    if (list) list.push(e);
    else byBird.set(e.bird_id, [e]);
  }
  const ideals = await deps.ideals([...byBird.keys()]);
  // Enough history for the normal (its window) and the hard alert's month before.
  const lookback = Math.max(rules.baselineWindowDays, rules.hardLossReferenceDays) + 1;

  const rows: ShadowRow[] = [];
  for (const [birdId, entries] of byBird) {
    const times = entries.map((e) => Date.parse(e.measured_at)).filter(Number.isFinite);
    if (!times.length) continue;
    const since = new Date(Math.min(...times) - lookback * DAY).toISOString();
    const until = new Date(Math.max(...times)).toISOString();
    let history: HistoryEntry[];
    try {
      history = await deps.history(birdId, since, until);
    } catch {
      out.failedBirds++;
      continue;
    }
    const ideal = ideals.get(birdId) ?? null;
    for (const e of entries) rows.push(shadowRowFor(e, history, ideal, rules));
  }
  if (rows.length) out.logged = await deps.save(rows);
  return out;
}
