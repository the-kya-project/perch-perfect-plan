// The weight baseline rules (backlog D1.1): each bird's own normal by meal
// state, "still learning", the alert tiers, the free hard weight-loss alert,
// and the replay that counts how often each would have fired.
import assert from "node:assert/strict";
import { WEIGHT_BASELINE_RULES, DRAFT } from "@/lib/healthRules";
import {
  computeWeightBaseline,
  DEFAULT_BASELINE_RULES,
  mealStateOf,
  type WeighIn,
} from "@/lib/weightBaseline";
import {
  formatReplay,
  parseHistory,
  replayBird,
  replayHistory,
  type HistoryRow,
} from "@/lib/weightBaselineReplay";

let failed = 0;
function check(name: string, fn: () => void) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (e) {
    failed++;
    console.error(`not ok - ${name}\n`, e);
  }
}

const START = Date.parse("2026-06-01T08:00:00Z");
const at = (day: number, hour = 0) =>
  new Date(START + day * 86_400_000 + hour * 3_600_000).toISOString();
/** One weigh-in a day on the given days, at the given weights. */
function days(list: [day: number, grams: number][], meal: string | null = null): WeighIn[] {
  return list.map(([d, g]) => ({ grams: g, measured_at: at(d), meal_relation: meal }));
}
/** A steady bird: one weigh-in every other day from day 0 to `until`. */
function steady(until: number, grams = 100, meal: string | null = null): WeighIn[] {
  const out: [number, number][] = [];
  for (let d = 0; d <= until; d += 2) out.push([d, grams + ((d / 2) % 3) - 1]); // 99, 100, 101, …
  return days(out, meal);
}

check("every baseline value comes from the health rules file, marked draft", () => {
  for (const [k, r] of Object.entries(WEIGHT_BASELINE_RULES)) {
    assert.equal(r.status, DRAFT, `${k} is draft`);
    assert.equal(
      DEFAULT_BASELINE_RULES[k as keyof typeof DEFAULT_BASELINE_RULES],
      r.value,
      `${k} is read from the file`,
    );
    assert.match(r.where, /src\/lib\/weightBaseline\.ts/, `${k} says where it's used`);
  }
  // The starting values opening-scope B4 names.
  assert.equal(WEIGHT_BASELINE_RULES.minWeighIns.value, 7);
  assert.equal(WEIGHT_BASELINE_RULES.minDays.value, 14);
  assert.equal(WEIGHT_BASELINE_RULES.worthWatchingPct.value, 2.5);
  assert.equal(WEIGHT_BASELINE_RULES.keepAnEyePct.value, 5);
  assert.equal(WEIGHT_BASELINE_RULES.keepAnEyeDays.value, 7);
  assert.equal(WEIGHT_BASELINE_RULES.callVetTodayPct.value, 10);
});

check("no weigh-ins: still learning, nothing else", () => {
  const r = computeWeightBaseline([]);
  assert.equal(r.tier, "learning");
  assert.equal(r.latest, null);
  assert.equal(r.hardLoss, false);
  assert.equal(r.reweigh, false);
});

check("meal labels map to three kinds", () => {
  assert.equal(mealStateOf("before_meal"), "before_meal");
  assert.equal(mealStateOf("after_meal"), "after_meal");
  assert.equal(mealStateOf(null), "unlabeled");
  assert.equal(mealStateOf("something else"), "unlabeled");
});

check("still learning until 7 weigh-ins over 14 days, leaving out the last week", () => {
  // Six weigh-ins over 20 days, then today: too few.
  let r = computeWeightBaseline(
    days([
      [0, 100],
      [4, 100],
      [8, 100],
      [12, 100],
      [16, 100],
      [20, 100],
      [28, 100],
    ]),
  );
  assert.equal(r.tier, "learning");
  assert.deepEqual(r.baselines.unlabeled, {
    status: "learning",
    count: 6,
    days: 20,
    needWeighIns: 7,
    needDays: 14,
  });
  // Seven, but only 12 days apart.
  r = computeWeightBaseline(
    days([
      [0, 100],
      [2, 100],
      [4, 100],
      [6, 100],
      [8, 100],
      [10, 100],
      [12, 100],
      [20, 100],
    ]),
  );
  assert.equal(r.tier, "learning");
  // Seven over 14 days, all before the last week: learned.
  r = computeWeightBaseline(
    days([
      [0, 100],
      [2, 100],
      [4, 100],
      [6, 100],
      [8, 100],
      [10, 100],
      [14, 100],
      [22, 100],
    ]),
  );
  assert.equal(r.baselines.unlabeled.status, "learned");
  assert.equal(r.tier, "none");
  // The same weigh-ins, but the last week's don't count towards learning.
  r = computeWeightBaseline(
    days([
      [0, 100],
      [2, 100],
      [4, 100],
      [6, 100],
      [8, 100],
      [10, 100],
      [14, 100],
      [16, 100],
    ]),
  );
  assert.equal(r.baselines.unlabeled.status, "learning");
});

check("the normal is the median and the range the 10th to 90th percentile", () => {
  const hist = days([
    [0, 98],
    [2, 99],
    [4, 100],
    [6, 100],
    [8, 101],
    [10, 102],
    [12, 100],
    [14, 100],
    [16, 99],
    [18, 130],
  ]);
  const r = computeWeightBaseline([...hist, { grams: 100, measured_at: at(30) }]);
  const b = r.baselines.unlabeled;
  assert.equal(b.status, "learned");
  if (b.status !== "learned") return;
  assert.equal(b.grams, 100); // the 130 g reading (a dish left on the scale) doesn't move it
  assert.equal(b.low, 98);
  assert.equal(b.high, 102);
  assert.equal(b.count, 10);
});

check("a steady bird gets no alert", () => {
  const r = computeWeightBaseline(steady(60));
  assert.equal(r.tier, "none");
  assert.equal(r.reweigh, false);
  assert.equal(r.hardLoss, false);
});

check("one low weigh-in asks for a re-weigh, never an alert", () => {
  const r = computeWeightBaseline([...steady(40), { grams: 88, measured_at: at(48) }]);
  assert.equal(r.tier, "none");
  assert.equal(r.reweigh, true);
  assert.equal(r.hardLoss, false);
  assert.equal(r.dropPct, 12);
});

check("a re-weigh just as low: call your vet today, and the hard alert", () => {
  const r = computeWeightBaseline([
    ...steady(40),
    { grams: 88, measured_at: at(48) },
    { grams: 88.5, measured_at: at(48, 1) },
  ]);
  assert.equal(r.tier, "call_vet_today");
  assert.equal(r.hardLoss, true);
  assert.equal(r.reweigh, false);
});

check("a normal re-weigh clears the odd reading", () => {
  const r = computeWeightBaseline([
    ...steady(40),
    { grams: 88, measured_at: at(48) },
    { grams: 100, measured_at: at(48, 1) },
  ]);
  assert.equal(r.tier, "none");
  assert.equal(r.reweigh, false);
  assert.equal(r.hardLoss, false);
});

check("a confirmed small drop: worth watching", () => {
  const r = computeWeightBaseline([
    ...steady(40),
    { grams: 97, measured_at: at(46) },
    { grams: 97, measured_at: at(48) },
  ]);
  assert.equal(r.tier, "worth_watching");
});

check("a week 5% down: keep an eye on this", () => {
  const r = computeWeightBaseline([
    ...steady(40),
    { grams: 95, measured_at: at(44) },
    { grams: 94, measured_at: at(46) },
    { grams: 94.5, measured_at: at(48) },
  ]);
  assert.equal(r.tier, "keep_an_eye");
  assert.equal(r.hardLoss, false);
  // Two low weigh-ins after a normal week: only worth watching until the week catches up.
  const sudden = computeWeightBaseline([
    ...steady(40),
    ...days([
      [42, 100],
      [43, 100],
      [44, 100],
      [45, 100],
      [46, 100],
    ]),
    { grams: 94, measured_at: at(47) },
    { grams: 94, measured_at: at(48) },
  ]);
  assert.equal(sudden.tier, "worth_watching");
  // Weigh-ins more than 3 days apart don't confirm each other.
  const apart = computeWeightBaseline([
    ...steady(40),
    { grams: 94, measured_at: at(44) },
    { grams: 94, measured_at: at(48) },
  ]);
  assert.equal(apart.tier, "none");
  assert.equal(apart.reweigh, true);
});

check("a drop must be at least 2 g", () => {
  // A 30 g bird down 1 g (3.3%) twice: under the grams floor.
  let r = computeWeightBaseline([
    ...steady(40, 30),
    { grams: 29, measured_at: at(48) },
    { grams: 29, measured_at: at(48, 1) },
  ]);
  assert.equal(r.tier, "none");
  assert.equal(r.reweigh, false);
  // Down 3 g (10%) twice: call your vet today.
  r = computeWeightBaseline([
    ...steady(40, 30),
    { grams: 26.5, measured_at: at(48) },
    { grams: 26.5, measured_at: at(48, 1) },
  ]);
  assert.equal(r.tier, "call_vet_today");
});

check("like with like: each meal state has its own normal", () => {
  const before = steady(40, 100, "before_meal");
  const after = steady(40, 108, "after_meal");
  // An after-meal reading 4% below its own normal, but above the before-meal one.
  let r = computeWeightBaseline([
    ...before,
    ...after,
    { grams: 103.5, measured_at: at(47), meal_relation: "after_meal" },
    { grams: 103.5, measured_at: at(48), meal_relation: "after_meal" },
  ]);
  assert.equal(r.latest?.mealState, "after_meal");
  assert.equal(r.tier, "worth_watching");
  // A normal before-meal reading isn't judged against the heavier after-meal normal.
  r = computeWeightBaseline([
    ...before,
    ...after,
    { grams: 100, measured_at: at(48), meal_relation: "before_meal" },
  ]);
  assert.equal(r.tier, "none");
  assert.equal(r.reweigh, false);
  // After-meal readings never confirm a before-meal drop.
  r = computeWeightBaseline([
    ...before,
    ...after,
    { grams: 108, measured_at: at(47, 1), meal_relation: "after_meal" },
    { grams: 89, measured_at: at(48), meal_relation: "before_meal" },
  ]);
  assert.equal(r.tier, "none");
  assert.equal(r.reweigh, true);
});

check("one kind can be learned while another is still learning", () => {
  const r = computeWeightBaseline([
    ...steady(40, 100),
    { grams: 100, measured_at: at(48), meal_relation: "before_meal" },
  ]);
  assert.equal(r.baselines.unlabeled.status, "learned");
  assert.equal(r.baselines.before_meal.status, "learning");
  assert.equal(r.tier, "learning"); // judged as before-meal, which has no normal yet
});

check("the hard alert works while still learning", () => {
  const hist = days([
    [0, 100],
    [2, 101],
    [4, 99],
    [6, 100],
  ]);
  let r = computeWeightBaseline([...hist, { grams: 88, measured_at: at(8) }]);
  assert.equal(r.tier, "learning");
  assert.equal(r.hardLoss, false);
  assert.equal(r.reweigh, true);
  r = computeWeightBaseline([
    ...hist,
    { grams: 88, measured_at: at(8) },
    { grams: 88, measured_at: at(8, 2) },
  ]);
  assert.equal(r.tier, "learning");
  assert.equal(r.hardLoss, true);
  assert.equal(r.reweigh, false);
  // A first-ever weigh-in has nothing to compare with.
  r = computeWeightBaseline([{ grams: 50, measured_at: at(0) }]);
  assert.equal(r.hardLoss, false);
  assert.equal(r.reweigh, false);
});

check("a drop doesn't pull the normal down with it", () => {
  // Two weeks of a slow slide after a steady month: the normal stays where it was.
  const slide = days([
    [42, 97],
    [44, 96],
    [46, 95],
    [48, 94],
    [50, 93],
    [52, 92],
    [54, 91.5],
    [55, 91.5],
  ]);
  const r = computeWeightBaseline([...steady(40), ...slide]);
  const b = r.baselines.unlabeled;
  assert.equal(b.status, "learned");
  if (b.status === "learned") assert.ok(b.grams >= 97, `normal ${b.grams} stays near 100`);
  assert.equal(r.tier, "keep_an_eye");
});

check("order doesn't matter", () => {
  const list = [
    ...steady(40),
    { grams: 88, measured_at: at(48) },
    { grams: 88, measured_at: at(48, 1) },
  ];
  assert.deepEqual(computeWeightBaseline([...list].reverse()), computeWeightBaseline(list));
});

check("bad rows are ignored", () => {
  const r = computeWeightBaseline([
    ...steady(40),
    { grams: NaN, measured_at: at(48) },
    { grams: 0, measured_at: at(49) },
    { grams: 100, measured_at: "not a date" },
  ]);
  assert.equal(r.latest?.measured_at, at(40));
});

// ---------------------------------------------------------------------------
// The replay
// ---------------------------------------------------------------------------

check("the replay counts crossings, not weigh-ins", () => {
  const low = [50, 51, 52, 53].map((d) => ({ grams: 88, measured_at: at(d) }));
  const b = replayBird("Bird 1", [...steady(40), ...low]);
  assert.equal(b.weighIns, 21 + 4);
  assert.equal(b.fired.call_vet_today, 1);
  // Reaching "call your vet" crosses the two tiers below it on the way.
  assert.equal(b.fired.worth_watching, 1);
  assert.equal(b.fired.keep_an_eye, 1);
  assert.equal(b.hardLoss, 1);
  assert.equal(b.reweigh, 1); // the first low one, before a re-weigh agreed
  // 7 weigh-ins over 14 days, all before the last week: day 14's, first counted on day 22.
  assert.equal(b.daysToLearn, 22);
});

check("the replay counts a second crossing after a recovery", () => {
  const rows = [
    ...steady(40),
    ...days([
      [44, 96],
      [45, 96.5],
    ]), // worth watching
    ...days([
      [47, 100],
      [48, 100],
    ]), // back to normal
    ...days([
      [50, 96.5],
      [51, 96],
    ]), // worth watching again
  ];
  const b = replayBird("Bird 1", rows);
  assert.equal(b.fired.worth_watching, 2);
  assert.equal(b.fired.call_vet_today, 0);
});

check("the replay groups by bird, labels them without their keys, and totals them", () => {
  const rows: HistoryRow[] = [
    ...steady(40).map((r) => ({ ...r, bird: "aaa111" })),
    ...[48, 49].map((d) => ({ grams: 88, measured_at: at(d), bird: "aaa111" })),
    ...steady(10, 50).map((r) => ({ ...r, bird: "bbb222" })),
  ];
  const rep = replayHistory(rows);
  assert.equal(rep.totals.birds, 2);
  assert.equal(rep.totals.weighIns, rows.length);
  assert.equal(rep.totals.learned, 1);
  assert.equal(rep.totals.call_vet_today, 1);
  assert.equal(rep.totals.birdsWithAny.call_vet_today, 1);
  assert.equal(rep.birds[0].label, "Bird 1");
  assert.equal(rep.birds[1].daysToLearn, null);
  const md = formatReplay(rep);
  assert.ok(
    !md.includes("aaa111") && !md.includes("bbb222"),
    "the report never carries a bird's key",
  );
  assert.match(md, /Call your vet today: fired 1 times, for 1 birds/);
  assert.match(md, /\| Bird 2 \| 6 \| not yet \|/);
});

check("the export reads as CSV or JSON", () => {
  const csv =
    'bird,grams,measured_at,meal_relation\n"k1",100,2026-06-01 08:00:00+00,before_meal\nk1,101.5,2026-06-02 08:00:00+00,\n';
  assert.deepEqual(parseHistory(csv), [
    { bird: "k1", grams: 100, measured_at: "2026-06-01 08:00:00+00", meal_relation: "before_meal" },
    { bird: "k1", grams: 101.5, measured_at: "2026-06-02 08:00:00+00", meal_relation: null },
  ]);
  const reordered = "measured_at,meal_relation,bird,grams\n2026-06-01T08:00:00Z,,k2,40\n";
  assert.deepEqual(parseHistory(reordered), [
    { bird: "k2", grams: 40, measured_at: "2026-06-01T08:00:00Z", meal_relation: null },
  ]);
  const json =
    '[{"bird":"k3","grams":"55","measured_at":"2026-06-01T08:00:00Z","meal_relation":null}]';
  assert.deepEqual(parseHistory(json), [
    { bird: "k3", grams: 55, measured_at: "2026-06-01T08:00:00Z", meal_relation: null },
  ]);
  assert.throws(() => parseHistory("bird,grams\nk,1\n"), /measured_at/);
  // Postgres timestamps ("2026-06-01 08:00:00+00") parse as dates.
  assert.ok(Number.isFinite(Date.parse("2026-06-01 08:00:00+00")));
});

if (failed) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log("\nall weight baseline checks passed");
