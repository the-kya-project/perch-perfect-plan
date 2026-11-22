-- P1 and P2 (Brittany, Nov 22, 2026): no fixed free-season end, opening day and
-- the free season's end set together, and a server-only read of both dates
-- for the public founding, gift and redeem pages.
--
-- What this changes on production (the Flock hasn't opened: flock_opens_at is
-- empty, no gift has been redeemed, and the one founding grant has no dates):
--   1. free_season_ends_at, which held 2027-07-06 00:00 New York since Nov 19,
--      is cleared, and the column loses that date as its default. Nothing reads
--      it until opening day is set (grants stay undated and joining is refused
--      while flock_opens_at is empty), so nobody's access or dates change.
--   2. A check constraint: opening day can't be set without the free season's
--      end. Clearing the end while opening day is set is refused too.
--   3. admin_set_flock_dates(opening, end) sets both in one step. The two
--      existing setters keep working, with clear refusals for a half-set opening.
--   4. A server-only reader of the two dates (service role only; nothing new
--      for signed-in or signed-out app users).
-- Additive apart from replacing two Flock-only setters with versions that
-- refuse a half-set opening. No care-app table, policy or function is touched.

-- 1) No stored date until Brittany sets one -------------------------------------
alter table public.flock_settings alter column free_season_ends_at drop default;

-- Only before opening (it hasn't opened); once opening day is set the end stays.
update public.flock_settings
   set free_season_ends_at = null, updated_at = now()
 where id and flock_opens_at is null and free_season_ends_at is not null;

comment on column public.flock_settings.free_season_ends_at is
  'The end of the free season for everyone, founders included. Empty until Brittany sets it when she opens the Flock (admin_set_flock_dates). Founders'' free_until and gift start dates are read from it once opening day is set.';

-- 2) Opening day needs the free season's end ------------------------------------
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'flock_settings_opening_needs_end'
                   and conrelid = 'public.flock_settings'::regclass) then
    alter table public.flock_settings
      add constraint flock_settings_opening_needs_end
      check (flock_opens_at is null or free_season_ends_at is not null);
  end if;
end $$;

-- 3) Setters --------------------------------------------------------------------
-- Opening day alone: refused while the free season has no end, or when the end
-- isn't after opening day. Clearing opening day (null) is always allowed.
create or replace function private.set_flock_opens_at(p_opens_at timestamptz)
returns public.flock_settings
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.flock_settings;
  v_end timestamptz := private.free_season_ends_at();
begin
  perform private.assert_entitlement_admin();
  if p_opens_at is not null and v_end is null then
    raise exception 'set opening day and the free season''s end together: admin_set_flock_dates(opening, end)' using errcode = '23514';
  end if;
  if p_opens_at is not null and v_end <= p_opens_at then
    raise exception 'the free season must end after opening day' using errcode = '22023';
  end if;
  insert into public.flock_settings (id, flock_opens_at, updated_at, updated_by)
  values (true, p_opens_at, now(), auth.uid())
  on conflict (id) do update
    set flock_opens_at = excluded.flock_opens_at, updated_at = excluded.updated_at, updated_by = excluded.updated_by
  returning * into v_row;
  perform private.reschedule_pending_grants(null);
  return v_row;
end;
$$;

-- The end alone: may be cleared (null) only while opening day isn't set.
create or replace function private.set_free_season_ends_at(p_ends_at timestamptz)
returns public.flock_settings
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.flock_settings;
  v_opens timestamptz := private.flock_opens_at();
begin
  perform private.assert_entitlement_admin();
  if p_ends_at is null and v_opens is not null then
    raise exception 'opening day is set, so the free season needs an end date' using errcode = '22004';
  end if;
  if v_opens is not null and p_ends_at <= v_opens then
    raise exception 'the free season must end after opening day' using errcode = '22023';
  end if;
  if v_opens is not null and v_opens <= now() then
    raise exception 'the Flock has opened; the free season''s end can no longer move' using errcode = '55000';
  end if;
  update public.flock_settings
  set free_season_ends_at = p_ends_at, updated_at = now(), updated_by = auth.uid()
  where id
  returning * into v_row;
  perform private.reschedule_pending_grants(null);
  return v_row;
end;
$$;

-- Both together: the way to open. Both set, or both cleared (before opening).
create or replace function private.set_flock_dates(p_opens_at timestamptz, p_ends_at timestamptz)
returns public.flock_settings
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.flock_settings;
  v_opens timestamptz := private.flock_opens_at();
begin
  perform private.assert_entitlement_admin();
  if (p_opens_at is null) <> (p_ends_at is null) then
    raise exception 'set opening day and the free season''s end together (or clear both)' using errcode = '22004';
  end if;
  if p_opens_at is not null and p_ends_at <= p_opens_at then
    raise exception 'the free season must end after opening day' using errcode = '22023';
  end if;
  if v_opens is not null and v_opens <= now() then
    raise exception 'the Flock has opened; its dates can no longer move' using errcode = '55000';
  end if;
  insert into public.flock_settings (id, flock_opens_at, free_season_ends_at, updated_at, updated_by)
  values (true, p_opens_at, p_ends_at, now(), auth.uid())
  on conflict (id) do update
    set flock_opens_at = excluded.flock_opens_at, free_season_ends_at = excluded.free_season_ends_at,
        updated_at = excluded.updated_at, updated_by = excluded.updated_by
  returning * into v_row;
  perform private.reschedule_pending_grants(null);
  return v_row;
end;
$$;

revoke all on function private.set_flock_dates(timestamptz, timestamptz) from public, anon;
grant execute on function private.set_flock_dates(timestamptz, timestamptz) to authenticated, service_role;

create or replace function public.admin_set_flock_dates(p_opens_at timestamptz, p_ends_at timestamptz)
returns public.flock_settings
language sql
security invoker
set search_path = ''
as $$ select * from private.set_flock_dates(p_opens_at, p_ends_at); $$;

revoke all on function public.admin_set_flock_dates(timestamptz, timestamptz) from public, anon;
grant execute on function public.admin_set_flock_dates(timestamptz, timestamptz) to authenticated, service_role;

comment on function public.admin_set_flock_dates(timestamptz, timestamptz) is
  'Admins: set opening day and the free season''s end together (or clear both before opening). Re-dates every unstarted founding, gift and free-season grant.';

-- 4) The two dates for the public pages (server only) ---------------------------
-- Only the two dates, nothing else from flock_settings. Called by the app's
-- server function (getFlockPublicDates, service role); app users and signed-out
-- visitors have no grant.
create or replace function private.flock_public_dates()
returns table (opens_at timestamptz, free_season_ends_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select s.flock_opens_at, s.free_season_ends_at from public.flock_settings s where s.id;
$$;

revoke all on function private.flock_public_dates() from public, anon, authenticated;
grant execute on function private.flock_public_dates() to service_role;

create or replace function public.flock_public_dates()
returns table (opens_at timestamptz, free_season_ends_at timestamptz)
language sql
stable
security invoker
set search_path = ''
as $$ select * from private.flock_public_dates(); $$;

revoke all on function public.flock_public_dates() from public, anon, authenticated;
grant execute on function public.flock_public_dates() to service_role;

comment on function public.flock_public_dates() is
  'Opening day and the free season''s end, both empty until Brittany sets them. Service role only: the founding, gift and redeem pages read it through the server function getFlockPublicDates.';
