// Run: npm run test:copy-from-bird
// "Start from another bird?": Food copies everything but amounts; Day copies
// the owner's own tasks only, with no clock times.
import assert from "node:assert/strict";
import { foodCopy, dayCopy, hasFoodToCopy, isOwnTask } from "../src/lib/copyFromBird";

const source = {
  id: "plan-echo", bird_id: "echo", cage_location: "Den",
  diet_types: ["pelleted", "chop"],
  diet_details: {
    pelleted: [{ name: "Harrison's", amount: "2", unit: "tbsp", times: [{ period: "morning" }], note: "Soak" }],
    chop: [{ name: "Homemade chop", homemade: true, amount: "1", unit: "cup", times: [], freeFed: true }],
  },
  food_brand: "Harrison's", amount_value: 2, amount_unit: "tbsp",
  fresh_foods: ["Carrot"], fresh_foods_other: "jicama",
  treats_notes: "Millet", treats_frequency: "training", never_feed: ["Chocolate"],
  water_frequency: "twice", water_notes: "Filtered", food_storage: "Pantry",
  fresh_food_removal_minutes: 60, food_bowl_wash_cadence: "daily", water_bowl_wash_cadence: "twice_daily",
  food_hygiene_notes: "Hot water",
};

// 1. Food: everything copies except amounts.
const f = foodCopy(source);
assert.deepEqual(f.diet_types, ["pelleted", "chop"]);
assert.equal(f.diet_details.pelleted[0].amount, "", "amount cleared");
assert.equal(f.diet_details.pelleted[0].unit, "tbsp", "unit kept");
assert.deepEqual(f.diet_details.pelleted[0].times, [{ period: "morning" }], "times kept");
assert.equal(f.diet_details.pelleted[0].note, "Soak", "note kept");
assert.equal(f.diet_details.chop[0].homemade, true);
assert.equal(f.diet_details.chop[0].freeFed, true);
assert.equal(f.amount_value, null, "legacy amount cleared");
assert.equal(f.food_brand, "Harrison's");
assert.deepEqual(f.fresh_foods, ["Carrot"]);
assert.equal(f.water_bowl_wash_cadence, "twice_daily");
assert.equal(f.food_hygiene_notes, "Hot water");
assert.equal("id" in f || "bird_id" in f || "cage_location" in f, false, "only food columns");
assert.equal(source.diet_details.pelleted[0].amount, "2", "source untouched");

// 2. Which plans have food to copy.
assert.equal(hasFoodToCopy(source), true);
assert.equal(hasFoodToCopy({ diet_types: [] }), false);
assert.equal(hasFoodToCopy(null), false);

// 3. Day: own tasks only, into the new plan, no clock times.
const tasks = [
  { id: "a", title: "Uncover cage", category: "morning", instructions: "Slowly", sort_order: 0, time_of_day: "7:00", required: true, sitter_completable: true, derived: null },
  { id: "b", title: "Feed: Harrison's", category: "morning", sort_order: 1, derived: null },
  { id: "c", title: "Give meds", category: "evening", sort_order: 0, derived: { kind: "med" } },
  { id: "d", title: "Playtime", category: "afternoon", sort_order: 2, required: false, sitter_completable: false, derived: null },
];
assert.equal(isOwnTask(tasks[0]), true);
assert.equal(isOwnTask(tasks[1]), false, "feeding task is generated");
assert.equal(isOwnTask(tasks[2]), false, "derived column marks generated");
const d = dayCopy(tasks, "plan-new");
assert.deepEqual(d.map((x) => x.title), ["Uncover cage", "Playtime"]);
assert.deepEqual(d[0], { care_plan_id: "plan-new", title: "Uncover cage", category: "morning", instructions: "Slowly", sort_order: 0, required: true, sitter_completable: true });
assert.equal("time_of_day" in d[0], false, "no clock times");
assert.equal("id" in d[0], false, "new rows get new ids");
assert.equal(d[1].required, false);
assert.equal(d[1].sitter_completable, false);

console.log("copy-from-bird: all passed");
