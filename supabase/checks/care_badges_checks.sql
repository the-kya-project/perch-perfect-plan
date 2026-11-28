-- Verification for 20261128160000_care_badges (backlog 1.13b).
--
-- Self-contained and leaves nothing behind: an owner o with Kiwi (a long
-- history) and Mango (nothing but a household-caregiver sit), a household
-- member h on Kiwi, and a stranger x. Checks that the switch starts off and
-- off means nothing is recorded, each badge's rule, that past activity is
-- recorded once as at_launch, that later levels arrive unseen and not
-- at_launch, that seen clears them, that each person has their own rows, that
-- only people with access to the bird get anything, and that no app user reads
-- the tables, then rolls back.
--   "CARE BADGES CHECKS: n passed, 0 failed"           → all good
--   "CARE BADGES CHECKS: n passed, k failed: <names>"  → which ones broke
-- Run by .github/workflows/db-checks.yml on every PR (scripts/db-checks.sh).
do $$
declare
  o uuid := gen_random_uuid();
  h uuid := gen_random_uuid();
  x uuid := gen_random_uuid();
  kiwi uuid := gen_random_uuid();
  mango uuid := gen_random_uuid();
  s_link uuid; s_home uuid;
  wk timestamptz := date_trunc('week', now());
  passed int := 0; failed text[] := '{}';
  ok boolean; denied boolean; n int;
  got jsonb;
begin
  insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  select '00000000-0000-0000-0000-000000000000', u, 'authenticated', 'authenticated', u::text || '@checks.invalid', '{}', '{}', now(), now()
  from unnest(array[o, h, x]) as u;
  insert into public.birds (id, owner_id, name, species) values (kiwi, o, 'Kiwi', 'Cockatiel'), (mango, o, 'Mango', 'Sun conure');
  insert into public.bird_members (bird_id, user_id, role) values (kiwi, h, 'household');

  -- Kiwi's history: weigh-ins on 12 weeks in a row (ending three weeks ago),
  -- a gap, then 2 more weeks in a row; a check on each of the last 8 days,
  -- after a 5-day run a month ago; and a sit with a sitter link.
  insert into public.weight_entries (bird_id, grams, measured_at)
  select kiwi, 90, wk - make_interval(weeks => k) + interval '2 days 9 hours' from generate_series(3, 14) k;
  insert into public.weight_entries (bird_id, grams, measured_at)
  select kiwi, 91, wk - make_interval(weeks => k) + interval '1 day 8 hours' from generate_series(0, 1) k;
  insert into public.weight_entries (bird_id, grams, measured_at) values (kiwi, 92, wk - interval '1 week' + interval '5 days');
  insert into public.daily_logs (bird_id, log_date) select kiwi, current_date - k from generate_series(0, 7) k;
  insert into public.daily_logs (bird_id, log_date) select kiwi, current_date - k from generate_series(30, 34) k;
  insert into public.sits (owner_id, sitter_name, start_date, end_date, invite_token, token_expires_at)
  values (o, 'Sam', current_date, current_date + 3, 'care-badges-check-link', now() + interval '4 days') returning id into s_link;
  insert into public.sit_birds (sit_id, bird_id) values (s_link, kiwi);
  -- Mango: only a household caregiver's sit, which isn't a sitter link.
  insert into public.sits (owner_id, sitter_name, start_date, end_date, caregiver_user_id)
  values (o, 'Home', current_date, current_date + 3, h) returning id into s_home;
  insert into public.sit_birds (sit_id, bird_id) values (s_home, mango);

  -- 1) The switch starts off, and off returns nothing and records nothing.
  if (select audience from public.care_features where feature = 'care_badges') = 'off' then
    passed := passed + 1;
  else
    failed := array_append(failed, 'care_badges starts off');
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', o, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.care_my_badges(kiwi, true);
  reset role;
  if n = 0 and not exists (select 1 from public.care_badge_awards) and not exists (select 1 from public.care_badge_syncs) then
    passed := passed + 1;
  else
    failed := array_append(failed, 'off: nothing returned or recorded');
  end if;

  update public.care_features set audience = 'everyone' where feature = 'care_badges';

  -- 2) Each badge's rule, recorded once from history as at_launch and unseen.
  perform set_config('request.jwt.claims', json_build_object('sub', o, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select jsonb_agg(jsonb_build_array(badge, level, unseen, at_launch)) into got from public.care_my_badges(kiwi, true);
  reset role;
  if got = '[["steady_scale", 12, true, true], ["daily_check_in", 7, true, true], ["plan_ready", 1, true, true], ["sitter_ready", 1, true, true]]'::jsonb then
    passed := passed + 1;
  else
    failed := array_append(failed, 'Kiwi history: ' || coalesce(got::text, 'null'));
  end if;

  -- 3) Mango: nothing earned, every badge still listed in order at level 0; a
  -- household caregiver's sit isn't a sitter link; plan_ready false is 0.
  perform set_config('request.jwt.claims', json_build_object('sub', o, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select jsonb_agg(jsonb_build_array(badge, level)) into got from public.care_my_badges(mango, false);
  reset role;
  if got = '[["steady_scale", 0], ["daily_check_in", 0], ["plan_ready", 0], ["sitter_ready", 0]]'::jsonb
     and not exists (select 1 from public.care_badge_awards where bird_id = mango) then
    passed := passed + 1;
  else
    failed := array_append(failed, 'Mango nothing earned: ' || coalesce(got::text, 'null'));
  end if;

  -- 4) Seen clears the celebration for the named badges, then for all.
  perform set_config('request.jwt.claims', json_build_object('sub', o, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.care_badges_seen(kiwi, array['plan_ready']);
  select count(*) into n from public.care_my_badges(kiwi, true) where unseen;
  ok := n = 3;
  perform public.care_badges_seen(kiwi, null);
  select count(*) into n from public.care_my_badges(kiwi, true) where unseen;
  ok := ok and n = 0;
  reset role;
  if ok then passed := passed + 1; else failed := array_append(failed, 'seen clears'); end if;

  -- 5) Once earned, a badge stays earned (plan_ready reported false later).
  perform set_config('request.jwt.claims', json_build_object('sub', o, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select level into n from public.care_my_badges(kiwi, false) where badge = 'plan_ready';
  reset role;
  if n = 1 then passed := passed + 1; else failed := array_append(failed, 'earned stays earned'); end if;

  -- 6) After the first 10 minutes, a new level arrives unseen and not at_launch.
  update public.care_badge_syncs set first_synced_at = now() - interval '1 hour' where user_id = o;
  insert into public.daily_logs (bird_id, log_date) select kiwi, current_date - k from generate_series(8, 29) k;
  perform set_config('request.jwt.claims', json_build_object('sub', o, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select jsonb_agg(jsonb_build_array(badge, level, unseen, at_launch)) into got from public.care_my_badges(kiwi, true) where badge = 'daily_check_in';
  reset role;
  if got = '[["daily_check_in", 30, true, false]]'::jsonb then
    passed := passed + 1;
  else
    failed := array_append(failed, 'new level later: ' || coalesce(got::text, 'null'));
  end if;

  -- 7) The household member gets their own rows and their own celebration.
  perform set_config('request.jwt.claims', json_build_object('sub', h, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.care_my_badges(kiwi, false) where unseen and at_launch and level > 0;
  reset role;
  if n = 3 and (select count(*) from public.care_badge_awards where user_id = h) = 3
     and (select count(*) from public.care_badge_awards where user_id = o and unseen) = 1 then
    passed := passed + 1;
  else
    failed := array_append(failed, 'household own rows: ' || n);
  end if;

  -- 8) A stranger, the household member on a bird they don't share, and a
  -- signed-out visitor get nothing.
  denied := false;
  perform set_config('request.jwt.claims', json_build_object('sub', x, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.care_my_badges(kiwi, true);
  exception when insufficient_privilege then denied := true;
  end;
  reset role;
  ok := denied;
  denied := false;
  perform set_config('request.jwt.claims', json_build_object('sub', h, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.care_my_badges(mango, true);
  exception when insufficient_privilege then denied := true;
  end;
  reset role;
  ok := ok and denied;
  denied := false;
  perform set_config('request.jwt.claims', '', true);
  set local role anon;
  begin
    perform public.care_my_badges(kiwi, true);
  exception when insufficient_privilege then denied := true;
  end;
  reset role;
  ok := ok and denied and not exists (select 1 from public.care_badge_awards where user_id = x);
  if ok then passed := passed + 1; else failed := array_append(failed, 'only people with access'); end if;

  -- 9) No app user reads or writes the tables directly.
  ok := true;
  perform set_config('request.jwt.claims', json_build_object('sub', o, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform 1 from public.care_badge_awards;
    ok := false;
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.care_badge_syncs;
    ok := false;
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.care_badge_awards (user_id, bird_id, badge, level) values (o, mango, 'plan_ready', 1);
    ok := false;
  exception when insufficient_privilege then null;
  end;
  reset role;
  if ok then passed := passed + 1; else failed := array_append(failed, 'no direct table access'); end if;

  -- 10) Weeks are counted in the owner's time zone: a Sunday-night weigh-in in
  -- Los Angeles is that week, though it's Monday in UTC. Four weeks in a row
  -- there (two Sunday nights, then two Monday mornings) are only three in UTC.
  -- An unknown time zone falls back to UTC instead of failing.
  update public.profiles set time_zone = 'America/Los_Angeles' where id = o;
  insert into public.weight_entries (bird_id, grams, measured_at)
  select mango, 300, (date_trunc('week', now() at time zone 'America/Los_Angeles') - make_interval(weeks => k)
                      + case when k >= 3 then interval '6 days 22 hours' else interval '10 hours' end) at time zone 'America/Los_Angeles'
  from generate_series(1, 4) k;
  select level into n from private.care_badge_levels(mango, false) where badge = 'steady_scale';
  ok := n = 4;
  update public.profiles set time_zone = 'Not/AZone' where id = o;
  select level into n from private.care_badge_levels(mango, false) where badge = 'steady_scale';
  ok := ok and n = 0;
  update public.profiles set time_zone = null where id = o;
  select level into n from private.care_badge_levels(mango, false) where badge = 'steady_scale';
  ok := ok and n = 0;
  if ok then passed := passed + 1; else failed := array_append(failed, 'owner time zone weeks'); end if;

  raise exception 'CARE BADGES CHECKS: % passed, % failed%', passed, coalesce(array_length(failed, 1), 0),
    case when array_length(failed, 1) > 0 then ': ' || array_to_string(failed, '; ') else '' end;
end;
$$;
