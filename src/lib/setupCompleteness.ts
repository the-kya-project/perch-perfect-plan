// Shared helper for computing how complete a bird's care plan setup is.
// Mirrors the "before you share" checks in the Review step.

import i18next from "i18next";
import { setupStepNumber } from "@/lib/setupSteps";

export type SetupCheck = {
  step: number;
  /** Matches the SETUP_STEPS key in SetupShell — lets callers map a check to a section icon/row. */
  key: "food" | "day" | "personality" | "environment" | "health" | "clips" | "emergency";
  label: string;
  done: boolean;
};

export type SetupCompleteness = {
  checks: SetupCheck[];
  doneCount: number;
  total: number;
  pct: number; // 0-100
  firstIncompleteStep: number | null;
};

function nonEmpty(v: any) {
  if (v == null) return false;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "string") return v.trim().length > 0;
  if (typeof v === "number") return !Number.isNaN(v);
  return true;
}

export function computeSetupCompleteness(args: {
  bird?: { species?: string | null; normal_weight?: number | null } | null;
  plan?: any | null;
  tasksCount?: number;
  contacts?: any | null;
  defaults?: any | null;
}): SetupCompleteness {
  const { bird, plan, tasksCount = 0, contacts, defaults } = args;
  const eff = (k: string) =>
    (contacts?.[k] ?? "").toString().trim() ||
    (defaults?.[k] ?? "").toString().trim();

  // Listed in flow order; step numbers come from SETUP_STEPS, so they follow
  // any reorder.
  const checks: SetupCheck[] = [
    {
      step: setupStepNumber("food"),
      key: "food",
      label: i18next.t("setupCheck.food", "Food & water"),
      done: nonEmpty(plan?.diet_types) || nonEmpty(plan?.food_instructions),
    },
    {
      step: setupStepNumber("health"),
      key: "health",
      label: i18next.t("setupCheck.health", "Health baseline"),
      done:
        nonEmpty(bird?.normal_weight) ||
        nonEmpty(plan?.baseline_clip_path) ||
        nonEmpty(plan?.whats_normal),
    },
    {
      step: setupStepNumber("personality"),
      key: "personality",
      label: i18next.t("setupCheck.personality", "Personality & handling"),
      done:
        nonEmpty(plan?.handlers) || nonEmpty(plan?.likes) || nonEmpty(plan?.fears_triggers) ||
        nonEmpty(plan?.cage_location) || nonEmpty(plan?.out_of_cage_mode),
    },
    {
      step: setupStepNumber("clips"),
      key: "clips",
      label: i18next.t("setupCheck.clips", "Tips from the owner"),
      done:
        nonEmpty(plan?.clip_step_up_path) ||
        nonEmpty(plan?.clip_food_water_path) ||
        nonEmpty(plan?.clip_locations_path) ||
        nonEmpty(plan?.clip_bedtime_path) ||
        nonEmpty(plan?.clip_food_prep_path) ||
        nonEmpty(plan?.clip_toys_foraging_path) ||
        nonEmpty(plan?.clip_targeting_path) ||
        nonEmpty(plan?.clip_anything_else_path),
    },
    {
      step: setupStepNumber("day"),
      key: "day",
      label: i18next.t("setupCheck.day", "A day in the life"),
      done: (tasksCount ?? 0) > 0,
    },
    {
      step: setupStepNumber("environment"),
      key: "environment",
      label: i18next.t("setupCheck.reminders", "Reminders for your sitter"),
      // Cage location and out-of-cage rules count toward Behavior now; this is
      // the home-wide part (hazards, off-limits, other pets, cleaning).
      done:
        nonEmpty(plan?.hazards) ||
        nonEmpty(plan?.hazards_other) ||
        nonEmpty(plan?.off_limits) ||
        nonEmpty(plan?.other_pets) ||
        nonEmpty(plan?.cleaning_instructions),
    },
    {
      step: setupStepNumber("emergency"),
      key: "emergency",
      label: i18next.t("setupCheck.emergencyContacts", "Emergency contacts"),
      done: !!eff("owner_phone") && !!eff("avian_vet_phone"),
    },
  ];

  const total = checks.length;
  const doneCount = checks.filter((c) => c.done).length;
  const pct = Math.round((doneCount / total) * 100);
  const firstIncomplete = checks.find((c) => !c.done);
  return {
    checks,
    doneCount,
    total,
    pct,
    firstIncompleteStep: firstIncomplete ? firstIncomplete.step : null,
  };
}
