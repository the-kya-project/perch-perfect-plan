-- Care-app feature switches (20261123100000_care_features.sql) work, and
-- start where src/lib/careFeatures.ts says.
--
-- The expected starting values below are a copy of CARE_FEATURES in
-- src/lib/careFeatures.ts; `npm run test:today-card` fails if they drift.
--
-- Self-contained and leaves nothing behind: it raises at the end so the whole
-- block rolls back. The exception message IS the result:
--   "CARE FEATURES CHECKS: n passed, 0 failed"           → all good
--   "CARE FEATURES CHECKS: n passed, k failed: <names>"  → which ones broke
-- Run by .github/workflows/db-checks.yml on every PR (scripts/db-checks.sh).
do $$
declare
  -- CARE_FEATURES (startsAt)
  expected_features jsonb := '{"today_cards": "off", "care_badges": "off"}';

  adm uuid := gen_random_uuid();
  usr uuid := gen_random_uuid();
  passed int := 0; failed text[] := '{}';
  actual jsonb;
  ok boolean;
  denied boolean;
begin
  -- 1) The switches start where the file says.
  select coalesce(jsonb_object_agg(feature, audience), '{}') into actual from public.care_features;
  if actual = expected_features then
    passed := passed + 1;
  else
    failed := array_append(failed, 'care_features rows differ from CARE_FEATURES: ' || actual::text);
  end if;

  insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values
    ('00000000-0000-0000-0000-000000000000', adm, 'authenticated', 'authenticated', adm::text || '@checks.invalid', '{}', '{}', now(), now()),
    ('00000000-0000-0000-0000-000000000000', usr, 'authenticated', 'authenticated', usr::text || '@checks.invalid', '{}', '{}', now(), now());
  insert into public.user_roles (user_id, role) values (adm, 'admin');

  -- 2) 'off' is off for a regular account and for admins; an unknown feature is off.
  perform set_config('request.jwt.claims', json_build_object('sub', usr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := not public.care_feature_enabled('today_cards')
        and not public.care_feature_enabled('no_such_feature');
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := ok and not public.care_feature_enabled('today_cards');
  reset role;
  if ok then passed := passed + 1; else failed := array_append(failed, 'off for everyone'); end if;

  -- 3) An admin can switch it to admins; then it's on for the admin only.
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.admin_set_care_feature('today_cards', 'admins');
  ok := public.care_feature_enabled('today_cards');
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', usr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := ok and not public.care_feature_enabled('today_cards');
  reset role;
  if ok then passed := passed + 1; else failed := array_append(failed, 'admins: admin on, user off'); end if;

  -- 4) 'everyone' is on for a regular account.
  update public.care_features set audience = 'everyone' where feature = 'today_cards';
  perform set_config('request.jwt.claims', json_build_object('sub', usr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := public.care_feature_enabled('today_cards');
  reset role;
  update public.care_features set audience = 'admins' where feature = 'today_cards';
  if ok then passed := passed + 1; else failed := array_append(failed, 'everyone: user on'); end if;

  -- 5) A regular account can't flip a switch.
  denied := false;
  perform set_config('request.jwt.claims', json_build_object('sub', usr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.admin_set_care_feature('today_cards', 'everyone');
  exception when insufficient_privilege then
    denied := true;
  end;
  reset role;
  if denied and (select audience from public.care_features where feature = 'today_cards') = 'admins' then
    passed := passed + 1;
  else
    failed := array_append(failed, 'user cannot flip');
  end if;

  -- 6) Only existing features and the three audiences are accepted.
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  denied := false;
  begin
    perform public.admin_set_care_feature('no_such_feature', 'off');
  exception when no_data_found then
    denied := true;
  end;
  if denied then passed := passed + 1; else failed := array_append(failed, 'unknown feature refused'); end if;
  denied := false;
  begin
    perform public.admin_set_care_feature('today_cards', 'sometimes');
  exception when invalid_parameter_value then
    denied := true;
  end;
  if denied then passed := passed + 1; else failed := array_append(failed, 'bad audience refused'); end if;

  -- 7) App users can't read the table directly.
  denied := false;
  set local role authenticated;
  begin
    perform 1 from public.care_features;
  exception when insufficient_privilege then
    denied := true;
  end;
  reset role;
  if denied then passed := passed + 1; else failed := array_append(failed, 'no direct read'); end if;

  -- 8) Signed-out visitors can't call the switch.
  denied := false;
  set local role anon;
  begin
    perform public.care_feature_enabled('today_cards');
  exception when insufficient_privilege then
    denied := true;
  end;
  reset role;
  if denied then passed := passed + 1; else failed := array_append(failed, 'anon denied'); end if;

  raise exception 'CARE FEATURES CHECKS: % passed, % failed%', passed, coalesce(array_length(failed, 1), 0),
    case when array_length(failed, 1) > 0 then ': ' || array_to_string(failed, ', ') else '' end;
end $$;
