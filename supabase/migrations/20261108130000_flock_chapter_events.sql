-- The Flock, step 5 (PR A): chapter events. Additive only: new tables and
-- functions, a pg_cron job that only runs SQL (no HTTP, no token), wider
-- checks on two Flock-only columns (flock_notifications.kind and
-- .subject_type gain 'event'), and new versions of Flock-only functions from
-- step 4 so they know about events (flock_subject_visible,
-- flock_notifications_list, flock_review_queue, flock_review_counts,
-- flock_can_review) plus Today's idea's day (flock_today: now Eastern time).
-- No care-app table, policy, trigger or function changes.
--
-- Who sees an event (private.flock_event_visible): members of its chapter
-- (their profile's region) once it's live or cancelled; whoever suggested it,
-- always; and the people who manage that chapter (admins today; chapter
-- leads come in PR B through private.chapter_lead_region). An online event's
-- link goes only to people who said they're going, the host, and managers.
-- Suggestions wait as 'pending' in the review queue (/admin/review, Events)
-- and show to nobody else until approved.
-- In-person events unlock when the chapter has
-- flock_chapter_settings.in_person_min_members members (default 15); until
-- then suggestions must be online. Managers may always create in person.


-- 0) Today's idea follows Eastern time --------------------------------------------------

create or replace function private.flock_today()
returns date
language sql
stable
set search_path = ''
as $$ select (now() at time zone 'America/New_York')::date; $$;


-- 1) Settings and who manages a chapter ------------------------------------------------

create table if not exists public.flock_chapter_settings (
  id                    boolean primary key default true check (id),
  in_person_min_members integer not null default 15 check (in_person_min_members between 1 and 1000),
  updated_at            timestamptz not null default now()
);
insert into public.flock_chapter_settings (id) values (true) on conflict (id) do nothing;
alter table public.flock_chapter_settings enable row level security;
revoke all on public.flock_chapter_settings from anon, authenticated;
grant select, insert, update, delete on public.flock_chapter_settings to service_role;
drop policy if exists "flock_chapter_settings no direct access" on public.flock_chapter_settings;
create policy "flock_chapter_settings no direct access" on public.flock_chapter_settings for select to authenticated using (false);

-- The chapter a user leads, if any. Nobody until PR B adds chapter leads.
create or replace function private.chapter_lead_region(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$ select null::text; $$;

-- Admins manage every chapter; a chapter lead manages their own.
create or replace function private.can_manage_chapter(p_user_id uuid, p_region text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  -- coalesce: "no lead region" must read as false, never null (a null here
  -- would slip past every "if not can_manage_chapter(...)" check).
  select coalesce(p_user_id is not null and (private.is_admin(p_user_id)
    or (p_region is not null and private.chapter_lead_region(p_user_id) = p_region)), false);
$$;

create or replace function private.chapter_member_count(p_region text)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer from public.flock_profiles p
  where p.region_slug = p_region and private.can_use_flock(p.user_id);
$$;

revoke all on function private.chapter_lead_region(uuid) from public, anon;
revoke all on function private.can_manage_chapter(uuid, text) from public, anon;
revoke all on function private.chapter_member_count(text) from public, anon;
grant execute on function private.chapter_lead_region(uuid) to authenticated, service_role;
grant execute on function private.can_manage_chapter(uuid, text) to authenticated, service_role;
grant execute on function private.chapter_member_count(text) to authenticated, service_role;


-- 2) Events and RSVPs --------------------------------------------------------------------

create table if not exists public.flock_events (
  id            uuid primary key default gen_random_uuid(),
  region_slug   text not null references public.regions(slug),
  -- meetup, or volunteer (shown with a Do good tag; may have a spot limit).
  kind          text not null default 'meetup' check (kind in ('meetup', 'volunteer')),
  title         text not null check (length(btrim(title)) between 1 and 120),
  description   text check (description is null or length(description) <= 3000),
  starts_at     timestamptz not null,
  ends_at       timestamptz check (ends_at is null or ends_at > starts_at),
  mode          text not null check (mode in ('in_person', 'online')),
  place_name    text check (place_name is null or length(place_name) <= 160),
  address       text check (address is null or length(address) <= 240),
  online_url    text check (online_url is null or (online_url ~ '^https://' and length(online_url) <= 500)),
  photo_path    text,
  spot_limit    integer check (spot_limit is null or spot_limit between 1 and 1000),
  -- pending = suggested, waiting for review; live = on the calendar.
  status        text not null default 'pending' check (status in ('pending', 'changes_requested', 'declined', 'live', 'cancelled')),
  host_id       uuid references auth.users(id) on delete set null,
  created_by    uuid not null references auth.users(id) on delete cascade,
  review_note   text check (review_note is null or length(review_note) <= 1000),
  reviewed_by   uuid references auth.users(id) on delete set null,
  reviewed_at   timestamptz,
  cancelled_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (spot_limit is null or kind = 'volunteer'),
  check (mode = 'online' or online_url is null)
);
create index if not exists flock_events_chapter_idx on public.flock_events (region_slug, starts_at);
create index if not exists flock_events_pending_idx on public.flock_events (status) where status = 'pending';

create table if not exists public.flock_event_rsvps (
  event_id         uuid not null references public.flock_events(id) on delete cascade,
  user_id          uuid not null references auth.users(id) on delete cascade,
  answer           text not null check (answer in ('going', 'maybe')),
  reminder_sent_at timestamptz,
  created_at       timestamptz not null default now(),
  primary key (event_id, user_id)
);
create index if not exists flock_event_rsvps_user_idx on public.flock_event_rsvps (user_id);

alter table public.flock_events enable row level security;
alter table public.flock_event_rsvps enable row level security;
revoke all on public.flock_events, public.flock_event_rsvps from anon, authenticated;
grant select, insert, update, delete on public.flock_events, public.flock_event_rsvps to service_role;
drop policy if exists "flock_events no direct access" on public.flock_events;
create policy "flock_events no direct access" on public.flock_events for select to authenticated using (false);
drop policy if exists "flock_event_rsvps no direct access" on public.flock_event_rsvps;
create policy "flock_event_rsvps no direct access" on public.flock_event_rsvps for select to authenticated using (false);

drop trigger if exists flock_events_updated_at on public.flock_events;
create trigger flock_events_updated_at before update on public.flock_events
  for each row execute function public.set_updated_at();

create or replace function private.flock_event_visible(p_user_id uuid, p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user_id is not null and private.can_use_flock(p_user_id) and exists (
    select 1 from public.flock_events e
    where e.id = p_event_id
      and (e.created_by = p_user_id
           or private.can_manage_chapter(p_user_id, e.region_slug)
           or (e.status in ('live', 'cancelled')
               and e.region_slug = (select fp.region_slug from public.flock_profiles fp where fp.user_id = p_user_id)))
  );
$$;

revoke all on function private.flock_event_visible(uuid, uuid) from public, anon;
grant execute on function private.flock_event_visible(uuid, uuid) to authenticated, service_role;


-- 3) Notifications learn about events ---------------------------------------------------

alter table public.flock_notifications drop constraint if exists flock_notifications_kind_check;
alter table public.flock_notifications add constraint flock_notifications_kind_check
  check (kind in ('reply', 'cheer', 'review', 'clip', 'chapter', 'notice', 'event'));
alter table public.flock_notifications drop constraint if exists flock_notifications_subject_type_check;
alter table public.flock_notifications add constraint flock_notifications_subject_type_check
  check (subject_type in ('post', 'comment', 'journey_update', 'journey_milestone', 'event'));

-- Step 4B's version, plus events.
create or replace function private.flock_subject_visible(p_user_id uuid, p_type text, p_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_journey uuid;
  v_bird uuid;
  v_author uuid;
  c public.flock_comments;
begin
  if p_user_id is null or not private.can_use_flock(p_user_id) then
    return false;
  end if;
  if p_type = 'post' then
    return private.flock_post_visible(p_user_id, p_id);
  elsif p_type = 'event' then
    return private.flock_event_visible(p_user_id, p_id);
  elsif p_type = 'journey_update' then
    select u.journey_id, u.bird_id, u.author_id into v_journey, v_bird, v_author from public.journey_updates u where u.id = p_id;
    return v_journey is not null and private.journey_viewable(p_user_id, v_journey)
       and (not private.flock_is_hidden('journey_update', p_id)
            or v_author = p_user_id or private.has_bird_access(v_bird, p_user_id) is not null);
  elsif p_type = 'journey_milestone' then
    select m.journey_id into v_journey from public.journey_milestones m where m.id = p_id and m.state = 'reached';
    return v_journey is not null and private.journey_viewable(p_user_id, v_journey);
  elsif p_type = 'comment' then
    select * into c from public.flock_comments x where x.id = p_id;
    if c.id is null then return false; end if;
    return (c.author_id = p_user_id
            or (c.status = 'live' and private.can_use_flock(c.author_id) and not private.flock_is_hidden('comment', c.id)))
       and private.flock_subject_visible(p_user_id, c.subject_type, c.subject_id);
  end if;
  return false;
end;
$$;

-- The notifications list, now with an event's title and time.
drop function if exists public.flock_notifications_list(text, integer);
drop function if exists private.flock_notifications_list(text, integer);
create function private.flock_notifications_list(p_filter text, p_limit integer)
returns table (
  ids uuid[], kind text, actor_name text, others integer, subject_type text, subject_id uuid, detail text, note text,
  post_id uuid, post_title text, post_space text, journey_id uuid, bird_name text, skill text, milestone_title text,
  region_name text, event_id uuid, event_title text, event_starts_at timestamptz, created_at timestamptz, unread boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.assert_can_use_flock();
  return query
  with mine as (
    select n.* from public.flock_notifications n
    where n.user_id = auth.uid()
      and (p_filter is null or p_filter = 'all'
           or (p_filter = 'replies' and n.kind = 'reply')
           or (p_filter = 'cheers' and n.kind = 'cheer')
           or (p_filter = 'chapter' and (n.kind = 'chapter' or n.kind = 'event')))
      and n.created_at > now() - interval '60 days'
  ),
  grouped as (
    select array_agg(m.id order by m.created_at desc) as ids, m.kind,
           (array_agg(m.actor_id order by m.created_at desc))[1] as actor_id,
           greatest(count(distinct m.actor_id) - 1, 0)::integer as others,
           m.subject_type, m.subject_id,
           (array_agg(m.detail order by m.created_at desc))[1] as detail,
           (array_agg(m.note order by m.created_at desc))[1] as note,
           max(m.created_at) as created_at, bool_or(m.read_at is null) as unread
    from mine m
    group by m.kind, m.subject_type, m.subject_id,
             case when m.kind = 'cheer' then date_trunc('day', m.created_at) end,
             case when m.kind = 'cheer' then null else m.id end
  )
  select g.ids, g.kind, fp.display_name, g.others, g.subject_type, g.subject_id, g.detail, g.note,
         coalesce(p.id, cp.id), coalesce(p.title, left(p.body, 80), cp.title, left(cp.body, 80)), coalesce(p.space, cp.space),
         j.id, b.name::text, coalesce(t.name, j.custom_name), jm.title, coalesce(rg.name, erg.name),
         ev.id, ev.title, ev.starts_at,
         g.created_at, g.unread
  from grouped g
  left join public.flock_profiles fp on fp.user_id = g.actor_id
  left join public.flock_posts p on g.subject_type = 'post' and p.id = g.subject_id
  left join public.flock_events ev on g.subject_type = 'event' and ev.id = g.subject_id
  left join public.regions erg on erg.slug = ev.region_slug
  left join public.flock_comments c on g.subject_type = 'comment' and c.id = g.subject_id
  left join public.flock_posts cp on c.subject_type = 'post' and cp.id = c.subject_id
  left join public.journey_updates ju on (g.subject_type = 'journey_update' and ju.id = g.subject_id)
                                      or (c.subject_type = 'journey_update' and ju.id = c.subject_id)
  left join public.journey_milestones jm on (g.subject_type = 'journey_milestone' and jm.id = g.subject_id)
                                         or (c.subject_type = 'journey_milestone' and jm.id = c.subject_id)
  left join public.journeys j on j.id = coalesce(ju.journey_id, jm.journey_id)
  left join public.birds b on b.id = j.bird_id
  left join public.journey_templates t on t.id = j.template_id
  left join public.regions rg on rg.slug = coalesce(p.region_slug, cp.region_slug)
  where g.kind in ('review', 'notice') and (p.author_id = auth.uid() or c.author_id = auth.uid() or ju.author_id = auth.uid() or ev.created_by = auth.uid())
     or private.flock_subject_visible(auth.uid(), g.subject_type, g.subject_id)
  order by g.created_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 100);
end;
$$;

create function public.flock_notifications_list(p_filter text default 'all', p_limit integer default 50)
returns table (
  ids uuid[], kind text, actor_name text, others integer, subject_type text, subject_id uuid, detail text, note text,
  post_id uuid, post_title text, post_space text, journey_id uuid, bird_name text, skill text, milestone_title text,
  region_name text, event_id uuid, event_title text, event_starts_at timestamptz, created_at timestamptz, unread boolean
) language sql stable security invoker set search_path = ''
as $$ select * from private.flock_notifications_list(p_filter, p_limit); $$;

revoke all on function private.flock_notifications_list(text, integer) from public, anon;
revoke all on function public.flock_notifications_list(text, integer) from public, anon;
grant execute on function private.flock_notifications_list(text, integer) to authenticated, service_role;
grant execute on function public.flock_notifications_list(text, integer) to authenticated, service_role;

-- New events on the calendar reach the chapter (chapter news).
create or replace function private.flock_event_announce(p_event_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  e public.flock_events;
  f record;
begin
  select * into e from public.flock_events x where x.id = p_event_id;
  if e.id is null or e.status <> 'live' then return; end if;
  for f in select fp.user_id from public.flock_profiles fp where fp.region_slug = e.region_slug and fp.user_id <> e.created_by loop
    perform private.flock_notify(f.user_id, 'chapter', e.created_by, 'event', e.id, 'new', null);
  end loop;
end;
$$;

revoke all on function private.flock_event_announce(uuid) from public, anon, authenticated;
grant execute on function private.flock_event_announce(uuid) to service_role;


-- 4) Reading events -------------------------------------------------------------------------

-- The caller's chapter's events: 'upcoming' (soonest first, including the
-- caller's own suggestions) or 'past' (most recent first).
create or replace function private.flock_chapter_events(p_when text)
returns table (
  event_id uuid, kind text, title text, starts_at timestamptz, ends_at timestamptz, mode text, place_name text,
  status text, spot_limit integer, going integer, maybe integer, my_answer text, has_photo boolean, is_mine boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_region text;
begin
  perform private.assert_can_use_flock();
  select fp.region_slug into v_region from public.flock_profiles fp where fp.user_id = auth.uid();
  return query
    select e.id, e.kind, e.title, e.starts_at, e.ends_at, e.mode, e.place_name, e.status, e.spot_limit,
           (select count(*)::integer from public.flock_event_rsvps r where r.event_id = e.id and r.answer = 'going'),
           (select count(*)::integer from public.flock_event_rsvps r where r.event_id = e.id and r.answer = 'maybe'),
           (select r.answer from public.flock_event_rsvps r where r.event_id = e.id and r.user_id = auth.uid()),
           e.photo_path is not null, e.created_by = auth.uid()
    from public.flock_events e
    where e.region_slug = v_region
      and private.flock_event_visible(auth.uid(), e.id)
      and e.status <> 'declined'
      and (case when p_when = 'past' then coalesce(e.ends_at, e.starts_at + interval '3 hours') < now()
                else coalesce(e.ends_at, e.starts_at + interval '3 hours') >= now() end)
    order by case when p_when = 'past' then null else e.starts_at end asc nulls last,
             case when p_when = 'past' then e.starts_at end desc nulls last
    limit 60;
end;
$$;

-- One event, everything the caller may see: the online link only if they're
-- going (or host it, or manage the chapter); who's going (first five, with
-- names and photos); who hosts and whether they lead the chapter.
create or replace function private.flock_event(p_event_id uuid)
returns table (
  event_id uuid, region_slug text, region_name text, kind text, title text, description text, starts_at timestamptz,
  ends_at timestamptz, mode text, place_name text, address text, online_url text, has_photo boolean, spot_limit integer,
  status text, review_note text, host_id uuid, host_name text, host_is_lead boolean, going integer, maybe integer,
  my_answer text, goers jsonb, is_mine boolean, can_manage boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.assert_can_use_flock();
  if not private.flock_event_visible(auth.uid(), p_event_id) then
    raise exception 'not found' using errcode = 'P0002';
  end if;
  return query
    select e.id, e.region_slug, rg.name, e.kind, e.title, e.description, e.starts_at, e.ends_at, e.mode, e.place_name, e.address,
           case when e.mode = 'online' and (mine.answer = 'going' or e.host_id = auth.uid() or e.created_by = auth.uid()
                                            or private.can_manage_chapter(auth.uid(), e.region_slug))
                then e.online_url end,
           e.photo_path is not null, e.spot_limit, e.status,
           case when e.created_by = auth.uid() or private.can_manage_chapter(auth.uid(), e.region_slug) then e.review_note end,
           e.host_id, hp.display_name, coalesce(private.chapter_lead_region(e.host_id) = e.region_slug, false),
           (select count(*)::integer from public.flock_event_rsvps r where r.event_id = e.id and r.answer = 'going'),
           (select count(*)::integer from public.flock_event_rsvps r where r.event_id = e.id and r.answer = 'maybe'),
           mine.answer,
           coalesce((select jsonb_agg(jsonb_build_object('user_id', g.user_id, 'name', g.display_name, 'photo_path', g.photo_path) order by g.created_at)
                     from (select r.user_id, fp.display_name, fp.photo_path, r.created_at
                           from public.flock_event_rsvps r join public.flock_profiles fp on fp.user_id = r.user_id
                           where r.event_id = e.id and r.answer = 'going' and private.can_use_flock(r.user_id)
                           order by r.created_at limit 5) g), '[]'::jsonb),
           e.created_by = auth.uid(), private.can_manage_chapter(auth.uid(), e.region_slug)
    from public.flock_events e
    left join public.regions rg on rg.slug = e.region_slug
    left join public.flock_profiles hp on hp.user_id = e.host_id
    left join public.flock_event_rsvps mine on mine.event_id = e.id and mine.user_id = auth.uid()
    where e.id = p_event_id;
end;
$$;

-- What the suggest form needs: whether in person is open yet, and why not.
create or replace function private.flock_event_rules()
returns table (region_slug text, region_name text, member_count integer, in_person_min integer, in_person_open boolean, can_manage boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_region text;
  v_min integer;
  v_count integer;
begin
  perform private.assert_can_use_flock();
  select fp.region_slug into v_region from public.flock_profiles fp where fp.user_id = auth.uid();
  select s.in_person_min_members into v_min from public.flock_chapter_settings s;
  v_count := private.chapter_member_count(v_region);
  return query
    select v_region, (select r.name from public.regions r where r.slug = v_region), v_count, v_min,
           v_count >= v_min or private.can_manage_chapter(auth.uid(), v_region),
           private.can_manage_chapter(auth.uid(), v_region);
end;
$$;

-- Photo path for an event the caller may see (the server signs it).
create or replace function private.flock_event_photo_ref(p_event_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.assert_can_use_flock();
  if not private.flock_event_visible(auth.uid(), p_event_id) then return null; end if;
  return (select e.photo_path from public.flock_events e where e.id = p_event_id);
end;
$$;

revoke all on function private.flock_chapter_events(text) from public, anon;
revoke all on function private.flock_event(uuid) from public, anon;
revoke all on function private.flock_event_rules() from public, anon;
revoke all on function private.flock_event_photo_ref(uuid) from public, anon;
grant execute on function private.flock_chapter_events(text) to authenticated, service_role;
grant execute on function private.flock_event(uuid) to authenticated, service_role;
grant execute on function private.flock_event_rules() to authenticated, service_role;
grant execute on function private.flock_event_photo_ref(uuid) to authenticated, service_role;


-- 5) Writing ---------------------------------------------------------------------------------

-- Suggest an event (any chapter member), or fix your own after "Ask for
-- changes" (p_id). Goes to review. Online only until in person opens.
create or replace function private.flock_event_suggest(
  p_id uuid, p_kind text, p_title text, p_starts_at timestamptz, p_ends_at timestamptz, p_mode text,
  p_place_name text, p_address text, p_online_url text, p_description text, p_i_host boolean
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_region text;
  v_id uuid;
  r record;
begin
  perform private.assert_can_use_flock();
  select fp.region_slug into v_region from public.flock_profiles fp where fp.user_id = v_me;
  if v_region is null or v_region = 'other' then
    raise exception 'choose your region to suggest an event' using errcode = '22023';
  end if;
  select * into r from private.flock_event_rules();
  -- Locked: a new in-person suggestion, or switching one to in person. An
  -- in-person suggestion made while it was open can still be fixed.
  if p_mode = 'in_person' and not r.in_person_open
     and (p_id is null or not exists (select 1 from public.flock_events x where x.id = p_id and x.mode = 'in_person')) then
    raise exception 'in_person_locked' using errcode = 'P0001', detail = r.in_person_min::text;
  end if;
  if p_starts_at is null or p_starts_at < now() then
    raise exception 'pick a time that hasn''t passed' using errcode = '22023';
  end if;
  if p_id is null then
    perform private.flock_check_rate(v_me, 'posts', 0);
    insert into public.flock_events (region_slug, kind, title, description, starts_at, ends_at, mode, place_name, address, online_url,
                                     status, host_id, created_by)
    values (v_region, coalesce(p_kind, 'meetup'), btrim(p_title), nullif(btrim(coalesce(p_description, '')), ''), p_starts_at, p_ends_at, p_mode,
            nullif(btrim(coalesce(p_place_name, '')), ''), nullif(btrim(coalesce(p_address, '')), ''),
            case when p_mode = 'online' then nullif(btrim(coalesce(p_online_url, '')), '') end,
            'pending', case when coalesce(p_i_host, false) then v_me end, v_me)
    returning id into v_id;
  else
    update public.flock_events e
    set kind = coalesce(p_kind, e.kind), title = btrim(p_title), description = nullif(btrim(coalesce(p_description, '')), ''),
        starts_at = p_starts_at, ends_at = p_ends_at, mode = p_mode,
        place_name = nullif(btrim(coalesce(p_place_name, '')), ''), address = nullif(btrim(coalesce(p_address, '')), ''),
        online_url = case when p_mode = 'online' then nullif(btrim(coalesce(p_online_url, '')), '') end,
        host_id = case when coalesce(p_i_host, false) then v_me end, status = 'pending'
    where e.id = p_id and e.created_by = v_me and e.status in ('pending', 'changes_requested')
    returning e.id into v_id;
    if v_id is null then
      raise exception 'not found' using errcode = 'P0002';
    end if;
  end if;
  return v_id;
end;
$$;

-- Create (p_id null) or edit an event as a chapter manager. Goes live at once.
create or replace function private.flock_event_save(
  p_id uuid, p_region text, p_kind text, p_title text, p_starts_at timestamptz, p_ends_at timestamptz, p_mode text,
  p_place_name text, p_address text, p_online_url text, p_description text, p_host_id uuid, p_spot_limit integer, p_photo_path text
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_region text;
  v_new boolean := p_id is null;
begin
  perform private.assert_can_use_flock();
  if v_new then
    v_region := p_region;
  else
    select e.region_slug into v_region from public.flock_events e where e.id = p_id;
  end if;
  if v_region is null or not private.can_manage_chapter(auth.uid(), v_region) then
    raise exception 'only the chapter''s lead or an admin can do that' using errcode = '42501';
  end if;
  if p_photo_path is not null and not exists (select 1 from storage.objects o where o.bucket_id = 'flock-posts' and o.name = p_photo_path) then
    raise exception 'photo not found' using errcode = '22023';
  end if;
  if v_new then
    insert into public.flock_events (region_slug, kind, title, description, starts_at, ends_at, mode, place_name, address, online_url,
                                     photo_path, spot_limit, status, host_id, created_by, reviewed_by, reviewed_at)
    values (v_region, coalesce(p_kind, 'meetup'), btrim(p_title), nullif(btrim(coalesce(p_description, '')), ''), p_starts_at, p_ends_at, p_mode,
            nullif(btrim(coalesce(p_place_name, '')), ''), nullif(btrim(coalesce(p_address, '')), ''),
            case when p_mode = 'online' then nullif(btrim(coalesce(p_online_url, '')), '') end,
            p_photo_path, case when coalesce(p_kind, 'meetup') = 'volunteer' then p_spot_limit end,
            'live', coalesce(p_host_id, auth.uid()), auth.uid(), auth.uid(), now())
    returning id into v_id;
    perform private.flock_event_announce(v_id);
  else
    update public.flock_events e
    set kind = coalesce(p_kind, e.kind), title = btrim(p_title), description = nullif(btrim(coalesce(p_description, '')), ''),
        starts_at = p_starts_at, ends_at = p_ends_at, mode = p_mode,
        place_name = nullif(btrim(coalesce(p_place_name, '')), ''), address = nullif(btrim(coalesce(p_address, '')), ''),
        online_url = case when p_mode = 'online' then nullif(btrim(coalesce(p_online_url, '')), '') end,
        photo_path = coalesce(p_photo_path, e.photo_path),
        spot_limit = case when coalesce(p_kind, e.kind) = 'volunteer' then p_spot_limit end,
        host_id = coalesce(p_host_id, e.host_id)
    where e.id = p_id
    returning e.id into v_id;
  end if;
  return v_id;
end;
$$;

-- Cancel an event: everyone going (or maybe) hears about it.
create or replace function private.flock_event_cancel(p_event_id uuid, p_note text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  e public.flock_events;
  f record;
begin
  perform private.assert_can_use_flock();
  select * into e from public.flock_events x where x.id = p_event_id;
  if e.id is null or not private.can_manage_chapter(auth.uid(), e.region_slug) then
    raise exception 'only the chapter''s lead or an admin can do that' using errcode = '42501';
  end if;
  if e.status = 'cancelled' then return; end if;
  update public.flock_events x set status = 'cancelled', cancelled_at = now() where x.id = e.id;
  for f in select r.user_id from public.flock_event_rsvps r where r.event_id = e.id loop
    perform private.flock_notify(f.user_id, 'event', auth.uid(), 'event', e.id, 'cancelled', nullif(left(btrim(coalesce(p_note, '')), 1000), ''));
  end loop;
end;
$$;

-- I'm going / Maybe / not anymore (null). "Going" stops at the spot limit.
create or replace function private.flock_event_rsvp(p_event_id uuid, p_answer text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  e public.flock_events;
  v_going integer;
begin
  perform private.assert_can_use_flock();
  if not private.flock_event_visible(auth.uid(), p_event_id) then
    raise exception 'not found' using errcode = 'P0002';
  end if;
  -- Lock the event so two last-spot RSVPs can't both get in.
  select * into e from public.flock_events x where x.id = p_event_id for update;
  if e.status <> 'live' or e.starts_at < now() then
    raise exception 'this event is closed' using errcode = '22023';
  end if;
  if p_answer is null then
    delete from public.flock_event_rsvps r where r.event_id = e.id and r.user_id = auth.uid();
    return null;
  end if;
  if p_answer not in ('going', 'maybe') then
    raise exception 'going or maybe' using errcode = '22023';
  end if;
  if p_answer = 'going' and e.spot_limit is not null
     and not exists (select 1 from public.flock_event_rsvps r where r.event_id = e.id and r.user_id = auth.uid() and r.answer = 'going') then
    select count(*) into v_going from public.flock_event_rsvps r where r.event_id = e.id and r.answer = 'going';
    if v_going >= e.spot_limit then
      raise exception 'event_full' using errcode = 'P0001';
    end if;
  end if;
  insert into public.flock_event_rsvps (event_id, user_id, answer) values (e.id, auth.uid(), p_answer)
  on conflict (event_id, user_id) do update set answer = excluded.answer;
  return p_answer;
end;
$$;

-- The day-before reminder for everyone going, once each (pg_cron, hourly).
create or replace function private.flock_event_reminders()
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  r record;
  n integer := 0;
begin
  for r in
    select rv.event_id, rv.user_id from public.flock_event_rsvps rv
    join public.flock_events e on e.id = rv.event_id
    where rv.answer = 'going' and rv.reminder_sent_at is null and e.status = 'live'
      and e.starts_at > now() and e.starts_at <= now() + interval '24 hours'
  loop
    insert into public.flock_notifications (user_id, kind, subject_type, subject_id, detail)
    select r.user_id, 'event', 'event', r.event_id, 'reminder'
    where private.flock_event_visible(r.user_id, r.event_id);
    update public.flock_event_rsvps x set reminder_sent_at = now() where x.event_id = r.event_id and x.user_id = r.user_id;
    n := n + 1;
  end loop;
  return n;
end;
$$;

revoke all on function private.flock_event_suggest(uuid, text, text, timestamptz, timestamptz, text, text, text, text, text, boolean) from public, anon;
revoke all on function private.flock_event_save(uuid, text, text, text, timestamptz, timestamptz, text, text, text, text, text, uuid, integer, text) from public, anon;
revoke all on function private.flock_event_cancel(uuid, text) from public, anon;
revoke all on function private.flock_event_rsvp(uuid, text) from public, anon;
revoke all on function private.flock_event_reminders() from public, anon, authenticated;
grant execute on function private.flock_event_suggest(uuid, text, text, timestamptz, timestamptz, text, text, text, text, text, boolean) to authenticated, service_role;
grant execute on function private.flock_event_save(uuid, text, text, text, timestamptz, timestamptz, text, text, text, text, text, uuid, integer, text) to authenticated, service_role;
grant execute on function private.flock_event_cancel(uuid, text) to authenticated, service_role;
grant execute on function private.flock_event_rsvp(uuid, text) to authenticated, service_role;
grant execute on function private.flock_event_reminders() to service_role;

do $$
begin
  if to_regclass('cron.job') is null then
    raise notice 'pg_cron not installed; flock-event-reminders job not scheduled';
    return;
  end if;
  if not exists (select 1 from cron.job where jobname = 'flock-event-reminders-hourly') then
    -- SQL only: no HTTP call, so no token.
    perform cron.schedule('flock-event-reminders-hourly', '41 * * * *', $cmd$select private.flock_event_reminders()$cmd$);
  end if;
end;
$$;


-- 6) The review queue learns about events ------------------------------------------------------

-- Reviewers (admins, flock_reviewers) see Do good and reports; whoever
-- manages a chapter sees that chapter's event suggestions.
create or replace function private.flock_can_review()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$ select private.can_review(auth.uid()) or private.chapter_lead_region(auth.uid()) is not null; $$;

create or replace function private.assert_can_review_any()
returns void
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if not private.flock_can_review() then
    raise exception 'reviewers only' using errcode = '42501';
  end if;
end;
$$;
revoke all on function private.assert_can_review_any() from public, anon;
grant execute on function private.assert_can_review_any() to authenticated, service_role;

drop function if exists public.flock_review_counts();
drop function if exists private.flock_review_counts();
drop function if exists public.flock_review_queue(text);
drop function if exists private.flock_review_queue(text);

create function private.flock_review_queue(p_filter text)
returns table (
  item_type text, subject_type text, subject_id uuid, author_id uuid, author_name text, author_region text,
  title text, body text, photo_count integer, created_at timestamptz,
  report_count integer, reasons text[], notes text[], hidden boolean, removed boolean, messaged_at timestamptz,
  post_id uuid, journey_id uuid, event_starts_at timestamptz, event_mode text, event_place text, event_kind text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_reviewer boolean := private.can_review(auth.uid());
begin
  perform private.assert_can_review_any();
  return query
  select * from (
    select 'good'::text, 'post'::text, p.id, p.author_id, fp.display_name, rg.name, p.title, p.body, cardinality(p.photo_paths), p.created_at,
           0, '{}'::text[], '{}'::text[], false, false, null::timestamptz, p.id, null::uuid,
           null::timestamptz, null::text, null::text, null::text
    from public.flock_posts p
    left join public.flock_profiles fp on fp.user_id = p.author_id
    left join public.regions rg on rg.slug = fp.region_slug
    where v_reviewer and p.status = 'pending' and coalesce(p_filter, 'all') in ('all', 'good')
      and private.reviewer_covers(auth.uid(), p.author_id)
    union all
    select 'event'::text, 'event'::text, e.id, e.created_by, fp.display_name, rg.name, e.title, e.description, (e.photo_path is not null)::integer, e.created_at,
           0, '{}'::text[], '{}'::text[], false, false, null::timestamptz, null::uuid, null::uuid,
           e.starts_at, e.mode, e.place_name, e.kind
    from public.flock_events e
    left join public.flock_profiles fp on fp.user_id = e.created_by
    left join public.regions rg on rg.slug = e.region_slug
    where e.status = 'pending' and coalesce(p_filter, 'all') in ('all', 'events')
      and private.can_manage_chapter(auth.uid(), e.region_slug)
    union all
    select 'report'::text, r.subject_type, r.subject_id, x.author_id, fp.display_name, rg.name, x.title, x.body, x.photo_count,
           max(r.created_at), count(*)::integer, array_agg(distinct r.reason), array_remove(array_agg(r.note), null),
           coalesce(m.state = 'hidden', false), coalesce(m.state = 'removed', false), m.messaged_at, x.post_id, x.journey_id,
           null::timestamptz, null::text, null::text, null::text
    from public.flock_reports r
    cross join lateral (
      select p.author_id, p.title, p.body, cardinality(p.photo_paths) as photo_count, p.id as post_id, null::uuid as journey_id
      from public.flock_posts p where r.subject_type = 'post' and p.id = r.subject_id
      union all
      select c.author_id, null, c.body, (c.photo_path is not null)::integer,
             case when c.subject_type = 'post' then c.subject_id end,
             case when c.subject_type = 'journey_update' then (select u.journey_id from public.journey_updates u where u.id = c.subject_id)
                  when c.subject_type = 'journey_milestone' then (select m2.journey_id from public.journey_milestones m2 where m2.id = c.subject_id) end
      from public.flock_comments c where r.subject_type = 'comment' and c.id = r.subject_id
      union all
      select u.author_id, null, u.caption, (u.clip_ref is not null)::integer, null, u.journey_id
      from public.journey_updates u where r.subject_type = 'journey_update' and u.id = r.subject_id
    ) x
    left join public.flock_moderation m on m.subject_type = r.subject_type and m.subject_id = r.subject_id
    left join public.flock_profiles fp on fp.user_id = x.author_id
    left join public.regions rg on rg.slug = fp.region_slug
    where v_reviewer and r.resolved_at is null and coalesce(p_filter, 'all') in ('all', 'reports')
      and private.reviewer_covers(auth.uid(), x.author_id)
    group by r.subject_type, r.subject_id, x.author_id, fp.display_name, rg.name, x.title, x.body, x.photo_count,
             m.state, m.messaged_at, x.post_id, x.journey_id
  ) q
  order by 10 desc;
end;
$$;

create function private.flock_review_counts()
returns table (good integer, reports integer, events integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.assert_can_review_any();
  return query
    select (select count(*)::integer from private.flock_review_queue('good')),
           (select count(*)::integer from private.flock_review_queue('reports')),
           (select count(*)::integer from private.flock_review_queue('events'));
end;
$$;

-- An event suggestion: approve (live, and the chapter hears about it), ask
-- for changes (note required), or decline. The suggester is told either way.
create or replace function private.flock_review_event(p_event_id uuid, p_decision text, p_note text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  e public.flock_events;
  v_status text;
  v_note text := nullif(left(btrim(coalesce(p_note, '')), 1000), '');
begin
  perform private.assert_can_review_any();
  select * into e from public.flock_events x where x.id = p_event_id;
  if e.id is null or e.status <> 'pending' or not private.can_manage_chapter(auth.uid(), e.region_slug) then
    raise exception 'not found' using errcode = 'P0002';
  end if;
  v_status := case p_decision when 'approve' then 'live' when 'changes' then 'changes_requested' when 'decline' then 'declined' end;
  if v_status is null then
    raise exception 'approve, changes or decline' using errcode = '22023';
  end if;
  if v_status = 'changes_requested' and v_note is null then
    raise exception 'add a note so they know what to change' using errcode = '22023';
  end if;
  update public.flock_events x set status = v_status, review_note = v_note, reviewed_by = auth.uid(), reviewed_at = now() where x.id = e.id;
  insert into public.flock_notifications (user_id, kind, actor_id, subject_type, subject_id, detail, note)
  values (e.created_by, 'review', null, 'event', e.id, case v_status when 'live' then 'approved' else v_status end, v_note);
  if v_status = 'live' then
    perform private.flock_event_announce(e.id);
  end if;
end;
$$;

create or replace function private.set_in_person_min(p_members integer)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.assert_entitlement_admin();
  if p_members is null or p_members not between 1 and 1000 then
    raise exception 'pick a number from 1 to 1000' using errcode = '22023';
  end if;
  update public.flock_chapter_settings s set in_person_min_members = p_members, updated_at = now();
end;
$$;

revoke all on function private.flock_review_queue(text) from public, anon;
revoke all on function private.flock_review_counts() from public, anon;
revoke all on function private.flock_review_event(uuid, text, text) from public, anon;
revoke all on function private.set_in_person_min(integer) from public, anon;
grant execute on function private.flock_review_queue(text) to authenticated, service_role;
grant execute on function private.flock_review_counts() to authenticated, service_role;
grant execute on function private.flock_review_event(uuid, text, text) to authenticated, service_role;
grant execute on function private.set_in_person_min(integer) to authenticated, service_role;


-- 7) Invoker wrappers the app calls ---------------------------------------------------------------

create function public.flock_review_queue(p_filter text default 'all')
returns table (
  item_type text, subject_type text, subject_id uuid, author_id uuid, author_name text, author_region text,
  title text, body text, photo_count integer, created_at timestamptz,
  report_count integer, reasons text[], notes text[], hidden boolean, removed boolean, messaged_at timestamptz,
  post_id uuid, journey_id uuid, event_starts_at timestamptz, event_mode text, event_place text, event_kind text
) language sql stable security invoker set search_path = ''
as $$ select * from private.flock_review_queue(p_filter); $$;

create function public.flock_review_counts()
returns table (good integer, reports integer, events integer) language sql stable security invoker set search_path = ''
as $$ select * from private.flock_review_counts(); $$;

create or replace function public.flock_review_event(p_event_id uuid, p_decision text, p_note text default null)
returns void language sql volatile security invoker set search_path = ''
as $$ select private.flock_review_event(p_event_id, p_decision, p_note); $$;

create or replace function public.flock_chapter_events(p_when text default 'upcoming')
returns table (
  event_id uuid, kind text, title text, starts_at timestamptz, ends_at timestamptz, mode text, place_name text,
  status text, spot_limit integer, going integer, maybe integer, my_answer text, has_photo boolean, is_mine boolean
) language sql stable security invoker set search_path = ''
as $$ select * from private.flock_chapter_events(p_when); $$;

create or replace function public.flock_event(p_event_id uuid)
returns table (
  event_id uuid, region_slug text, region_name text, kind text, title text, description text, starts_at timestamptz,
  ends_at timestamptz, mode text, place_name text, address text, online_url text, has_photo boolean, spot_limit integer,
  status text, review_note text, host_id uuid, host_name text, host_is_lead boolean, going integer, maybe integer,
  my_answer text, goers jsonb, is_mine boolean, can_manage boolean
) language sql stable security invoker set search_path = ''
as $$ select * from private.flock_event(p_event_id); $$;

create or replace function public.flock_event_rules()
returns table (region_slug text, region_name text, member_count integer, in_person_min integer, in_person_open boolean, can_manage boolean)
language sql stable security invoker set search_path = ''
as $$ select * from private.flock_event_rules(); $$;

create or replace function public.flock_event_photo_ref(p_event_id uuid)
returns text language sql stable security invoker set search_path = ''
as $$ select private.flock_event_photo_ref(p_event_id); $$;

create or replace function public.flock_event_suggest(
  p_id uuid default null, p_kind text default 'meetup', p_title text default null, p_starts_at timestamptz default null,
  p_ends_at timestamptz default null, p_mode text default 'online', p_place_name text default null, p_address text default null,
  p_online_url text default null, p_description text default null, p_i_host boolean default false
)
returns uuid language sql volatile security invoker set search_path = ''
as $$ select private.flock_event_suggest(p_id, p_kind, p_title, p_starts_at, p_ends_at, p_mode, p_place_name, p_address, p_online_url, p_description, p_i_host); $$;

create or replace function public.flock_event_save(
  p_id uuid default null, p_region text default null, p_kind text default 'meetup', p_title text default null,
  p_starts_at timestamptz default null, p_ends_at timestamptz default null, p_mode text default 'in_person',
  p_place_name text default null, p_address text default null, p_online_url text default null, p_description text default null,
  p_host_id uuid default null, p_spot_limit integer default null, p_photo_path text default null
)
returns uuid language sql volatile security invoker set search_path = ''
as $$ select private.flock_event_save(p_id, p_region, p_kind, p_title, p_starts_at, p_ends_at, p_mode, p_place_name, p_address, p_online_url, p_description, p_host_id, p_spot_limit, p_photo_path); $$;

create or replace function public.flock_event_cancel(p_event_id uuid, p_note text default null)
returns void language sql volatile security invoker set search_path = ''
as $$ select private.flock_event_cancel(p_event_id, p_note); $$;

create or replace function public.flock_event_rsvp(p_event_id uuid, p_answer text)
returns text language sql volatile security invoker set search_path = ''
as $$ select private.flock_event_rsvp(p_event_id, p_answer); $$;

create or replace function public.admin_set_in_person_min(p_members integer)
returns void language sql volatile security invoker set search_path = ''
as $$ select private.set_in_person_min(p_members); $$;

revoke all on function public.flock_review_queue(text) from public, anon;
revoke all on function public.flock_review_counts() from public, anon;
revoke all on function public.flock_review_event(uuid, text, text) from public, anon;
revoke all on function public.flock_chapter_events(text) from public, anon;
revoke all on function public.flock_event(uuid) from public, anon;
revoke all on function public.flock_event_rules() from public, anon;
revoke all on function public.flock_event_photo_ref(uuid) from public, anon;
revoke all on function public.flock_event_suggest(uuid, text, text, timestamptz, timestamptz, text, text, text, text, text, boolean) from public, anon;
revoke all on function public.flock_event_save(uuid, text, text, text, timestamptz, timestamptz, text, text, text, text, text, uuid, integer, text) from public, anon;
revoke all on function public.flock_event_cancel(uuid, text) from public, anon;
revoke all on function public.flock_event_rsvp(uuid, text) from public, anon;
revoke all on function public.admin_set_in_person_min(integer) from public, anon;
grant execute on function public.flock_review_queue(text) to authenticated, service_role;
grant execute on function public.flock_review_counts() to authenticated, service_role;
grant execute on function public.flock_review_event(uuid, text, text) to authenticated, service_role;
grant execute on function public.flock_chapter_events(text) to authenticated, service_role;
grant execute on function public.flock_event(uuid) to authenticated, service_role;
grant execute on function public.flock_event_rules() to authenticated, service_role;
grant execute on function public.flock_event_photo_ref(uuid) to authenticated, service_role;
grant execute on function public.flock_event_suggest(uuid, text, text, timestamptz, timestamptz, text, text, text, text, text, boolean) to authenticated, service_role;
grant execute on function public.flock_event_save(uuid, text, text, text, timestamptz, timestamptz, text, text, text, text, text, uuid, integer, text) to authenticated, service_role;
grant execute on function public.flock_event_cancel(uuid, text) to authenticated, service_role;
grant execute on function public.flock_event_rsvp(uuid, text) to authenticated, service_role;
grant execute on function public.admin_set_in_person_min(integer) to authenticated, service_role;
