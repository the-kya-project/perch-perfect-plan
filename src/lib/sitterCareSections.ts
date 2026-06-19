// Which care-sheet sections actually render for the active bird, so the sitter
// onboarding care-plan walkthrough only points at sections that exist.
// IMPORTANT: keep these conditions in sync with the show* flags in
// routes/sitter/$token/care-sheet.tsx (data-coach targets cp-food / cp-handling
// / cp-home / cp-health / cp-emergency live on those sections).

function has(v: any): boolean {
  if (v == null) return false;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "string") return v.trim().length > 0;
  if (typeof v === "object") return Object.keys(v).length > 0;
  return true;
}

export type CareSectionKey = "food" | "handling" | "home" | "health" | "emergency";

export function presentCareSections(ctx: any): CareSectionKey[] {
  const bird = (ctx?.bird ?? {}) as any;
  const plan = (ctx?.plan ?? {}) as any;
  const diet = (plan.diet_types ?? []) as string[];
  const freshFoods = (plan.fresh_foods ?? []) as string[];
  const feedingTimes = (plan.feeding_times ?? []) as string[];
  const hazards = (plan.hazards ?? []) as string[];

  const showFeeding = !!(
    diet.length ||
    plan.food_brand ||
    plan.amount_value ||
    feedingTimes.length ||
    freshFoods.length ||
    plan.fresh_foods_other ||
    plan.treats_notes ||
    plan.treats_frequency ||
    plan.water_frequency ||
    plan.water_notes ||
    plan.food_storage ||
    plan.food_hygiene_notes ||
    plan.food_instructions ||
    plan.water_instructions ||
    plan.fresh_food_removal_minutes
  );
  const showHandling =
    has(plan.step_up) || has(plan.step_up_notes) || has(plan.handlers) || has(plan.likes) ||
    has(plan.fears_triggers) || has(plan.bite_risk) || has(plan.handling_rules) || has(plan.known_triggers);
  const showHome =
    has(plan.cage_location) || has(plan.out_of_cage_mode) || has(plan.out_of_cage_notes) ||
    has(plan.out_of_cage_rules) || hazards.length > 0 || has(plan.hazards_other) ||
    has(plan.off_limits) || has(plan.off_limits_rooms) || has(plan.safety_rules) || has(plan.other_pets);
  const showHealth =
    has(bird.normal_weight) || has(bird.normal_weight_min) || has(bird.normal_weight_max) ||
    has(plan.whats_normal) || has(plan.normal_appetite) || has(plan.normal_droppings) ||
    has(plan.normal_noise) || has(plan.normal_activity) || has(plan.normal_sleep) ||
    has(plan.normal_behavior_with_strangers) || has(bird.medical_conditions) || has(bird.medications) ||
    has(plan.medication_schedule) || !!ctx?.baselineDroppingsUrl || !!ctx?.baselineClipUrl;
  const showEmergency = has(plan.when_to_call_owner) || has(plan.when_to_call_vet);

  const out: CareSectionKey[] = [];
  if (showFeeding) out.push("food");
  if (showHandling) out.push("handling");
  if (showHome) out.push("home");
  if (showHealth) out.push("health");
  if (showEmergency) out.push("emergency");
  return out;
}
