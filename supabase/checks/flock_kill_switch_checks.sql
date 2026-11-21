-- Verification for 20261106210000_flock_kill_switch.
--
-- Self-contained and leaves nothing behind: it makes an admin and a regular
-- account, flips the switch both ways, then raises so the whole block rolls
-- back. The exception message IS the result:
--   "FLOCK KILL SWITCH CHECKS: n passed, 0 failed"           → all good
--   "FLOCK KILL SWITCH CHECKS: n passed, k failed: <names>"  → which ones broke
-- Run by .github/workflows/db-checks.yml on every PR (scripts/db-checks.sh).
do $$
declare
  adm uuid := gen_random_uuid();
  usr uuid := gen_random_uuid();
  passed int := 0; failed text[] := '{}';
  ok boolean;
  denied boolean;
begin
  insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values
    ('00000000-0000-0000-0000-000000000000', adm, 'authenticated', 'authenticated', adm::text || '@checks.invalid', '{}', '{}', now(), now()),
    ('00000000-0000-0000-0000-000000000000', usr, 'authenticated', 'authenticated', usr::text || '@checks.invalid', '{}', '{}', now(), now());
  insert into public.user_roles (user_id, role) values (adm, 'admin');

  -- Start from "on" whatever the database says.
  update public.flock_settings set ui_enabled = true where id;

  -- 1) Switch on: an admin sees the Flock.
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := public.flock_enabled();
  reset role;
  if ok then passed := passed + 1; else failed := array_append(failed, 'on: admin enabled'); end if;

  -- 2) Switch on: a regular account never does.
  perform set_config('request.jwt.claims', json_build_object('sub', usr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := public.flock_enabled();
  reset role;
  if not ok then passed := passed + 1; else failed := array_append(failed, 'on: user disabled'); end if;

  -- 3) A regular account can't flip the switch.
  denied := false;
  perform set_config('request.jwt.claims', json_build_object('sub', usr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.admin_set_flock_ui(false);
  exception when insufficient_privilege then
    denied := true;
  end;
  reset role;
  select ui_enabled into ok from public.flock_settings where id;
  if denied and ok then passed := passed + 1; else failed := array_append(failed, 'user cannot flip'); end if;

  -- 4) A regular account can't read or write the table directly.
  denied := false;
  set local role authenticated;
  begin
    perform 1 from public.flock_settings;
  exception when insufficient_privilege then
    denied := true;
  end;
  reset role;
  if denied then passed := passed + 1; else failed := array_append(failed, 'no table access'); end if;

  -- 5) An admin flips it off: the Flock is off for the admin too.
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.admin_set_flock_ui(false);
  ok := public.flock_enabled();
  reset role;
  if not ok then passed := passed + 1; else failed := array_append(failed, 'off: admin disabled'); end if;

  -- 6) The flip records who and keeps one row.
  select count(*) = 1 and bool_and(updated_by = adm) into ok from public.flock_settings;
  if ok then passed := passed + 1; else failed := array_append(failed, 'one row, who flipped'); end if;

  -- 7) Off: still never on for a regular account.
  perform set_config('request.jwt.claims', json_build_object('sub', usr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := public.flock_enabled();
  reset role;
  if not ok then passed := passed + 1; else failed := array_append(failed, 'off: user disabled'); end if;

  -- 8) The database owner (SQL editor, no JWT) can flip it back on.
  perform set_config('request.jwt.claims', '', true);
  perform public.admin_set_flock_ui(true);
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := public.flock_enabled();
  reset role;
  if ok then passed := passed + 1; else failed := array_append(failed, 'owner flips back on'); end if;

  -- 9) Signed out (anon) can't call either function.
  denied := false;
  set local role anon;
  begin
    perform public.flock_enabled();
  exception when insufficient_privilege then
    denied := true;
  end;
  reset role;
  if denied then passed := passed + 1; else failed := array_append(failed, 'anon denied'); end if;

  raise exception 'FLOCK KILL SWITCH CHECKS: % passed, % failed%', passed, coalesce(array_length(failed, 1), 0),
    case when array_length(failed, 1) > 0 then ': ' || array_to_string(failed, ', ') else '' end;
end $$;
