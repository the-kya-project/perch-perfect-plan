// The weight baseline rules (backlog D1.1, with Brittany's D1.2 decisions):
// each bird's own normal by meal state, "still learning", the personal alert
// levels, the free hard weight-loss alert, the sudden drop, the ideal range
// (which only quiets the lower alerts), the replay that counts how often each
// would have fired, and the shadow log.
import assert from "node:assert/strict";
import { WEIGHT_BASELINE_RULES, DRAFT } from "@/lib/healthRules";
import {
  baselineCard,
  computeWeightBaseline,
  DEFAULT_BASELINE_RULES,
  mealStateOf,
  personalThresholds,
  type WeighIn,
} from "@/lib/weightBaseline";
import {
  rulesVersion,
  runWeightBaselineShadow,
  shadowRowFor,
  type PendingEntry,
  type ShadowRow,
} from "@/lib/weightBaselineShadow";
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
async function checkAsync(name: string, fn: () => Promise<void>) {
  try {
    await fn();
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
  assert.equal(WEIGHT_BASELINE_RULES.shiftedPct.value, 10);
  // Brittany's D1.2 decisions (Nov 23, 2026).
  const v = (k: keyof typeof WEIGHT_BASELINE_RULES) => WEIGHT_BASELINE_RULES[k].value;
  assert.equal(v("wobbleFactor"), 1.4826);
  assert.deepEqual(
    [v("worthWatchingWobbles"), v("worthWatchingMinPct"), v("worthWatchingMaxPct")],
    [2, 2, 3.5],
  );
  assert.deepEqual(
    [v("keepAnEyeWobbles"), v("keepAnEyeMinPct"), v("keepAnEyeMaxPct")],
    [3, 3.5, 5],
  );
  assert.deepEqual([v("shiftedWobbles"), v("shiftedMinPct"), v("shiftedMaxPct")], [4, 5, 10]);
  assert.equal(v("confirmDays"), 10);
  assert.equal(v("keepAnEyeDays"), 14);
  assert.deepEqual(
    [
      v("suddenDropPct"),
      v("suddenDropSmallPct"),
      v("suddenSmallBirdGrams"),
      v("suddenCompareCount"),
      v("suddenLookbackDays"),
      v("suddenConfirmDays"),
    ],
    [10, 7, 100, 3, 7, 3],
  );
});

check("personal levels: so many wobbles, kept between each floor and ceiling", () => {
  const r = DEFAULT_BASELINE_RULES;
  assert.deepEqual(personalThresholds(0, r), {
    worthWatching: 2,
    keepAnEye: 3.5,
    shifted: 5,
    hardLoss: 5,
  });
  assert.deepEqual(personalThresholds(1.5, r), {
    worthWatching: 3,
    keepAnEye: 4.5,
    shifted: 6,
    hardLoss: 6,
  });
  assert.deepEqual(personalThresholds(10, r), {
    worthWatching: 3.5,
    keepAnEye: 5,
    shifted: 10,
    hardLoss: 10,
  });
});

check("the wobble is 1.4826 × the median absolute difference, in percent of the normal", () => {
  const r = computeWeightBaseline(steady(40));
  const b = r.baselines.unlabeled;
  assert.equal(b.status, "learned");
  if (b.status !== "learned") return;
  assert.equal(b.wobblePct, 1.48); // 99/100/101 around 100: a median difference of 1 g
  // From the wobble as stored, so a shadow row's levels follow from its own wobble_pct.
  assert.deepEqual(r.thresholds, {
    worthWatching: 2.96,
    keepAnEye: 4.44,
    shifted: 5.92,
    hardLoss: 5.92,
  });
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

check("a re-weigh just as low: the top level, and the hard alert", () => {
  const r = computeWeightBaseline([
    ...steady(40),
    { grams: 88, measured_at: at(48) },
    { grams: 88.5, measured_at: at(48, 1) },
  ]);
  assert.equal(r.tier, "shifted");
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

check("two weeks below: keep an eye on this", () => {
  const r = computeWeightBaseline([
    ...steady(34),
    ...days([
      [42, 95],
      [44, 95],
      [46, 94.5],
      [48, 94.5],
    ]),
  ]);
  assert.equal(r.tier, "keep_an_eye");
  assert.equal(r.hardLoss, false);
  // Two low weigh-ins after a normal fortnight: only worth watching until the average catches up.
  const sudden = computeWeightBaseline([
    ...steady(40),
    ...days([
      [42, 100],
      [43, 100],
      [44, 100],
      [45, 100],
      [46, 100],
    ]),
    { grams: 95.2, measured_at: at(47) },
    { grams: 95.2, measured_at: at(48) },
  ]);
  assert.equal(sudden.tier, "worth_watching");
  // Weigh-ins more than 10 days apart don't confirm each other.
  const apart = computeWeightBaseline([
    ...steady(30),
    { grams: 94, measured_at: at(36) },
    { grams: 94, measured_at: at(52) },
  ]);
  assert.equal(apart.tier, "none");
  assert.equal(apart.reweigh, true);
  // …but within 10 days they do.
  const within = computeWeightBaseline([
    ...steady(40),
    { grams: 94, measured_at: at(44) },
    { grams: 94, measured_at: at(52) },
  ]);
  assert.equal(within.tier, "shifted");
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
  // Down 3.5 g (11.7%) twice: the top level (a 30 g bird's wobble puts it at the 10% ceiling).
  r = computeWeightBaseline([
    ...steady(40, 30),
    { grams: 26.5, measured_at: at(48) },
    { grams: 26.5, measured_at: at(48, 1) },
  ]);
  assert.equal(r.thresholds?.shifted, 10);
  assert.equal(r.tier, "shifted");
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

check("the hard alert works while still learning, at the fixed 10%", () => {
  const hist = days([
    [0, 100],
    [2, 101],
    [4, 99],
    [6, 100],
  ]);
  let r = computeWeightBaseline([...hist, { grams: 88, measured_at: at(16) }]);
  assert.equal(r.tier, "learning");
  assert.equal(r.hardLoss, false);
  assert.equal(r.reweigh, true);
  assert.equal(r.hardDropPct, 12);
  r = computeWeightBaseline([
    ...hist,
    { grams: 88, measured_at: at(16) },
    { grams: 88, measured_at: at(16, 2) },
  ]);
  assert.equal(r.tier, "learning");
  assert.equal(r.hardLoss, true);
  assert.equal(r.reweigh, false);
  assert.equal(baselineCard(r), "hard_loss");
  // 9% is under the fixed level while still learning.
  r = computeWeightBaseline([
    ...hist,
    { grams: 91, measured_at: at(16) },
    { grams: 91, measured_at: at(16, 2) },
  ]);
  assert.equal(r.hardLoss, false);
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
  assert.equal(r.tier, "shifted");
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

check("a bird that wobbles more gets wider levels", () => {
  // 97 / 100 / 103 around 100: a median difference of 3 g, a 4.45% wobble.
  const noisy: WeighIn[] = [];
  for (let d = 0; d <= 40; d += 2)
    noisy.push({ grams: 100 + (((d / 2) % 3) - 1) * 3, measured_at: at(d) });
  const drop = [
    { grams: 93, measured_at: at(47) },
    { grams: 93, measured_at: at(48) },
  ];
  const r = computeWeightBaseline([...noisy, ...drop]);
  assert.deepEqual(r.thresholds, { worthWatching: 3.5, keepAnEye: 5, shifted: 10, hardLoss: 10 });
  assert.equal(r.tier, "worth_watching"); // 7% is within this bird's usual wobble for the top level
  assert.equal(computeWeightBaseline([...steady(40), ...drop]).tier, "shifted"); // but not a steady bird's
});

check("the ideal range quiets only the two lower alerts and their 'weigh again'", () => {
  const ideal = { low: 95, high: 105 };
  const small = [
    ...steady(40),
    { grams: 97, measured_at: at(46) },
    { grams: 97, measured_at: at(48) },
  ];
  let r = computeWeightBaseline(small, DEFAULT_BASELINE_RULES, ideal);
  assert.equal(r.tier, "none");
  assert.equal(r.quietedByIdeal, true);
  assert.deepEqual(r.withoutIdeal, { tier: "worth_watching", reweigh: false });
  assert.equal(baselineCard(r), null);
  // Below the ideal range's low end, it works as usual.
  r = computeWeightBaseline(small, DEFAULT_BASELINE_RULES, { low: 98, high: 105 });
  assert.equal(r.tier, "worth_watching");
  assert.equal(r.quietedByIdeal, false);
  // One low reading at the worth-watching level: no "weigh again" above the ideal low end.
  r = computeWeightBaseline(
    [...steady(40), { grams: 97, measured_at: at(48) }],
    DEFAULT_BASELINE_RULES,
    ideal,
  );
  assert.equal(r.reweigh, false);
  assert.equal(r.withoutIdeal.reweigh, true);
  // The top level, the hard alert and their "weigh again" are never quieted.
  const low = { low: 80, high: 90 };
  r = computeWeightBaseline(
    [...steady(40), { grams: 88, measured_at: at(48) }, { grams: 88.5, measured_at: at(48, 1) }],
    DEFAULT_BASELINE_RULES,
    low,
  );
  assert.equal(r.tier, "shifted");
  assert.equal(r.hardLoss, true);
  assert.equal(r.quietedByIdeal, false);
  r = computeWeightBaseline(
    [...steady(40), { grams: 88, measured_at: at(48) }],
    DEFAULT_BASELINE_RULES,
    low,
  );
  assert.equal(r.reweigh, true);
});

check(
  "the sudden drop: one low reading asks to weigh again, a second within 3 days confirms",
  () => {
    const daily = days(Array.from({ length: 30 }, (_, i) => [i, 100] as [number, number]));
    let r = computeWeightBaseline([...daily, { grams: 89, measured_at: at(30) }]);
    assert.deepEqual(r.sudden, { reweigh: true, confirmed: false, dropPct: 11 });
    assert.equal(baselineCard(r), "sudden_reweigh");
    r = computeWeightBaseline([
      ...daily,
      { grams: 89, measured_at: at(30) },
      { grams: 89.5, measured_at: at(31) },
    ]);
    assert.deepEqual(r.sudden, { reweigh: false, confirmed: true, dropPct: 10.5 });
    assert.equal(baselineCard(r), "sudden_confirmed");
    // Four days later doesn't confirm it; it asks again.
    r = computeWeightBaseline([
      ...daily,
      { grams: 89, measured_at: at(30) },
      { grams: 89, measured_at: at(34) },
    ]);
    assert.equal(r.sudden.confirmed, false);
    // 9% isn't sudden for a 100 g bird…
    r = computeWeightBaseline([...daily, { grams: 91, measured_at: at(30) }]);
    assert.equal(r.sudden.reweigh, false);
    // …but 7% is for one under 100 g, as long as it's at least 2 g.
    const tiny = days(Array.from({ length: 10 }, (_, i) => [i, 50] as [number, number]));
    assert.equal(
      computeWeightBaseline([...tiny, { grams: 46.4, measured_at: at(10) }]).sudden.reweigh,
      true,
    );
    assert.equal(
      computeWeightBaseline([...tiny, { grams: 47, measured_at: at(10) }]).sudden.reweigh,
      false,
    );
    const thirty = days(Array.from({ length: 10 }, (_, i) => [i, 30] as [number, number]));
    assert.equal(
      computeWeightBaseline([...thirty, { grams: 28.2, measured_at: at(10) }]).sudden.reweigh,
      false,
    );
    // Only the last 7 days count, and only the same kind.
    r = computeWeightBaseline([
      ...days([
        [0, 100],
        [1, 100],
        [2, 100],
      ]),
      { grams: 89, measured_at: at(10) },
    ]);
    assert.equal(r.sudden.dropPct, null);
    r = computeWeightBaseline([
      ...days(
        [
          [27, 100],
          [28, 100],
          [29, 100],
        ],
        "after_meal",
      ),
      { grams: 89, measured_at: at(30), meal_relation: "before_meal" },
    ]);
    assert.equal(r.sudden.dropPct, null);
  },
);

check("the sudden drop ignores the usual and ideal weights", () => {
  // Usually 100 g, then a fortnight at 120 g, then 106 g: above usual, but a sudden drop.
  const rows = [
    ...steady(40),
    ...days(Array.from({ length: 10 }, (_, i) => [42 + i, 120] as [number, number])),
    { grams: 106, measured_at: at(52) },
  ];
  const r = computeWeightBaseline(rows, DEFAULT_BASELINE_RULES, { low: 95, high: 110 });
  assert.equal(r.tier, "none");
  assert.equal(r.sudden.reweigh, true);
  assert.equal(baselineCard(r), "sudden_reweigh");
});

check("one card at most, most serious first", () => {
  const none = {
    tier: "none" as const,
    hardLoss: false,
    reweigh: false,
    sudden: { reweigh: false, confirmed: false, dropPct: null },
  };
  assert.equal(baselineCard(none), null);
  assert.equal(baselineCard({ ...none, tier: "worth_watching" }), "worth_watching");
  assert.equal(baselineCard({ ...none, tier: "keep_an_eye", reweigh: true }), "reweigh");
  assert.equal(
    baselineCard({
      ...none,
      reweigh: true,
      sudden: { reweigh: true, confirmed: false, dropPct: 11 },
    }),
    "sudden_reweigh",
  );
  assert.equal(baselineCard({ ...none, tier: "learning", hardLoss: true }), "hard_loss");
  assert.equal(baselineCard({ ...none, tier: "shifted", hardLoss: true }), "shifted");
  assert.equal(
    baselineCard({
      ...none,
      tier: "shifted",
      sudden: { reweigh: false, confirmed: true, dropPct: 12 },
    }),
    "sudden_confirmed",
  );
});

check("a typed normal weight never stands in for the learned one", () => {
  // computeWeightBaseline takes only weigh-ins: a bird with few still learns,
  // whatever its care plan says its normal weight is.
  const r = computeWeightBaseline(
    days([
      [0, 100],
      [2, 100],
    ]),
  );
  assert.equal(r.tier, "learning");
  assert.equal(r.thresholds, null);
});

// ---------------------------------------------------------------------------
// The shadow log
// ---------------------------------------------------------------------------

check("a shadow row records the answer with and without the ideal range", () => {
  const hist = [...steady(40), { grams: 97, measured_at: at(46) }].map((w, i) => ({
    ...w,
    id: `h${i}`,
  }));
  const entry: PendingEntry = {
    id: "e1",
    bird_id: "b1",
    grams: 97,
    measured_at: at(48),
    meal_relation: null,
  };
  const later = { id: "late", grams: 60, measured_at: at(49) };
  const row = shadowRowFor(entry, [...hist, later], { low: 95, high: 105 });
  assert.equal(row.weight_entry_id, "e1");
  assert.equal(row.learned, true);
  assert.equal(row.normal_grams, 100);
  assert.equal(row.wobble_pct, 1.48);
  assert.equal(row.worth_watching_pct, 2.96);
  assert.equal(row.tier, "worth_watching");
  assert.equal(row.card, "worth_watching");
  assert.equal(row.has_ideal, true);
  assert.equal(row.tier_with_ideal, "none");
  assert.equal(row.card_with_ideal, null);
  assert.equal(row.rules_version, rulesVersion());
  // The entry counts once even when the history already has it; later weigh-ins don't count.
  const again = shadowRowFor(entry, [...hist, { ...entry }, later], null);
  assert.equal(again.tier, "worth_watching");
  assert.equal(again.has_ideal, false);
  assert.equal(again.tier_with_ideal, again.tier);
});

check("the rules version changes when a value does", () => {
  assert.match(rulesVersion(), /^[0-9a-f]{8}$/);
  assert.equal(rulesVersion(), rulesVersion({ ...DEFAULT_BASELINE_RULES }));
  assert.notEqual(rulesVersion(), rulesVersion({ ...DEFAULT_BASELINE_RULES, suddenDropPct: 9 }));
});

await checkAsync(
  "the shadow run logs every pending weigh-in, and a failed bird waits",
  async () => {
    const saved: ShadowRow[] = [];
    const pending: PendingEntry[] = [
      { id: "a1", bird_id: "A", grams: 100, measured_at: at(48), meal_relation: null },
      { id: "b1", bird_id: "B", grams: 50, measured_at: at(48), meal_relation: null },
      { id: "a2", bird_id: "A", grams: 88, measured_at: at(49), meal_relation: null },
    ];
    const histories: Record<string, WeighIn[]> = { A: steady(40) };
    const asked: string[] = [];
    const res = await runWeightBaselineShadow({
      pending: async () => pending,
      history: async (bird, since, until) => {
        asked.push(`${bird} ${since.slice(0, 10)} ${until.slice(0, 10)}`);
        if (!histories[bird]) throw new Error("boom");
        return histories[bird];
      },
      ideals: async (ids) => {
        assert.deepEqual(ids.sort(), ["A", "B"]);
        return new Map([["A", { low: 90, high: 110 }]]);
      },
      save: async (rows) => {
        saved.push(...rows);
        return rows.length;
      },
    });
    assert.deepEqual(res, { logged: 2, failedBirds: 1, more: false });
    assert.deepEqual(
      saved.map((r) => r.weight_entry_id),
      ["a1", "a2"],
    );
    assert.ok(saved.every((r) => r.has_ideal));
    assert.equal(saved[1].tier, "none"); // one low reading…
    assert.equal(saved[1].reweigh, true); // …asks to weigh again
    assert.equal(saved[1].reweigh_with_ideal, true); // a top-level drop is never quieted
    // History reaches back far enough for the normal and the month before.
    assert.deepEqual(asked[0], `A ${at(48 - 91).slice(0, 10)} ${at(49).slice(0, 10)}`);
  },
);

// ---------------------------------------------------------------------------
// The replay
// ---------------------------------------------------------------------------

check("the replay counts crossings, not weigh-ins", () => {
  const low = [50, 51, 52, 53].map((d) => ({ grams: 88, measured_at: at(d) }));
  const b = replayBird("Bird 1", [...steady(40), ...low]);
  assert.equal(b.weighIns, 21 + 4);
  assert.equal(b.fired.shifted, 1);
  // Reaching the top level crosses the two tiers below it on the way.
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
  assert.equal(b.fired.shifted, 0);
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
  assert.equal(rep.totals.shifted, 1);
  assert.equal(rep.totals.birdsWithAny.shifted, 1);
  assert.equal(rep.birds[0].label, "Bird 1");
  assert.equal(rep.birds[1].daysToLearn, null);
  const md = formatReplay(rep);
  assert.ok(
    !md.includes("aaa111") && !md.includes("bbb222"),
    "the report never carries a bird's key",
  );
  assert.match(md, /Weight has shifted \(top level\): fired 1 times, for 1 birds/);
  assert.ok(!/call your vet/i.test(md), "the report never says 'call your vet'");
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
