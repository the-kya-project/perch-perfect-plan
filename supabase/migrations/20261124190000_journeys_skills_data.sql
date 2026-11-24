-- Journeys redesign, part 1 (backlog 1.20a): skills, not milestones. The data
-- side of docs/flock/journeys-redesign.md ("Data" and "Existing templates and
-- started journeys"). Screens come in 1.20b, member skills in 1.20c, diet
-- conversion's starting-weight rework in 1.20d.
--
-- What changes:
--   1. New nullable columns: journey_templates.video_ref (a "cfstream:<uid>"
--      skill video, none at opening), journeys.custom_description (the
--      owner's words for their own skill, up to 500 characters),
--      journeys.source_journey_id (the member skill a copy was started from;
--      1.20c fills it), journey_updates.is_big_moment ("This was a big
--      moment", replacing milestone sharing).
--   2. private.update_journey_template (admin_update_journey_template) also
--      takes video_ref.
--   3. Template text is rewritten as draft through admin_update_journey_template,
--      only on templates still in draft: purpose = the spec's short
--      description, safety_notes = the shared three lines plus the skill's own
--      (nail trims keep theirs exactly), tips cleared, and diet conversion's
--      five protective lines moved into safety_notes. done_when,
--      suggested_first, typical_length and safeguards are left as they are
--      and no longer used.
--   4. journey_start: every template can be started by everyone (the stored
--      tier no longer locks anything; gating moves to the community features),
--      new journeys get no milestone rows, a custom journey needs only a name
--      (and takes an optional description), not 3 to 8 milestones.
--      p_custom_milestones and p_already are still accepted, and ignored, so
--      today's screens keep calling it until 1.20b.
--   5. journey_finish(journey, 'learned' | 'happy_where_we_are') ends a
--      journey. 'learned' adds the skill to bird_skills (source 'journey'),
--      except diet conversion, which adds no known skill. journey_reach_milestone
--      no longer finishes a journey; it only marks a milestone on the journeys
--      that still have them (history), until 1.20b stops calling it.
--   6. journey_post_update takes p_big_moment (default false).
--
-- Kept: journey_template_milestones and journey_milestones as history; every
-- journey, update, clip, comment and reaction; the one-open-journey-per-
-- template rule; the free plan's one open custom journey and clip limits;
-- "Just me" only for free accounts; the lory/lorikeet block (a trigger on
-- journeys, untouched); every journey_settings number. Diet conversion's
-- weight check already measures the first week after the start when a journey
-- has no milestone 1, which is the spec's starting weight, so it pauses
-- exactly as before.
--
-- Behind journeys_enabled() (admins only today). No care-app table, policy,
-- trigger or function changes. Pinned by supabase/checks/journeys_checks.sql,
-- journey_updates_checks.sql and journeys_skills_data_checks.sql.


-- 1) New columns ---------------------------------------------------------------------

alter table public.journey_templates
  add column if not exists video_ref text
    check (video_ref is null or video_ref ~ '^cfstream:[A-Za-z0-9]{8,64}$');

comment on column public.journey_templates.video_ref is
  'Optional short skill video, "cfstream:<uid>" (the Cloudflare clip pipeline). None at opening. Set with admin_update_journey_template(slug, ''{"video_ref": "cfstream:…"}'').';
comment on column public.journey_templates.done_when is
  'Unused since the journeys redesign (1.20a). Kept, not shown.';
comment on column public.journey_templates.suggested_first is
  'Unused since the journeys redesign (1.20a). Kept, not shown.';
comment on column public.journey_templates.typical_length is
  'Unused since the journeys redesign (1.20a). Kept, not shown.';

alter table public.journeys
  add column if not exists custom_description text
    check (custom_description is null or length(btrim(custom_description)) between 1 and 500),
  add column if not exists source_journey_id uuid references public.journeys(id) on delete set null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'journeys_source_is_custom' and conrelid = 'public.journeys'::regclass) then
    alter table public.journeys
      add constraint journeys_source_is_custom
      check (source_journey_id is null or template_id is null);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'journeys_description_is_custom' and conrelid = 'public.journeys'::regclass) then
    alter table public.journeys
      add constraint journeys_description_is_custom
      check (custom_description is null or template_id is null);
  end if;
end $$;

create index if not exists journeys_source_idx on public.journeys (source_journey_id) where source_journey_id is not null;

comment on column public.journeys.custom_description is
  'Your own skill: a short description in the owner''s words (up to 500 characters).';
comment on column public.journeys.source_journey_id is
  'The member skill (another custom journey) this one was started from. Set null when the source is deleted.';

alter table public.journey_updates
  add column if not exists is_big_moment boolean not null default false;

comment on column public.journey_updates.is_big_moment is
  '"This was a big moment": replaces milestone sharing (Today cards, sharing, share cards).';


-- 2) The admin edit function takes video_ref ----------------------------------------------

create or replace function private.update_journey_template(p_slug text, p_fields jsonb)
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
    if v_key not in ('name', 'purpose', 'done_when', 'suggested_first', 'typical_length', 'safety_notes', 'safeguards', 'tips', 'review_status', 'video_ref') then
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
    video_ref       = case when p_fields ? 'video_ref' then p_fields ->> 'video_ref' else t.video_ref end,
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

revoke all on function private.update_journey_template(text, jsonb) from public, anon;
grant execute on function private.update_journey_template(text, jsonb) to authenticated, service_role;


-- 3) Template text: the spec's "Skill content" (DRAFT, for Brittany's copy review) ----------
--    Through admin_update_journey_template, and only where the template is still
--    a draft, so anything Brittany has approved is left alone.

do $$
declare
  shared constant text[] := array[
    'Keep sessions short.',
    'Stop at the first sign of stress.',
    'Never withhold food to make a bird hungrier for training.'
  ];
  r record;
  v_fields jsonb;
begin
  for r in
    select * from (values
      ('scale-training',
       'Your bird steps onto the scale calmly and stays still long enough for an accurate weight, so daily weigh-ins become easy.',
       array[]::text[]),
      ('wing-touch',
       'Your bird is comfortable having its wings touched and gently opened, the way a vet does during an exam, and it stays relaxed the whole time.',
       array['Keep touches brief, because long body contact can trigger hormonal behavior.',
             'Never pull a wing that resists.',
             'If your bird has an injury, arthritis, or a wing that doesn''t open fully, ask your avian vet what''s comfortable first.']),
      ('carrier-comfort',
       'Your bird walks into its carrier on its own and stays relaxed inside, so vet trips and travel start calmly.',
       array[]::text[]),
      ('nail-trims',
       'Your bird stays calm while its nails are trimmed, without being wrapped in a towel.',
       null),
      ('stationing',
       'Your bird goes to a chosen perch and stays there while you move around the room. It''s especially helpful for birds that never want to leave your side.',
       array[]::text[]),
      ('target-training',
       'Your bird touches the tip of a stick and follows it, which gives you a gentle way to guide your bird almost anywhere.',
       array[]::text[]),
      ('step-up',
       'Your bird steps onto your hand calmly and by choice, without biting.',
       array[]::text[]),
      ('recall',
       'Your bird comes to you when you call its name, whether that means flying across the room or walking along a perch. It''s the most important safety skill if your bird ever gets out.',
       array[]::text[]),
      ('diet-conversion',
       'Your bird moves gradually from a seed-heavy diet to pellets, chop, and fresh foods while its weight stays steady.',
       array['Watch droppings and appetite as well as weight. If your bird stops eating, put the usual food back and call your vet.',
             'Some birds refuse new food so firmly that they stop eating. If your bird isn''t eating, go back to the usual food today and call your vet.',
             'Weigh in grams at the same time every day. A few grams matter on a bird.',
             'Take uneaten fresh food out after a few hours so it doesn''t spoil.',
             'How much to feed varies from bird to bird, even within a species. Your vet can tell you what''s right for yours.']),
      ('wave',
       'Your bird lifts one foot and waves it on cue.',
       array[]::text[]),
      ('high-five',
       'Your bird touches its raised foot to your open palm.',
       array[]::text[]),
      ('spin',
       'Your bird turns a full circle on its perch on cue.',
       array['Skip this one, or keep it very small, for birds with balance, grip, or leg problems.']),
      ('retrieve',
       'Your bird picks up a small ball and drops it into your hand.',
       array['Use objects too big to swallow, with no small parts or paint that could chip.']),
      ('hang-upside-down',
       'Your bird hangs upside down from your finger or a perch on cue, which turns a natural play behavior into a trick.',
       array['Skip this one for birds with balance, grip, or leg problems, and practice over a soft surface.'])
    ) as x(slug, purpose, own_notes)
  loop
    if not exists (select 1 from public.journey_templates t where t.slug = r.slug and t.review_status = 'draft') then
      continue;
    end if;
    v_fields := jsonb_build_object('purpose', r.purpose, 'tips', '[]'::jsonb, 'review_status', 'draft');
    -- Nail trims keep their current safety notes exactly (own_notes null).
    if r.own_notes is not null then
      v_fields := v_fields || jsonb_build_object('safety_notes', to_jsonb(shared || r.own_notes));
    end if;
    perform public.admin_update_journey_template(r.slug, v_fields);
  end loop;
end $$;


-- 4) Starting a journey: every skill, no milestones ---------------------------------------

drop function if exists public.journey_start(uuid, text, text, text[], integer[], text, text, text);
drop function if exists private.journey_start(uuid, text, text, text[], integer[], text, text, text);

-- p_template_slug for one of the 14 skills, or p_custom_name (+ optional
-- p_custom_description) for the owner's own. p_custom_milestones and p_already
-- are ignored (kept so today's screens keep working until 1.20b).
-- p_day_one_clip: "cfstream:<uid>" registered to this bird.
create or replace function private.journey_start(
  p_bird_id            uuid,
  p_template_slug      text,
  p_custom_name        text,
  p_custom_milestones  text[],
  p_already            integer[],
  p_rhythm             text,
  p_visibility         text,
  p_day_one_clip       text,
  p_custom_description text
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
  v_desc text := nullif(btrim(coalesce(p_custom_description, '')), '');
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
    if v_desc is not null then
      raise exception 'only your own skill takes a description' using errcode = '22023';
    end if;
    select * into t from public.journey_templates where slug = p_template_slug;
    if t.id is null then
      raise exception 'template not found' using errcode = 'P0002';
    end if;
    if exists (select 1 from public.journeys j where j.bird_id = p_bird_id and j.template_id = t.id and j.status in ('active', 'paused')) then
      raise exception 'this bird already has this journey going' using errcode = '23505';
    end if;
  else
    if length(btrim(p_custom_name)) not between 1 and 60 then
      raise exception 'give your journey a name (up to 60 characters)' using errcode = '22023';
    end if;
    if v_desc is not null and length(v_desc) > 500 then
      raise exception 'keep the description under 500 characters' using errcode = '22023';
    end if;
    if l.max_open_custom is not null then
      select count(*)::integer into v_open from public.journeys j
      where j.created_by = v_uid and j.template_id is null and j.status in ('active', 'paused');
      if v_open >= l.max_open_custom then
        raise exception 'one custom journey at a time on the free plan' using errcode = '42501';
      end if;
    end if;
  end if;

  if p_day_one_clip is not null then
    if p_day_one_clip !~ '^cfstream:[A-Za-z0-9]{8,64}$' or not exists (
      select 1 from public.clip_assets c where c.uid = substring(p_day_one_clip from 10) and c.bird_id = p_bird_id
    ) then
      raise exception 'that clip is not for this bird' using errcode = '42501';
    end if;
  end if;

  insert into public.journeys (bird_id, created_by, template_id, custom_name, custom_description, visibility, rhythm)
  values (p_bird_id, v_uid, t.id, case when t.id is null then btrim(p_custom_name) end,
          case when t.id is null then v_desc end, p_visibility, p_rhythm)
  returning id into v_id;

  if p_day_one_clip is not null then
    insert into public.journey_updates (journey_id, bird_id, author_id, clip_ref, is_day_one)
    values (v_id, p_bird_id, v_uid, p_day_one_clip, true);
  end if;

  return v_id;
end;
$$;

revoke all on function private.journey_start(uuid, text, text, text[], integer[], text, text, text, text) from public, anon;
grant execute on function private.journey_start(uuid, text, text, text[], integer[], text, text, text, text) to authenticated, service_role;

create or replace function public.journey_start(
  p_bird_id uuid, p_template_slug text default null, p_custom_name text default null,
  p_custom_milestones text[] default null, p_already integer[] default null,
  p_rhythm text default null, p_visibility text default 'private', p_day_one_clip text default null,
  p_custom_description text default null
)
returns uuid
language sql volatile security invoker set search_path = ''
as $$ select private.journey_start(p_bird_id, p_template_slug, p_custom_name, p_custom_milestones, p_already, p_rhythm, p_visibility, p_day_one_clip, p_custom_description); $$;

revoke all on function public.journey_start(uuid, text, text, text[], integer[], text, text, text, text) from public, anon;
grant execute on function public.journey_start(uuid, text, text, text[], integer[], text, text, text, text) to authenticated, service_role;


-- 5) Finishing: "[Bird] learned it!" or "We're happy where we are" -----------------------------

-- 'learned' needs an active journey, or one the member paused (a weight pause
-- lifts only through journey_resume_after_vet). 'happy_where_we_are' works
-- from active or paused, as journey_set_status always allowed. Returns the
-- journey's new status.
create or replace function private.journey_finish(p_journey_id uuid, p_how text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  j public.journeys;
  v_slug text;
  v_name text;
  v_status text;
begin
  j := private.journey_for_member(p_journey_id);
  if p_how is null or p_how not in ('learned', 'happy_where_we_are') then
    raise exception 'finish as learned or happy_where_we_are' using errcode = '22023';
  end if;
  if exists (select 1 from public.birds b where b.id = j.bird_id and b.passed_at is not null) then
    raise exception 'this bird has passed' using errcode = '22023';
  end if;
  if j.status not in ('active', 'paused') then
    raise exception 'this journey is finished' using errcode = '22023';
  end if;
  if p_how = 'learned' and j.paused_reason = 'weight_drop' then
    raise exception 'confirm you''ve called your avian vet first' using errcode = '42501';
  end if;

  v_status := case when p_how = 'learned' then 'finished' else 'happy_where_we_are' end;
  update public.journeys set
    status = v_status, finished_at = now(), paused_at = null, paused_reason = null, updated_at = now()
  where id = j.id;

  if p_how = 'learned' then
    select t.slug, t.name into v_slug, v_name from public.journey_templates t where t.id = j.template_id;
    -- Diet conversion finishes as "[Bird] is on the new diet": no known skill.
    if v_slug is distinct from 'diet-conversion' then
      v_name := coalesce(v_name, j.custom_name);
      insert into public.bird_skills (bird_id, name, template_id, source, journey_id, added_by)
      values (j.bird_id, v_name, j.template_id, 'journey', j.id, auth.uid())
      on conflict (bird_id, (lower(btrim(name)))) do update
        set source = 'journey', journey_id = excluded.journey_id, template_id = coalesce(public.bird_skills.template_id, excluded.template_id);
    end if;
  end if;

  return v_status;
end;
$$;

revoke all on function private.journey_finish(uuid, text) from public, anon;
grant execute on function private.journey_finish(uuid, text) to authenticated, service_role;

create or replace function public.journey_finish(p_journey_id uuid, p_how text)
returns text
language sql volatile security invoker set search_path = ''
as $$ select private.journey_finish(p_journey_id, p_how); $$;

revoke all on function public.journey_finish(uuid, text) from public, anon;
grant execute on function public.journey_finish(uuid, text) to authenticated, service_role;

-- Milestones are history now: marking one never finishes the journey. Kept for
-- the journeys that still have milestone rows until 1.20b stops calling it.
create or replace function private.journey_reach_milestone(p_journey_id uuid, p_position integer)
returns table (finished boolean, done integer, total integer)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  j public.journeys;
begin
  j := private.journey_for_member(p_journey_id);
  if j.status <> 'active' then
    raise exception 'this journey isn''t active' using errcode = '22023';
  end if;
  update public.journey_milestones m set state = 'reached', reached_at = now()
  where m.journey_id = j.id and m.position = p_position and m.state = 'todo';
  if not found and not exists (select 1 from public.journey_milestones m where m.journey_id = j.id and m.position = p_position) then
    raise exception 'milestone not found' using errcode = 'P0002';
  end if;

  return query
    select false,
           (select count(*)::integer from public.journey_milestones m where m.journey_id = j.id and m.state <> 'todo'),
           (select count(*)::integer from public.journey_milestones m where m.journey_id = j.id);
end;
$$;

revoke all on function private.journey_reach_milestone(uuid, integer) from public, anon;
grant execute on function private.journey_reach_milestone(uuid, integer) to authenticated, service_role;


-- 6) Posting an update: "This was a big moment" ----------------------------------------------

drop function if exists public.journey_post_update(uuid, text, text, text);
drop function if exists private.journey_post_update(uuid, text, text, text);

create or replace function private.journey_post_update(p_journey_id uuid, p_clip_ref text, p_engagement text, p_caption text, p_big_moment boolean)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  j public.journeys;
  l public.journey_limits;
  v_used integer;
  v_caption text := nullif(btrim(coalesce(p_caption, '')), '');
  v_next integer;
  v_id uuid;
begin
  j := private.journey_for_member(p_journey_id);
  if j.status <> 'active' then
    raise exception 'this journey isn''t active' using errcode = '22023';
  end if;
  if p_engagement is null or p_engagement not in ('all_in', 'distracted', 'not_today') then
    raise exception 'how into it was your bird?' using errcode = '22023';
  end if;
  if v_caption is not null and length(v_caption) > 1000 then
    raise exception 'keep it under 1,000 characters' using errcode = '22023';
  end if;
  if p_clip_ref is null or p_clip_ref !~ '^cfstream:[A-Za-z0-9]{8,64}$' or not exists (
    select 1 from public.clip_assets c where c.uid = substring(p_clip_ref from 10) and c.bird_id = j.bird_id
  ) then
    raise exception 'that clip is not for this bird' using errcode = '42501';
  end if;

  l := private.journey_limits_for(auth.uid());
  select count(*)::integer into v_used from public.journey_updates u where u.journey_id = j.id and u.clip_ref is not null;
  if l.max_clips_per_journey is not null and v_used >= l.max_clips_per_journey then
    raise exception 'this journey has reached its clip limit' using errcode = '42501';
  end if;

  -- Journeys that still have milestone rows (history) keep recording which one was next.
  select min(m.position) into v_next from public.journey_milestones m where m.journey_id = j.id and m.state = 'todo';

  insert into public.journey_updates (journey_id, bird_id, author_id, clip_ref, engagement, caption, is_question, milestone_position, is_big_moment)
  values (j.id, j.bird_id, auth.uid(), p_clip_ref, p_engagement, v_caption, coalesce(v_caption like '%?%', false), v_next, coalesce(p_big_moment, false))
  returning id into v_id;
  update public.journeys set updated_at = now() where id = j.id;
  return v_id;
end;
$$;

revoke all on function private.journey_post_update(uuid, text, text, text, boolean) from public, anon;
grant execute on function private.journey_post_update(uuid, text, text, text, boolean) to authenticated, service_role;

create or replace function public.journey_post_update(p_journey_id uuid, p_clip_ref text, p_engagement text, p_caption text default null, p_big_moment boolean default false)
returns uuid
language sql volatile security invoker set search_path = ''
as $$ select private.journey_post_update(p_journey_id, p_clip_ref, p_engagement, p_caption, p_big_moment); $$;

revoke all on function public.journey_post_update(uuid, text, text, text, boolean) from public, anon;
grant execute on function public.journey_post_update(uuid, text, text, text, boolean) to authenticated, service_role;
