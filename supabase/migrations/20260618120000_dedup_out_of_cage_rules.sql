-- Collapse out_of_cage_rules values that are a single phrase joined to itself,
-- e.g. "Supervised only — Supervised only" — a doubling produced by the old
-- setup wizard re-folding the summary back into the notes field on each save.
-- Where every " — "-separated part is identical (case-insensitive), keep one.
UPDATE public.care_plans
SET out_of_cage_rules = trim((regexp_split_to_array(out_of_cage_rules, ' — '))[1])
WHERE out_of_cage_rules LIKE '% — %'
  AND (
    SELECT count(DISTINCT lower(trim(part)))
    FROM unnest(regexp_split_to_array(out_of_cage_rules, ' — ')) AS part
    WHERE trim(part) <> ''
  ) = 1;
