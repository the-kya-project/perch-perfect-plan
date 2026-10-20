// Run: npm run test:setup-progress
// Saved setup progress: values from before the step reorder (1–8, old order)
// and after it (100 + position) must both read correctly.
import assert from "node:assert/strict";
import { basicsDone, encodeSetupStep } from "../src/lib/setupProgress";
import { setupStepNumber } from "../src/components/SetupShell";

// New order: Food, Health, then the stop point, then Behavior.
assert.equal(setupStepNumber("food"), 1);
assert.equal(setupStepNumber("health"), 2);
assert.equal(setupStepNumber("personality"), 3);

// New values.
assert.equal(basicsDone(encodeSetupStep(1)), false, "on Food");
assert.equal(basicsDone(encodeSetupStep(2)), false, "on Health");
assert.equal(basicsDone(encodeSetupStep(3)), true, "past the stop point");
assert.equal(basicsDone(encodeSetupStep(8)), true, "on Review");

// Old values: 4 was Health (not done yet); 5 (Day) came after Food and Health.
assert.equal(basicsDone(2), false, "old Behavior: only Food done");
assert.equal(basicsDone(4), false, "old Health");
assert.equal(basicsDone(5), true, "old Day");

// Missing or finished.
assert.equal(basicsDone(null), false);
assert.equal(basicsDone(1, true), true, "a finished bird always counts");

console.log("setup-progress: all passed");
