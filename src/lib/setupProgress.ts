// Where a bird is in the guided setup, as stored in birds.setup_step.
//
// The step order changed (Food → Health → stop point → Behavior → Tips → Day …).
// Values written before the change are 1–8 in the OLD order, so new values are
// stored as 100 + the step's position in SETUP_STEPS. That keeps old and new
// apart without a schema change: anything under 100 is read in the old order.
import { setupStepNumber } from "@/components/SetupShell";

const OFFSET = 100;

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
