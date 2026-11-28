-- Verification for 20261122153800_flock_review_post_spaces (backlog 0.5).
--
-- Self-contained and leaves nothing behind: an admin, three Flock members in
-- Great Lakes, one in Texas (later a Texas-only reviewer) and a free user;
-- posts, a comment and reports. Then rolls back.
--   "FLOCK REVIEW SPACES CHECKS: n passed, 0 failed"           → all good
--   "FLOCK REVIEW SPACES CHECKS: n passed, k failed: <names>"  → which ones broke
-- Run by .github/workflows/db-checks.yml on every PR (scripts/db-checks.sh).
do $$
declare
  ad  uuid := gen_random_uuid();  -- admin
  m1  uuid := gen_random_uuid();  -- member, Great Lakes, writes the posts
  m2  uuid := gen_random_uuid();  -- member, Great Lakes
  m3  uuid := gen_random_uuid();  -- member, Great Lakes
  m4  uuid := gen_random_uuid();  -- member, Texas
  fr  uuid := gen_random_uuid();  -- free
  p_learn uuid; p_good uuid; p_chap uuid; p_quiet uuid; p_tx uuid; c1 uuid;
  all_ids uuid[];
  gl_name text := (select name from public.regions where slug = 'great-lakes');
  passed int := 0; failed text[] := '{}';
  ok boolean; n int; denied boolean;
begin
  insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  select '00000000-0000-0000-0000-000000000000', x, 'authenticated', 'authenticated', x::text || '@checks.invalid', '{}', '{}', now(), now()
  from unnest(array[ad, m1, m2, m3, m4, fr]) as x;
  -- Test members have agreed to the community guidelines (20261128180000).
  insert into public.flock_guideline_agreements (user_id, version)
  select u.id, public.current_guidelines_version() from auth.users u where u.email like '%@checks.invalid'
  on conflict do nothing;
  insert into public.entitlements (user_id, plan, status, source, starts_at)
  select x, 'comp', 'active', 'manual', now() - interval '1 day' from unnest(array[m1, m2, m3, m4]) as x;
  insert into public.user_roles (user_id, role) values (ad, 'admin');
  insert into public.flock_profiles (user_id, display_name, region_slug, setup_completed_at) values
    (ad, 'Brittany K.', 'great-lakes', now()), (m1, 'Alex R.', 'great-lakes', now()), (m2, 'Priya S.', 'great-lakes', now()),
    (m3, 'Sam T.', 'great-lakes', now()), (m4, 'Jo K.', 'texas', now());
  update public.flock_moderation_settings set report_threshold = 3;

  perform set_config('request.jwt.claims', json_build_object('sub', m1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select post_id into p_learn from public.flock_post_create('learn', null, 'Just clip his wings, problem solved.', '{}', null, false);
  select post_id into p_good from public.flock_post_create('good', null, 'Midwest Avian Rescue needs a new aviary roof.', '{}', null, false);
  select post_id into p_chap from public.flock_post_create('chapter', null, 'Anyone near Ann Arbor?', '{}', null, false);
  select post_id into p_quiet from public.flock_post_create('learn', null, 'What toys do your cockatiels like?', '{}', null, false);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', m2, 'role', 'authenticated')::text, true);
  set local role authenticated;
  c1 := public.flock_comment_create('post', p_chap, null, 'Not you again.', null, false);
  perform public.flock_report('post', p_learn, 'unsafe', null);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', m3, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.flock_report('comment', c1, 'unkind', null);
  reset role;
  all_ids := array[p_learn, p_good, p_chap, p_quiet];

  -- 1) An admin gets the space of every post in the queue (a reported post, a
  --    pending Do good post, and the post a reported comment is on), the
  --    chapter's name for a chapter post, and nothing for a post that isn't in
  --    the queue.
  perform set_config('request.jwt.claims', json_build_object('sub', ad, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := (select count(*) from public.flock_review_post_spaces(all_ids)) = 3
    and exists (select 1 from public.flock_review_post_spaces(all_ids) s where s.post_id = p_learn and s.space = 'learn' and s.chapter_name is null)
    and exists (select 1 from public.flock_review_post_spaces(all_ids) s where s.post_id = p_good and s.space = 'good' and s.chapter_name is null)
    and exists (select 1 from public.flock_review_post_spaces(all_ids) s where s.post_id = p_chap and s.space = 'chapter' and s.chapter_name = gl_name)
    and not exists (select 1 from public.flock_review_post_spaces(all_ids) s where s.post_id = p_quiet)
    and (select count(*) from public.flock_review_post_spaces(null)) = 0;
  reset role;
  if ok then passed := passed + 1; else failed := array_append(failed, 'admins get the space of each queued post only'); end if;

  -- 2) Members, free accounts and signed-out visitors get nothing.
  perform set_config('request.jwt.claims', json_build_object('sub', m2, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := (select count(*) from public.flock_review_post_spaces(all_ids)) = 0;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', fr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := ok and (select count(*) from public.flock_review_post_spaces(all_ids)) = 0;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  set local role anon;
  denied := false; begin perform * from public.flock_review_post_spaces(all_ids); exception when insufficient_privilege then denied := true; end;
  ok := ok and denied;
  reset role;
  if ok then passed := passed + 1; else failed := array_append(failed, 'members, free and signed out get nothing'); end if;

  -- 3) A chapter-limited reviewer gets only posts their chapter covers.
  insert into public.flock_reviewers (user_id, region_slug) values (m4, 'texas');
  perform set_config('request.jwt.claims', json_build_object('sub', m4, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select post_id into p_tx from public.flock_post_create('good', null, 'Texas rescue needs fosters.', '{}', null, false);
  ok := (select array_agg(s.post_id) from public.flock_review_post_spaces(all_ids || p_tx) s) = array[p_tx];
  reset role;
  if ok then passed := passed + 1; else failed := array_append(failed, 'chapter reviewers get their chapter only'); end if;

  -- 4) Once a report is resolved and a post reviewed, they leave the lookup
  --    with the queue.
  perform set_config('request.jwt.claims', json_build_object('sub', ad, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.flock_resolve_report('post', p_learn, 'keep', null);
  perform public.flock_review_post(p_good, 'approve', null);
  ok := (select array_agg(s.post_id) from public.flock_review_post_spaces(all_ids) s) = array[p_chap];
  reset role;
  if ok then passed := passed + 1; else failed := array_append(failed, 'resolved items leave the lookup'); end if;

  raise exception 'FLOCK REVIEW SPACES CHECKS: % passed, % failed%', passed, coalesce(array_length(failed, 1), 0),
    case when array_length(failed, 1) > 0 then ': ' || array_to_string(failed, ', ') else '' end;
end $$;
