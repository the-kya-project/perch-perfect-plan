-- Reconcile structured care-plan fields after the tabbed bird editor was
-- switched from free-text summary blobs to the same structured inputs the
-- guided wizard uses. NON-DESTRUCTIVE: this only backfills empty structured
-- fields and relocates content that was stored in the wrong column. It does NOT
-- drop the legacy summary-blob columns (food_instructions, water_instructions,
-- handling_rules, out_of_cage_rules, safety_rules) — the app simply stops
-- writing and reading them. A separate cleanup can null those once the
-- remaining birds' structured fields are confirmed complete.

-- 1) step_up is a structured enum ('yes' | 'sometimes' | 'no'), but the old
--    tabbed editor bound it to a free-text box. Move any non-enum free text into
--    step_up_notes (so nothing is lost) and clear the enum so the dropdown and
--    the sitter's handling logic read a valid value.
update care_plans
set
  step_up_notes = case
    when coalesce(trim(step_up_notes), '') = '' then step_up
    when position(step_up in step_up_notes) > 0 then step_up_notes
    else step_up_notes || E'\n' || step_up
  end,
  step_up = null
where step_up is not null
  and step_up not in ('yes', 'sometimes', 'no');

-- 2) The old "Bite warning signs" field wrote to known_triggers. Where bite_risk
--    is empty and known_triggers holds content distinct from fears_triggers
--    (i.e. it's a real bite-warning note, not just a mirror of fears), move it
--    into bite_risk so it survives going forward.
update care_plans
set bite_risk = known_triggers
where coalesce(trim(bite_risk), '') = ''
  and coalesce(trim(known_triggers), '') <> ''
  and coalesce(trim(known_triggers), '') is distinct from coalesce(trim(fears_triggers), '');

-- 3) Backfill the structured never_feed array from the legacy comma-joined
--    foods_never_allowed blob, only where the array is currently empty.
update care_plans
set never_feed = (
  select array_agg(trim(x))
  from unnest(string_to_array(foods_never_allowed, ',')) as x
  where trim(x) <> ''
)
where (never_feed is null or cardinality(never_feed) = 0)
  and coalesce(trim(foods_never_allowed), '') <> '';
