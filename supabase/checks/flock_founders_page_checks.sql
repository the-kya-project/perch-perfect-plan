-- Verification for 20261121120000_flock_founders_page (build H).
--
-- Self-contained and leaves nothing behind: three founders (spots 1, 2, 3;
-- 1 and 3 opt in), a member, a free user. Raises at the end so everything
-- rolls back.
--   "FLOCK FOUNDERS PAGE CHECKS: n passed, 0 failed"           → all good
--   "FLOCK FOUNDERS PAGE CHECKS: n passed, k failed: <names>"  → which ones broke
-- Run by .github/workflows/db-checks.yml on every PR (scripts/db-checks.sh).
do $$
declare
  f1 uuid := gen_random_uuid();
  f2 uuid := gen_random_uuid();
  f3 uuid := gen_random_uuid();
  m  uuid := gen_random_uuid();
  fr uuid := gen_random_uuid();
  base int;
  passed int := 0; failed text[] := '{}';
  ok boolean; denied boolean; v boolean;
begin
  -- Spots past any real claim, so the checks never collide with staging data.
  select coalesce(max(spot_number), 0) into base from public.founding_claims;
  if base > 47 then
    raise exception 'FLOCK FOUNDERS PAGE CHECKS: 0 passed, 1 failed: no free spots left to test with';
  end if;
  insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  select '00000000-0000-0000-0000-000000000000', x, 'authenticated', 'authenticated', x::text || '@checks.invalid', '{}', '{}', now(), now()
  from unnest(array[f1, f2, f3, m, fr]) as x;
  insert into public.entitlements (user_id, plan, status, source, starts_at)
  select x, 'comp', 'active', 'manual', now() - interval '1 day' from unnest(array[f1, f2, f3, m]) as x;
  insert into public.flock_profiles (user_id, display_name, region_slug, setup_completed_at) values
    (f1, 'Ada L.', 'great-lakes', now()), (f2, 'Ben K.', 'texas', now()), (f3, 'Cleo M.', 'texas', now()), (m, 'Mo P.', 'great-lakes', now());
  insert into public.founding_claims (user_id, spot_number, region_slug) values
    (f1, base + 1, 'great-lakes'), (f2, base + 2, 'texas'), (f3, base + 3, 'texas');

  -- 1) New and existing claims start unchecked.
  ok := (select count(*) from public.founding_claims where user_id in (f1, f2, f3) and not show_on_founders_page) = 3
    and (select column_default from information_schema.columns
         where table_schema = 'public' and table_name = 'founding_claims' and column_name = 'show_on_founders_page') = 'false'
    and not exists (select 1 from public.founding_claims where show_on_founders_page and user_id not in (f1, f2, f3)
                    and show_changed_at is null);
  if ok then passed := passed + 1; else failed := array_append(failed, 'claims start unchecked'); end if;

  -- 2) Founders opt in through the function; it's their own claim only, and
  --    a non-founder can't.
  perform set_config('request.jwt.claims', json_build_object('sub', f1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v := public.founding_set_show(true);
  ok := v and (select show_on_founders_page from public.founding_claims where user_id = f1);
  denied := false; begin update public.founding_claims set show_on_founders_page = true where user_id = f2; exception when insufficient_privilege then denied := true; end;
  reset role;
  ok := ok and (denied or not (select show_on_founders_page from public.founding_claims where user_id = f2));
  perform set_config('request.jwt.claims', json_build_object('sub', f3, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.founding_set_show(true);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated')::text, true);
  set local role authenticated;
  denied := false; begin perform public.founding_set_show(true); exception when no_data_found then denied := true; end; ok := ok and denied;
  reset role;
  if ok then passed := passed + 1; else failed := array_append(failed, 'opt in: your own claim only, not for non-founders'); end if;

  -- 3) A member sees only founders who opted in, in spot order, with their
  --    name, photo, chapter and spot.
  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := (select array_agg(spot_number order by spot_number) from public.flock_founders() where spot_number > base) = array[base + 1, base + 3]
    and (select array_agg(display_name order by spot_number) from public.flock_founders() where spot_number > base) = array['Ada L.', 'Cleo M.']
    and (select chapter_name from public.flock_founders() where spot_number = base + 3) = (select name from public.regions where slug = 'texas')
    and not exists (select 1 from public.flock_founders() where spot_number = base + 2);
  reset role;
  if ok then passed := passed + 1; else failed := array_append(failed, 'opted-in founders only, in spot order'); end if;

  -- 4) Changing your mind later: Ben opts in, Ada opts out.
  perform set_config('request.jwt.claims', json_build_object('sub', f2, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.founding_set_show(true);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', f1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.founding_set_show(false);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := (select array_agg(spot_number order by spot_number) from public.flock_founders() where spot_number > base) = array[base + 2, base + 3];
  reset role;
  ok := ok and (select show_changed_at from public.founding_claims where user_id = f1) is not null;
  if ok then passed := passed + 1; else failed := array_append(failed, 'toggling later adds and removes'); end if;

  -- 5) Blocking, both ways: M blocks Cleo, Ben blocks M. M sees neither; Ada
  --    (not blocked) still sees both.
  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.flock_block(f3, true);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', f2, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.flock_block(m, true);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := not exists (select 1 from public.flock_founders() where spot_number > base);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', f1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := ok and (select count(*) from public.flock_founders() where spot_number > base) = 2;
  reset role;
  if ok then passed := passed + 1; else failed := array_append(failed, 'blocking hides founders both ways'); end if;

  -- 6) Only people who can open the Flock: a free account and a signed-out
  --    visitor are refused.
  ok := true;
  perform set_config('request.jwt.claims', json_build_object('sub', fr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  denied := false; begin perform 1 from public.flock_founders(); exception when insufficient_privilege then denied := true; end; ok := ok and denied;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  set local role anon;
  denied := false; begin perform 1 from public.flock_founders(); exception when insufficient_privilege then denied := true; end; ok := ok and denied;
  denied := false; begin perform public.founding_set_show(true); exception when insufficient_privilege then denied := true; end; ok := ok and denied;
  reset role;
  if ok then passed := passed + 1; else failed := array_append(failed, 'free accounts and signed-out visitors refused'); end if;

  -- 7) Exactly four fields, public and private.
  ok := pg_get_function_result('public.flock_founders()'::regprocedure)
          = 'TABLE(display_name text, photo_path text, chapter_name text, spot_number integer)'
    and pg_get_function_result('private.flock_founders()'::regprocedure)
          = 'TABLE(display_name text, photo_path text, chapter_name text, spot_number integer)';
  if ok then passed := passed + 1; else failed := array_append(failed, 'returns only display name, photo, chapter and spot'); end if;

  raise exception 'FLOCK FOUNDERS PAGE CHECKS: % passed, % failed%', passed, coalesce(array_length(failed, 1), 0),
    case when array_length(failed, 1) > 0 then ': ' || array_to_string(failed, ', ') else '' end;
end $$;
