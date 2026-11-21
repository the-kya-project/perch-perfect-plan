-- The Flock, step 3 (PR C): journey pages, the Journeys tab, following,
-- reactions, and milestones in Today. Additive only: new tables and functions.
-- No care-app table, policy, trigger or function changes.
--
-- Who sees a journey (private.journey_viewable):
--   * anyone with access to the bird (owner or household), any visibility;
--   * otherwise only when visibility = 'community', its creator can still use
--     the Flock (a member or an admin), and the viewer's tier can view
--     community journeys (app premium read-only, Flock members).
--   A "Just me" journey is therefore never shown to anyone outside the bird's
--   own household, by any function here.
-- Following and reactions: Flock members (and admins) only.
-- Clips: only journey_clip_refs() hands out clip references, and only for a
-- journey the caller may view; the server signs short-lived playback links
-- from those (src/lib/journeyMedia.functions.ts).
-- Reactions live in one table keyed by (subject_type, subject_id) so step 4's
-- posts can reuse it.


-- 1) Follows and reactions ------------------------------------------------------------

create table if not exists public.journey_follows (
  journey_id uuid not null references public.journeys(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (journey_id, user_id)
);
create index if not exists journey_follows_user_idx on public.journey_follows (user_id, created_at desc);

create table if not exists public.flock_reactions (
  id           uuid primary key default gen_random_uuid(),
  subject_type text not null check (subject_type in ('journey_update', 'journey_milestone')),
  subject_id   uuid not null,
  user_id      uuid not null references auth.users(id) on delete cascade,
  kind         text not null check (kind in ('great_job', 'been_there', 'rooting_for_you', 'love_this')),
  created_at   timestamptz not null default now(),
  unique (subject_type, subject_id, user_id, kind)
);
create index if not exists flock_reactions_subject_idx on public.flock_reactions (subject_type, subject_id);

alter table public.journey_follows enable row level security;
alter table public.flock_reactions enable row level security;
revoke all on public.journey_follows, public.flock_reactions from anon, authenticated;
grant select, insert, update, delete on public.journey_follows, public.flock_reactions to service_role;
-- Read through the functions below, which count and check visibility.
drop policy if exists "journey_follows no direct access" on public.journey_follows;
create policy "journey_follows no direct access" on public.journey_follows for select to authenticated using (false);
drop policy if exists "flock_reactions no direct access" on public.flock_reactions;
create policy "flock_reactions no direct access" on public.flock_reactions for select to authenticated using (false);


-- 2) Who may see a journey --------------------------------------------------------------

create or replace function private.journey_viewable(p_user_id uuid, p_journey_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user_id is not null and private.can_use_journeys(p_user_id) and exists (
    select 1 from public.journeys j
    where j.id = p_journey_id
      and (
        private.has_bird_access(j.bird_id, p_user_id) is not null
        or (j.visibility = 'community'
            and private.can_use_flock(j.created_by)
            and (private.journey_limits_for(p_user_id)).can_view_community)
      )
  );
$$;

revoke all on function private.journey_viewable(uuid, uuid) from public, anon;
grant execute on function private.journey_viewable(uuid, uuid) to authenticated, service_role;

-- A bird's photo may show to someone outside its household only when its
-- owner chose to show it (flock_shown_birds), the same rule as profiles.
create or replace function private.journey_bird_photo_visible(p_user_id uuid, p_bird_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.birds b where b.id = p_bird_id and b.photo_url is not null)
     and (private.has_bird_access(p_bird_id, p_user_id) is not null
          or exists (select 1 from public.flock_shown_birds s where s.bird_id = p_bird_id and s.shown));
$$;

revoke all on function private.journey_bird_photo_visible(uuid, uuid) from public, anon;
grant execute on function private.journey_bird_photo_visible(uuid, uuid) to authenticated, service_role;


-- 3) Reading journeys -----------------------------------------------------------------------

-- One journey card / page header. Only public fields: bird name (and whether a
-- photo may show), the skill, progress, the owner's Community display name.
-- Never a care field.
create or replace function private.journey_card_rows(p_user_id uuid)
returns table (
  journey_id uuid, bird_id uuid, bird_name text, bird_has_photo boolean, skill text, template_slug text, category text,
  template_tier text, status text, visibility text, started_at timestamptz, finished_at timestamptz,
  done integer, total integer, next_title text, owner_id uuid, owner_name text, followers integer, following boolean,
  is_mine boolean, last_activity timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select j.id, j.bird_id, b.name, private.journey_bird_photo_visible(p_user_id, j.bird_id),
         coalesce(t.name, j.custom_name), t.slug, t.category, t.tier, j.status, j.visibility, j.started_at, j.finished_at,
         (select count(*)::integer from public.journey_milestones m where m.journey_id = j.id and m.state <> 'todo'),
         (select count(*)::integer from public.journey_milestones m where m.journey_id = j.id),
         (select m.title from public.journey_milestones m where m.journey_id = j.id and m.state = 'todo' order by m.position limit 1),
         j.created_by, p.display_name,
         (select count(*)::integer from public.journey_follows f where f.journey_id = j.id),
         exists (select 1 from public.journey_follows f where f.journey_id = j.id and f.user_id = p_user_id),
         private.has_bird_access(j.bird_id, p_user_id) is not null,
         greatest(j.updated_at, coalesce((select max(u.created_at) from public.journey_updates u where u.journey_id = j.id), j.started_at))
  from public.journeys j
  join public.birds b on b.id = j.bird_id
  left join public.journey_templates t on t.id = j.template_id
  left join public.flock_profiles p on p.user_id = j.created_by
  where private.journey_viewable(p_user_id, j.id);
$$;

revoke all on function private.journey_card_rows(uuid) from public, anon;
grant execute on function private.journey_card_rows(uuid) to authenticated, service_role;

-- The Journeys tab: For you (every community journey you may see, yours
-- included), Following, Tricks, Basics (the free templates). Never a "Just me"
-- journey from outside your household.
create or replace function private.journey_feed(p_filter text, p_limit integer)
returns table (
  journey_id uuid, bird_id uuid, bird_name text, bird_has_photo boolean, skill text, template_slug text, category text,
  template_tier text, status text, visibility text, started_at timestamptz, finished_at timestamptz,
  done integer, total integer, next_title text, owner_id uuid, owner_name text, followers integer, following boolean,
  is_mine boolean, last_activity timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.assert_can_use_journeys();
  if p_filter is null or p_filter not in ('for_you', 'following', 'tricks', 'basics') then
    raise exception 'unknown filter' using errcode = '22023';
  end if;
  return query
    select c.* from private.journey_card_rows(auth.uid()) c
    where c.visibility = 'community' and c.status in ('active', 'finished')
      and (p_filter = 'for_you'
           or (p_filter = 'following' and c.following)
           or (p_filter = 'tricks' and c.category = 'tricks')
           or (p_filter = 'basics' and c.template_tier = 'free'))
    order by c.last_activity desc
    limit least(greatest(coalesce(p_limit, 50), 1), 200);
end;
$$;

-- Journeys you follow, for the rings across the top of Today.
create or replace function private.journey_following()
returns table (
  journey_id uuid, bird_id uuid, bird_name text, bird_has_photo boolean, skill text, template_slug text, category text,
  template_tier text, status text, visibility text, started_at timestamptz, finished_at timestamptz,
  done integer, total integer, next_title text, owner_id uuid, owner_name text, followers integer, following boolean,
  is_mine boolean, last_activity timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.assert_can_use_journeys();
  return query
    select c.* from private.journey_card_rows(auth.uid()) c
    where c.following and c.status in ('active', 'finished')
    order by c.last_activity desc;
end;
$$;

-- One journey (the page header), if you may see it.
create or replace function private.journey_view(p_journey_id uuid)
returns table (
  journey_id uuid, bird_id uuid, bird_name text, bird_has_photo boolean, skill text, template_slug text, category text,
  template_tier text, status text, visibility text, started_at timestamptz, finished_at timestamptz,
  done integer, total integer, next_title text, owner_id uuid, owner_name text, followers integer, following boolean,
  is_mine boolean, last_activity timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.assert_can_use_journeys();
  return query select c.* from private.journey_card_rows(auth.uid()) c where c.journey_id = p_journey_id;
end;
$$;

-- A journey's milestones (titles and states only), if you may see it.
create or replace function private.journey_view_milestones(p_journey_id uuid)
returns table (milestone_position integer, title text, state text, reached_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.assert_can_use_journeys();
  if not private.journey_viewable(auth.uid(), p_journey_id) then
    return;
  end if;
  return query
    select m.position, m.title, m.state, m.reached_at from public.journey_milestones m
    where m.journey_id = p_journey_id order by m.position;
end;
$$;

-- A journey's updates, newest first, with their tags and reactions. An update
-- is a Milestone when its milestone was reached within an hour of posting it
-- (the "Did [bird] …? Yes!" right after posting).
create or replace function private.journey_view_updates(p_journey_id uuid)
returns table (
  update_id uuid, has_clip boolean, caption text, is_question boolean, is_day_one boolean, is_milestone boolean,
  milestone_position integer, created_at timestamptz,
  great_job integer, been_there integer, rooting_for_you integer, love_this integer, mine text[]
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.assert_can_use_journeys();
  if not private.journey_viewable(auth.uid(), p_journey_id) then
    return;
  end if;
  return query
    select u.id, u.clip_ref is not null, u.caption, u.is_question, u.is_day_one,
           exists (select 1 from public.journey_milestones m
                   where m.journey_id = u.journey_id and m.position = u.milestone_position and m.state = 'reached'
                     and m.reached_at between u.created_at and u.created_at + interval '1 hour'),
           u.milestone_position, u.created_at,
           (select count(*)::integer from public.flock_reactions r where r.subject_type = 'journey_update' and r.subject_id = u.id and r.kind = 'great_job'),
           (select count(*)::integer from public.flock_reactions r where r.subject_type = 'journey_update' and r.subject_id = u.id and r.kind = 'been_there'),
           (select count(*)::integer from public.flock_reactions r where r.subject_type = 'journey_update' and r.subject_id = u.id and r.kind = 'rooting_for_you'),
           (select count(*)::integer from public.flock_reactions r where r.subject_type = 'journey_update' and r.subject_id = u.id and r.kind = 'love_this'),
           coalesce((select array_agg(r.kind order by r.kind) from public.flock_reactions r
                     where r.subject_type = 'journey_update' and r.subject_id = u.id and r.user_id = auth.uid()), '{}')
    from public.journey_updates u
    where u.journey_id = p_journey_id
    order by u.created_at desc;
end;
$$;

-- Milestones reached in journeys you follow, newest first, for Today's cards.
create or replace function private.journey_milestone_cards(p_limit integer)
returns table (
  journey_id uuid, milestone_id uuid, bird_id uuid, bird_name text, bird_has_photo boolean, skill text, owner_name text, owner_region text,
  milestone_position integer, total integer, title text, reached_at timestamptz, update_id uuid, caption text, has_clip boolean,
  great_job integer, been_there integer, rooting_for_you integer, love_this integer, mine text[]
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.assert_can_use_journeys();
  return query
    select c.journey_id, m.id, c.bird_id, c.bird_name, c.bird_has_photo, c.skill, c.owner_name, rg.name,
           m.position, c.total, m.title, m.reached_at, u.id, u.caption, coalesce(u.clip_ref is not null, false),
           (select count(*)::integer from public.flock_reactions r where r.subject_type = 'journey_milestone' and r.subject_id = m.id and r.kind = 'great_job'),
           (select count(*)::integer from public.flock_reactions r where r.subject_type = 'journey_milestone' and r.subject_id = m.id and r.kind = 'been_there'),
           (select count(*)::integer from public.flock_reactions r where r.subject_type = 'journey_milestone' and r.subject_id = m.id and r.kind = 'rooting_for_you'),
           (select count(*)::integer from public.flock_reactions r where r.subject_type = 'journey_milestone' and r.subject_id = m.id and r.kind = 'love_this'),
           coalesce((select array_agg(r.kind order by r.kind) from public.flock_reactions r
                     where r.subject_type = 'journey_milestone' and r.subject_id = m.id and r.user_id = auth.uid()), '{}')
    from private.journey_card_rows(auth.uid()) c
    join public.journey_milestones m on m.journey_id = c.journey_id and m.state = 'reached'
    left join public.flock_profiles fp on fp.user_id = c.owner_id
    left join public.regions rg on rg.slug = fp.region_slug
    left join lateral (
      select uu.id, uu.caption, uu.clip_ref from public.journey_updates uu
      where uu.journey_id = c.journey_id and uu.milestone_position = m.position and uu.created_at <= m.reached_at
      order by uu.created_at desc limit 1
    ) u on true
    where c.following
    order by m.reached_at desc
    limit least(greatest(coalesce(p_limit, 20), 1), 100);
end;
$$;

-- Clip references for a journey, only if you may see it. The server turns these
-- into short-lived signed playback links; nobody else gets a reference.
create or replace function private.journey_clip_refs(p_journey_id uuid, p_update_ids uuid[])
returns table (update_id uuid, clip_ref text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.assert_can_use_journeys();
  if not private.journey_viewable(auth.uid(), p_journey_id) then
    raise exception 'journey not found' using errcode = 'P0002';
  end if;
  return query
    select u.id, u.clip_ref from public.journey_updates u
    where u.journey_id = p_journey_id and u.clip_ref is not null
      and (p_update_ids is null or u.id = any (p_update_ids));
end;
$$;

revoke all on function private.journey_feed(text, integer) from public, anon;
revoke all on function private.journey_following() from public, anon;
revoke all on function private.journey_view(uuid) from public, anon;
revoke all on function private.journey_view_milestones(uuid) from public, anon;
revoke all on function private.journey_view_updates(uuid) from public, anon;
revoke all on function private.journey_milestone_cards(integer) from public, anon;
revoke all on function private.journey_clip_refs(uuid, uuid[]) from public, anon;
grant execute on function private.journey_feed(text, integer) to authenticated, service_role;
grant execute on function private.journey_following() to authenticated, service_role;
grant execute on function private.journey_view(uuid) to authenticated, service_role;
grant execute on function private.journey_view_milestones(uuid) to authenticated, service_role;
grant execute on function private.journey_view_updates(uuid) to authenticated, service_role;
grant execute on function private.journey_milestone_cards(integer) to authenticated, service_role;
grant execute on function private.journey_clip_refs(uuid, uuid[]) to authenticated, service_role;


-- 4) Following, reacting, deleting --------------------------------------------------------------

create or replace function private.journey_follow(p_journey_id uuid, p_follow boolean)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.assert_can_use_journeys();
  if not (private.journey_limits_for(auth.uid())).can_share then
    raise exception 'following journeys comes with Flock membership' using errcode = '42501';
  end if;
  if not private.journey_viewable(auth.uid(), p_journey_id) then
    raise exception 'journey not found' using errcode = 'P0002';
  end if;
  if p_follow then
    insert into public.journey_follows (journey_id, user_id) values (p_journey_id, auth.uid()) on conflict do nothing;
  else
    delete from public.journey_follows where journey_id = p_journey_id and user_id = auth.uid();
  end if;
  return (select count(*)::integer from public.journey_follows f where f.journey_id = p_journey_id);
end;
$$;

-- Great job, Been there, Rooting for you, Love this. On a journey update or a
-- reached milestone; the "Go [bird]" cheer is a Great job.
create or replace function private.journey_react(p_subject_type text, p_subject_id uuid, p_kind text, p_on boolean)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_journey uuid;
begin
  perform private.assert_can_use_journeys();
  if not (private.journey_limits_for(auth.uid())).can_share then
    raise exception 'reactions come with Flock membership' using errcode = '42501';
  end if;
  if p_kind is null or p_kind not in ('great_job', 'been_there', 'rooting_for_you', 'love_this') then
    raise exception 'unknown reaction' using errcode = '22023';
  end if;
  if p_subject_type = 'journey_update' then
    select u.journey_id into v_journey from public.journey_updates u where u.id = p_subject_id;
  elsif p_subject_type = 'journey_milestone' then
    select m.journey_id into v_journey from public.journey_milestones m where m.id = p_subject_id and m.state = 'reached';
  else
    raise exception 'unknown subject' using errcode = '22023';
  end if;
  if v_journey is null or not private.journey_viewable(auth.uid(), v_journey) then
    raise exception 'not found' using errcode = 'P0002';
  end if;
  if p_on then
    insert into public.flock_reactions (subject_type, subject_id, user_id, kind)
    values (p_subject_type, p_subject_id, auth.uid(), p_kind) on conflict do nothing;
  else
    delete from public.flock_reactions
    where subject_type = p_subject_type and subject_id = p_subject_id and user_id = auth.uid() and kind = p_kind;
  end if;
end;
$$;

-- Delete a journey: the bird's owner or whoever started it. Returns the clip
-- references so the server can remove the videos too; their reactions go with it.
create or replace function private.journey_delete(p_journey_id uuid)
returns table (clip_ref text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  j public.journeys;
  v_refs text[];
begin
  j := private.journey_for_member(p_journey_id);
  if not (private.has_bird_access(j.bird_id, auth.uid()) = 'owner' or j.created_by = auth.uid()) then
    raise exception 'only the bird''s owner or whoever started it can delete a journey' using errcode = '42501';
  end if;
  select coalesce(array_agg(u.clip_ref), '{}') into v_refs from public.journey_updates u where u.journey_id = j.id and u.clip_ref is not null;
  delete from public.flock_reactions r
  where (r.subject_type = 'journey_update' and r.subject_id in (select u.id from public.journey_updates u where u.journey_id = j.id))
     or (r.subject_type = 'journey_milestone' and r.subject_id in (select m.id from public.journey_milestones m where m.journey_id = j.id));
  -- A finished journey's skill stays on the bird's list; it just loses the link.
  delete from public.journeys where id = j.id;
  return query select unnest(v_refs);
end;
$$;

revoke all on function private.journey_follow(uuid, boolean) from public, anon;
revoke all on function private.journey_react(text, uuid, text, boolean) from public, anon;
revoke all on function private.journey_delete(uuid) from public, anon;
grant execute on function private.journey_follow(uuid, boolean) to authenticated, service_role;
grant execute on function private.journey_react(text, uuid, text, boolean) to authenticated, service_role;
grant execute on function private.journey_delete(uuid) to authenticated, service_role;


-- 5) Invoker wrappers the app calls -----------------------------------------------------------

create or replace function public.journey_feed(p_filter text default 'for_you', p_limit integer default 50)
returns table (
  journey_id uuid, bird_id uuid, bird_name text, bird_has_photo boolean, skill text, template_slug text, category text,
  template_tier text, status text, visibility text, started_at timestamptz, finished_at timestamptz,
  done integer, total integer, next_title text, owner_id uuid, owner_name text, followers integer, following boolean,
  is_mine boolean, last_activity timestamptz
) language sql stable security invoker set search_path = ''
as $$ select * from private.journey_feed(p_filter, p_limit); $$;

create or replace function public.journey_following()
returns table (
  journey_id uuid, bird_id uuid, bird_name text, bird_has_photo boolean, skill text, template_slug text, category text,
  template_tier text, status text, visibility text, started_at timestamptz, finished_at timestamptz,
  done integer, total integer, next_title text, owner_id uuid, owner_name text, followers integer, following boolean,
  is_mine boolean, last_activity timestamptz
) language sql stable security invoker set search_path = ''
as $$ select * from private.journey_following(); $$;

create or replace function public.journey_view(p_journey_id uuid)
returns table (
  journey_id uuid, bird_id uuid, bird_name text, bird_has_photo boolean, skill text, template_slug text, category text,
  template_tier text, status text, visibility text, started_at timestamptz, finished_at timestamptz,
  done integer, total integer, next_title text, owner_id uuid, owner_name text, followers integer, following boolean,
  is_mine boolean, last_activity timestamptz
) language sql stable security invoker set search_path = ''
as $$ select * from private.journey_view(p_journey_id); $$;

create or replace function public.journey_view_milestones(p_journey_id uuid)
returns table (milestone_position integer, title text, state text, reached_at timestamptz)
language sql stable security invoker set search_path = ''
as $$ select * from private.journey_view_milestones(p_journey_id); $$;

create or replace function public.journey_view_updates(p_journey_id uuid)
returns table (
  update_id uuid, has_clip boolean, caption text, is_question boolean, is_day_one boolean, is_milestone boolean,
  milestone_position integer, created_at timestamptz,
  great_job integer, been_there integer, rooting_for_you integer, love_this integer, mine text[]
) language sql stable security invoker set search_path = ''
as $$ select * from private.journey_view_updates(p_journey_id); $$;

create or replace function public.journey_milestone_cards(p_limit integer default 20)
returns table (
  journey_id uuid, milestone_id uuid, bird_id uuid, bird_name text, bird_has_photo boolean, skill text, owner_name text, owner_region text,
  milestone_position integer, total integer, title text, reached_at timestamptz, update_id uuid, caption text, has_clip boolean,
  great_job integer, been_there integer, rooting_for_you integer, love_this integer, mine text[]
) language sql stable security invoker set search_path = ''
as $$ select * from private.journey_milestone_cards(p_limit); $$;

create or replace function public.journey_clip_refs(p_journey_id uuid, p_update_ids uuid[] default null)
returns table (update_id uuid, clip_ref text)
language sql stable security invoker set search_path = ''
as $$ select * from private.journey_clip_refs(p_journey_id, p_update_ids); $$;

create or replace function public.journey_follow(p_journey_id uuid, p_follow boolean)
returns integer language sql volatile security invoker set search_path = ''
as $$ select private.journey_follow(p_journey_id, p_follow); $$;

create or replace function public.journey_react(p_subject_type text, p_subject_id uuid, p_kind text, p_on boolean)
returns void language sql volatile security invoker set search_path = ''
as $$ select private.journey_react(p_subject_type, p_subject_id, p_kind, p_on); $$;

create or replace function public.journey_delete(p_journey_id uuid)
returns table (clip_ref text) language sql volatile security invoker set search_path = ''
as $$ select * from private.journey_delete(p_journey_id); $$;

revoke all on function public.journey_feed(text, integer) from public, anon;
revoke all on function public.journey_following() from public, anon;
revoke all on function public.journey_view(uuid) from public, anon;
revoke all on function public.journey_view_milestones(uuid) from public, anon;
revoke all on function public.journey_view_updates(uuid) from public, anon;
revoke all on function public.journey_milestone_cards(integer) from public, anon;
revoke all on function public.journey_clip_refs(uuid, uuid[]) from public, anon;
revoke all on function public.journey_follow(uuid, boolean) from public, anon;
revoke all on function public.journey_react(text, uuid, text, boolean) from public, anon;
revoke all on function public.journey_delete(uuid) from public, anon;
grant execute on function public.journey_feed(text, integer) to authenticated, service_role;
grant execute on function public.journey_following() to authenticated, service_role;
grant execute on function public.journey_view(uuid) to authenticated, service_role;
grant execute on function public.journey_view_milestones(uuid) to authenticated, service_role;
grant execute on function public.journey_view_updates(uuid) to authenticated, service_role;
grant execute on function public.journey_milestone_cards(integer) to authenticated, service_role;
grant execute on function public.journey_clip_refs(uuid, uuid[]) to authenticated, service_role;
grant execute on function public.journey_follow(uuid, boolean) to authenticated, service_role;
grant execute on function public.journey_react(text, uuid, text, boolean) to authenticated, service_role;
grant execute on function public.journey_delete(uuid) to authenticated, service_role;
