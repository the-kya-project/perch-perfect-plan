-- The Flock, step 3 (PR B): posting updates, milestones, finishing, and Diet
-- conversion's weight safeguard. Additive only: new columns on the journey
-- tables from 20261107200000, new tables and functions. No care-app table,
-- policy, trigger or function changes; weight_entries is read, never written.
--
-- Writes still go only through SECURITY DEFINER functions in private (invoker
-- wrappers in public). Bird access is the care app's: owner or household
-- (private.has_bird_access). Tier rules come from private.journey_tier /
-- journey_limits (clip limits) and can_share (sharing with the community).
--
-- Diet conversion's weight safeguard (thresholds are settings, not code):
--   journey_settings.diet_pause_drop_pct  (default 5)   → pause the journey
--   journey_settings.diet_notice_drop_pct (default 2.5) → a heads-up, no pause
-- measured against the bird's starting weight: the average of the weigh-ins
-- during milestone 1's week (from the start until milestone 1 is reached, at
-- most 7 days; the 7 days before the start when milestone 1 was "already").
-- A paused journey resumes only through journey_resume_after_vet(), which
-- records that the member put the usual food back and called their avian vet,
-- and re-bases on the latest weight. AN AVIAN VET MUST CONFIRM THESE NUMBERS
-- BEFORE LAUNCH.


-- 1) Settings -------------------------------------------------------------------------

alter table public.journey_settings
  add column if not exists diet_pause_drop_pct  numeric not null default 5   check (diet_pause_drop_pct > 0 and diet_pause_drop_pct < 50),
  add column if not exists diet_notice_drop_pct numeric not null default 2.5 check (diet_notice_drop_pct > 0 and diet_notice_drop_pct < 50);

comment on column public.journey_settings.diet_pause_drop_pct is
  'Diet conversion pauses when weight is this many percent below the starting weight. Draft; an avian vet must confirm before launch.';
comment on column public.journey_settings.diet_notice_drop_pct is
  'Diet conversion shows a heads-up (no pause) at this drop. Matches the care app''s amber weight trend (2.5%).';

-- Change either without a deploy:
--   select public.admin_set_diet_thresholds(5, 2.5);
create or replace function private.set_diet_thresholds(p_pause numeric, p_notice numeric)
returns public.journey_settings
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_row public.journey_settings;
begin
  perform private.assert_entitlement_admin();
  if p_pause is null or p_notice is null or p_notice >= p_pause then
    raise exception 'the heads-up must come before the pause' using errcode = '22023';
  end if;
  update public.journey_settings
     set diet_pause_drop_pct = p_pause, diet_notice_drop_pct = p_notice, updated_at = now(), updated_by = auth.uid()
   where id
  returning * into v_row;
  return v_row;
end;
$$;

revoke all on function private.set_diet_thresholds(numeric, numeric) from public, anon;
grant execute on function private.set_diet_thresholds(numeric, numeric) to authenticated, service_role;

create or replace function public.admin_set_diet_thresholds(p_pause numeric, p_notice numeric)
returns public.journey_settings
language sql volatile security invoker set search_path = ''
as $$ select * from private.set_diet_thresholds(p_pause, p_notice); $$;

revoke all on function public.admin_set_diet_thresholds(numeric, numeric) from public, anon;
grant execute on function public.admin_set_diet_thresholds(numeric, numeric) to authenticated, service_role;


-- 2) New columns ------------------------------------------------------------------------

-- "Did [bird] [ask]?" after posting, and "[Bird] [done_line]!" when it's reached.
-- Draft wording; edit with admin_set_journey_milestone_words().
alter table public.journey_template_milestones
  add column if not exists ask       text check (ask is null or length(ask) between 1 and 200),
  add column if not exists done_line text check (done_line is null or length(done_line) between 1 and 200);

alter table public.journeys
  add column if not exists paused_reason          text check (paused_reason is null or paused_reason in ('member', 'weight_drop')),
  add column if not exists vet_confirmed_at       timestamptz,
  -- After a vet-confirmed resume, drops are measured from this weight instead.
  add column if not exists weight_baseline_grams  numeric;

alter table public.journey_milestones
  -- Shared with the community from the celebration screen (members only).
  add column if not exists shared_at timestamptz;

alter table public.journey_updates
  add column if not exists engagement         text check (engagement is null or engagement in ('all_in', 'distracted', 'not_today')),
  add column if not exists caption            text check (caption is null or length(caption) <= 1000),
  add column if not exists is_question        boolean not null default false,
  -- The milestone being worked on when this was posted.
  add column if not exists milestone_position integer;


-- 3) Finisher tips and next-time tips ----------------------------------------------------

-- "What would you tell someone just starting?" One per finished journey.
create table if not exists public.journey_finisher_tips (
  journey_id  uuid primary key references public.journeys(id) on delete cascade,
  template_id uuid references public.journey_templates(id) on delete set null,
  author_id   uuid not null references auth.users(id) on delete cascade,
  body        text not null check (length(btrim(body)) between 1 and 500),
  created_at  timestamptz not null default now()
);
create index if not exists journey_finisher_tips_template_idx on public.journey_finisher_tips (template_id, created_at desc);

alter table public.journey_finisher_tips enable row level security;
revoke all on public.journey_finisher_tips from anon, authenticated;
grant select, insert, update, delete on public.journey_finisher_tips to service_role;
-- Read only through journey_finisher_tips_for() (premium read-only, members).
drop policy if exists "journey_finisher_tips no direct access" on public.journey_finisher_tips;
create policy "journey_finisher_tips no direct access" on public.journey_finisher_tips
  for select to authenticated using (false);

-- Shown after a "Distracted" or "Not today" day. Never suggest withholding food.
create table if not exists public.journey_tips (
  id         uuid primary key default gen_random_uuid(),
  body       text not null unique check (length(btrim(body)) between 1 and 300),
  sort_order integer not null default 0,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.journey_tips enable row level security;
revoke all on public.journey_tips from anon, authenticated;
grant select on public.journey_tips to authenticated;
grant select, insert, update, delete on public.journey_tips to service_role;
drop policy if exists "journey_tips read" on public.journey_tips;
create policy "journey_tips read" on public.journey_tips
  for select to authenticated
  using (active and private.can_use_journeys((select auth.uid())));

insert into public.journey_tips (body, sort_order) values
  ('Try a session right before breakfast. Most birds care a lot more about treats when they''re a little hungry.', 10),
  ('Find the treat your bird loves most, and save it just for training.', 20),
  ('If this step feels hard, spend a session on target training instead. Ending on something easy keeps it fun.', 30),
  ('Keep it to a few minutes, and stop while your bird still wants more.', 40),
  ('Try a quieter room or a different time of day. Fewer distractions make a big difference.', 50)
on conflict (body) do nothing;


-- 4) Helpers ----------------------------------------------------------------------------

-- The journey, if the caller may write to it (journeys on, access to the bird).
create or replace function private.journey_for_member(p_journey_id uuid)
returns public.journeys
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  j public.journeys;
begin
  perform private.assert_can_use_journeys();
  select * into j from public.journeys where id = p_journey_id;
  if j.id is null or private.has_bird_access(j.bird_id, auth.uid()) is null then
    raise exception 'journey not found' using errcode = 'P0002';
  end if;
  return j;
end;
$$;

revoke all on function private.journey_for_member(uuid) from public, anon;
grant execute on function private.journey_for_member(uuid) to authenticated, service_role;


-- 5) Post an update -----------------------------------------------------------------------

create or replace function private.journey_post_update(p_journey_id uuid, p_clip_ref text, p_engagement text, p_caption text)
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

  select min(m.position) into v_next from public.journey_milestones m where m.journey_id = j.id and m.state = 'todo';

  insert into public.journey_updates (journey_id, bird_id, author_id, clip_ref, engagement, caption, is_question, milestone_position)
  values (j.id, j.bird_id, auth.uid(), p_clip_ref, p_engagement, v_caption, coalesce(v_caption like '%?%', false), v_next)
  returning id into v_id;
  update public.journeys set updated_at = now() where id = j.id;
  return v_id;
end;
$$;

revoke all on function private.journey_post_update(uuid, text, text, text) from public, anon;
grant execute on function private.journey_post_update(uuid, text, text, text) to authenticated, service_role;


-- 6) Milestones, finishing, and the finisher tip -------------------------------------------

-- Mark a milestone reached ("Yes!"). The last one finishes the journey: status
-- finished, the skill goes on the bird's list. Returns where things stand.
create or replace function private.journey_reach_milestone(p_journey_id uuid, p_position integer)
returns table (finished boolean, done integer, total integer)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  j public.journeys;
  v_left integer;
  v_name text;
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

  select count(*) filter (where m.state = 'todo') into v_left from public.journey_milestones m where m.journey_id = j.id;
  if v_left = 0 then
    update public.journeys set status = 'finished', finished_at = now(), updated_at = now() where id = j.id;
    select coalesce(t.name, j.custom_name) into v_name from public.journey_templates t where t.id = j.template_id;
    v_name := coalesce(v_name, j.custom_name);
    insert into public.bird_skills (bird_id, name, template_id, source, journey_id, added_by)
    values (j.bird_id, v_name, j.template_id, 'journey', j.id, auth.uid())
    on conflict (bird_id, (lower(btrim(name)))) do update
      set source = 'journey', journey_id = excluded.journey_id, template_id = coalesce(public.bird_skills.template_id, excluded.template_id);
  end if;

  return query
    select v_left = 0,
           (select count(*)::integer from public.journey_milestones m where m.journey_id = j.id and m.state <> 'todo'),
           (select count(*)::integer from public.journey_milestones m where m.journey_id = j.id);
end;
$$;

create or replace function private.journey_save_finisher_tip(p_journey_id uuid, p_body text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  j public.journeys;
  v_body text := btrim(coalesce(p_body, ''));
begin
  j := private.journey_for_member(p_journey_id);
  if j.status <> 'finished' then
    raise exception 'finish the journey first' using errcode = '22023';
  end if;
  if length(v_body) not between 1 and 500 then
    raise exception 'a tip needs a few words (up to 500 characters)' using errcode = '22023';
  end if;
  insert into public.journey_finisher_tips (journey_id, template_id, author_id, body)
  values (j.id, j.template_id, auth.uid(), v_body)
  on conflict (journey_id) do update set body = excluded.body, author_id = excluded.author_id, created_at = now();
end;
$$;

-- "From members who've done this": tips for a template. App premium reads them,
-- Flock members too; free accounts get none. Display name only for authors
-- with a Community profile; never anything from the care app.
create or replace function private.journey_finisher_tips_for(p_template_slug text)
returns table (body text, display_name text, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  l public.journey_limits;
begin
  perform private.assert_can_use_journeys();
  l := private.journey_limits_for(auth.uid());
  if not l.can_view_community then
    return;
  end if;
  return query
    select f.body, p.display_name, f.created_at
    from public.journey_finisher_tips f
    join public.journey_templates t on t.id = f.template_id
    left join public.flock_profiles p on p.user_id = f.author_id
    where t.slug = p_template_slug
    order by f.created_at desc
    limit 10;
end;
$$;

-- Share a reached milestone with the community (Flock members only).
create or replace function private.journey_share_milestone(p_journey_id uuid, p_position integer)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  j public.journeys;
begin
  j := private.journey_for_member(p_journey_id);
  if not (private.journey_limits_for(auth.uid())).can_share then
    raise exception 'sharing with the community comes with Flock membership' using errcode = '42501';
  end if;
  update public.journey_milestones m set shared_at = coalesce(m.shared_at, now())
  where m.journey_id = j.id and m.position = p_position and m.state = 'reached';
  if not found then
    raise exception 'milestone not reached yet' using errcode = '22023';
  end if;
end;
$$;

-- Who sees it: the community only for Flock members.
create or replace function private.journey_set_visibility(p_journey_id uuid, p_visibility text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  j public.journeys;
begin
  j := private.journey_for_member(p_journey_id);
  if p_visibility is null or p_visibility not in ('community', 'private') then
    raise exception 'choose who sees it' using errcode = '22023';
  end if;
  if p_visibility = 'community' and not (private.journey_limits_for(auth.uid())).can_share then
    raise exception 'sharing with the community comes with Flock membership' using errcode = '42501';
  end if;
  update public.journeys set visibility = p_visibility, updated_at = now() where id = j.id;
end;
$$;

-- Pause, resume, or "We're happy where we are". A weight pause only lifts
-- through journey_resume_after_vet().
create or replace function private.journey_set_status(p_journey_id uuid, p_status text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  j public.journeys;
begin
  j := private.journey_for_member(p_journey_id);
  if p_status is null or p_status not in ('active', 'paused', 'happy_where_we_are') then
    raise exception 'unknown status' using errcode = '22023';
  end if;
  if j.status = 'finished' then
    raise exception 'this journey is finished' using errcode = '22023';
  end if;
  if p_status = 'active' and j.paused_reason = 'weight_drop' then
    raise exception 'confirm you''ve called your avian vet first' using errcode = '42501';
  end if;
  update public.journeys set
    status = p_status,
    paused_at = case when p_status = 'paused' then now() else null end,
    paused_reason = case when p_status = 'paused' then 'member' else null end,
    finished_at = case when p_status = 'happy_where_we_are' then now() else finished_at end,
    updated_at = now()
  where id = j.id;
end;
$$;

revoke all on function private.journey_reach_milestone(uuid, integer) from public, anon;
revoke all on function private.journey_save_finisher_tip(uuid, text) from public, anon;
revoke all on function private.journey_finisher_tips_for(text) from public, anon;
revoke all on function private.journey_share_milestone(uuid, integer) from public, anon;
revoke all on function private.journey_set_visibility(uuid, text) from public, anon;
revoke all on function private.journey_set_status(uuid, text) from public, anon;
grant execute on function private.journey_reach_milestone(uuid, integer) to authenticated, service_role;
grant execute on function private.journey_save_finisher_tip(uuid, text) to authenticated, service_role;
grant execute on function private.journey_finisher_tips_for(text) to authenticated, service_role;
grant execute on function private.journey_share_milestone(uuid, integer) to authenticated, service_role;
grant execute on function private.journey_set_visibility(uuid, text) to authenticated, service_role;
grant execute on function private.journey_set_status(uuid, text) to authenticated, service_role;


-- 7) Diet conversion: the weight safeguard -----------------------------------------------------

-- Where a Diet conversion journey's weight stands. Pauses the journey when the
-- drop reaches diet_pause_drop_pct (and says so); 'notice' at the amber
-- threshold. Any other journey: level 'none'.
create or replace function private.journey_weight_check(p_journey_id uuid)
returns table (start_grams numeric, current_grams numeric, drop_pct numeric, level text, paused boolean, window_from timestamptz, window_to timestamptz)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  j public.journeys;
  s public.journey_settings;
  v_slug text;
  m1 public.journey_milestones;
  v_from timestamptz;
  v_to timestamptz;
  v_start numeric;
  v_now numeric;
  v_drop numeric;
  v_level text := 'none';
begin
  j := private.journey_for_member(p_journey_id);
  select t.slug into v_slug from public.journey_templates t where t.id = j.template_id;
  if v_slug is distinct from 'diet-conversion' then
    return query select null::numeric, null::numeric, null::numeric, 'none'::text, false, null::timestamptz, null::timestamptz;
    return;
  end if;
  select * into s from public.journey_settings where id;
  select * into m1 from public.journey_milestones m where m.journey_id = j.id and m.position = 1;

  -- Milestone 1's week of weigh-ins sets the starting weight.
  if m1.state = 'already' then
    v_from := j.started_at - interval '7 days'; v_to := j.started_at;
  else
    v_from := j.started_at; v_to := least(coalesce(m1.reached_at, j.started_at + interval '7 days'), j.started_at + interval '7 days');
  end if;

  if j.weight_baseline_grams is not null then
    v_start := j.weight_baseline_grams;
  else
    select avg(w.grams) into v_start from public.weight_entries w
    where w.bird_id = j.bird_id and w.measured_at >= v_from and w.measured_at <= v_to;
  end if;
  select w.grams into v_now from public.weight_entries w
  where w.bird_id = j.bird_id and w.measured_at > coalesce(j.vet_confirmed_at, v_to)
  order by w.measured_at desc limit 1;

  if v_start is not null and v_start > 0 and v_now is not null then
    v_drop := round((v_start - v_now) / v_start * 100, 1);
    v_level := case when v_drop >= s.diet_pause_drop_pct then 'pause'
                    when v_drop >= s.diet_notice_drop_pct then 'notice'
                    else 'none' end;
  end if;

  if v_level = 'pause' and j.status = 'active' then
    update public.journeys set status = 'paused', paused_at = now(), paused_reason = 'weight_drop', updated_at = now() where id = j.id;
    j.status := 'paused'; j.paused_reason := 'weight_drop';
  end if;

  return query select round(v_start, 1), v_now, v_drop, v_level, (j.status = 'paused' and j.paused_reason = 'weight_drop'), v_from, v_to;
end;
$$;

-- "I've put the usual food back and called my avian vet": the only way out of
-- a weight pause. Re-bases on the latest weight, so the next check measures
-- from here.
create or replace function private.journey_resume_after_vet(p_journey_id uuid, p_confirmed boolean)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  j public.journeys;
  v_now numeric;
begin
  j := private.journey_for_member(p_journey_id);
  if j.paused_reason is distinct from 'weight_drop' then
    raise exception 'this journey isn''t paused for weight' using errcode = '22023';
  end if;
  if p_confirmed is not true then
    raise exception 'confirm you''ve put the usual food back and called your avian vet' using errcode = '22023';
  end if;
  select w.grams into v_now from public.weight_entries w where w.bird_id = j.bird_id order by w.measured_at desc limit 1;
  update public.journeys set
    status = 'active', paused_at = null, paused_reason = null,
    vet_confirmed_at = now(), weight_baseline_grams = coalesce(v_now, weight_baseline_grams), updated_at = now()
  where id = j.id;
end;
$$;

revoke all on function private.journey_weight_check(uuid) from public, anon;
revoke all on function private.journey_resume_after_vet(uuid, boolean) from public, anon;
grant execute on function private.journey_weight_check(uuid) to authenticated, service_role;
grant execute on function private.journey_resume_after_vet(uuid, boolean) to authenticated, service_role;


-- 8) Admin: milestone phrasing ---------------------------------------------------------------
--   select public.admin_set_journey_milestone_words('recall', 3, 'fly to you from arm''s length', 'flew to you');

create or replace function private.set_journey_milestone_words(p_slug text, p_position integer, p_ask text, p_done_line text)
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
  if length(btrim(coalesce(p_ask, ''))) not between 1 and 200 or length(btrim(coalesce(p_done_line, ''))) not between 1 and 200 then
    raise exception 'both phrasings need a few words (up to 200 characters)' using errcode = '22023';
  end if;
  update public.journey_template_milestones m set ask = btrim(p_ask), done_line = btrim(p_done_line)
  from public.journey_templates t
  where t.id = m.template_id and t.slug = p_slug and m.position = p_position
  returning m.* into v_row;
  if v_row.id is null then
    raise exception 'milestone not found' using errcode = 'P0002';
  end if;
  return v_row;
end;
$$;

revoke all on function private.set_journey_milestone_words(text, integer, text, text) from public, anon;
grant execute on function private.set_journey_milestone_words(text, integer, text, text) to authenticated, service_role;


-- 9) Invoker wrappers the app calls -------------------------------------------------------------

create or replace function public.journey_post_update(p_journey_id uuid, p_clip_ref text, p_engagement text, p_caption text default null)
returns uuid language sql volatile security invoker set search_path = ''
as $$ select private.journey_post_update(p_journey_id, p_clip_ref, p_engagement, p_caption); $$;

create or replace function public.journey_reach_milestone(p_journey_id uuid, p_position integer)
returns table (finished boolean, done integer, total integer) language sql volatile security invoker set search_path = ''
as $$ select * from private.journey_reach_milestone(p_journey_id, p_position); $$;

create or replace function public.journey_save_finisher_tip(p_journey_id uuid, p_body text)
returns void language sql volatile security invoker set search_path = ''
as $$ select private.journey_save_finisher_tip(p_journey_id, p_body); $$;

create or replace function public.journey_finisher_tips_for(p_template_slug text)
returns table (body text, display_name text, created_at timestamptz) language sql stable security invoker set search_path = ''
as $$ select * from private.journey_finisher_tips_for(p_template_slug); $$;

create or replace function public.journey_share_milestone(p_journey_id uuid, p_position integer)
returns void language sql volatile security invoker set search_path = ''
as $$ select private.journey_share_milestone(p_journey_id, p_position); $$;

create or replace function public.journey_set_visibility(p_journey_id uuid, p_visibility text)
returns void language sql volatile security invoker set search_path = ''
as $$ select private.journey_set_visibility(p_journey_id, p_visibility); $$;

create or replace function public.journey_set_status(p_journey_id uuid, p_status text)
returns void language sql volatile security invoker set search_path = ''
as $$ select private.journey_set_status(p_journey_id, p_status); $$;

create or replace function public.journey_weight_check(p_journey_id uuid)
returns table (start_grams numeric, current_grams numeric, drop_pct numeric, level text, paused boolean, window_from timestamptz, window_to timestamptz)
language sql volatile security invoker set search_path = ''
as $$ select * from private.journey_weight_check(p_journey_id); $$;

create or replace function public.journey_resume_after_vet(p_journey_id uuid, p_confirmed boolean)
returns void language sql volatile security invoker set search_path = ''
as $$ select private.journey_resume_after_vet(p_journey_id, p_confirmed); $$;

create or replace function public.admin_set_journey_milestone_words(p_slug text, p_position integer, p_ask text, p_done_line text)
returns public.journey_template_milestones language sql volatile security invoker set search_path = ''
as $$ select * from private.set_journey_milestone_words(p_slug, p_position, p_ask, p_done_line); $$;

revoke all on function public.journey_post_update(uuid, text, text, text) from public, anon;
revoke all on function public.journey_reach_milestone(uuid, integer) from public, anon;
revoke all on function public.journey_save_finisher_tip(uuid, text) from public, anon;
revoke all on function public.journey_finisher_tips_for(text) from public, anon;
revoke all on function public.journey_share_milestone(uuid, integer) from public, anon;
revoke all on function public.journey_set_visibility(uuid, text) from public, anon;
revoke all on function public.journey_set_status(uuid, text) from public, anon;
revoke all on function public.journey_weight_check(uuid) from public, anon;
revoke all on function public.journey_resume_after_vet(uuid, boolean) from public, anon;
revoke all on function public.admin_set_journey_milestone_words(text, integer, text, text) from public, anon;
grant execute on function public.journey_post_update(uuid, text, text, text) to authenticated, service_role;
grant execute on function public.journey_reach_milestone(uuid, integer) to authenticated, service_role;
grant execute on function public.journey_save_finisher_tip(uuid, text) to authenticated, service_role;
grant execute on function public.journey_finisher_tips_for(text) to authenticated, service_role;
grant execute on function public.journey_share_milestone(uuid, integer) to authenticated, service_role;
grant execute on function public.journey_set_visibility(uuid, text) to authenticated, service_role;
grant execute on function public.journey_set_status(uuid, text) to authenticated, service_role;
grant execute on function public.journey_weight_check(uuid) to authenticated, service_role;
grant execute on function public.journey_resume_after_vet(uuid, boolean) to authenticated, service_role;
grant execute on function public.admin_set_journey_milestone_words(text, integer, text, text) to authenticated, service_role;


-- 10) Draft phrasing for every template milestone (edit with admin_set_journey_milestone_words).
--     Only fills empty rows, so re-running never overwrites an edit.

update public.journey_template_milestones m set ask = w.ask, done_line = w.done_line
from (values
  ('scale-training', 1, 'stay calm and take a treat near the scale', 'ate a treat right by the scale'),
  ('scale-training', 2, 'touch the scale with a beak or foot', 'touched the scale'),
  ('scale-training', 3, 'step onto the scale perch', 'stepped onto the scale'),
  ('scale-training', 4, 'hold still on the scale for a reading', 'held still for a reading'),
  ('scale-training', 5, 'step on the scale when you gave the cue', 'stepped on at your cue'),
  ('scale-training', 6, 'weigh in at the usual time', 'made weigh-ins a daily habit'),
  ('target-training', 1, 'stay calm with the target stick nearby', 'stayed calm with the target stick'),
  ('target-training', 2, 'tap the tip of the stick', 'tapped the target'),
  ('target-training', 3, 'take a step or two to reach the stick', 'walked over to the target'),
  ('target-training', 4, 'follow the stick across the perch', 'followed the target across the perch'),
  ('target-training', 5, 'follow the stick up, down, or around a toy', 'followed the target around a toy'),
  ('target-training', 6, 'follow the stick onto a new perch or out the door', 'followed the target to a new spot'),
  ('step-up', 1, 'stay relaxed as your hand came near', 'stayed relaxed as your hand came near'),
  ('step-up', 2, 'touch your open hand with a foot', 'touched your hand with a foot'),
  ('step-up', 3, 'step on with one foot', 'stepped on with one foot'),
  ('step-up', 4, 'step up with both feet', 'stepped up with both feet'),
  ('step-up', 5, 'stay on your hand for a few seconds', 'stayed on your hand'),
  ('step-up', 6, 'stay calm while your hand moved around the room', 'rode calmly across the room'),
  ('step-up', 7, 'step up on cue from the cage and from a stand', 'stepped up on cue'),
  ('recall', 1, 'walk across the perch to your hand', 'walked over to your hand'),
  ('recall', 2, 'hop the gap to your hand', 'hopped to your hand'),
  ('recall', 3, 'fly to you from arm''s length', 'flew to you'),
  ('recall', 4, 'fly to you across the room', 'flew across the room to you'),
  ('recall', 5, 'come to you from a different spot', 'came from a new spot'),
  ('recall', 6, 'come the first time you called', 'came at the first call'),
  ('recall', 7, 'come to you with the household busy', 'came with distractions around'),
  ('wing-touch', 1, 'come to your closed hand for a reward', 'came to your closed hand'),
  ('wing-touch', 2, 'come to your hand without the stick', 'came to your hand without the stick'),
  ('wing-touch', 3, 'let a wing brush your palm', 'let a wing brush your palm'),
  ('wing-touch', 4, 'allow a light touch on the wing', 'allowed a light wing touch'),
  ('wing-touch', 5, 'allow a touch at the wing tip', 'allowed a wing-tip touch'),
  ('wing-touch', 6, 'let you lift the wing tip slightly', 'let you lift a wing tip'),
  ('wing-touch', 7, 'allow a gentle wing extension on both sides', 'allowed a gentle wing extension'),
  ('carrier-comfort', 1, 'eat treats near the open carrier', 'ate treats by the carrier'),
  ('carrier-comfort', 2, 'step onto the carrier''s edge', 'stepped into the doorway'),
  ('carrier-comfort', 3, 'go all the way in and come back out', 'went all the way in'),
  ('carrier-comfort', 4, 'stay in while the door was partly closed', 'stayed in with the door partly closed'),
  ('carrier-comfort', 5, 'stay calm with the door closed', 'stayed calm with the door closed'),
  ('carrier-comfort', 6, 'stay calm while you carried the carrier around', 'rode calmly around the house'),
  ('carrier-comfort', 7, 'take a short car ride calmly', 'took a calm car ride'),
  ('diet-conversion', 1, 'get a full week of weigh-ins', 'has a starting weight'),
  ('diet-conversion', 2, 'have the new food beside the usual food every day', 'has the new food on the menu'),
  ('diet-conversion', 3, 'taste the new food', 'tasted the new food'),
  ('diet-conversion', 4, 'eat some of the new food most days', 'is eating the new food most days'),
  ('diet-conversion', 5, 'get to about a quarter new food', 'is at a quarter new food'),
  ('diet-conversion', 6, 'get to about half new food', 'is at half new food'),
  ('diet-conversion', 7, 'eat mostly the new diet', 'switched to the new diet'),
  ('nail-trims', 1, 'stay relaxed with the clippers in sight', 'stayed relaxed near the clippers'),
  ('nail-trims', 2, 'rest a foot on your hand', 'rested a foot on your hand'),
  ('nail-trims', 3, 'let go of the clippers every time', 'left the clippers alone'),
  ('nail-trims', 4, 'let you touch and move a toe', 'let you hold a toe'),
  ('nail-trims', 5, 'stay relaxed with the clippers near a foot', 'stayed relaxed with the clippers close'),
  ('nail-trims', 6, 'let you trim a nail', 'had a nail trimmed calmly'),
  ('nail-trims', 7, 'have a whole trim without a towel', 'had a full trim, no towel'),
  ('stationing', 1, 'go to the station when you tapped it', 'went to the station'),
  ('stationing', 2, 'stay on the station for a few seconds', 'stayed on station'),
  ('stationing', 3, 'stay while you stepped away', 'stayed while you stepped away'),
  ('stationing', 4, 'go to the station from a new spot', 'went to the station from across the room'),
  ('stationing', 5, 'go to the station on your cue, no stick', 'went to the station on cue'),
  ('stationing', 6, 'stay on station for a minute with the house busy', 'stayed on station for a minute'),
  ('wave', 1, 'lift a foot as your hand came near', 'lifted a foot'),
  ('wave', 2, 'lift the foot high', 'lifted the foot high'),
  ('wave', 3, 'lift it to the same height most times', 'lifted it the same way each time'),
  ('wave', 4, 'wave to your hand signal', 'waved to a hand signal'),
  ('wave', 5, 'wave on cue from a distance', 'waved from across the room'),
  ('high-five', 1, 'wave on cue', 'waved on cue'),
  ('high-five', 2, 'touch your palm mid-wave', 'touched your palm'),
  ('high-five', 3, 'reach your palm when you held it farther away', 'reached for your palm'),
  ('high-five', 4, 'high-five when you said the cue', 'gave you a high five'),
  ('spin', 1, 'follow the stick a quarter turn', 'made a quarter turn'),
  ('spin', 2, 'follow the stick a half turn', 'made a half turn'),
  ('spin', 3, 'follow the stick all the way around', 'spun all the way around'),
  ('spin', 4, 'spin to your finger', 'spun to your finger'),
  ('spin', 5, 'spin to a flick of your finger', 'spun on cue'),
  ('retrieve', 1, 'touch the ball', 'touched the ball'),
  ('retrieve', 2, 'pick the ball up', 'picked up the ball'),
  ('retrieve', 3, 'drop the ball into your hand', 'dropped the ball in your hand'),
  ('retrieve', 4, 'bring the ball a few inches to your hand', 'brought you the ball'),
  ('retrieve', 5, 'bring the ball from across the table', 'fetched from across the table'),
  ('retrieve', 6, 'bring back something other than the ball', 'fetched something new'),
  ('hang-upside-down', 1, 'lean down toward the treat', 'leaned down for a treat'),
  ('hang-upside-down', 2, 'lean farther as the treat moved lower', 'leaned way down'),
  ('hang-upside-down', 3, 'tip all the way upside down', 'went upside down'),
  ('hang-upside-down', 4, 'hang upside down for a few seconds', 'hung upside down'),
  ('hang-upside-down', 5, 'hang upside down on cue', 'flipped on cue')
) as w(slug, position, ask, done_line)
join public.journey_templates t on t.slug = w.slug
where m.template_id = t.id and m.position = w.position and m.ask is null and m.done_line is null;
