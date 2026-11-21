-- The Founding 50: claim records for the founding Flock offer. Additive only.
--
-- A claim is a promise, not access: no entitlement row is written here. At
-- launch, each claim becomes a plan = 'founding' entitlement (see
-- 20261020180000_flock_foundation.sql) with the price in locked_price_cents.
--
-- Same conventions as the Flock foundation:
--   * The elevated work lives in `private` (not exposed by PostgREST). The
--     public RPCs are SECURITY INVOKER wrappers, so no SECURITY DEFINER
--     function is directly callable through the API.
--   * search_path = '' and fully qualified names on every function; EXECUTE
--     revoked from PUBLIC and anon, then granted back only where needed.
--   * The default ACL grants anon/authenticated ALL on new public tables, so
--     the table revokes that first.
--   * Rows cascade from auth.users, so account deletion removes the claim
--     (and frees its spot number).
--
-- The offer's limits live in one place, private.founding_cap() and
-- private.founding_deadline(), shared by the claim and the public counter.


-- 1) Limits ------------------------------------------------------------------

create or replace function private.founding_cap()
returns integer
language sql
immutable
set search_path = ''
as $$
  select 50;
$$;

-- Claims close at the end of December 31, 2026 in Indianapolis (the first
-- instant of January 1 local time). Compared against now(), the database
-- clock, never anything the client sends.
create or replace function private.founding_deadline()
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select timestamp '2027-01-01 00:00:00' at time zone 'America/Indiana/Indianapolis';
$$;

revoke all on function private.founding_cap() from public, anon;
revoke all on function private.founding_deadline() from public, anon;
grant execute on function private.founding_cap() to authenticated, service_role;
grant execute on function private.founding_deadline() to authenticated, service_role;


-- 2) Claims ------------------------------------------------------------------

create table if not exists public.founding_claims (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null unique references auth.users (id) on delete cascade,
  claimed_at         timestamptz not null default now(),
  spot_number        smallint not null unique check (spot_number between 1 and 50),
  region_slug        text not null references public.regions (slug) on update cascade,
  -- Where the claimant came from (?src=tiktok, show-indy, dm, ...). Normalised
  -- by the claim function; anything unrecognisable is stored as null.
  source             text check (source is null or source ~ '^[a-z0-9][a-z0-9_-]{0,39}$'),
  locked_price_cents integer not null default 1500 check (locked_price_cents > 0)
);

create index if not exists founding_claims_region_slug_idx on public.founding_claims (region_slug);

alter table public.founding_claims enable row level security;
revoke all on public.founding_claims from anon, authenticated;
grant select on public.founding_claims to authenticated;

-- Read your own claim; admins read every claim. No insert / update / delete
-- policy and no write grant: claims are made only by claim_founding_spot().
drop policy if exists "founding_claims read" on public.founding_claims;
create policy "founding_claims read" on public.founding_claims
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or private.is_admin((select auth.uid()))
  );


-- 3) Claiming ----------------------------------------------------------------

create or replace function private.claim_founding_spot(p_region_slug text, p_source text default null)
returns public.founding_claims
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_source  text := nullif(left(lower(btrim(coalesce(p_source, ''))), 40), '');
  v_spot    smallint;
  v_name    text;
  v_row     public.founding_claims;
begin
  if v_user_id is null then
    raise exception 'founding_not_signed_in' using errcode = '42501';
  end if;

  if not exists (select 1 from public.regions where slug = p_region_slug) then
    raise exception 'founding_invalid_region' using errcode = '22023';
  end if;

  if v_source is not null and v_source !~ '^[a-z0-9][a-z0-9_-]{0,39}$' then
    v_source := null;
  end if;

  -- One claim at a time, across every session. Everything below (the checks,
  -- picking the spot, the insert) runs while holding this lock, and the lock
  -- is released only at commit, so the next claimant's checks see this row.
  -- The unique constraints on user_id and spot_number are the backstop.
  perform pg_advisory_xact_lock(hashtext('public.founding_claims'));

  if now() >= private.founding_deadline() then
    raise exception 'founding_closed' using errcode = 'P0001';
  end if;

  if exists (select 1 from public.founding_claims where user_id = v_user_id) then
    raise exception 'founding_already_claimed' using errcode = 'P0001';
  end if;

  -- Lowest free number, so a spot freed by a deleted account is reused and the
  -- total can never pass the cap.
  select s::smallint into v_spot
  from generate_series(1, private.founding_cap()) as s
  where not exists (select 1 from public.founding_claims c where c.spot_number = s)
  order by s
  limit 1;

  if v_spot is null then
    raise exception 'founding_full' using errcode = 'P0001';
  end if;

  insert into public.founding_claims (user_id, spot_number, region_slug, source)
  values (v_user_id, v_spot, p_region_slug, v_source)
  returning * into v_row;

  -- Place them in their chapter for launch. flock_profiles' own policies only
  -- let members write, which a founder is not yet, hence doing it here. An
  -- existing row keeps its name and bio and takes the new region.
  select left(btrim(coalesce(
           nullif(btrim(p.first_name), ''),
           nullif(btrim(p.display_name), ''),
           nullif(btrim(p.full_name), ''),
           split_part(u.email, '@', 1),
           'Founding member')), 50)
    into v_name
  from auth.users u
  left join public.profiles p on p.id = u.id
  where u.id = v_user_id;

  insert into public.flock_profiles (user_id, display_name, region_slug)
  values (v_user_id, coalesce(nullif(v_name, ''), 'Founding member'), p_region_slug)
  on conflict (user_id) do update set region_slug = excluded.region_slug;

  return v_row;
end;
$$;

revoke all on function private.claim_founding_spot(text, text) from public, anon;
grant execute on function private.claim_founding_spot(text, text) to authenticated, service_role;

create or replace function public.claim_founding_spot(p_region_slug text, p_source text default null)
returns public.founding_claims
language sql
volatile
security invoker
set search_path = ''
as $$
  select * from private.claim_founding_spot(p_region_slug, p_source);
$$;

revoke all on function public.claim_founding_spot(text, text) from public, anon;
grant execute on function public.claim_founding_spot(text, text) to authenticated, service_role;


-- 4) Public counter ----------------------------------------------------------
-- Aggregates only: never who claimed, which spots, or when. The /founding page
-- reads it through the app server (service role), so anon needs no grant here
-- and no access to the private schema.

create or replace function private.founding_status()
returns table (claimed integer, cap integer, open boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select c.n, private.founding_cap(), c.n < private.founding_cap() and now() < private.founding_deadline()
  from (select count(*)::integer as n from public.founding_claims) c;
$$;

revoke all on function private.founding_status() from public, anon;
grant execute on function private.founding_status() to authenticated, service_role;

create or replace function public.founding_status()
returns table (claimed integer, cap integer, open boolean)
language sql
stable
security invoker
set search_path = ''
as $$
  select * from private.founding_status();
$$;

revoke all on function public.founding_status() from public, anon;
grant execute on function public.founding_status() to authenticated, service_role;


-- 5) Admin list ----------------------------------------------------------------
-- Claims with the claimant's name and email for /admin/founding. Admins (and
-- the service role / dashboard owner) only, via the foundation's admin check.

create or replace function private.founding_claims_admin()
returns table (
  spot_number smallint,
  claimed_at  timestamptz,
  name        text,
  email       text,
  region_slug text,
  region_name text,
  source      text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.assert_entitlement_admin();
  return query
    select c.spot_number,
           c.claimed_at,
           coalesce(nullif(btrim(p.full_name), ''), nullif(btrim(p.display_name), ''), nullif(btrim(p.first_name), ''))::text,
           u.email::text,
           c.region_slug,
           r.name,
           c.source
    from public.founding_claims c
    join auth.users u on u.id = c.user_id
    left join public.profiles p on p.id = c.user_id
    left join public.regions r on r.slug = c.region_slug
    order by c.spot_number;
end;
$$;

revoke all on function private.founding_claims_admin() from public, anon;
grant execute on function private.founding_claims_admin() to authenticated, service_role;

create or replace function public.admin_founding_claims()
returns table (
  spot_number smallint,
  claimed_at  timestamptz,
  name        text,
  email       text,
  region_slug text,
  region_name text,
  source      text
)
language sql
stable
security invoker
set search_path = ''
as $$
  select * from private.founding_claims_admin();
$$;

revoke all on function public.admin_founding_claims() from public, anon;
grant execute on function public.admin_founding_claims() to authenticated, service_role;
