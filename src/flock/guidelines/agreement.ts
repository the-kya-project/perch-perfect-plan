// Has this person agreed to the current community guidelines? Flock code only:
// the /flock layout and the walk-through import this; shared code never does.
//
// The database is the record and the real guard (20261128180000): a row in
// flock_guideline_agreements at current_guidelines_version(), and a trigger
// that refuses posts, comments and shared-journey updates without one. This
// file only decides when the app shows the walk-through.
import type { QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { GUIDELINES_VERSION } from "./version";

const sb = supabase as any;

export const GUIDELINES_AGREED_KEY = ["flock", "guidelines-agreed", GUIDELINES_VERSION] as const;

/** PostgREST / Postgres "that function isn't there": the migration hasn't
 *  reached this database yet (a preview on staging before merge). The server
 *  then has no agreement rule to enforce either, so the app behaves exactly as
 *  it did before this feature instead of trapping people on a screen whose
 *  button can't save. */
function isMissingFunction(e: { code?: string; message?: string } | null | undefined): boolean {
  return e?.code === "PGRST202" || e?.code === "42883" || /could not find the function/i.test(e?.message ?? "");
}

/** Cached for the session (staleTime Infinity) and refreshed when the app
 *  comes back to the foreground (useGuidelinesResumeRefresh). Runs only after
 *  flock_enabled() is true, so free users with the Flock closed never call it. */
export const GUIDELINES_AGREED_QUERY = {
  queryKey: GUIDELINES_AGREED_KEY,
  staleTime: Infinity,
  gcTime: Infinity,
  queryFn: async (): Promise<boolean> => {
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id;
    if (!uid) return false;
    const { data, error } = await sb.rpc("has_agreed_to_guidelines", { uid });
    if (error) {
      if (isMissingFunction(error)) return true;
      throw error;
    }
    return data === true;
  },
};

/** Paths open before agreeing: the walk-through itself, and the full
 *  guidelines it links to (which come back to screen 3). */
export function isWalkthroughPath(pathname: string): boolean {
  return pathname === "/flock/agree" || pathname.startsWith("/flock/agree/") || pathname === "/flock/guidelines";
}

// Whether the walk-through is on screen in this tab. While it is, a
// navigation to any other Flock screen before agreeing is someone backing out
// (the system Back lands on the /flock entry the redirect left in history), so
// the layout sends them Home instead of looping back into the walk-through.
let walkthroughOpen = false;
export function setWalkthroughOpen(open: boolean): void { walkthroughOpen = open; }
export function isWalkthroughOpen(): boolean { return walkthroughOpen; }

/** Record the agreement. Agreeing twice (another tab got there first) counts
 *  as agreed. */
export async function agreeToGuidelines(qc: QueryClient): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) throw new Error("signed_out");
  const { error } = await sb.from("flock_guideline_agreements").insert({ user_id: uid, version: GUIDELINES_VERSION });
  if (error && error.code !== "23505") throw error;
  qc.setQueryData(GUIDELINES_AGREED_KEY, true);
}

/** Refresh the cached answer when the app returns from the background, so a
 *  version bump (or an agreement in another tab) is picked up without a reload. */
export function watchGuidelinesOnResume(qc: QueryClient): () => void {
  if (typeof document === "undefined") return () => {};
  const recheck = () => {
    if (document.visibilityState === "visible") void qc.invalidateQueries({ queryKey: GUIDELINES_AGREED_KEY });
  };
  document.addEventListener("visibilitychange", recheck);
  return () => document.removeEventListener("visibilitychange", recheck);
}
