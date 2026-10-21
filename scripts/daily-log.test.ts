/**
 * The daily weight & health check writes the same daily_logs shape as the full
 * scan, and the faded last weight in the box is a hint only.
 *
 *   npm run test:daily-log
 *
 * Plain asserts, since the repo carries no test runner. Exits non-zero on
 * failure so it can gate a merge.
 */
import assert from "node:assert/strict";
import { allNormalAnswers, answersWithChanges, buildDailyLogRow, weightToSave, bigWeightChange } from "@/lib/dailyLog";
import { SCAN_FIELDS } from "@/lib/triage";
import { buildHomeStateCopy, type HomeBird, type WeightEntry } from "@/lib/homeData";
import i18next from "i18next";
import { isUnreadScan } from "@/lib/notificationsFeed";

// Copy helpers fall back to their inline English once i18next is initialised.
await i18next.init({ lng: "en", resources: {}, keySeparator: false, nsSeparator: false });

let passed = 0;
function check(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ok   ${name}`); }
  catch (e) {
    console.log(`  FAIL ${name}\n       ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`);
    process.exitCode = 1;
  }
}

const ctx = { birdId: "b1", sitId: null, source: "owner" as const, runBy: "u1", logDate: "2026-10-19" };

check("all normal answers every question normal", () => {
  const a = allNormalAnswers();
  assert.equal(Object.keys(a).length, SCAN_FIELDS.length);
  assert.ok(Object.values(a).every((v) => v === "normal"));
});

check("all normal writes ten normal columns and triages green", () => {
  const { row, vomiting, triage } = buildDailyLogRow(allNormalAnswers(), ctx);
  const cols = ["alertness_status", "food_status", "droppings_status", "breathing_status", "posture_status", "behavior_status", "energy_status", "injury_status", "exposure_status"];
  for (const c of cols) assert.equal(row[c], "normal", c);
  assert.equal(vomiting, "normal");
  assert.equal(triage.status, "green");
  assert.equal(row.triage_status, "green");
  assert.equal(row.log_date, "2026-10-19");
  assert.equal(row.source, "owner");
});

check("one concerning on a red field triages red", () => {
  const red = SCAN_FIELDS.find((f) => f.redOnConcerning)!;
  const { row, triage } = buildDailyLogRow(answersWithChanges({ [red.key]: "concerning" }), ctx);
  assert.equal(triage.status, "red");
  assert.equal(row.triage_status, "red");
});

check("one not sure triages yellow, others stay normal", () => {
  const { row, triage } = buildDailyLogRow(answersWithChanges({ droppings: "not_sure" }), ctx);
  assert.equal(triage.status, "yellow");
  assert.equal(row.droppings_status, "not_sure");
  assert.equal(row.food_status, "normal");
});

check("noise and fluffed map to behavior and energy columns", () => {
  const { row } = buildDailyLogRow(answersWithChanges({ noise: "not_sure", fluffed: "concerning" }), ctx);
  assert.equal(row.behavior_status, "not_sure");
  assert.equal(row.energy_status, "concerning");
});

check("empty weight box saves no weight (hint only)", () => {
  assert.equal(weightToSave(""), null);
  assert.equal(weightToSave("   "), null);
});

check("typed weight saves, rounded to one decimal", () => {
  assert.equal(weightToSave("109"), 109);
  assert.equal(weightToSave("108.46"), 108.5);
});

check("out of range or junk weight is invalid", () => {
  assert.equal(weightToSave("0"), undefined);
  assert.equal(weightToSave("6000"), undefined);
  assert.equal(weightToSave("1.2.3"), undefined);
});

check("big weight change is flagged, small is not", () => {
  assert.equal(bigWeightChange(109, 1090), 900);
  assert.equal(bigWeightChange(109, 89), -18);
  assert.equal(bigWeightChange(109, 112), null);
  assert.equal(bigWeightChange(null, 112), null);
});

check("welcome line names every bird due for a weigh-in, like Updates", () => {
  const now = new Date("2026-10-19T09:00:00");
  const ago = (d: number) => new Date(now.getTime() - d * 86_400_000).toISOString();
  const birds = [
    { id: "a", name: "Buzz", is_foster: false },
    { id: "b", name: "Max", is_foster: false },
    { id: "c", name: "Echo", is_foster: false },
  ] as unknown as HomeBird[];
  const w = new Map<string, WeightEntry[]>([
    ["a", [{ bird_id: "a", grams: 480, measured_at: ago(12) } as WeightEntry]],
    ["b", [{ bird_id: "b", grams: 1100, measured_at: ago(15) } as WeightEntry]],
    ["c", [{ bird_id: "c", grams: 412, measured_at: ago(1) } as WeightEntry]],
  ]);
  assert.equal(buildHomeStateCopy(birds, w, [], [], now), "Buzz and Max are due for a weigh-in.");
  assert.equal(buildHomeStateCopy(birds.slice(1), w, [], [], now), "Max is due for a weigh-in.");
  w.set("c", [{ bird_id: "c", grams: 412, measured_at: ago(9) } as WeightEntry]);
  assert.equal(buildHomeStateCopy(birds, w, [], [], now), "Buzz, Echo, and Max are due for a weigh-in.");
  const four = [...birds, { id: "d", name: "Kiwi", is_foster: false }] as unknown as HomeBird[];
  w.set("d", [{ bird_id: "d", grams: 90, measured_at: ago(30) } as WeightEntry]);
  assert.equal(buildHomeStateCopy(four, w, [], [], now), "4 birds are due for a weigh-in.");
  // Never weighed: new, not overdue (same as the bell).
  w.delete("d");
  assert.equal(buildHomeStateCopy(four, w, [], [], now), "Buzz, Echo, and Max are due for a weigh-in.");
});

check("your own checks never light the bell; others' new ones do", () => {
  const seen = Date.parse("2026-10-19T08:00:00Z");
  assert.equal(isUnreadScan({ created_at: "2026-10-19T09:00:00Z", run_by: "me" }, seen, "me"), false);
  assert.equal(isUnreadScan({ created_at: "2026-10-19T09:00:00Z", run_by: "partner" }, seen, "me"), true);
  assert.equal(isUnreadScan({ created_at: "2026-10-19T09:00:00Z", run_by: null }, seen, "me"), true); // sitter
  assert.equal(isUnreadScan({ created_at: "2026-10-19T07:00:00Z", run_by: null }, seen, "me"), false);
});

console.log(`\n${passed} passed${process.exitCode ? ", some FAILED" : ""}`);
