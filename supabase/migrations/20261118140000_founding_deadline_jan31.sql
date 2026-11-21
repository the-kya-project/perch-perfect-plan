-- Founding 50: claims now close at the end of Sunday, January 31, 2027
-- (11:59 pm in Indianapolis, which keeps Eastern time), instead of the end of
-- December 31, 2026. Decided Nov 18, 2026 (docs/flock/payments-plan.md), so
-- people can try the Flock after it opens on January 4 before claiming.
--
-- Only the date changes. The limit still lives in one place:
-- claim_founding_spot() refuses with 'founding_closed' when
-- now() >= founding_deadline(), and founding_status() reports open only while
-- now() < founding_deadline() and fewer than founding_cap() (50) spots are
-- claimed, whichever comes first. Both read this function, so neither is
-- redefined here. Grants are unchanged by CREATE OR REPLACE; they are
-- restated below so the file stands on its own.
--
-- Pinned by supabase/checks/founding_deadline_checks.sql.

create or replace function private.founding_deadline()
returns timestamptz
language sql
stable
set search_path = ''
as $$
  -- The first instant of February 1 local time = the end of January 31.
  select timestamp '2027-02-01 00:00:00' at time zone 'America/Indiana/Indianapolis';
$$;

comment on function private.founding_deadline() is
  'Founding 50 claims close at this instant: the end of Jan 31, 2027 in America/Indiana/Indianapolis (2027-02-01 05:00 UTC). Claims also stop once founding_cap() spots are taken, whichever comes first.';

revoke all on function private.founding_deadline() from public, anon;
grant execute on function private.founding_deadline() to authenticated, service_role;
