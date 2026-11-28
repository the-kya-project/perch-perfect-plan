-- Flagging (approved mockups docs/mockups/flock-guidelines-agreement/ 04–06,
-- Brittany chose "flag" over "report", Nov 28, 2026): the flag sheet's
-- reasons, added alongside the old ones.
--
-- New reasons members pick from now:
--   harmful         Harmful or unkind (harassment, hateful content, harm to an animal)
--   care_standards  Goes against Kya care standards
--   spam            Spam or selling            (already existed)
--   other           Something else             (already existed)
-- The old 'unkind' and 'unsafe' stay valid: existing reports keep their
-- reason (no row is changed), and the review queue still names them.
--
-- What changes:
--   1. flock_reports.reason's check accepts the two new values too (the
--      constraint is replaced by a superset; every existing row passes it).
--   2. private.flock_report accepts them: its live definition is rewritten
--      with one exact text replacement of the reason list, so every later
--      change to it (blocks, member skills) is kept.
-- Nothing else: the threshold, hiding and review work as before.
--
-- Additive for a Flock-only table and function; nothing in the care app
-- reports. Pinned by supabase/checks/flock_flag_reasons_checks.sql.

-- 1) The reason check ---------------------------------------------------------------------

do $$
declare
  v_name text;
begin
  select c.conname into v_name
  from pg_constraint c
  where c.conrelid = 'public.flock_reports'::regclass and c.contype = 'c'
    and pg_get_constraintdef(c.oid) like '%reason%unkind%';
  if v_name is not null then
    execute format('alter table public.flock_reports drop constraint %I', v_name);
  end if;
end $$;

alter table public.flock_reports drop constraint if exists flock_reports_reason_check;
alter table public.flock_reports add constraint flock_reports_reason_check
  check (reason in ('unkind', 'unsafe', 'spam', 'other', 'harmful', 'care_standards'));

-- 2) flock_report accepts the new reasons --------------------------------------------------

do $$
declare
  v_def text := pg_get_functiondef('private.flock_report(text, uuid, text, text)'::regprocedure);
  v_old text := 'p_reason not in (''unkind'', ''unsafe'', ''spam'', ''other'')';
  v_new text := 'p_reason not in (''unkind'', ''unsafe'', ''spam'', ''other'', ''harmful'', ''care_standards'')';
begin
  if position(v_new in v_def) > 0 then
    return;  -- already applied
  end if;
  if position(v_old in v_def) = 0 then
    raise exception 'flock_report: reason list not found; rewrite this migration from the live definition';
  end if;
  execute replace(v_def, v_old, v_new);
end $$;

revoke all on function private.flock_report(text, uuid, text, text) from public, anon;
grant execute on function private.flock_report(text, uuid, text, text) to authenticated, service_role;
