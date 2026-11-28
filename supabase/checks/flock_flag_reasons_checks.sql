-- Verification for 20261128220000_flock_flag_reasons (the flag sheet's reasons).
--
-- Self-contained and leaves nothing behind: two Flock members, a post and a
-- comment. Raises at the end so everything rolls back.
--   "FLOCK FLAG REASONS CHECKS: n passed, 0 failed"           → all good
--   "FLOCK FLAG REASONS CHECKS: n passed, k failed: <names>"  → which ones broke
-- Run by .github/workflows/db-checks.yml on every PR (scripts/db-checks.sh).
do $$
declare
  m1 uuid := gen_random_uuid();  -- posts
  m2 uuid := gen_random_uuid();  -- flags
  m3 uuid := gen_random_uuid();  -- flags too
  m4 uuid := gen_random_uuid();  -- the third flag
  p1 uuid; c1 uuid;
  passed int := 0; failed text[] := '{}';
  ok boolean; st text;
begin
  insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  select '00000000-0000-0000-0000-000000000000', x, 'authenticated', 'authenticated', x::text || '@checks.invalid', '{}', '{}', now(), now()
  from unnest(array[m1, m2, m3, m4]) as x;
  insert into public.flock_guideline_agreements (user_id, version)
  select x, public.current_guidelines_version() from unnest(array[m1, m2, m3, m4]) as x;
  insert into public.entitlements (user_id, plan, status, source, starts_at)
  select x, 'comp', 'active', 'manual', now() - interval '1 day' from unnest(array[m1, m2, m3, m4]) as x;
  insert into public.flock_profiles (user_id, display_name, region_slug, setup_completed_at) values
    (m1, 'Dana R.', 'great-lakes', now()), (m2, 'Priya S.', 'great-lakes', now()), (m3, 'Jo K.', 'great-lakes', now());
  update public.flock_moderation_settings set report_threshold = 3;

  perform set_config('request.jwt.claims', json_build_object('sub', m1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select post_id into p1 from public.flock_post_create('learn', null, 'Pip stepped up today.', '{}', null, false);
  c1 := public.flock_comment_create('post', p1, null, 'Three weeks of tiny steps!', null, false);
  reset role;

  -- 1) The new reasons are accepted, with a note.
  perform set_config('request.jwt.claims', json_build_object('sub', m2, 'role', 'authenticated')::text, true);
  set local role authenticated;
  st := null; begin perform public.flock_report('post', p1, 'care_standards', 'I think this cage may be too small.'); exception when others then st := sqlerrm; end;
  ok := st is null;
  st := null; begin perform public.flock_report('comment', c1, 'harmful', null); exception when others then st := sqlerrm; end;
  ok := ok and st is null;
  reset role;
  ok := ok and (select reason from public.flock_reports where subject_id = p1 and reporter_id = m2) = 'care_standards'
    and (select note from public.flock_reports where subject_id = p1 and reporter_id = m2) = 'I think this cage may be too small.'
    and (select reason from public.flock_reports where subject_id = c1 and reporter_id = m2) = 'harmful';
  if ok then passed := passed + 1; else failed := array_append(failed, 'new reasons accepted'); end if;

  -- 2) The old reasons still work (an app that hasn't reloaded), and
  --    anything else is refused.
  perform set_config('request.jwt.claims', json_build_object('sub', m3, 'role', 'authenticated')::text, true);
  set local role authenticated;
  st := null; begin perform public.flock_report('post', p1, 'unkind', null); exception when others then st := sqlerrm; end;
  ok := st is null;
  st := null; begin perform public.flock_report('comment', c1, 'rude', null); exception when others then st := sqlstate; end;
  ok := ok and st = '22023';
  st := null; begin perform public.flock_report('comment', c1, null, null); exception when others then st := sqlstate; end;
  ok := ok and st = '22023';
  reset role;
  if ok then passed := passed + 1; else failed := array_append(failed, 'old reasons kept, others refused'); end if;

  -- 3) The table refuses an unknown reason even from the server.
  st := null;
  begin
    insert into public.flock_reports (subject_type, subject_id, reporter_id, reason) values ('post', p1, m1, 'rude');
  exception when check_violation then st := 'refused';
  end;
  ok := st = 'refused';
  if ok then passed := passed + 1; else failed := array_append(failed, 'table check'); end if;

  -- 4) You can't flag your own post; flags stay private (no app-user read).
  perform set_config('request.jwt.claims', json_build_object('sub', m1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  st := null; begin perform public.flock_report('post', p1, 'harmful', null); exception when others then st := sqlstate; end;
  ok := st = '22023';
  st := null; begin perform 1 from public.flock_reports; exception when insufficient_privilege then st := 'denied'; end;
  ok := ok and st = 'denied';
  reset role;
  if ok then passed := passed + 1; else failed := array_append(failed, 'own post, private'); end if;

  -- 5) Moderation is unchanged: two open flags don't hide it; a third does.
  ok := not exists (select 1 from public.flock_moderation where subject_id = p1);
  perform set_config('request.jwt.claims', json_build_object('sub', m4, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.flock_report('post', p1, 'spam', null);
  reset role;
  ok := ok and exists (select 1 from public.flock_moderation where subject_id = p1 and state = 'hidden');
  if ok then passed := passed + 1; else failed := array_append(failed, 'threshold unchanged'); end if;

  raise exception 'FLOCK FLAG REASONS CHECKS: % passed, % failed%', passed, coalesce(array_length(failed, 1), 0),
    case when array_length(failed, 1) > 0 then ': ' || array_to_string(failed, ', ') else '' end;
end $$;
