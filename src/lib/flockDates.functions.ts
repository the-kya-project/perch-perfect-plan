import { createServerFn } from "@tanstack/react-start";
import { NO_FLOCK_DATES, type FlockPublicDates } from "./flockDates";

/** Opening day and the free season's end for the public pages (founding, gift,
 *  redeem). Read with the service role, like getFoundingStatus, so signed-out
 *  visitors need no database grant; flock_public_dates() returns only these two
 *  dates. A failure shows the "while we're getting started" wording, never an
 *  error. */
export const getFlockPublicDates = createServerFn({ method: "GET" }).handler(async (): Promise<FlockPublicDates> => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("flock_public_dates");
  if (error) {
    console.error("[flock-dates] read failed", error.message);
    return NO_FLOCK_DATES;
  }
  const row = Array.isArray(data) ? data[0] : data;
  return { opensAt: row?.opens_at ?? null, freeSeasonEndsAt: row?.free_season_ends_at ?? null };
});
