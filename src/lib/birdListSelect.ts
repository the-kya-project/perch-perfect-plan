import { supabase } from "@/integrations/supabase/client";

// Shared column set for the bird LIST query (React Query key ["birds"]), used by
// BOTH the dashboard/Home and the Sits screen. They previously selected DIFFERENT
// columns under the same ["birds"] key, so whichever loaded last overwrote the
// shared cache with a wrong-shaped row (missing the other screen's fields) — which
// the per-mount refetch was papering over. One superset select keeps the cache
// consistent, so every ["birds"] invalidation refreshes both screens correctly.
//
// Superset = the columns either screen reads. A few unused columns per screen are
// cheap (one small row per bird); a shape mismatch is not.
export const BIRD_LIST_SELECT =
  "id, owner_id, name, species, photo_url, photo_position, is_foster, intake_date, birth_date, acquired_on, became_permanent_on, created_at, setup_complete, setup_step, normal_weight, passed_at";

// Home renders a weight pill per bird (latest vs previous). Embedding the latest
// weights in the SAME request as the bird list removes the old birds →
// home-weights waterfall — a second sequential round-trip that was gated on the
// bird IDs coming back from this query first. Only the latest two entries per
// bird are ever read (weightTrendPill = latest vs previous), so the embed is
// capped at 2; that also fixes the old flat limit(300), which in a large flock
// could exhaust the cap on one bird's history and drop another bird's latest
// weight. The Sits screen doesn't read weight_entries but shares the ["birds"]
// cache, so it runs the IDENTICAL query — keeping that cache's shape consistent
// (the whole reason BIRD_LIST_SELECT is shared in the first place).
export const BIRD_LIST_SELECT_WITH_WEIGHTS =
  `${BIRD_LIST_SELECT}, weight_entries(bird_id, grams, measured_at)`;

/** The shared Home + Sits bird-list fetch: active flock, newest-first, with the
 *  latest two weights per bird embedded (one query, one round-trip). Both
 *  screens MUST call this so the shared ["birds"] cache always has one shape. */
export function fetchBirdList() {
  return supabase
    .from("birds")
    .select(BIRD_LIST_SELECT_WITH_WEIGHTS)
    .is("passed_at", null)
    .order("created_at", { ascending: false })
    .order("measured_at", { referencedTable: "weight_entries", ascending: false })
    .limit(2, { referencedTable: "weight_entries" });
}
