// Shared helper for computing how complete a bird's care plan setup is.
// Mirrors the "before you share" checks in the Review step.

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

  // Step numbers mirror SETUP_STEPS in SetupShell (food=1 … emergency=7).
  // Daily rhythm is placed after the descriptive sections so it can synthesize
  // the full care picture; Food still comes first because Routine auto-derives
  // feeding/water items from Food. `key` lets callers map a check to a section.
  const checks: SetupCheck[] = [
    {
      step: 1,
      key: "food",
      label: "Food & water",
      done: nonEmpty(plan?.diet_types) || nonEmpty(plan?.food_instructions),
    },
    {
      step: 2,
      key: "personality",
      label: "Personality & handling",
      done: nonEmpty(plan?.handlers) || nonEmpty(plan?.likes) || nonEmpty(plan?.fears_triggers),
    },
    {
      step: 3,
      key: "environment",
      label: "Environment & safety",
      done:
        nonEmpty(plan?.cage_location) ||
        nonEmpty(plan?.out_of_cage_mode) ||
        nonEmpty(plan?.hazards),
    },
    {
      step: 4,
      key: "health",
      label: "Health baseline",
      done:
        nonEmpty(bird?.normal_weight) ||
        nonEmpty(plan?.baseline_clip_path) ||
        nonEmpty(plan?.whats_normal),
    },
    {
      step: 5,
      key: "day",
      label: "A day in the life",
      done: (tasksCount ?? 0) > 0,
    },
    {
      step: 6,
      key: "clips",
      label: "Tips from the owner",
      done:
        nonEmpty(plan?.clip_step_up_path) ||
        nonEmpty(plan?.clip_food_water_path) ||
        nonEmpty(plan?.clip_locations_path) ||
        nonEmpty(plan?.clip_bedtime_path),
    },
    {
      step: 7,
      key: "emergency",
      label: "Emergency info",
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
