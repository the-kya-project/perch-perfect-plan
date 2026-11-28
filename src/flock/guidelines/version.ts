// The community guidelines' version, on its own so the /flock layout's gate
// (which loads with the app) carries this one number and none of the text.
//
// Must equal public.current_guidelines_version()
// (supabase/migrations/20261128180000_flock_guideline_agreements.sql).
// BUMPING IT, here and there together, makes every member see the
// walk-through again and stops their posting until they agree.
export const GUIDELINES_VERSION = 1;

/** The walk-through's screens. Here, not in content.ts, because the route's
 *  search check loads with the app. */
export const WALKTHROUGH_STEPS = 3;
