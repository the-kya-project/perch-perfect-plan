// Single source of truth for household member capabilities + presets.
// The DB migration's CHECK constraint and backfill, the (future) RLS policies
// that call has_capability(), and the (future) permissions UI all key off these.
// Keep these EXACTLY in sync with the hmp_caps_valid / hmp_preset_valid checks
// in supabase/migrations/*_household_member_permissions.sql.
//
// "View everything" is the baseline for any household member — always true,
// never stored — so there is no "view" capability here. (has_capability() treats
// the literal 'view' specially: true for any member; it is not a stored key.)

export const CAPABILITIES = [
  "log_daily_care",
  "record_health",
  "edit_care_plans",
  "manage_emergency",
  "manage_sits",
  "manage_flock",
  "manage_household",
] as const;
export type Capability = (typeof CAPABILITIES)[number];

export const CAPABILITY_LABELS: Record<Capability, string> = {
  log_daily_care: "Log daily care",
  record_health: "Record health",
  edit_care_plans: "Edit care plans",
  manage_emergency: "Manage emergency info",
  manage_sits: "Manage sits",
  manage_flock: "Manage the flock",
  manage_household: "Manage the household",
};

export const PRESETS = ["viewer", "caregiver", "care_manager", "co_owner", "custom"] as const;
export type Preset = (typeof PRESETS)[number];

export const PRESET_LABELS: Record<Preset, string> = {
  viewer: "Viewer",
  caregiver: "Caregiver",
  care_manager: "Care manager",
  co_owner: "Co-owner",
  custom: "Custom",
};

// The presets an owner can ASSIGN (e.g. the invite picker / permissions screen).
// "custom" is a derived state, not a thing you pick, so it's excluded.
export const ASSIGNABLE_PRESETS = ["viewer", "caregiver", "care_manager", "co_owner"] as const;
export type AssignablePreset = (typeof ASSIGNABLE_PRESETS)[number];

// One-line description per assignable preset — keep in sync with PRESET_CAPABILITIES.
export const PRESET_DESCRIPTIONS: Record<AssignablePreset, string> = {
  viewer: "Can see everything; can't make changes.",
  caregiver: "Can log daily care and record health.",
  care_manager: "Caregiver, plus edit care plans, emergency info, and sits.",
  co_owner: "Full access, like a second owner.",
};

// Preset → granted capabilities. "custom" is arbitrary (no fixed bundle).
export const PRESET_CAPABILITIES: Record<Exclude<Preset, "custom">, Capability[]> = {
  viewer: [],
  caregiver: ["log_daily_care", "record_health"],
  care_manager: ["log_daily_care", "record_health", "edit_care_plans", "manage_emergency", "manage_sits"],
  co_owner: [...CAPABILITIES],
};

/** Capabilities granted by a preset ("custom" has no fixed bundle → []). */
export function capabilitiesForPreset(preset: Preset): Capability[] {
  return preset === "custom" ? [] : PRESET_CAPABILITIES[preset];
}

/** The preset whose bundle exactly matches the given capabilities, else "custom". */
export function presetForCapabilities(capabilities: readonly string[]): Preset {
  const sorted = [...capabilities].sort().join(",");
  for (const p of ["viewer", "caregiver", "care_manager", "co_owner"] as const) {
    if ([...PRESET_CAPABILITIES[p]].sort().join(",") === sorted) return p;
  }
  return "custom";
}
