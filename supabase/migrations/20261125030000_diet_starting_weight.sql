-- Journeys redesign, part 4 (backlog 1.20d): Diet conversion's starting weight
-- without milestones. docs/flock/journeys-redesign.md, "Data" and "Edge cases".
--
-- What changes:
--   1. private.diet_starting_weight(journey): the starting-weight state, read
--      from the journey alone. The starting weight is the average of the
--      weigh-ins in the first week after the journey starts (the bird's usual
--      weigh-in time only, as before), the same week milestone 1 measured. It
--      is "set" once that week is over and has a weigh-in, or once a
--      vet-confirmed resume re-based it on the latest weight. Milestone 1 (and
--      its "already" answer) no longer moves the week: new journeys have no
--      milestones since 20261124190000, and production has no Diet conversion
--      journey at all (checked read-only before this was written).
--   2. private.journey_weight_check reads its week and starting weight from
--      it, and returns two new columns, start_set and start_set_at, which the
--      vet reminder card uses ("once the starting weight is set", was "from
--      milestone 2"). New return columns, so it's dropped and recreated with
--      its public wrapper. The weight rules themselves are unchanged, line for
--      line, and every number stays in journey_settings, unchanged.
--   3. private.journey_weigh_reminders counts days from the same week's start.
--   4. A new health switch, diet_eclectus_alert (off): the eclectus alert
--      before the vet card, draft until an avian vet approves the wording.
--
-- Kept: the lory/lorikeet block, the vet card and its answers, the pause and
-- journey_resume_after_vet, journey_finish's "on the new diet" (no known
-- skill). Behind journeys_enabled() (admins only today). No care-app table,
-- policy, trigger or function changes; weight_entries is only read. Pinned by
-- supabase/checks/diet_weight_rules_checks.sql,
-- supabase/checks/diet_vet_guidance_checks.sql and
-- supabase/checks/health_rules_checks.sql.


-- 1) The starting-weight state ------------------------------------------------------------

create or replace function private.diet_starting_weight(p_journey_id uuid)
returns table (window_from timestamptz, window_to timestamptz, start_grams numeric, start_set boolean, start_set_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  j public.journeys;
  v_from timestamptz;
  v_to timestamptz;
  v_usual text;
  v_start numeric;
begin
  select * into j from public.journeys where id = p_journey_id;
  if not found then
    return;
  end if;
  -- The first week after the start (draft, pending vet review: "one week as
  -- enough for a starting weight" is in the vet packet).
  v_from := j.started_at;
  v_to := j.started_at + interval '7 days';

  if j.weight_baseline_grams is not null then
    return query select v_from, v_to, j.weight_baseline_grams, true, coalesce(j.vet_confirmed_at, v_to);
    return;
  end if;

  v_usual := private.usual_weigh_meal(j.bird_id);
  select avg(w.grams) into v_start from public.weight_entries w
  where w.bird_id = j.bird_id and w.measured_at >= v_from and w.measured_at <= v_to
    and (v_usual is null or w.meal_relation is null or w.meal_relation = v_usual);

  return query select v_from, v_to, v_start, (v_start is not null and now() >= v_to), case when v_start is not null and now() >= v_to then v_to end;
end;
$$;

revoke all on function private.diet_starting_weight(uuid) from public, anon, authenticated;
grant execute on function private.diet_starting_weight(uuid) to service_role;


-- 2) The weight check ----------------------------------------------------------------------

drop function if exists public.journey_weight_check(uuid);
drop function if exists private.journey_weight_check(uuid);

create or replace function private.journey_weight_check(p_journey_id uuid)
returns table (
  start_grams numeric, current_grams numeric, avg_grams numeric, drop_pct numeric, level text, paused boolean, pause_kind text,
  recheck boolean, recheck_grams numeric, missed boolean, days_since_weigh integer, usual_meal text, excluded jsonb,
  window_from timestamptz, window_to timestamptz, start_set boolean, start_set_at timestamptz
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
  sw record;
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
      false, null::numeric, false, null::integer, null::text, '[]'::jsonb, null::timestamptz, null::timestamptz, false, null::timestamptz;
    return;
  end if;
  select * into s from public.journey_settings where id;

  -- The first week's weigh-ins set the starting weight (diet_starting_weight).
  select * into sw from private.diet_starting_weight(j.id);
  v_from := sw.window_from; v_to := sw.window_to;
  v_start := sw.start_grams;
  v_measure_from := coalesce(j.vet_confirmed_at, v_to);
  v_usual := private.usual_weigh_meal(j.bird_id);

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
  v_days := floor(extract(epoch from (now() - greatest(coalesce(v_last_any, v_from), v_from))) / 86400)::integer;

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
    v_from, v_to,
    coalesce(sw.start_set, false), sw.start_set_at;
end;
$$;

revoke all on function private.journey_weight_check(uuid) from public, anon;
grant execute on function private.journey_weight_check(uuid) to authenticated, service_role;

create or replace function public.journey_weight_check(p_journey_id uuid)
returns table (
  start_grams numeric, current_grams numeric, avg_grams numeric, drop_pct numeric, level text, paused boolean, pause_kind text,
  recheck boolean, recheck_grams numeric, missed boolean, days_since_weigh integer, usual_meal text, excluded jsonb,
  window_from timestamptz, window_to timestamptz, start_set boolean, start_set_at timestamptz
)
language sql volatile security invoker set search_path = ''
as $$ select * from private.journey_weight_check(p_journey_id); $$;

revoke all on function public.journey_weight_check(uuid) from public, anon;
grant execute on function public.journey_weight_check(uuid) to authenticated, service_role;


-- 3) Today: "Weigh [Bird] today", from the same week's start -------------------------------

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
           floor(extract(epoch from (now() - greatest(coalesce((select max(w.measured_at) from public.weight_entries w where w.bird_id = j.bird_id), sw.window_from), sw.window_from))) / 86400)::integer
    from public.journeys j
    join public.journey_templates t on t.id = j.template_id and t.slug = 'diet-conversion'
    join public.birds b on b.id = j.bird_id and b.passed_at is null
    cross join lateral private.diet_starting_weight(j.id) sw
    where j.status = 'active'
      and private.has_bird_access(j.bird_id, v_uid) is not null
      and now() - greatest(coalesce((select max(w.measured_at) from public.weight_entries w where w.bird_id = j.bird_id), sw.window_from), sw.window_from)
          >= make_interval(days => v_days)
    order by b.name;
end;
$$;

revoke all on function private.journey_weigh_reminders() from public, anon;
grant execute on function private.journey_weigh_reminders() to authenticated, service_role;


-- 4) Safeguard wording (draft template text only) -------------------------------------------
-- "every step" → "the whole journey", and the out-of-date sentence about
-- baseline alerts is removed (Brittany, Nov 25, 2026: the weight safeguard is
-- the same for everyone and doesn't use the weight baseline).

update public.journey_templates
set safeguards = array(
  select replace(
           replace(s, 'Daily weigh-ins are part of every step,', 'Daily weigh-ins are part of the whole journey,'),
           ' For Flock members, this uses the bird''s own baseline alerts.', '')
  from unnest(safeguards) with ordinality as x(s, ord)
  order by ord
), updated_at = now()
where slug = 'diet-conversion'
  and review_status = 'draft'
  and exists (select 1 from unnest(safeguards) s
              where s like 'Daily weigh-ins are part of every step,%'
                 or s like '%For Flock members, this uses the bird''s own baseline alerts.%');


-- 5) The eclectus alert's switch (off until an avian vet approves the wording) -----------

insert into public.health_features (feature, audience, description) values
  ('diet_eclectus_alert', 'off', 'The eclectus alert before Diet conversion''s vet card (draft, pending vet review)')
on conflict (feature) do nothing;
