// Shared helper for computing how complete a bird's care plan setup is.
// Mirrors the "before you share" checks in the Review step.

export type SetupCheck = {
  step: number;
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

  const checks: SetupCheck[] = [
    {
      step: 1,
      label: "The basics",
      // Bird record exists by definition once we're past /birds/new.
      // Species is the only optional basics field, but a bird row always means basics submitted.
      done: !!bird,
    },
    {
      step: 2,
      label: "A day in the life",
      done: (tasksCount ?? 0) > 0,
    },
    {
      step: 3,
      label: "Food & water",
      done: nonEmpty(plan?.diet_types) || nonEmpty(plan?.food_instructions),
    },
    {
      step: 4,
      label: "Personality & handling",
      done: nonEmpty(plan?.handlers) || nonEmpty(plan?.likes) || nonEmpty(plan?.fears_triggers),
    },
    {
      step: 5,
      label: "Environment & safety",
      done:
        nonEmpty(plan?.cage_location) ||
        nonEmpty(plan?.out_of_cage_mode) ||
        nonEmpty(plan?.hazards),
    },
    {
      step: 6,
      label: "Health baseline",
      done:
        nonEmpty(bird?.normal_weight) ||
        nonEmpty(plan?.baseline_droppings_path) ||
        nonEmpty(plan?.baseline_clip_path) ||
        nonEmpty(plan?.whats_normal),
    },
    {
      step: 7,
      label: "Watch-first clips",
      done:
        nonEmpty(plan?.clip_step_up_path) ||
        nonEmpty(plan?.clip_food_water_path) ||
        nonEmpty(plan?.clip_locations_path) ||
        nonEmpty(plan?.clip_bedtime_path),
    },
    {
      step: 8,
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
