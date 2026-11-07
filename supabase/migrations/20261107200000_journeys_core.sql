-- The Flock, step 3 (PR A): journeys — templates, starting a journey, a bird's
-- skill list. Additive only: new tables and functions. No care-app table,
-- policy, trigger or function changes. birds, bird_members (through
-- has_bird_access) and clip_assets are read, never changed in shape.
--
-- Who may use journeys at all: private.can_use_journeys(user) =
--   can_use_flock (a Flock member, or an admin) OR journeys are turned on for
--   them in the care app (journeys_enabled(), off for everyone until Brittany
--   turns it on: select public.admin_set_journeys('admins' | 'everyone' | 'off')).
--
-- What they may do depends on their tier (private.journey_tier):
--   free    — the 7 free templates (premium ones are listed, locked);
--             one custom journey open at a time; private only.
--   premium — has_app_premium(): every template, unlimited custom journeys,
--             private only (reading community journeys comes with PR C).
--   flock   — is_flock_member() (or an admin): all of the above, plus sharing
--             with the community.
-- Clip limits per tier live in public.journey_limits (config, not code):
--   free 60 s / 10 clips per journey, premium 5 min / 20, flock 20 min / none.
--
-- Bird access follows the care app's rules: anyone with a bird_members row for
-- the bird (owner or household) can read its journeys and start one. Writes go
-- through the SECURITY DEFINER functions below only; app users have SELECT on
-- the tables and nothing else. Community visibility (visibility = 'community')
-- only matters to other members' read functions, which come in PR C.
--
-- Templates are seeded from Brittany's "Journey templates" doc (draft, reviewed
-- before launch). The seed never overwrites: edit text later with
-- admin_update_journey_template / admin_set_journey_milestone, no deploy.


-- 1) Settings: the care-app flag and the per-tier limits ----------------------------

create table if not exists public.journey_settings (
  id          boolean primary key default true check (id),
  audience    text not null default 'off' check (audience in ('off', 'admins', 'everyone')),
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users(id) on delete set null
);
insert into public.journey_settings (id) values (true) on conflict (id) do nothing;

comment on table public.journey_settings is
  'journeys_enabled(): whether journeys appear in the care app. off = nobody, admins = admins only, everyone = all signed-in users. Change with admin_set_journeys().';

alter table public.journey_settings enable row level security;
revoke all on public.journey_settings from anon, authenticated;
grant select, insert, update, delete on public.journey_settings to service_role;

create table if not exists public.journey_limits (
  tier                  text primary key check (tier in ('free', 'premium', 'flock')),
  max_clip_seconds      integer not null check (max_clip_seconds between 5 and 3600),
  max_clips_per_journey integer check (max_clips_per_journey is null or max_clips_per_journey >= 1),
  max_open_custom       integer check (max_open_custom is null or max_open_custom >= 0),
  max_upload_bytes      bigint not null check (max_upload_bytes > 0),
  can_use_premium       boolean not null,
  can_share             boolean not null,
  can_view_community    boolean not null,
  updated_at            timestamptz not null default now()
);

comment on table public.journey_limits is
  'Per-tier journey limits. NULL = no limit. Edit the row to change a limit; nothing in the app hard-codes these.';

insert into public.journey_limits
  (tier, max_clip_seconds, max_clips_per_journey, max_open_custom, max_upload_bytes, can_use_premium, can_share, can_view_community)
values
  ('free',      60, 10,   1,    262144000, false, false, false),  -- 250 MB, as care clips today
  ('premium',  300, 20,   null, 1073741824, true, false, true),   -- 1 GB
  ('flock',   1200, null, null, 2000000000, true, true,  true)    -- the upload function's ceiling
on conflict (tier) do nothing;

alter table public.journey_limits enable row level security;
revoke all on public.journey_limits from anon, authenticated;
grant select, insert, update, delete on public.journey_limits to service_role;

create or replace function private.journeys_on_for(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user_id is not null and coalesce((
    select s.audience = 'everyone' or (s.audience = 'admins' and private.is_admin(p_user_id))
    from public.journey_settings s where s.id
  ), false);
$$;

revoke all on function private.journeys_on_for(uuid) from public, anon;
grant execute on function private.journeys_on_for(uuid) to authenticated, service_role;

-- The care app's flag. Nothing journey-related shows in the care app unless
-- this is true for the signed-in person.
create or replace function public.journeys_enabled()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select private.journeys_on_for(auth.uid());
$$;

revoke all on function public.journeys_enabled() from public, anon;
grant execute on function public.journeys_enabled() to authenticated, service_role;

create or replace function public.admin_set_journeys(p_audience text)
returns public.journey_settings
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_row public.journey_settings;
begin
  if p_audience is null or p_audience not in ('off', 'admins', 'everyone') then
    raise exception 'p_audience must be off, admins or everyone' using errcode = '22023';
  end if;
  perform private.assert_entitlement_admin();
  insert into public.journey_settings (id, audience, updated_at, updated_by)
  values (true, p_audience, now(), auth.uid())
  on conflict (id) do update
    set audience = excluded.audience, updated_at = excluded.updated_at, updated_by = excluded.updated_by
  returning * into v_row;
  return v_row;
end;
$$;

revoke all on function public.admin_set_journeys(text) from public, anon;
grant execute on function public.admin_set_journeys(text) to authenticated, service_role;

create or replace function private.can_use_journeys(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user_id is not null and (private.can_use_flock(p_user_id) or private.journeys_on_for(p_user_id));
$$;

revoke all on function private.can_use_journeys(uuid) from public, anon;
grant execute on function private.can_use_journeys(uuid) to authenticated, service_role;

-- Admins count as Flock members here, as everywhere in the Flock before it opens.
create or replace function private.journey_tier(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_user_id is null then 'free'
    when private.is_flock_member(p_user_id) or private.is_admin(p_user_id) then 'flock'
    when private.has_app_premium(p_user_id) then 'premium'
    else 'free'
  end;
$$;

revoke all on function private.journey_tier(uuid) from public, anon;
grant execute on function private.journey_tier(uuid) to authenticated, service_role;

create or replace function private.journey_limits_for(p_user_id uuid)
returns public.journey_limits
language sql
stable
security definer
set search_path = ''
as $$
  select l from public.journey_limits l where l.tier = private.journey_tier(p_user_id);
$$;

revoke all on function private.journey_limits_for(uuid) from public, anon;
grant execute on function private.journey_limits_for(uuid) to authenticated, service_role;

create or replace function private.assert_can_use_journeys()
returns void
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if not private.can_use_journeys(auth.uid()) then
    raise exception 'journeys are not available' using errcode = '42501';
  end if;
end;
$$;

revoke all on function private.assert_can_use_journeys() from public, anon;
grant execute on function private.assert_can_use_journeys() to authenticated, service_role;


-- 2) Templates ------------------------------------------------------------------------

create table if not exists public.journey_templates (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique check (slug ~ '^[a-z0-9-]{2,60}$'),
  name            text not null check (length(name) between 1 and 60),
  category        text not null check (category in ('husbandry', 'foundations', 'food', 'tricks')),
  tier            text not null check (tier in ('free', 'premium')),
  purpose         text not null,
  -- Shown as "Done when <done_when>".
  done_when       text not null,
  -- "Target training", "Target training helps", or NULL. A suggestion, never a lock.
  suggested_first text,
  typical_length  text not null,
  -- The same three reminders on every template, per the doc.
  safety_notes    text[] not null default array[
    'Keep sessions short.',
    'Stop at the first sign of stress.',
    'Never withhold food to make a bird hungrier for training.'
  ]::text[],
  -- Diet conversion's "Safeguards built into this journey".
  safeguards      text[] not null default '{}',
  -- Diet conversion's "How to make it work" (for Brittany to review and expand).
  tips            text[] not null default '{}',
  review_status   text not null default 'draft' check (review_status in ('draft', 'approved')),
  sort_order      integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  updated_by      uuid references auth.users(id) on delete set null
);

create table if not exists public.journey_template_milestones (
  id          uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.journey_templates(id) on delete cascade,
  position    integer not null check (position between 1 and 20),
  title       text not null check (length(title) between 1 and 300),
  unique (template_id, position)
);

alter table public.journey_templates enable row level security;
alter table public.journey_template_milestones enable row level security;
revoke all on public.journey_templates, public.journey_template_milestones from anon, authenticated;
grant select on public.journey_templates, public.journey_template_milestones to authenticated;
grant select, insert, update, delete on public.journey_templates, public.journey_template_milestones to service_role;

drop policy if exists "journey_templates read" on public.journey_templates;
create policy "journey_templates read" on public.journey_templates
  for select to authenticated
  using (private.can_use_journeys((select auth.uid())));

drop policy if exists "journey_template_milestones read" on public.journey_template_milestones;
create policy "journey_template_milestones read" on public.journey_template_milestones
  for select to authenticated
  using (private.can_use_journeys((select auth.uid())));


-- 3) Journeys, their milestones, clips, and a bird's skills ------------------------------

create table if not exists public.journeys (
  id           uuid primary key default gen_random_uuid(),
  bird_id      uuid not null references public.birds(id) on delete cascade,
  created_by   uuid not null references auth.users(id) on delete cascade,
  template_id  uuid references public.journey_templates(id) on delete restrict,
  custom_name  text check (custom_name is null or length(btrim(custom_name)) between 1 and 60),
  status       text not null default 'active'
                 check (status in ('active', 'paused', 'finished', 'happy_where_we_are')),
  visibility   text not null default 'private' check (visibility in ('community', 'private')),
  rhythm       text not null check (rhythm in ('most_days', 'few_times_week', 'weekends')),
  started_at   timestamptz not null default now(),
  paused_at    timestamptz,
  finished_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint journeys_template_or_custom check ((template_id is null) <> (custom_name is null))
);

create index if not exists journeys_bird_idx on public.journeys (bird_id);
create index if not exists journeys_created_by_idx on public.journeys (created_by);
-- One open journey per bird per template.
create unique index if not exists journeys_one_open_per_template
  on public.journeys (bird_id, template_id)
  where template_id is not null and status in ('active', 'paused');

create table if not exists public.journey_milestones (
  id                    uuid primary key default gen_random_uuid(),
  journey_id            uuid not null references public.journeys(id) on delete cascade,
  position              integer not null check (position between 1 and 20),
  title                 text not null check (length(btrim(title)) between 1 and 300),
  template_milestone_id uuid references public.journey_template_milestones(id) on delete set null,
  -- 'already' = the bird already did this when the journey started.
  state                 text not null default 'todo' check (state in ('todo', 'already', 'reached')),
  reached_at            timestamptz,
  unique (journey_id, position)
);

create table if not exists public.journey_updates (
  id          uuid primary key default gen_random_uuid(),
  journey_id  uuid not null references public.journeys(id) on delete cascade,
  bird_id     uuid not null references public.birds(id) on delete cascade,
  author_id   uuid not null references auth.users(id) on delete cascade,
  clip_ref    text check (clip_ref is null or clip_ref ~ '^cfstream:[A-Za-z0-9]{8,64}$'),
  is_day_one  boolean not null default false,
  created_at  timestamptz not null default now()
);

create index if not exists journey_updates_journey_idx on public.journey_updates (journey_id, created_at);
create unique index if not exists journey_updates_one_day_one on public.journey_updates (journey_id) where is_day_one;

create table if not exists public.bird_skills (
  id          uuid primary key default gen_random_uuid(),
  bird_id     uuid not null references public.birds(id) on delete cascade,
  name        text not null check (length(btrim(name)) between 1 and 60),
  template_id uuid references public.journey_templates(id) on delete set null,
  -- 'known' = marked as already known; 'journey' = learned through a finished journey.
  source      text not null check (source in ('known', 'journey')),
  journey_id  uuid references public.journeys(id) on delete set null,
  added_by    uuid references auth.users(id) on delete set null,
  added_at    timestamptz not null default now()
);

create unique index if not exists bird_skills_one_per_name on public.bird_skills (bird_id, lower(btrim(name)));
create index if not exists bird_skills_bird_idx on public.bird_skills (bird_id);

alter table public.journeys enable row level security;
alter table public.journey_milestones enable row level security;
alter table public.journey_updates enable row level security;
alter table public.bird_skills enable row level security;
revoke all on public.journeys, public.journey_milestones, public.journey_updates, public.bird_skills from anon, authenticated;
grant select on public.journeys, public.journey_milestones, public.journey_updates, public.bird_skills to authenticated;
grant select, insert, update, delete on public.journeys, public.journey_milestones, public.journey_updates, public.bird_skills to service_role;

-- Read: anyone with access to the bird (owner or household), the care app's rule.
drop policy if exists "journeys bird member read" on public.journeys;
create policy "journeys bird member read" on public.journeys
  for select to authenticated
  using (private.can_use_journeys((select auth.uid())) and private.has_bird_access(bird_id, (select auth.uid())) is not null);

drop policy if exists "journey_milestones bird member read" on public.journey_milestones;
create policy "journey_milestones bird member read" on public.journey_milestones
  for select to authenticated
  using (exists (
    select 1 from public.journeys j
    where j.id = journey_id
      and private.can_use_journeys((select auth.uid()))
      and private.has_bird_access(j.bird_id, (select auth.uid())) is not null
  ));

drop policy if exists "journey_updates bird member read" on public.journey_updates;
create policy "journey_updates bird member read" on public.journey_updates
  for select to authenticated
  using (private.can_use_journeys((select auth.uid())) and private.has_bird_access(bird_id, (select auth.uid())) is not null);

drop policy if exists "bird_skills bird member read" on public.bird_skills;
create policy "bird_skills bird member read" on public.bird_skills
  for select to authenticated
  using (private.can_use_journeys((select auth.uid())) and private.has_bird_access(bird_id, (select auth.uid())) is not null);


-- 4) What the app asks: my access, and a journey's clip allowance ----------------------

-- The signed-in person's tier and limits, for the screens (locks, "Just me only").
create or replace function private.journey_my_access()
returns table (
  tier text, max_clip_seconds integer, max_clips_per_journey integer, max_open_custom integer,
  open_custom integer, max_upload_bytes bigint, can_use_premium boolean, can_share boolean, can_view_community boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  l public.journey_limits;
begin
  perform private.assert_can_use_journeys();
  l := private.journey_limits_for(v_uid);
  return query select
    l.tier, l.max_clip_seconds, l.max_clips_per_journey, l.max_open_custom,
    (select count(*)::integer from public.journeys j
      where j.created_by = v_uid and j.template_id is null and j.status in ('active', 'paused')),
    l.max_upload_bytes, l.can_use_premium, l.can_share, l.can_view_community;
end;
$$;

-- Before minting an upload: may this person add a clip for this bird (and this
-- journey, when there is one), and how long may it be? The upload server
-- function asks this as the caller, then passes max_seconds to Cloudflare,
-- which refuses anything longer.
create or replace function private.journey_clip_allowance(p_bird_id uuid, p_journey_id uuid)
returns table (max_seconds integer, max_upload_bytes bigint, clips_used integer, clips_max integer, can_add boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  l public.journey_limits;
  v_used integer := 0;
begin
  perform private.assert_can_use_journeys();
  if private.has_bird_access(p_bird_id, v_uid) is null then
    raise exception 'not your bird' using errcode = '42501';
  end if;
  if p_journey_id is not null then
    if not exists (select 1 from public.journeys j where j.id = p_journey_id and j.bird_id = p_bird_id) then
      raise exception 'journey not found' using errcode = 'P0002';
    end if;
    select count(*)::integer into v_used from public.journey_updates u where u.journey_id = p_journey_id and u.clip_ref is not null;
  end if;
  l := private.journey_limits_for(v_uid);
  return query select l.max_clip_seconds, l.max_upload_bytes, v_used, l.max_clips_per_journey,
    (l.max_clips_per_journey is null or v_used < l.max_clips_per_journey);
end;
$$;

revoke all on function private.journey_my_access() from public, anon;
revoke all on function private.journey_clip_allowance(uuid, uuid) from public, anon;
grant execute on function private.journey_my_access() to authenticated, service_role;
grant execute on function private.journey_clip_allowance(uuid, uuid) to authenticated, service_role;


-- 5) Start a journey -----------------------------------------------------------------------

-- p_template_slug for a template journey, or p_custom_name + p_custom_milestones
-- (3–8) for one the member writes. p_already: milestone positions the bird
-- already does. p_day_one_clip: "cfstream:<uid>" registered to this bird.
create or replace function private.journey_start(
  p_bird_id           uuid,
  p_template_slug     text,
  p_custom_name       text,
  p_custom_milestones text[],
  p_already           integer[],
  p_rhythm            text,
  p_visibility        text,
  p_day_one_clip      text
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  l public.journey_limits;
  t public.journey_templates;
  v_id uuid;
  v_open integer;
  v_total integer;
  v_title text;
begin
  perform private.assert_can_use_journeys();
  if private.has_bird_access(p_bird_id, v_uid) is null then
    raise exception 'not your bird' using errcode = '42501';
  end if;
  if exists (select 1 from public.birds b where b.id = p_bird_id and b.passed_at is not null) then
    raise exception 'this bird has passed' using errcode = '22023';
  end if;
  if p_rhythm is null or p_rhythm not in ('most_days', 'few_times_week', 'weekends') then
    raise exception 'choose how often you will practice' using errcode = '22023';
  end if;
  if p_visibility is null or p_visibility not in ('community', 'private') then
    raise exception 'choose who sees it' using errcode = '22023';
  end if;

  l := private.journey_limits_for(v_uid);
  if p_visibility = 'community' and not l.can_share then
    raise exception 'sharing with the community comes with Flock membership' using errcode = '42501';
  end if;

  if (p_template_slug is null) = (p_custom_name is null) then
    raise exception 'start from a template or write your own' using errcode = '22023';
  end if;

  if p_template_slug is not null then
    select * into t from public.journey_templates where slug = p_template_slug;
    if t.id is null then
      raise exception 'template not found' using errcode = 'P0002';
    end if;
    if t.tier = 'premium' and not l.can_use_premium then
      raise exception 'this journey comes with app premium' using errcode = '42501';
    end if;
    if exists (select 1 from public.journeys j where j.bird_id = p_bird_id and j.template_id = t.id and j.status in ('active', 'paused')) then
      raise exception 'this bird already has this journey going' using errcode = '23505';
    end if;
    select count(*)::integer into v_total from public.journey_template_milestones m where m.template_id = t.id;
  else
    if length(btrim(p_custom_name)) not between 1 and 60 then
      raise exception 'give your journey a name (up to 60 characters)' using errcode = '22023';
    end if;
    v_total := coalesce(array_length(p_custom_milestones, 1), 0);
    if v_total not between 3 and 8 then
      raise exception 'write 3 to 8 milestones' using errcode = '22023';
    end if;
    foreach v_title in array p_custom_milestones loop
      if v_title is null or length(btrim(v_title)) not between 1 and 300 then
        raise exception 'each milestone needs a few words (up to 300 characters)' using errcode = '22023';
      end if;
    end loop;
    if l.max_open_custom is not null then
      select count(*)::integer into v_open from public.journeys j
      where j.created_by = v_uid and j.template_id is null and j.status in ('active', 'paused');
      if v_open >= l.max_open_custom then
        raise exception 'one custom journey at a time on the free plan' using errcode = '42501';
      end if;
    end if;
  end if;

  if p_already is not null and exists (select 1 from unnest(p_already) a where a is null or a < 1 or a > v_total) then
    raise exception 'unknown milestone' using errcode = '22023';
  end if;
  if (select count(distinct a) from unnest(coalesce(p_already, '{}')) a) >= v_total then
    raise exception 'leave at least one milestone to work on' using errcode = '22023';
  end if;

  if p_day_one_clip is not null then
    if p_day_one_clip !~ '^cfstream:[A-Za-z0-9]{8,64}$' or not exists (
      select 1 from public.clip_assets c where c.uid = substring(p_day_one_clip from 10) and c.bird_id = p_bird_id
    ) then
      raise exception 'that clip is not for this bird' using errcode = '42501';
    end if;
  end if;

  insert into public.journeys (bird_id, created_by, template_id, custom_name, visibility, rhythm)
  values (p_bird_id, v_uid, t.id, case when t.id is null then btrim(p_custom_name) end, p_visibility, p_rhythm)
  returning id into v_id;

  if t.id is not null then
    insert into public.journey_milestones (journey_id, position, title, template_milestone_id, state)
    select v_id, m.position, m.title, m.id,
           case when m.position = any (coalesce(p_already, '{}')) then 'already' else 'todo' end
    from public.journey_template_milestones m
    where m.template_id = t.id;
  else
    insert into public.journey_milestones (journey_id, position, title, state)
    select v_id, x.ord::integer, btrim(x.title),
           case when x.ord::integer = any (coalesce(p_already, '{}')) then 'already' else 'todo' end
    from unnest(p_custom_milestones) with ordinality as x(title, ord);
  end if;

  if p_day_one_clip is not null then
    insert into public.journey_updates (journey_id, bird_id, author_id, clip_ref, is_day_one)
    values (v_id, p_bird_id, v_uid, p_day_one_clip, true);
  end if;

  return v_id;
end;
$$;

revoke all on function private.journey_start(uuid, text, text, text[], integer[], text, text, text) from public, anon;
grant execute on function private.journey_start(uuid, text, text, text[], integer[], text, text, text) to authenticated, service_role;


-- 6) "What does [bird] already know?" -------------------------------------------------------

-- Sets which templates a bird already knows (source 'known'). Skills learned
-- through a finished journey are never removed here.
create or replace function private.bird_set_known_skills(p_bird_id uuid, p_template_slugs text[])
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_slugs text[] := coalesce(p_template_slugs, '{}');
begin
  perform private.assert_can_use_journeys();
  if private.has_bird_access(p_bird_id, v_uid) is null then
    raise exception 'not your bird' using errcode = '42501';
  end if;
  if exists (select 1 from unnest(v_slugs) s where not exists (select 1 from public.journey_templates t where t.slug = s)) then
    raise exception 'template not found' using errcode = 'P0002';
  end if;

  delete from public.bird_skills k
  where k.bird_id = p_bird_id and k.source = 'known'
    and (k.template_id is null or k.template_id not in (select t.id from public.journey_templates t where t.slug = any (v_slugs)));

  insert into public.bird_skills (bird_id, name, template_id, source, added_by)
  select p_bird_id, t.name, t.id, 'known', v_uid
  from public.journey_templates t
  where t.slug = any (v_slugs)
  on conflict do nothing;

  return (select count(*)::integer from public.bird_skills k where k.bird_id = p_bird_id);
end;
$$;

revoke all on function private.bird_set_known_skills(uuid, text[]) from public, anon;
grant execute on function private.bird_set_known_skills(uuid, text[]) to authenticated, service_role;


-- 7) Admin: edit template text without a deploy ------------------------------------------------
--   select public.admin_update_journey_template('step-up', '{"purpose": "…", "done_when": "…"}');
--   select public.admin_set_journey_milestone('step-up', 3, 'New wording');
--   select public.admin_update_journey_template('step-up', '{"review_status": "approved"}');
-- Text fields only: name, purpose, done_when, suggested_first, typical_length,
-- safety_notes, safeguards, tips, review_status. Tier and slug stay put.

create or replace function public.admin_update_journey_template(p_slug text, p_fields jsonb)
returns public.journey_templates
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_row public.journey_templates;
  v_key text;
begin
  perform private.assert_entitlement_admin();
  if p_fields is null or jsonb_typeof(p_fields) <> 'object' then
    raise exception 'p_fields must be a JSON object' using errcode = '22023';
  end if;
  for v_key in select jsonb_object_keys(p_fields) loop
    if v_key not in ('name', 'purpose', 'done_when', 'suggested_first', 'typical_length', 'safety_notes', 'safeguards', 'tips', 'review_status') then
      raise exception 'can''t change %', v_key using errcode = '22023';
    end if;
  end loop;
  update public.journey_templates t set
    name            = coalesce(p_fields ->> 'name', t.name),
    purpose         = coalesce(p_fields ->> 'purpose', t.purpose),
    done_when       = coalesce(p_fields ->> 'done_when', t.done_when),
    suggested_first = case when p_fields ? 'suggested_first' then p_fields ->> 'suggested_first' else t.suggested_first end,
    typical_length  = coalesce(p_fields ->> 'typical_length', t.typical_length),
    safety_notes    = case when p_fields ? 'safety_notes' then array(select jsonb_array_elements_text(p_fields -> 'safety_notes')) else t.safety_notes end,
    safeguards      = case when p_fields ? 'safeguards' then array(select jsonb_array_elements_text(p_fields -> 'safeguards')) else t.safeguards end,
    tips            = case when p_fields ? 'tips' then array(select jsonb_array_elements_text(p_fields -> 'tips')) else t.tips end,
    review_status   = coalesce(p_fields ->> 'review_status', t.review_status),
    updated_at      = now(),
    updated_by      = auth.uid()
  where t.slug = p_slug
  returning * into v_row;
  if v_row.id is null then
    raise exception 'template not found' using errcode = 'P0002';
  end if;
  return v_row;
end;
$$;

-- Changes the wording for journeys started from now on; journeys already going
-- keep the wording they started with.
create or replace function public.admin_set_journey_milestone(p_slug text, p_position integer, p_title text)
returns public.journey_template_milestones
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_row public.journey_template_milestones;
begin
  perform private.assert_entitlement_admin();
  if p_title is null or length(btrim(p_title)) not between 1 and 300 then
    raise exception 'a milestone needs a few words (up to 300 characters)' using errcode = '22023';
  end if;
  update public.journey_template_milestones m set title = btrim(p_title)
  from public.journey_templates t
  where t.id = m.template_id and t.slug = p_slug and m.position = p_position
  returning m.* into v_row;
  if v_row.id is null then
    raise exception 'milestone not found' using errcode = 'P0002';
  end if;
  update public.journey_templates set updated_at = now(), updated_by = auth.uid() where slug = p_slug;
  return v_row;
end;
$$;

revoke all on function public.admin_update_journey_template(text, jsonb) from public, anon;
revoke all on function public.admin_set_journey_milestone(text, integer, text) from public, anon;
grant execute on function public.admin_update_journey_template(text, jsonb) to authenticated, service_role;
grant execute on function public.admin_set_journey_milestone(text, integer, text) to authenticated, service_role;


-- 8) Invoker wrappers the app calls ---------------------------------------------------------

create or replace function public.journey_my_access()
returns table (
  tier text, max_clip_seconds integer, max_clips_per_journey integer, max_open_custom integer,
  open_custom integer, max_upload_bytes bigint, can_use_premium boolean, can_share boolean, can_view_community boolean
)
language sql stable security invoker set search_path = ''
as $$ select * from private.journey_my_access(); $$;

create or replace function public.journey_clip_allowance(p_bird_id uuid, p_journey_id uuid default null)
returns table (max_seconds integer, max_upload_bytes bigint, clips_used integer, clips_max integer, can_add boolean)
language sql stable security invoker set search_path = ''
as $$ select * from private.journey_clip_allowance(p_bird_id, p_journey_id); $$;

create or replace function public.journey_start(
  p_bird_id uuid, p_template_slug text default null, p_custom_name text default null,
  p_custom_milestones text[] default null, p_already integer[] default null,
  p_rhythm text default null, p_visibility text default 'private', p_day_one_clip text default null
)
returns uuid
language sql volatile security invoker set search_path = ''
as $$ select private.journey_start(p_bird_id, p_template_slug, p_custom_name, p_custom_milestones, p_already, p_rhythm, p_visibility, p_day_one_clip); $$;

create or replace function public.bird_set_known_skills(p_bird_id uuid, p_template_slugs text[])
returns integer
language sql volatile security invoker set search_path = ''
as $$ select private.bird_set_known_skills(p_bird_id, p_template_slugs); $$;

revoke all on function public.journey_my_access() from public, anon;
revoke all on function public.journey_clip_allowance(uuid, uuid) from public, anon;
revoke all on function public.journey_start(uuid, text, text, text[], integer[], text, text, text) from public, anon;
revoke all on function public.bird_set_known_skills(uuid, text[]) from public, anon;
grant execute on function public.journey_my_access() to authenticated, service_role;
grant execute on function public.journey_clip_allowance(uuid, uuid) to authenticated, service_role;
grant execute on function public.journey_start(uuid, text, text, text[], integer[], text, text, text) to authenticated, service_role;
grant execute on function public.bird_set_known_skills(uuid, text[]) to authenticated, service_role;


-- 9) The templates, from the "Journey templates" doc (DRAFT; Brittany reviews each) --------
--    on conflict do nothing: re-running never overwrites an admin's edits.

insert into public.journey_templates (slug, name, category, tier, purpose, done_when, suggested_first, typical_length, safeguards, tips, sort_order) values
  ('scale-training', 'Scale training', 'husbandry', 'free',
   'So your bird steps onto the scale calmly and stays still long enough for an accurate daily weight.',
   'your bird steps on at your cue and holds still for a reading most days. Logging that weight in My birds closes the loop with the care app.',
   null, '1–3 weeks', '{}'::text[], '{}'::text[], 10),
  ('target-training', 'Target training', 'foundations', 'free',
   'So your bird learns to touch the tip of a stick for a reward, a simple tool that can guide them almost anywhere.',
   'your bird will travel to wherever the stick points. If the stick itself is scary, start by rewarding calm with it in view, or change its look with a colorful bead on the end.',
   null, '1–3 weeks', '{}'::text[], '{}'::text[], 20),
  ('step-up', 'Step up', 'foundations', 'free',
   'So your bird steps onto your hand calmly and by choice, foot first, without biting.',
   'your bird steps up on cue from most places. If your bird lowers its head, opens its beak, or leans away, it''s saying no, so pause and make the next ask smaller.',
   'Target training helps', '2–6 weeks', '{}'::text[], '{}'::text[], 30),
  ('recall', 'Recall', 'foundations', 'free',
   'So your bird comes to you when you say their name, which is the most important safety skill if they ever get out.',
   'your bird comes the first time you call, from anywhere in the room. Use the bird''s name alone as the cue, and for very clingy birds, reward them back on the perch as well as on your hand.',
   'Step up', '4–8 weeks', '{}'::text[], '{}'::text[], 40),
  ('wing-touch', 'Wing touch', 'husbandry', 'free',
   'So your bird is comfortable having wings touched and gently extended, for vet exams and health checks. The bird gives consent at every step.',
   'your bird leans in for wing touches and allows a short, gentle extension. Any resistance means going back a step. This one should never be rushed, and it should stay brief, since prolonged body touch can trigger hormonal behavior.',
   'Target training', '4–8 weeks', '{}'::text[], '{}'::text[], 50),
  ('carrier-comfort', 'Carrier comfort', 'husbandry', 'free',
   'So vet trips and travel start calmly, without chasing your bird into a crate.',
   'your bird walks into the carrier on cue and stays relaxed for a short trip. Practice often, so the carrier doesn''t only mean the vet.',
   'Target training', '2–4 weeks', '{}'::text[], '{}'::text[], 60),
  ('diet-conversion', 'Diet conversion', 'food', 'free',
   'So your bird moves gradually from a seed-heavy diet to pellets, chop, and fresh foods without losing weight.',
   'the new diet is most of what your bird eats and their weight has held steady the whole way.',
   null, '4–12 weeks', array['Daily weigh-ins are part of every step, and the journey shows the weight trend right on its page.', 'The old food is never removed until the bird is reliably eating the new one.', 'If weight drops, the journey pauses with a clear message to call your avian vet. For app premium members, this uses the bird''s own baseline alerts.', 'The template suggests a vet check before starting, especially for older birds or birds on an all-seed diet.']::text[], array['Offer the new food first thing in the morning, when your bird is hungriest, with the usual food alongside.', 'Eat it in front of them. Parrots are flock eaters and often try what they see you eat.', 'Change one thing at a time, and go slower than feels necessary. Some birds take months, and that''s normal.', 'Try different forms: chopped, warmed, crumbled over a favorite food, or tucked into a foraging toy.', 'Watch droppings and appetite as well as weight. If your bird stops eating, put the usual food back and call your vet.']::text[], 70),
  ('nail-trims', 'Nail trims', 'husbandry', 'premium',
   'So nail trims become a calm, two-minute routine instead of a towel wrestle.',
   'you can trim every nail in one calm session. Keep several practice sessions between real trims, and keep the rewards frequent.',
   'Target training', '3–6 weeks', '{}'::text[], '{}'::text[], 80),
  ('stationing', 'Stationing', 'husbandry', 'premium',
   'So your bird can stay on a perch while you move around, which matters most for birds that never want to leave your side.',
   'a point and a word sends your bird to the perch, and they stay while you move around the room.',
   'Target training', '3–6 weeks', '{}'::text[], '{}'::text[], 90),
  ('wave', 'Wave', 'tricks', 'premium',
   'So your bird lifts a foot and waves on cue. It builds on step up, since the wave starts as the beginning of a step up.',
   'your bird waves to a hand signal. Stick with one foot, and only reward that foot.',
   'Step up', '2–4 weeks', '{}'::text[], '{}'::text[], 100),
  ('high-five', 'High five', 'tricks', 'premium',
   'So your bird touches its raised foot to your palm. Wave is the natural first step.',
   'your bird meets your palm on cue.',
   'Wave', '1–3 weeks', '{}'::text[], '{}'::text[], 110),
  ('spin', 'Spin', 'tricks', 'premium',
   'So your bird turns a full circle on the perch. Pick one direction and stay with it until the spin is solid.',
   'a finger flick gets a full spin.',
   'Target training', '2–4 weeks', '{}'::text[], '{}'::text[], 120),
  ('retrieve', 'Retrieve', 'tricks', 'premium',
   'So your bird picks up a small ball and drops it in your hand.',
   'your bird fetches the ball from across the table and drops it in your hand.',
   'Target training', '4–8 weeks', '{}'::text[], '{}'::text[], 130),
  ('hang-upside-down', 'Hang upside down', 'tricks', 'premium',
   'So your bird hangs upside down from your finger or a perch, a natural play behavior put on cue.',
   'your bird flips on cue. Many birds already do this on their own, so "capture" it: reward it whenever it happens, then add the cue.',
   'Step up', '2–6 weeks', '{}'::text[], '{}'::text[], 140)
on conflict (slug) do nothing;

insert into public.journey_template_milestones (template_id, position, title)
select t.id, m.position, m.title
from (values
  ('scale-training', 1, 'Calm with the scale nearby, eating a treat within a foot of it.'),
  ('scale-training', 2, 'Touches the scale or its perch with a beak or foot.'),
  ('scale-training', 3, 'Steps onto the scale perch with one foot, then both.'),
  ('scale-training', 4, 'Stays on with both feet still for a reading (start at 2 seconds).'),
  ('scale-training', 5, 'Steps on when you set the scale down and give your cue.'),
  ('scale-training', 6, 'A daily weigh-in at the same time each day, logged in the app.'),
  ('target-training', 1, 'Calm with the target stick nearby.'),
  ('target-training', 2, 'Taps the stick tip when it''s held close (with the top of the beak or tongue, not a bite).'),
  ('target-training', 3, 'Takes a step or two to reach the stick.'),
  ('target-training', 4, 'Follows the stick across the perch, side to side.'),
  ('target-training', 5, 'Follows the stick up, down, or around a toy.'),
  ('target-training', 6, 'Follows the stick onto a new perch or out the cage door.'),
  ('step-up', 1, 'Stays relaxed as your hand comes near and stays still.'),
  ('step-up', 2, 'Touches your still, open hand with a foot.'),
  ('step-up', 3, 'Shifts weight and steps on with one foot, then steps back off.'),
  ('step-up', 4, 'Steps up with both feet.'),
  ('step-up', 5, 'Stays on your hand for a few seconds, then is set back down.'),
  ('step-up', 6, 'Stays calm while your hand moves up, down, and across the room.'),
  ('step-up', 7, 'Steps up on cue from inside the cage and from a stand.'),
  ('recall', 1, 'Walks a few inches across a perch to your hand.'),
  ('recall', 2, 'Hops a short gap to your hand.'),
  ('recall', 3, 'Flies a short distance, about arm''s length.'),
  ('recall', 4, 'Flies across the room.'),
  ('recall', 5, 'Comes from another spot in the room, or from a different perch.'),
  ('recall', 6, 'Comes the first time you call, most of the time.'),
  ('recall', 7, 'Comes with normal household distractions around.'),
  ('wing-touch', 1, 'Approaches your closed hand on the perch for a reward.'),
  ('wing-touch', 2, 'Comes to your hand without the target stick.'),
  ('wing-touch', 3, 'Lets the side of a wing brush your palm.'),
  ('wing-touch', 4, 'Allows a light touch on the side of the wing.'),
  ('wing-touch', 5, 'Allows a touch at the wing tip.'),
  ('wing-touch', 6, 'Allows the tip of the wing to be lifted slightly.'),
  ('wing-touch', 7, 'Allows a gentle, brief wing extension on both sides.'),
  ('carrier-comfort', 1, 'Eats treats near the open carrier.'),
  ('carrier-comfort', 2, 'Steps onto the carrier''s edge or into the doorway.'),
  ('carrier-comfort', 3, 'Goes all the way in and comes back out.'),
  ('carrier-comfort', 4, 'Stays in for a treat while the door is partly closed.'),
  ('carrier-comfort', 5, 'Stays calm with the door fully closed for short periods.'),
  ('carrier-comfort', 6, 'Calm while the carrier is lifted and carried around the house.'),
  ('carrier-comfort', 7, 'A short car ride, with treats.'),
  ('diet-conversion', 1, 'A week of daily weigh-ins to set your bird''s starting weight.'),
  ('diet-conversion', 2, 'The new food offered beside the usual food every day.'),
  ('diet-conversion', 3, 'Tastes the new food, even just a nibble.'),
  ('diet-conversion', 4, 'Eats some of the new food most days.'),
  ('diet-conversion', 5, 'The new food makes up about a quarter of what''s offered.'),
  ('diet-conversion', 6, 'About half.'),
  ('diet-conversion', 7, 'Most of the diet, with treats saved for training.'),
  ('nail-trims', 1, 'Relaxed with the clippers in sight, rewarded for staying calm.'),
  ('nail-trims', 2, 'Rests one foot on your hand while the other stays on the perch.'),
  ('nail-trims', 3, 'Lets go of the clippers when they''re offered, every time.'),
  ('nail-trims', 4, 'Allows toes to be touched and gently moved.'),
  ('nail-trims', 5, 'Stays relaxed while the clippers move near the foot without cutting.'),
  ('nail-trims', 6, 'Allows one nail to be trimmed, then a few.'),
  ('nail-trims', 7, 'A whole trim, both feet, without a towel.'),
  ('stationing', 1, 'Goes to the station perch when you tap it with the target stick.'),
  ('stationing', 2, 'Stays there for a few seconds after landing.'),
  ('stationing', 3, 'Stays while you step a foot or two away.'),
  ('stationing', 4, 'Goes to the station from different spots in the room.'),
  ('stationing', 5, 'Goes to the station when you point and say the cue, with no stick.'),
  ('stationing', 6, 'Stays on station for a minute or more with normal household activity around.'),
  ('wave', 1, 'Lifts the foot it usually steps up with when your hand comes near.'),
  ('wave', 2, 'Lifts it high, then puts it back down to reach a treat off to the side.'),
  ('wave', 3, 'Lifts it to the same height most times.'),
  ('wave', 4, 'Waves to a small hand signal instead of an offered hand.'),
  ('wave', 5, 'Waves on cue from a little distance.'),
  ('high-five', 1, 'Waves on cue.'),
  ('high-five', 2, 'Touches your still, open palm mid-wave.'),
  ('high-five', 3, 'Touches your palm when you hold it a little higher or farther away.'),
  ('high-five', 4, 'High-fives to a verbal cue.'),
  ('spin', 1, 'Follows the target stick a quarter turn.'),
  ('spin', 2, 'Follows it a half turn.'),
  ('spin', 3, 'Follows it all the way around and ends facing forward.'),
  ('spin', 4, 'Spins to your finger instead of the stick.'),
  ('spin', 5, 'Spins to a small flick of the finger.'),
  ('retrieve', 1, 'Touches the ball.'),
  ('retrieve', 2, 'Picks the ball up.'),
  ('retrieve', 3, 'Drops the ball into your hand held right underneath it.'),
  ('retrieve', 4, 'Picks up the ball a few inches away and brings it to your hand.'),
  ('retrieve', 5, 'Brings it from across the table.'),
  ('retrieve', 6, 'Brings back other small objects too.'),
  ('hang-upside-down', 1, 'Leans forward and down toward a treat held just below your finger.'),
  ('hang-upside-down', 2, 'Leans farther as the treat moves lower.'),
  ('hang-upside-down', 3, 'Tips all the way upside down for a moment.'),
  ('hang-upside-down', 4, 'Hangs upside down for a few seconds.'),
  ('hang-upside-down', 5, 'Hangs upside down on cue, no treat in view.')
) as m(slug, position, title)
join public.journey_templates t on t.slug = m.slug
on conflict (template_id, position) do nothing;
