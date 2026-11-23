-- The weight history export for the baseline replay (backlog D1.1).
-- Read-only. One row per weigh-in, with no names, notes, accounts or bird ids:
-- `bird` is a one-way hash of the bird's id, so rows group by bird and nothing
-- else. Save the result as CSV (with the header row) and run:
--
--   npm run weight-baseline:replay -- <the file>
--
-- Keep the file off the repo.
select
  md5(w.bird_id::text) as bird,
  w.grams,
  w.measured_at,
  w.meal_relation
from public.weight_entries w
order by bird, w.measured_at;
