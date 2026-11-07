-- The Flock, step 4 (PR C): Today's idea and "We tried it". Additive only:
-- new tables and functions. No care-app table, policy, trigger or function
-- changes.
--
-- Today's idea: one idea per day (America/Chicago), scheduled by an admin at
-- /admin/ideas. Members see only ideas marked 'ready'; drafts never reach them.
-- A day with nothing ready reuses a favorite from the archive (a ready idea
-- marked is_favorite whose own day has passed), picked the same way all day.
-- We tried it: each member answers once per day for one of their birds
-- (Loved it / Curious / Not for him-her-them), with an optional photo in the
-- private flock-posts bucket (signed on the server for members). The tally
-- (how many tried, % loved, most popular species) shows only from 5 answers.
-- The 14 seeded ideas are drafts for Brittany to edit; nothing medical, and
-- nothing that withholds food.


-- 1) Ideas and tries ----------------------------------------------------------------------

create table if not exists public.flock_ideas (
  id           uuid primary key default gen_random_uuid(),
  title        text not null check (length(btrim(title)) between 1 and 100),
  category     text not null check (category in ('enrichment', 'did_you_know', 'project', 'training', 'conservation')),
  body         text not null check (length(btrim(body)) between 1 and 600),
  photo_path   text,
  status       text not null default 'draft' check (status in ('draft', 'ready')),
  scheduled_on date unique,
  is_favorite  boolean not null default false,
  seed_key     text unique,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists public.flock_idea_tries (
  id         uuid primary key default gen_random_uuid(),
  idea_id    uuid not null references public.flock_ideas(id) on delete cascade,
  shown_on   date not null,
  user_id    uuid not null references auth.users(id) on delete cascade,
  bird_id    uuid references public.birds(id) on delete set null,
  outcome    text not null check (outcome in ('loved', 'curious', 'not_for')),
  photo_path text,
  created_at timestamptz not null default now(),
  unique (shown_on, user_id)
);
create index if not exists flock_idea_tries_day_idx on public.flock_idea_tries (shown_on, idea_id);

alter table public.flock_ideas enable row level security;
alter table public.flock_idea_tries enable row level security;
revoke all on public.flock_ideas, public.flock_idea_tries from anon, authenticated;
grant select, insert, update, delete on public.flock_ideas, public.flock_idea_tries to service_role;
drop policy if exists "flock_ideas no direct access" on public.flock_ideas;
create policy "flock_ideas no direct access" on public.flock_ideas for select to authenticated using (false);
drop policy if exists "flock_idea_tries no direct access" on public.flock_idea_tries;
create policy "flock_idea_tries no direct access" on public.flock_idea_tries for select to authenticated using (false);

drop trigger if exists flock_ideas_updated_at on public.flock_ideas;
create trigger flock_ideas_updated_at before update on public.flock_ideas
  for each row execute function public.set_updated_at();


-- 2) Which idea is today's ------------------------------------------------------------------

-- "Today" is the Flock's day (America/Chicago), the same for every member.
create or replace function private.flock_today()
returns date
language sql
stable
set search_path = ''
as $$ select (now() at time zone 'America/Chicago')::date; $$;

-- The ready idea scheduled for a day, else a favorite from the archive (ready,
-- favorite, its own day already passed), chosen by the date so it's stable.
create or replace function private.flock_idea_for(p_day date)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select i.id from public.flock_ideas i where i.scheduled_on = p_day and i.status = 'ready'),
    (select f.id from (
       select i.id, row_number() over (order by i.scheduled_on, i.id) - 1 as k, count(*) over () as n
       from public.flock_ideas i
       where i.status = 'ready' and i.is_favorite and i.scheduled_on < p_day
     ) f
     where f.k = (p_day - date '2026-01-01') % f.n)
  );
$$;

revoke all on function private.flock_today() from public, anon;
revoke all on function private.flock_idea_for(date) from public, anon;
grant execute on function private.flock_today() to authenticated, service_role;
grant execute on function private.flock_idea_for(date) to authenticated, service_role;


-- 3) Members: today's idea, We tried it, the tally --------------------------------------------

-- Today's idea with the caller's answer and the day's tally. The tally's
-- numbers are null under 5 answers; "most popular" needs 2+ loved answers per species.
create or replace function private.flock_todays_idea()
returns table (
  idea_id uuid, shown_on date, title text, category text, body text, has_photo boolean, is_reused boolean,
  my_outcome text, my_bird_id uuid, my_has_photo boolean,
  tried integer, loved_pct integer, top_species text[], photo_count integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_day date := private.flock_today();
  v_id uuid;
  v_tried integer;
begin
  perform private.assert_can_use_flock();
  v_id := private.flock_idea_for(v_day);
  if v_id is null then return; end if;
  select count(*) into v_tried from public.flock_idea_tries t where t.shown_on = v_day and t.idea_id = v_id;
  return query
    select i.id, v_day, i.title, i.category, i.body, i.photo_path is not null, i.scheduled_on is distinct from v_day,
           mt.outcome, mt.bird_id, mt.photo_path is not null,
           case when v_tried >= 5 then v_tried end,
           case when v_tried >= 5 then round(100.0 * (select count(*) from public.flock_idea_tries t
                                                    where t.shown_on = v_day and t.idea_id = v_id and t.outcome = 'loved') / v_tried)::integer end,
           case when v_tried >= 5 then (
             select array_agg(s.species order by s.n desc, s.species) from (
               select min(btrim(b.species)) as species, count(*) as n
               from public.flock_idea_tries t join public.birds b on b.id = t.bird_id
               where t.shown_on = v_day and t.idea_id = v_id and t.outcome = 'loved' and coalesce(btrim(b.species), '') <> ''
               group by lower(btrim(b.species)) having count(*) >= 2
               order by count(*) desc, min(btrim(b.species)) limit 2
             ) s) end,
           (select count(*)::integer from public.flock_idea_tries t
            where t.shown_on = v_day and t.idea_id = v_id and t.photo_path is not null and private.can_use_flock(t.user_id))
    from public.flock_ideas i
    left join public.flock_idea_tries mt on mt.shown_on = v_day and mt.user_id = auth.uid() and mt.idea_id = i.id
    where i.id = v_id;
end;
$$;

-- Answer (or change your answer) for today's idea, for one of your birds.
create or replace function private.flock_idea_try(p_idea_id uuid, p_outcome text, p_bird_id uuid, p_photo_path text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_day date := private.flock_today();
begin
  perform private.assert_can_use_flock();
  if p_idea_id is null or p_idea_id is distinct from private.flock_idea_for(v_day) then
    raise exception 'that isn''t today''s idea' using errcode = 'P0002';
  end if;
  if p_outcome is null or p_outcome not in ('loved', 'curious', 'not_for') then
    raise exception 'how did it go?' using errcode = '22023';
  end if;
  if p_bird_id is not null and private.has_bird_access(p_bird_id, auth.uid()) is null then
    raise exception 'not your bird' using errcode = '42501';
  end if;
  if p_photo_path is not null then
    if not private.flock_own_photo_ok(auth.uid(), p_photo_path) then
      raise exception 'photo not found' using errcode = '22023';
    end if;
    perform private.flock_check_rate(auth.uid(), 'comments', 1);
  end if;
  insert into public.flock_idea_tries (idea_id, shown_on, user_id, bird_id, outcome, photo_path)
  values (p_idea_id, v_day, auth.uid(), p_bird_id, p_outcome, p_photo_path)
  on conflict (shown_on, user_id) do update
    set idea_id = excluded.idea_id, bird_id = excluded.bird_id, outcome = excluded.outcome,
        photo_path = coalesce(excluded.photo_path, public.flock_idea_tries.photo_path), created_at = now();
end;
$$;

-- Everyone's photos from today's idea: which bird and how it went (no member
-- names). Paths go to the server only, which signs them.
create or replace function private.flock_idea_media_refs(p_idea_id uuid)
returns table (kind text, ref_id uuid, path text, bird_name text, outcome text, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_day date := private.flock_today();
begin
  perform private.assert_can_use_flock();
  if p_idea_id is distinct from private.flock_idea_for(v_day) and not private.is_admin(auth.uid()) then
    raise exception 'not found' using errcode = 'P0002';
  end if;
  return query
    select 'idea'::text, i.id, i.photo_path, null::text, null::text, i.updated_at
    from public.flock_ideas i where i.id = p_idea_id and i.photo_path is not null
    union all
    select 'try'::text, t.id, t.photo_path, b.name::text, t.outcome, t.created_at
    from public.flock_idea_tries t
    left join public.birds b on b.id = t.bird_id
    where t.idea_id = p_idea_id and t.shown_on = v_day and t.photo_path is not null and private.can_use_flock(t.user_id)
    order by 6 desc
    limit 60;
end;
$$;

revoke all on function private.flock_todays_idea() from public, anon;
revoke all on function private.flock_idea_try(uuid, text, uuid, text) from public, anon;
revoke all on function private.flock_idea_media_refs(uuid) from public, anon;
grant execute on function private.flock_todays_idea() to authenticated, service_role;
grant execute on function private.flock_idea_try(uuid, text, uuid, text) to authenticated, service_role;
grant execute on function private.flock_idea_media_refs(uuid) to authenticated, service_role;


-- 4) Admin: scheduling ---------------------------------------------------------------------

-- The next p_days days from p_from: each day's scheduled idea (draft or ready),
-- or empty (and which favorite would fill it).
create or replace function private.admin_ideas_schedule(p_from date, p_days integer)
returns table (
  day date, idea_id uuid, title text, category text, body text, status text, is_favorite boolean, has_photo boolean,
  reused_idea_id uuid, reused_title text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.assert_entitlement_admin();
  return query
    select d::date, i.id, i.title, i.category, i.body, i.status, i.is_favorite, i.photo_path is not null,
           case when i.id is null or i.status <> 'ready' then private.flock_idea_for(d::date) end,
           case when i.id is null or i.status <> 'ready' then (select f.title from public.flock_ideas f where f.id = private.flock_idea_for(d::date)) end
    from generate_series(coalesce(p_from, private.flock_today()), coalesce(p_from, private.flock_today()) + (least(greatest(coalesce(p_days, 14), 1), 60) - 1), interval '1 day') d
    left join public.flock_ideas i on i.scheduled_on = d::date
    order by d;
end;
$$;

-- Every idea not on a day yet, plus the archive (past days), for picking.
create or replace function private.admin_ideas_unscheduled()
returns table (idea_id uuid, title text, category text, body text, status text, is_favorite boolean, scheduled_on date)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.assert_entitlement_admin();
  return query
    select i.id, i.title, i.category, i.body, i.status, i.is_favorite, i.scheduled_on
    from public.flock_ideas i
    where i.scheduled_on is null or i.scheduled_on < private.flock_today()
    order by i.scheduled_on is not null, i.scheduled_on desc nulls first, i.created_at;
end;
$$;

-- Create (p_id null) or edit an idea.
create or replace function private.admin_save_idea(
  p_id uuid, p_title text, p_category text, p_body text, p_photo_path text, p_status text, p_is_favorite boolean, p_scheduled_on date
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform private.assert_entitlement_admin();
  if p_photo_path is not null and not exists (select 1 from storage.objects o where o.bucket_id = 'flock-posts' and o.name = p_photo_path) then
    raise exception 'photo not found' using errcode = '22023';
  end if;
  if p_scheduled_on is not null and exists (select 1 from public.flock_ideas i where i.scheduled_on = p_scheduled_on and i.id is distinct from p_id) then
    raise exception 'that day already has an idea' using errcode = '23505';
  end if;
  if p_id is null then
    insert into public.flock_ideas (title, category, body, photo_path, status, is_favorite, scheduled_on)
    values (btrim(p_title), p_category, btrim(p_body), p_photo_path, coalesce(p_status, 'draft'), coalesce(p_is_favorite, false), p_scheduled_on)
    returning id into v_id;
  else
    update public.flock_ideas i
    -- A null photo keeps the one it has (the editor never sees the path).
    set title = btrim(p_title), category = p_category, body = btrim(p_body), photo_path = coalesce(p_photo_path, i.photo_path),
        status = coalesce(p_status, i.status), is_favorite = coalesce(p_is_favorite, i.is_favorite), scheduled_on = p_scheduled_on
    where i.id = p_id
    returning i.id into v_id;
    if v_id is null then
      raise exception 'idea not found' using errcode = 'P0002';
    end if;
  end if;
  return v_id;
end;
$$;

-- Swap two days (reorder). Either may be empty.
create or replace function private.admin_swap_idea_days(p_a date, p_b date)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_a uuid;
  v_b uuid;
begin
  perform private.assert_entitlement_admin();
  if p_a is null or p_b is null or p_a = p_b then return; end if;
  select i.id into v_a from public.flock_ideas i where i.scheduled_on = p_a;
  select i.id into v_b from public.flock_ideas i where i.scheduled_on = p_b;
  update public.flock_ideas i set scheduled_on = null where i.id in (v_a, v_b);
  if v_a is not null then update public.flock_ideas i set scheduled_on = p_b where i.id = v_a; end if;
  if v_b is not null then update public.flock_ideas i set scheduled_on = p_a where i.id = v_b; end if;
end;
$$;

create or replace function private.admin_delete_idea(p_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.assert_entitlement_admin();
  delete from public.flock_ideas i where i.id = p_id;
end;
$$;

revoke all on function private.admin_ideas_schedule(date, integer) from public, anon;
revoke all on function private.admin_ideas_unscheduled() from public, anon;
revoke all on function private.admin_save_idea(uuid, text, text, text, text, text, boolean, date) from public, anon;
revoke all on function private.admin_swap_idea_days(date, date) from public, anon;
revoke all on function private.admin_delete_idea(uuid) from public, anon;
grant execute on function private.admin_ideas_schedule(date, integer) to authenticated, service_role;
grant execute on function private.admin_ideas_unscheduled() to authenticated, service_role;
grant execute on function private.admin_save_idea(uuid, text, text, text, text, text, boolean, date) to authenticated, service_role;
grant execute on function private.admin_swap_idea_days(date, date) to authenticated, service_role;
grant execute on function private.admin_delete_idea(uuid) to authenticated, service_role;


-- 5) Invoker wrappers the app calls --------------------------------------------------------------

create or replace function public.flock_todays_idea()
returns table (
  idea_id uuid, shown_on date, title text, category text, body text, has_photo boolean, is_reused boolean,
  my_outcome text, my_bird_id uuid, my_has_photo boolean,
  tried integer, loved_pct integer, top_species text[], photo_count integer
) language sql stable security invoker set search_path = ''
as $$ select * from private.flock_todays_idea(); $$;

create or replace function public.flock_idea_try(p_idea_id uuid, p_outcome text, p_bird_id uuid default null, p_photo_path text default null)
returns void language sql volatile security invoker set search_path = ''
as $$ select private.flock_idea_try(p_idea_id, p_outcome, p_bird_id, p_photo_path); $$;

create or replace function public.flock_idea_media_refs(p_idea_id uuid)
returns table (kind text, ref_id uuid, path text, bird_name text, outcome text, created_at timestamptz)
language sql stable security invoker set search_path = ''
as $$ select * from private.flock_idea_media_refs(p_idea_id); $$;

create or replace function public.admin_ideas_schedule(p_from date default null, p_days integer default 14)
returns table (
  day date, idea_id uuid, title text, category text, body text, status text, is_favorite boolean, has_photo boolean,
  reused_idea_id uuid, reused_title text
) language sql stable security invoker set search_path = ''
as $$ select * from private.admin_ideas_schedule(p_from, p_days); $$;

create or replace function public.admin_ideas_unscheduled()
returns table (idea_id uuid, title text, category text, body text, status text, is_favorite boolean, scheduled_on date)
language sql stable security invoker set search_path = ''
as $$ select * from private.admin_ideas_unscheduled(); $$;

create or replace function public.admin_save_idea(
  p_id uuid, p_title text, p_category text, p_body text, p_photo_path text default null, p_status text default 'draft',
  p_is_favorite boolean default false, p_scheduled_on date default null
)
returns uuid language sql volatile security invoker set search_path = ''
as $$ select private.admin_save_idea(p_id, p_title, p_category, p_body, p_photo_path, p_status, p_is_favorite, p_scheduled_on); $$;

create or replace function public.admin_swap_idea_days(p_a date, p_b date)
returns void language sql volatile security invoker set search_path = ''
as $$ select private.admin_swap_idea_days(p_a, p_b); $$;

create or replace function public.admin_delete_idea(p_id uuid)
returns void language sql volatile security invoker set search_path = ''
as $$ select private.admin_delete_idea(p_id); $$;

revoke all on function public.flock_todays_idea() from public, anon;
revoke all on function public.flock_idea_try(uuid, text, uuid, text) from public, anon;
revoke all on function public.flock_idea_media_refs(uuid) from public, anon;
revoke all on function public.admin_ideas_schedule(date, integer) from public, anon;
revoke all on function public.admin_ideas_unscheduled() from public, anon;
revoke all on function public.admin_save_idea(uuid, text, text, text, text, text, boolean, date) from public, anon;
revoke all on function public.admin_swap_idea_days(date, date) from public, anon;
revoke all on function public.admin_delete_idea(uuid) from public, anon;
grant execute on function public.flock_todays_idea() to authenticated, service_role;
grant execute on function public.flock_idea_try(uuid, text, uuid, text) to authenticated, service_role;
grant execute on function public.flock_idea_media_refs(uuid) to authenticated, service_role;
grant execute on function public.admin_ideas_schedule(date, integer) to authenticated, service_role;
grant execute on function public.admin_ideas_unscheduled() to authenticated, service_role;
grant execute on function public.admin_save_idea(uuid, text, text, text, text, text, boolean, date) to authenticated, service_role;
grant execute on function public.admin_swap_idea_days(date, date) to authenticated, service_role;
grant execute on function public.admin_delete_idea(uuid) to authenticated, service_role;


-- 6) Fourteen draft ideas (edit at /admin/ideas) -------------------------------------------------
-- Enrichment and training only; nothing medical; nothing that holds back food.
-- Scheduled on the fourteen days after this migration runs, all drafts, so
-- the two-week view starts full; inserted once (seed_key), never overwritten.

insert into public.flock_ideas (seed_key, title, category, body, status, scheduled_on)
select s.key, s.title, s.category, s.body, 'draft',
       case when not exists (select 1 from public.flock_ideas x where x.scheduled_on = private.flock_today() + s.n)
            then private.flock_today() + s.n end
from (values
  (1, 'paper-cup', 'Wrap a treat in a paper cup', 'enrichment',
   'Fold a plain paper cup around a favorite treat and hand it over. Tearing in to find the prize is half the fun. Stay close the first time and see how your bird goes about it.'),
  (2, 'target-five', 'A five-minute target session', 'training',
   'Hold a chopstick a few inches from your bird and reward each touch of the tip. Five minutes is plenty. Stop while your bird still wants more.'),
  (3, 'cardboard-box', 'A box to shred', 'enrichment',
   'Offer a small plain cardboard box with any tape, staples and printed labels removed. Some birds dive right in; others need a day to warm up to it.'),
  (4, 'muffin-tin', 'Muffin tin foraging', 'enrichment',
   'Put a few treats in the cups of a muffin tin and cover each with a crumpled ball of plain paper. Start with a couple of cups uncovered so the game makes sense.'),
  (5, 'step-up-new-perch', 'Step up from somewhere new', 'training',
   'Ask for a step up from a perch or spot your bird doesn''t usually start from. Keep it short and easy, and reward every success.'),
  (6, 'rotate-toy', 'Swap one toy', 'enrichment',
   'Trade one familiar toy for one that''s been stored away for a while. Rotating toys keeps the cage interesting without buying anything new.'),
  (7, 'station', 'Wait on a station', 'training',
   'Pick one perch as a station. Reward your bird for staying there a few seconds while you take a small step back. Build the time up slowly over a few days.'),
  (8, 'paper-ball', 'A paper ball surprise', 'enrichment',
   'Wrap a small piece of a favorite toy or a treat in plain paper and twist the ends. Unwrapping it is a puzzle many birds love.'),
  (9, 'wave', 'Start a wave', 'training',
   'Move your hand slowly toward your bird''s foot as if to step up, then reward the moment the foot lifts, before it lands on your hand. A few tries a day is enough.'),
  (10, 'music', 'Music time', 'enrichment',
   'Play a few minutes of calm music, then something upbeat, and watch for bobbing, whistling or chatter. Notice which your bird likes best.'),
  (11, 'recall-hop', 'A short-hop recall', 'training',
   'From a perch an easy hop away, show a treat and call your bird''s name. Reward the moment your bird arrives. Keep the distance short so every try is a success.'),
  (12, 'natural-branch', 'A new branch to explore', 'enrichment',
   'Add a cleaned branch from a bird-safe tree in a different thickness from the usual perches. New textures and widths are good for feet and curiosity.'),
  (13, 'name-a-toy', 'Name a toy', 'training',
   'Say a toy''s name every time you hand it over: ball, bell, ring. Over a few weeks, some birds start to pick the one you name.'),
  (14, 'water-dish', 'Bath time choices', 'enrichment',
   'Offer a shallow dish of lukewarm water or a light mist from a clean spray bottle, and let your bird decide. Never force a bath; some birds take a few tries to warm up.')
) as s(n, key, title, category, body)
where not exists (select 1 from public.flock_ideas i where i.seed_key = s.key);
