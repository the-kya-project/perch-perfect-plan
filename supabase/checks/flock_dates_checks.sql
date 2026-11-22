-- Verification for 20261122120000_flock_dates_set_together (no fixed
-- free-season end; opening day and the free season's end set together; a
-- server-only read of both dates).
--
-- Self-contained: its own admin and free user, moves the two dates around, then
-- raises so everything rolls back.
--   "FLOCK DATES CHECKS: n passed, 0 failed"           → all good
--   "FLOCK DATES CHECKS: n passed, k failed: <names>"  → which ones broke
-- Run by .github/workflows/db-checks.yml on every PR (scripts/db-checks.sh).
do $$
declare
  adm uuid := gen_random_uuid();
  fre uuid := gen_random_uuid();
  passed int := 0; failed text[] := '{}';
  ok boolean; st text; d record;
  o timestamptz := date_trunc('second', now()) + interval '30 days';
  e timestamptz := date_trunc('second', now()) + interval '200 days';
begin
  insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  select '00000000-0000-0000-0000-000000000000', u, 'authenticated', 'authenticated', u::text || '@checks.invalid', '{}', '{}', now(), now()
  from unnest(array[adm, fre]) as u;
  insert into public.user_roles (user_id, role) values (adm, 'admin');

  -- 1) No stored date and no default: the migration cleared it before opening.
  ok := (select column_default from information_schema.columns
          where table_schema = 'public' and table_name = 'flock_settings' and column_name = 'free_season_ends_at') is null
    and (select free_season_ends_at from public.flock_settings where id) is null
    and (select flock_opens_at from public.flock_settings where id) is null;
  if ok then passed := passed + 1; else failed := array_append(failed, 'no stored end, no default'); end if;

  -- 2) The database refuses a half-set opening, even written directly.
  st := null;
  begin update public.flock_settings set flock_opens_at = o, free_season_ends_at = null where id; exception when others then st := sqlstate; end;
  if st = '23514' then passed := passed + 1; else failed := array_append(failed, 'constraint: opening needs an end (' || coalesce(st, 'allowed') || ')'); end if;

  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- 3) Opening day alone is refused while there's no end.
  st := null; begin perform public.admin_set_flock_opens_at(o); exception when others then st := sqlstate; end;
  ok := st = '23514';
  -- 4) Together: one missing, or the end not after opening, is refused.
  st := null; begin perform public.admin_set_flock_dates(o, null); exception when others then st := sqlstate; end;
  ok := ok and st = '22004';
  st := null; begin perform public.admin_set_flock_dates(null, e); exception when others then st := sqlstate; end;
  ok := ok and st = '22004';
  st := null; begin perform public.admin_set_flock_dates(o, o); exception when others then st := sqlstate; end;
  ok := ok and st = '22023';
  if ok then passed := passed + 1; else failed := array_append(failed, 'half-set openings refused by the setters'); end if;

  -- 5) Both together are stored, and both can be cleared again before opening.
  perform public.admin_set_flock_dates(o, e);
  ok := (select flock_opens_at = o and free_season_ends_at = e from public.flock_settings where id);
  st := null; begin perform public.admin_set_free_season_ends_at(null); exception when others then st := sqlstate; end;
  ok := ok and st = '22004';  -- can't clear the end while opening day is set
  perform public.admin_set_flock_dates(null, null);
  ok := ok and (select flock_opens_at is null and free_season_ends_at is null from public.flock_settings where id);
  -- The end alone can be set and cleared while opening day isn't set.
  perform public.admin_set_free_season_ends_at(e);
  perform public.admin_set_free_season_ends_at(null);
  ok := ok and (select free_season_ends_at is null from public.flock_settings where id);
  reset role;
  if ok then passed := passed + 1; else failed := array_append(failed, 'set together, clear together'); end if;

  -- 6) Non-admins can't set the dates.
  perform set_config('request.jwt.claims', json_build_object('sub', fre, 'role', 'authenticated')::text, true);
  set local role authenticated;
  st := null; begin perform public.admin_set_flock_dates(o, e); exception when others then st := sqlstate; end;
  reset role;
  if st = '42501' then passed := passed + 1; else failed := array_append(failed, 'non-admin refused (' || coalesce(st, 'allowed') || ')'); end if;

  -- 7) The public-pages reader: empty dates while unset, the two dates once set,
  --    and only the service role may call it (no grant to app users or visitors).
  select * into d from public.flock_public_dates();
  ok := d.opens_at is null and d.free_season_ends_at is null;
  update public.flock_settings set free_season_ends_at = e, flock_opens_at = o where id;
  select * into d from public.flock_public_dates();
  ok := ok and d.opens_at = o and d.free_season_ends_at = e
    and not has_function_privilege('anon', 'public.flock_public_dates()', 'execute')
    and not has_function_privilege('authenticated', 'public.flock_public_dates()', 'execute')
    and has_function_privilege('service_role', 'public.flock_public_dates()', 'execute')
    and not has_function_privilege('anon', 'private.flock_public_dates()', 'execute')
    and not has_function_privilege('authenticated', 'private.flock_public_dates()', 'execute');
  if ok then passed := passed + 1; else failed := array_append(failed, 'public dates: values, service role only'); end if;

  -- 8) The gate is unchanged: admins only.
  ok := pg_get_functiondef('public.flock_enabled()'::regprocedure) like '%is_admin%';
  if ok then passed := passed + 1; else failed := array_append(failed, 'gate admins only'); end if;

  raise exception 'FLOCK DATES CHECKS: % passed, % failed%', passed, coalesce(array_length(failed, 1), 0),
    case when array_length(failed, 1) > 0 then ': ' || array_to_string(failed, ', ') else '' end;
end $$;
