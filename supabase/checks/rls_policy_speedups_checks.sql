-- Verification for 20261121120000_rls_policy_speedups.
--
-- That migration rewrote the row-level security policies on notification_log,
-- owner_home_defaults and flock_profiles for speed. This block proves they
-- still allow and deny the same rows: each person sees and changes their own
-- rows and nobody else's, and for flock_profiles every viewer sees exactly the
-- rows the old pair of policies allowed (the old conditions are written out
-- below and compared row by row).
--
-- Self-contained and leaves nothing behind: it makes its own people and rows,
-- then raises so the whole block rolls back. The exception message IS the result:
--   "RLS POLICY SPEEDUPS CHECKS: n passed, 0 failed"           → all good
--   "RLS POLICY SPEEDUPS CHECKS: n passed, k failed: <names>"  → which ones broke
-- Run by .github/workflows/db-checks.yml on every PR (scripts/db-checks.sh).
do $$
declare
  a    uuid := gen_random_uuid();  -- plain owner
  b    uuid := gen_random_uuid();  -- plain owner
  m1   uuid := gen_random_uuid();  -- member
  m2   uuid := gen_random_uuid();  -- member
  m3   uuid := gen_random_uuid();  -- member, blocked by m1
  m4   uuid := gen_random_uuid();  -- member, no profile yet
  adm  uuid := gen_random_uuid();  -- admin, not a member, has a profile
  adm2 uuid := gen_random_uuid();  -- admin, no profile yet
  out  uuid := gen_random_uuid();  -- not a member, leftover profile
  v uuid;
  passed int := 0; failed text[] := '{}';
  ok boolean; n int; n2 int; expected uuid[]; actual uuid[];
  fx uuid[];  -- this block's own profiles, so other rows on a branch don't count
begin
  insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  select '00000000-0000-0000-0000-000000000000', u, 'authenticated', 'authenticated', u::text || '@checks.invalid', '{}', '{}', now(), now()
  from unnest(array[a, b, m1, m2, m3, m4, adm, adm2, out]) as u;
  insert into public.user_roles (user_id, role) values (adm, 'admin'), (adm2, 'admin');
  insert into public.entitlements (user_id, plan, status, source, starts_at)
  select u, 'comp', 'active', 'manual', now() - interval '1 day' from unnest(array[m1, m2, m3, m4]) as u;
  insert into public.flock_profiles (user_id, display_name, region_slug, setup_completed_at) values
    (m1, 'Ada L.', 'great-lakes', now()),
    (m2, 'Ben M.', 'great-lakes', now()),
    (m3, 'Cy T.',  'texas', now()),
    (adm, 'Admin', 'great-lakes', now()),
    (out, 'Out S.', 'great-lakes', now());
  insert into public.flock_blocks (blocker_id, blocked_id) values (m1, m3);
  fx := array[m1, m2, m3, adm, out, m4, adm2, a];

  -- 0) The advisor's two findings are gone on these tables: no bare auth.uid(),
  --    and one permissive flock_profiles policy per command.
  select count(*) into n from pg_policies
  where schemaname = 'public' and tablename in ('notification_log', 'owner_home_defaults', 'flock_profiles')
    and (replace(coalesce(qual, ''), '( SELECT auth.uid() AS uid)', '') ~ 'auth\.uid\(\)'
      or replace(coalesce(with_check, ''), '( SELECT auth.uid() AS uid)', '') ~ 'auth\.uid\(\)');
  if n = 0 then passed := passed + 1; else failed := array_append(failed, format('no bare auth.uid() (%s)', n)); end if;
  select count(*) into n from (
    select cmd from pg_policies
    where schemaname = 'public' and tablename = 'flock_profiles' and permissive = 'PERMISSIVE'
    group by cmd having count(*) > 1) d;
  if n = 0 then passed := passed + 1; else failed := array_append(failed, 'one flock_profiles policy per command'); end if;

  -- ── notification_log ─────────────────────────────────────────────────────
  insert into public.notification_log (user_id, type) values (a, 'check'), (a, 'check'), (b, 'check');

  -- 1) App users still can't read the table at all (no select grant).
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform count(*) from public.notification_log;
    ok := false;
  exception when insufficient_privilege then ok := true;
  end;
  reset role;
  if ok then passed := passed + 1; else failed := array_append(failed, 'notification_log: no read grant'); end if;

  -- 2) The policy itself, with a grant added for this block only: own rows
  --    only, and nothing signed out.
  grant select on public.notification_log to authenticated, anon;
  set local role authenticated;
  select count(*) filter (where user_id = a), count(*) into n, n2 from public.notification_log;
  reset role;
  if n = 2 and n2 = 2 then passed := passed + 1; else failed := array_append(failed, format('notification_log: own rows only (%s of %s)', n, n2)); end if;
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  set local role anon;
  select count(*) into n from public.notification_log;
  reset role;
  if n = 0 then passed := passed + 1; else failed := array_append(failed, format('notification_log: signed out sees nothing (%s)', n)); end if;
  revoke select on public.notification_log from authenticated, anon;

  -- ── owner_home_defaults ──────────────────────────────────────────────────
  -- 3) An owner saves their own row; b has one too.
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into public.owner_home_defaults (owner_id, off_limits) values (b, 'b kitchen');
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    insert into public.owner_home_defaults (owner_id, off_limits) values (a, 'a kitchen');
    ok := true;
  exception when others then ok := false;
  end;
  reset role;
  if ok then passed := passed + 1; else failed := array_append(failed, 'home defaults: insert own'); end if;

  -- 4) …can't save one for someone else.
  set local role authenticated;
  begin
    insert into public.owner_home_defaults (owner_id, off_limits) values (gen_random_uuid(), 'x');
    ok := false;
  exception when insufficient_privilege then ok := true;
  end;
  reset role;
  if ok then passed := passed + 1; else failed := array_append(failed, 'home defaults: no insert for others'); end if;

  -- 5) Reads only their own.
  set local role authenticated;
  select array_agg(owner_id) into actual from public.owner_home_defaults;
  reset role;
  if actual = array[a] then passed := passed + 1; else failed := array_append(failed, format('home defaults: read own only (%s)', actual)); end if;

  -- 6) Updates and deletes reach only their own row.
  set local role authenticated;
  update public.owner_home_defaults set off_limits = 'changed';
  get diagnostics n = row_count;
  delete from public.owner_home_defaults where owner_id = b;
  get diagnostics n2 = row_count;
  reset role;
  if n = 1 and n2 = 0
     and (select off_limits from public.owner_home_defaults where owner_id = b) = 'b kitchen'
     and (select off_limits from public.owner_home_defaults where owner_id = a) = 'changed'
  then passed := passed + 1; else failed := array_append(failed, format('home defaults: change own only (%s, %s)', n, n2)); end if;

  -- 7) …and can't hand their row to someone else.
  set local role authenticated;
  begin
    update public.owner_home_defaults set owner_id = b where owner_id = a;
    ok := false;
  exception when insufficient_privilege or unique_violation then ok := true;
  end;
  reset role;
  if ok then passed := passed + 1; else failed := array_append(failed, 'home defaults: no moving a row to someone else'); end if;

  -- 8) Signed out: no access.
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  set local role anon;
  begin
    perform count(*) from public.owner_home_defaults;
    ok := false;
  exception when insufficient_privilege then ok := true;
  end;
  reset role;
  if ok then passed := passed + 1; else failed := array_append(failed, 'home defaults: signed out denied'); end if;

  -- ── flock_profiles ───────────────────────────────────────────────────────
  -- 9) For every kind of viewer, the rows they can read are exactly the rows
  --    the old two policies allowed:
  --      admin read:  is_admin(viewer)
  --      read:        own OR (is_flock_member(viewer) AND NOT flock_blocked(viewer, row))
  foreach v in array array[a, m1, m2, m3, m4, adm, out] loop
    select coalesce(array_agg(p.user_id order by p.user_id), '{}') into expected
    from public.flock_profiles p
    where private.is_admin(v)
       or p.user_id = v
       or (private.is_flock_member(v) and not private.flock_blocked(v, p.user_id));
    perform set_config('request.jwt.claims', json_build_object('sub', v, 'role', 'authenticated')::text, true);
    set local role authenticated;
    select coalesce(array_agg(p.user_id order by p.user_id), '{}') into actual from public.flock_profiles p;
    reset role;
    if actual = expected then passed := passed + 1;
    else failed := array_append(failed, format('profiles: viewer %s sees the old rows (%s vs %s)', v, cardinality(actual), cardinality(expected))); end if;
  end loop;

  -- 10) The same thing in plain words: a plain owner sees no profiles; the
  --     admin sees all five of this block's; a leftover non-member sees only their own; m1 and
  --     m3 can't see each other (a block works both ways) but see m2.
  select count(*) into n from public.flock_profiles where user_id = any(fx);
  ok := n = 5;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := ok and (select count(*) from public.flock_profiles where user_id = any(fx)) = 0;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := ok and (select count(*) from public.flock_profiles where user_id = any(fx)) = 5;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', out, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := ok and (select array_agg(user_id) from public.flock_profiles where user_id = any(fx)) = array[out];
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', m1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := ok and not exists (select 1 from public.flock_profiles where user_id = m3)
           and exists (select 1 from public.flock_profiles where user_id = m2);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', m3, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := ok and not exists (select 1 from public.flock_profiles where user_id = m1);
  reset role;
  if ok then passed := passed + 1; else failed := array_append(failed, 'profiles: who sees whom'); end if;

  -- 11) Creating a profile: a member or an admin may make their own; a plain
  --     owner may not; nobody may make one for someone else.
  perform set_config('request.jwt.claims', json_build_object('sub', m4, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    insert into public.flock_profiles (user_id, display_name, region_slug) values (a, 'Fake', 'great-lakes');
    ok := false;
  exception when insufficient_privilege then ok := true;
  end;
  begin
    insert into public.flock_profiles (user_id, display_name, region_slug) values (m4, 'Dee R.', 'great-lakes');
  exception when others then ok := false;
  end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', adm2, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    insert into public.flock_profiles (user_id, display_name, region_slug) values (adm2, 'Admin 2', 'great-lakes');
  exception when others then ok := false;
  end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    insert into public.flock_profiles (user_id, display_name, region_slug) values (a, 'Not a member', 'great-lakes');
    ok := false;
  exception when insufficient_privilege then null;
  end;
  reset role;
  if ok and (select count(*) from public.flock_profiles where user_id in (m4, adm2)) = 2
     and not exists (select 1 from public.flock_profiles where user_id = a)
  then passed := passed + 1; else failed := array_append(failed, 'profiles: who may create one'); end if;

  -- 12) Editing: a member and an admin edit their own; nobody edits someone
  --     else's; a leftover non-member can't edit theirs (as before).
  ok := true;
  perform set_config('request.jwt.claims', json_build_object('sub', m1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update public.flock_profiles set bio = 'm1 edit' where user_id = m1;
  get diagnostics n = row_count;
  ok := ok and n = 1;
  update public.flock_profiles set bio = 'hijack' where user_id = m2;
  get diagnostics n = row_count;
  ok := ok and n = 0;
  begin
    update public.flock_profiles set user_id = a where user_id = m1;
    ok := false;
  exception when insufficient_privilege or foreign_key_violation then null;
  end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update public.flock_profiles set bio = 'adm edit' where user_id = adm;
  get diagnostics n = row_count;
  ok := ok and n = 1;
  update public.flock_profiles set bio = 'hijack' where user_id = m2;
  get diagnostics n = row_count;
  ok := ok and n = 0;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', out, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    update public.flock_profiles set bio = 'out edit' where user_id = out;
    ok := false;
  exception when insufficient_privilege then null;
  end;
  reset role;
  if ok and (select bio from public.flock_profiles where user_id = m2) is distinct from 'hijack'
  then passed := passed + 1; else failed := array_append(failed, 'profiles: who may edit'); end if;

  raise exception 'RLS POLICY SPEEDUPS CHECKS: % passed, % failed%',
    passed, cardinality(failed),
    case when cardinality(failed) > 0 then ': ' || array_to_string(failed, '; ') else '' end;
end $$;
