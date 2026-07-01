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
  "id, owner_id, name, species, photo_url, photo_position, is_foster, intake_date, birth_date, acquired_on, became_permanent_on, created_at, setup_complete, setup_step, normal_weight";
