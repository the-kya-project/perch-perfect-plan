-- Verification for 20261026120000_sits_scoped_to_member_birds.
--
-- Self-contained and leaves nothing behind: it creates its own people, birds
-- and sits, checks what each person can see and do, then raises an exception
-- so the whole block rolls back. The exception message IS the result:
--   "SIT ACCESS CHECKS: n passed, 0 failed"           → all good
--   "SIT ACCESS CHECKS: n passed, k failed: <names>"  → which ones broke
-- Run it in the SQL editor (or the Supabase MCP execute_sql) on a branch.
--
-- People: O owns Kiwi, Mango and Prof. H is household (viewer) on Kiwi and
-- Mango. C is a care_manager on Kiwi and Mango. G is the assigned household
-- caregiver on a Kiwi-only sit. X is a stranger.
-- Sits: s_km (Kiwi+Mango), s_kp (Kiwi+Prof), s_p (Prof only), s_g (Kiwi, G
-- caregiving), s_empty (no birds yet).
do $$
declare
  o uuid := gen_random_uuid(); h uuid := gen_random_uuid(); c uuid := gen_random_uuid();
  g uuid := gen_random_uuid(); x uuid := gen_random_uuid();
  kiwi uuid; mango uuid; prof uuid;
  s_km uuid; s_kp uuid; s_p uuid; s_g uuid; s_empty uuid;
  task uuid;
  passed int := 0; failed text[] := '{}';
  n int; ok boolean;
begin
  -- Fixtures (as the migration owner, bypassing RLS).
  insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  select '00000000-0000-0000-0000-000000000000', u, 'authenticated', 'authenticated', u::text || '@checks.invalid', '{}', '{}', now(), now()
  from unnest(array[o, h, c, g, x]) u;
  insert into public.birds (owner_id, name) values (o, 'Kiwi') returning id into kiwi;
  insert into public.birds (owner_id, name) values (o, 'Mango') returning id into mango;
  insert into public.birds (owner_id, name) values (o, 'Prof') returning id into prof;
  insert into public.bird_members (bird_id, user_id, role) values
    (kiwi, h, 'household'), (mango, h, 'household'),
    (kiwi, c, 'household'), (mango, c, 'household'),
    (kiwi, g, 'household');
  insert into public.household_member_permissions (owner_id, member_user_id, capabilities, preset) values
    (o, h, '{}', 'viewer'),
    (o, c, array['log_daily_care', 'record_health', 'edit_care_plans', 'manage_emergency', 'manage_sits'], 'care_manager'),
    (o, g, array['log_daily_care', 'record_health'], 'caregiver');
  insert into public.sits (owner_id, sitter_name, start_date, end_date, invite_token, token_expires_at) values (o, 'KM', current_date, current_date + 3, 't-km', now()) returning id into s_km;
  insert into public.sits (owner_id, sitter_name, start_date, end_date, invite_token, token_expires_at) values (o, 'KP', current_date, current_date + 3, 't-kp', now()) returning id into s_kp;
  insert into public.sits (owner_id, sitter_name, start_date, end_date, invite_token, token_expires_at) values (o, 'P', current_date, current_date + 3, 't-p', now()) returning id into s_p;
  insert into public.sits (owner_id, sitter_name, start_date, end_date, caregiver_user_id) values (o, 'G', current_date, current_date + 3, g) returning id into s_g;
  insert into public.sits (owner_id, sitter_name, start_date, end_date, invite_token, token_expires_at) values (o, 'E', current_date, current_date + 3, 't-e', now()) returning id into s_empty;
  insert into public.sit_birds (sit_id, bird_id) values
    (s_km, kiwi), (s_km, mango), (s_kp, kiwi), (s_kp, prof), (s_p, prof), (s_g, kiwi);
  -- task_completions point at a routine task, which hangs off a care plan.
  insert into public.care_plans (bird_id) values (kiwi);
  insert into public.routine_tasks (care_plan_id, title)
    select id, 'Check task' from public.care_plans where bird_id = kiwi limit 1
    returning id into task;

  -- Each check: run as a person, compare a count or an outcome.
  -- 1) Owner sees all five sits.
  perform set_config('request.jwt.claims', json_build_object('sub', o, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.sits where id in (s_km, s_kp, s_p, s_g, s_empty);
  reset role;
  if n = 5 then passed := passed + 1; else failed := array_append(failed, format('owner sees all sits (%s)', n)::text); end if;

  -- 2) Viewer H sees only the sit whose birds are all theirs (Kiwi+Mango).
  perform set_config('request.jwt.claims', json_build_object('sub', h, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.sits where id = s_km;
  ok := n = 1;
  select count(*) into n from public.sits where id in (s_kp, s_p, s_empty);
  ok := ok and n = 0;
  reset role;
  if ok then passed := passed + 1; else failed := array_append(failed, 'viewer sees Kiwi+Mango sit only'::text); end if;

  -- 3) Viewer H still sees their birds' sit_birds rows, and Kiwi itself.
  set local role authenticated;
  select count(*) into n from public.birds where id in (kiwi, mango);
  reset role;
  if n = 2 then passed := passed + 1; else failed := array_append(failed, format('viewer still sees Kiwi and Mango (%s)', n)::text); end if;

  -- 4) Viewer H cannot read the token of any sit with a bird they lack.
  set local role authenticated;
  select count(*) into n from public.sits where id in (s_kp, s_p) and invite_token is not null;
  reset role;
  if n = 0 then passed := passed + 1; else failed := array_append(failed, 'viewer cannot read tokens for sits with birds they lack'::text); end if;

  -- 5) Care manager C can delete the Kiwi+Mango sit but not Kiwi+Prof.
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  delete from public.sits where id = s_kp;
  get diagnostics n = row_count;
  reset role;
  if n = 0 then passed := passed + 1; else failed := array_append(failed, 'care manager cannot delete a sit with a bird they lack'::text); end if;
  set local role authenticated;
  select count(*) into n from public.sits where id = s_km;
  reset role;
  if n = 1 then passed := passed + 1; else failed := array_append(failed, 'care manager sees Kiwi+Mango sit'::text); end if;

  -- 6) Care manager C can log a task on the Kiwi+Mango sit, not on the Prof-only one.
  set local role authenticated;
  begin
    insert into public.task_completions (sit_id, routine_task_id, completed_at) values (s_km, task, now());
    ok := true;
  exception when others then ok := false;
  end;
  reset role;
  if ok then passed := passed + 1; else failed := array_append(failed, 'care manager logs task on own-birds sit'::text); end if;
  set local role authenticated;
  begin
    insert into public.task_completions (sit_id, routine_task_id, completed_at) values (s_p, task, now());
    ok := false;
  exception when others then ok := true;
  end;
  reset role;
  if ok then passed := passed + 1; else failed := array_append(failed, 'care manager blocked from logging on a Prof-only sit'::text); end if;

  -- 7) Assigned caregiver G sees their sit and can log on it.
  perform set_config('request.jwt.claims', json_build_object('sub', g, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.sits where id = s_g;
  begin
    insert into public.task_completions (sit_id, routine_task_id, completed_at) values (s_g, task, now());
    ok := n = 1;
  exception when others then ok := false;
  end;
  reset role;
  if ok then passed := passed + 1; else failed := array_append(failed, 'assigned caregiver sees and logs on their sit'::text); end if;

  -- 8) Stranger X sees nothing.
  perform set_config('request.jwt.claims', json_build_object('sub', x, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.sits where owner_id = o;
  reset role;
  if n = 0 then passed := passed + 1; else failed := array_append(failed, 'stranger sees no sits'::text); end if;

  -- 9) Owner still reads task completions on every sit.
  perform set_config('request.jwt.claims', json_build_object('sub', o, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.task_completions where sit_id in (s_km, s_g);
  reset role;
  if n = 2 then passed := passed + 1; else failed := array_append(failed, format('owner reads task completions (%s)', n)::text); end if;

  raise exception 'SIT ACCESS CHECKS: % passed, % failed%', passed, coalesce(array_length(failed, 1), 0),
    case when array_length(failed, 1) > 0 then ': ' || array_to_string(failed, '; ') else '' end;
end $$;
