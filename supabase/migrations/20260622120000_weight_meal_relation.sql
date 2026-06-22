-- Add an optional "before meal / after meal" marker to weigh-ins. A bird's
-- weight shifts around feeding, so this helps read the trend later. Nullable —
-- it isn't always known (and sitter weigh-ins don't capture it). Additive;
-- preserves all existing rows.
--
-- BEFORE: weight_entries(id, bird_id, grams, measured_at, logged_by, source, note, created_at)
-- AFTER:  + meal_relation text check (meal_relation in ('before_meal','after_meal'))  [nullable]

alter table public.weight_entries
  add column if not exists meal_relation text
    check (meal_relation in ('before_meal', 'after_meal'));
