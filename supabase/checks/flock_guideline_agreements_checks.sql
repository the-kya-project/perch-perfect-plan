-- Verification for 20261128180000_flock_guideline_agreements (the community
-- guidelines walk-through).
--
-- Self-contained and leaves nothing behind: its own admin, two Flock members
-- (one agrees, one doesn't), a free user and a free household co-carer. Then
-- raises so everything rolls back.
--   "FLOCK GUIDELINE AGREEMENTS CHECKS: n passed, 0 failed"           → all good
--   "FLOCK GUIDELINE AGREEMENTS CHECKS: n passed, k failed: <names>"  → which ones broke
-- Run by .github/workflows/db-checks.yml on every PR (scripts/db-checks.sh).
do $$
declare
  adm uuid := gen_random_uuid();  -- admin
  m1  uuid := gen_random_uuid();  -- Flock member who agrees
  m2  uuid := gen_random_uuid();  -- Flock member who hasn't agreed
  fr  uuid := gen_random_uuid();  -- free user
  hh  uuid := gen_random_uuid();  -- free household co-carer on m2's bird
  b1  uuid := gen_random_uuid();  -- m1's bird
  b2  uuid := gen_random_uuid();  -- m2's bird
  v   int := public.current_guidelines_version();
  passed int := 0; failed text[] := '{}';
  ok boolean; st text; n int; p1 uuid; jp uuid; jp2 uuid;
begin
  insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  select '00000000-0000-0000-0000-000000000000', x, 'authenticated', 'authenticated', x::text || '@checks.invalid', '{}', '{}', now(), now()
  from unnest(array[adm, m1, m2, fr, hh]) as x;
  insert into public.user_roles (user_id, role) values (adm, 'admin');
  insert into public.entitlements (user_id, plan, status, source, starts_at) values
    (m1, 'comp', 'active', 'manual', now() - interval '1 day'),
    (m2, 'comp', 'active', 'manual', now() - interval '1 day');
  insert into public.birds (id, owner_id, name, species) values (b1, m1, 'Kiwi', 'Cockatiel'), (b2, m2, 'Mango', 'Conure');
  insert into public.bird_members (bird_id, user_id, role) values (b2, hh, 'household') on conflict do nothing;
  insert into public.flock_profiles (user_id, display_name, region_slug, setup_completed_at) values
    (m1, 'Alex R.', 'great-lakes', now()), (m2, 'Priya S.', 'great-lakes', now());
  insert into public.clip_assets (uid, bird_id) values ('agreeclip001', b1), ('agreeclip002', b2), ('agreeclip003', b2);
  update public.journey_settings set audience = 'everyone';
  -- Like production today: the Flock is open to admins only.
  update public.flock_settings set ui_enabled = true, members_open = false where id;

  -- 1) The version is 1, and it's the same number the app uses.
  ok := v = 1;
  if ok then passed := passed + 1; else failed := array_append(failed, 'version is 1'); end if;

  -- 2) RLS is on, and app users can't update or delete rows, or set agreed_at.
  ok := (select relrowsecurity from pg_class where oid = 'public.flock_guideline_agreements'::regclass)
    and not has_table_privilege('authenticated', 'public.flock_guideline_agreements', 'UPDATE')
    and not has_table_privilege('authenticated', 'public.flock_guideline_agreements', 'DELETE')
    and not has_table_privilege('anon', 'public.flock_guideline_agreements', 'SELECT')
    and not has_column_privilege('authenticated', 'public.flock_guideline_agreements', 'agreed_at', 'INSERT')
    and has_column_privilege('authenticated', 'public.flock_guideline_agreements', 'version', 'INSERT')
    and not has_function_privilege('anon', 'public.has_agreed_to_guidelines(uuid)', 'EXECUTE')
    and not has_function_privilege('anon', 'private.has_agreed_to_guidelines(uuid)', 'EXECUTE')
    and (select p.prosecdef and p.proconfig @> array['search_path=""']
         from pg_proc p where p.oid = 'private.has_agreed_to_guidelines(uuid)'::regprocedure)
    and (select not p.prosecdef from pg_proc p where p.oid = 'public.has_agreed_to_guidelines(uuid)'::regprocedure);
  if ok then passed := passed + 1; else failed := array_append(failed, 'rls on, no update/delete, locked-down function'); end if;

  -- 3) While the Flock is closed to members, nobody but an admin can write a row.
  ok := true;
  foreach st in array array[m1::text, fr::text] loop
    perform set_config('request.jwt.claims', json_build_object('sub', st, 'role', 'authenticated')::text, true);
    set local role authenticated;
    begin
      insert into public.flock_guideline_agreements (user_id, version) values (st::uuid, v);
      ok := false;
    exception when insufficient_privilege then null;
    end;
    reset role;
  end loop;
  ok := ok and not exists (select 1 from public.flock_guideline_agreements where user_id in (m1, fr));
  if ok then passed := passed + 1; else failed := array_append(failed, 'closed flock: no rows for non-admins'); end if;

  -- Open it to members for the rest (opening day set, switch on).
  update public.flock_settings set members_open = true,
    flock_opens_at = coalesce(flock_opens_at, now() - interval '1 day'),
    free_season_ends_at = coalesce(free_season_ends_at, now() + interval '180 days') where id;

  -- 4) You can agree only for yourself, only at the current version, and
  --    agreed_at is the server's time. Agreeing twice is refused (one row).
  perform set_config('request.jwt.claims', json_build_object('sub', m1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := not public.has_agreed_to_guidelines(m1);
  st := null; begin insert into public.flock_guideline_agreements (user_id, version) values (m2, v); exception when others then st := sqlstate; end;
  ok := ok and st = '42501';
  st := null; begin insert into public.flock_guideline_agreements (user_id, version) values (m1, v + 1); exception when others then st := sqlstate; end;
  ok := ok and st = '42501';
  st := null; begin insert into public.flock_guideline_agreements (user_id, version, agreed_at) values (m1, v, now() - interval '1 year'); exception when others then st := sqlstate; end;
  ok := ok and st = '42501';
  insert into public.flock_guideline_agreements (user_id, version) values (m1, v);
  ok := ok and public.has_agreed_to_guidelines(m1);
  st := null; begin insert into public.flock_guideline_agreements (user_id, version) values (m1, v); exception when others then st := sqlstate; end;
  ok := ok and st = '23505';
  -- Own rows only.
  ok := ok and (select count(*) from public.flock_guideline_agreements) = 1;
  -- Updating or deleting through the API does nothing.
  st := null; begin update public.flock_guideline_agreements set version = 99; exception when others then st := sqlstate; end;
  ok := ok and st = '42501';
  st := null; begin delete from public.flock_guideline_agreements; exception when others then st := sqlstate; end;
  ok := ok and st = '42501';
  reset role;
  ok := ok and (select agreed_at > now() - interval '1 minute' from public.flock_guideline_agreements where user_id = m1)
    and (select count(*) from public.flock_guideline_agreements where user_id in (m1, m2)) = 1;
  if ok then passed := passed + 1; else failed := array_append(failed, 'own row, current version, server time, no edits'); end if;

  -- 5) has_agreed_to_guidelines answers only about yourself; an admin and the
  --    server can ask about anyone. Admins read every row.
  perform set_config('request.jwt.claims', json_build_object('sub', m2, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := not public.has_agreed_to_guidelines(m1);
  ok := ok and (select count(*) from public.flock_guideline_agreements) = 0;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := ok and public.has_agreed_to_guidelines(m1) and not public.has_agreed_to_guidelines(m2);
  ok := ok and (select count(*) from public.flock_guideline_agreements where user_id = m1) = 1;
  reset role;
  perform set_config('request.jwt.claims', '{}', true);
  ok := ok and public.has_agreed_to_guidelines(m1);
  if ok then passed := passed + 1; else failed := array_append(failed, 'has_agreed answers for yourself; admins read all'); end if;

  -- 6) Without an agreement a member can't post, comment, share a journey or
  --    post to a shared one; after agreeing they can.
  perform set_config('request.jwt.claims', json_build_object('sub', m1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select post_id into p1 from public.flock_post_create('learn', null, 'Pegboard foraging ideas?', '{}', null, false);
  jp := public.journey_start(b1, 'step-up', null, null, null, 'most_days', 'community', 'cfstream:agreeclip001');
  reset role;
  ok := p1 is not null and jp is not null;
  perform set_config('request.jwt.claims', json_build_object('sub', m2, 'role', 'authenticated')::text, true);
  set local role authenticated;
  st := null; begin perform * from public.flock_post_create('learn', null, 'Hello', '{}', null, false); exception when others then st := sqlerrm; end;
  ok := ok and st like '%guidelines_required%';
  st := null; begin perform public.flock_comment_create('post', p1, null, 'Lovely', null, false); exception when others then st := sqlerrm; end;
  ok := ok and st like '%guidelines_required%';
  st := null; begin perform public.journey_start(b2, 'step-up', null, null, null, 'most_days', 'community', 'cfstream:agreeclip002'); exception when others then st := sqlerrm; end;
  ok := ok and st like '%guidelines_required%';
  -- A "Just me" journey and its updates are untouched by the agreement.
  jp2 := public.journey_start(b2, 'step-up', null, null, null, 'most_days', 'private', 'cfstream:agreeclip002');
  ok := ok and jp2 is not null;
  st := null; begin perform public.journey_set_visibility(jp2, 'community'); exception when others then st := sqlerrm; end;
  ok := ok and st like '%guidelines_required%';
  reset role;
  ok := ok and (select visibility from public.journeys where id = jp2) = 'private'
    and not exists (select 1 from public.flock_posts where author_id = m2)
    and not exists (select 1 from public.flock_comments where author_id = m2);
  if ok then passed := passed + 1; else failed := array_append(failed, 'no posting without an agreement'); end if;

  -- 7) A free household co-carer, outside the Flock, still posts to a journey
  --    its owner shared (the care app is unchanged for them).
  perform set_config('request.jwt.claims', '{}', true);
  update public.journeys set visibility = 'community' where id = jp2;  -- as the server
  perform set_config('request.jwt.claims', json_build_object('sub', hh, 'role', 'authenticated')::text, true);
  set local role authenticated;
  st := null; begin perform public.journey_post_update(jp2, 'cfstream:agreeclip003', 'all_in', null, false); exception when others then st := sqlerrm; end;
  reset role;
  ok := st is null and exists (select 1 from public.journey_updates where journey_id = jp2 and author_id = hh);
  if ok then passed := passed + 1; else failed := array_append(failed, 'household co-carer outside the flock unchanged: ' || coalesce(st, '')); end if;

  -- 8) Agreeing, the member can post at once.
  perform set_config('request.jwt.claims', json_build_object('sub', m2, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into public.flock_guideline_agreements (user_id, version) values (m2, v);
  st := null; begin perform * from public.flock_post_create('learn', null, 'Hello', '{}', null, false); exception when others then st := sqlerrm; end;
  reset role;
  ok := st is null and exists (select 1 from public.flock_posts where author_id = m2);
  if ok then passed := passed + 1; else failed := array_append(failed, 'posting works after agreeing: ' || coalesce(st, '')); end if;

  -- 9) The server, the SQL editor and seeds aren't blocked.
  perform set_config('request.jwt.claims', '{}', true);
  delete from public.flock_guideline_agreements where user_id = m2;
  insert into public.flock_posts (author_id, space, body, status) values (m2, 'learn', 'Seeded', 'live');
  ok := exists (select 1 from public.flock_posts where author_id = m2 and body = 'Seeded');
  if ok then passed := passed + 1; else failed := array_append(failed, 'server and seeds pass'); end if;

  -- 10) Deleting an account removes its agreements.
  delete from auth.users where id = m1;
  ok := not exists (select 1 from public.flock_guideline_agreements where user_id = m1);
  if ok then passed := passed + 1; else failed := array_append(failed, 'account deletion removes agreements'); end if;

  -- 11) No care-app table has a new trigger except journeys/journey_updates,
  --     whose check skips private journeys.
  ok := not exists (select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace s on s.oid = c.relnamespace
                    where s.nspname = 'public' and t.tgname like '%require_guidelines'
                      and c.relname not in ('flock_posts', 'flock_comments', 'journey_updates', 'journeys'));
  if ok then passed := passed + 1; else failed := array_append(failed, 'triggers only where expected'); end if;

  raise exception 'FLOCK GUIDELINE AGREEMENTS CHECKS: % passed, % failed%', passed, coalesce(array_length(failed, 1), 0),
    case when array_length(failed, 1) > 0 then ': ' || array_to_string(failed, ', ') else '' end;
end $$;
