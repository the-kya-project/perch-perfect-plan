-- Journeys: the last two "app premium" wordings become Flock wording.
--
-- App premium was removed on Nov 19, 2026 (20261119170000_remove_app_premium.sql),
-- but two pieces of stored text still named it:
--   1. Diet conversion's safeguards list (journey_templates.safeguards, seeded
--      by 20261107200000_journeys_core.sql): "For app premium members, this
--      uses the bird's own baseline alerts." → "For Flock members, …".
--   2. private.journey_start's refusal for a Flock-only template: "this
--      journey comes with app premium" → "this journey comes with Flock
--      membership" (the same phrasing as its sharing refusal). The app shows
--      its own Flock sentence for either text (flock.journeys.setup.tsx).
--
-- How: the template row is updated only where the old sentence is present,
-- so any wording an admin already changed is left alone. journey_start is
-- rewritten from its live definition with that one string replaced (no copy
-- of the whole function here, so nothing else in it can be reverted). A fresh
-- database runs the seed migration and then this one, and ends with the new
-- wording; the seed migration itself is applied history and isn't edited.
--
-- Flock-only (journeys are behind journeys_enabled(), admins only today). No
-- care-app table, policy, trigger or function changes. Pinned by
-- supabase/checks/journeys_flock_wording_checks.sql.

update public.journey_templates
set safeguards = array(
  select replace(s, 'For app premium members, this uses the bird''s own baseline alerts.',
                    'For Flock members, this uses the bird''s own baseline alerts.')
  from unnest(safeguards) with ordinality as x(s, ord)
  order by ord
)
where slug = 'diet-conversion'
  and exists (select 1 from unnest(safeguards) s where s like '%For app premium members%');

do $$
declare
  v_def text := pg_get_functiondef('private.journey_start(uuid, text, text, text[], integer[], text, text, text)'::regprocedure);
begin
  if position('this journey comes with app premium' in v_def) > 0 then
    execute replace(v_def, 'this journey comes with app premium', 'this journey comes with Flock membership');
  end if;
end $$;
