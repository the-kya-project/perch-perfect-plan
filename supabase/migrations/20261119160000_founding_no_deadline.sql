-- Founding 50: no closing date. Claims stay open until all 50 spots are
-- claimed. Decided Nov 19, 2026 (docs/flock/payments-plan.md); replaces the
-- Jan 31, 2027 close from 20261118140000_founding_deadline_jan31.sql.
--
-- private.founding_deadline() now returns 'infinity', so the two readers
-- need no change: claim_founding_spot() refuses with 'founding_closed' only
-- when now() >= founding_deadline() (never), and founding_status() reports
-- open while now() < founding_deadline() (always) and fewer than
-- founding_cap() (50) spots are claimed. The cap is the only limit. The
-- function stays, so a date can come back with one migration.
--
-- Changes one existing Flock function, not a care-app one. Grants restated
-- so the file stands on its own. Pinned by
-- supabase/checks/founding_deadline_checks.sql.

create or replace function private.founding_deadline()
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select 'infinity'::timestamptz;
$$;

comment on function private.founding_deadline() is
  'No closing date (decided Nov 19, 2026): returns infinity, so Founding 50 claims stay open until founding_cap() spots are claimed.';

revoke all on function private.founding_deadline() from public, anon;
grant execute on function private.founding_deadline() to authenticated, service_role;
