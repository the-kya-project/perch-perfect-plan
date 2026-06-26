// Shared weight-trend computation so the weight facet and the vet summary agree.
// Steady within ~2.5% over the window; never "red".

export type WeightEntryLite = { grams: number; measured_at: string };
export type WeightTrend = {
  current?: WeightEntryLite;        // latest overall
  baseline?: WeightEntryLite;       // earliest in-window (the trend comparison point)
  trend: "steady" | "up" | "down";
  delta: number;                    // current - baseline (g)
};

// THE canonical Home/record trend pill: the latest entry vs the IMMEDIATELY
// PREVIOUS one (by measured_at). The Home flock card and the bird-record pill
// both render this, so they can never disagree (the old bug: window-baseline on
// Home said "Up 349 g" while latest-vs-previous on the record said "Down").
// Colors are fixed here: up/steady → lime-light ("good"), down → amber
// ("attention"), first/only entry → mute ("off"). `entriesDesc` is newest-first.
export type WeightPillTone = "good" | "attention" | "off";
export function weightTrendPill(entriesDesc: { grams: number }[]): { label: string; tone: WeightPillTone } {
  if (entriesDesc.length < 2) return { label: "First weight", tone: "off" };
  const raw = entriesDesc[0].grams - entriesDesc[1].grams;
  if (Math.abs(raw) < 1) return { label: "Steady", tone: "good" };
  const delta = Math.round(Math.abs(raw));
  return raw > 0
    ? { label: `Up ${delta} g`, tone: "good" }
    : { label: `Down ${delta} g`, tone: "attention" };
}

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
