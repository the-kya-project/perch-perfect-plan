// Replays weight history through the baseline rules (backlog D1.1): for every
// weigh-in, in order, what `computeWeightBaseline` would have said at that
// moment, and how often each tier would have fired. "Fired" is a crossing: a
// tier counts when a weigh-in reaches it and the one before didn't, the same
// "one alert per crossing, not one per weigh-in" rule the alerts will follow.
//
// The input is an export with no names: one row per weigh-in, the bird as an
// opaque key (docs/reports/weight-history-export.sql). The report shows birds
// as "Bird 1", "Bird 2"… so it never carries the key either.

import {
  ALERT_TIERS,
  computeWeightBaseline,
  DEFAULT_BASELINE_RULES,
  type AlertTier,
  type WeighIn,
  type WeightBaselineRules,
} from "@/lib/weightBaseline";

export type HistoryRow = WeighIn & { bird: string };

export type BirdReplay = {
  label: string;
  weighIns: number;
  /** Days from the first weigh-in until any kind's normal was learned; null if never. */
  daysToLearn: number | null;
  fired: Record<AlertTier, number>;
  hardLoss: number;
  reweigh: number;
};

export type ReplayReport = {
  birds: BirdReplay[];
  totals: { birds: number; weighIns: number; learned: number } & Record<AlertTier, number> & {
      hardLoss: number;
      reweigh: number;
      birdsWithAny: Record<AlertTier | "hardLoss", number>;
    };
};

const DAY = 86_400_000;
const emptyTiers = (): Record<AlertTier, number> => ({
  worth_watching: 0,
  keep_an_eye: 0,
  call_vet_today: 0,
});

export function replayBird(
  label: string,
  rows: readonly WeighIn[],
  rules: WeightBaselineRules = DEFAULT_BASELINE_RULES,
): BirdReplay {
  const sorted = [...rows]
    .filter((r) => Number.isFinite(Date.parse(r.measured_at)))
    .sort((a, b) => Date.parse(a.measured_at) - Date.parse(b.measured_at));
  const fired = emptyTiers();
  let hardLoss = 0;
  let reweigh = 0;
  let daysToLearn: number | null = null;
  let prevRank = -1;
  let prevHard = false;
  for (let i = 0; i < sorted.length; i++) {
    const res = computeWeightBaseline(sorted.slice(0, i + 1), rules);
    if (daysToLearn == null && Object.values(res.baselines).some((b) => b.status === "learned")) {
      daysToLearn = Math.floor(
        (Date.parse(sorted[i].measured_at) - Date.parse(sorted[0].measured_at)) / DAY,
      );
    }
    const rank = ALERT_TIERS.indexOf(res.tier as AlertTier);
    // Reaching a higher tier counts once for each tier crossed on the way up.
    for (let t = prevRank + 1; t <= rank; t++) fired[ALERT_TIERS[t]]++;
    prevRank = rank;
    if (res.hardLoss && !prevHard) hardLoss++;
    prevHard = res.hardLoss;
    if (res.reweigh) reweigh++;
  }
  return { label, weighIns: sorted.length, daysToLearn, fired, hardLoss, reweigh };
}

export function replayHistory(
  rows: readonly HistoryRow[],
  rules: WeightBaselineRules = DEFAULT_BASELINE_RULES,
): ReplayReport {
  const byBird = new Map<string, HistoryRow[]>();
  for (const r of rows) {
    const list = byBird.get(r.bird);
    if (list) list.push(r);
    else byBird.set(r.bird, [r]);
  }
  // Most weigh-ins first, so the labels don't follow the export's key order.
  const groups = [...byBird.values()].sort((a, b) => b.length - a.length);
  const birds = groups.map((g, i) => replayBird(`Bird ${i + 1}`, g, rules));
  const sum = (f: (b: BirdReplay) => number) => birds.reduce((s, b) => s + f(b), 0);
  const count = (f: (b: BirdReplay) => boolean) => birds.filter(f).length;
  return {
    birds,
    totals: {
      birds: birds.length,
      weighIns: sum((b) => b.weighIns),
      learned: count((b) => b.daysToLearn != null),
      worth_watching: sum((b) => b.fired.worth_watching),
      keep_an_eye: sum((b) => b.fired.keep_an_eye),
      call_vet_today: sum((b) => b.fired.call_vet_today),
      hardLoss: sum((b) => b.hardLoss),
      reweigh: sum((b) => b.reweigh),
      birdsWithAny: {
        worth_watching: count((b) => b.fired.worth_watching > 0),
        keep_an_eye: count((b) => b.fired.keep_an_eye > 0),
        call_vet_today: count((b) => b.fired.call_vet_today > 0),
        hardLoss: count((b) => b.hardLoss > 0),
      },
    },
  };
}

/** Reads the export: CSV with a header naming bird, grams, measured_at and meal_relation (any order), or a JSON array of rows. */
export function parseHistory(text: string): HistoryRow[] {
  const trimmed = text.trim();
  if (trimmed.startsWith("[")) {
    return (JSON.parse(trimmed) as Record<string, unknown>[]).map((r) => ({
      bird: String(r.bird),
      grams: Number(r.grams),
      measured_at: String(r.measured_at),
      meal_relation:
        r.meal_relation == null || r.meal_relation === "" ? null : String(r.meal_relation),
    }));
  }
  const lines = trimmed.split(/\r?\n/).filter((l) => l.trim());
  const unquote = (s: string) => s.trim().replace(/^"(.*)"$/, "$1");
  const head = lines[0].split(",").map(unquote);
  const col = (name: string) => {
    const i = head.indexOf(name);
    if (i < 0) throw new Error(`The export has no "${name}" column`);
    return i;
  };
  const [b, g, m, meal] = [col("bird"), col("grams"), col("measured_at"), col("meal_relation")];
  return lines.slice(1).map((line) => {
    const f = line.split(",").map(unquote);
    return { bird: f[b], grams: Number(f[g]), measured_at: f[m], meal_relation: f[meal] || null };
  });
}

/** The report as Markdown: totals first, then one row per bird. */
export function formatReplay(report: ReplayReport): string {
  const t = report.totals;
  const out = [
    "# Weight baseline replay",
    "",
    'Every value is draft, pending vet review (WEIGHT_BASELINE_RULES in src/lib/healthRules.ts). A tier "fired" when a weigh-in reached it and the one before didn\'t.',
    "",
    `- Birds: ${t.birds}; weigh-ins: ${t.weighIns}; birds whose normal was learned: ${t.learned}`,
    `- Worth watching: fired ${t.worth_watching} times, for ${t.birdsWithAny.worth_watching} birds`,
    `- Keep an eye on this: fired ${t.keep_an_eye} times, for ${t.birdsWithAny.keep_an_eye} birds`,
    `- Call your vet today: fired ${t.call_vet_today} times, for ${t.birdsWithAny.call_vet_today} birds`,
    `- Hard weight-loss alert: fired ${t.hardLoss} times, for ${t.birdsWithAny.hardLoss} birds`,
    `- "Weigh again" asks: ${t.reweigh}`,
    "",
    "| Bird | Weigh-ins | Days to learn | Worth watching | Keep an eye | Call vet today | Hard loss | Weigh again |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...report.birds.map(
      (b) =>
        `| ${b.label} | ${b.weighIns} | ${b.daysToLearn ?? "not yet"} | ${b.fired.worth_watching} | ${b.fired.keep_an_eye} | ${b.fired.call_vet_today} | ${b.hardLoss} | ${b.reweigh} |`,
    ),
  ];
  return out.join("\n") + "\n";
}
