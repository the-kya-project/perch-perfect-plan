-- Backlog 1.11: Buddy pods.
-- Additive for the care app: three new tables, one new column on flock_posts,
-- new functions and an hourly SQL-only job. The Flock-only changes to
-- existing things are:
--   * flock_posts' space check takes 'pod' (a pod's posts);
--   * private.flock_post_visible: a pod post shows only to the pod's members
--     (its author always does, through the first branch);
--   * private.flock_feed: Today's "everything" leaves pod posts out.
-- Each is rewritten from its live definition with exact text replacements
-- (as 20261121100000_flock_member_blocking.sql did), with anchors that other
-- open branches (1.10 challenges) leave in place, so the block rules and any
-- other change already in them stay.
--
-- A buddy pod (flock_pods) is 3 to 6 members working on the same journey
-- template, who cheer each other on.
--   * Starting a template journey, a member can ask to be paired
--     (flock_pod_wait). Their journey goes on the waitlist (flock_pod_waitlist)
--     and is placed at once when it can be: into an open pod on the same
--     journey with room (under 6), the member's chapter first; otherwise a new
--     pod forms once 3 compatible people are waiting, from the member's
--     chapter when 3 there are waiting, else from everyone waiting. Members
--     who have blocked each other are never placed together. Until then the
--     member sees "We're finding your buddies" and can leave the waitlist.
--   * Up to 2 pods at once, counting waitlist places and "keep going" groups.
--   * A pod's posts are Flock posts in the 'pod' space (flock_posts.pod_id), so
--     reactions, comments, reports, review, blocks, photos, deletion and the
--     180-day hold work exactly as for posts. They show only in the pod.
--   * Progress from a "Just me" journey is shown only to the bird's
--     household; a bird's name shows only when the bird is shown in the
--     Community (or to its household).
--   * A member who finishes stays; the pod stays open until every member has
--     finished or left. Then, with 2 or more left, each is asked "Keep going
--     together?" for 7 days; with 2+ yeses it continues as a general buddy
--     group (kind 'group', not tied to a journey) and the rest leave quietly;
--     otherwise it closes.
--   * The 3-week rule: a pod (or group) with fewer than 2 active members over
--     the last 21 days is dissolved by the hourly job. Active = still in the
--     pod and joined, posted, commented in the pod, or (journey pods) posted a
--     journey update or reached a milestone in that time. The remaining
--     members of a journey pod who haven't finished are offered a new pod; a
--     group just ends.
--   * Admins see every pod, move a member to another pod on the same journey,
--     and dissolve a pod.
-- Ended pods stay readable to the members who were in them. Everything goes
-- through SECURITY DEFINER functions in private, with invoker wrappers in
-- public. App users have no grant on the tables.


-- 1) Tables ----------------------------------------------------------------------------

create table if not exists public.flock_pods (
  id           uuid primary key default gen_random_uuid(),
  -- journey: tied to a journey template. group: a "keep going" group.
  kind         text not null default 'journey' check (kind in ('journey', 'group')),
  -- The journey the pod formed around (kept on a group, for its history).
  template_id  uuid not null references public.journey_templates(id) on delete restrict,
  -- Set when every member was from one chapter.
  region_slug  text references public.regions(slug),
  -- active → asking ("Keep going together?") → active as a group, or closed.
  -- dissolved: the 3-week rule, or an admin.
  status       text not null default 'active' check (status in ('active', 'asking', 'closed', 'dissolved')),
  asked_at     timestamptz,
  group_since  timestamptz,
  ended_at     timestamptz,
  ended_by     uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  check ((status = 'asking') = (asked_at is not null)),
  check ((kind = 'group') = (group_since is not null))
);
create index if not exists flock_pods_open_idx on public.flock_pods (template_id, status) where status in ('active', 'asking');

create table if not exists public.flock_pod_members (
  pod_id           uuid not null references public.flock_pods(id) on delete cascade,
  user_id          uuid not null references auth.users(id) on delete cascade,
  -- The member's journey in a journey pod; null in a group. Deleting the
  -- journey takes the member out of its pod.
  journey_id       uuid references public.journeys(id) on delete cascade,
  joined_at        timestamptz not null default now(),
  left_at          timestamptz,
  -- "You finished!" was answered (Stay or Leave).
  finished_seen_at timestamptz,
  -- "Keep going together?" (null = not answered).
  keep_going       boolean,
  -- The pod was dissolved before they finished: offer a new one.
  offered_new      boolean not null default false,
  primary key (pod_id, user_id)
);
create index if not exists flock_pod_members_user_idx on public.flock_pod_members (user_id) where left_at is null;
create index if not exists flock_pod_members_journey_idx on public.flock_pod_members (journey_id);

create table if not exists public.flock_pod_waitlist (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  journey_id   uuid not null unique references public.journeys(id) on delete cascade,
  template_id  uuid not null references public.journey_templates(id) on delete cascade,
  region_slug  text,
  created_at   timestamptz not null default now()
);
create index if not exists flock_pod_waitlist_template_idx on public.flock_pod_waitlist (template_id, created_at);
create index if not exists flock_pod_waitlist_user_idx on public.flock_pod_waitlist (user_id);

alter table public.flock_posts add column if not exists pod_id uuid references public.flock_pods(id) on delete restrict;
create index if not exists flock_posts_pod_idx on public.flock_posts (pod_id, created_at desc) where pod_id is not null;

-- The space check, rewritten from its live definition so any space another
-- migration added stays.
do $$
declare
  v_def text;
begin
  select pg_get_constraintdef(c.oid) into v_def
  from pg_constraint c
  where c.conrelid = 'public.flock_posts'::regclass and c.conname = 'flock_posts_space_check';
  if v_def is null then
    raise exception 'flock_posts_space_check not found';
  end if;
  if position('''pod''' in v_def) = 0 then
    if position('''start''::text' in v_def) = 0 then
      raise exception 'flock_posts_space_check: anchor not found in %', v_def;
    end if;
    v_def := replace(v_def, '''start''::text', '''start''::text, ''pod''::text');
    execute 'alter table public.flock_posts drop constraint flock_posts_space_check';
    execute 'alter table public.flock_posts add constraint flock_posts_space_check ' || v_def;
  end if;
end;
$$;
alter table public.flock_posts drop constraint if exists flock_posts_pod_shape;
alter table public.flock_posts add constraint flock_posts_pod_shape check ((space = 'pod') = (pod_id is not null));

alter table public.flock_pods enable row level security;
alter table public.flock_pod_members enable row level security;
alter table public.flock_pod_waitlist enable row level security;
revoke all on public.flock_pods from anon, authenticated;
revoke all on public.flock_pod_members from anon, authenticated;
revoke all on public.flock_pod_waitlist from anon, authenticated;
grant select, insert, update, delete on public.flock_pods to service_role;
grant select, insert, update, delete on public.flock_pod_members to service_role;
grant select, insert, update, delete on public.flock_pod_waitlist to service_role;
drop policy if exists "flock_pods no direct access" on public.flock_pods;
drop policy if exists "flock_pod_members no direct access" on public.flock_pod_members;
drop policy if exists "flock_pod_waitlist no direct access" on public.flock_pod_waitlist;
create policy "flock_pods no direct access" on public.flock_pods for select to authenticated using (false);
create policy "flock_pod_members no direct access" on public.flock_pod_members for select to authenticated using (false);
create policy "flock_pod_waitlist no direct access" on public.flock_pod_waitlist for select to authenticated using (false);


-- 2) Rules -----------------------------------------------------------------------------

-- Is p_user in this pod now? (Ended pods stay readable to their members.)
create or replace function private.flock_pod_member(p_user_id uuid, p_pod_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user_id is not null and exists (
    select 1 from public.flock_pod_members m
    where m.pod_id = p_pod_id and m.user_id = p_user_id and m.left_at is null
  );
$$;

-- Open pods plus waitlist places: at most 2.
create or replace function private.flock_pod_count(p_user_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select (select count(*)::integer from public.flock_pod_members m
          join public.flock_pods p on p.id = m.pod_id
          where m.user_id = p_user_id and m.left_at is null and p.status in ('active', 'asking'))
       + (select count(*)::integer from public.flock_pod_waitlist w where w.user_id = p_user_id);
$$;

create or replace function private.flock_pod_max()
returns integer language sql immutable set search_path = '' as $$ select 2; $$;

-- Has p_user blocked, or been blocked by, anyone in the pod?
create or replace function private.flock_pod_blocked_with(p_user_id uuid, p_pod_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.flock_pod_members m
    where m.pod_id = p_pod_id and m.left_at is null and private.flock_blocked(p_user_id, m.user_id)
  );
$$;

create or replace function private.flock_pod_size(p_pod_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer from public.flock_pod_members m where m.pod_id = p_pod_id and m.left_at is null;
$$;

-- Was p_user active in the pod over the last 21 days?
create or replace function private.flock_pod_active_member(p_pod_id uuid, p_user_id uuid, p_since timestamptz)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.flock_pod_members m
    where m.pod_id = p_pod_id and m.user_id = p_user_id and m.left_at is null
      and (m.joined_at > p_since
           or exists (select 1 from public.flock_posts x where x.pod_id = p_pod_id and x.author_id = p_user_id and x.created_at > p_since)
           or exists (select 1 from public.flock_comments c join public.flock_posts x on x.id = c.subject_id
                      where c.subject_type = 'post' and x.pod_id = p_pod_id and c.author_id = p_user_id and c.created_at > p_since)
           or (m.journey_id is not null and (
                 exists (select 1 from public.journey_updates u where u.journey_id = m.journey_id and u.author_id = p_user_id and u.created_at > p_since)
                 or exists (select 1 from public.journey_milestones jm where jm.journey_id = m.journey_id and jm.state = 'reached' and jm.reached_at > p_since))))
  );
$$;

-- Put a waiting journey into a pod, if it can go anywhere yet. Returns the pod.
create or replace function private.flock_pod_place(p_wait_id uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  w public.flock_pod_waitlist;
  c public.flock_pod_waitlist;
  v_pod uuid;
  v_users uuid[];
  v_waits uuid[];
  v_regions text[];
  v_chapter text;
  v_pass integer;
begin
  select * into w from public.flock_pod_waitlist x where x.id = p_wait_id;
  if w.id is null then
    return null;
  end if;
  -- One placement at a time per journey template.
  perform pg_advisory_xact_lock(hashtextextended('flock_pod:' || w.template_id::text, 0));
  select * into w from public.flock_pod_waitlist x where x.id = p_wait_id;
  if w.id is null then
    return null;
  end if;
  v_chapter := case when w.region_slug is null or w.region_slug = 'other' then null else w.region_slug end;

  -- 1) An open pod on this journey with room, the member's chapter first.
  select p.id into v_pod
  from public.flock_pods p
  where p.kind = 'journey' and p.status = 'active' and p.template_id = w.template_id
    and private.flock_pod_size(p.id) between 1 and 5
    and not exists (select 1 from public.flock_pod_members m where m.pod_id = p.id and m.user_id = w.user_id and m.left_at is null)
    and not private.flock_pod_blocked_with(w.user_id, p.id)
    and exists (select 1 from public.flock_pod_members m join public.journeys j on j.id = m.journey_id
                where m.pod_id = p.id and m.left_at is null and j.status <> 'finished')
  order by (v_chapter is not null and p.region_slug is not distinct from v_chapter) desc, p.created_at, p.id
  limit 1;
  if v_pod is not null then
    insert into public.flock_pod_members (pod_id, user_id, journey_id)
    values (v_pod, w.user_id, w.journey_id)
    on conflict (pod_id, user_id) do update
      set left_at = null, joined_at = now(), journey_id = excluded.journey_id,
          finished_seen_at = null, keep_going = null, offered_new = false;
    update public.flock_pods p set region_slug = null
    where p.id = v_pod and p.region_slug is distinct from v_chapter;
    delete from public.flock_pod_waitlist x where x.id = w.id;
    return v_pod;
  end if;

  -- 2) A new pod once 3 are waiting: from the member's chapter when 3 there
  --    are waiting, otherwise from everyone waiting (chapter first, then oldest).
  for v_pass in 1 .. 2 loop
    continue when v_pass = 1 and v_chapter is null;
    v_users := array[w.user_id];
    v_waits := array[w.id];
    v_regions := array[coalesce(v_chapter, '')];
    for c in
      select * from public.flock_pod_waitlist x
      where x.template_id = w.template_id and x.id <> w.id
        and (v_pass = 2 or x.region_slug = v_chapter)
      order by (v_chapter is not null and x.region_slug is not distinct from v_chapter) desc, x.created_at, x.id
    loop
      exit when cardinality(v_users) >= 6;
      continue when c.user_id = any (v_users);
      continue when exists (select 1 from unnest(v_users) u where private.flock_blocked(u, c.user_id));
      continue when private.flock_pod_count(c.user_id) > private.flock_pod_max();
      v_users := v_users || c.user_id;
      v_waits := v_waits || c.id;
      v_regions := v_regions || coalesce(case when c.region_slug = 'other' then null else c.region_slug end, '');
    end loop;
    if cardinality(v_users) >= 3 then
      insert into public.flock_pods (kind, template_id, region_slug)
      values ('journey', w.template_id,
              case when (select count(distinct r) from unnest(v_regions) r) = 1 and v_regions[1] <> '' then v_regions[1] end)
      returning id into v_pod;
      insert into public.flock_pod_members (pod_id, user_id, journey_id)
      select v_pod, x.user_id, x.journey_id from public.flock_pod_waitlist x where x.id = any (v_waits);
      delete from public.flock_pod_waitlist x where x.id = any (v_waits);
      return v_pod;
    end if;
  end loop;
  return null;
end;
$$;

-- A journey pod where everyone left has finished (or left): with 2 or more
-- still in it, ask "Keep going together?"; otherwise close it.
create or replace function private.flock_pod_check_done(p_pod_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  p public.flock_pods;
begin
  select * into p from public.flock_pods x where x.id = p_pod_id for update;
  if p.id is null or p.kind <> 'journey' or p.status <> 'active' then
    return;
  end if;
  if exists (select 1 from public.flock_pod_members m join public.journeys j on j.id = m.journey_id
             where m.pod_id = p.id and m.left_at is null and j.status <> 'finished') then
    return;
  end if;
  if private.flock_pod_size(p.id) >= 2 then
    update public.flock_pods x set status = 'asking', asked_at = now() where x.id = p.id;
  else
    update public.flock_pods x set status = 'closed', ended_at = now() where x.id = p.id;
  end if;
end;
$$;

-- "Keep going together?": once everyone has answered, or after 7 days, 2+
-- yeses make it a general buddy group and everyone else leaves quietly;
-- otherwise the pod closes.
create or replace function private.flock_pod_settle(p_pod_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  p public.flock_pods;
begin
  select * into p from public.flock_pods x where x.id = p_pod_id for update;
  if p.id is null or p.status <> 'asking' then
    return;
  end if;
  if p.asked_at > now() - interval '7 days'
     and exists (select 1 from public.flock_pod_members m where m.pod_id = p.id and m.left_at is null and m.keep_going is null) then
    return;
  end if;
  if (select count(*) from public.flock_pod_members m where m.pod_id = p.id and m.left_at is null and m.keep_going) >= 2 then
    update public.flock_pod_members m set left_at = now()
    where m.pod_id = p.id and m.left_at is null and m.keep_going is not true;
    update public.flock_pod_members m set journey_id = null, keep_going = null
    where m.pod_id = p.id and m.left_at is null;
    update public.flock_pods x set kind = 'group', status = 'active', asked_at = null, group_since = now() where x.id = p.id;
  else
    update public.flock_pods x set status = 'closed', asked_at = null, ended_at = now() where x.id = p.id;
  end if;
end;
$$;

-- End a pod early (the 3-week rule, or an admin). Members of a journey pod
-- who haven't finished are offered a new pod.
create or replace function private.flock_pod_dissolve(p_pod_id uuid, p_by uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  p public.flock_pods;
begin
  select * into p from public.flock_pods x where x.id = p_pod_id for update;
  if p.id is null or p.status not in ('active', 'asking') then
    return;
  end if;
  update public.flock_pods x set status = 'dissolved', asked_at = null, ended_at = now(), ended_by = p_by where x.id = p.id;
  if p.kind = 'journey' then
    update public.flock_pod_members m set offered_new = true
    from public.journeys j
    where m.pod_id = p.id and m.left_at is null and j.id = m.journey_id and j.status in ('active', 'paused');
  end if;
end;
$$;

-- The hourly job: close finished pods, settle "Keep going together?",
-- apply the 3-week rule, and place anyone still waiting.
create or replace function private.flock_pods_tick()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  r record;
  v_since timestamptz := now() - interval '21 days';
  v_done integer := 0;
  v_settled integer := 0;
  v_dissolved integer := 0;
  v_placed integer := 0;
begin
  for r in select p.id from public.flock_pods p where p.kind = 'journey' and p.status = 'active' loop
    perform private.flock_pod_check_done(r.id);
    if (select status from public.flock_pods where id = r.id) <> 'active' then v_done := v_done + 1; end if;
  end loop;
  for r in select p.id from public.flock_pods p where p.status = 'asking' loop
    perform private.flock_pod_settle(r.id);
    if (select status from public.flock_pods where id = r.id) <> 'asking' then v_settled := v_settled + 1; end if;
  end loop;
  for r in
    select p.id from public.flock_pods p
    where p.status = 'active' and coalesce(p.group_since, p.created_at) < v_since
      and (select count(*) from public.flock_pod_members m
           where m.pod_id = p.id and m.left_at is null and private.flock_pod_active_member(p.id, m.user_id, v_since)) < 2
  loop
    perform private.flock_pod_dissolve(r.id, null);
    v_dissolved := v_dissolved + 1;
  end loop;
  for r in select w.id from public.flock_pod_waitlist w order by w.created_at, w.id loop
    if private.flock_pod_place(r.id) is not null then v_placed := v_placed + 1; end if;
  end loop;
  return jsonb_build_object('closed_or_asking', v_done, 'settled', v_settled, 'dissolved', v_dissolved, 'placed', v_placed);
end;
$$;

revoke all on function private.flock_pod_member(uuid, uuid) from public, anon;
revoke all on function private.flock_pod_count(uuid) from public, anon, authenticated;
revoke all on function private.flock_pod_max() from public, anon;
revoke all on function private.flock_pod_blocked_with(uuid, uuid) from public, anon, authenticated;
revoke all on function private.flock_pod_size(uuid) from public, anon, authenticated;
revoke all on function private.flock_pod_active_member(uuid, uuid, timestamptz) from public, anon, authenticated;
revoke all on function private.flock_pod_place(uuid) from public, anon, authenticated;
revoke all on function private.flock_pod_check_done(uuid) from public, anon, authenticated;
revoke all on function private.flock_pod_settle(uuid) from public, anon, authenticated;
revoke all on function private.flock_pod_dissolve(uuid, uuid) from public, anon, authenticated;
revoke all on function private.flock_pods_tick() from public, anon, authenticated;
-- flock_post_visible runs as the caller and checks membership.
grant execute on function private.flock_pod_member(uuid, uuid) to authenticated, service_role;
grant execute on function private.flock_pod_max() to authenticated, service_role;
grant execute on function private.flock_pod_count(uuid) to service_role;
grant execute on function private.flock_pod_blocked_with(uuid, uuid) to service_role;
grant execute on function private.flock_pod_size(uuid) to service_role;
grant execute on function private.flock_pod_active_member(uuid, uuid, timestamptz) to service_role;
grant execute on function private.flock_pod_place(uuid) to service_role;
grant execute on function private.flock_pod_check_done(uuid) to service_role;
grant execute on function private.flock_pod_settle(uuid) to service_role;
grant execute on function private.flock_pod_dissolve(uuid, uuid) to service_role;
grant execute on function private.flock_pods_tick() to service_role;


-- 3) Members ---------------------------------------------------------------------------

-- "Pair me with buddies working on this too": your own template journey goes
-- on the waitlist and is placed at once if it can be.
create or replace function private.flock_pod_wait(p_journey_id uuid)
returns table (state text, pod_id uuid)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  j public.journeys;
  v_region text;
  v_wait uuid;
  v_pod uuid;
begin
  perform private.assert_can_use_flock();
  select * into j from public.journeys x where x.id = p_journey_id and x.created_by = v_me;
  if j.id is null or j.template_id is null then
    raise exception 'not found' using errcode = 'P0002';
  end if;
  if j.status not in ('active', 'paused') then
    raise exception 'journey_not_open' using errcode = 'P0001';
  end if;
  select m.pod_id into v_pod
  from public.flock_pod_members m join public.flock_pods p on p.id = m.pod_id
  where m.journey_id = j.id and m.user_id = v_me and m.left_at is null and p.status in ('active', 'asking')
  limit 1;
  if v_pod is not null then
    return query select 'pod'::text, v_pod;
    return;
  end if;
  if exists (select 1 from public.flock_pod_waitlist w where w.journey_id = j.id) then
    return query select 'waiting'::text, null::uuid;
    return;
  end if;
  select fp.region_slug into v_region from public.flock_profiles fp where fp.user_id = v_me;
  if not found then
    raise exception 'set up your Community profile first' using errcode = '42501';
  end if;
  if private.flock_pod_count(v_me) >= private.flock_pod_max() then
    raise exception 'pod_limit' using errcode = 'P0001';
  end if;
  insert into public.flock_pod_waitlist (user_id, journey_id, template_id, region_slug)
  values (v_me, j.id, j.template_id, v_region)
  returning id into v_wait;
  update public.flock_pod_members m set offered_new = false where m.user_id = v_me and m.journey_id = j.id;
  v_pod := private.flock_pod_place(v_wait);
  return query select case when v_pod is null then 'waiting' else 'pod' end, v_pod;
end;
$$;

create or replace function private.flock_pod_unwait(p_journey_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.assert_can_use_flock();
  delete from public.flock_pod_waitlist w where w.journey_id = p_journey_id and w.user_id = auth.uid();
end;
$$;

-- Can the caller ask for buddies on a new journey? (The setup screen.)
create or replace function private.flock_pod_can_wait()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.assert_can_use_flock();
  return private.flock_pod_count(auth.uid()) < private.flock_pod_max();
end;
$$;

-- Your own journey's pod state: pod | waiting (with how many are waiting on
-- this journey) | offer (your pod ended early; a new one is offered) | none.
create or replace function private.flock_pod_for_journey(p_journey_id uuid)
returns table (state text, pod_id uuid, waiting integer, can_wait boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  j public.journeys;
  v_pod uuid;
begin
  perform private.assert_can_use_flock();
  select * into j from public.journeys x where x.id = p_journey_id and x.created_by = v_me;
  if j.id is null or j.template_id is null then
    return;
  end if;
  select m.pod_id into v_pod
  from public.flock_pod_members m join public.flock_pods p on p.id = m.pod_id
  where m.journey_id = j.id and m.user_id = v_me and m.left_at is null and p.status in ('active', 'asking')
  limit 1;
  if v_pod is not null then
    return query select 'pod'::text, v_pod, 0, false;
    return;
  end if;
  if exists (select 1 from public.flock_pod_waitlist w where w.journey_id = j.id) then
    return query select 'waiting'::text, null::uuid,
      (select count(distinct w.user_id)::integer from public.flock_pod_waitlist w
       where w.template_id = j.template_id
         and (w.user_id = v_me or not private.flock_blocked(v_me, w.user_id))),
      false;
    return;
  end if;
  select m.pod_id into v_pod
  from public.flock_pod_members m join public.flock_pods p on p.id = m.pod_id
  where m.journey_id = j.id and m.user_id = v_me and m.left_at is null and m.offered_new and p.status = 'dissolved'
  order by p.ended_at desc nulls last
  limit 1;
  return query select case when v_pod is not null and j.status in ('active', 'paused') then 'offer' else 'none' end,
    v_pod, 0, j.status in ('active', 'paused') and private.flock_pod_count(v_me) < private.flock_pod_max();
end;
$$;

-- Your pods (open ones first) and the journeys you're waiting on.
create or replace function private.flock_my_pods()
returns table (
  pod_id uuid, journey_id uuid, kind text, status text, template_slug text, template_name text,
  region_name text, member_count integer, created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
begin
  perform private.assert_can_use_flock();
  return query
    select u.* from (
      select p.id as a_pod, m.journey_id as a_journey, p.kind as a_kind, p.status as a_status, t.slug as a_slug, t.name as a_name,
             rg.name as a_region,
             (select count(*)::integer from public.flock_pod_members o
              where o.pod_id = p.id and o.left_at is null and not private.flock_blocked(v_me, o.user_id)) as a_count,
             p.created_at as a_at
      from public.flock_pod_members m
      join public.flock_pods p on p.id = m.pod_id
      join public.journey_templates t on t.id = p.template_id
      left join public.regions rg on rg.slug = p.region_slug
      where m.user_id = v_me and m.left_at is null
      union all
      select null::uuid, w.journey_id, 'waiting'::text, 'waiting'::text, t.slug, t.name, null::text, 0, w.created_at
      from public.flock_pod_waitlist w
      join public.journey_templates t on t.id = w.template_id
      where w.user_id = v_me
    ) u
    order by (u.a_status = 'waiting') desc, (u.a_status in ('active', 'asking')) desc, u.a_at desc;
end;
$$;

-- One pod, for its members.
create or replace function private.flock_pod(p_pod_id uuid)
returns table (
  pod_id uuid, kind text, status text, template_slug text, template_name text, region_name text,
  member_count integer, my_journey_id uuid, my_finished boolean, asking_me boolean, my_answer boolean,
  checked_in_this_week boolean, offered_new boolean, created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_week timestamptz := (date_trunc('week', private.flock_today()::timestamp)) at time zone 'America/New_York';
begin
  perform private.assert_can_use_flock();
  if not private.flock_pod_member(v_me, p_pod_id) then
    return;
  end if;
  return query
    select p.id, p.kind, p.status, t.slug, t.name, rg.name,
           (select count(*)::integer from public.flock_pod_members o
            where o.pod_id = p.id and o.left_at is null and not private.flock_blocked(v_me, o.user_id)),
           m.journey_id,
           coalesce(j.status = 'finished', false) and m.finished_seen_at is null and p.kind = 'journey',
           p.status = 'asking' and m.keep_going is null,
           m.keep_going,
           exists (select 1 from public.flock_posts x where x.pod_id = p.id and x.author_id = v_me and x.created_at >= v_week),
           m.offered_new and p.status = 'dissolved',
           p.created_at
    from public.flock_pods p
    join public.flock_pod_members m on m.pod_id = p.id and m.user_id = v_me
    join public.journey_templates t on t.id = p.template_id
    left join public.regions rg on rg.slug = p.region_slug
    left join public.journeys j on j.id = m.journey_id
    where p.id = p_pod_id;
end;
$$;

-- The pod's members: Community name and photo, the bird (only when it's
-- shown, or to its household) and journey progress (never from a "Just me"
-- journey outside the household). Blocked members are left out.
create or replace function private.flock_pod_members(p_pod_id uuid)
returns table (
  user_id uuid, display_name text, photo_path text, is_me boolean,
  bird_id uuid, bird_name text, bird_has_photo boolean, done integer, total integer, finished boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
begin
  perform private.assert_can_use_flock();
  if not private.flock_pod_member(v_me, p_pod_id) then
    return;
  end if;
  return query
    select m.user_id, fp.display_name, fp.photo_path, m.user_id = v_me,
           case when bv.ok then b.id end,
           case when bv.ok then b.name::text end,
           coalesce(bv.ok and private.journey_bird_photo_visible(v_me, b.id), false),
           case when pv.ok then (select count(*)::integer from public.journey_milestones jm where jm.journey_id = j.id and jm.state <> 'todo') end,
           case when pv.ok then (select count(*)::integer from public.journey_milestones jm where jm.journey_id = j.id) end,
           case when pv.ok then j.status = 'finished' end
    from public.flock_pod_members m
    left join public.flock_profiles fp on fp.user_id = m.user_id
    left join public.journeys j on j.id = m.journey_id
    left join public.birds b on b.id = j.bird_id
    left join lateral (
      select b.id is not null and b.passed_at is null and (
        private.has_bird_access(b.id, v_me) is not null
        or exists (select 1 from public.flock_shown_birds s where s.bird_id = b.id and s.user_id = m.user_id and s.shown)
      ) as ok
    ) bv on true
    left join lateral (
      select j.id is not null and (m.user_id = v_me or j.visibility = 'community' or private.has_bird_access(j.bird_id, v_me) is not null) as ok
    ) pv on true
    where m.pod_id = p_pod_id and m.left_at is null
      and not private.flock_blocked(v_me, m.user_id)
    order by m.user_id = v_me desc, m.joined_at, m.user_id;
end;
$$;

-- The pod's feed: its posts, newest first, under the usual post rules.
create or replace function private.flock_pod_feed(p_pod_id uuid, p_before timestamptz, p_limit integer)
returns setof record
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.assert_can_use_flock();
  if not private.flock_pod_member(auth.uid(), p_pod_id) then
    return;
  end if;
  return query
    select r.* from private.flock_post_rows(auth.uid()) r
    join public.flock_posts x on x.id = r.post_id
    where x.pod_id = p_pod_id
      and r.created_at < coalesce(p_before, 'infinity'::timestamptz)
    order by r.created_at desc, r.post_id
    limit least(greatest(coalesce(p_limit, 20), 1), 50);
end;
$$;

-- A check-in or photo in the pod: the same rules as any post.
create or replace function private.flock_pod_post_create(
  p_pod_id uuid, p_title text, p_body text, p_photo_paths text[], p_bird_id uuid, p_vet_nudged boolean
)
returns table (post_id uuid, status text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_paths text[] := coalesce(p_photo_paths, '{}');
  v_path text;
  v_id uuid;
begin
  perform private.assert_can_use_flock();
  if not exists (select 1 from public.flock_profiles fp where fp.user_id = v_me) then
    raise exception 'set up your Community profile first' using errcode = '42501';
  end if;
  if not private.flock_pod_member(v_me, p_pod_id) then
    raise exception 'not found' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.flock_pods p where p.id = p_pod_id and p.status in ('active', 'asking')) then
    raise exception 'pod_closed' using errcode = 'P0001';
  end if;
  if length(btrim(coalesce(p_body, ''))) not between 1 and 5000 then
    raise exception 'write a few words (up to 5,000 characters)' using errcode = '22023';
  end if;
  if p_title is not null and length(btrim(p_title)) > 120 then
    raise exception 'titles are up to 120 characters' using errcode = '22023';
  end if;
  if cardinality(v_paths) > 4 or cardinality(v_paths) <> (select count(distinct x) from unnest(v_paths) x) then
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
  insert into public.flock_posts (author_id, space, pod_id, title, body, bird_id, photo_paths, status, vet_nudged)
  values (v_me, 'pod', p_pod_id, nullif(btrim(coalesce(p_title, '')), ''), btrim(p_body), p_bird_id, v_paths, 'live', coalesce(p_vet_nudged, false))
  returning id into v_id;
  return query select v_id, 'live'::text;
end;
$$;

-- Leave quietly: the others see only one fewer member.
create or replace function private.flock_pod_leave(p_pod_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.assert_can_use_flock();
  update public.flock_pod_members m set left_at = now()
  where m.pod_id = p_pod_id and m.user_id = auth.uid() and m.left_at is null;
  perform private.flock_pod_check_done(p_pod_id);
  perform private.flock_pod_settle(p_pod_id);
end;
$$;

-- "You finished!" → Stay.
create or replace function private.flock_pod_finished_seen(p_pod_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.assert_can_use_flock();
  update public.flock_pod_members m set finished_seen_at = now()
  where m.pod_id = p_pod_id and m.user_id = auth.uid() and m.left_at is null;
end;
$$;

-- "Keep going together?" Yes or No. A No leaves at once, quietly.
create or replace function private.flock_pod_keep_going(p_pod_id uuid, p_yes boolean)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.assert_can_use_flock();
  if p_yes is null then
    raise exception 'answer yes or no' using errcode = '22023';
  end if;
  if not exists (select 1 from public.flock_pods p where p.id = p_pod_id and p.status = 'asking')
     or not private.flock_pod_member(auth.uid(), p_pod_id) then
    raise exception 'not found' using errcode = 'P0002';
  end if;
  update public.flock_pod_members m
  set keep_going = p_yes, left_at = case when p_yes then null else now() end
  where m.pod_id = p_pod_id and m.user_id = auth.uid() and m.left_at is null;
  perform private.flock_pod_settle(p_pod_id);
end;
$$;

revoke all on function private.flock_pod_wait(uuid) from public, anon;
revoke all on function private.flock_pod_unwait(uuid) from public, anon;
revoke all on function private.flock_pod_can_wait() from public, anon;
revoke all on function private.flock_pod_for_journey(uuid) from public, anon;
revoke all on function private.flock_my_pods() from public, anon;
revoke all on function private.flock_pod(uuid) from public, anon;
revoke all on function private.flock_pod_members(uuid) from public, anon;
revoke all on function private.flock_pod_feed(uuid, timestamptz, integer) from public, anon;
revoke all on function private.flock_pod_post_create(uuid, text, text, text[], uuid, boolean) from public, anon;
revoke all on function private.flock_pod_leave(uuid) from public, anon;
revoke all on function private.flock_pod_finished_seen(uuid) from public, anon;
revoke all on function private.flock_pod_keep_going(uuid, boolean) from public, anon;
grant execute on function private.flock_pod_wait(uuid) to authenticated, service_role;
grant execute on function private.flock_pod_unwait(uuid) to authenticated, service_role;
grant execute on function private.flock_pod_can_wait() to authenticated, service_role;
grant execute on function private.flock_pod_for_journey(uuid) to authenticated, service_role;
grant execute on function private.flock_my_pods() to authenticated, service_role;
grant execute on function private.flock_pod(uuid) to authenticated, service_role;
grant execute on function private.flock_pod_members(uuid) to authenticated, service_role;
grant execute on function private.flock_pod_feed(uuid, timestamptz, integer) to authenticated, service_role;
grant execute on function private.flock_pod_post_create(uuid, text, text, text[], uuid, boolean) to authenticated, service_role;
grant execute on function private.flock_pod_leave(uuid) to authenticated, service_role;
grant execute on function private.flock_pod_finished_seen(uuid) to authenticated, service_role;
grant execute on function private.flock_pod_keep_going(uuid, boolean) to authenticated, service_role;


-- 4) Admins ----------------------------------------------------------------------------

create or replace function private.assert_pod_admin()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.assert_can_use_flock();
  if not private.is_admin(auth.uid()) then
    raise exception 'admins only' using errcode = '42501';
  end if;
end;
$$;

-- Every pod, open ones first.
create or replace function private.admin_pods()
returns table (
  pod_id uuid, kind text, status text, template_slug text, template_name text, region_name text,
  member_count integer, last_post_at timestamptz, created_at timestamptz, ended_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.assert_pod_admin();
  return query
    select p.id, p.kind, p.status, t.slug, t.name, rg.name, private.flock_pod_size(p.id),
           (select max(x.created_at) from public.flock_posts x where x.pod_id = p.id),
           p.created_at, p.ended_at
    from public.flock_pods p
    join public.journey_templates t on t.id = p.template_id
    left join public.regions rg on rg.slug = p.region_slug
    order by p.status in ('active', 'asking') desc, p.created_at desc;
end;
$$;

-- A pod's members (including those who left), for admins.
create or replace function private.admin_pod_members(p_pod_id uuid)
returns table (user_id uuid, display_name text, region_name text, journey_status text, joined_at timestamptz, left_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.assert_pod_admin();
  return query
    select m.user_id, fp.display_name, rg.name, j.status, m.joined_at, m.left_at
    from public.flock_pod_members m
    left join public.flock_profiles fp on fp.user_id = m.user_id
    left join public.regions rg on rg.slug = fp.region_slug
    left join public.journeys j on j.id = m.journey_id
    where m.pod_id = p_pod_id
    order by m.left_at is null desc, m.joined_at, m.user_id;
end;
$$;

-- How many are waiting on each journey.
create or replace function private.admin_pod_waitlist()
returns table (template_slug text, template_name text, waiting integer, oldest timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.assert_pod_admin();
  return query
    select t.slug, t.name, count(*)::integer, min(w.created_at)
    from public.flock_pod_waitlist w join public.journey_templates t on t.id = w.template_id
    group by t.slug, t.name
    order by min(w.created_at);
end;
$$;

-- Move a member to another open pod of the same kind (on the same journey,
-- for journey pods), with room, where nobody has blocked them.
create or replace function private.admin_pod_move(p_user_id uuid, p_from uuid, p_to uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  f public.flock_pods;
  t public.flock_pods;
  v_journey uuid;
begin
  perform private.assert_pod_admin();
  select * into f from public.flock_pods x where x.id = p_from;
  select * into t from public.flock_pods x where x.id = p_to for update;
  select m.journey_id into v_journey from public.flock_pod_members m where m.pod_id = p_from and m.user_id = p_user_id and m.left_at is null;
  if f.id is null or t.id is null or f.id = t.id or not found then
    raise exception 'not found' using errcode = 'P0002';
  end if;
  if t.status <> 'active' or t.kind <> f.kind or (t.kind = 'journey' and t.template_id <> f.template_id) then
    raise exception 'pick an open pod on the same journey' using errcode = '22023';
  end if;
  if private.flock_pod_size(t.id) >= 6 then
    raise exception 'pod_full' using errcode = 'P0001';
  end if;
  if private.flock_pod_member(p_user_id, t.id) then
    raise exception 'already in that pod' using errcode = '22023';
  end if;
  if private.flock_pod_blocked_with(p_user_id, t.id) then
    raise exception 'pod_blocked' using errcode = 'P0001';
  end if;
  update public.flock_pod_members m set left_at = now() where m.pod_id = f.id and m.user_id = p_user_id;
  insert into public.flock_pod_members (pod_id, user_id, journey_id)
  values (t.id, p_user_id, v_journey)
  on conflict (pod_id, user_id) do update
    set left_at = null, joined_at = now(), journey_id = excluded.journey_id,
        finished_seen_at = null, keep_going = null, offered_new = false;
  update public.flock_pods x set region_slug = null
  where x.id = t.id and x.region_slug is distinct from (select fp.region_slug from public.flock_profiles fp where fp.user_id = p_user_id);
  perform private.flock_pod_check_done(f.id);
end;
$$;

create or replace function private.admin_pod_dissolve(p_pod_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.assert_pod_admin();
  if not exists (select 1 from public.flock_pods p where p.id = p_pod_id and p.status in ('active', 'asking')) then
    raise exception 'not found' using errcode = 'P0002';
  end if;
  perform private.flock_pod_dissolve(p_pod_id, auth.uid());
end;
$$;

revoke all on function private.assert_pod_admin() from public, anon;
revoke all on function private.admin_pods() from public, anon;
revoke all on function private.admin_pod_members(uuid) from public, anon;
revoke all on function private.admin_pod_waitlist() from public, anon;
revoke all on function private.admin_pod_move(uuid, uuid, uuid) from public, anon;
revoke all on function private.admin_pod_dissolve(uuid) from public, anon;
grant execute on function private.assert_pod_admin() to authenticated, service_role;
grant execute on function private.admin_pods() to authenticated, service_role;
grant execute on function private.admin_pod_members(uuid) to authenticated, service_role;
grant execute on function private.admin_pod_waitlist() to authenticated, service_role;
grant execute on function private.admin_pod_move(uuid, uuid, uuid) to authenticated, service_role;
grant execute on function private.admin_pod_dissolve(uuid) to authenticated, service_role;


-- 5) The existing Flock functions, each rewritten from its live definition ---------------
create or replace function private.flock_pod_patch(p_sig text, p_pairs text[])
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_def text := pg_get_functiondef(p_sig::regprocedure);
  i integer;
begin
  if array_length(p_pairs, 1) % 2 <> 0 then
    raise exception 'flock_pod_patch(%): pairs must come in twos', p_sig;
  end if;
  for i in 1 .. array_length(p_pairs, 1) by 2 loop
    if position(p_pairs[i] in v_def) = 0 then
      raise exception 'flock_pod_patch(%): anchor not found: %', p_sig, p_pairs[i];
    end if;
    v_def := replace(v_def, p_pairs[i], p_pairs[i + 1]);
  end loop;
  execute v_def;
end;
$$;

-- A pod post shows only to the pod's members (its author always does,
-- through the first branch).
select private.flock_pod_patch('private.flock_post_visible(uuid, uuid)', array[
  'and (p.space <> ''chapter''',
  'and (p.space <> ''pod'' or private.flock_pod_member(p_user_id, p.pod_id))
            and (p.space <> ''chapter'''
]);

-- Today's "everything" leaves pod posts to their pod.
select private.flock_pod_patch('private.flock_feed(text, timestamptz, integer)', array[
  'and r.created_at < coalesce(p_before, ''infinity''::timestamptz)',
  'and r.space <> ''pod''
      and r.created_at < coalesce(p_before, ''infinity''::timestamptz)'
]);

drop function private.flock_pod_patch(text, text[]);


-- 6) Invoker wrappers the app calls ------------------------------------------------------

create or replace function public.flock_pod_wait(p_journey_id uuid)
returns table (state text, pod_id uuid) language sql volatile security invoker set search_path = ''
as $$ select * from private.flock_pod_wait(p_journey_id); $$;

create or replace function public.flock_pod_unwait(p_journey_id uuid)
returns void language sql volatile security invoker set search_path = ''
as $$ select private.flock_pod_unwait(p_journey_id); $$;

create or replace function public.flock_pod_can_wait()
returns boolean language sql stable security invoker set search_path = ''
as $$ select private.flock_pod_can_wait(); $$;

create or replace function public.flock_pod_for_journey(p_journey_id uuid)
returns table (state text, pod_id uuid, waiting integer, can_wait boolean) language sql stable security invoker set search_path = ''
as $$ select * from private.flock_pod_for_journey(p_journey_id); $$;

create or replace function public.flock_my_pods()
returns table (
  pod_id uuid, journey_id uuid, kind text, status text, template_slug text, template_name text,
  region_name text, member_count integer, created_at timestamptz
) language sql stable security invoker set search_path = ''
as $$ select * from private.flock_my_pods(); $$;

create or replace function public.flock_pod(p_pod_id uuid)
returns table (
  pod_id uuid, kind text, status text, template_slug text, template_name text, region_name text,
  member_count integer, my_journey_id uuid, my_finished boolean, asking_me boolean, my_answer boolean,
  checked_in_this_week boolean, offered_new boolean, created_at timestamptz
) language sql stable security invoker set search_path = ''
as $$ select * from private.flock_pod(p_pod_id); $$;

create or replace function public.flock_pod_members(p_pod_id uuid)
returns table (
  user_id uuid, display_name text, photo_path text, is_me boolean,
  bird_id uuid, bird_name text, bird_has_photo boolean, done integer, total integer, finished boolean
) language sql stable security invoker set search_path = ''
as $$ select * from private.flock_pod_members(p_pod_id); $$;

create or replace function public.flock_pod_feed(p_pod_id uuid, p_before timestamptz default null, p_limit integer default 20)
returns table (
  post_id uuid, author_id uuid, author_name text, author_region text, author_photo_path text, author_is_founder boolean,
  space text, region_slug text, region_name text, title text, body text, photo_count integer,
  bird_id uuid, bird_name text, bird_has_photo boolean, status text, review_note text,
  created_at timestamptz, edited_at timestamptz, is_mine boolean, comment_count integer,
  great_job integer, been_there integer, rooting_for_you integer, love_this integer, mine text[]
) language sql stable security invoker set search_path = ''
as $$
  select * from private.flock_pod_feed(p_pod_id, p_before, p_limit) as f(
    post_id uuid, author_id uuid, author_name text, author_region text, author_photo_path text, author_is_founder boolean,
    space text, region_slug text, region_name text, title text, body text, photo_count integer,
    bird_id uuid, bird_name text, bird_has_photo boolean, status text, review_note text,
    created_at timestamptz, edited_at timestamptz, is_mine boolean, comment_count integer,
    great_job integer, been_there integer, rooting_for_you integer, love_this integer, mine text[]);
$$;

create or replace function public.flock_pod_post_create(
  p_pod_id uuid, p_title text default null, p_body text default null, p_photo_paths text[] default '{}',
  p_bird_id uuid default null, p_vet_nudged boolean default false
)
returns table (post_id uuid, status text) language sql volatile security invoker set search_path = ''
as $$ select * from private.flock_pod_post_create(p_pod_id, p_title, p_body, p_photo_paths, p_bird_id, p_vet_nudged); $$;

create or replace function public.flock_pod_leave(p_pod_id uuid)
returns void language sql volatile security invoker set search_path = ''
as $$ select private.flock_pod_leave(p_pod_id); $$;

create or replace function public.flock_pod_finished_seen(p_pod_id uuid)
returns void language sql volatile security invoker set search_path = ''
as $$ select private.flock_pod_finished_seen(p_pod_id); $$;

create or replace function public.flock_pod_keep_going(p_pod_id uuid, p_yes boolean)
returns void language sql volatile security invoker set search_path = ''
as $$ select private.flock_pod_keep_going(p_pod_id, p_yes); $$;

create or replace function public.admin_pods()
returns table (
  pod_id uuid, kind text, status text, template_slug text, template_name text, region_name text,
  member_count integer, last_post_at timestamptz, created_at timestamptz, ended_at timestamptz
) language sql stable security invoker set search_path = ''
as $$ select * from private.admin_pods(); $$;

create or replace function public.admin_pod_members(p_pod_id uuid)
returns table (user_id uuid, display_name text, region_name text, journey_status text, joined_at timestamptz, left_at timestamptz)
language sql stable security invoker set search_path = ''
as $$ select * from private.admin_pod_members(p_pod_id); $$;

create or replace function public.admin_pod_waitlist()
returns table (template_slug text, template_name text, waiting integer, oldest timestamptz)
language sql stable security invoker set search_path = ''
as $$ select * from private.admin_pod_waitlist(); $$;

create or replace function public.admin_pod_move(p_user_id uuid, p_from uuid, p_to uuid)
returns void language sql volatile security invoker set search_path = ''
as $$ select private.admin_pod_move(p_user_id, p_from, p_to); $$;

create or replace function public.admin_pod_dissolve(p_pod_id uuid)
returns void language sql volatile security invoker set search_path = ''
as $$ select private.admin_pod_dissolve(p_pod_id); $$;

revoke all on function public.flock_pod_wait(uuid) from public, anon;
revoke all on function public.flock_pod_unwait(uuid) from public, anon;
revoke all on function public.flock_pod_can_wait() from public, anon;
revoke all on function public.flock_pod_for_journey(uuid) from public, anon;
revoke all on function public.flock_my_pods() from public, anon;
revoke all on function public.flock_pod(uuid) from public, anon;
revoke all on function public.flock_pod_members(uuid) from public, anon;
revoke all on function public.flock_pod_feed(uuid, timestamptz, integer) from public, anon;
revoke all on function public.flock_pod_post_create(uuid, text, text, text[], uuid, boolean) from public, anon;
revoke all on function public.flock_pod_leave(uuid) from public, anon;
revoke all on function public.flock_pod_finished_seen(uuid) from public, anon;
revoke all on function public.flock_pod_keep_going(uuid, boolean) from public, anon;
revoke all on function public.admin_pods() from public, anon;
revoke all on function public.admin_pod_members(uuid) from public, anon;
revoke all on function public.admin_pod_waitlist() from public, anon;
revoke all on function public.admin_pod_move(uuid, uuid, uuid) from public, anon;
revoke all on function public.admin_pod_dissolve(uuid) from public, anon;
grant execute on function public.flock_pod_wait(uuid) to authenticated, service_role;
grant execute on function public.flock_pod_unwait(uuid) to authenticated, service_role;
grant execute on function public.flock_pod_can_wait() to authenticated, service_role;
grant execute on function public.flock_pod_for_journey(uuid) to authenticated, service_role;
grant execute on function public.flock_my_pods() to authenticated, service_role;
grant execute on function public.flock_pod(uuid) to authenticated, service_role;
grant execute on function public.flock_pod_members(uuid) to authenticated, service_role;
grant execute on function public.flock_pod_feed(uuid, timestamptz, integer) to authenticated, service_role;
grant execute on function public.flock_pod_post_create(uuid, text, text, text[], uuid, boolean) to authenticated, service_role;
grant execute on function public.flock_pod_leave(uuid) to authenticated, service_role;
grant execute on function public.flock_pod_finished_seen(uuid) to authenticated, service_role;
grant execute on function public.flock_pod_keep_going(uuid, boolean) to authenticated, service_role;
grant execute on function public.admin_pods() to authenticated, service_role;
grant execute on function public.admin_pod_members(uuid) to authenticated, service_role;
grant execute on function public.admin_pod_waitlist() to authenticated, service_role;
grant execute on function public.admin_pod_move(uuid, uuid, uuid) to authenticated, service_role;
grant execute on function public.admin_pod_dissolve(uuid) to authenticated, service_role;


-- 7) The hourly job (SQL only: no HTTP call, so no token) ------------------------------

do $$
begin
  if to_regclass('cron.job') is null then
    raise notice 'pg_cron not installed; flock-pods-hourly job not scheduled';
    return;
  end if;
  if not exists (select 1 from cron.job where jobname = 'flock-pods-hourly') then
    perform cron.schedule('flock-pods-hourly', '17 * * * *', $cmd$select private.flock_pods_tick()$cmd$);
  end if;
end;
$$;
