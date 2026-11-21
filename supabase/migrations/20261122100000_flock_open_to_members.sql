-- Opening the Flock to members (payments plan build C). Merged switched OFF.
--
-- What this adds:
--   1. The members switch: flock_settings.members_open (default false) and
--      admin_set_flock_members_open(). The Flock opens to people who aren't
--      admins only when ALL of these are true:
--        - the kill switch is on (ui_enabled, unchanged),
--        - opening day is set (flock_opens_at is not null),
--        - members_open is true.
--      Merging this sets none of them: production has opening day unset and
--      members_open false, so flock_enabled() stays admins only.
--   2. public.flock_enabled() keeps its signature, grants and SECURITY
--      INVOKER. Its body becomes: kill switch on AND (admin OR (signed in AND
--      open to members)). "Enabled" means the Flock's door is visible: once
--      open, a signed-in non-member sees the Community entry and the join
--      step. Everything inside still needs a membership: every Flock read and
--      write checks private.can_use_flock() (member or admin) on its own, and
--      the only two places that read flock_enabled() in SQL
--      (private.can_read_library, private.join_flock) also require it or the
--      join rules below.
--   3. public.flock_agreements: one row per person who joined through the
--      join step: "I'm 18 or older", the guidelines version they agreed to,
--      when, and where they came from. Read your own row only; written only by
--      flock_agree().
--   4. public.flock_agree(region, display name, adult, guidelines version,
--      source): records the agreement and your chapter (creating your Flock
--      profile, setup still to do). Refused unless the door is open to you,
--      "I'm 18 or older" is true and the version is the current one.
--   5. private.join_flock() / public.flock_join() (same signature as build B)
--      now require a current agreement first ('agree_first', 42501). New
--      result 'member': someone who already has a membership covering opening
--      day (a comp, a paid plan) gets nothing new, like founders and chapter
--      leads. Gift holders whose gift year starts after the free season still
--      get the free-season row so they're in from opening day (build B's
--      approved rule; their gift row never moves).
--   6. public.flock_my_access(): where you stand (member now, membership
--      waiting for opening day, agreed, current guidelines version, opening
--      day). The app calls it only after flock_enabled() is true, so free
--      users with the switch off make no new call.
--
-- Additive only: one column on flock_settings (a Flock table), one new
-- table, new functions, and new bodies for flock_enabled() and join_flock()
-- (Flock-only; the care app never calls them). No care-app table, policy,
-- trigger or function is touched.
--
-- Turn it on (Supabase SQL editor, production project), when approved:
--   select public.admin_set_flock_opens_at('2027-01-05 00:00 America/Chicago');
--   select public.admin_set_flock_members_open(true);
-- Off again (members keep their memberships; the door and the Flock close to
-- everyone but admins within the app's five-minute cache):
--   select public.admin_set_flock_members_open(false);
--
-- Pinned by supabase/checks/flock_open_checks.sql.


-- 1) The switch -----------------------------------------------------------------------

alter table public.flock_settings
  add column if not exists members_open boolean not null default false,
  add column if not exists members_open_changed_at timestamptz,
  add column if not exists members_open_changed_by uuid references auth.users (id) on delete set null;

create or replace function private.flock_open_to_members()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  -- A missing row reads as closed.
  select coalesce((
    select s.ui_enabled and s.members_open and s.flock_opens_at is not null
    from public.flock_settings s where s.id
  ), false);
$$;
revoke all on function private.flock_open_to_members() from public, anon;
grant execute on function private.flock_open_to_members() to authenticated, service_role;

create or replace function public.flock_enabled()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select private.flock_ui_on() and (
    coalesce(private.is_admin(auth.uid()), false)
    or (auth.uid() is not null and private.flock_open_to_members())
  );
$$;
revoke all on function public.flock_enabled() from public, anon;
grant execute on function public.flock_enabled() to authenticated, service_role;

create or replace function public.admin_set_flock_members_open(p_open boolean)
returns public.flock_settings
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_row public.flock_settings;
begin
  if p_open is null then
    raise exception 'p_open must be true or false' using errcode = '22004';
  end if;
  perform private.assert_entitlement_admin();
  update public.flock_settings
  set members_open = p_open, members_open_changed_at = now(), members_open_changed_by = auth.uid()
  where id
  returning * into v_row;
  if v_row.id is null then raise exception 'flock_settings row missing' using errcode = 'P0002'; end if;
  return v_row;
end;
$$;
revoke all on function public.admin_set_flock_members_open(boolean) from public, anon;
grant execute on function public.admin_set_flock_members_open(boolean) to authenticated, service_role;


-- 2) Agreements ---------------------------------------------------------------------------

-- The community guidelines' version. The app shows the text for this version
-- (FLOCK_GUIDELINES_VERSION in src/lib/flockGuidelines.ts); change both
-- together when the words change, and everyone agrees again on their next
-- visit.
create or replace function private.flock_guidelines_version()
returns text
language sql
immutable
set search_path = ''
as $$ select '2026-12'::text; $$;
revoke all on function private.flock_guidelines_version() from public, anon;
grant execute on function private.flock_guidelines_version() to authenticated, service_role;

create table if not exists public.flock_agreements (
  user_id            uuid primary key references auth.users (id) on delete cascade,
  adult_confirmed_at timestamptz not null,
  guidelines_version text not null,
  agreed_at          timestamptz not null default now(),
  join_source        text not null default 'care_app'
    check (join_source in ('care_app', 'email', 'website', 'founding', 'gift'))
);

alter table public.flock_agreements enable row level security;
revoke all on public.flock_agreements from anon, authenticated;
grant select on public.flock_agreements to authenticated;
grant select, insert, update, delete on public.flock_agreements to service_role;

drop policy if exists "flock_agreements own" on public.flock_agreements;
create policy "flock_agreements own" on public.flock_agreements
  for select to authenticated
  using (user_id = (select auth.uid()));

create or replace function private.flock_agree(
  p_region text, p_display_name text, p_adult boolean, p_guidelines_version text, p_source text
)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_name text := btrim(coalesce(p_display_name, ''));
  v_source text := case when p_source in ('care_app', 'email', 'website', 'founding', 'gift') then p_source else 'care_app' end;
begin
  if v_user is null then raise exception 'sign in first' using errcode = '42501'; end if;
  if not coalesce(public.flock_enabled(), false) then
    raise exception 'the Flock isn''t open to you yet' using errcode = '42501';
  end if;
  if p_adult is distinct from true then
    raise exception 'adult_required' using errcode = '22023';
  end if;
  if p_guidelines_version is distinct from private.flock_guidelines_version() then
    raise exception 'guidelines_outdated' using errcode = '22023';
  end if;
  if not exists (select 1 from public.regions r where r.slug = p_region) then
    raise exception 'unknown_region' using errcode = '22023';
  end if;

  insert into public.flock_agreements (user_id, adult_confirmed_at, guidelines_version, agreed_at, join_source)
  values (v_user, now(), p_guidelines_version, now(), v_source)
  on conflict (user_id) do update
    set adult_confirmed_at = excluded.adult_confirmed_at,
        guidelines_version = excluded.guidelines_version,
        agreed_at = excluded.agreed_at;
    -- join_source keeps where they first came from.

  -- Your chapter. A new profile gets the name the app suggests (your care
  -- name, shortened) and still shows the welcome and setup; an existing one
  -- only moves chapter.
  if v_name = '' then v_name := 'Member'; end if;
  insert into public.flock_profiles (user_id, display_name, region_slug)
  values (v_user, left(v_name, 50), p_region)
  on conflict (user_id) do update set region_slug = excluded.region_slug;

  return private.flock_guidelines_version();
end;
$$;
revoke all on function private.flock_agree(text, text, boolean, text, text) from public, anon;
grant execute on function private.flock_agree(text, text, boolean, text, text) to authenticated, service_role;

create or replace function public.flock_agree(
  p_region text, p_display_name text, p_adult boolean, p_guidelines_version text, p_source text default 'care_app'
)
returns text
language sql
volatile
security invoker
set search_path = ''
as $$ select private.flock_agree(p_region, p_display_name, p_adult, p_guidelines_version, p_source); $$;
revoke all on function public.flock_agree(text, text, boolean, text, text) from public, anon;
grant execute on function public.flock_agree(text, text, boolean, text, text) to authenticated, service_role;

create or replace function private.flock_agreed(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.flock_agreements a
    where a.user_id = p_user and a.guidelines_version = private.flock_guidelines_version()
  );
$$;
revoke all on function private.flock_agreed(uuid) from public, anon;
grant execute on function private.flock_agreed(uuid) to authenticated, service_role;


-- 3) Join the Flock: same signature as build B, now after the agreement -------------------

-- Results: 'joined' (a new free-season row), 'already_joined', 'founder',
-- 'chapter_lead', 'member' (a membership already covers opening day; nothing
-- is created). Refused: signed out or the door closed (42501), no current
-- agreement ('agree_first', 42501), opening day not set ('not_open', 55000),
-- the free season over ('season_over', 55000).
create or replace function private.join_flock()
returns table (result text, starts_at timestamptz, ends_at timestamptz)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user  uuid := auth.uid();
  v_id    uuid;
  v_end   timestamptz := private.free_season_ends_at();
  v_opens timestamptz := private.flock_opens_at();
  e       public.entitlements;
begin
  if v_user is null then raise exception 'sign in first' using errcode = '42501'; end if;
  if not coalesce(public.flock_enabled(), false) then
    raise exception 'the Flock isn''t open to you yet' using errcode = '42501';
  end if;
  if v_opens is null then raise exception 'not_open' using errcode = '55000'; end if;
  if v_end is null or now() >= v_end then raise exception 'season_over' using errcode = '55000'; end if;
  if not private.flock_agreed(v_user) then
    raise exception 'agree_first' using errcode = '42501';
  end if;

  if exists (select 1 from public.founding_claims c where c.user_id = v_user) then
    return query select 'founder'::text, null::timestamptz, null::timestamptz; return;
  end if;
  if exists (select 1 from public.flock_chapter_leads l where l.user_id = v_user)
     or exists (select 1 from public.entitlements x where x.user_id = v_user and x.source = 'chapter_lead') then
    return query select 'chapter_lead'::text, null::timestamptz, null::timestamptz; return;
  end if;

  select * into e from public.entitlements x where x.user_id = v_user and x.source = 'free_season';
  if e.id is not null then
    return query select 'already_joined'::text, e.starts_at, e.current_period_end; return;
  end if;

  -- Already a member from opening day (a comp or paid plan): nothing new.
  -- A gift year that starts after the free season doesn't count, so gift
  -- holders get the free season like everyone else.
  select * into e from public.entitlements x
  where x.user_id = v_user and x.plan <> 'app_premium' and x.source <> 'free_season'
    and private.entitlement_grants_now(least(x.starts_at, now()), x.status, x.current_period_end)
    and x.starts_at <= greatest(now(), v_opens)
  order by x.starts_at limit 1;
  if e.id is not null then
    return query select 'member'::text, e.starts_at, e.current_period_end; return;
  end if;

  insert into public.entitlements (user_id, plan, status, source, note, starts_at, current_period_end)
  values (v_user, 'comp', 'active', 'free_season', 'Joined the Flock: free season', v_opens, v_end)
  on conflict (user_id) where source = 'free_season' do nothing
  returning id into v_id;
  if v_id is null then
    select * into e from public.entitlements x where x.user_id = v_user and x.source = 'free_season';
    return query select 'already_joined'::text, e.starts_at, e.current_period_end; return;
  end if;
  perform private.place_free_season(v_id);
  select * into e from public.entitlements x where x.id = v_id;
  return query select 'joined'::text, e.starts_at, e.current_period_end;
end;
$$;
revoke all on function private.join_flock() from public, anon;
grant execute on function private.join_flock() to authenticated, service_role;


-- 4) Where you stand -------------------------------------------------------------------------

-- member_now: you can use the Flock now (a member or an admin).
-- has_membership: you have one now or from opening day (founders, gift
--   holders, free-season joiners before opening day).
-- agreed: you've agreed to the current guidelines.
create or replace function private.flock_my_access()
returns table (member_now boolean, has_membership boolean, agreed boolean, is_admin boolean,
               guidelines_version text, opens_at timestamptz, season_ends_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null or not coalesce(public.flock_enabled(), false) then
    raise exception 'the Flock isn''t open to you yet' using errcode = '42501';
  end if;
  return query select
    private.can_use_flock(v_user),
    private.can_use_flock(v_user) or exists (
      select 1 from public.entitlements x
      where x.user_id = v_user and x.plan <> 'app_premium'
        and private.entitlement_grants_now(least(x.starts_at, now()), x.status, x.current_period_end)
    ),
    private.flock_agreed(v_user),
    coalesce(private.is_admin(v_user), false),
    private.flock_guidelines_version(),
    private.flock_opens_at(),
    private.free_season_ends_at();
end;
$$;
revoke all on function private.flock_my_access() from public, anon;
grant execute on function private.flock_my_access() to authenticated, service_role;

create or replace function public.flock_my_access()
returns table (member_now boolean, has_membership boolean, agreed boolean, is_admin boolean,
               guidelines_version text, opens_at timestamptz, season_ends_at timestamptz)
language sql
stable
security invoker
set search_path = ''
as $$ select * from private.flock_my_access(); $$;
revoke all on function public.flock_my_access() from public, anon;
grant execute on function public.flock_my_access() to authenticated, service_role;
