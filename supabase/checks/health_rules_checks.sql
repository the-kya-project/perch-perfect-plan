-- Health rules: the database's health values match src/lib/healthRules.ts,
-- and the health feature switches (20261122203000_health_features.sql) work.
--
-- The expected values below are copies of src/lib/healthRules.ts and
-- src/lib/healthFeatures.ts; `npm run test:health-rules` fails if they drift
-- from those files. So a value changed in only one place (the file, this
-- check, or the database) fails one of the two.
--
-- Self-contained and leaves nothing behind: it raises at the end so the whole
-- block rolls back. The exception message IS the result:
--   "HEALTH RULES CHECKS: n passed, 0 failed"           → all good
--   "HEALTH RULES CHECKS: n passed, k failed: <names>"  → which ones broke
-- Run by .github/workflows/db-checks.yml on every PR (scripts/db-checks.sh).
do $$
declare
  -- DIET_WEIGHT_RULES
  expected_diet jsonb := '{"diet_pause_drop_pct": 5, "diet_notice_drop_pct": 2.5, "diet_notice_clear_pct": 1.5, "diet_avg_count": 3, "diet_avg_recent_days": 3, "diet_avg_min_recent": 2, "diet_slide_days": 7, "diet_slide_drop_pct": 3, "diet_slide_min_readings": 4, "diet_sudden_drop_pct": 8, "diet_min_drop_grams": 2, "diet_missed_days": 2}';
  -- VET_SIGNS_TODAY
  expected_today jsonb := '["black droppings", "bleeding", "blood", "blood in droppings", "bloody droppings", "breathing hard", "breathing heavily", "can''t perch", "change in droppings", "clicking when breathing", "discharge from", "droppings changed", "eating less", "fluffed up all day", "fluffed up and sleeping", "fluffing up", "isn''t eating", "lethargic", "losing weight", "lost weight", "no droppings", "not eating", "not eating much", "on the bottom of the cage", "on the cage floor", "open mouth breathing", "open-mouth breathing", "puffed up all day", "sitting on the cage floor", "sitting on the floor of the cage", "sleeping a lot", "sleeping more", "sleeping on the bottom", "sleepy all day", "stopped eating", "swollen", "tail bob", "tail bobbing", "tail is bobbing", "throwing up", "vomiting", "watery droppings", "wheezing", "won''t eat"]';
  -- VET_SIGNS_URGENT
  expected_urgent jsonb := '["ate avocado", "ate chocolate", "ate something toxic", "bad fall", "bitten by a cat", "bitten by a dog", "bleeding a lot", "bleeding won''t stop", "blood feather broke", "breathed in fumes", "breathed smoke", "broke a blood feather", "broken a blood feather", "broken blood feather", "burned a pan", "can''t get up", "can''t pass an egg", "can''t pass her egg", "can''t stand", "can''t stand up", "can''t stop the bleeding", "cat bit", "cat bite", "chewed lead", "chewed zinc", "convulsing", "crashed into", "dog bit", "dog bite", "drank alcohol", "drank coffee", "egg binding", "egg bound", "egg is stuck", "egg-binding", "egg-bound", "falling off her perch", "falling off his perch", "falling off the perch", "fell off her perch", "fell off his perch", "fell off the perch", "fluffed on the cage floor", "fluffed on the floor", "fluffed up on the floor", "fumes", "got burned", "got into alcohol", "got into avocado", "had a seizure", "had caffeine", "hard fall", "has a burn", "having a seizure", "heavy metal poisoning", "house fire", "keeps regurgitating", "keeps throwing up", "keeps vomiting", "lead paint", "lead poisoning", "overheated a pan", "pan fumes", "poisoned", "poisoning", "ptfe fumes", "regurgitating repeatedly", "seizure", "seizures", "sitting fluffed on the floor", "smoke inhalation", "sprayed in the room", "sprayed near", "still bleeding", "straining", "stuck egg", "teflon fumes", "throwing up repeatedly", "unable to stand", "vomiting again and again", "vomiting repeatedly", "won''t stop bleeding", "zinc poisoning"]';
  -- NECTAR_EATER_PATTERN
  expected_nectar text := '(lory|lories|lorikeet)';
  -- HEALTH_FEATURES (startsAt)
  expected_features jsonb := '{"daily_health_check": "everyone", "care_weight_trend": "everyone", "emergency_guides": "everyone", "passing_guidance": "everyone", "diet_conversion": "everyone", "vet_nudge": "everyone", "weight_baseline": "off"}';

  adm uuid := gen_random_uuid();
  usr uuid := gen_random_uuid();
  passed int := 0; failed text[] := '{}';
  settings jsonb;
  k text;
  actual jsonb;
  ok boolean;
  denied boolean;
begin
  -- 1) journey_settings holds exactly the file's diet weight rules.
  select to_jsonb(s) into settings from public.journey_settings s where s.id;
  for k in select jsonb_object_keys(expected_diet) loop
    if settings is not null and (settings ->> k)::numeric = (expected_diet ->> k)::numeric then
      passed := passed + 1;
    else
      failed := array_append(failed, 'journey_settings.' || k || ' = ' || coalesce(settings ->> k, 'missing'));
    end if;
  end loop;

  -- 2) Every diet_* setting in the table is in the file (nothing left unlisted).
  ok := true;
  for k in select jsonb_object_keys(settings) loop
    if k like 'diet\_%' and not expected_diet ? k then
      ok := false;
      failed := array_append(failed, 'journey_settings.' || k || ' is not in healthRules.ts');
    end if;
  end loop;
  if ok then passed := passed + 1; end if;

  -- 3) The vet nudge's phrases, tier by tier, match the file exactly.
  select coalesce(jsonb_agg(phrase order by phrase), '[]') into actual from public.flock_vet_signs where tier = 'today';
  if actual = (select jsonb_agg(v order by v) from jsonb_array_elements_text(expected_today) v) then
    passed := passed + 1;
  else
    failed := array_append(failed, 'flock_vet_signs today differs from VET_SIGNS_TODAY');
  end if;
  select coalesce(jsonb_agg(phrase order by phrase), '[]') into actual from public.flock_vet_signs where tier = 'urgent';
  if actual = (select jsonb_agg(v order by v) from jsonb_array_elements_text(expected_urgent) v) then
    passed := passed + 1;
  else
    failed := array_append(failed, 'flock_vet_signs urgent differs from VET_SIGNS_URGENT');
  end if;
  if not exists (select 1 from public.flock_vet_signs where tier not in ('today', 'urgent')) then
    passed := passed + 1;
  else
    failed := array_append(failed, 'flock_vet_signs has another tier');
  end if;

  -- 4) Nothing in the phrase list claims a vet review yet.
  if not exists (select 1 from public.flock_vet_signs where review_status <> 'draft') then
    passed := passed + 1;
  else
    failed := array_append(failed, 'a vet sign is not draft (update healthRules.ts when the vet approves)');
  end if;

  -- 5) The nectar-eater block uses the file's pattern.
  if pg_get_functiondef('private.is_nectar_eater(text)'::regprocedure) like '%''' || expected_nectar || '''%' then
    passed := passed + 1;
  else
    failed := array_append(failed, 'is_nectar_eater pattern differs from NECTAR_EATER_PATTERN');
  end if;

  -- 6) The switches start where the file says.
  select coalesce(jsonb_object_agg(feature, audience), '{}') into actual from public.health_features;
  if actual = expected_features then
    passed := passed + 1;
  else
    failed := array_append(failed, 'health_features rows differ from HEALTH_FEATURES: ' || actual::text);
  end if;

  -- The switches, as real accounts.
  insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values
    ('00000000-0000-0000-0000-000000000000', adm, 'authenticated', 'authenticated', adm::text || '@checks.invalid', '{}', '{}', now(), now()),
    ('00000000-0000-0000-0000-000000000000', usr, 'authenticated', 'authenticated', usr::text || '@checks.invalid', '{}', '{}', now(), now());
  insert into public.user_roles (user_id, role) values (adm, 'admin');

  update public.health_features set audience = 'everyone' where feature = 'daily_health_check';
  update public.health_features set audience = 'off' where feature = 'weight_baseline';

  -- 7) 'everyone' is on for a regular account; 'off' is off; an unknown feature is off.
  perform set_config('request.jwt.claims', json_build_object('sub', usr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := public.health_feature_enabled('daily_health_check')
        and not public.health_feature_enabled('weight_baseline')
        and not public.health_feature_enabled('no_such_feature');
  reset role;
  if ok then passed := passed + 1; else failed := array_append(failed, 'everyone / off / unknown'); end if;

  -- 8) 'off' is off for admins too.
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := not public.health_feature_enabled('weight_baseline');
  reset role;
  if ok then passed := passed + 1; else failed := array_append(failed, 'off for admins'); end if;

  -- 9) An admin can switch one to admins; then it's on for the admin only.
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.admin_set_health_feature('weight_baseline', 'admins');
  ok := public.health_feature_enabled('weight_baseline');
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', usr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := ok and not public.health_feature_enabled('weight_baseline');
  reset role;
  if ok then passed := passed + 1; else failed := array_append(failed, 'admins: admin on, user off'); end if;

  -- 10) A regular account can't flip a switch.
  denied := false;
  perform set_config('request.jwt.claims', json_build_object('sub', usr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.admin_set_health_feature('weight_baseline', 'everyone');
  exception when insufficient_privilege then
    denied := true;
  end;
  reset role;
  if denied and (select audience from public.health_features where feature = 'weight_baseline') = 'admins' then
    passed := passed + 1;
  else
    failed := array_append(failed, 'user cannot flip');
  end if;

  -- 11) Only existing features and the three audiences are accepted.
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  denied := false;
  begin
    perform public.admin_set_health_feature('no_such_feature', 'off');
  exception when no_data_found then
    denied := true;
  end;
  if denied then passed := passed + 1; else failed := array_append(failed, 'unknown feature refused'); end if;
  denied := false;
  begin
    perform public.admin_set_health_feature('weight_baseline', 'sometimes');
  exception when invalid_parameter_value then
    denied := true;
  end;
  if denied then passed := passed + 1; else failed := array_append(failed, 'bad audience refused'); end if;

  -- 12) App users can't read the table directly.
  denied := false;
  set local role authenticated;
  begin
    perform 1 from public.health_features;
  exception when insufficient_privilege then
    denied := true;
  end;
  reset role;
  if denied then passed := passed + 1; else failed := array_append(failed, 'no direct read'); end if;

  -- 13) Signed-out visitors can't call the switch.
  denied := false;
  set local role anon;
  begin
    perform public.health_feature_enabled('daily_health_check');
  exception when insufficient_privilege then
    denied := true;
  end;
  reset role;
  if denied then passed := passed + 1; else failed := array_append(failed, 'anon denied'); end if;

  raise exception 'HEALTH RULES CHECKS: % passed, % failed%', passed, coalesce(array_length(failed, 1), 0),
    case when array_length(failed, 1) > 0 then ': ' || array_to_string(failed, ', ') else '' end;
end $$;
