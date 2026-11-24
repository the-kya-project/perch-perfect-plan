// Reads one health feature's switch (src/lib/healthFeatures.ts) for the
// signed-in person: `health_feature_enabled(feature)`.

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Fails closed: an error (or a database without the switch) is `false`. */
export async function fetchHealthFeatureEnabled(feature: string): Promise<boolean> {
  // Not in the generated types yet.
  const { data, error } = await (supabase.rpc as any)("health_feature_enabled", {
    p_feature: feature,
  });
  if (error) return false;
  return data === true;
}

/** Five minutes: a switch only changes when someone flips it in the SQL editor. */
export function useHealthFeature(feature: string): boolean | undefined {
  const { data } = useQuery({
    queryKey: ["health-feature", feature],
    staleTime: 5 * 60_000,
    queryFn: () => fetchHealthFeatureEnabled(feature),
  });
  return data;
}
