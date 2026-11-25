-- Backlog 1.11 follow-up: buddy pods without "Keep going together?" and with
-- a stage label instead of a progress bar (Brittany, Nov 24, 2026). Changes
-- the live pod tables and functions from 20261124070000_flock_buddy_pods.sql,
-- which merged in #548. Flock only: pods are behind flock_enabled() (admins
-- today), and nothing here touches the care app.
--
-- What changes:
--   * No buddy groups. A journey pod closes ('closed') once every member has
--     finished or left, and stays readable to the members who were in it,
--     like any ended pod. Gone: the 'group' kind, the 'asking' status,
--     flock_pods.asked_at and group_since, flock_pod_members.keep_going,
--     private.flock_pod_settle, and flock_pod_keep_going (private and the
--     public wrapper). flock_pods.kind stays, and only takes 'journey'.
--     Any pod left asking or running as a group is closed first (and a
--     former group becomes an ended journey pod).
--   * "Finished" for a pod means the journey ended either way: status
--     'finished' (learned it) or 'happy_where_we_are' (1.20a). Used for
--     placing into an open pod, closing a pod, and "You finished!".
--   * flock_pod_members returns stage ('working' | 'learned' | 'happy')
--     instead of done, total and finished, since journeys no longer have
--     milestones (1.20a). Null, as before, when the journey is "Just me" and
--     the viewer isn't in its household. A paused journey shows 'working'.
--   * flock_pod drops asking_me and my_answer.
--   * The 2-pod limit counts open pods and waitlist places only.
--   * The 3-week rule counts finishing the journey in the window
--     (journeys.finished_at) as activity, instead of reaching a milestone.
-- Every function below is a full replacement of the 20261124070000 version.


-- 1) Close anything that was asking or running as a group --------------------------------

-- A group kept the journey it formed around, so it becomes an ended journey
-- pod, still readable to its members. Only while the old columns are there,
-- so running this again (after they're gone) is a no-op.
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'flock_pods' and column_name = 'asked_at') then
    execute $sql$
      update public.flock_pods p
      set status = 'closed', asked_at = null, ended_at = coalesce(p.ended_at, now())
      where p.status = 'asking' or (p.kind = 'group' and p.status = 'active')
    $sql$;
    execute $sql$
      update public.flock_pods p set kind = 'journey', group_since = null where p.kind = 'group'
    $sql$;
  end if;
end;
$$;


-- 2) Functions that go away --------------------------------------------------------------

drop function if exists public.flock_pod_keep_going(uuid, boolean);
drop function if exists private.flock_pod_keep_going(uuid, boolean);
drop function if exists private.flock_pod_settle(uuid);
-- Their return types change, so they're dropped and created again below.
drop function if exists public.flock_pod(uuid);
drop function if exists private.flock_pod(uuid);
drop function if exists public.flock_pod_members(uuid);
drop function if exists private.flock_pod_members(uuid);


-- 3) Tables ------------------------------------------------------------------------------

-- Dropping a column also drops the checks that use it
-- ((status = 'asking') = (asked_at is not null), (kind = 'group') = (group_since is not null)).
alter table public.flock_pods drop column if exists asked_at;
alter table public.flock_pods drop column if exists group_since;
alter table public.flock_pod_members drop column if exists keep_going;

-- The kind and status checks, found by what they say, then written again.
do $$
declare
  r record;
begin
  for r in
    select c.conname from pg_constraint c
    where c.conrelid = 'public.flock_pods'::regclass and c.contype = 'c'
      and (pg_get_constraintdef(c.oid) like '%''group''%' or pg_get_constraintdef(c.oid) like '%''asking''%')
  loop
    execute format('alter table public.flock_pods drop constraint %I', r.conname);
  end loop;
end;
$$;
alter table public.flock_pods drop constraint if exists flock_pods_kind_check;
alter table public.flock_pods add constraint flock_pods_kind_check check (kind = 'journey');
alter table public.flock_pods drop constraint if exists flock_pods_status_check;
alter table public.flock_pods add constraint flock_pods_status_check check (status in ('active', 'closed', 'dissolved'));

drop index if exists public.flock_pods_open_idx;
create index if not exists flock_pods_open_idx on public.flock_pods (template_id, status) where status = 'active';

comment on column public.flock_pods.kind is
  'Always ''journey'': buddy groups were dropped (Brittany, Nov 24, 2026).';
comment on column public.flock_pod_members.journey_id is
  'The member''s journey in the pod. Deleting the journey takes the member out of its pod.';


-- 4) Rules -------------------------------------------------------------------------------

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
          where m.user_id = p_user_id and m.left_at is null and p.status = 'active')
       + (select count(*)::integer from public.flock_pod_waitlist w where w.user_id = p_user_id);
$$;

-- Was p_user active in the pod over the last 21 days? Joined, posted or
-- commented in the pod, posted a journey update, or finished the journey.
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
                 or exists (select 1 from public.journeys j where j.id = m.journey_id and j.finished_at > p_since))))
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

  -- 1) An open pod on this journey with room, where someone is still working
  --    on it, the member's chapter first.
  select p.id into v_pod
  from public.flock_pods p
  where p.status = 'active' and p.template_id = w.template_id
    and private.flock_pod_size(p.id) between 1 and 5
    and not exists (select 1 from public.flock_pod_members m where m.pod_id = p.id and m.user_id = w.user_id and m.left_at is null)
    and not private.flock_pod_blocked_with(w.user_id, p.id)
    and exists (select 1 from public.flock_pod_members m join public.journeys j on j.id = m.journey_id
                where m.pod_id = p.id and m.left_at is null and j.status not in ('finished', 'happy_where_we_are'))
  order by (v_chapter is not null and p.region_slug is not distinct from v_chapter) desc, p.created_at, p.id
  limit 1;
  if v_pod is not null then
    insert into public.flock_pod_members (pod_id, user_id, journey_id)
    values (v_pod, w.user_id, w.journey_id)
    on conflict (pod_id, user_id) do update
      set left_at = null, joined_at = now(), journey_id = excluded.journey_id,
          finished_seen_at = null, offered_new = false;
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

-- Once everyone still in the pod has finished (learned it or happy where
-- they are) or left, the pod closes.
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
  if p.id is null or p.status <> 'active' then
    return;
  end if;
  if exists (select 1 from public.flock_pod_members m join public.journeys j on j.id = m.journey_id
             where m.pod_id = p.id and m.left_at is null and j.status not in ('finished', 'happy_where_we_are')) then
    return;
  end if;
  update public.flock_pods x set status = 'closed', ended_at = now() where x.id = p.id;
end;
$$;

-- End a pod early (the 3-week rule, or an admin). Members who haven't
-- finished are offered a new pod.
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
  if p.id is null or p.status <> 'active' then
    return;
  end if;
  update public.flock_pods x set status = 'dissolved', ended_at = now(), ended_by = p_by where x.id = p.id;
  update public.flock_pod_members m set offered_new = true
  from public.journeys j
  where m.pod_id = p.id and m.left_at is null and j.id = m.journey_id and j.status in ('active', 'paused');
end;
$$;

-- The hourly job: close finished pods, apply the 3-week rule, and place
-- anyone still waiting.
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
  v_closed integer := 0;
  v_dissolved integer := 0;
  v_placed integer := 0;
begin
  for r in select p.id from public.flock_pods p where p.status = 'active' loop
    perform private.flock_pod_check_done(r.id);
    if (select status from public.flock_pods where id = r.id) <> 'active' then v_closed := v_closed + 1; end if;
  end loop;
  for r in
    select p.id from public.flock_pods p
    where p.status = 'active' and p.created_at < v_since
      and (select count(*) from public.flock_pod_members m
           where m.pod_id = p.id and m.left_at is null and private.flock_pod_active_member(p.id, m.user_id, v_since)) < 2
  loop
    perform private.flock_pod_dissolve(r.id, null);
    v_dissolved := v_dissolved + 1;
  end loop;
  for r in select w.id from public.flock_pod_waitlist w order by w.created_at, w.id loop
    if private.flock_pod_place(r.id) is not null then v_placed := v_placed + 1; end if;
  end loop;
  return jsonb_build_object('closed', v_closed, 'dissolved', v_dissolved, 'placed', v_placed);
end;
$$;


-- 5) Members -----------------------------------------------------------------------------

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
  where m.journey_id = j.id and m.user_id = v_me and m.left_at is null and p.status = 'active'
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
  where m.journey_id = j.id and m.user_id = v_me and m.left_at is null and p.status = 'active'
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
    order by (u.a_status = 'waiting') desc, (u.a_status = 'active') desc, u.a_at desc;
end;
$$;

-- One pod, for its members. my_finished: your journey ended (learned it or
-- happy where you are) and you haven't answered "You finished!".
create or replace function private.flock_pod(p_pod_id uuid)
returns table (
  pod_id uuid, kind text, status text, template_slug text, template_name text, region_name text,
  member_count integer, my_journey_id uuid, my_finished boolean,
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
           coalesce(j.status in ('finished', 'happy_where_we_are'), false) and m.finished_seen_at is null,
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
-- shown, or to its household) and where they are on the journey: 'working'
-- (active or paused), 'learned' or 'happy'. Null for a "Just me" journey
-- outside its household. Blocked members are left out.
create or replace function private.flock_pod_members(p_pod_id uuid)
returns table (
  user_id uuid, display_name text, photo_path text, is_me boolean,
  bird_id uuid, bird_name text, bird_has_photo boolean, stage text
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
           case when pv.ok then
             case j.status when 'finished' then 'learned' when 'happy_where_we_are' then 'happy' else 'working' end
           end
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
  if not exists (select 1 from public.flock_pods p where p.id = p_pod_id and p.status = 'active') then
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

-- Leave quietly: the others see only one fewer member. If everyone left has
-- finished, the pod closes.
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
end;
$$;

revoke all on function private.flock_pod(uuid) from public, anon;
revoke all on function private.flock_pod_members(uuid) from public, anon;
grant execute on function private.flock_pod(uuid) to authenticated, service_role;
grant execute on function private.flock_pod_members(uuid) to authenticated, service_role;


-- 6) Admins ------------------------------------------------------------------------------

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
    order by p.status = 'active' desc, p.created_at desc;
end;
$$;

-- Move a member to another open pod on the same journey, with room, where
-- nobody has blocked them.
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
  if t.status <> 'active' or t.template_id <> f.template_id then
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
        finished_seen_at = null, offered_new = false;
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
  if not exists (select 1 from public.flock_pods p where p.id = p_pod_id and p.status = 'active') then
    raise exception 'not found' using errcode = 'P0002';
  end if;
  perform private.flock_pod_dissolve(p_pod_id, auth.uid());
end;
$$;


-- 7) Invoker wrappers for the two functions created again -------------------------------

create or replace function public.flock_pod(p_pod_id uuid)
returns table (
  pod_id uuid, kind text, status text, template_slug text, template_name text, region_name text,
  member_count integer, my_journey_id uuid, my_finished boolean,
  checked_in_this_week boolean, offered_new boolean, created_at timestamptz
) language sql stable security invoker set search_path = ''
as $$ select * from private.flock_pod(p_pod_id); $$;

create or replace function public.flock_pod_members(p_pod_id uuid)
returns table (
  user_id uuid, display_name text, photo_path text, is_me boolean,
  bird_id uuid, bird_name text, bird_has_photo boolean, stage text
) language sql stable security invoker set search_path = ''
as $$ select * from private.flock_pod_members(p_pod_id); $$;

revoke all on function public.flock_pod(uuid) from public, anon;
revoke all on function public.flock_pod_members(uuid) from public, anon;
grant execute on function public.flock_pod(uuid) to authenticated, service_role;
grant execute on function public.flock_pod_members(uuid) to authenticated, service_role;
