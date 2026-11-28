// Joining the Flock (payments plan build C). Flock code only: the /flock
// layout, the join screen and the guidelines page import this; shared code
// never does.
//
// The database decides everything (20261122100000_flock_open_to_members.sql):
// flock_enabled() says whether the door is open to you, flock_my_access()
// where you stand, flock_agree() records your chapter and "I'm 18 or older"
// (the guidelines themselves are agreed in the walk-through, src/flock/guidelines/), and flock_join() (build B) gives you the free season unless
// you already have a membership (founders, chapter leads, members).
import { supabase } from "@/integrations/supabase/client";
import { FLOCK_GUIDELINES_VERSION } from "./flockGuidelines";
import { joinSource, trackFlockJoined, type JoinSource } from "./flockAnalytics";

const sb = supabase as any;

export type FlockAccess = {
  member_now: boolean;
  has_membership: boolean;
  agreed: boolean;
  is_admin: boolean;
  guidelines_version: string;
  opens_at: string | null;
  season_ends_at: string | null;
};

/** Called only once flock_enabled() is true (the /flock layout's guard), so
 *  free users with the members switch off never make this call. */
export const FLOCK_ACCESS_QUERY = {
  queryKey: ["flock", "access"] as const,
  staleTime: 60_000,
  queryFn: async (): Promise<FlockAccess | null> => {
    const { data, error } = await sb.rpc("flock_my_access");
    if (error) return null;
    const row = (Array.isArray(data) ? data[0] : data) as FlockAccess | undefined;
    return row ?? null;
  },
};

/** Paths a person who hasn't finished joining may open inside /flock: the
 *  join step, the guidelines and the rescue code form (backlog 1.16). */
export function isJoinPath(pathname: string): boolean {
  return pathname === "/flock/join" || pathname.startsWith("/flock/join/") || pathname === "/flock/guidelines" || isRescuePath(pathname);
}

/** The rescue code form, which always renders without the member chrome. */
export function isRescuePath(pathname: string): boolean {
  return pathname === "/flock/rescue" || pathname.startsWith("/flock/rescue/");
}

/** Where the layout sends someone: null to let them in. Admins are never
 *  held at the door (they use the Flock before opening day). */
export function joinRedirect(access: FlockAccess | null, pathname: string): "/flock/join" | "/dashboard" | null {
  if (!access) return "/dashboard";
  if (access.is_admin) return null;
  if (access.agreed && access.member_now) return null;
  return isJoinPath(pathname) ? null : "/flock/join";
}

export type JoinResult = "joined" | "already_joined" | "founder" | "chapter_lead" | "member";

export type JoinError = "adult_required" | "guidelines_outdated" | "unknown_region" | "not_open" | "season_over" | "closed" | "other";

export function joinErrorKind(e: unknown): JoinError {
  const msg = String((e as { message?: string })?.message ?? "");
  for (const k of ["adult_required", "guidelines_outdated", "unknown_region", "not_open", "season_over"] as const) {
    if (msg.includes(k)) return k;
  }
  if ((e as { code?: string })?.code === "42501") return "closed";
  return "other";
}

/** Agree, then join, then record where they came from. */
export async function agreeAndJoin(input: {
  region: string;
  displayName: string;
  adult: boolean;
  source: JoinSource | string | undefined;
}): Promise<JoinResult> {
  if (!input.adult) throw new Error("adult_required");
  const source = joinSource(input.source);
  const a = await sb.rpc("flock_agree", {
    p_region: input.region,
    p_display_name: input.displayName,
    p_adult: true,
    p_guidelines_version: FLOCK_GUIDELINES_VERSION,
    p_source: source,
  });
  if (a.error) throw a.error;
  const j = await sb.rpc("flock_join");
  if (j.error) throw j.error;
  const row = (Array.isArray(j.data) ? j.data[0] : j.data) as { result: JoinResult } | undefined;
  void trackFlockJoined(source);
  return row?.result ?? "joined";
}
