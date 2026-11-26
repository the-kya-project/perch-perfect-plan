-- Verification for co-carers reading comments on their bird's journeys
-- (backlog 1.20f, 20261126183000_journey_household_comments.sql).
--
--   1. A free co-carer reads the comments and replies on their bird's journey
--      updates, community and "Just me" alike, with the usual rules: a blocked
--      author's comment, a hidden one and a reply under a comment they can't
--      see are left out. Counts and comment photos follow.
--   2. They still can't comment, reply, edit, react or report, and nothing is
--      written.
--   3. Nobody outside the household gains anything: a free stranger is refused
--      as before, a member outside the household still gets "not found" on a
--      "Just me" journey, and the co-carer gets nothing for posts.
--
-- Self-contained and leaves nothing behind: raises so the block rolls back.
--   "JOURNEY HOUSEHOLD COMMENTS CHECKS: n passed, 0 failed"           → all good
--   "JOURNEY HOUSEHOLD COMMENTS CHECKS: n passed, k failed: <names>"  → which ones broke
-- Run by .github/workflows/db-checks.yml on every PR (scripts/db-checks.sh).
do $$
declare
  m1 uuid := gen_random_uuid();  -- Flock member, owns Kiwi
  m2 uuid := gen_random_uuid();  -- Flock member, outside the household
  m3 uuid := gen_random_uuid();  -- Flock member who has blocked the co-carer
  hh uuid := gen_random_uuid();  -- free co-carer on Kiwi
  st uuid := gen_random_uuid();  -- free stranger
  b1 uuid := gen_random_uuid();  -- Kiwi
  jc uuid; jp uuid; uc uuid; up uuid;
  c1 uuid; r1 uuid; c3 uuid; r3 uuid; ch uuid; cp uuid;
  passed int := 0; failed text[] := '{}';
  ok boolean; n int; denied boolean; ids uuid[];
begin
  insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  select '00000000-0000-0000-0000-000000000000', x, 'authenticated', 'authenticated', x::text || '@checks.invalid', '{}', '{}', now(), now()
  from unnest(array[m1, m2, m3, hh, st]) as x;
  insert into public.entitlements (user_id, plan, status, source, starts_at) values
    (m1, 'comp', 'active', 'manual', now() - interval '1 day'),
    (m2, 'comp', 'active', 'manual', now() - interval '1 day'),
    (m3, 'comp', 'active', 'manual', now() - interval '1 day');
  insert into public.birds (id, owner_id, name, species) values (b1, m1, 'Kiwi', 'Cockatiel');
  insert into public.bird_members (bird_id, user_id, role) values (b1, hh, 'household') on conflict do nothing;
  insert into public.flock_profiles (user_id, display_name, region_slug, setup_completed_at) values
    (m1, 'Alex R.', 'great-lakes', now()), (m2, 'Robin P.', 'great-lakes', now()), (m3, 'Sam T.', 'great-lakes', now());
  insert into public.clip_assets (uid, bird_id) values ('hhclip000001', b1), ('hhclip000002', b1);
  update public.journey_settings set audience = 'everyone';

  -- Kiwi's journeys: Recall (community) and Step up (Just me), one update each.
  perform set_config('request.jwt.claims', json_build_object('sub', m1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  jc := public.journey_start(b1, 'recall', null, null, null, 'most_days', 'community', null);
  uc := public.journey_post_update(jc, 'cfstream:hhclip000001', 'all_in', 'Came on the first call.');
  jp := public.journey_start(b1, 'step-up', null, null, null, 'most_days', 'private', null);
  up := public.journey_post_update(jp, 'cfstream:hhclip000002', 'all_in', 'Stepped up from the cage top.');
  cp := public.flock_comment_create('journey_update', up, null, 'Note to self: try the perch next.');
  reset role;

  -- Members comment on the community update: m2's comment (with a photo, set
  -- below) and a reply from m1; m3's comment and m2's reply to it; and a
  -- comment from m2 that moderation hides.
  perform set_config('request.jwt.claims', json_build_object('sub', m2, 'role', 'authenticated')::text, true);
  set local role authenticated;
  c1 := public.flock_comment_create('journey_update', uc, null, 'Lovely recall!');
  ch := public.flock_comment_create('journey_update', uc, null, 'Something reported.');
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', m1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  r1 := public.flock_comment_create('journey_update', uc, c1, 'Thank you!');
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', m3, 'role', 'authenticated')::text, true);
  set local role authenticated;
  c3 := public.flock_comment_create('journey_update', uc, null, 'Try a whistle.');
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', m2, 'role', 'authenticated')::text, true);
  set local role authenticated;
  r3 := public.flock_comment_create('journey_update', uc, c3, 'Good idea.');
  reset role;
  update public.flock_comments set photo_path = m2::text || '/hh-check.jpg' where id = c1;
  update public.flock_comments set photo_path = m3::text || '/hh-blocked.jpg' where id = c3;
  insert into public.flock_moderation (subject_type, subject_id, state) values ('comment', ch, 'hidden');
  insert into public.flock_blocks (blocker_id, blocked_id) values (m3, hh);

  -- 1) The co-carer reads the comments on both of Kiwi's journeys, by the
  --    usual rules: not m3's (blocked), not the reply under it, not the hidden one.
  perform set_config('request.jwt.claims', json_build_object('sub', hh, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    -- (Everything here shares one created_at, so compare as sets.)
    select array_agg(comment_id) into ids from public.flock_comments_for('journey_update', uc);
    ok := ids @> array[c1, r1] and cardinality(ids) = 2
      and exists (select 1 from public.flock_comments_for('journey_update', uc) where comment_id = c1 and author_name = 'Robin P.' and has_photo and not is_mine)
      and exists (select 1 from public.flock_comments_for('journey_update', uc) where comment_id = r1 and parent_id = c1)
      and (select array_agg(comment_id) from public.flock_comments_for('journey_update', up)) = array[cp];
  exception when others then
    ok := false;
    failed := array_append(failed, 'co-carer read raised: ' || sqlerrm);
  end;
  reset role;
  if ok then passed := passed + 1; else failed := array_append(failed, 'co-carer reads their bird''s journey comments'); end if;

  -- 1b) Counts and comment photos follow.
  perform set_config('request.jwt.claims', json_build_object('sub', hh, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    ok := (select comment_count from public.flock_comment_counts('journey_update', array[up])) = 1
      and exists (select 1 from public.flock_comment_counts('journey_update', array[uc, up]) where subject_id = uc and comment_count > 0)
      and (select array_agg(path) from public.flock_media_refs(null, array[c1])) = array[m2::text || '/hh-check.jpg']
      -- A comment the co-carer can't see gives no photo: alone it's refused, beside a visible one it's left out.
      and (select count(*) from public.flock_media_refs(null, array[c1, c3])) = 1;
    denied := false;
    begin perform * from public.flock_media_refs(null, array[c3]); exception when insufficient_privilege then denied := true; end;
    ok := ok and denied;
  exception when others then
    ok := false;
    failed := array_append(failed, 'co-carer counts/photos raised: ' || sqlerrm);
  end;
  reset role;
  if ok then passed := passed + 1; else failed := array_append(failed, 'co-carer counts and comment photos'); end if;

  -- 2) ...but can't comment, reply, edit, react or report.
  perform set_config('request.jwt.claims', json_build_object('sub', hh, 'role', 'authenticated')::text, true);
  set local role authenticated;
  n := 0;
  begin perform public.flock_comment_create('journey_update', uc, null, 'From the co-carer.'); exception when others then n := n + 1; end;
  begin perform public.flock_comment_create('journey_update', up, null, 'From the co-carer.'); exception when others then n := n + 1; end;
  begin perform public.flock_comment_create('journey_update', uc, c1, 'A reply.'); exception when others then n := n + 1; end;
  begin perform public.flock_comment_edit(c1, 'Edited.'); exception when others then n := n + 1; end;
  begin perform public.flock_react('comment', c1, 'great_job', true); exception when others then n := n + 1; end;
  begin perform public.flock_react('journey_update', uc, 'great_job', true); exception when others then n := n + 1; end;
  begin perform public.flock_report('comment', c1, 'other', 'Test'); exception when others then n := n + 1; end;
  reset role;
  ok := n = 7
    and not exists (select 1 from public.flock_comments where author_id = hh)
    and not exists (select 1 from public.flock_reactions where user_id = hh)
    and not exists (select 1 from public.flock_reports where reporter_id = hh)
    and (select body from public.flock_comments where id = c1) = 'Lovely recall!';
  if ok then passed := passed + 1; else failed := array_append(failed, 'co-carer can''t write, react or report (' || n || ' of 7 refused)'); end if;

  -- 3) Nobody outside the household gains anything. A free stranger is
  --    refused everywhere, as before.
  perform set_config('request.jwt.claims', json_build_object('sub', st, 'role', 'authenticated')::text, true);
  set local role authenticated;
  n := 0;
  begin perform * from public.flock_comments_for('journey_update', uc); exception when insufficient_privilege then n := n + 1; end;
  begin perform * from public.flock_comments_for('journey_update', up); exception when insufficient_privilege then n := n + 1; end;
  begin perform * from public.flock_comment_counts('journey_update', array[uc, up]); exception when insufficient_privilege then n := n + 1; end;
  begin perform * from public.flock_media_refs(null, array[c1]); exception when insufficient_privilege then n := n + 1; end;
  reset role;
  ok := n = 4;
  if ok then passed := passed + 1; else failed := array_append(failed, 'a free stranger is refused (' || n || ' of 4)'); end if;

  -- 3b) A member outside the household still gets "not found" on the Just me
  --     journey's comments and no count, and reads the community one as before.
  perform set_config('request.jwt.claims', json_build_object('sub', m2, 'role', 'authenticated')::text, true);
  set local role authenticated;
  denied := false;
  begin perform * from public.flock_comments_for('journey_update', up); exception when no_data_found then denied := true; end;
  ok := denied
    and not exists (select 1 from public.flock_comment_counts('journey_update', array[up]))
    and exists (select 1 from public.flock_comments_for('journey_update', uc) where comment_id = c1);
  reset role;
  if ok then passed := passed + 1; else failed := array_append(failed, 'a member outside the household: Just me stays private'); end if;

  -- 3c) The co-carer gets nothing for posts or anything that isn't their bird's.
  perform set_config('request.jwt.claims', json_build_object('sub', hh, 'role', 'authenticated')::text, true);
  set local role authenticated;
  n := 0;
  begin perform * from public.flock_comments_for('post', gen_random_uuid()); exception when insufficient_privilege then n := n + 1; end;
  begin perform * from public.flock_comments_for('journey_update', gen_random_uuid()); exception when insufficient_privilege then n := n + 1; end;
  begin perform * from public.flock_comment_counts('post', array[gen_random_uuid()]); exception when insufficient_privilege then n := n + 1; end;
  begin perform * from public.flock_media_refs(array[gen_random_uuid()], array[c1]); exception when insufficient_privilege then n := n + 1; end;
  reset role;
  ok := n = 4;
  if ok then passed := passed + 1; else failed := array_append(failed, 'co-carer gets nothing outside their bird (' || n || ' of 4)'); end if;

  -- 3d) Leaving the household ends it at once.
  delete from public.bird_members where bird_id = b1 and user_id = hh;
  perform set_config('request.jwt.claims', json_build_object('sub', hh, 'role', 'authenticated')::text, true);
  set local role authenticated;
  denied := false;
  begin perform * from public.flock_comments_for('journey_update', uc); exception when insufficient_privilege then denied := true; end;
  reset role;
  if denied then passed := passed + 1; else failed := array_append(failed, 'a former co-carer is refused'); end if;

  raise exception 'JOURNEY HOUSEHOLD COMMENTS CHECKS: % passed, % failed%', passed, coalesce(array_length(failed, 1), 0),
    case when array_length(failed, 1) > 0 then ': ' || array_to_string(failed, ', ') else '' end;
end $$;
