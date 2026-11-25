// One switch per health feature (off / admins / everyone), in
// public.health_features (20261122203000_health_features.sql). Read with
// `health_feature_enabled(feature)`; change in the SQL editor with
// `select public.admin_set_health_feature('<feature>', 'admins');`.
//
// A feature without an avian vet's approval stays off (or admins only) while
// everything else works. Its values are in src/lib/healthRules.ts.
//
// `wired` says whether the app reads the switch yet. The live features
// started at 'everyone' and aren't wired: turning one off does nothing. The
// daily health check, weight trend, emergency guides and passing guidance stay
// that way on purpose (Brittany, Nov 23, 2026). The list must match the
// migration's rows (npm run test:health-rules).

export type HealthAudience = "off" | "admins" | "everyone";

export type HealthFeature = {
  feature: string;
  /** The audience the migration seeds. */
  startsAt: HealthAudience;
  wired: boolean;
};

export const HEALTH_FEATURES: readonly HealthFeature[] = [
  { feature: "daily_health_check", startsAt: "everyone", wired: false },
  { feature: "care_weight_trend", startsAt: "everyone", wired: false },
  { feature: "emergency_guides", startsAt: "everyone", wired: false },
  { feature: "passing_guidance", startsAt: "everyone", wired: false },
  { feature: "diet_conversion", startsAt: "everyone", wired: false },
  { feature: "vet_nudge", startsAt: "everyone", wired: false },
  // The weight page's usual range, celebration, alert cards and ideal weight
  // field (backlog D1.2, useHealthFeature). The shadow log runs for every
  // bird whatever the switch says, and shows nothing to anyone.
  { feature: "weight_baseline", startsAt: "off", wired: true },
  // The eclectus alert before Diet conversion's vet card (backlog 1.20d,
  // 20261125030000_diet_starting_weight.sql), until a vet approves its wording.
  { feature: "diet_eclectus_alert", startsAt: "off", wired: true },
];
