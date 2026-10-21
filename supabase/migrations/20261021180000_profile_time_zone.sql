-- The owner's HOME time zone lives on their account; sits follow it.
--
-- 20261021160000 saved sits.time_zone from the owner's DEVICE, so an owner who
-- created or edited a sit (or just opened the app) while travelling stamped the
-- travel zone and moved the sitter link's end. Now:
--
-- 1. profiles.time_zone (nullable): the owner's home IANA zone. The app sets it
--    from the device the first time the owner opens it, and the owner can
--    change it in Account → Time zone. Blank becomes null; a zone Postgres
--    doesn't know is rejected (22023). Owners write it under the existing
--    "profiles self update" policy (id = auth.uid(); authenticated already has
--    UPDATE on the whole table, no column grants), so nothing new is needed.
--
-- 2. sits.time_zone stays the stored copy the sitter view and the link expiry
--    read, but the sits trigger now fills it from the account, not the client:
--    whenever a sit is written and the owner's profile has a zone, the sit gets
--    that zone, whatever the device sent. So a travelling device (or an older
--    app build that still sends the device zone) can never shift a sit. With
--    no account zone yet, the client's value is kept as before (then UTC).
--    A sit that has already ended (end_date before today in its own zone)
--    keeps the zone it ran in, so editing an old sit never moves it.
--    Token minting and household rules are unchanged from 20261021160000.
--    The function is now SECURITY DEFINER so the profile read never depends on
--    who is writing (owner, service role); it only reads the sit owner's
--    profiles.time_zone and only changes NEW.
--
-- 3. When a profile's time_zone is set or changed, that owner's current and
--    upcoming sits (not revoked, last day not yet over in the sit's current
--    zone) move to the new zone, and the sits trigger recomputes each link's
--    expiry. Past and revoked sits are left alone. Clearing the account zone
--    leaves sits as they are.
--
-- On merge this changes NO rows: every profiles.time_zone starts null, so the
-- cascade in (3) has nothing to do. Rows move only later, one owner at a time,
-- when the app saves that owner's zone.
--
-- Safe to re-run: add column if not exists, create or replace function, and
-- drop trigger if exists before each create trigger.

alter table public.profiles add column if not exists time_zone text;

-- The canonical zone name when Postgres knows it (blank/unknown -> null).
create or replace function public.valid_time_zone(tz text)
returns text
language sql
stable
set search_path = public
as $$
  select n.name from pg_catalog.pg_timezone_names n where n.name = nullif(btrim(tz), '') limit 1
$$;
-- Used by the triggers below; not meant as an API for signed-out callers.
revoke execute on function public.valid_time_zone(text) from public, anon;
grant execute on function public.valid_time_zone(text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- profiles.time_zone: normalise and validate on write.
create or replace function public.normalize_profile_time_zone()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.time_zone is not null then
    if btrim(new.time_zone) = '' then
      new.time_zone := null;
    else
      if public.valid_time_zone(new.time_zone) is null then
        raise exception 'Unknown time zone: %', new.time_zone using errcode = '22023';
      end if;
      new.time_zone := btrim(new.time_zone);
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_normalize_time_zone on public.profiles;
create trigger profiles_normalize_time_zone
  before insert or update of time_zone on public.profiles
  for each row execute function public.normalize_profile_time_zone();

-- ---------------------------------------------------------------------------
-- sits: zone from the account; expiry at the end of end_date in that zone.
create or replace function public.enforce_sit_token_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  tz text := 'UTC';
  account_tz text;
begin
  new.time_zone := public.valid_time_zone(new.time_zone);
  select public.valid_time_zone(p.time_zone) into account_tz
    from public.profiles p where p.id = new.owner_id;

  if tg_op = 'UPDATE'
     and new.end_date < (now() at time zone coalesce(public.valid_time_zone(old.time_zone), 'UTC'))::date then
    -- Already over: keep the zone it ran in.
    new.time_zone := public.valid_time_zone(old.time_zone);
  elsif account_tz is not null then
    -- The owner's home zone, never the device's current one.
    new.time_zone := account_tz;
  end if;
  if new.time_zone is not null then
    tz := new.time_zone;
  end if;

  if tg_op = 'INSERT' then
    if new.caregiver_user_id is null then
      -- External sitter: mint a per-trip token + expiry.
      new.invite_token := replace(gen_random_uuid()::text, '-', '')
                       || replace(gen_random_uuid()::text, '-', '');
      new.token_expires_at := ((new.end_date + 1)::timestamp at time zone tz) - interval '1 second';
    else
      -- Household caregiver: no token (they already have account-based access).
      new.invite_token := null;
      new.token_expires_at := null;
    end if;
  elsif tg_op = 'UPDATE' then
    -- Never regenerate the token. Keep expiry pinned to end_date only while a
    -- token exists; household rows stay tokenless with no expiry.
    new.invite_token := old.invite_token;
    if new.invite_token is not null then
      new.token_expires_at := ((new.end_date + 1)::timestamp at time zone tz) - interval '1 second';
    else
      new.token_expires_at := null;
    end if;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles.time_zone set or changed -> move that owner's current and upcoming
-- sits. The UPDATE fires enforce_sit_token_rules per row, which applies the
-- account zone and recomputes token_expires_at.
-- The FIRST time a zone is saved (old value null) only sits with no zone yet
-- get it: that first value can come from a device that's away from home, and a
-- sit already stamped with a zone keeps it. A deliberate change of home zone
-- (old value set) moves every current and upcoming sit.
create or replace function public.apply_profile_time_zone_to_sits()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.sits s
     set time_zone = new.time_zone
   where s.owner_id = new.id
     and not s.revoked
     and s.time_zone is distinct from new.time_zone
     and (old.time_zone is not null or s.time_zone is null)
     and s.end_date >= (now() at time zone coalesce(public.valid_time_zone(s.time_zone), 'UTC'))::date;
  return null;
end;
$$;

drop trigger if exists profiles_time_zone_to_sits on public.profiles;
create trigger profiles_time_zone_to_sits
  after update of time_zone on public.profiles
  for each row
  when (new.time_zone is not null and new.time_zone is distinct from old.time_zone)
  execute function public.apply_profile_time_zone_to_sits();
