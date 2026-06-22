// Shared weight-trend computation so the weight facet and the vet summary agree.
// Steady within ~2.5% over the window; never "red".

export type WeightEntryLite = { grams: number; measured_at: string };
export type WeightTrend = {
  current?: WeightEntryLite;        // latest overall
  baseline?: WeightEntryLite;       // earliest in-window (the trend comparison point)
  trend: "steady" | "up" | "down";
  delta: number;                    // current - baseline (g)
};

/** `entriesDesc` must be newest-first. */
export function computeWeightTrend(entriesDesc: WeightEntryLite[], windowDays = 90): WeightTrend {
  const current = entriesDesc[0];
  const cutoff = Date.now() - windowDays * 86_400_000;
  const inWindow = entriesDesc.filter((e) => +new Date(e.measured_at) >= cutoff);
  const baseline = inWindow.length > 1 ? inWindow[inWindow.length - 1] : undefined;
  const delta = current && baseline ? current.grams - baseline.grams : 0;
  const pct = baseline ? delta / baseline.grams : 0;
  const trend: "steady" | "up" | "down" = !baseline || Math.abs(pct) <= 0.025 ? "steady" : delta < 0 ? "down" : "up";
  return { current, baseline, trend, delta };
}
