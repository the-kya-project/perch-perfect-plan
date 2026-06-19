-- One source of truth per routine item.
--
-- The guided Routine builder no longer offers manual chips for items that have a
-- structured source (feeding, water, cleaning, medication) — those are now
-- auto-derived into routine_tasks from the Food and Health tabs. This migration
-- (1) removes stale manual duplicates and (2) backfills the new derived
-- "Change water" task for birds that were set up before it existed.

-- 1) Remove the stale manually-added rows created by the old "Fresh food" /
--    "Fresh water" / "Medication" chips so they don't duplicate the derived
--    items. Safe: matches the exact old chip titles only. Derived rows have
--    distinct titles ("Feed: …", "Change water (…)", "Medication: …").
delete from routine_tasks
where title in ('Fresh food', 'Fresh water', 'Medication');

-- 2) Backfill the derived "Change water (…)" task from the Food tab's water
--    frequency for existing birds, placed in the morning block. Only inserts
--    where a "Change water" row doesn't already exist; the app's
--    syncHygieneTasks then keeps it in sync going forward (matched by prefix).
insert into routine_tasks (care_plan_id, title, category, instructions, sort_order)
select
  cp.id,
  'Change water (' || (case cp.water_frequency
    when 'once' then 'once daily'
    when 'twice' then 'twice daily'
    when 'more' then 'more than twice daily'
  end) || ')',
  'morning',
  'Give fresh drinking water.',
  989
from care_plans cp
where cp.water_frequency in ('once', 'twice', 'more')
  and not exists (
    select 1 from routine_tasks rt
    where rt.care_plan_id = cp.id and rt.title ilike 'Change water%'
  );
