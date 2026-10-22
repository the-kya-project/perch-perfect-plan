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

/** Shared by the hook, the /flock route guard and the last-mode check, so all
 *  three read one cached answer. Five minutes: it only changes when someone's
 *  role does, and every non-admin pays this one RPC. */
export const FLOCK_ENABLED_QUERY = {
  queryKey: ["flock-enabled"] as const,
  staleTime: 5 * 60_000,
  queryFn: fetchFlockEnabled,
};

export function useFlockEnabled(): boolean | undefined {
  const { data } = useQuery(FLOCK_ENABLED_QUERY);
  return data;
}

// ---- Last mode, per device ------------------------------------------------
// Which side of the app this device was last in, so reopening the app returns
// there. Only ever acted on after the server confirms flock_enabled(); anyone
// else always opens in care (and the stored value is cleared).

export type AppMode = "care" | "flock";
const MODE_KEY = "kya_mode";

export function rememberMode(mode: AppMode): void {
  try { localStorage.setItem(MODE_KEY, mode); } catch { /* private mode etc. */ }
}

export function rememberedMode(): AppMode {
  try { return localStorage.getItem(MODE_KEY) === "flock" ? "flock" : "care"; } catch { return "care"; }
}
