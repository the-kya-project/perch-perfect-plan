-- Verification for 20261108160000_diet_weight_rules.
--
-- Self-contained and leaves nothing behind. Each scenario is its own bird on
-- its own Diet conversion journey (started 20 days ago, so milestone 1's week
-- of weigh-ins sets the starting weight), fed a fixed sequence of daily
-- weigh-ins, one at a time, with the expected result after each. Then rolls
-- back.
--   "DIET WEIGHT RULES CHECKS: n passed, 0 failed"           → all good
--   "DIET WEIGHT RULES CHECKS: n passed, k failed: <names>"  → which ones broke
-- Run by .github/workflows/db-checks.yml on every PR (scripts/db-checks.sh).
do $$
declare
  fm uuid := gen_random_uuid();
  st uuid := gen_random_uuid();
  names text[] := array['dip', 'gradual', 'cross5', 'slide', 'sudden_no', 'sudden_yes', 'tiny', 'missed', 'other_time'];
  base  numeric[] := array[400, 400, 400, 400, 400, 400, 30, 400, 400];
  birds uuid[] := '{}';
  jids  uuid[] := '{}';
  seq numeric[]; meals text[]; expect text[]; got text[];
  k int; n int; b uuid; jj uuid;
  passed int := 0; failed text[] := '{}';
  ok boolean; denied boolean; r record;
begin
  insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  select '00000000-0000-0000-0000-000000000000', x, 'authenticated', 'authenticated', x::text || '@checks.invalid', '{}', '{}', now(), now()
  from unnest(array[fm, st]) as x;
  insert into public.entitlements (user_id, plan, status, source, starts_at) values (fm, 'comp', 'active', 'manual', now() - interval '1 day');
  update public.journey_settings set audience = 'everyone', diet_pause_drop_pct = 5, diet_notice_drop_pct = 2.5, diet_avg_count = 3,
    diet_avg_recent_days = 3, diet_avg_min_recent = 2, diet_notice_clear_pct = 1.5, diet_slide_days = 7, diet_slide_drop_pct = 3,
    diet_slide_min_readings = 4, diet_sudden_drop_pct = 8, diet_min_drop_grams = 2, diet_missed_days = 2;

  for k in 1 .. array_length(names, 1) loop
    b := gen_random_uuid();
    birds := birds || b;
    insert into public.birds (id, owner_id, name, species) values (b, fm, 'Bird ' || names[k], 'Amazon');
    -- The starting week: three weigh-ins at the base weight (before a meal for the usual-time scenario).
    insert into public.weight_entries (bird_id, grams, measured_at, meal_relation)
    select b, base[k], now() - make_interval(days => d), case when names[k] = 'other_time' then 'before_meal' end from unnest(array[19, 18, 17]) d;
    perform set_config('request.jwt.claims', json_build_object('sub', fm, 'role', 'authenticated')::text, true);
    set local role authenticated;
    jj := public.journey_start(b, 'diet-conversion', null, null, null, 'most_days', 'private', null);
    reset role;
    update public.journeys set started_at = now() - interval '20 days' where id = jj;
    jids := jids || jj;
  end loop;

  -- Each scenario below feeds its bird the sequence, one a day ending an hour
  -- ago, and records the level (or "pause:<kind>", "recheck") after each.

  -- 1) A one-day dip: no alert.
  seq := array[400, 399, 388, 400, 401]; expect := array['none', 'none', 'none', 'none', 'none']; got := '{}';
  n := array_length(seq, 1);
  for k in 1 .. n loop
    insert into public.weight_entries (bird_id, grams, measured_at) values (birds[1], seq[k], now() - make_interval(days => n - k, hours => 1));
    perform set_config('request.jwt.claims', json_build_object('sub', fm, 'role', 'authenticated')::text, true);
    set local role authenticated;
    select * into r from public.journey_weight_check(jids[1]);
    reset role;
    got := got || (case when r.paused then 'pause:' || r.pause_kind when r.recheck then 'recheck' else r.level end);
  end loop;
  if got = expect then passed := passed + 1; else failed := array_append(failed, 'one-day dip ' || got::text); end if;

  -- 2) A gradual drop and recovery: the heads-up at 2.5%, kept until back within 1.5%.
  seq := array[396, 392, 390, 389, 388, 392, 396, 398];
  expect := array['none', 'none', 'none', 'none', 'notice', 'notice', 'notice', 'none']; got := '{}';
  n := array_length(seq, 1);
  for k in 1 .. n loop
    insert into public.weight_entries (bird_id, grams, measured_at) values (birds[2], seq[k], now() - make_interval(days => n - k, hours => 1));
    perform set_config('request.jwt.claims', json_build_object('sub', fm, 'role', 'authenticated')::text, true);
    set local role authenticated;
    select * into r from public.journey_weight_check(jids[2]);
    reset role;
    got := got || (case when r.paused then 'pause:' || r.pause_kind when r.recheck then 'recheck' else r.level end);
  end loop;
  if got = expect then passed := passed + 1; else failed := array_append(failed, 'gradual drop and recovery ' || got::text); end if;

  -- 3) Crossing 5%: the 3-weigh-in average pauses (existing message and resume).
  seq := array[388, 378, 374]; expect := array['none', 'notice', 'pause:drop']; got := '{}';
  n := array_length(seq, 1);
  for k in 1 .. n loop
    insert into public.weight_entries (bird_id, grams, measured_at) values (birds[3], seq[k], now() - make_interval(days => n - k, hours => 1));
    perform set_config('request.jwt.claims', json_build_object('sub', fm, 'role', 'authenticated')::text, true);
    set local role authenticated;
    select * into r from public.journey_weight_check(jids[3]);
    reset role;
    got := got || (case when r.paused then 'pause:' || r.pause_kind when r.recheck then 'recheck' else r.level end);
  end loop;
  ok := got = expect and r.start_grams = 400 and r.avg_grams = 380
    and (select status = 'paused' and paused_reason = 'weight_drop' and weight_pause_kind = 'drop' from public.journeys where id = jids[3]);
  if ok then passed := passed + 1; else failed := array_append(failed, 'crossing 5% ' || got::text); end if;

  -- 4) A slow slide: the week's average 3% below pauses even under 5%.
  seq := array[389, 388, 387, 387]; expect := array['none', 'notice', 'notice', 'pause:slide']; got := '{}';
  n := array_length(seq, 1);
  for k in 1 .. n loop
    insert into public.weight_entries (bird_id, grams, measured_at) values (birds[4], seq[k], now() - make_interval(days => n - k, hours => 1));
    perform set_config('request.jwt.claims', json_build_object('sub', fm, 'role', 'authenticated')::text, true);
    set local role authenticated;
    select * into r from public.journey_weight_check(jids[4]);
    reset role;
    got := got || (case when r.paused then 'pause:' || r.pause_kind when r.recheck then 'recheck' else r.level end);
  end loop;
  if got = expect and r.drop_pct < 5 then passed := passed + 1; else failed := array_append(failed, 'slow slide ' || got::text); end if;

  -- 5) A sudden drop, not confirmed: asks for a re-weigh; the re-weigh is fine, so the odd reading is left out.
  seq := array[400, 360, 399]; expect := array['none', 'recheck', 'none']; got := '{}';
  n := array_length(seq, 1);
  for k in 1 .. n loop
    insert into public.weight_entries (bird_id, grams, measured_at) values (birds[5], seq[k], now() - make_interval(days => n - k, hours => 1));
    perform set_config('request.jwt.claims', json_build_object('sub', fm, 'role', 'authenticated')::text, true);
    set local role authenticated;
    select * into r from public.journey_weight_check(jids[5]);
    reset role;
    got := got || (case when r.paused then 'pause:' || r.pause_kind when r.recheck then 'recheck' else r.level end);
  end loop;
  ok := got = expect and r.excluded @> '[{"grams": 360, "reason": "unconfirmed"}]'::jsonb and r.current_grams = 399
    and (select status from public.journeys where id = jids[5]) = 'active';
  if ok then passed := passed + 1; else failed := array_append(failed, 'sudden drop, not confirmed ' || got::text); end if;

  -- 6) A sudden drop, confirmed by the re-weigh: pause ("dropped quickly").
  seq := array[400, 360, 362]; expect := array['none', 'recheck', 'pause:sudden']; got := '{}'; ok := false;
  n := array_length(seq, 1);
  for k in 1 .. n loop
    insert into public.weight_entries (bird_id, grams, measured_at) values (birds[6], seq[k], now() - make_interval(days => n - k, hours => 1));
    perform set_config('request.jwt.claims', json_build_object('sub', fm, 'role', 'authenticated')::text, true);
    set local role authenticated;
    select * into r from public.journey_weight_check(jids[6]);
    reset role;
    if k = 2 then ok := r.recheck_grams = 360 and r.excluded @> '[{"grams": 360, "reason": "pending"}]'::jsonb and r.avg_grams = 400; end if;
    got := got || (case when r.paused then 'pause:' || r.pause_kind when r.recheck then 'recheck' else r.level end);
  end loop;
  if got = expect and ok then passed := passed + 1; else failed := array_append(failed, 'sudden drop, confirmed ' || got::text); end if;

  -- 7) A 30 g bird bouncing by 1 g: under the 2 g floor, so no alert of any kind.
  seq := array[29, 30, 29, 30, 29, 29, 29]; expect := array['none', 'none', 'none', 'none', 'none', 'none', 'none']; got := '{}';
  n := array_length(seq, 1);
  for k in 1 .. n loop
    insert into public.weight_entries (bird_id, grams, measured_at) values (birds[7], seq[k], now() - make_interval(days => n - k, hours => 1));
    perform set_config('request.jwt.claims', json_build_object('sub', fm, 'role', 'authenticated')::text, true);
    set local role authenticated;
    select * into r from public.journey_weight_check(jids[7]);
    reset role;
    got := got || (case when r.paused then 'pause:' || r.pause_kind when r.recheck then 'recheck' else r.level end);
  end loop;
  if got = expect and r.drop_pct >= 2.5 then passed := passed + 1; else failed := array_append(failed, '30 g bird bouncing 1 g ' || got::text); end if;

  -- 8) Missed weigh-ins: after 2 days, on the journey and in Today's list; a weigh-in clears it. Only the household sees it.
  insert into public.weight_entries (bird_id, grams, measured_at) values (birds[8], 400, now() - interval '3 days');
  perform set_config('request.jwt.claims', json_build_object('sub', fm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select * into r from public.journey_weight_check(jids[8]);
  ok := r.missed and r.days_since_weigh = 3
    and exists (select 1 from public.journey_weigh_reminders() x where x.journey_id = jids[8] and x.days_since_weigh = 3)
    and not exists (select 1 from public.journey_weigh_reminders() x where x.journey_id = jids[2]);
  reset role;
  insert into public.weight_entries (bird_id, grams, measured_at) values (birds[8], 401, now() - interval '1 hour');
  perform set_config('request.jwt.claims', json_build_object('sub', fm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select * into r from public.journey_weight_check(jids[8]);
  ok := ok and not r.missed and not exists (select 1 from public.journey_weigh_reminders() x where x.journey_id = jids[8]);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', st, 'role', 'authenticated')::text, true);
  set local role authenticated;
  denied := not exists (select 1 from public.journey_weigh_reminders());  -- someone else: nothing
  reset role;
  if ok and denied then passed := passed + 1; else failed := array_append(failed, 'missed weigh-ins'); end if;

  -- 9) The usual weigh-in: a reading taken after a meal (usually before) is left out, and says so.
  insert into public.weight_entries (bird_id, grams, measured_at, meal_relation) values
    (birds[9], 401, now() - interval '2 days 1 hour', 'before_meal'),
    (birds[9], 360, now() - interval '1 day 1 hour', 'after_meal'),
    (birds[9], 399, now() - interval '1 hour', 'before_meal');
  perform set_config('request.jwt.claims', json_build_object('sub', fm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select * into r from public.journey_weight_check(jids[9]);
  reset role;
  ok := r.usual_meal = 'before_meal' and r.level = 'none' and not r.recheck and not r.paused
    and r.excluded @> '[{"grams": 360, "reason": "other_time"}]'::jsonb and r.avg_grams = 400;
  if ok then passed := passed + 1; else failed := array_append(failed, 'weighed at a different time than usual'); end if;

  -- 10) The numbers are settings an admin changes; nobody else can, and they must make sense.
  perform set_config('request.jwt.claims', json_build_object('sub', fm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  denied := false; begin perform public.admin_set_diet_weight_rules('{"diet_sudden_drop_pct": 9}'); exception when insufficient_privilege then denied := true; end;
  reset role;
  ok := denied and (select diet_sudden_drop_pct = 8 and diet_min_drop_grams = 2 and diet_missed_days = 2 from public.journey_settings);
  if ok then passed := passed + 1; else failed := array_append(failed, 'weight rules are admin settings'); end if;

  -- 11) A vet-confirmed resume clears the pause and its kind, and measures from the latest weight.
  perform set_config('request.jwt.claims', json_build_object('sub', fm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.journey_resume_after_vet(jids[6], true);
  select * into r from public.journey_weight_check(jids[6]);
  reset role;
  ok := not r.paused and r.pause_kind is null and r.start_grams = 362 and r.level = 'none'
    and (select status = 'active' and weight_pause_kind is null from public.journeys where id = jids[6]);
  if ok then passed := passed + 1; else failed := array_append(failed, 'resume after a sudden-drop pause'); end if;

  raise exception 'DIET WEIGHT RULES CHECKS: % passed, % failed%', passed, coalesce(array_length(failed, 1), 0),
    case when array_length(failed, 1) > 0 then ': ' || array_to_string(failed, ', ') else '' end;
end $$;
