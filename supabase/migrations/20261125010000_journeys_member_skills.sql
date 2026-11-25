-- Journeys redesign, part 3 (backlog 1.20c): member skills.
-- docs/flock/journeys-redesign.md, "Screens" 7 and 8 and "Edge cases".
--
-- "Your own skill" already takes a name and an optional description with no
-- steps (20261124190000_journeys_skills_data.sql). This adds "Skills from the
-- Flock": a Flock member's custom journey, shared with the community, with at
-- least one update, is findable at once (no review), labeled "Member-supplied
-- journey" wherever it appears, startable as a copy for your own bird, and
-- reportable through flock_report.
--
-- New (additive):
--   1. private.journey_is_member_skill(journey): custom, community, at least
--      one update that isn't hidden, and not hidden or removed itself.
--   2. journey_member_skills(q, limit): the search. Flock members (and
--      admins) only, through journey_viewable (so blocks, lapsed members and
--      "Just me" journeys are left out), never your own bird's journeys.
--   3. journey_start_member_skill(source, bird, rhythm, visibility): "Start
--      this skill". Copies the name and description into a new custom journey
--      (through journey_start, so every rule there applies) and records
--      source_journey_id. A bird that already has an open copy of that skill
--      gets that journey back instead.
--   4. journey_custom_about(journey): the description of a custom journey
--      you can see, whether it's a member skill, and "Started from [bird]'s
--      journey" while the source is visible to you (not deleted, hidden,
--      removed, made private or blocked).
--
-- Changed, Flock-only (rewritten from the live definitions with exact text
-- replacements, so every earlier patch, blocks included, is kept):
--   5. Reports and moderation take subject type 'journey' (a member skill):
--      the subject_type checks on flock_reports, flock_moderation and
--      flock_notifications; flock_report and flock_resolve_report accept it;
--      flock_subject_visible and flock_subject_owner know it; the review
--      queue lists it (the skill's name and description); a reviewer's notice
--      reaches the journey's creator.
--   6. journey_viewable leaves out a hidden or removed member skill for
--      everyone outside the bird's household, the same rule reported posts
--      follow. Only custom journeys can be reported, so nothing else changes.
--
-- Behind journeys_enabled() and flock_enabled() (admins only today). No
-- care-app table, policy, trigger or function changes. Pinned by
-- supabase/checks/journeys_member_skills_checks.sql.


-- 1) What counts as a member skill -------------------------------------------------------

create or replace function private.journey_is_member_skill(p_journey_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.journeys j
    where j.id = p_journey_id
      and j.template_id is null
      and j.visibility = 'community'
      and not private.flock_is_hidden('journey', j.id)
      and exists (select 1 from public.journey_updates u
                  where u.journey_id = j.id and not private.flock_is_hidden('journey_update', u.id))
  );
$$;

revoke all on function private.journey_is_member_skill(uuid) from public, anon;
grant execute on function private.journey_is_member_skill(uuid) to authenticated, service_role;


-- 2) Skills from the Flock: the search --------------------------------------------------

create or replace function private.journey_member_skills(p_q text, p_limit integer)
returns table (
  journey_id uuid, skill text, description text, bird_id uuid, bird_name text, bird_has_photo boolean,
  owner_id uuid, owner_name text, status text, updates integer, started_at timestamptz, last_activity timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_q text := lower(nullif(btrim(coalesce(p_q, '')), ''));
begin
  perform private.assert_can_use_journeys();
  if not (private.journey_limits_for(v_uid)).can_view_community then
    return;
  end if;
  return query
    select j.id, j.custom_name::text, j.custom_description, j.bird_id, b.name::text,
           private.journey_bird_photo_visible(v_uid, j.bird_id),
           j.created_by, fp.display_name::text, j.status::text,
           (select count(*)::integer from public.journey_updates u
             where u.journey_id = j.id and not private.flock_is_hidden('journey_update', u.id)),
           j.started_at,
           greatest(j.updated_at, (select max(u.created_at) from public.journey_updates u where u.journey_id = j.id))
    from public.journeys j
    join public.birds b on b.id = j.bird_id
    left join public.flock_profiles fp on fp.user_id = j.created_by
    where j.template_id is null
      and j.visibility = 'community'
      and private.has_bird_access(j.bird_id, v_uid) is null
      and private.journey_is_member_skill(j.id)
      and private.journey_viewable(v_uid, j.id)
      and (v_q is null or position(v_q in lower(j.custom_name || ' ' || coalesce(j.custom_description, ''))) > 0)
    order by 12 desc
    limit least(greatest(coalesce(p_limit, 30), 1), 60);
end;
$$;

revoke all on function private.journey_member_skills(text, integer) from public, anon;
grant execute on function private.journey_member_skills(text, integer) to authenticated, service_role;

create or replace function public.journey_member_skills(p_q text default null, p_limit integer default 30)
returns table (
  journey_id uuid, skill text, description text, bird_id uuid, bird_name text, bird_has_photo boolean,
  owner_id uuid, owner_name text, status text, updates integer, started_at timestamptz, last_activity timestamptz
)
language sql stable security invoker set search_path = ''
as $$ select * from private.journey_member_skills(p_q, p_limit); $$;

revoke all on function public.journey_member_skills(text, integer) from public, anon;
grant execute on function public.journey_member_skills(text, integer) to authenticated, service_role;


-- 3) "Start this skill" -------------------------------------------------------------------

create or replace function private.journey_start_member_skill(p_source_id uuid, p_bird_id uuid, p_rhythm text, p_visibility text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  s public.journeys;
  v_id uuid;
begin
  perform private.assert_can_use_journeys();
  select * into s from public.journeys j where j.id = p_source_id;
  if s.id is null or not private.journey_is_member_skill(s.id) or not private.journey_viewable(v_uid, s.id) then
    raise exception 'not found' using errcode = 'P0002';
  end if;
  if private.has_bird_access(p_bird_id, v_uid) is null then
    raise exception 'not your bird' using errcode = '42501';
  end if;
  -- One open copy of a member skill per bird: starting it again opens that one.
  select j.id into v_id from public.journeys j
  where j.bird_id = p_bird_id and j.source_journey_id = s.id and j.status in ('active', 'paused')
  order by j.started_at desc limit 1;
  if v_id is not null then
    return v_id;
  end if;

  v_id := private.journey_start(p_bird_id, null, s.custom_name, null, null, p_rhythm, p_visibility, null, s.custom_description);
  update public.journeys set source_journey_id = s.id where id = v_id;
  return v_id;
end;
$$;

revoke all on function private.journey_start_member_skill(uuid, uuid, text, text) from public, anon;
grant execute on function private.journey_start_member_skill(uuid, uuid, text, text) to authenticated, service_role;

create or replace function public.journey_start_member_skill(p_source_id uuid, p_bird_id uuid, p_rhythm text, p_visibility text default 'private')
returns uuid
language sql volatile security invoker set search_path = ''
as $$ select private.journey_start_member_skill(p_source_id, p_bird_id, p_rhythm, p_visibility); $$;

revoke all on function public.journey_start_member_skill(uuid, uuid, text, text) from public, anon;
grant execute on function public.journey_start_member_skill(uuid, uuid, text, text) to authenticated, service_role;


-- 4) A custom journey's description and "Started from" ----------------------------------------

create or replace function private.journey_custom_about(p_journey_id uuid)
returns table (description text, is_member_skill boolean, source_journey_id uuid, source_bird_name text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  j public.journeys;
  v_src uuid;
  v_src_bird text;
begin
  perform private.assert_can_use_journeys();
  select * into j from public.journeys x where x.id = p_journey_id;
  if j.id is null or j.template_id is not null or not private.journey_viewable(v_uid, j.id) then
    return;
  end if;
  if j.source_journey_id is not null
     and private.journey_viewable(v_uid, j.source_journey_id)
     and not private.flock_is_hidden('journey', j.source_journey_id) then
    select s.id, b.name::text into v_src, v_src_bird
    from public.journeys s join public.birds b on b.id = s.bird_id
    where s.id = j.source_journey_id;
  end if;
  return query select j.custom_description, private.journey_is_member_skill(j.id), v_src, v_src_bird;
end;
$$;

revoke all on function private.journey_custom_about(uuid) from public, anon;
grant execute on function private.journey_custom_about(uuid) to authenticated, service_role;

create or replace function public.journey_custom_about(p_journey_id uuid)
returns table (description text, is_member_skill boolean, source_journey_id uuid, source_bird_name text)
language sql stable security invoker set search_path = ''
as $$ select * from private.journey_custom_about(p_journey_id); $$;

revoke all on function public.journey_custom_about(uuid) from public, anon;
grant execute on function public.journey_custom_about(uuid) to authenticated, service_role;


-- 5) Reports and moderation take 'journey' --------------------------------------------------
--    The subject_type checks, rebuilt from their live definitions.

do $$
declare
  r record;
  v_def text;
begin
  for r in
    select c.conrelid::regclass::text as tbl, c.conname, pg_get_constraintdef(c.oid) as def
    from pg_constraint c
    where c.contype = 'c'
      and c.conrelid in ('public.flock_reports'::regclass, 'public.flock_moderation'::regclass, 'public.flock_notifications'::regclass)
      and pg_get_constraintdef(c.oid) like '%subject_type%'
      and pg_get_constraintdef(c.oid) like '%''journey_update''::text%'
  loop
    if position('''journey''::text' in r.def) > 0 then
      continue;
    end if;
    v_def := replace(r.def, '''journey_update''::text', '''journey_update''::text, ''journey''::text');
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
    execute format('alter table %s add constraint %I %s', r.tbl, r.conname, v_def);
  end loop;
end $$;

create or replace function private.journeys_member_skills_patch(p_sig text, p_pairs text[])
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_def text := pg_get_functiondef(p_sig::regprocedure);
  i integer;
begin
  if array_length(p_pairs, 1) % 2 <> 0 then
    raise exception 'journeys_member_skills_patch(%): pairs must come in twos', p_sig;
  end if;
  for i in 1 .. array_length(p_pairs, 1) by 2 loop
    if position(p_pairs[i] in v_def) = 0 then
      raise exception 'journeys_member_skills_patch(%): anchor not found: %', p_sig, p_pairs[i];
    end if;
    v_def := replace(v_def, p_pairs[i], p_pairs[i + 1]);
  end loop;
  execute v_def;
end;
$$;

revoke all on function private.journeys_member_skills_patch(text, text[]) from public, anon, authenticated;

-- Who may see a reported member skill: anyone who may see the journey.
select private.journeys_member_skills_patch('private.flock_subject_visible(uuid, text, uuid)', array[
  '  elsif p_type = ''journey_milestone'' then',
  '  elsif p_type = ''journey'' then
    return exists (select 1 from public.journeys jx where jx.id = p_id and jx.template_id is null and jx.visibility = ''community'')
       and private.journey_viewable(p_user_id, p_id);
  elsif p_type = ''journey_milestone'' then'
]);

-- A member skill's owner is whoever started the journey.
select private.journeys_member_skills_patch('private.flock_subject_owner(text, uuid)', array[
  'when ''journey_milestone'' then',
  'when ''journey'' then (select jx.created_by from public.journeys jx where jx.id = p_id)
    when ''journey_milestone'' then'
]);

select private.journeys_member_skills_patch('private.flock_report(text, uuid, text, text)', array[
  'p_subject_type not in (''post'', ''comment'', ''journey_update'')',
  'p_subject_type not in (''post'', ''comment'', ''journey_update'', ''journey'')'
]);

select private.journeys_member_skills_patch('private.flock_resolve_report(text, uuid, text, text)', array[
  'p_subject_type not in (''post'', ''comment'', ''journey_update'')',
  'p_subject_type not in (''post'', ''comment'', ''journey_update'', ''journey'')'
]);

-- The review queue shows a reported member skill's name and description.
select private.journeys_member_skills_patch('private.flock_review_queue(text)', array[
  'from public.journey_updates u where r.subject_type = ''journey_update'' and u.id = r.subject_id',
  'from public.journey_updates u where r.subject_type = ''journey_update'' and u.id = r.subject_id
      union all
      select jr.created_by, jr.custom_name::text, jr.custom_description, 0, null::uuid, jr.id
      from public.journeys jr where r.subject_type = ''journey'' and jr.id = r.subject_id'
]);

-- A reviewer's notice about a member skill reaches whoever started it, with the journey.
select private.journeys_member_skills_patch('private.flock_notifications_list(text, integer)', array[
  'left join public.journeys j on j.id = coalesce(ju.journey_id, jm.journey_id)',
  'left join public.journeys j on j.id = coalesce(ju.journey_id, jm.journey_id, case when g.subject_type = ''journey'' then g.subject_id end)',
  'or ju.author_id = auth.uid() or ev.created_by = auth.uid())',
  'or ju.author_id = auth.uid() or ev.created_by = auth.uid() or (g.subject_type = ''journey'' and j.created_by = auth.uid()))'
]);


-- 6) A hidden or removed member skill leaves the community ---------------------------------------

select private.journeys_member_skills_patch('private.journey_viewable(uuid, uuid)', array[
  'or (j.visibility = ''community''',
  'or (j.visibility = ''community''
            and not private.flock_is_hidden(''journey'', j.id)'
]);

drop function private.journeys_member_skills_patch(text, text[]);
