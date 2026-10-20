// Where a bird is in the guided setup, as stored in birds.setup_step.
//
// The step order changed (Food → Health → stop point → Behavior → Tips → Day …).
// Values written before the change are 1–8 in the OLD order, so new values are
// stored as 100 + the step's position in SETUP_STEPS. That keeps old and new
// apart without a schema change: anything under 100 is read in the old order.
import { TOTAL_STEPS, setupStepNumber, type SetupStepKey } from "@/lib/setupSteps";

const OFFSET = 100;

// The order before the change, for reading values saved under it.
const LEGACY_ORDER: SetupStepKey[] = ["food", "personality", "environment", "health", "day", "clips", "emergency", "review"];
// In the old order, step 5 (Day) came after Food and Health were both done.
const LEGACY_FIRST_AFTER_BASICS = 5;

/** The value to store in birds.setup_step for a 1-indexed step in the current flow. */
export function encodeSetupStep(step: number): number {
  return OFFSET + step;
}

/** True once Food and Health are done: the bird has reached the stop point. */
export function basicsDone(stored: number | null | undefined, setupComplete?: boolean | null): boolean {
  if (setupComplete) return true;
  if (stored == null) return false;
  if (stored > OFFSET) return stored - OFFSET >= setupStepNumber("personality");
  return stored >= LEGACY_FIRST_AFTER_BASICS;
}

/** True once the owner has started the walkthrough: every bird added since the
 *  reorder, and older birds that got past the first step. */
export function setupStarted(stored: number | null | undefined): boolean {
  if (stored == null) return false;
  return stored > OFFSET || stored >= 2;
}

/** The step (1-indexed, current order) to pick up at. Older values are read in
 *  the old order and mapped to the same step in the new one. */
export function resumeStep(stored: number | null | undefined): number {
  if (stored == null) return 1;
  if (stored > OFFSET) return Math.min(TOTAL_STEPS, Math.max(1, stored - OFFSET));
  const key = LEGACY_ORDER[stored - 1];
  return key ? setupStepNumber(key) : 1;
}
