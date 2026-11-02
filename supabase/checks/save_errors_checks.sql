-- Verification for 20261102120000_save_error_alerts.
--
-- Self-contained and leaves nothing behind: it records failed saves as an
-- anonymous visitor and as a signed-in person, checks that neither can read,
-- change or forge anything, then raises an exception so the whole block rolls
-- back. The exception message IS the result:
--   "SAVE ERRORS CHECKS: n passed, 0 failed"           → all good
--   "SAVE ERRORS CHECKS: n passed, k failed: <names>"  → which ones broke
-- Run it in the SQL editor (or the Supabase MCP execute_sql) on a branch.
do $$
declare
  u uuid := gen_random_uuid();
  passed int := 0; failed text[] := '{}';
  n int; ok boolean; h text; before int;
  -- A row as the app sends it (saveErrorReporting.ts).
  ins constant text := $q$insert into public.save_errors (category, sqlstate, target, operation, route, platform, app_version, web_build, user_role, environment, user_hash)
    values ('permission', '42501', 'sits', 'write', '/sits/new', 'ios', '1.4.2', 'abc1234', 'owner', 'production', %L)$q$;
begin
  insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', u, 'authenticated', 'authenticated', u::text || '@checks.invalid', '{}', '{}', now(), now());

  -- 1) An anonymous visitor (a sitter link) can record a failed save.
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  set local role anon;
  begin
    execute format(ins, 'anon:' || repeat('a', 32));
    ok := true;
  exception when others then ok := false;
  end;
  reset role;
  select count(*) into n from public.save_errors where user_hash = 'anon:' || repeat('a', 32);
  if ok and n = 1 then passed := passed + 1; else failed := array_append(failed, format('anon can insert (%s, %s)', ok, n)); end if;

  -- 2) …but can't read it back.
  set local role anon;
  begin
    perform count(*) from public.save_errors;
    ok := false;
  exception when insufficient_privilege then ok := true;
  end;
  reset role;
  if ok then passed := passed + 1; else failed := array_append(failed, 'anon cannot read'); end if;

  -- 3) An anonymous hash must be marked anon: — anything else is dropped.
  set local role anon;
  execute format(ins, repeat('b', 64));
  reset role;
  select count(*) into n from public.save_errors where user_hash = repeat('b', 64);
  if n = 0 then passed := passed + 1; else failed := array_append(failed, 'anon cannot pose as a signed-in hash'); end if;

  -- 4) A signed-in person's hash is set by the database, whatever was sent:
  --    sha256('kya:' || id), the same id as src/lib/userHash.ts.
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  set local role authenticated;
  execute format(ins, 'anon:' || repeat('c', 32));
  reset role;
  h := encode(sha256(convert_to('kya:' || u::text, 'UTF8')), 'hex');
  select count(*) into n from public.save_errors where user_hash = h;
  if n = 1 then passed := passed + 1; else failed := array_append(failed, format('signed-in hash set by the database (%s)', n)); end if;

  -- 5) Signed in: no read, update or delete.
  set local role authenticated;
  begin
    perform count(*) from public.save_errors;
    ok := false;
  exception when insufficient_privilege then ok := true;
  end;
  if ok then
    begin
      update public.save_errors set category = 'network';
      ok := false;
    exception when insufficient_privilege then ok := true;
    end;
  end if;
  if ok then
    begin
      delete from public.save_errors;
      ok := false;
    exception when insufficient_privilege then ok := true;
    end;
  end if;
  reset role;
  if ok then passed := passed + 1; else failed := array_append(failed, 'authenticated cannot read, update or delete'); end if;

  -- 6) Asking for the row back (insert … returning, i.e. .insert().select())
  --    fails: there is no read policy. The app's insert must not ask, which is
  --    why saveErrorReporting.ts doesn't call .select().
  set local role authenticated;
  begin
    execute format(ins, null) || ' returning id';
    ok := false;
  exception when insufficient_privilege then ok := true;
  end;
  reset role;
  if ok then passed := passed + 1; else failed := array_append(failed, 'insert returning is refused'); end if;

  -- 7) Only the listed columns: the time can't be set by the app.
  set local role authenticated;
  begin
    insert into public.save_errors (created_at, category, route, platform, app_version)
    values (now() - interval '2 days', 'network', '/', 'web', '1.0.0');
    ok := false;
  exception when insufficient_privilege then ok := true;
  end;
  reset role;
  if ok then passed := passed + 1; else failed := array_append(failed, 'created_at not insertable'); end if;

  -- 8) Shapes only: free text in a column is refused.
  set local role authenticated;
  begin
    insert into public.save_errors (category, route, platform, app_version)
    values ('Kiwi would not save', '/', 'web', '1.0.0');
    ok := false;
  exception when check_violation then ok := true;
  end;
  if ok then
    begin
      insert into public.save_errors (category, route, platform, app_version)
      values ('network', '/birds/Kiwi has a note', 'web', '1.0.0');
      ok := false;
    exception when check_violation then ok := true;
    end;
  end if;
  reset role;
  if ok then passed := passed + 1; else failed := array_append(failed, 'free text refused'); end if;

  -- 9) Flood guard: past 30 rows in 10 minutes, one person's rows are dropped
  --    quietly (no error for the app to report).
  select count(*) into before from public.save_errors where user_hash = h;
  set local role authenticated;
  for i in 1..40 loop
    execute format(ins, null);
  end loop;
  reset role;
  select count(*) into n from public.save_errors where user_hash = h;
  if before < 30 and n = 30 then passed := passed + 1; else failed := array_append(failed, format('30 per person per 10 minutes (%s)', n)); end if;

  -- 10) The alert log is for the service role only.
  set local role authenticated;
  begin
    perform count(*) from public.save_error_alerts;
    ok := false;
  exception when insufficient_privilege then ok := true;
  end;
  reset role;
  set local role anon;
  begin
    insert into public.save_error_alerts (kind, signature, alert_day) values ('daily', 'daily', current_date);
    ok := false;
  exception when insufficient_privilege then ok := ok and true;
  end;
  reset role;
  if ok then passed := passed + 1; else failed := array_append(failed, 'alert log closed to app users'); end if;

  -- 11) The service role reads everything (the alert hook).
  set local role service_role;
  select count(*) into n from public.save_errors where user_hash = h;
  reset role;
  if n = 30 then passed := passed + 1; else failed := array_append(failed, format('service role reads rows (%s)', n)); end if;

  -- 12) A save that succeeds records nothing.
  select count(*) into before from public.save_errors;
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into public.birds (owner_id, name) values (u, 'Check bird');
  reset role;
  select count(*) into n from public.save_errors;
  if n = before then passed := passed + 1; else failed := array_append(failed, 'successful save records nothing'); end if;

  raise exception 'SAVE ERRORS CHECKS: % passed, % failed%', passed, coalesce(array_length(failed, 1), 0),
    case when array_length(failed, 1) > 0 then ': ' || array_to_string(failed, '; ') else '' end;
end
$$;
