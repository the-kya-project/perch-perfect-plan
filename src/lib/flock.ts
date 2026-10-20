import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Whether to show any Flock entry point to the signed-in user. Backed by the
 * `flock_enabled()` RPC, which is true only for admins until launch; widening
 * it is a database change, not an app release.
 *
 * Fails closed: an error or a signed-out caller is `false`. `undefined` while
 * loading. Use for UI gating only — RLS on the Flock tables is the real
 * enforcement.
 */
export async function fetchFlockEnabled(): Promise<boolean> {
  const { data, error } = await supabase.rpc("flock_enabled");
  if (error) return false;
  return data === true;
}

export function useFlockEnabled(): boolean | undefined {
  const { data } = useQuery({
    queryKey: ["flock-enabled"],
    staleTime: 60_000,
    queryFn: fetchFlockEnabled,
  });
  return data;
}
