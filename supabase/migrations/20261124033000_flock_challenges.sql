-- Backlog 1.10: Challenges.
-- Additive for the care app: three new tables, two new columns on
-- flock_posts, new functions. The Flock-only changes to existing things are:
--   * flock_posts' space check takes 'challenge' (a challenge's entries);
--   * private.flock_post_visible: a challenge entry shows only to people who
--     may see its challenge;
--   * private.flock_feed: Today's "everything" leaves challenge entries out
--     (they live in their challenge's feed);
--   * private.flock_badge_levels: Challenge champ is awarded;
--   * private.flock_member_badges: a profile shows it only when it was
--     earned in a way others may see (as Journey finisher and Trick star).
-- Each is rewritten from its live definition with exact text replacements
-- (as 20261121100000_flock_member_blocking.sql did), so the block rules
-- already in them stay.
--
-- A challenge (flock_challenges) is a short, shared goal: a title, a short
-- description, a start and end day (Eastern, the Flock's day), an audience
-- (the whole Flock, or one chapter) and a kind:
--   * journey: built on a journey template. Joining picks a bird; the member
--     starts (or keeps going with) that journey, and progress is the
--     journey's milestones. Finished = that journey finished between joining
--     and the end day. Diet conversion, and every template in the food
--     category, can't be a challenge's template.
--   * standalone: its own short list of prompts (flock_challenge_prompts).
--     Finished = an entry posted for every prompt.
-- Entries are Flock posts in the 'challenge' space (flock_posts.challenge_id),
-- so reactions, comments, reports, review, blocks, photos, deletion and the
-- 180-day hold all work exactly as they do for posts. They show in their
-- challenge's feed, never in Today's.
--
-- Who sees what:
--   * Drafts and challenges not started yet: admins only.
--   * An open or closed challenge: Flock members (and admins); a chapter
--     challenge only to that chapter's members (and admins).
--   * Entries: the same rules as posts, plus the challenge rule above.
--   * Admins can pin one entry, and feature entries in the wrap-up, only when
--     its author said yes ("It's OK to feature my entries").
-- One scheduled challenge at a time Flock-wide, plus at most one per
-- chapter, refused when the days overlap. No winners, prizes or rankings:
-- nothing here counts or orders members.
-- Everything goes through SECURITY DEFINER functions in private, with
-- invoker wrappers in public. App users have no grant on the tables.


-- 1) Tables ----------------------------------------------------------------------------

create table if not exists public.flock_challenges (
  id               uuid primary key default gen_random_uuid(),
  kind             text not null check (kind in ('journey', 'standalone')),
  title            text not null check (length(btrim(title)) between 1 and 120),
  description      text check (description is null or length(description) <= 600),
  template_id      uuid references public.journey_templates(id) on delete restrict,
  -- null = the whole Flock.
  region_slug      text references public.regions(slug),
  -- Days in the Flock's time zone (private.flock_today()), both included.
  starts_on        date not null,
  ends_on          date not null,
  -- draft → scheduled. A scheduled challenge is upcoming, open or closed by
  -- the day (private.flock_challenge_state).
  status           text not null default 'draft' check (status in ('draft', 'scheduled')),
  wrap_up          text check (wrap_up is null or length(wrap_up) <= 2000),
  wrap_up_at       timestamptz,
  featured_post_ids uuid[] not null default '{}' check (cardinality(featured_post_ids) <= 12),
  pinned_post_id   uuid references public.flock_posts(id) on delete set null,
  created_by       uuid references auth.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (ends_on >= starts_on),
  check ((kind = 'journey') = (template_id is not null))
);
create index if not exists flock_challenges_days_idx on public.flock_challenges (starts_on, ends_on) where status = 'scheduled';

create table if not exists public.flock_challenge_prompts (
  challenge_id uuid not null references public.flock_challenges(id) on delete cascade,
  position     integer not null check (position between 1 and 30),
  body         text not null check (length(btrim(body)) between 1 and 140),
  primary key (challenge_id, position)
);

create table if not exists public.flock_challenge_members (
  challenge_id uuid not null references public.flock_challenges(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  bird_id      uuid references public.birds(id) on delete set null,
  -- "It's OK to feature my entries in the wrap-up." Off unless they say yes.
  feature_ok   boolean not null default false,
  joined_at    timestamptz not null default now(),
  primary key (challenge_id, user_id)
);
create index if not exists flock_challenge_members_user_idx on public.flock_challenge_members (user_id);

alter table public.flock_posts add column if not exists challenge_id uuid references public.flock_challenges(id) on delete restrict;
alter table public.flock_posts add column if not exists challenge_prompt integer;
alter table public.flock_posts drop constraint if exists flock_posts_space_check;
alter table public.flock_posts add constraint flock_posts_space_check
  check (space in ('learn', 'good', 'chapter', 'start', 'challenge'));
alter table public.flock_posts drop constraint if exists flock_posts_challenge_shape;
alter table public.flock_posts add constraint flock_posts_challenge_shape
  check ((space = 'challenge') = (challenge_id is not null) and (challenge_prompt is null or challenge_id is not null));
create index if not exists flock_posts_challenge_idx on public.flock_posts (challenge_id, created_at desc) where challenge_id is not null;

alter table public.flock_challenges enable row level security;
alter table public.flock_challenge_prompts enable row level security;
alter table public.flock_challenge_members enable row level security;
revoke all on public.flock_challenges from anon, authenticated;
revoke all on public.flock_challenge_prompts from anon, authenticated;
revoke all on public.flock_challenge_members from anon, authenticated;
grant select, insert, update, delete on public.flock_challenges to service_role;
grant select, insert, update, delete on public.flock_challenge_prompts to service_role;
grant select, insert, update, delete on public.flock_challenge_members to service_role;
drop policy if exists "flock_challenges no direct access" on public.flock_challenges;
drop policy if exists "flock_challenge_prompts no direct access" on public.flock_challenge_prompts;
drop policy if exists "flock_challenge_members no direct access" on public.flock_challenge_members;
create policy "flock_challenges no direct access" on public.flock_challenges for select to authenticated using (false);
create policy "flock_challenge_prompts no direct access" on public.flock_challenge_prompts for select to authenticated using (false);
create policy "flock_challenge_members no direct access" on public.flock_challenge_members for select to authenticated using (false);


-- 2) Rules -----------------------------------------------------------------------------

create or replace function private.flock_challenge_state(p_status text, p_starts_on date, p_ends_on date)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_status = 'draft' then 'draft'
    when private.flock_today() < p_starts_on then 'upcoming'
    when private.flock_today() > p_ends_on then 'closed'
    else 'open'
  end;
$$;

-- Templates a challenge can't use: diet conversion and anything about food.
create or replace function private.flock_challenge_template_ok(p_template_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.journey_templates t
    where t.id = p_template_id and t.slug <> 'diet-conversion' and t.category <> 'food'
  );
$$;

-- May p_user see this challenge? Admins see every one; members see a
-- scheduled challenge once it has started, a chapter one only in that chapter.
create or replace function private.flock_challenge_visible(p_user_id uuid, p_challenge_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user_id is not null and private.can_use_flock(p_user_id) and exists (
    select 1 from public.flock_challenges c
    where c.id = p_challenge_id
      and (private.is_admin(p_user_id)
           or (c.status = 'scheduled' and c.starts_on <= private.flock_today()
               and (c.region_slug is null
                    or c.region_slug = (select fp.region_slug from public.flock_profiles fp where fp.user_id = p_user_id))))
  );
$$;

-- The journey a member's journey challenge follows: their journey on the bird
-- they joined with, using the challenge's template; an open one first, then
-- the most recently started.
create or replace function private.flock_challenge_journey(p_user_id uuid, p_challenge_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select j.id
  from public.flock_challenges c
  join public.flock_challenge_members m on m.challenge_id = c.id and m.user_id = p_user_id
  join public.journeys j on j.created_by = p_user_id and j.bird_id = m.bird_id and j.template_id = c.template_id
  where c.id = p_challenge_id and c.kind = 'journey'
  order by (j.status in ('active', 'paused')) desc, j.started_at desc, j.id
  limit 1;
$$;

-- Has p_user finished this challenge? p_public counts a journey challenge
-- only when its journey is shared with the community (what others may see).
create or replace function private.flock_challenge_done(p_user_id uuid, p_challenge_id uuid, p_public boolean)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.flock_challenges c
    join public.flock_challenge_members m on m.challenge_id = c.id and m.user_id = p_user_id
    where c.id = p_challenge_id and c.status = 'scheduled'
      and case
        when c.kind = 'standalone' then
          (select count(*) from public.flock_challenge_prompts pr where pr.challenge_id = c.id) > 0
          and (select count(*) from public.flock_challenge_prompts pr where pr.challenge_id = c.id)
              = (select count(distinct p.challenge_prompt) from public.flock_posts p
                 where p.challenge_id = c.id and p.author_id = p_user_id and p.status <> 'removed'
                   and p.challenge_prompt is not null)
        else exists (
          select 1 from public.journeys j
          where j.created_by = p_user_id and j.bird_id = m.bird_id and j.template_id = c.template_id
            and j.status = 'finished' and j.finished_at >= m.joined_at
            and (j.finished_at at time zone 'America/New_York')::date <= c.ends_on
            and (not p_public or j.visibility = 'community')
        )
      end
  );
$$;

revoke all on function private.flock_challenge_state(text, date, date) from public, anon;
revoke all on function private.flock_challenge_template_ok(uuid) from public, anon;
revoke all on function private.flock_challenge_visible(uuid, uuid) from public, anon;
revoke all on function private.flock_challenge_journey(uuid, uuid) from public, anon;
revoke all on function private.flock_challenge_done(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function private.flock_challenge_state(text, date, date) to authenticated, service_role;
grant execute on function private.flock_challenge_template_ok(uuid) to authenticated, service_role;
grant execute on function private.flock_challenge_visible(uuid, uuid) to authenticated, service_role;
grant execute on function private.flock_challenge_journey(uuid, uuid) to authenticated, service_role;
grant execute on function private.flock_challenge_done(uuid, uuid, boolean) to service_role;


-- 3) Reading ---------------------------------------------------------------------------

-- One challenge (p_id) or the open ones the caller may see (p_id null,
-- Flock-wide first). prompts: [{position, body, done}] (done = the caller
-- posted for it). faces: up to four members who joined (name and photo path
-- only, blocked people left out). Progress, the bird and the journey are the
-- caller's own. pinned_post_id and featured_post_ids keep only entries the
-- caller may see whose author said yes.
create or replace function private.flock_challenge_rows(p_id uuid)
returns table (
  challenge_id uuid, kind text, title text, description text, template_slug text, template_name text,
  region_slug text, region_name text, state text, starts_on date, ends_on date, days_left integer,
  prompts jsonb, member_count integer, faces jsonb,
  joined boolean, my_bird_id uuid, my_bird_name text, feature_ok boolean, my_journey_id uuid,
  done_count integer, total_count integer, finished boolean,
  wrap_up text, pinned_post_id uuid, featured_post_ids uuid[]
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_me uuid := auth.uid();
begin
  perform private.assert_can_use_flock();
  return query
    with c as (
      select x.*, private.flock_challenge_state(x.status, x.starts_on, x.ends_on) as st,
             private.flock_challenge_journey(v_me, x.id) as jid
      from public.flock_challenges x
      where (p_id is null or x.id = p_id)
        and private.flock_challenge_visible(v_me, x.id)
        and (p_id is not null or private.flock_challenge_state(x.status, x.starts_on, x.ends_on) = 'open')
    )
    select c.id, c.kind, c.title, c.description, t.slug, t.name, c.region_slug, r.name, c.st, c.starts_on, c.ends_on,
           (c.ends_on - private.flock_today())::integer,
           coalesce((
             select jsonb_agg(jsonb_build_object(
                      'position', pr.position, 'body', pr.body,
                      'done', exists (select 1 from public.flock_posts p
                                      where p.challenge_id = c.id and p.author_id = v_me and p.status <> 'removed'
                                        and p.challenge_prompt = pr.position)
                    ) order by pr.position)
             from public.flock_challenge_prompts pr where pr.challenge_id = c.id
           ), '[]'::jsonb),
           (select count(*)::integer from public.flock_challenge_members m where m.challenge_id = c.id),
           coalesce((
             select jsonb_agg(jsonb_build_object('name', f.display_name, 'photo_path', f.photo_path))
             from (
               select fp.display_name, fp.photo_path
               from public.flock_challenge_members m
               join public.flock_profiles fp on fp.user_id = m.user_id
               where m.challenge_id = c.id and private.can_use_flock(m.user_id)
                 and not private.flock_blocked(v_me, m.user_id)
               order by m.joined_at desc
               limit 4
             ) f
           ), '[]'::jsonb),
           me.user_id is not null, me.bird_id, b.name::text, coalesce(me.feature_ok, false), c.jid,
           case
             when c.kind = 'standalone' then
               (select count(distinct p.challenge_prompt)::integer from public.flock_posts p
                where p.challenge_id = c.id and p.author_id = v_me and p.status <> 'removed' and p.challenge_prompt is not null)
             else (select count(*)::integer from public.journey_milestones jm where jm.journey_id = c.jid and jm.state in ('reached', 'already'))
           end,
           case
             when c.kind = 'standalone' then (select count(*)::integer from public.flock_challenge_prompts pr where pr.challenge_id = c.id)
             when c.jid is not null then (select count(*)::integer from public.journey_milestones jm where jm.journey_id = c.jid)
             else (select count(*)::integer from public.journey_template_milestones tm where tm.template_id = c.template_id)
           end,
           me.user_id is not null and private.flock_challenge_done(v_me, c.id, false),
           c.wrap_up,
           case when c.pinned_post_id is not null and private.flock_post_visible(v_me, c.pinned_post_id)
                     and exists (select 1 from public.flock_posts p join public.flock_challenge_members m
                                   on m.challenge_id = c.id and m.user_id = p.author_id and m.feature_ok
                                 where p.id = c.pinned_post_id)
                then c.pinned_post_id end,
           coalesce((
             select array_agg(f.id order by f.ord)
             from unnest(c.featured_post_ids) with ordinality as f(id, ord)
             where private.flock_post_visible(v_me, f.id)
               and exists (select 1 from public.flock_posts p join public.flock_challenge_members m
                             on m.challenge_id = c.id and m.user_id = p.author_id and m.feature_ok
                           where p.id = f.id and p.challenge_id = c.id)
           ), '{}'::uuid[])
    from c
    left join public.journey_templates t on t.id = c.template_id
    left join public.regions r on r.slug = c.region_slug
    left join public.flock_challenge_members me on me.challenge_id = c.id and me.user_id = v_me
    left join public.birds b on b.id = me.bird_id
    order by (c.region_slug is null) desc, c.ends_on, c.id;
end;
$$;

-- A challenge's entries the caller may see, newest first, as post rows plus
-- the prompt each answers (null on a journey challenge's entries).
create or replace function private.flock_challenge_entries(p_id uuid, p_before timestamptz, p_limit integer)
returns table (
  post_id uuid, author_id uuid, author_name text, author_region text, author_photo_path text, author_is_founder boolean,
  space text, region_slug text, region_name text, title text, body text, photo_count integer,
  bird_id uuid, bird_name text, bird_has_photo boolean, status text, review_note text,
  created_at timestamptz, edited_at timestamptz, is_mine boolean, comment_count integer,
  great_job integer, been_there integer, rooting_for_you integer, love_this integer, mine text[],
  prompt integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform private.assert_can_use_flock();
  if not private.flock_challenge_visible(auth.uid(), p_id) then
    raise exception 'not found' using errcode = 'P0002';
  end if;
  return query
    select r.*, p.challenge_prompt
    from private.flock_post_rows(auth.uid()) r
    join public.flock_posts p on p.id = r.post_id
    where p.challenge_id = p_id
      and p.created_at < coalesce(p_before, 'infinity'::timestamptz)
    order by p.created_at desc, p.id
    limit least(greatest(coalesce(p_limit, 20), 1), 50);
end;
$$;

-- Admins: every challenge, for /admin/challenges.
create or replace function private.admin_challenges()
returns table (
  challenge_id uuid, kind text, title text, region_slug text, region_name text, state text,
  starts_on date, ends_on date, member_count integer, entry_count integer, updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform private.assert_flock_admin();
  return query
    select x.id, x.kind, x.title, x.region_slug, r.name, private.flock_challenge_state(x.status, x.starts_on, x.ends_on),
           x.starts_on, x.ends_on,
           (select count(*)::integer from public.flock_challenge_members m where m.challenge_id = x.id),
           (select count(*)::integer from public.flock_posts p where p.challenge_id = x.id),
           x.updated_at
    from public.flock_challenges x
    left join public.regions r on r.slug = x.region_slug
    order by (x.status = 'draft') desc, x.starts_on desc, x.id;
end;
$$;

-- Admins: entries whose authors said yes to being featured, for the pin and
-- the wrap-up pickers.
create or replace function private.admin_challenge_featurable(p_id uuid)
returns table (post_id uuid, author_name text, body text, photo_count integer, prompt integer, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform private.assert_flock_admin();
  return query
    select p.id, fp.display_name, p.body, cardinality(p.photo_paths), p.challenge_prompt, p.created_at
    from public.flock_posts p
    join public.flock_challenge_members m on m.challenge_id = p.challenge_id and m.user_id = p.author_id and m.feature_ok
    left join public.flock_profiles fp on fp.user_id = p.author_id
    where p.challenge_id = p_id and p.status = 'live' and not private.flock_is_hidden('post', p.id)
    order by p.created_at desc, p.id;
end;
$$;

revoke all on function private.flock_challenge_rows(uuid) from public, anon;
revoke all on function private.flock_challenge_entries(uuid, timestamptz, integer) from public, anon;
revoke all on function private.admin_challenges() from public, anon;
revoke all on function private.admin_challenge_featurable(uuid) from public, anon;
grant execute on function private.flock_challenge_rows(uuid) to authenticated, service_role;
grant execute on function private.flock_challenge_entries(uuid, timestamptz, integer) to authenticated, service_role;
grant execute on function private.admin_challenges() to authenticated, service_role;
grant execute on function private.admin_challenge_featurable(uuid) to authenticated, service_role;


-- 4) Members ---------------------------------------------------------------------------

-- Join an open challenge with one of your birds (owner or household). Joining
-- again changes the bird and the feature choice. Returns the journey a
-- journey challenge already follows, if there is one (null = start it).
create or replace function private.flock_challenge_join(p_id uuid, p_bird_id uuid, p_feature_ok boolean)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  x public.flock_challenges;
begin
  perform private.assert_can_use_flock();
  select * into x from public.flock_challenges c where c.id = p_id;
  if x.id is null or not private.flock_challenge_visible(auth.uid(), x.id) then
    raise exception 'not found' using errcode = 'P0002';
  end if;
  if private.flock_challenge_state(x.status, x.starts_on, x.ends_on) <> 'open' then
    raise exception 'challenge_closed' using errcode = 'P0001';
  end if;
  if p_bird_id is null or not exists (
    select 1 from public.birds b
    where b.id = p_bird_id and b.passed_at is null and private.has_bird_access(b.id, auth.uid()) is not null
  ) then
    raise exception 'pick one of your birds' using errcode = '22023';
  end if;
  insert into public.flock_challenge_members (challenge_id, user_id, bird_id, feature_ok)
  values (x.id, auth.uid(), p_bird_id, coalesce(p_feature_ok, false))
  on conflict (challenge_id, user_id) do update
    set bird_id = excluded.bird_id, feature_ok = excluded.feature_ok;
  return private.flock_challenge_journey(auth.uid(), x.id);
end;
$$;

-- "It's OK to feature my entries", on or off, any time after joining.
create or replace function private.flock_challenge_set_feature(p_id uuid, p_ok boolean)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.assert_can_use_flock();
  update public.flock_challenge_members m set feature_ok = coalesce(p_ok, false)
  where m.challenge_id = p_id and m.user_id = auth.uid();
  if not found then
    raise exception 'not found' using errcode = 'P0002';
  end if;
end;
$$;

-- Post an entry while the challenge is open: a few sentences and up to four
-- photos, under the same limits as a post. On a standalone challenge it
-- answers one prompt (one entry each); on a journey challenge p_prompt is
-- null. Returns the post; flock_challenge_finished then says whether the
-- caller has finished.
create or replace function private.flock_challenge_entry_create(
  p_id uuid, p_prompt integer, p_body text, p_photo_paths text[], p_bird_id uuid, p_vet_nudged boolean
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  x public.flock_challenges;
  v_paths text[] := coalesce(p_photo_paths, '{}');
  v_path text;
  v_id uuid;
begin
  perform private.assert_can_use_flock();
  if not exists (select 1 from public.flock_profiles fp where fp.user_id = v_me) then
    raise exception 'set up your Community profile first' using errcode = '42501';
  end if;
  select * into x from public.flock_challenges c where c.id = p_id;
  if x.id is null or not private.flock_challenge_visible(v_me, x.id) then
    raise exception 'not found' using errcode = 'P0002';
  end if;
  if private.flock_challenge_state(x.status, x.starts_on, x.ends_on) <> 'open' then
    raise exception 'challenge_closed' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.flock_challenge_members m where m.challenge_id = x.id and m.user_id = v_me) then
    raise exception 'join_first' using errcode = 'P0001';
  end if;
  if x.kind = 'standalone' then
    if p_prompt is null or not exists (
      select 1 from public.flock_challenge_prompts pr where pr.challenge_id = x.id and pr.position = p_prompt
    ) then
      raise exception 'pick one of the prompts' using errcode = '22023';
    end if;
    if exists (select 1 from public.flock_posts p
               where p.challenge_id = x.id and p.author_id = v_me and p.challenge_prompt = p_prompt and p.status <> 'removed') then
      raise exception 'already_posted' using errcode = 'P0001';
    end if;
  elsif p_prompt is not null then
    raise exception 'journey challenges have no prompts' using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_body, ''))) not between 1 and 5000 then
    raise exception 'write a few words (up to 5,000 characters)' using errcode = '22023';
  end if;
  if cardinality(v_paths) > 4 or cardinality(v_paths) <> (select count(distinct y) from unnest(v_paths) y) then
    raise exception 'up to four photos' using errcode = '22023';
  end if;
  foreach v_path in array v_paths loop
    if not private.flock_own_photo_ok(v_me, v_path) then
      raise exception 'photo not found' using errcode = '22023';
    end if;
  end loop;
  if p_bird_id is not null and not exists (
    select 1 from public.flock_shown_birds s
    join public.birds b on b.id = s.bird_id and b.owner_id = s.user_id
    where s.bird_id = p_bird_id and s.user_id = v_me and s.shown and b.passed_at is null
  ) then
    raise exception 'attach one of the birds you show in the Community' using errcode = '22023';
  end if;
  perform private.flock_check_rate(v_me, 'posts', cardinality(v_paths));
  insert into public.flock_posts (author_id, space, body, bird_id, photo_paths, status, vet_nudged, challenge_id, challenge_prompt)
  values (v_me, 'challenge', btrim(p_body), p_bird_id, v_paths, 'live', coalesce(p_vet_nudged, false), x.id, p_prompt)
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function private.flock_challenge_join(uuid, uuid, boolean) from public, anon;
revoke all on function private.flock_challenge_set_feature(uuid, boolean) from public, anon;
revoke all on function private.flock_challenge_entry_create(uuid, integer, text, text[], uuid, boolean) from public, anon;
grant execute on function private.flock_challenge_join(uuid, uuid, boolean) to authenticated, service_role;
grant execute on function private.flock_challenge_set_feature(uuid, boolean) to authenticated, service_role;
grant execute on function private.flock_challenge_entry_create(uuid, integer, text, text[], uuid, boolean) to authenticated, service_role;

-- Whether the caller has finished, read in its own statement (a stable read
-- doesn't see the entry the same statement just wrote).
create or replace function private.flock_challenge_finished(p_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.assert_can_use_flock();
  return private.flock_challenge_visible(auth.uid(), p_id) and private.flock_challenge_done(auth.uid(), p_id, false);
end;
$$;
revoke all on function private.flock_challenge_finished(uuid) from public, anon;
grant execute on function private.flock_challenge_finished(uuid) to authenticated, service_role;


-- 5) Admin writes ----------------------------------------------------------------------

-- Create (p_id null) or edit a challenge that hasn't started: kind, title,
-- description, template (journey) or prompts (standalone, in order), the
-- audience and the days. A scheduled one is checked again as if scheduling.
create or replace function private.admin_challenge_save(
  p_id uuid, p_kind text, p_title text, p_description text, p_template_slug text, p_prompts jsonb,
  p_region_slug text, p_starts_on date, p_ends_on date
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  x public.flock_challenges;
  v_id uuid;
  v_template uuid;
  v_prompts jsonb := coalesce(p_prompts, '[]'::jsonb);
begin
  perform private.assert_flock_admin();
  if p_kind is null or p_kind not in ('journey', 'standalone') then
    raise exception 'pick journey or standalone' using errcode = '22023';
  end if;
  if nullif(btrim(coalesce(p_title, '')), '') is null or length(btrim(p_title)) > 120 then
    raise exception 'add a title (up to 120 characters)' using errcode = '22023';
  end if;
  if p_description is not null and length(btrim(p_description)) > 600 then
    raise exception 'descriptions are up to 600 characters' using errcode = '22023';
  end if;
  if p_starts_on is null or p_ends_on is null or p_ends_on < p_starts_on then
    raise exception 'pick a start and an end on or after it' using errcode = '22023';
  end if;
  if p_region_slug is not null and not exists (select 1 from public.regions r where r.slug = p_region_slug) then
    raise exception 'unknown chapter' using errcode = '22023';
  end if;
  if p_kind = 'journey' then
    select t.id into v_template from public.journey_templates t where t.slug = p_template_slug;
    if v_template is null then
      raise exception 'pick a journey' using errcode = '22023';
    end if;
    if not private.flock_challenge_template_ok(v_template) then
      raise exception 'no_food_challenges' using errcode = 'P0001';
    end if;
    v_prompts := '[]'::jsonb;
  else
    if jsonb_typeof(v_prompts) <> 'array' then
      raise exception 'prompts must be a list' using errcode = '22023';
    end if;
    if jsonb_array_length(v_prompts) > 30 then
      raise exception 'up to 30 prompts' using errcode = '22023';
    end if;
    if exists (select 1 from jsonb_array_elements_text(v_prompts) e where length(btrim(e)) not between 1 and 140) then
      raise exception 'each prompt is a few words (up to 140 characters)' using errcode = '22023';
    end if;
  end if;
  if p_id is null then
    insert into public.flock_challenges (kind, title, description, template_id, region_slug, starts_on, ends_on, created_by)
    values (p_kind, btrim(p_title), nullif(btrim(coalesce(p_description, '')), ''), v_template, p_region_slug,
            p_starts_on, p_ends_on, auth.uid())
    returning id into v_id;
  else
    select * into x from public.flock_challenges c where c.id = p_id for update;
    if x.id is null then
      raise exception 'not found' using errcode = 'P0002';
    end if;
    if private.flock_challenge_state(x.status, x.starts_on, x.ends_on) not in ('draft', 'upcoming') then
      raise exception 'started_challenges_stay' using errcode = 'P0001';
    end if;
    update public.flock_challenges c set
      kind = p_kind, title = btrim(p_title), description = nullif(btrim(coalesce(p_description, '')), ''),
      template_id = v_template, region_slug = p_region_slug, starts_on = p_starts_on, ends_on = p_ends_on, updated_at = now()
    where c.id = x.id;
    v_id := x.id;
    delete from public.flock_challenge_prompts pr where pr.challenge_id = v_id;
  end if;
  insert into public.flock_challenge_prompts (challenge_id, position, body)
  select v_id, e.ord::integer, btrim(e.val)
  from jsonb_array_elements_text(v_prompts) with ordinality as e(val, ord);
  if x.id is not null and x.status = 'scheduled' then
    perform private.flock_challenge_check_schedule(v_id);
  end if;
  return v_id;
end;
$$;

-- What scheduling needs: a start still ahead or today, prompts on a
-- standalone challenge, an allowed template, and no other scheduled
-- challenge for the same audience on any of the same days.
create or replace function private.flock_challenge_check_schedule(p_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  x public.flock_challenges;
begin
  perform pg_advisory_xact_lock(hashtext('flock_challenges_schedule'));
  select * into x from public.flock_challenges c where c.id = p_id;
  if x.starts_on < private.flock_today() then
    raise exception 'pick a start day that''s today or later' using errcode = '22023';
  end if;
  if x.kind = 'standalone' and not exists (select 1 from public.flock_challenge_prompts pr where pr.challenge_id = x.id) then
    raise exception 'add at least one prompt' using errcode = '22023';
  end if;
  if x.kind = 'journey' and not private.flock_challenge_template_ok(x.template_id) then
    raise exception 'no_food_challenges' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.flock_challenges o
    where o.id <> x.id and o.status = 'scheduled'
      and o.region_slug is not distinct from x.region_slug
      and o.starts_on <= x.ends_on and o.ends_on >= x.starts_on
  ) then
    raise exception 'challenge_overlap' using errcode = 'P0001';
  end if;
end;
$$;

create or replace function private.admin_challenge_schedule(p_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  x public.flock_challenges;
begin
  perform private.assert_flock_admin();
  select * into x from public.flock_challenges c where c.id = p_id for update;
  if x.id is null then
    raise exception 'not found' using errcode = 'P0002';
  end if;
  if x.status <> 'draft' then
    raise exception 'already scheduled' using errcode = '22023';
  end if;
  perform private.flock_challenge_check_schedule(x.id);
  update public.flock_challenges c set status = 'scheduled', updated_at = now() where c.id = x.id;
end;
$$;

-- Back to a draft, before it starts.
create or replace function private.admin_challenge_unschedule(p_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  x public.flock_challenges;
begin
  perform private.assert_flock_admin();
  select * into x from public.flock_challenges c where c.id = p_id for update;
  if x.id is null then
    raise exception 'not found' using errcode = 'P0002';
  end if;
  if private.flock_challenge_state(x.status, x.starts_on, x.ends_on) <> 'upcoming' then
    raise exception 'started_challenges_stay' using errcode = 'P0001';
  end if;
  update public.flock_challenges c set status = 'draft', updated_at = now() where c.id = x.id;
end;
$$;

-- Delete a draft.
create or replace function private.admin_challenge_delete(p_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  x public.flock_challenges;
begin
  perform private.assert_flock_admin();
  select * into x from public.flock_challenges c where c.id = p_id for update;
  if x.id is null then
    raise exception 'not found' using errcode = 'P0002';
  end if;
  if x.status <> 'draft' then
    raise exception 'only drafts can be deleted' using errcode = '22023';
  end if;
  delete from public.flock_challenges c where c.id = x.id;
end;
$$;

-- Pin one entry (null unpins), while open or after. Only an entry whose
-- author said yes to being featured.
create or replace function private.admin_challenge_pin(p_id uuid, p_post_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  x public.flock_challenges;
begin
  perform private.assert_flock_admin();
  select * into x from public.flock_challenges c where c.id = p_id for update;
  if x.id is null or private.flock_challenge_state(x.status, x.starts_on, x.ends_on) not in ('open', 'closed') then
    raise exception 'not found' using errcode = 'P0002';
  end if;
  if p_post_id is not null and not exists (
    select 1 from public.flock_posts p
    join public.flock_challenge_members m on m.challenge_id = p.challenge_id and m.user_id = p.author_id and m.feature_ok
    where p.id = p_post_id and p.challenge_id = x.id and p.status = 'live'
  ) then
    raise exception 'feature_needs_permission' using errcode = 'P0001';
  end if;
  update public.flock_challenges c set pinned_post_id = p_post_id, updated_at = now() where c.id = x.id;
end;
$$;

-- The wrap-up, once the challenge has closed: a note (empty clears it) and
-- up to 12 featured entries, each only with its author's yes.
create or replace function private.admin_challenge_wrap_up(p_id uuid, p_text text, p_featured uuid[])
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  x public.flock_challenges;
  v_featured uuid[] := coalesce(p_featured, '{}');
begin
  perform private.assert_flock_admin();
  select * into x from public.flock_challenges c where c.id = p_id for update;
  if x.id is null then
    raise exception 'not found' using errcode = 'P0002';
  end if;
  if private.flock_challenge_state(x.status, x.starts_on, x.ends_on) <> 'closed' then
    raise exception 'wrap_up_after_close' using errcode = 'P0001';
  end if;
  if cardinality(v_featured) > 12 then
    raise exception 'up to 12 featured entries' using errcode = '22023';
  end if;
  if exists (
    select 1 from unnest(v_featured) f(id)
    where not exists (
      select 1 from public.flock_posts p
      join public.flock_challenge_members m on m.challenge_id = p.challenge_id and m.user_id = p.author_id and m.feature_ok
      where p.id = f.id and p.challenge_id = x.id and p.status = 'live'
    )
  ) then
    raise exception 'feature_needs_permission' using errcode = 'P0001';
  end if;
  update public.flock_challenges c set
    wrap_up = nullif(left(btrim(coalesce(p_text, '')), 2000), ''),
    wrap_up_at = case when nullif(btrim(coalesce(p_text, '')), '') is null then null else coalesce(c.wrap_up_at, now()) end,
    featured_post_ids = (select coalesce(array_agg(f.id order by f.ord), '{}')
                         from (select distinct on (u.id) u.id, u.ord from unnest(v_featured) with ordinality u(id, ord)
                               order by u.id, u.ord) f),
    updated_at = now()
  where c.id = x.id;
end;
$$;

-- Admins: one challenge's editable fields, drafts included.
create or replace function private.admin_challenge(p_id uuid)
returns table (
  challenge_id uuid, kind text, title text, description text, template_slug text, region_slug text,
  starts_on date, ends_on date, state text, prompts text[], wrap_up text, pinned_post_id uuid, featured_post_ids uuid[]
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform private.assert_flock_admin();
  return query
    select x.id, x.kind, x.title, x.description, t.slug, x.region_slug, x.starts_on, x.ends_on,
           private.flock_challenge_state(x.status, x.starts_on, x.ends_on),
           coalesce((select array_agg(pr.body order by pr.position) from public.flock_challenge_prompts pr where pr.challenge_id = x.id), '{}'),
           x.wrap_up, x.pinned_post_id, x.featured_post_ids
    from public.flock_challenges x
    left join public.journey_templates t on t.id = x.template_id
    where x.id = p_id;
end;
$$;

revoke all on function private.admin_challenge_save(uuid, text, text, text, text, jsonb, text, date, date) from public, anon;
revoke all on function private.flock_challenge_check_schedule(uuid) from public, anon, authenticated;
revoke all on function private.admin_challenge_schedule(uuid) from public, anon;
revoke all on function private.admin_challenge_unschedule(uuid) from public, anon;
revoke all on function private.admin_challenge_delete(uuid) from public, anon;
revoke all on function private.admin_challenge_pin(uuid, uuid) from public, anon;
revoke all on function private.admin_challenge_wrap_up(uuid, text, uuid[]) from public, anon;
revoke all on function private.admin_challenge(uuid) from public, anon;
grant execute on function private.admin_challenge_save(uuid, text, text, text, text, jsonb, text, date, date) to authenticated, service_role;
grant execute on function private.flock_challenge_check_schedule(uuid) to service_role;
grant execute on function private.admin_challenge_schedule(uuid) to authenticated, service_role;
grant execute on function private.admin_challenge_unschedule(uuid) to authenticated, service_role;
grant execute on function private.admin_challenge_delete(uuid) to authenticated, service_role;
grant execute on function private.admin_challenge_pin(uuid, uuid) to authenticated, service_role;
grant execute on function private.admin_challenge_wrap_up(uuid, text, uuid[]) to authenticated, service_role;
grant execute on function private.admin_challenge(uuid) to authenticated, service_role;


-- 6) The existing Flock functions, each rewritten from its live definition ---------------
create or replace function private.flock_challenge_patch(p_sig text, p_pairs text[])
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_def text := pg_get_functiondef(p_sig::regprocedure);
  i integer;
begin
  if array_length(p_pairs, 1) % 2 <> 0 then
    raise exception 'flock_challenge_patch(%): pairs must come in twos', p_sig;
  end if;
  for i in 1 .. array_length(p_pairs, 1) by 2 loop
    if position(p_pairs[i] in v_def) = 0 then
      raise exception 'flock_challenge_patch(%): anchor not found: %', p_sig, p_pairs[i];
    end if;
    v_def := replace(v_def, p_pairs[i], p_pairs[i + 1]);
  end loop;
  execute v_def;
end;
$$;

-- A challenge entry shows only to people who may see its challenge (its
-- author always does, through the first branch).
select private.flock_challenge_patch('private.flock_post_visible(uuid, uuid)', array[
  'and (p.space <> ''chapter''',
  'and (p.space <> ''challenge'' or private.flock_challenge_visible(p_user_id, p.challenge_id))
            and (p.space <> ''chapter'''
]);

-- Today's "everything" leaves challenge entries to their challenge's feed.
select private.flock_challenge_patch('private.flock_feed(text, timestamptz, integer)', array[
  'where (p_space = ''everything'' or r.space = p_space)',
  'where ((p_space = ''everything'' and r.space <> ''challenge'') or r.space = p_space)'
]);

-- Challenge champ: a finished challenge. Profiles (p_public) count a journey
-- challenge only when its journey is shared with the community.
select private.flock_challenge_patch('private.flock_badge_levels(uuid, boolean)', array[
  'select ''challenge_champ'', 0;',
  'select ''challenge_champ'',
         case when exists (select 1 from public.flock_challenge_members m
                           where m.user_id = p_user and private.flock_challenge_done(p_user, m.challenge_id, p_public))
              then 1 else 0 end;'
]);

-- Profiles cap Challenge champ at what others may see, as they already do
-- for the journey badges, so one earned through a "Just me" journey never
-- shows outside the household.
select private.flock_challenge_patch('private.flock_member_badges(uuid)', array[
  'b.id in (''journey_finisher'', ''trick_star'')',
  'b.id in (''journey_finisher'', ''trick_star'', ''challenge_champ'')'
]);

drop function private.flock_challenge_patch(text, text[]);


-- 7) Invoker wrappers the app calls ------------------------------------------------------

create or replace function public.flock_challenges_current()
returns table (
  challenge_id uuid, kind text, title text, description text, template_slug text, template_name text,
  region_slug text, region_name text, state text, starts_on date, ends_on date, days_left integer,
  prompts jsonb, member_count integer, faces jsonb,
  joined boolean, my_bird_id uuid, my_bird_name text, feature_ok boolean, my_journey_id uuid,
  done_count integer, total_count integer, finished boolean,
  wrap_up text, pinned_post_id uuid, featured_post_ids uuid[]
) language sql stable security invoker set search_path = ''
as $$ select * from private.flock_challenge_rows(null); $$;

create or replace function public.flock_challenge(p_id uuid)
returns table (
  challenge_id uuid, kind text, title text, description text, template_slug text, template_name text,
  region_slug text, region_name text, state text, starts_on date, ends_on date, days_left integer,
  prompts jsonb, member_count integer, faces jsonb,
  joined boolean, my_bird_id uuid, my_bird_name text, feature_ok boolean, my_journey_id uuid,
  done_count integer, total_count integer, finished boolean,
  wrap_up text, pinned_post_id uuid, featured_post_ids uuid[]
) language sql stable security invoker set search_path = ''
as $$ select * from private.flock_challenge_rows(p_id) where p_id is not null; $$;

create or replace function public.flock_challenge_entries(p_id uuid, p_before timestamptz default null, p_limit integer default 20)
returns table (
  post_id uuid, author_id uuid, author_name text, author_region text, author_photo_path text, author_is_founder boolean,
  space text, region_slug text, region_name text, title text, body text, photo_count integer,
  bird_id uuid, bird_name text, bird_has_photo boolean, status text, review_note text,
  created_at timestamptz, edited_at timestamptz, is_mine boolean, comment_count integer,
  great_job integer, been_there integer, rooting_for_you integer, love_this integer, mine text[],
  prompt integer
) language sql stable security invoker set search_path = ''
as $$ select * from private.flock_challenge_entries(p_id, p_before, p_limit); $$;

create or replace function public.flock_challenge_join(p_id uuid, p_bird_id uuid, p_feature_ok boolean default false)
returns uuid language sql volatile security invoker set search_path = ''
as $$ select private.flock_challenge_join(p_id, p_bird_id, p_feature_ok); $$;

create or replace function public.flock_challenge_set_feature(p_id uuid, p_ok boolean)
returns void language sql volatile security invoker set search_path = ''
as $$ select private.flock_challenge_set_feature(p_id, p_ok); $$;

create or replace function public.flock_challenge_entry_create(
  p_id uuid, p_prompt integer, p_body text, p_photo_paths text[], p_bird_id uuid, p_vet_nudged boolean
)
returns uuid language sql volatile security invoker set search_path = ''
as $$ select private.flock_challenge_entry_create(p_id, p_prompt, p_body, p_photo_paths, p_bird_id, p_vet_nudged); $$;

create or replace function public.flock_challenge_finished(p_id uuid)
returns boolean language sql stable security invoker set search_path = ''
as $$ select private.flock_challenge_finished(p_id); $$;

create or replace function public.admin_challenges()
returns table (
  challenge_id uuid, kind text, title text, region_slug text, region_name text, state text,
  starts_on date, ends_on date, member_count integer, entry_count integer, updated_at timestamptz
) language sql stable security invoker set search_path = ''
as $$ select * from private.admin_challenges(); $$;

create or replace function public.admin_challenge(p_id uuid)
returns table (
  challenge_id uuid, kind text, title text, description text, template_slug text, region_slug text,
  starts_on date, ends_on date, state text, prompts text[], wrap_up text, pinned_post_id uuid, featured_post_ids uuid[]
) language sql stable security invoker set search_path = ''
as $$ select * from private.admin_challenge(p_id); $$;

create or replace function public.admin_challenge_featurable(p_id uuid)
returns table (post_id uuid, author_name text, body text, photo_count integer, prompt integer, created_at timestamptz)
language sql stable security invoker set search_path = ''
as $$ select * from private.admin_challenge_featurable(p_id); $$;

create or replace function public.admin_challenge_save(
  p_id uuid, p_kind text, p_title text, p_description text, p_template_slug text, p_prompts jsonb,
  p_region_slug text, p_starts_on date, p_ends_on date
)
returns uuid language sql volatile security invoker set search_path = ''
as $$ select private.admin_challenge_save(p_id, p_kind, p_title, p_description, p_template_slug, p_prompts, p_region_slug, p_starts_on, p_ends_on); $$;

create or replace function public.admin_challenge_schedule(p_id uuid)
returns void language sql volatile security invoker set search_path = ''
as $$ select private.admin_challenge_schedule(p_id); $$;

create or replace function public.admin_challenge_unschedule(p_id uuid)
returns void language sql volatile security invoker set search_path = ''
as $$ select private.admin_challenge_unschedule(p_id); $$;

create or replace function public.admin_challenge_delete(p_id uuid)
returns void language sql volatile security invoker set search_path = ''
as $$ select private.admin_challenge_delete(p_id); $$;

create or replace function public.admin_challenge_pin(p_id uuid, p_post_id uuid)
returns void language sql volatile security invoker set search_path = ''
as $$ select private.admin_challenge_pin(p_id, p_post_id); $$;

create or replace function public.admin_challenge_wrap_up(p_id uuid, p_text text, p_featured uuid[])
returns void language sql volatile security invoker set search_path = ''
as $$ select private.admin_challenge_wrap_up(p_id, p_text, p_featured); $$;

revoke all on function public.flock_challenges_current() from public, anon;
revoke all on function public.flock_challenge(uuid) from public, anon;
revoke all on function public.flock_challenge_entries(uuid, timestamptz, integer) from public, anon;
revoke all on function public.flock_challenge_join(uuid, uuid, boolean) from public, anon;
revoke all on function public.flock_challenge_set_feature(uuid, boolean) from public, anon;
revoke all on function public.flock_challenge_entry_create(uuid, integer, text, text[], uuid, boolean) from public, anon;
revoke all on function public.flock_challenge_finished(uuid) from public, anon;
revoke all on function public.admin_challenges() from public, anon;
revoke all on function public.admin_challenge(uuid) from public, anon;
revoke all on function public.admin_challenge_featurable(uuid) from public, anon;
revoke all on function public.admin_challenge_save(uuid, text, text, text, text, jsonb, text, date, date) from public, anon;
revoke all on function public.admin_challenge_schedule(uuid) from public, anon;
revoke all on function public.admin_challenge_unschedule(uuid) from public, anon;
revoke all on function public.admin_challenge_delete(uuid) from public, anon;
revoke all on function public.admin_challenge_pin(uuid, uuid) from public, anon;
revoke all on function public.admin_challenge_wrap_up(uuid, text, uuid[]) from public, anon;
grant execute on function public.flock_challenges_current() to authenticated, service_role;
grant execute on function public.flock_challenge(uuid) to authenticated, service_role;
grant execute on function public.flock_challenge_entries(uuid, timestamptz, integer) to authenticated, service_role;
grant execute on function public.flock_challenge_join(uuid, uuid, boolean) to authenticated, service_role;
grant execute on function public.flock_challenge_set_feature(uuid, boolean) to authenticated, service_role;
grant execute on function public.flock_challenge_entry_create(uuid, integer, text, text[], uuid, boolean) to authenticated, service_role;
grant execute on function public.flock_challenge_finished(uuid) to authenticated, service_role;
grant execute on function public.admin_challenges() to authenticated, service_role;
grant execute on function public.admin_challenge(uuid) to authenticated, service_role;
grant execute on function public.admin_challenge_featurable(uuid) to authenticated, service_role;
grant execute on function public.admin_challenge_save(uuid, text, text, text, text, jsonb, text, date, date) to authenticated, service_role;
grant execute on function public.admin_challenge_schedule(uuid) to authenticated, service_role;
grant execute on function public.admin_challenge_unschedule(uuid) to authenticated, service_role;
grant execute on function public.admin_challenge_delete(uuid) to authenticated, service_role;
grant execute on function public.admin_challenge_pin(uuid, uuid) to authenticated, service_role;
grant execute on function public.admin_challenge_wrap_up(uuid, text, uuid[]) to authenticated, service_role;
