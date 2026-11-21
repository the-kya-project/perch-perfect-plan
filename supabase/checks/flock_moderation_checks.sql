-- Verification for 20261108110000_flock_moderation.
--
-- Self-contained and leaves nothing behind: an admin, four Flock members (three
-- in Great Lakes, one in Texas), a free user and a household member; posts,
-- comments, journeys, reports, reviews and notifications. Then rolls back.
--   "FLOCK MODERATION CHECKS: n passed, 0 failed"           → all good
--   "FLOCK MODERATION CHECKS: n passed, k failed: <names>"  → which ones broke
-- Run by .github/workflows/db-checks.yml on every PR (scripts/db-checks.sh).
do $$
declare
  ad  uuid := gen_random_uuid();  -- admin
  m1  uuid := gen_random_uuid();  -- member, Great Lakes, owns the birds
  m2  uuid := gen_random_uuid();  -- member, Great Lakes
  m3  uuid := gen_random_uuid();  -- member, Great Lakes
  m4  uuid := gen_random_uuid();  -- member, Texas
  fr  uuid := gen_random_uuid();  -- free
  hh  uuid := gen_random_uuid();  -- household on m1's birds
  b1  uuid := gen_random_uuid();
  p_learn uuid; p_good uuid; p_good2 uuid; p_good3 uuid; p_chap uuid; p_tx uuid; c1 uuid; c2 uuid;
  jc uuid; jp uuid; u2 uuid;
  passed int := 0; failed text[] := '{}';
  ok boolean; n int; denied boolean; r record;
begin
  insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  select '00000000-0000-0000-0000-000000000000', x, 'authenticated', 'authenticated', x::text || '@checks.invalid', '{}', '{}', now(), now()
  from unnest(array[ad, m1, m2, m3, m4, fr, hh]) as x;
  insert into public.entitlements (user_id, plan, status, source, starts_at)
  select x, 'comp', 'active', 'manual', now() - interval '1 day' from unnest(array[m1, m2, m3, m4]) as x;
  insert into public.user_roles (user_id, role) values (ad, 'admin');
  insert into public.birds (id, owner_id, name, species) values (b1, m1, 'Kiwi', 'Cockatiel');
  insert into public.bird_members (bird_id, user_id, role) values (b1, hh, 'household') on conflict do nothing;
  insert into public.flock_profiles (user_id, display_name, region_slug, setup_completed_at) values
    (ad, 'Brittany K.', 'great-lakes', now()), (m1, 'Alex R.', 'great-lakes', now()), (m2, 'Priya S.', 'great-lakes', now()),
    (m3, 'Sam T.', 'great-lakes', now()), (m4, 'Jo K.', 'texas', now());
  insert into public.clip_assets (uid, bird_id) values ('modclip00001', b1), ('modclip00002', b1), ('modclip00003', b1);
  update public.journey_settings set audience = 'everyone';
  update public.flock_moderation_settings set report_threshold = 3;

  perform set_config('request.jwt.claims', json_build_object('sub', m1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select post_id into p_learn from public.flock_post_create('learn', null, 'Just clip his wings, problem solved.', '{}', null, false);
  select post_id into p_good from public.flock_post_create('good', null, 'Midwest Avian Rescue needs a new aviary roof.', '{}', null, false);
  select post_id into p_good2 from public.flock_post_create('good', null, 'Fundraiser link here.', '{}', null, false);
  select post_id into p_good3 from public.flock_post_create('good', null, 'Buy my bird toys!', '{}', null, false);
  jc := public.journey_start(b1, 'recall', null, null, null, 'most_days', 'community', 'cfstream:modclip00001');
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', m4, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select post_id into p_tx from public.flock_post_create('chapter', null, 'Houston bird swap?', '{}', null, false);
  reset role;

  -- 1) Reporting: members only, never your own, one report per person.
  ok := true;
  perform set_config('request.jwt.claims', json_build_object('sub', fr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  denied := false; begin perform public.flock_report('post', p_learn, 'unsafe', null); exception when insufficient_privilege then denied := true; end; ok := ok and denied;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', m1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  denied := false; begin perform public.flock_report('post', p_learn, 'unsafe', null); exception when invalid_parameter_value then denied := true; end; ok := ok and denied;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', m2, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.flock_report('post', p_learn, 'unsafe', 'Wing clipping isn''t a fix for behavior.');
  perform public.flock_report('post', p_learn, 'unkind', null);  -- changes their report, doesn't add one
  denied := false; begin perform public.flock_report('post', p_good, 'spam', null); exception when no_data_found then denied := true; end; ok := ok and denied;  -- can't see it yet
  denied := false; begin perform 1 from public.flock_reports; exception when insufficient_privilege then denied := true; end; ok := ok and denied;
  reset role;
  ok := ok and (select count(*) from public.flock_reports where subject_id = p_learn) = 1
           and (select reason from public.flock_reports where subject_id = p_learn) = 'unkind';
  if ok then passed := passed + 1; else failed := array_append(failed, 'reporting: members only, not your own, once each'); end if;

  -- 2) Reported content stays up below the threshold; at it, it's hidden from
  --    everyone but its author.
  perform set_config('request.jwt.claims', json_build_object('sub', m3, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.flock_report('post', p_learn, 'unsafe', null);  -- 2 of 3
  ok := exists (select 1 from public.flock_post(p_learn));
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ad, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.flock_report('post', p_learn, 'unsafe', null);  -- 3 of 3
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', m3, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := ok and not exists (select 1 from public.flock_post(p_learn))
           and not exists (select 1 from public.flock_feed('everything', null, 50) where post_id = p_learn);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', m1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := ok and exists (select 1 from public.flock_post(p_learn));
  reset role;
  if ok then passed := passed + 1; else failed := array_append(failed, 'hidden at the report threshold, author still sees it'); end if;

  -- 3) The threshold is a setting only admins change.
  perform set_config('request.jwt.claims', json_build_object('sub', m2, 'role', 'authenticated')::text, true);
  set local role authenticated;
  denied := false; begin perform public.admin_set_report_threshold(1); exception when insufficient_privilege then denied := true; end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ad, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.admin_set_report_threshold(2);
  reset role;
  ok := denied and (select report_threshold from public.flock_moderation_settings) = 2;
  update public.flock_moderation_settings set report_threshold = 3;
  if ok then passed := passed + 1; else failed := array_append(failed, 'threshold: admins only'); end if;

  -- 4) The review queue is reviewers only; it lists Do good and reports with counts.
  ok := true;
  for n in 1..2 loop
    perform set_config('request.jwt.claims', json_build_object('sub', (array[m2, fr])[n], 'role', 'authenticated')::text, true);
    set local role authenticated;
    denied := false; begin perform * from public.flock_review_queue('all'); exception when insufficient_privilege then denied := true; end; ok := ok and denied;
    denied := false; begin perform public.flock_review_post(p_good, 'approve', null); exception when insufficient_privilege then denied := true; end; ok := ok and denied;
    denied := false; begin perform public.flock_resolve_report('post', p_learn, 'keep', null); exception when insufficient_privilege then denied := true; end; ok := ok and denied;
    ok := ok and public.flock_can_review() = false;
    reset role;
  end loop;
  perform set_config('request.jwt.claims', json_build_object('sub', ad, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select * into r from public.flock_review_counts();
  ok := ok and public.flock_can_review() and r.good = 3 and r.reports = 1
    and exists (select 1 from public.flock_review_queue('reports') q
                where q.subject_id = p_learn and q.report_count = 3 and q.hidden and q.author_name = 'Alex R.'
                  and q.notes = array['Wing clipping isn''t a fix for behavior.'] is not true)  -- m2 changed theirs to no note
    and (select count(*) from public.flock_review_queue('good')) = 3;
  reset role;
  if ok then passed := passed + 1; else failed := array_append(failed, 'review queue: reviewers only, with counts'); end if;

  -- 5) Do good: approve goes live and tells the author; changes needs a note;
  --    decline. Each sends the author a review notification.
  perform set_config('request.jwt.claims', json_build_object('sub', ad, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.flock_review_post(p_good, 'approve', null);
  denied := false; begin perform public.flock_review_post(p_good2, 'changes', '  '); exception when invalid_parameter_value then denied := true; end;
  perform public.flock_review_post(p_good2, 'changes', 'Add the rescue''s name and a link to its wish list.');
  perform public.flock_review_post(p_good3, 'decline', null);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', m2, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := denied and exists (select 1 from public.flock_feed('good', null, 50) where post_id = p_good)
        and not exists (select 1 from public.flock_post(p_good2)) and not exists (select 1 from public.flock_post(p_good3));
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', m1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := ok and (select array_agg(detail order by detail) from public.flock_notifications_list('all', 50) where kind = 'review')
               = array['approved', 'changes_requested', 'declined']
           and exists (select 1 from public.flock_notifications_list('all', 50) where kind = 'review' and note = 'Add the rescue''s name and a link to its wish list.')
           and exists (select 1 from public.flock_post(p_good2) where status = 'changes_requested' and review_note like 'Add the rescue%');
  reset role;
  if ok then passed := passed + 1; else failed := array_append(failed, 'Do good: approve, ask for changes, decline'); end if;

  -- 6) Reports: Keep it shows it again; Remove it takes it down for good;
  --    Message them sends the author a notice and changes nothing else.
  perform set_config('request.jwt.claims', json_build_object('sub', ad, 'role', 'authenticated')::text, true);
  set local role authenticated;
  denied := false; begin perform public.flock_resolve_report('post', p_learn, 'message', ''); exception when invalid_parameter_value then denied := true; end;
  perform public.flock_resolve_report('post', p_learn, 'message', 'Please share why clipping isn''t a fix, or edit this post.');
  ok := denied and exists (select 1 from public.flock_review_queue('reports') q where q.subject_id = p_learn and q.messaged_at is not null and q.hidden);
  perform public.flock_resolve_report('post', p_learn, 'keep', null);
  ok := ok and not exists (select 1 from public.flock_review_queue('reports') q where q.subject_id = p_learn);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', m3, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := ok and exists (select 1 from public.flock_post(p_learn));
  perform public.flock_report('post', p_learn, 'unsafe', null);  -- a new round of reports starts from zero
  ok := ok and exists (select 1 from public.flock_post(p_learn));
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ad, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.flock_resolve_report('post', p_learn, 'remove', null);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', m3, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := ok and not exists (select 1 from public.flock_post(p_learn));
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', m1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := ok and exists (select 1 from public.flock_post(p_learn) where status = 'removed')
           and exists (select 1 from public.flock_notifications_list('all', 50) where kind = 'notice' and note like 'Please share why%');
  reset role;
  if ok then passed := passed + 1; else failed := array_append(failed, 'reports: keep, remove, message'); end if;

  -- 7) A reported journey update hides from other members but not from the
  --    bird's household; comments are reportable too.
  perform set_config('request.jwt.claims', json_build_object('sub', m1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  u2 := public.journey_post_update(jc, 'cfstream:modclip00002', 'all_in', 'Recall from the couch!');
  reset role;
  update public.flock_moderation_settings set report_threshold = 1;
  perform set_config('request.jwt.claims', json_build_object('sub', m2, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.flock_report('journey_update', u2, 'spam', null);
  ok := not exists (select 1 from public.journey_view_updates(jc) where update_id = u2)
    and not exists (select 1 from public.journey_clip_refs(jc, array[u2]));
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', m1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := ok and exists (select 1 from public.journey_view_updates(jc) where update_id = u2);
  c1 := public.flock_comment_create('post', p_good, null, 'Thanks everyone!', null, false);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', m2, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.flock_report('comment', c1, 'other', 'Off topic');
  ok := ok and not exists (select 1 from public.flock_comments_for('post', p_good) where comment_id = c1);
  reset role;
  update public.flock_moderation_settings set report_threshold = 3;
  if ok then passed := passed + 1; else failed := array_append(failed, 'journey updates and comments: reportable, hidden from others'); end if;

  -- 8) Notifications: comments and replies, cheers grouped by day, review
  --    results; none to yourself.
  perform set_config('request.jwt.claims', json_build_object('sub', m2, 'role', 'authenticated')::text, true);
  set local role authenticated;
  c2 := public.flock_comment_create('post', p_good, null, 'Shared it with my vet!', null, false);
  perform public.flock_react('post', p_good, 'great_job', true);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', m3, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.flock_comment_create('post', p_good, c2, '@Priya good idea.', null, false);
  perform public.flock_react('post', p_good, 'love_this', true);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', m1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.flock_react('post', p_good, 'great_job', true);  -- your own: no notification
  ok := (select count(*) from public.flock_notifications_list('replies', 50)) = 2
    and exists (select 1 from public.flock_notifications_list('cheers', 50) where subject_id = p_good and others = 1 and actor_name = 'Sam T.' and cardinality(ids) = 2)
    and (select count(*) from public.flock_notifications_list('cheers', 50)) = 1;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', m2, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := ok and exists (select 1 from public.flock_notifications_list('replies', 50) where detail = 'reply' and actor_name = 'Sam T.');
  reset role;
  if ok then passed := passed + 1; else failed := array_append(failed, 'notifications: replies and grouped cheers'); end if;

  -- 9) Notifications reach only people who may see the content: new clips to
  --    followers (not others, not after the journey goes "Just me"), chapter
  --    posts to that chapter only, and nothing once the content is removed.
  perform set_config('request.jwt.claims', json_build_object('sub', m2, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.journey_follow(jc, true);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', m1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.journey_post_update(jc, 'cfstream:modclip00003', 'distracted', null);
  select post_id into p_chap from public.flock_post_create('chapter', null, 'Picnic in Fort Wayne?', '{}', null, false);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', m2, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := (select count(*) from public.flock_notifications_list('all', 50) where kind = 'clip') = 1
    and exists (select 1 from public.flock_notifications_list('chapter', 50) where subject_id = p_chap and region_name = 'Great Lakes');
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', m3, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := ok and not exists (select 1 from public.flock_notifications_list('all', 50) where kind = 'clip');
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', m4, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := ok and not exists (select 1 from public.flock_notifications_list('all', 50) where subject_id = p_chap);
  reset role;
  -- The journey goes "Just me": the follower's clip notification disappears, and new clips don't reach them.
  update public.journeys set visibility = 'private' where id = jc;
  perform set_config('request.jwt.claims', json_build_object('sub', m2, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := ok and not exists (select 1 from public.flock_notifications_list('all', 50) where kind = 'clip');
  reset role;
  ok := ok and (select count(*) from public.flock_notifications where user_id = m2 and kind = 'clip') = 1;
  -- Removed content leaves others' lists.
  update public.flock_moderation_settings set report_threshold = 1;
  perform set_config('request.jwt.claims', json_build_object('sub', m3, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.flock_report('post', p_chap, 'spam', null);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', m2, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := ok and not exists (select 1 from public.flock_notifications_list('all', 50) where subject_id = p_chap);
  denied := false; begin perform 1 from public.flock_notifications; exception when insufficient_privilege then denied := true; end;
  ok := ok and denied;
  reset role;
  update public.flock_moderation_settings set report_threshold = 3;
  if ok then passed := passed + 1; else failed := array_append(failed, 'notifications respect who may see the content'); end if;

  -- 10) Unread and mark as read.
  perform set_config('request.jwt.claims', json_build_object('sub', m1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  n := public.flock_notifications_unread();
  perform public.flock_notifications_mark_read(null);
  ok := n > 0 and public.flock_notifications_unread() = 0 and not exists (select 1 from public.flock_notifications_list('all', 50) where unread);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', fr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  denied := false; begin perform * from public.flock_notifications_list('all', 50); exception when insufficient_privilege then denied := true; end;
  ok := ok and denied;
  reset role;
  if ok then passed := passed + 1; else failed := array_append(failed, 'unread and mark read; members only'); end if;

  -- 11) A chapter lead (flock_reviewers with a region) reviews only that chapter.
  insert into public.flock_reviewers (user_id, region_slug) values (m4, 'texas');
  perform set_config('request.jwt.claims', json_build_object('sub', m4, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select post_id into p_good3 from public.flock_post_create('good', null, 'Texas rescue needs fosters.', '{}', null, false);
  ok := public.flock_can_review()
    and (select array_agg(subject_id) from public.flock_review_queue('good')) = array[p_good3];
  denied := false; begin perform public.flock_review_post(p_good2, 'approve', null); exception when no_data_found then denied := true; end;
  ok := ok and denied;
  reset role;
  if ok then passed := passed + 1; else failed := array_append(failed, 'chapter reviewers see their chapter only'); end if;

  raise exception 'FLOCK MODERATION CHECKS: % passed, % failed%', passed, coalesce(array_length(failed, 1), 0),
    case when array_length(failed, 1) > 0 then ': ' || array_to_string(failed, ', ') else '' end;
end $$;
