// The guided setup's steps, in flow order. Kept apart from the SetupShell
// component so server code (completeness checks) can use the order without
// pulling in UI.
export const SETUP_STEPS = [
  // Details (name, species, photo…) is the Add-a-bird page, which saves the bird
  // before the wizard opens. Food → Health are the basics; the wizard then offers
  // a stop point before the pet-sitter details (Behavior, Tips, Day). Then the
  // owner's shared "Your home" screens (reminders, emergency contacts), which
  // the walkthrough skips once they're filled in.
  // Food still comes before Day because Day auto-derives feeding/water items
  // from Food. Review is the finishing screen, not a numbered step.
  { key: "food", title: "Food & water", short: "Food" },
  { key: "health", title: "Health baseline", short: "Health" },
  { key: "personality", title: "Personality & handling", short: "Behavior" },
  { key: "clips", title: "Tips from the owner", short: "Clips" },
  { key: "day", title: "A day in the life", short: "Routine" },
  { key: "environment", title: "Reminders for your sitter", short: "Reminders" },
  { key: "emergency", title: "Emergency contacts", short: "Emergency" },
  { key: "review", title: "Review & finish", short: "Review" },
] as const;

export const TOTAL_STEPS = SETUP_STEPS.length;
/** Steps counted in "Step N of M": everything before the Review screen. */
export const NUMBERED_STEPS = TOTAL_STEPS - 1;

export type SetupStepKey = (typeof SETUP_STEPS)[number]["key"];

/** 1-indexed position of a step in the current flow. */
export function setupStepNumber(key: SetupStepKey): number {
  return SETUP_STEPS.findIndex((s) => s.key === key) + 1;
}
