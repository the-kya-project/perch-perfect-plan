-- Weather cards (backlog D2.2, 20261128190000_weather_cards.sql): a home ZIP
-- or postcode is its owner's alone, the forecast cache is the server's alone,
-- and the switch starts off.
--
-- Self-contained and leaves nothing behind: it raises at the end so the whole
-- block rolls back. The exception message IS the result:
--   "WEATHER CARDS CHECKS: n passed, 0 failed"           → all good
--   "WEATHER CARDS CHECKS: n passed, k failed: <names>"  → which ones broke
-- Run by .github/workflows/db-checks.yml on every PR (scripts/db-checks.sh).
do $$
declare
  owner_id uuid := gen_random_uuid();
  other_id uuid := gen_random_uuid();
  passed int := 0; failed text[] := '{}';
  n int;
  denied boolean;
begin
  insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values
    ('00000000-0000-0000-0000-000000000000', owner_id, 'authenticated', 'authenticated', owner_id::text || '@checks.invalid', '{}', '{}', now(), now()),
    ('00000000-0000-0000-0000-000000000000', other_id, 'authenticated', 'authenticated', other_id::text || '@checks.invalid', '{}', '{}', now(), now());

  -- 1) The switch starts off, for everyone.
  if (select audience from public.care_features where feature = 'weather_cards') = 'off' then
    passed := passed + 1;
  else
    failed := array_append(failed, 'weather_cards starts off');
  end if;

  -- 2) An owner saves, reads, changes and hides the card on their own row.
  perform set_config('request.jwt.claims', json_build_object('sub', owner_id, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into public.home_postcodes (user_id, country, postcode) values (owner_id, 'US', '85004');
  update public.home_postcodes set postcode = '85005', weather_dismissed_on = current_date where user_id = owner_id;
  select count(*) into n from public.home_postcodes where postcode = '85005';
  reset role;
  if n = 1 then passed := passed + 1; else failed := array_append(failed, 'owner saves and reads own row'); end if;

  -- 3) Anyone else sees nothing, changes nothing, and can't write a row for them.
  perform set_config('request.jwt.claims', json_build_object('sub', other_id, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.home_postcodes;
  update public.home_postcodes set postcode = '10001' where user_id = owner_id;
  delete from public.home_postcodes where user_id = owner_id;
  denied := false;
  begin
    insert into public.home_postcodes (user_id, country, postcode) values (owner_id, 'NL', '1012');
  exception when insufficient_privilege then denied := true;
  end;
  reset role;
  if n = 0 and denied and (select postcode from public.home_postcodes where user_id = owner_id) = '85005' then
    passed := passed + 1;
  else
    failed := array_append(failed, 'another account can''t read or change it');
  end if;

  -- 4) Signed out: no access at all.
  denied := false;
  set local role anon;
  begin
    perform 1 from public.home_postcodes;
  exception when insufficient_privilege then denied := true;
  end;
  reset role;
  if denied then passed := passed + 1; else failed := array_append(failed, 'anon refused'); end if;

  -- 5) Only a US ZIP or a Dutch 4-digit postcode is stored.
  n := 0;
  begin insert into public.home_postcodes (user_id, country, postcode) values (other_id, 'US', '1012');
  exception when check_violation then n := n + 1; end;
  begin insert into public.home_postcodes (user_id, country, postcode) values (other_id, 'NL', '1012AB');
  exception when check_violation then n := n + 1; end;
  begin insert into public.home_postcodes (user_id, country, postcode) values (other_id, 'NL', '0123');
  exception when check_violation then n := n + 1; end;
  begin insert into public.home_postcodes (user_id, country, postcode) values (other_id, 'GB', '10001');
  exception when check_violation then n := n + 1; end;
  begin insert into public.home_postcodes (user_id, country, postcode) values (other_id, 'US', '00000');
  exception when check_violation then n := n + 1; end;
  if n = 5 then passed := passed + 1; else failed := array_append(failed, 'shape check refused ' || n || ' of 5'); end if;

  -- 6) The forecast cache is the server's: app users read and write nothing.
  insert into public.weather_forecasts (area, fetched_on, time_zone, days)
  values ('US:85005', current_date, 'America/Phoenix', '[{"date": "2026-07-01", "high_c": 40, "low_c": 28}]');
  perform set_config('request.jwt.claims', json_build_object('sub', owner_id, 'role', 'authenticated')::text, true);
  set local role authenticated;
  denied := false;
  begin
    perform 1 from public.weather_forecasts;
  exception when insufficient_privilege then denied := true;
  end;
  reset role;
  if denied then passed := passed + 1; else failed := array_append(failed, 'weather_forecasts closed to app users'); end if;

  -- 7) Removing it deletes it; deleting the account deletes it too.
  perform set_config('request.jwt.claims', json_build_object('sub', owner_id, 'role', 'authenticated')::text, true);
  set local role authenticated;
  delete from public.home_postcodes where user_id = owner_id;
  select count(*) into n from public.home_postcodes;
  reset role;
  insert into public.home_postcodes (user_id, country, postcode) values (other_id, 'NL', '1012');
  begin
    delete from auth.users where id = other_id;
  exception when others then
    failed := array_append(failed, 'deleting the account failed: ' || sqlerrm);
  end;
  if n = 0 and not exists (select 1 from public.home_postcodes where user_id in (owner_id, other_id)) then
    passed := passed + 1;
  else
    failed := array_append(failed, 'removed and deleted with the account');
  end if;

  -- 8) The no-ZIP prompt's "Got it" is its owner's alone, and goes with the account.
  perform set_config('request.jwt.claims', json_build_object('sub', owner_id, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into public.weather_prompt_dismissals (user_id) values (owner_id);
  select count(*) into n from public.weather_prompt_dismissals;
  denied := false;
  begin
    insert into public.weather_prompt_dismissals (user_id) values (gen_random_uuid());
  exception when insufficient_privilege then denied := true;
  end;
  reset role;
  if n = 1 and denied then passed := passed + 1; else failed := array_append(failed, 'prompt dismissal own row only'); end if;
  set local role anon;
  denied := false;
  begin
    perform 1 from public.weather_prompt_dismissals;
  exception when insufficient_privilege then denied := true;
  end;
  reset role;
  delete from auth.users where id = owner_id;
  if denied and not exists (select 1 from public.weather_prompt_dismissals where user_id = owner_id) then
    passed := passed + 1;
  else
    failed := array_append(failed, 'prompt dismissal closed to anon and deleted with the account');
  end if;

  raise exception 'WEATHER CARDS CHECKS: % passed, % failed%', passed, coalesce(array_length(failed, 1), 0),
    case when coalesce(array_length(failed, 1), 0) > 0 then ': ' || array_to_string(failed, '; ') else '' end;
end $$;
