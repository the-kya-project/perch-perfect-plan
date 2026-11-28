// One switch per care-app feature that isn't health content (off / admins /
// everyone), in public.care_features (20261123100000_care_features.sql). Read
// with `care_feature_enabled(feature)`; change in the SQL editor with
// `select public.admin_set_care_feature('<feature>', 'admins');`.
// Health features have their own switches: src/lib/healthFeatures.ts.
//
// The list must match the migration's rows and supabase/checks/
// care_features_checks.sql (npm run test:today-card).

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type CareAudience = "off" | "admins" | "everyone";

export type CareFeature = {
  feature: string;
  /** The audience the migration seeds. */
  startsAt: CareAudience;
};

export const CARE_FEATURES: readonly CareFeature[] = [
  // The seasonal and holiday Today card on Home (backlog D2.1).
  { feature: "today_cards", startsAt: "off" },
  // Care badges on the bird page and its Badges screen (backlog 1.13b,
  // 20261128160000_care_badges.sql, src/lib/careBadges.ts).
  { feature: "care_badges", startsAt: "off" },
  // Heat and cold cards on Home by the owner's home ZIP or postcode, and the
  // Account field for it (backlog D2.2, 20261128190000_weather_cards.sql,
  // src/lib/weatherCards.ts).
  { feature: "weather_cards", startsAt: "off" },
];

/** Fails closed: an error (or a database without the switch yet, like staging
 *  before the migration merges) is `false`. */
export async function fetchCareFeatureEnabled(feature: string): Promise<boolean> {
  // Not in the generated types yet.
  const { data, error } = await (supabase.rpc as any)("care_feature_enabled", {
    p_feature: feature,
  });
  if (error) return false;
  return data === true;
}

/** Five minutes: a switch only changes when someone flips it in the SQL editor. */
export function useCareFeature(feature: string): boolean | undefined {
  const { data } = useQuery({
    queryKey: ["care-feature", feature],
    staleTime: 5 * 60_000,
    queryFn: () => fetchCareFeatureEnabled(feature),
  });
  return data;
}
