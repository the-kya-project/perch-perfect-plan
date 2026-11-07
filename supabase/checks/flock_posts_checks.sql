-- Verification for 20261108100000_flock_posts.
--
-- Self-contained and leaves nothing behind: three Flock members (two in Great
-- Lakes, one in Texas), an app premium member, a free user and a household
-- member; posts, comments, replies, photos, reactions and a "Just me" journey.
-- Checks who reads and writes what, then rolls back.
--   "FLOCK POSTS CHECKS: n passed, 0 failed"           → all good
--   "FLOCK POSTS CHECKS: n passed, k failed: <names>"  → which ones broke
-- Run by .github/workflows/db-checks.yml on every PR (scripts/db-checks.sh).
do $$
declare
  m1  uuid := gen_random_uuid();  -- Flock member, Great Lakes, owns the birds
  m2  uuid := gen_random_uuid();  -- Flock member, Great Lakes
  m3  uuid := gen_random_uuid();  -- Flock member, Texas
  pr  uuid := gen_random_uuid();  -- app premium (no Flock)
  fr  uuid := gen_random_uuid();  -- free
  hh  uuid := gen_random_uuid();  -- household on m1's birds (free tier)
  b1  uuid := gen_random_uuid();  -- m1's bird, shown
  b2  uuid := gen_random_uuid();  -- m1's bird, not shown
  p_learn uuid; p_good uuid; p_chap uuid; p_photo uuid; c1 uuid; c2 uuid; c3 uuid; c4 uuid;
  jp uuid; up uuid; v_status text; ph1 text; ph2 text;
  passed int := 0; failed text[] := '{}';
  ok boolean; n int; denied boolean; msg text; det text; r record;
begin
  insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  select '00000000-0000-0000-0000-000000000000', x, 'authenticated', 'authenticated', x::text || '@checks.invalid', '{}', '{}', now(), now()
  from unnest(array[m1, m2, m3, pr, fr, hh]) as x;
  insert into public.entitlements (user_id, plan, status, source, starts_at) values
    (m1, 'comp', 'active', 'manual', now() - interval '1 day'),
    (m2, 'comp', 'active', 'manual', now() - interval '1 day'),
    (m3, 'comp', 'active', 'manual', now() - interval '1 day'),
    (pr, 'app_premium', 'active', 'manual', now() - interval '1 day');
  insert into public.birds (id, owner_id, name, species, photo_url) values
    (b1, m1, 'Kiwi', 'Cockatiel', m1::text || '/kiwi.jpg'), (b2, m1, 'Mango', 'Conure', m1::text || '/mango.jpg');
  insert into public.bird_members (bird_id, user_id, role) values (b1, hh, 'household'), (b2, hh, 'household') on conflict do nothing;
  insert into public.flock_profiles (user_id, display_name, region_slug, setup_completed_at) values
    (m1, 'Alex R.', 'great-lakes', now()), (m2, 'Priya S.', 'great-lakes', now()), (m3, 'Jo K.', 'texas', now());
  insert into public.flock_shown_birds (bird_id, user_id, shown) values (b1, m1, true), (b2, m1, false);
  ph1 := m1::text || '/' || gen_random_uuid()::text || '.jpg';
  ph2 := m2::text || '/' || gen_random_uuid()::text || '.jpg';
  insert into storage.objects (bucket_id, name) values ('flock-posts', ph1), ('flock-posts', ph2);
  insert into public.clip_assets (uid, bird_id) values ('postsclip001', b2);
  update public.journey_settings set audience = 'everyone';

  -- m1 posts: Learn together (with a photo and the shown bird), Do good, chapter;
  -- and starts a "Just me" journey on the unshown bird.
  perform set_config('request.jwt.claims', json_build_object('sub', m1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select post_id into p_learn from public.flock_post_create('learn', 'Pegboard foraging', 'Thinking of building one for Kiwi.', array[ph1], b1, false);
  select post_id, status into p_good, v_status from public.flock_post_create('good', null, 'Our local rescue needs pellets.', '{}', null, false);
  select post_id into p_chap from public.flock_post_create('chapter', null, 'Picnic in Fort Wayne?', '{}', null, false);
  jp := public.journey_start(b2, 'step-up', null, null, null, 'most_days', 'private', 'cfstream:postsclip001');
  select id into up from public.journey_updates where journey_id = jp limit 1;
  reset role;

  -- 1) Non-members (app premium, free) can't read or write anything.
  ok := true;
  for n in 1..2 loop
    perform set_config('request.jwt.claims', json_build_object('sub', (array[pr, fr])[n], 'role', 'authenticated')::text, true);
    set local role authenticated;
    denied := false; begin perform * from public.flock_feed('everything', null, 20); exception when insufficient_privilege then denied := true; end; ok := ok and denied;
    denied := false; begin perform * from public.flock_post(p_learn); exception when insufficient_privilege then denied := true; end; ok := ok and denied;
    denied := false; begin perform * from public.flock_comments_for('post', p_learn); exception when insufficient_privilege then denied := true; end; ok := ok and denied;
    denied := false; begin perform * from public.flock_post_create('learn', null, 'hi', '{}', null, false); exception when insufficient_privilege then denied := true; end; ok := ok and denied;
    denied := false; begin perform public.flock_comment_create('post', p_learn, null, 'hi', null, false); exception when insufficient_privilege then denied := true; end; ok := ok and denied;
    denied := false; begin perform public.flock_react('post', p_learn, 'great_job', true); exception when insufficient_privilege then denied := true; end; ok := ok and denied;
    denied := false; begin perform * from public.flock_reactors('post', p_learn); exception when insufficient_privilege then denied := true; end; ok := ok and denied;
    denied := false; begin perform * from public.flock_media_refs(array[p_learn], null); exception when insufficient_privilege then denied := true; end; ok := ok and denied;
    denied := false; begin perform * from public.flock_vet_signs(); exception when insufficient_privilege then denied := true; end; ok := ok and denied;
    denied := false; begin perform 1 from public.flock_posts; exception when insufficient_privilege then denied := true; end; ok := ok and denied;
    denied := false; begin perform 1 from public.flock_comments; exception when insufficient_privilege then denied := true; end; ok := ok and denied;
    ok := ok and (select count(*) from storage.objects where bucket_id = 'flock-posts') = 0;
    reset role;
  end loop;
  if ok then passed := passed + 1; else failed := array_append(failed, 'non-members cannot read or write anything'); end if;

  -- 2) Do good waits for review: the author sees it as pending; nobody else sees
  --    it, comments on it or reacts to it until it's approved.
  ok := v_status = 'pending';
  perform set_config('request.jwt.claims', json_build_object('sub', m1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := ok and exists (select 1 from public.flock_feed('good', null, 20) where post_id = p_good and status = 'pending' and is_mine);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', m2, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := ok and not exists (select 1 from public.flock_feed('everything', null, 50) where post_id = p_good)
           and not exists (select 1 from public.flock_feed('good', null, 50) where post_id = p_good)
           and not exists (select 1 from public.flock_post(p_good));
  denied := false; begin perform public.flock_comment_create('post', p_good, null, 'Can help!', null, false); exception when no_data_found then denied := true; end; ok := ok and denied;
  denied := false; begin perform public.flock_react('post', p_good, 'love_this', true); exception when no_data_found then denied := true; end; ok := ok and denied;
  reset role;
  update public.flock_posts set status = 'live' where id = p_good;  -- what approval (PR B) does
  set local role authenticated;
  ok := ok and exists (select 1 from public.flock_feed('good', null, 20) where post_id = p_good and status = 'live');
  reset role;
  if ok then passed := passed + 1; else failed := array_append(failed, 'Do good is invisible to others until approved'); end if;

  -- 3) Learn together is live at once; a chapter post reaches its chapter only.
  perform set_config('request.jwt.claims', json_build_object('sub', m2, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := exists (select 1 from public.flock_feed('everything', null, 50) where post_id = p_learn and author_name = 'Alex R.' and author_region = 'Great Lakes' and photo_count = 1)
    and exists (select 1 from public.flock_feed('chapter', null, 50) where post_id = p_chap and region_name = 'Great Lakes')
    and exists (select 1 from public.flock_feed('everything', null, 50) where post_id = p_chap)
    and not exists (select 1 from public.flock_feed('learn', null, 50) where post_id = p_chap);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', m3, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := ok and exists (select 1 from public.flock_feed('everything', null, 50) where post_id = p_learn)
           and not exists (select 1 from public.flock_feed('everything', null, 50) where post_id = p_chap)
           and not exists (select 1 from public.flock_feed('chapter', null, 50) where post_id = p_chap)
           and not exists (select 1 from public.flock_post(p_chap));
  reset role;
  if ok then passed := passed + 1; else failed := array_append(failed, 'live posts and chapter-only posts'); end if;

  -- 4) An attached bird shows by name and photo only while it's shown; an
  --    unshown bird can't be attached.
  perform set_config('request.jwt.claims', json_build_object('sub', m2, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := exists (select 1 from public.flock_post(p_learn) where bird_id = b1 and bird_name = 'Kiwi' and bird_has_photo);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', m1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  denied := false; begin perform * from public.flock_post_create('learn', null, 'Mango says hi', '{}', b2, false); exception when invalid_parameter_value then denied := true; end;
  reset role;
  update public.flock_shown_birds set shown = false where bird_id = b1;
  perform set_config('request.jwt.claims', json_build_object('sub', m2, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := ok and denied and exists (select 1 from public.flock_post(p_learn) where bird_id is null and bird_name is null and not bird_has_photo);
  reset role;
  update public.flock_shown_birds set shown = true where bird_id = b1;
  if ok then passed := passed + 1; else failed := array_append(failed, 'attached bird: shown birds only, name and photo only'); end if;

  -- 5) Photos: only your own uploads can be attached; nobody reads the bucket
  --    directly but the uploader; references only for posts the caller may see.
  perform set_config('request.jwt.claims', json_build_object('sub', m1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  denied := false; begin perform * from public.flock_post_create('learn', null, 'Borrowed photo', array[ph2], null, false); exception when invalid_parameter_value then denied := true; end;
  ok := denied;
  denied := false; begin perform * from public.flock_post_create('learn', null, 'Missing photo', array[m1::text || '/' || gen_random_uuid()::text || '.jpg'], null, false); exception when invalid_parameter_value then denied := true; end;
  ok := ok and denied
    and (select count(*) from storage.objects where bucket_id = 'flock-posts') = 1
    and (select count(*) from storage.objects where bucket_id = 'flock-posts' and name = ph1) = 1;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', m3, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := ok and (select count(*) from storage.objects where bucket_id = 'flock-posts' and name = ph1) = 0
           and (select array_agg(path) from public.flock_media_refs(array[p_learn, p_chap], null)) = array[ph1];
  reset role;
  if ok then passed := passed + 1; else failed := array_append(failed, 'photos are private and only yours'); end if;

  -- 6) Comments: threaded one level deep, "Replying to" the person answered.
  perform set_config('request.jwt.claims', json_build_object('sub', m2, 'role', 'authenticated')::text, true);
  set local role authenticated;
  c1 := public.flock_comment_create('post', p_learn, null, 'What pegboard did you use?', ph2, false);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', m1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  c2 := public.flock_comment_create('post', p_learn, c1, 'A cheap one from the hardware store.', null, false);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', m3, 'role', 'authenticated')::text, true);
  set local role authenticated;
  c3 := public.flock_comment_create('post', p_learn, c2, 'How big are the holes?', null, false);
  ok := (select count(*) from public.flock_comments_for('post', p_learn)) = 3
    and exists (select 1 from public.flock_comments_for('post', p_learn) where comment_id = c1 and parent_id is null and has_photo and author_name = 'Priya S.')
    and exists (select 1 from public.flock_comments_for('post', p_learn) where comment_id = c2 and parent_id = c1 and reply_to_name = 'Priya S.')
    and exists (select 1 from public.flock_comments_for('post', p_learn) where comment_id = c3 and parent_id = c1 and reply_to_name = 'Alex R.')
    and (select comment_count from public.flock_post(p_learn)) = 3
    and (select array_agg(path) from public.flock_media_refs(null, array[c1])) = array[ph2];
  reset role;
  if ok then passed := passed + 1; else failed := array_append(failed, 'comments thread one level deep'); end if;

  -- 7) Only the author edits or deletes a post or comment; editing Do good sends
  --    it back for review.
  perform set_config('request.jwt.claims', json_build_object('sub', m2, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := true;
  denied := false; begin perform public.flock_post_edit(p_learn, null, 'Hijacked'); exception when no_data_found then denied := true; end; ok := ok and denied;
  denied := false; begin perform * from public.flock_post_delete(p_learn); exception when no_data_found then denied := true; end; ok := ok and denied;
  denied := false; begin perform public.flock_comment_edit(c2, 'Hijacked'); exception when no_data_found then denied := true; end; ok := ok and denied;
  denied := false; begin perform * from public.flock_comment_delete(c2); exception when no_data_found then denied := true; end; ok := ok and denied;
  perform public.flock_comment_edit(c1, 'Which pegboard did you use?');
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', m1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := ok and public.flock_post_edit(p_learn, 'Pegboard foraging', 'Built one for Kiwi!') = 'live'
           and public.flock_post_edit(p_good, null, 'Our rescue needs pellets and perches.') = 'pending'
           and exists (select 1 from public.flock_comments_for('post', p_learn) where comment_id = c1 and body = 'Which pegboard did you use?' and edited_at is not null);
  reset role;
  ok := ok and (select body from public.flock_posts where id = p_learn) = 'Built one for Kiwi!';
  if ok then passed := passed + 1; else failed := array_append(failed, 'only the author edits or deletes'); end if;

  -- 8) Reactions on posts and comments, and who reacted (name, region, reaction).
  perform set_config('request.jwt.claims', json_build_object('sub', m2, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.flock_react('post', p_learn, 'great_job', true);
  perform public.flock_react('post', p_learn, 'love_this', true);
  perform public.flock_react('comment', c2, 'been_there', true);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', m3, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.flock_react('post', p_learn, 'great_job', true);
  ok := exists (select 1 from public.flock_post(p_learn) where great_job = 2 and love_this = 1 and mine = array['great_job'])
    and exists (select 1 from public.flock_comments_for('post', p_learn) where comment_id = c2 and been_there = 1)
    and (select count(*) from public.flock_reactors('post', p_learn)) = 3
    and exists (select 1 from public.flock_reactors('post', p_learn) where display_name = 'Priya S.' and region_name = 'Great Lakes' and kind = 'love_this');
  reset role;
  if ok then passed := passed + 1; else failed := array_append(failed, 'reactions and who reacted'); end if;

  -- 9) A "Just me" journey's comments and reactions stay in the household: other
  --    members can't read, comment or react; the owner (a member) can.
  perform set_config('request.jwt.claims', json_build_object('sub', m1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  c4 := public.flock_comment_create('journey_update', up, null, 'Day one.', null, false);
  ok := (select count(*) from public.flock_comments_for('journey_update', up)) = 1;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', m2, 'role', 'authenticated')::text, true);
  set local role authenticated;
  denied := false; begin perform * from public.flock_comments_for('journey_update', up); exception when no_data_found then denied := true; end; ok := ok and denied;
  denied := false; begin perform public.flock_comment_create('journey_update', up, null, 'Hi', null, false); exception when no_data_found then denied := true; end; ok := ok and denied;
  denied := false; begin perform public.flock_react('comment', c4, 'great_job', true); exception when no_data_found then denied := true; end; ok := ok and denied;
  denied := false; begin perform * from public.flock_reactors('journey_update', up); exception when no_data_found then denied := true; end; ok := ok and denied;
  ok := ok and not exists (select 1 from public.flock_comment_counts('journey_update', array[up]));
  reset role;
  -- The household member (free tier) can't use the Flock at all.
  perform set_config('request.jwt.claims', json_build_object('sub', hh, 'role', 'authenticated')::text, true);
  set local role authenticated;
  denied := false; begin perform * from public.flock_comments_for('journey_update', up); exception when insufficient_privilege then denied := true; end; ok := ok and denied;
  reset role;
  if ok then passed := passed + 1; else failed := array_append(failed, 'Just me stays private'); end if;

  -- 10) Rate limits: over the hourly number, a 'rate_limited' error naming the kind.
  update public.flock_community_limits set per_hour = 4 where kind = 'posts';
  update public.flock_community_limits set per_hour = 3 where kind = 'comments';
  perform set_config('request.jwt.claims', json_build_object('sub', m1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform * from public.flock_post_create('start', null, 'Hello, Flock!', '{}', null, false);  -- 4th this hour
  msg := null; det := null;
  begin perform * from public.flock_post_create('start', null, 'One more', '{}', null, false);
  exception when raise_exception then get stacked diagnostics msg = message_text, det = pg_exception_detail; end;
  ok := msg = 'rate_limited' and det = 'posts';
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', m2, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.flock_comment_create('post', p_learn, null, 'Two', null, false);
  perform public.flock_comment_create('post', p_learn, null, 'Three', null, false);  -- with c1, 3 this hour
  msg := null; det := null;
  begin perform public.flock_comment_create('post', p_learn, null, 'Four', null, false);
  exception when raise_exception then get stacked diagnostics msg = message_text, det = pg_exception_detail; end;
  ok := ok and msg = 'rate_limited' and det = 'comments';
  reset role;
  if ok then passed := passed + 1; else failed := array_append(failed, 'rate limits'); end if;

  -- 11) Deleting a post takes its comments, replies and reactions with it and
  --     hands back every photo path to remove.
  perform set_config('request.jwt.claims', json_build_object('sub', m1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := (select array_agg(path order by path) from public.flock_post_delete(p_learn)) = (select array_agg(x order by x) from unnest(array[ph1, ph2]) x);
  reset role;
  ok := ok and not exists (select 1 from public.flock_comments where subject_type = 'post' and subject_id = p_learn)
           and not exists (select 1 from public.flock_reactions where (subject_type = 'post' and subject_id = p_learn) or (subject_type = 'comment' and subject_id in (c1, c2, c3)));
  if ok then passed := passed + 1; else failed := array_append(failed, 'delete cleans up'); end if;

  -- 12) The vet nudge's phrases reach members; only admins change them or the limits.
  perform set_config('request.jwt.claims', json_build_object('sub', m2, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := exists (select 1 from public.flock_vet_signs() s where s = 'tail bobbing')
    and exists (select 1 from public.flock_vet_signs() s where s = 'sitting on the cage floor');
  denied := false; begin perform public.admin_add_vet_sign('panting'); exception when insufficient_privilege then denied := true; end; ok := ok and denied;
  denied := false; begin perform public.admin_set_flock_limit('posts', 100); exception when insufficient_privilege then denied := true; end; ok := ok and denied;
  denied := false; begin perform 1 from public.flock_vet_signs; exception when insufficient_privilege then denied := true; end; ok := ok and denied;
  reset role;
  insert into public.user_roles (user_id, role) values (m3, 'admin');
  perform set_config('request.jwt.claims', json_build_object('sub', m3, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.admin_add_vet_sign('  Panting ');
  perform public.admin_set_flock_limit('photos', 8);
  reset role;
  ok := ok and exists (select 1 from public.flock_vet_signs where phrase = 'panting')
           and (select per_hour from public.flock_community_limits where kind = 'photos') = 8;
  if ok then passed := passed + 1; else failed := array_append(failed, 'vet signs and limits: members read, admins edit'); end if;

  -- 13) No care table changed: the care app's own tables have no new policies or triggers here.
  if not exists (select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace s on s.oid = c.relnamespace
                 where s.nspname = 'public' and c.relname in ('birds', 'bird_members', 'weight_entries', 'profiles') and t.tgname like 'flock%') then
    passed := passed + 1; else failed := array_append(failed, 'no care-table triggers'); end if;

  raise exception 'FLOCK POSTS CHECKS: % passed, % failed%', passed, coalesce(array_length(failed, 1), 0),
    case when array_length(failed, 1) > 0 then ': ' || array_to_string(failed, ', ') else '' end;
end $$;
