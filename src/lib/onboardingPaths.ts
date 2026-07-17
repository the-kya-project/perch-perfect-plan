/**
 * Quickstart onboarding: pure routing decisions, extracted so they're unit-
 * testable and there's exactly one statement of each rule.
 */

/** Where does a successful /birds/new submit land? Quickstart: Home (the
 * three-door invite takes over). Legacy: straight into the wizard. */
export function postAddBirdDestination(quickstart: boolean): "home" | "wizard" {
  return quickstart ? "home" : "wizard";
}

/** Where does "Create care plan" on an incomplete bird's record lead?
 * Quickstart: the care-profile overview (self-serve cards, with the guided
 * banner one tap away). Legacy: straight into the wizard. */
export function incompleteBirdCareCta(quickstart: boolean): "plan" | "wizard" {
  return quickstart ? "plan" : "wizard";
}
