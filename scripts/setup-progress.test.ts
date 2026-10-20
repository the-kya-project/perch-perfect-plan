// Run: npm run test:setup-progress
// Saved setup progress: values from before the step reorder (1–8, old order)
// and after it (100 + position) must both read correctly.
import assert from "node:assert/strict";
import { basicsDone, encodeSetupStep, setupStarted, resumeStep } from "../src/lib/setupProgress";
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

// Started vs not, and where to pick up.
assert.equal(setupStarted(null), false);
assert.equal(setupStarted(1), false, "old bird that never left the first step");
assert.equal(setupStarted(4), true, "old bird on Health");
assert.equal(setupStarted(encodeSetupStep(1)), true, "new bird, on Food");
assert.equal(resumeStep(encodeSetupStep(2)), setupStepNumber("health"));
assert.equal(resumeStep(4), setupStepNumber("health"), "old 4 (Health) resumes at Health");
assert.equal(resumeStep(2), setupStepNumber("personality"), "old 2 (Behavior) resumes at Behavior");
assert.equal(resumeStep(null), 1);
assert.equal(resumeStep(encodeSetupStep(99)), 8, "clamped to the last step");

console.log("setup-progress: all passed");
