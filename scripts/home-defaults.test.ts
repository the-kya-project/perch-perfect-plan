// Run: npm run test:home-defaults
// Shared "Your home" reminders: a bird's own answer wins, shared answers fill
// the rest, and the first save brings matching birds along.
import assert from "node:assert/strict";
import { mergeHome, homeDifferences, followSharedPatch, clearOwnPatch, seedShared, birdHasOwn } from "../src/lib/homeDefaults";

const shared = { hazards: ["Ceiling fans", "Other pets"], hazards_other: null, off_limits: "Kitchen", other_pets: "A cat", cleaning_instructions: "No bleach" };
const empty = { id: "p0", hazards: [], hazards_other: null, off_limits: null, off_limits_rooms: null, other_pets: null, cleaning_instructions: null, cage_location: "Den" };

// 1. A bird with no answers of its own shows the shared ones; other fields stay.
const m = mergeHome(empty, shared) as any;
assert.deepEqual(m.hazards, ["Ceiling fans", "Other pets"]);
assert.equal(m.off_limits, "Kitchen");
assert.equal(m.other_pets, "A cat");
assert.equal(m.cleaning_instructions, "No bleach");
assert.equal(m.cage_location, "Den", "per-bird fields untouched");
assert.notEqual(m, empty, "returns a new object");

// 2. A bird's own answer wins, group by group (no mixing of hazard chips).
const own = { ...empty, hazards: ["Open windows"], other_pets: "Two dogs" };
const m2 = mergeHome(own, shared) as any;
assert.deepEqual(m2.hazards, ["Open windows"]);
assert.equal(m2.other_pets, "Two dogs");
assert.equal(m2.off_limits, "Kitchen");

// 3. "Other hazards" text alone counts as the bird's own hazards answer.
assert.equal(birdHasOwn({ hazards: [], hazards_other: "Wood stove" }, "hazards"), true);
// 4. The old off_limits_rooms mirror counts as an off-limits answer.
assert.equal(birdHasOwn({ off_limits: null, off_limits_rooms: "Bedroom" }, "off_limits"), true);

// 5. No shared row: the plan passes through unchanged.
assert.equal(mergeHome(own, null), own);
assert.equal(mergeHome(null, shared), null);

// 6. Differences: only groups where the bird's own answer differs.
assert.deepEqual(homeDifferences(own, shared), ["hazards", "other_pets"]);
assert.deepEqual(homeDifferences({ ...empty, hazards: ["Other pets", "Ceiling fans"] }, shared), [], "chip order doesn't matter");
assert.deepEqual(homeDifferences(empty, shared), []);
assert.deepEqual(homeDifferences(own, null), ["hazards", "other_pets"], "with no shared row, any answer is its own");

// 7. First save: matching groups are cleared so they follow; different ones stay.
const matching = { ...empty, off_limits: " Kitchen ", off_limits_rooms: "Kitchen", other_pets: "Two dogs" };
assert.deepEqual(followSharedPatch(matching, shared), { off_limits: null, off_limits_rooms: null });
assert.equal(followSharedPatch(empty, shared), null, "nothing to clear");
assert.deepEqual(clearOwnPatch(), { hazards: [], hazards_other: null, off_limits: null, off_limits_rooms: null, other_pets: null, cleaning_instructions: null });

// 8. Seeding the first shared answers: this bird's own, else what most others share.
const others = [
  { ...empty, other_pets: "A cat", cleaning_instructions: "Vinegar" },
  { ...empty, other_pets: "A cat" },
  { ...empty, other_pets: "Two dogs" },
];
const seed = seedShared({ ...empty, cleaning_instructions: "No bleach" }, others);
assert.equal(seed.other_pets, "A cat", "most common among other birds");
assert.equal(seed.cleaning_instructions, "No bleach", "this bird's own answer first");
assert.deepEqual(seed.hazards, []);

console.log("home-defaults: all passed");
