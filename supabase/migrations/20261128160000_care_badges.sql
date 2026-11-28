-- Backlog 1.13b: care badges, earned in the free care app.
-- Additive only: one new switch row, two new tables and new functions. No
-- existing table, column, policy, trigger or function changes.
--
-- Behind its own switch, which starts off, so nobody sees a change:
--   select public.admin_set_care_feature('care_badges', 'admins');
-- ('admins' = Brittany's account in production; 'everyone' needs her approval.)
--
-- The care set, each worked out per bird from what's already saved:
--   steady_scale    the longest run of calendar weeks in a row (Monday to
--                   Sunday, in the bird owner's time zone, else UTC) with at
--                   least one weigh-in for the bird; levels 4, 12 and 52 weeks.
--                   It counts weigh-ins only: never a weight or a trend.
--   daily_check_in  the longest run of days in a row (daily_logs.log_date, the
--                   day the check was for) with a health check for the bird,
--                   daily or full; levels 7 and 30 days.
--   plan_ready      the bird's whole care plan is ready. The app works that out
--                   (src/lib/useCarePlanStatus.ts, the bird page's "Ready" tag)
--                   and passes it in; the rule isn't copied into SQL, so it
--                   can't drift from what the care plan page shows.
--   sitter_ready    a pet sit with a sitter link that includes the bird.
-- Whoever logged the weigh-in or the check (owner, household, a sitter during a
-- sit), it counts: the badge rewards the bird's care.
--
-- How a badge is earned: care_my_badges(bird, plan_ready) works out the bird's
-- levels, records anything new for the caller (care_badge_awards, unseen) and
-- returns all four, earned or not. Each person with access to the bird has
-- their own rows, so each sees their own celebration. Past activity counts:
-- everything earned in the first 10 minutes after someone's badges for a bird
-- are first worked out is marked at_launch (the window lets plan_ready, which
-- the app reports once the plan has loaded, join the same "Here's what you've
-- already earned"). A badge, once earned, stays earned.
--
-- Nobody else sees care badges: there's no profile read. App users have no
-- grant on the tables; everything goes through SECURITY DEFINER functions in
-- private, with invoker wrappers in public. The rows cascade with the account
-- and with the bird.


-- 1) The switch ------------------------------------------------------------------------

insert into public.care_features (feature, audience, description) values
  ('care_badges', 'off', 'Care badges on the bird page and its Badges screen (backlog 1.13b)')
on conflict (feature) do nothing;


-- 2) Tables ----------------------------------------------------------------------------

-- One row per person per bird per badge earned, holding the highest level.
create table if not exists public.care_badge_awards (
  user_id    uuid not null references auth.users(id) on delete cascade,
  bird_id    uuid not null references public.birds(id) on delete cascade,
  badge      text not null check (badge in ('steady_scale', 'daily_check_in', 'plan_ready', 'sitter_ready')),
  -- Weeks (steady_scale: 4, 12, 52) or days (daily_check_in: 7, 30); 1 otherwise.
  level      integer not null check (level >= 1),
  earned_at  timestamptz not null default now(),
  -- Not yet celebrated. Cleared by care_badges_seen.
  unseen     boolean not null default true,
  -- Earned from history when this person's badges for the bird were first worked out.
  at_launch  boolean not null default false,
  primary key (user_id, bird_id, badge)
);

create index if not exists care_badge_awards_bird_idx on public.care_badge_awards (bird_id);

-- When a person's badges for a bird were first worked out.
create table if not exists public.care_badge_syncs (
  user_id         uuid not null references auth.users(id) on delete cascade,
  bird_id         uuid not null references public.birds(id) on delete cascade,
  first_synced_at timestamptz not null default now(),
  primary key (user_id, bird_id)
);

create index if not exists care_badge_syncs_bird_idx on public.care_badge_syncs (bird_id);

alter table public.care_badge_awards enable row level security;
alter table public.care_badge_syncs enable row level security;
revoke all on public.care_badge_awards from anon, authenticated;
revoke all on public.care_badge_syncs from anon, authenticated;
grant select, insert, update, delete on public.care_badge_awards to service_role;
grant select, insert, update, delete on public.care_badge_syncs to service_role;
drop policy if exists "care_badge_awards no direct access" on public.care_badge_awards;
drop policy if exists "care_badge_syncs no direct access" on public.care_badge_syncs;
create policy "care_badge_awards no direct access" on public.care_badge_awards for select to authenticated using (false);
create policy "care_badge_syncs no direct access" on public.care_badge_syncs for select to authenticated using (false);


-- 3) Rules -----------------------------------------------------------------------------

-- The badges, in the order the Badges screen shows them.
create or replace function private.care_badge_ids()
returns text[] language sql immutable set search_path = '' as $$
  select array['steady_scale', 'daily_check_in', 'plan_ready', 'sitter_ready'];
$$;

-- The level a run earns: the highest step reached, 0 below the first.
create or replace function private.care_badge_step(p_run integer, p_steps integer[])
returns integer language sql immutable set search_path = '' as $$
  select coalesce(max(s), 0) from unnest(p_steps) s where p_run >= s;
$$;

-- What the bird's saved care has earned, badge by badge (level 0 = not earned).
-- plan_ready comes from the app (p_plan_ready).
create or replace function private.care_badge_levels(p_bird uuid, p_plan_ready boolean)
returns table (badge text, level integer)
language sql
stable
security definer
set search_path = ''
as $$
  with tz as (
    select case when exists (select 1 from pg_catalog.pg_timezone_names n where n.name = p.time_zone)
                then p.time_zone else 'UTC' end as z
    from public.birds b
    left join public.profiles p on p.id = b.owner_id
    where b.id = p_bird
  ),
  weeks as (
    select distinct date_trunc('week', e.measured_at at time zone (select z from tz))::date as d
    from public.weight_entries e
    where e.bird_id = p_bird
  ),
  week_runs as (
    select count(*)::integer as n
    from (select d, d - (row_number() over (order by d))::integer * 7 as grp from weeks) w
    group by grp
  ),
  days as (
    select distinct l.log_date as d from public.daily_logs l where l.bird_id = p_bird
  ),
  day_runs as (
    select count(*)::integer as n
    from (select d, d - (row_number() over (order by d))::integer as grp from days) x
    group by grp
  )
  select 'steady_scale', private.care_badge_step(coalesce((select max(n) from week_runs), 0), array[4, 12, 52])
  union all
  select 'daily_check_in', private.care_badge_step(coalesce((select max(n) from day_runs), 0), array[7, 30])
  union all
  select 'plan_ready', case when coalesce(p_plan_ready, false) then 1 else 0 end
  union all
  select 'sitter_ready',
         case when exists (select 1 from public.sit_birds sb join public.sits s on s.id = sb.sit_id
                           where sb.bird_id = p_bird and s.caregiver_user_id is null)
              then 1 else 0 end;
$$;

revoke all on function private.care_badge_ids() from public, anon;
revoke all on function private.care_badge_step(integer, integer[]) from public, anon;
revoke all on function private.care_badge_levels(uuid, boolean) from public, anon, authenticated;
grant execute on function private.care_badge_ids() to authenticated, service_role;
grant execute on function private.care_badge_step(integer, integer[]) to authenticated, service_role;
grant execute on function private.care_badge_levels(uuid, boolean) to service_role;


-- 4) Your badges for a bird ------------------------------------------------------------

-- Records any badge or level the caller has newly earned for the bird, then
-- returns every badge in screen order: level 0 when not earned yet. Nothing
-- (no rows, nothing recorded) while the switch is off for the caller. Only
-- for someone with access to the bird (owner or household).
create or replace function private.care_my_badges(p_bird_id uuid, p_plan_ready boolean)
returns table (badge text, level integer, earned_at timestamptz, unseen boolean, at_launch boolean)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_me uuid := auth.uid();
  v_launch boolean;
begin
  if v_me is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  if not private.care_feature_on_for('care_badges', v_me) then
    return;
  end if;
  if p_bird_id is null or public.has_bird_access(p_bird_id, v_me) is null then
    raise exception 'not your bird' using errcode = '42501';
  end if;
  insert into public.care_badge_syncs (user_id, bird_id) values (v_me, p_bird_id)
  on conflict (user_id, bird_id) do nothing;
  select s.first_synced_at > now() - interval '10 minutes' into v_launch
  from public.care_badge_syncs s where s.user_id = v_me and s.bird_id = p_bird_id;
  insert into public.care_badge_awards as a (user_id, bird_id, badge, level, at_launch)
  select v_me, p_bird_id, l.badge, l.level, coalesce(v_launch, false)
  from private.care_badge_levels(p_bird_id, p_plan_ready) l
  where l.level > 0
  on conflict (user_id, bird_id, badge) do update
    set level = excluded.level, earned_at = now(), unseen = true, at_launch = excluded.at_launch
    where a.level < excluded.level;
  return query
    select b.id, coalesce(a.level, 0), a.earned_at, coalesce(a.unseen, false), coalesce(a.at_launch, false)
    from unnest(private.care_badge_ids()) with ordinality as b(id, ord)
    left join public.care_badge_awards a on a.user_id = v_me and a.bird_id = p_bird_id and a.badge = b.id
    order by b.ord;
end;
$$;

-- The caller has seen these badges' celebration for the bird (null: all of them).
create or replace function private.care_badges_seen(p_bird_id uuid, p_badges text[])
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  update public.care_badge_awards a set unseen = false
  where a.user_id = auth.uid() and a.bird_id = p_bird_id and a.unseen
    and (p_badges is null or a.badge = any (p_badges));
end;
$$;

revoke all on function private.care_my_badges(uuid, boolean) from public, anon;
revoke all on function private.care_badges_seen(uuid, text[]) from public, anon;
grant execute on function private.care_my_badges(uuid, boolean) to authenticated, service_role;
grant execute on function private.care_badges_seen(uuid, text[]) to authenticated, service_role;


-- 5) Invoker wrappers the app calls ------------------------------------------------------

create or replace function public.care_my_badges(p_bird_id uuid, p_plan_ready boolean)
returns table (badge text, level integer, earned_at timestamptz, unseen boolean, at_launch boolean)
language sql volatile security invoker set search_path = ''
as $$ select * from private.care_my_badges(p_bird_id, p_plan_ready); $$;

create or replace function public.care_badges_seen(p_bird_id uuid, p_badges text[])
returns void language sql volatile security invoker set search_path = ''
as $$ select private.care_badges_seen(p_bird_id, p_badges); $$;

revoke all on function public.care_my_badges(uuid, boolean) from public, anon;
revoke all on function public.care_badges_seen(uuid, text[]) from public, anon;
grant execute on function public.care_my_badges(uuid, boolean) to authenticated, service_role;
grant execute on function public.care_badges_seen(uuid, text[]) to authenticated, service_role;
