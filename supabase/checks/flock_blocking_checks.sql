-- Verification for 20261121100000_flock_member_blocking (build D).
--
-- Self-contained and leaves nothing behind: an admin (ad), members A, B and C
-- in Great Lakes, H (a member and household on A's bird), and a free user.
-- A and B post, comment, reply, react, follow and RSVP to each other, then A
-- blocks B. Raises at the end so everything rolls back.
--   "FLOCK BLOCKING CHECKS: n passed, 0 failed"           → all good
--   "FLOCK BLOCKING CHECKS: n passed, k failed: <names>"  → which ones broke
-- Run by .github/workflows/db-checks.yml on every PR (scripts/db-checks.sh).
do $$
declare
  ad uuid := gen_random_uuid();
  a  uuid := gen_random_uuid();
  b  uuid := gen_random_uuid();
  c  uuid := gen_random_uuid();
  h  uuid := gen_random_uuid();
  fr uuid := gen_random_uuid();
  ba uuid := gen_random_uuid();   -- A's bird (H is household)
  bb uuid := gen_random_uuid();   -- B's bird, shown
  pa uuid; pb uuid; ca1 uuid; cb1 uuid; cc1 uuid; rb uuid; ja uuid; jb uuid; ev uuid;
  passed int := 0; failed text[] := '{}';
  ok boolean; denied boolean; n int;
begin
  insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  select '00000000-0000-0000-0000-000000000000', x, 'authenticated', 'authenticated', x::text || '@checks.invalid', '{}', '{}', now(), now()
  from unnest(array[ad, a, b, c, h, fr]) as x;
  -- Test members have agreed to the community guidelines (20261128180000).
  insert into public.flock_guideline_agreements (user_id, version)
  select u.id, public.current_guidelines_version() from auth.users u where u.email like '%@checks.invalid'
  on conflict do nothing;
  insert into public.entitlements (user_id, plan, status, source, starts_at)
  select x, 'comp', 'active', 'manual', now() - interval '1 day' from unnest(array[a, b, c, h]) as x;
  insert into public.user_roles (user_id, role) values (ad, 'admin');
  insert into public.birds (id, owner_id, name, species) values (ba, a, 'Kiwi', 'Cockatiel'), (bb, b, 'Mango', 'Sun conure');
  insert into public.bird_members (bird_id, user_id, role) values (ba, h, 'household') on conflict do nothing;
  insert into public.flock_profiles (user_id, display_name, region_slug, setup_completed_at) values
    (ad, 'Kya team', 'great-lakes', now()), (a, 'Alex R.', 'great-lakes', now()), (b, 'Blake S.', 'great-lakes', now()),
    (c, 'Casey T.', 'great-lakes', now()), (h, 'Harper R.', 'great-lakes', now());
  insert into public.flock_shown_birds (user_id, bird_id, shown) values (b, bb, true), (a, ba, true);
  insert into public.clip_assets (uid, bird_id) values ('blockclip001', ba), ('blockclip002', bb);
  insert into storage.objects (bucket_id, name) values ('flock-avatars', b::text || '/avatar.jpg'), ('flock-avatars', c::text || '/avatar.jpg');
  update public.journey_settings set audience = 'everyone';

  -- Before the block: everyone talks to everyone.
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select post_id into pa from public.flock_post_create('learn', null, 'How do you all handle night frights?', '{}', null, false);
  ja := public.journey_start(ba, 'recall', null, null, null, 'most_days', 'community', 'cfstream:blockclip001');
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select post_id into pb from public.flock_post_create('learn', null, 'Mango learned to wave.', '{}', null, false);
  jb := public.journey_start(bb, 'step-up', null, null, null, 'most_days', 'community', 'cfstream:blockclip002');
  cb1 := public.flock_comment_create('post', pa, null, 'A night light helped us.', null, false);
  perform public.flock_react('post', pa, 'been_there', true);
  perform public.journey_follow(ja, true);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  cc1 := public.flock_comment_create('post', pa, null, 'Cover half the cage.', null, false);
  perform public.flock_react('post', pa, 'love_this', true);
  perform public.flock_report('post', pb, 'spam', null);                 -- a report filed before the block
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  rb := public.flock_comment_create('post', pa, cc1, 'Same here!', null, false);  -- B replies under C's comment
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ca1 := public.flock_comment_create('post', pb, null, 'So cute!', null, false);
  perform public.flock_react('post', pb, 'great_job', true);
  perform public.journey_follow(jb, true);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ad, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ev := public.flock_event_save(null, 'great-lakes', 'meetup', 'Winter flock meetup', now() + interval '5 days', null,
                                'in_person', 'Ann Arbor District Library', null, null, null, null, null, null);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.flock_event_rsvp(ev, 'going');
  reset role;
  ok := exists (select 1 from public.flock_notifications where user_id = a and actor_id = b);
  if ok then passed := passed + 1; else failed := array_append(failed, 'setup: B''s comment notified A before the block'); end if;

  -- 1) Blocking: members only, never yourself, and only you see your list.
  ok := true;
  n := (select count(*) from public.flock_notifications where user_id = b);
  perform set_config('request.jwt.claims', json_build_object('sub', fr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  denied := false; begin perform public.flock_block(a, true); exception when insufficient_privilege then denied := true; end; ok := ok and denied;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  denied := false; begin perform public.flock_block(a, true); exception when invalid_parameter_value then denied := true; end; ok := ok and denied;
  denied := false; begin insert into public.flock_blocks (blocker_id, blocked_id) values (a, c); exception when insufficient_privilege then denied := true; end; ok := ok and denied;
  perform public.flock_block(b, true);
  perform public.flock_block(b, true);  -- twice is fine
  ok := ok and (select count(*) from public.flock_blocks) = 1
           and (select array_agg(user_id) from public.flock_my_blocks()) = array[b]
           and (select display_name from public.flock_my_blocks()) = 'Blake S.';
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  -- B is never told: no row they can read, nothing in their list, no notification.
  ok := ok and (select count(*) from public.flock_blocks) = 0 and not exists (select 1 from public.flock_my_blocks());
  reset role;
  ok := ok and (select count(*) from public.flock_notifications where user_id = b) = n;
  if ok then passed := passed + 1; else failed := array_append(failed, 'blocking: members only, not yourself, private, B never told'); end if;

  -- 2) Feeds and single posts, both ways. C still sees both.
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := not exists (select 1 from public.flock_feed('everything', null, 50) where post_id = pb)
    and not exists (select 1 from public.flock_feed('learn', null, 50) where post_id = pb)
    and not exists (select 1 from public.flock_post(pb))
    and exists (select 1 from public.flock_feed('everything', null, 50) where post_id = pa);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := ok and not exists (select 1 from public.flock_feed('everything', null, 50) where post_id = pa)
           and not exists (select 1 from public.flock_post(pa))
           and exists (select 1 from public.flock_post(pb));
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := ok and (select count(*) from public.flock_feed('everything', null, 50) where post_id in (pa, pb)) = 2;
  reset role;
  if ok then passed := passed + 1; else failed := array_append(failed, 'feeds and single posts hidden both ways; others unaffected'); end if;

  -- 3) Comment threads, replies, counts and "who reacted".
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := (select array_agg(comment_id order by comment_id) from public.flock_comments_for('post', pa)) = array[cc1]
    and (select comment_count from public.flock_feed('everything', null, 50) where post_id = pa) = 1
    and (select comment_count from public.flock_comment_counts('post', array[pa])) = 1
    and (select been_there from public.flock_post(pa)) = 0
    and (select love_this from public.flock_post(pa)) = 1
    and not exists (select 1 from public.flock_reactors('post', pa) where user_id = b)
    and exists (select 1 from public.flock_reactors('post', pa) where user_id = c);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  -- A's comment on B's own post and A's reaction to it drop out for B too.
  ok := ok and not exists (select 1 from public.flock_comments_for('post', pb) where comment_id = ca1)
           and (select comment_count from public.flock_post(pb)) = 0
           and (select great_job from public.flock_post(pb)) = 0
           and not exists (select 1 from public.flock_reactors('post', pb) where user_id = a);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := ok and (select count(*) from public.flock_comments_for('post', pa)) = 3
           and (select comment_count from public.flock_post(pa)) = 3;
  reset role;
  -- Nothing was deleted.
  ok := ok and (select count(*) from public.flock_comments where id in (ca1, cb1, cc1, rb)) = 4
           and (select count(*) from public.flock_reactions where subject_id in (pa, pb)) = 3;
  if ok then passed := passed + 1; else failed := array_append(failed, 'comments, replies, counts and reactors hidden, not deleted'); end if;

  -- 4) Profiles, shown birds, chapter members and roster.
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := not exists (select 1 from public.flock_member_profile(b))
    and not exists (select 1 from public.flock_visible_birds(array[b], null))
    and not exists (select 1 from public.flock_visible_birds(null, array[bb]))
    and not exists (select 1 from public.flock_chapter_members('great-lakes') where user_id = b)
    and not exists (select 1 from public.flock_chapter_roster('great-lakes') where user_id = b)
    and exists (select 1 from public.flock_chapter_roster('great-lakes') where user_id = c);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := ok and not exists (select 1 from public.flock_member_profile(a))
           and not exists (select 1 from public.flock_chapter_roster('great-lakes') where user_id = a)
           and not exists (select 1 from public.flock_visible_birds(array[a], null));
  reset role;
  if ok then passed := passed + 1; else failed := array_append(failed, 'profiles, birds, members and roster hidden both ways'); end if;

  -- 5) Journeys, updates, follows and follower counts.
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := not exists (select 1 from public.journey_view(jb))
    and not exists (select 1 from public.journey_view_updates(jb))
    and not exists (select 1 from public.journey_following() where journey_id = jb)
    and not exists (select 1 from public.journey_feed('for_you', 60) where journey_id = jb)
    and (select followers from public.journey_view(ja)) = 0;          -- B's follow isn't counted for A
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := ok and not exists (select 1 from public.journey_view(ja))
           and not exists (select 1 from public.journey_following() where journey_id = ja)
           and (select followers from public.journey_view(jb)) = 0;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := ok and (select followers from public.journey_view(ja)) = 1 and exists (select 1 from public.journey_view(jb));
  reset role;
  ok := ok and (select count(*) from public.journey_follows where journey_id in (ja, jb)) = 2;
  if ok then passed := passed + 1; else failed := array_append(failed, 'journeys, updates and follows hidden both ways, rows kept'); end if;

  -- 6) Neither can comment, reply, react or follow.
  ok := true;
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  denied := false; begin perform public.flock_comment_create('post', pa, null, 'hello?', null, false); exception when no_data_found then denied := true; end; ok := ok and denied;
  denied := false; begin perform public.flock_comment_create('post', pb, ca1, 'reply to A', null, false); exception when no_data_found then denied := true; end; ok := ok and denied;
  denied := false; begin perform public.flock_react('post', pa, 'great_job', true); exception when no_data_found then denied := true; end; ok := ok and denied;
  denied := false; begin perform public.flock_react('comment', ca1, 'great_job', true); exception when no_data_found then denied := true; end; ok := ok and denied;
  denied := false; begin perform public.journey_follow(ja, true); exception when no_data_found then denied := true; end; ok := ok and denied;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  denied := false; begin perform public.flock_comment_create('post', pb, null, 'hi', null, false); exception when no_data_found then denied := true; end; ok := ok and denied;
  denied := false; begin perform public.flock_comment_create('post', pa, cb1, 'reply to B', null, false); exception when no_data_found then denied := true; end; ok := ok and denied;
  denied := false; begin perform public.flock_react('comment', cb1, 'love_this', true); exception when no_data_found then denied := true; end; ok := ok and denied;
  reset role;
  if ok then passed := passed + 1; else failed := array_append(failed, 'no comments, replies, reactions or follows either way'); end if;

  -- 7) Notifications: B's old one drops out of A's list; nothing new from B;
  --    the Kya team's review notices always arrive.
  n := (select count(*) from public.flock_notifications where user_id = a and actor_id = b);
  perform private.flock_notify(a, 'cheer', b, 'post', pa, null, null);
  perform private.flock_notify(b, 'notice', a, 'post', pb, null, 'A note from the team');
  ok := n > 0  -- B's comment and reaction from before the block are still stored
    and (select count(*) from public.flock_notifications where user_id = a and actor_id = b) = n
    and exists (select 1 from public.flock_notifications where user_id = b and kind = 'notice');
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := ok and not exists (select 1 from public.flock_notifications_list('all', 100) where actor_name = 'Blake S.');
  reset role;
  if ok then passed := passed + 1; else failed := array_append(failed, 'notifications from a blocked person hidden; team notices still arrive'); end if;

  -- 8) Chapter events: both still see it and RSVP; neither shows in the
  --    other's "going" list. Counts stay true (spot limits depend on them).
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := exists (select 1 from public.flock_event(ev));
  perform public.flock_event_rsvp(ev, 'going');
  ok := ok and not exists (select 1 from public.flock_event(ev) e, jsonb_array_elements(e.goers) g where (g->>'user_id')::uuid = a)
           and (select going from public.flock_event(ev)) = 2
           and exists (select 1 from public.flock_chapter_events('upcoming') where event_id = ev);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := ok and not exists (select 1 from public.flock_event(ev) e, jsonb_array_elements(e.goers) g where (g->>'user_id')::uuid = b);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := ok and (select jsonb_array_length(goers) from public.flock_event(ev)) = 2;
  reset role;
  if ok then passed := passed + 1; else failed := array_append(failed, 'events: both see and RSVP; hidden from each other''s goers'); end if;

  -- 9) A direct database or storage call can't read a blocked member.
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := not exists (select 1 from public.flock_profiles where user_id = b)
    and exists (select 1 from public.flock_profiles where user_id = c)
    and not exists (select 1 from storage.objects where bucket_id = 'flock-avatars' and name = b::text || '/avatar.jpg')
    and exists (select 1 from storage.objects where bucket_id = 'flock-avatars' and name = c::text || '/avatar.jpg');
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := ok and not exists (select 1 from public.flock_profiles where user_id = a);
  reset role;
  if ok then passed := passed + 1; else failed := array_append(failed, 'direct reads of a blocked member''s profile and avatar refused'); end if;

  -- 10) Moderation never limited: reports before and after a block count, and
  --     the review queue shows everything even to an admin who blocked them.
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.flock_report('post', pb, 'unkind', 'Reported after blocking.');
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ad, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.flock_block(b, true);
  ok := exists (select 1 from public.flock_review_queue('all') where subject_id = pb and report_count = 2);
  reset role;
  ok := ok and coalesce(current_setting('kya.flock_ignore_blocks', true), '') = '';
  if ok then passed := passed + 1; else failed := array_append(failed, 'moderation: reports before and after a block, queue sees all'); end if;

  -- 11) A bird's household is never blocked from that bird's care.
  perform set_config('request.jwt.claims', json_build_object('sub', h, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.flock_block(a, true);
  ok := exists (select 1 from public.journey_view(ja))
    and exists (select 1 from public.journey_view_updates(ja))
    and not exists (select 1 from public.flock_post(pa))
    and not exists (select 1 from public.flock_member_profile(a));
  perform public.flock_block(a, false);
  reset role;
  if ok then passed := passed + 1; else failed := array_append(failed, 'household keeps the bird''s journey; community hidden'); end if;

  -- 12) Unblocking restores both ways, unless the other has blocked too.
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.flock_block(a, true);          -- now both have blocked
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.flock_block(b, false);
  ok := not exists (select 1 from public.flock_post(pb)) and not exists (select 1 from public.flock_my_blocks());
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.flock_block(a, false);
  ok := ok and exists (select 1 from public.flock_post(pa))
           and (select count(*) from public.flock_comments_for('post', pb)) = 1;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := ok and exists (select 1 from public.flock_post(pb))
           and (select count(*) from public.flock_comments_for('post', pa)) = 3
           and exists (select 1 from public.flock_member_profile(b))
           and exists (select 1 from public.flock_profiles where user_id = b)
           and (select followers from public.journey_view(ja)) = 1;
  reset role;
  if ok then passed := passed + 1; else failed := array_append(failed, 'unblock restores both ways only when neither blocks'); end if;

  -- 13) Account deletion removes that person's block rows, both directions.
  insert into public.flock_blocks (blocker_id, blocked_id) values (c, b), (b, c), (ad, c);
  delete from auth.users where id = b;
  ok := not exists (select 1 from public.flock_blocks where b in (blocker_id, blocked_id))
    and exists (select 1 from public.flock_blocks where blocker_id = ad and blocked_id = c);  -- others' rows are untouched
  if ok then passed := passed + 1; else failed := array_append(failed, 'account deletion removes block rows'); end if;

  raise exception 'FLOCK BLOCKING CHECKS: % passed, % failed%', passed, coalesce(array_length(failed, 1), 0),
    case when array_length(failed, 1) > 0 then ': ' || array_to_string(failed, ', ') else '' end;
end $$;
