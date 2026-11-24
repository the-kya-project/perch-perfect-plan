-- Backlog 1.13a: Flock badges.
-- Additive only: two new tables and new functions. No existing table, policy,
-- trigger or function changes, and nothing in the care app.
--
-- The Flock set, each worked out from what a member has already done:
--   first_steps         a finished Flock profile, which includes the chapter
--   journey_finisher    finished journeys they started; levels 1, 3 and 10
--   trick_star          a finished tricks journey
--   good_neighbor       a Do good post approved (live), or a place they
--                       suggested approved for their chapter (live, and
--                       reviewed by someone other than them, so a lead's own
--                       listing doesn't count)
--   voice_of_the_flock  a vote cast in a Do good vote (flock_vote_ballots)
--   challenge_champ     a finished challenge, once challenges exist (1.10);
--                       nothing awards it yet
-- Founder and Chapter lead badges stay as they were (founding_claims,
-- flock_chapter_leads); they aren't part of this set.
--
-- How a badge is earned: flock_my_badges() works out the caller's levels,
-- records any badge or level that's new (flock_badge_awards, with unseen set)
-- and returns the whole set, earned or not. Past activity counts: the first
-- time it runs for someone, everything their history has earned is recorded
-- together and marked at_launch, so the app shows one "Here's what you've
-- already earned" celebration instead of a string of them. A badge, once
-- earned, stays earned.
--
-- Who sees what:
--   * Your own Badges screen: every badge you've earned.
--   * Your profile, to other members (and to you): flock_member_badges, which
--     leaves out everything when you've hidden badges, when either of you has
--     blocked the other, or when you can't use the Flock. Journey badges count
--     only "Everyone in the Flock" journeys there, worked out fresh each time,
--     so a badge earned only through "Just me" journeys never reaches anyone
--     else (and a journey switched to "Just me" later stops counting).
--   * No points, leaderboards or rankings: nothing lists other members by
--     badge.
-- App users have no grant on the tables; everything goes through SECURITY
-- DEFINER functions in private, with invoker wrappers in public.


-- 1) Tables ----------------------------------------------------------------------------

-- One row per member per badge they've earned, holding the highest level.
create table if not exists public.flock_badge_awards (
  user_id    uuid not null references auth.users(id) on delete cascade,
  badge      text not null check (badge in (
               'first_steps', 'journey_finisher', 'trick_star', 'good_neighbor', 'voice_of_the_flock', 'challenge_champ')),
  -- 1 for a badge without levels; 1, 3 or 10 for journey_finisher.
  level      integer not null check (level >= 1),
  earned_at  timestamptz not null default now(),
  -- Not yet celebrated. Cleared by flock_badges_seen.
  unseen     boolean not null default true,
  -- Earned from history the first time the member's badges were worked out.
  at_launch  boolean not null default false,
  primary key (user_id, badge)
);

-- One row per member once their badges have been worked out, and their
-- "Show my badges on my profile" choice.
create table if not exists public.flock_badge_settings (
  user_id        uuid primary key references auth.users(id) on delete cascade,
  first_synced_at timestamptz not null default now(),
  hidden         boolean not null default false,
  hidden_changed_at timestamptz
);

alter table public.flock_badge_awards enable row level security;
alter table public.flock_badge_settings enable row level security;
revoke all on public.flock_badge_awards from anon, authenticated;
revoke all on public.flock_badge_settings from anon, authenticated;
grant select, insert, update, delete on public.flock_badge_awards to service_role;
grant select, insert, update, delete on public.flock_badge_settings to service_role;
drop policy if exists "flock_badge_awards no direct access" on public.flock_badge_awards;
drop policy if exists "flock_badge_settings no direct access" on public.flock_badge_settings;
create policy "flock_badge_awards no direct access" on public.flock_badge_awards for select to authenticated using (false);
create policy "flock_badge_settings no direct access" on public.flock_badge_settings for select to authenticated using (false);


-- 2) Rules -----------------------------------------------------------------------------

-- The badges, in the order the Badges screen shows them.
create or replace function private.flock_badge_ids()
returns text[] language sql immutable set search_path = '' as $$
  select array['first_steps', 'journey_finisher', 'trick_star', 'good_neighbor', 'voice_of_the_flock', 'challenge_champ'];
$$;

-- Journey finisher's levels: the number of finished journeys each one needs.
create or replace function private.flock_finisher_level(p_finished integer)
returns integer language sql immutable set search_path = '' as $$
  select case when p_finished >= 10 then 10 when p_finished >= 3 then 3 when p_finished >= 1 then 1 else 0 end;
$$;

-- What p_user's activity has earned, badge by badge (level 0 = not earned).
-- p_public counts only "Everyone in the Flock" journeys, for what others see.
create or replace function private.flock_badge_levels(p_user uuid, p_public boolean)
returns table (badge text, level integer)
language sql
stable
security definer
set search_path = ''
as $$
  with j as (
    select count(*)::integer as finished,
           coalesce(bool_or(t.category = 'tricks'), false) as tricks
    from public.journeys x
    left join public.journey_templates t on t.id = x.template_id
    where x.created_by = p_user and x.status = 'finished'
      and (not p_public or x.visibility = 'community')
  )
  select 'first_steps',
         case when exists (select 1 from public.flock_profiles p where p.user_id = p_user and p.setup_completed_at is not null) then 1 else 0 end
  union all
  select 'journey_finisher', private.flock_finisher_level(j.finished) from j
  union all
  select 'trick_star', case when j.tricks then 1 else 0 end from j
  union all
  select 'good_neighbor',
         case when exists (select 1 from public.flock_posts p where p.author_id = p_user and p.space = 'good' and p.status = 'live')
                or exists (select 1 from public.flock_places p where p.created_by = p_user and p.status = 'live'
                             and p.reviewed_by is distinct from p.created_by)
              then 1 else 0 end
  union all
  select 'voice_of_the_flock',
         case when exists (select 1 from public.flock_vote_ballots b where b.user_id = p_user) then 1 else 0 end
  union all
  select 'challenge_champ', 0;
$$;

revoke all on function private.flock_badge_ids() from public, anon;
revoke all on function private.flock_finisher_level(integer) from public, anon;
revoke all on function private.flock_badge_levels(uuid, boolean) from public, anon, authenticated;
grant execute on function private.flock_badge_ids() to authenticated, service_role;
grant execute on function private.flock_finisher_level(integer) to authenticated, service_role;
grant execute on function private.flock_badge_levels(uuid, boolean) to service_role;


-- 3) Your badges -----------------------------------------------------------------------

-- Records any badge or level the caller has newly earned, then returns every
-- badge in screen order: level 0 when not earned yet.
create or replace function private.flock_my_badges()
returns table (badge text, level integer, earned_at timestamptz, unseen boolean, at_launch boolean)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_me uuid := auth.uid();
  v_first boolean;
begin
  perform private.assert_can_use_flock();
  insert into public.flock_badge_settings (user_id) values (v_me) on conflict (user_id) do nothing;
  v_first := found;
  insert into public.flock_badge_awards as a (user_id, badge, level, at_launch)
  select v_me, l.badge, l.level, v_first
  from private.flock_badge_levels(v_me, false) l
  where l.level > 0
  on conflict (user_id, badge) do update
    set level = excluded.level, earned_at = now(), unseen = true, at_launch = false
    where a.level < excluded.level;
  return query
    select b.id, coalesce(a.level, 0), a.earned_at, coalesce(a.unseen, false), coalesce(a.at_launch, false)
    from unnest(private.flock_badge_ids()) with ordinality as b(id, ord)
    left join public.flock_badge_awards a on a.user_id = v_me and a.badge = b.id
    order by b.ord;
end;
$$;

-- The caller has seen these badges' celebration (null: all of them).
create or replace function private.flock_badges_seen(p_badges text[])
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.assert_can_use_flock();
  update public.flock_badge_awards a set unseen = false
  where a.user_id = auth.uid() and a.unseen and (p_badges is null or a.badge = any (p_badges));
end;
$$;

-- "Show my badges on my profile": the caller's choice (true = shown).
create or replace function private.flock_badges_shown()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.assert_can_use_flock();
  return not coalesce((select s.hidden from public.flock_badge_settings s where s.user_id = auth.uid()), false);
end;
$$;

create or replace function private.flock_set_badges_shown(p_shown boolean)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.assert_can_use_flock();
  if p_shown is null then
    raise exception 'pick shown or hidden' using errcode = '22023';
  end if;
  insert into public.flock_badge_settings as s (user_id, hidden, hidden_changed_at)
  values (auth.uid(), not p_shown, now())
  on conflict (user_id) do update set hidden = excluded.hidden, hidden_changed_at = now();
  return p_shown;
end;
$$;

revoke all on function private.flock_my_badges() from public, anon;
revoke all on function private.flock_badges_seen(text[]) from public, anon;
revoke all on function private.flock_badges_shown() from public, anon;
revoke all on function private.flock_set_badges_shown(boolean) from public, anon;
grant execute on function private.flock_my_badges() to authenticated, service_role;
grant execute on function private.flock_badges_seen(text[]) to authenticated, service_role;
grant execute on function private.flock_badges_shown() to authenticated, service_role;
grant execute on function private.flock_set_badges_shown(boolean) to authenticated, service_role;


-- 4) A member's profile ----------------------------------------------------------------

-- The badges p_user_id's profile shows, in screen order: what they've earned,
-- with journey badges counted from "Everyone in the Flock" journeys only.
-- Nothing when they've hidden badges, when either has blocked the other, or
-- when they can't use the Flock. The same rules apply to your own profile.
create or replace function private.flock_member_badges(p_user_id uuid)
returns table (badge text, level integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform private.assert_can_use_flock();
  if p_user_id is null
     or not private.can_use_flock(p_user_id)
     or not exists (select 1 from public.flock_profiles p where p.user_id = p_user_id)
     or private.flock_blocked(auth.uid(), p_user_id)
     or coalesce((select s.hidden from public.flock_badge_settings s where s.user_id = p_user_id), false) then
    return;
  end if;
  return query
    select x.badge, x.level from (
      select b.id as badge, b.ord,
             case when b.id in ('journey_finisher', 'trick_star') then least(a.level, coalesce(l.level, 0)) else a.level end as level
      from unnest(private.flock_badge_ids()) with ordinality as b(id, ord)
      join public.flock_badge_awards a on a.user_id = p_user_id and a.badge = b.id
      left join private.flock_badge_levels(p_user_id, true) l on l.badge = b.id
    ) x
    where x.level > 0
    order by x.ord;
end;
$$;

revoke all on function private.flock_member_badges(uuid) from public, anon;
grant execute on function private.flock_member_badges(uuid) to authenticated, service_role;


-- 5) Invoker wrappers the app calls ------------------------------------------------------

create or replace function public.flock_my_badges()
returns table (badge text, level integer, earned_at timestamptz, unseen boolean, at_launch boolean)
language sql volatile security invoker set search_path = ''
as $$ select * from private.flock_my_badges(); $$;

create or replace function public.flock_badges_seen(p_badges text[])
returns void language sql volatile security invoker set search_path = ''
as $$ select private.flock_badges_seen(p_badges); $$;

create or replace function public.flock_badges_shown()
returns boolean language sql stable security invoker set search_path = ''
as $$ select private.flock_badges_shown(); $$;

create or replace function public.flock_set_badges_shown(p_shown boolean)
returns boolean language sql volatile security invoker set search_path = ''
as $$ select private.flock_set_badges_shown(p_shown); $$;

create or replace function public.flock_member_badges(p_user_id uuid)
returns table (badge text, level integer)
language sql stable security invoker set search_path = ''
as $$ select * from private.flock_member_badges(p_user_id); $$;

revoke all on function public.flock_my_badges() from public, anon;
revoke all on function public.flock_badges_seen(text[]) from public, anon;
revoke all on function public.flock_badges_shown() from public, anon;
revoke all on function public.flock_set_badges_shown(boolean) from public, anon;
revoke all on function public.flock_member_badges(uuid) from public, anon;
grant execute on function public.flock_my_badges() to authenticated, service_role;
grant execute on function public.flock_badges_seen(text[]) to authenticated, service_role;
grant execute on function public.flock_badges_shown() to authenticated, service_role;
grant execute on function public.flock_set_badges_shown(boolean) to authenticated, service_role;
grant execute on function public.flock_member_badges(uuid) to authenticated, service_role;
