-- Diet conversion: smoothed weight rules.
-- Additive: new journey_settings columns (journeys-only), one new journeys
-- column (weight_pause_kind), a new journey_weigh_reminders() for Today, an
-- admin setter, and a new version of the journeys-only
-- private.journey_weight_check (new return columns, so it's dropped and
-- recreated with its public wrapper). No care-app table, policy, trigger or
-- function changes; weight_entries is only read.
--
-- The rules (every number is a journey_settings column; draft until an avian
-- vet confirms them):
--   * Compare the average of the last 3 weigh-ins (diet_avg_count) with the
--     starting weight, but only when at least 2 of them (diet_avg_min_recent)
--     fall in the last 3 days (diet_avg_recent_days).
--   * Heads-up at >= 2.5% below (diet_notice_drop_pct); it clears only once
--     back within 1.5% (diet_notice_clear_pct).
--   * Pause at >= 5% below (diet_pause_drop_pct), as before.
--   * Slow slide: the 7-day average (diet_slide_days, at least
--     diet_slide_min_readings weigh-ins) >= 3% below (diet_slide_drop_pct) → the
--     same pause.
--   * Sudden drop: one weigh-in >= 8% below the previous (diet_sudden_drop_pct)
--     asks for a re-weigh. If the next weigh-in is also that far below, pause
--     ("dropped quickly"); if not, the odd reading is left out.
--   * Gram floor: a drop only counts if it's also >= 2 g (diet_min_drop_grams).
--   * After 2 days with no weigh-in (diet_missed_days): a reminder on the
--     journey page and in Today.
--   * The bird's usual weigh-in: the meal tag (before or after a meal) on most
--     of its last 30 tagged weigh-ins. A reading tagged the other way is left
--     out ("Not counted: weighed at a different time than usual."). Untagged
--     readings count; with no clear usual tag, everything counts.
--
-- The rules are replayed over the weigh-ins in order each time, so the
-- result doesn't depend on when someone opened the page.


-- 1) Settings ---------------------------------------------------------------------------------

alter table public.journey_settings
  add column if not exists diet_avg_count          integer not null default 3   check (diet_avg_count between 1 and 14),
  add column if not exists diet_avg_recent_days    integer not null default 3   check (diet_avg_recent_days between 1 and 14),
  add column if not exists diet_avg_min_recent     integer not null default 2   check (diet_avg_min_recent between 1 and 14),
  add column if not exists diet_notice_clear_pct   numeric not null default 1.5 check (diet_notice_clear_pct >= 0 and diet_notice_clear_pct < 50),
  add column if not exists diet_slide_days         integer not null default 7   check (diet_slide_days between 2 and 30),
  add column if not exists diet_slide_drop_pct     numeric not null default 3   check (diet_slide_drop_pct > 0 and diet_slide_drop_pct < 50),
  add column if not exists diet_slide_min_readings integer not null default 4   check (diet_slide_min_readings between 1 and 30),
  add column if not exists diet_sudden_drop_pct    numeric not null default 8   check (diet_sudden_drop_pct > 0 and diet_sudden_drop_pct < 50),
  add column if not exists diet_min_drop_grams     numeric not null default 2   check (diet_min_drop_grams >= 0 and diet_min_drop_grams < 100),
  add column if not exists diet_missed_days        integer not null default 2   check (diet_missed_days between 1 and 14);

comment on column public.journey_settings.diet_avg_count is 'Diet conversion: average this many recent weigh-ins. Draft; an avian vet must confirm before launch.';
comment on column public.journey_settings.diet_notice_clear_pct is 'Diet conversion: the heads-up clears once the average is back within this percent. Draft.';
comment on column public.journey_settings.diet_slide_drop_pct is 'Diet conversion: a slow slide (the diet_slide_days average this far below) pauses. Draft.';
comment on column public.journey_settings.diet_sudden_drop_pct is 'Diet conversion: one weigh-in this far below the previous asks for a re-weigh. Draft.';
comment on column public.journey_settings.diet_min_drop_grams is 'Diet conversion: a drop only counts if it is also at least this many grams. Draft.';

-- Which rule paused the journey (paused_reason stays 'weight_drop').
alter table public.journeys
  add column if not exists weight_pause_kind text check (weight_pause_kind is null or weight_pause_kind in ('drop', 'slide', 'sudden'));

--   select public.admin_set_diet_weight_rules('{"diet_sudden_drop_pct": 8, "diet_min_drop_grams": 2}');
-- Any of the diet_* columns; the others stay as they are.
create or replace function private.set_diet_weight_rules(p_rules jsonb)
returns public.journey_settings
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_row public.journey_settings;
  k text;
begin
  perform private.assert_entitlement_admin();
  for k in select jsonb_object_keys(coalesce(p_rules, '{}')) loop
    if k not in ('diet_avg_count', 'diet_avg_recent_days', 'diet_avg_min_recent', 'diet_notice_drop_pct', 'diet_notice_clear_pct',
                 'diet_pause_drop_pct', 'diet_slide_days', 'diet_slide_drop_pct', 'diet_slide_min_readings', 'diet_sudden_drop_pct',
                 'diet_min_drop_grams', 'diet_missed_days') then
      raise exception 'unknown setting %', k using errcode = '22023';
    end if;
  end loop;
  update public.journey_settings s set
    diet_avg_count          = coalesce((p_rules->>'diet_avg_count')::integer, s.diet_avg_count),
    diet_avg_recent_days    = coalesce((p_rules->>'diet_avg_recent_days')::integer, s.diet_avg_recent_days),
    diet_avg_min_recent     = coalesce((p_rules->>'diet_avg_min_recent')::integer, s.diet_avg_min_recent),
    diet_notice_drop_pct    = coalesce((p_rules->>'diet_notice_drop_pct')::numeric, s.diet_notice_drop_pct),
    diet_notice_clear_pct   = coalesce((p_rules->>'diet_notice_clear_pct')::numeric, s.diet_notice_clear_pct),
    diet_pause_drop_pct     = coalesce((p_rules->>'diet_pause_drop_pct')::numeric, s.diet_pause_drop_pct),
    diet_slide_days         = coalesce((p_rules->>'diet_slide_days')::integer, s.diet_slide_days),
    diet_slide_drop_pct     = coalesce((p_rules->>'diet_slide_drop_pct')::numeric, s.diet_slide_drop_pct),
    diet_slide_min_readings = coalesce((p_rules->>'diet_slide_min_readings')::integer, s.diet_slide_min_readings),
    diet_sudden_drop_pct    = coalesce((p_rules->>'diet_sudden_drop_pct')::numeric, s.diet_sudden_drop_pct),
    diet_min_drop_grams     = coalesce((p_rules->>'diet_min_drop_grams')::numeric, s.diet_min_drop_grams),
    diet_missed_days        = coalesce((p_rules->>'diet_missed_days')::integer, s.diet_missed_days),
    updated_at = now(), updated_by = auth.uid()
  where s.id
  returning * into v_row;
  if v_row.diet_notice_clear_pct >= v_row.diet_notice_drop_pct or v_row.diet_notice_drop_pct >= v_row.diet_pause_drop_pct
     or v_row.diet_avg_min_recent > v_row.diet_avg_count then
    raise exception 'the heads-up must clear below where it starts, and start before the pause' using errcode = '22023';
  end if;
  return v_row;
end;
$$;

revoke all on function private.set_diet_weight_rules(jsonb) from public, anon;
grant execute on function private.set_diet_weight_rules(jsonb) to authenticated, service_role;

create or replace function public.admin_set_diet_weight_rules(p_rules jsonb)
returns public.journey_settings language sql volatile security invoker set search_path = ''
as $$ select * from private.set_diet_weight_rules(p_rules); $$;

revoke all on function public.admin_set_diet_weight_rules(jsonb) from public, anon;
grant execute on function public.admin_set_diet_weight_rules(jsonb) to authenticated, service_role;


-- 2) The bird's usual weigh-in ----------------------------------------------------------------

-- The meal tag on most of the bird's last 30 tagged weigh-ins; null on a tie
-- or with none.
create or replace function private.usual_weigh_meal(p_bird_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  with recent as (
    select w.meal_relation from public.weight_entries w
    where w.bird_id = p_bird_id and w.meal_relation is not null
    order by w.measured_at desc limit 30
  ), counts as (
    select meal_relation, count(*) as n from recent group by meal_relation
  )
  select case when (select count(*) from counts where n = (select max(n) from counts)) = 1
              then (select meal_relation from counts order by n desc limit 1) end;
$$;

revoke all on function private.usual_weigh_meal(uuid) from public, anon;
grant execute on function private.usual_weigh_meal(uuid) to authenticated, service_role;


-- 3) The weight check -------------------------------------------------------------------------

drop function if exists public.journey_weight_check(uuid);
drop function if exists private.journey_weight_check(uuid);

create or replace function private.journey_weight_check(p_journey_id uuid)
returns table (
  start_grams numeric, current_grams numeric, avg_grams numeric, drop_pct numeric, level text, paused boolean, pause_kind text,
  recheck boolean, recheck_grams numeric, missed boolean, days_since_weigh integer, usual_meal text, excluded jsonb,
  window_from timestamptz, window_to timestamptz
)
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
  v_measure_from timestamptz;
  v_usual text;
  v_start numeric;
  e record;
  v_prev numeric;               -- the last reading that counted
  v_pending numeric;            -- a sudden drop waiting for the re-weigh
  v_pending_at timestamptz;
  v_pending_prev numeric;
  v_sudden boolean := false;
  v_good numeric[] := '{}';
  v_good_at timestamptz[] := '{}';
  v_excluded jsonb := '[]'::jsonb;
  v_notice boolean := false;
  v_pause text;
  v_n integer;
  v_avg numeric;
  v_recent integer;
  v_drop numeric;
  v_slide numeric;
  v_slide_n integer;
  v_last_any timestamptz;
  v_days integer;
  i integer;
begin
  j := private.journey_for_member(p_journey_id);
  select t.slug into v_slug from public.journey_templates t where t.id = j.template_id;
  if v_slug is distinct from 'diet-conversion' then
    return query select null::numeric, null::numeric, null::numeric, null::numeric, 'none'::text, false, null::text,
      false, null::numeric, false, null::integer, null::text, '[]'::jsonb, null::timestamptz, null::timestamptz;
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
  v_measure_from := coalesce(j.vet_confirmed_at, v_to);
  v_usual := private.usual_weigh_meal(j.bird_id);

  if j.weight_baseline_grams is not null then
    v_start := j.weight_baseline_grams;
  else
    select avg(w.grams) into v_start from public.weight_entries w
    where w.bird_id = j.bird_id and w.measured_at >= v_from and w.measured_at <= v_to
      and (v_usual is null or w.meal_relation is null or w.meal_relation = v_usual);
  end if;

  for e in
    select w.grams, w.measured_at, w.meal_relation from public.weight_entries w
    where w.bird_id = j.bird_id and w.measured_at >= v_from
    order by w.measured_at
  loop
    if v_usual is not null and e.meal_relation is not null and e.meal_relation <> v_usual then
      if e.measured_at > v_measure_from then
        v_excluded := v_excluded || jsonb_build_object('grams', e.grams, 'measured_at', e.measured_at, 'reason', 'other_time');
      end if;
      continue;
    end if;
    if e.measured_at <= v_measure_from then
      v_prev := e.grams;  -- the starting week (or before a vet-confirmed resume): no rules yet
      continue;
    end if;

    -- The re-weigh after a sudden drop: still that far below → pause; otherwise the odd reading is left out.
    if v_pending is not null then
      if (v_pending_prev - e.grams) / v_pending_prev * 100 >= s.diet_sudden_drop_pct and v_pending_prev - e.grams >= s.diet_min_drop_grams then
        v_sudden := true;
        v_good := v_good || v_pending || e.grams; v_good_at := v_good_at || v_pending_at || e.measured_at;
        v_pending := null;
        exit;
      end if;
      v_excluded := v_excluded || jsonb_build_object('grams', v_pending, 'measured_at', v_pending_at, 'reason', 'unconfirmed');
      v_pending := null;
    end if;
    if v_prev is not null and v_prev > 0 and (v_prev - e.grams) / v_prev * 100 >= s.diet_sudden_drop_pct and v_prev - e.grams >= s.diet_min_drop_grams then
      v_pending := e.grams; v_pending_at := e.measured_at; v_pending_prev := v_prev;
      continue;
    end if;

    v_good := v_good || e.grams; v_good_at := v_good_at || e.measured_at;
    v_prev := e.grams;
    if v_start is null or v_start <= 0 then continue; end if;

    -- The average of the last few, when enough of them are recent.
    v_n := array_length(v_good, 1);
    v_avg := 0; v_recent := 0;
    for i in greatest(1, v_n - s.diet_avg_count + 1) .. v_n loop
      v_avg := v_avg + v_good[i];
      if v_good_at[i] > e.measured_at - make_interval(days => s.diet_avg_recent_days) then v_recent := v_recent + 1; end if;
    end loop;
    v_avg := v_avg / (v_n - greatest(1, v_n - s.diet_avg_count + 1) + 1);
    if v_recent >= s.diet_avg_min_recent then
      v_drop := (v_start - v_avg) / v_start * 100;
      if v_drop >= s.diet_pause_drop_pct and v_start - v_avg >= s.diet_min_drop_grams then
        v_pause := coalesce(v_pause, 'drop');
      end if;
      if v_notice then
        if v_drop <= s.diet_notice_clear_pct then v_notice := false; end if;
      elsif v_drop >= s.diet_notice_drop_pct and v_start - v_avg >= s.diet_min_drop_grams then
        v_notice := true;
      end if;
    end if;

    -- A slow slide: the week's average.
    v_slide := 0; v_slide_n := 0;
    for i in 1 .. v_n loop
      if v_good_at[i] > e.measured_at - make_interval(days => s.diet_slide_days) then
        v_slide := v_slide + v_good[i]; v_slide_n := v_slide_n + 1;
      end if;
    end loop;
    if v_slide_n >= s.diet_slide_min_readings then
      v_slide := v_slide / v_slide_n;
      if (v_start - v_slide) / v_start * 100 >= s.diet_slide_drop_pct and v_start - v_slide >= s.diet_min_drop_grams then
        v_pause := coalesce(v_pause, 'slide');
      end if;
    end if;
  end loop;

  if v_sudden then v_pause := 'sudden'; end if;

  if v_pause is not null and j.status = 'active' then
    update public.journeys set status = 'paused', paused_at = now(), paused_reason = 'weight_drop', weight_pause_kind = v_pause, updated_at = now()
    where id = j.id;
    j.status := 'paused'; j.paused_reason := 'weight_drop'; j.weight_pause_kind := v_pause;
  end if;

  -- The reading waiting for a re-weigh isn't counted yet either.
  if v_pending is not null then
    v_excluded := v_excluded || jsonb_build_object('grams', v_pending, 'measured_at', v_pending_at, 'reason', 'pending');
  end if;

  -- Missed weigh-ins: any reading counts as weighing.
  select max(w.measured_at) into v_last_any from public.weight_entries w where w.bird_id = j.bird_id;
  v_days := floor(extract(epoch from (now() - greatest(coalesce(v_last_any, j.started_at), j.started_at))) / 86400)::integer;

  v_n := coalesce(array_length(v_good, 1), 0);
  v_avg := null;
  if v_n > 0 then
    select avg(x) into v_avg from unnest(v_good[greatest(1, v_n - s.diet_avg_count + 1):v_n]) x;
  end if;

  return query select
    round(v_start, 1),
    case when v_n > 0 then v_good[v_n] end,
    round(v_avg, 1),
    case when v_start > 0 and v_avg is not null then round((v_start - v_avg) / v_start * 100, 1) end,
    case when j.status = 'paused' and j.paused_reason = 'weight_drop' then 'pause' when v_notice then 'notice' else 'none' end,
    (j.status = 'paused' and j.paused_reason = 'weight_drop'),
    case when j.paused_reason = 'weight_drop' then coalesce(j.weight_pause_kind, 'drop') end,
    (v_pending is not null and j.status = 'active'),
    v_pending,
    (j.status = 'active' and v_days >= s.diet_missed_days),
    v_days,
    v_usual,
    v_excluded,
    v_from, v_to;
end;
$$;

revoke all on function private.journey_weight_check(uuid) from public, anon;
grant execute on function private.journey_weight_check(uuid) to authenticated, service_role;

create or replace function public.journey_weight_check(p_journey_id uuid)
returns table (
  start_grams numeric, current_grams numeric, avg_grams numeric, drop_pct numeric, level text, paused boolean, pause_kind text,
  recheck boolean, recheck_grams numeric, missed boolean, days_since_weigh integer, usual_meal text, excluded jsonb,
  window_from timestamptz, window_to timestamptz
)
language sql volatile security invoker set search_path = ''
as $$ select * from private.journey_weight_check(p_journey_id); $$;

revoke all on function public.journey_weight_check(uuid) from public, anon;
grant execute on function public.journey_weight_check(uuid) to authenticated, service_role;

-- A vet-confirmed resume also clears which rule paused it.
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
    status = 'active', paused_at = null, paused_reason = null, weight_pause_kind = null,
    vet_confirmed_at = now(), weight_baseline_grams = coalesce(v_now, weight_baseline_grams), updated_at = now()
  where id = j.id;
end;
$$;


-- 4) Today: "Weigh [Bird] today" -------------------------------------------------------------

-- The caller's active Diet conversion journeys (their birds or household
-- birds) with no weigh-in for diet_missed_days days.
create or replace function private.journey_weigh_reminders()
returns table (journey_id uuid, bird_id uuid, bird_name text, days_since_weigh integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_days integer;
begin
  perform private.assert_can_use_journeys();
  select s.diet_missed_days into v_days from public.journey_settings s where s.id;
  return query
    select j.id, j.bird_id, b.name,
           floor(extract(epoch from (now() - greatest(coalesce((select max(w.measured_at) from public.weight_entries w where w.bird_id = j.bird_id), j.started_at), j.started_at))) / 86400)::integer
    from public.journeys j
    join public.journey_templates t on t.id = j.template_id and t.slug = 'diet-conversion'
    join public.birds b on b.id = j.bird_id and b.passed_at is null
    where j.status = 'active'
      and private.has_bird_access(j.bird_id, v_uid) is not null
      and now() - greatest(coalesce((select max(w.measured_at) from public.weight_entries w where w.bird_id = j.bird_id), j.started_at), j.started_at)
          >= make_interval(days => v_days)
    order by b.name;
end;
$$;

revoke all on function private.journey_weigh_reminders() from public, anon;
grant execute on function private.journey_weigh_reminders() to authenticated, service_role;

create or replace function public.journey_weigh_reminders()
returns table (journey_id uuid, bird_id uuid, bird_name text, days_since_weigh integer)
language sql stable security invoker set search_path = ''
as $$ select * from private.journey_weigh_reminders(); $$;

revoke all on function public.journey_weigh_reminders() from public, anon;
grant execute on function public.journey_weigh_reminders() to authenticated, service_role;
