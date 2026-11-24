-- Verification for 20261124033000_flock_challenges (backlog 1.10).
--
-- Self-contained and leaves nothing behind: an admin; members a and b (Great
-- Lakes), s (Southeast), k (blocks a); a free user. Checks who sees which
-- challenge, the one-at-a-time rule, that food templates are refused, joining,
-- entries (one per prompt, only while open, never on Today), finishing and
-- the Challenge champ badge, a journey challenge counted from its journey,
-- blocks, the wrap-up's permission rule, and that no app user reads the
-- tables, then rolls back.
--   "FLOCK CHALLENGES CHECKS: n passed, 0 failed"           → all good
--   "FLOCK CHALLENGES CHECKS: n passed, k failed: <names>"  → which ones broke
-- Run by .github/workflows/db-checks.yml on every PR (scripts/db-checks.sh).
do $$
declare
  ad uuid := gen_random_uuid();
  a uuid := gen_random_uuid();
  b uuid := gen_random_uuid();
  s uuid := gen_random_uuid();
  k uuid := gen_random_uuid();
  fr uuid := gen_random_uuid();
  ba uuid := gen_random_uuid();
  bb uuid := gen_random_uuid();
  bk uuid := gen_random_uuid();
  today date := private.flock_today();
  fw uuid; gl uuid; se uuid; jc uuid; old uuid; diet uuid;
  e1 uuid; e2 uuid; e3 uuid; ek uuid; eo uuid; step uuid; jr uuid;
  passed int := 0; failed text[] := '{}';
  ok boolean; denied boolean; msg text;
begin
  insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  select '00000000-0000-0000-0000-000000000000', x, 'authenticated', 'authenticated', x::text || '@checks.invalid', '{}', '{}', now(), now()
  from unnest(array[ad, a, b, s, k, fr]) as x;
  insert into public.entitlements (user_id, plan, status, source, starts_at)
  select x, 'comp', 'active', 'manual', now() - interval '1 day' from unnest(array[a, b, s, k]) as x;
  insert into public.user_roles (user_id, role) values (ad, 'admin');
  insert into public.birds (id, owner_id, name, species) values
    (ba, a, 'Kiwi', 'Cockatiel'), (bb, b, 'Mango', 'Sun conure'), (bk, k, 'Pip', 'Budgie');
  insert into public.flock_profiles (user_id, display_name, region_slug, setup_completed_at) values
    (ad, 'Kya team', 'great-lakes', now()), (a, 'Alex R.', 'great-lakes', now()), (b, 'Blake S.', 'great-lakes', now()),
    (s, 'Sam P.', 'southeast', now()), (k, 'Kai L.', 'great-lakes', now());
  select id into step from public.journey_templates where slug = 'step-up';

  -- 1) Free users, visitors and direct access get nothing.
  perform set_config('request.jwt.claims', json_build_object('sub', fr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := true;
  denied := false; begin perform * from public.flock_challenges_current(); exception when insufficient_privilege then denied := true; end; ok := ok and denied;
  denied := false; begin perform public.admin_challenge_save(null, 'standalone', 'x', null, null, '["a"]', null, current_date, current_date); exception when insufficient_privilege then denied := true; end; ok := ok and denied;
  reset role;
  set local role anon;
  denied := false; begin perform * from public.flock_challenges_current(); exception when insufficient_privilege then denied := true; end; ok := ok and denied;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  denied := false; begin perform 1 from public.flock_challenges; exception when insufficient_privilege then denied := true; end; ok := ok and denied;
  denied := false; begin perform 1 from public.flock_challenge_members; exception when insufficient_privilege then denied := true; end; ok := ok and denied;
  denied := false; begin perform public.admin_challenge_save(null, 'standalone', 'x', null, null, '["a"]', null, current_date, current_date); exception when insufficient_privilege then denied := true; end; ok := ok and denied;
  reset role;
  if ok then passed := passed + 1; else failed := array_append(failed, 'free users, visitors, members and direct reads get nothing'); end if;

  -- 2) Admin writes: a Flock-wide standalone and a Great Lakes one, both
  --    starting today; a draft and a not-yet-started one stay hidden.
  perform set_config('request.jwt.claims', json_build_object('sub', ad, 'role', 'authenticated')::text, true);
  set local role authenticated;
  fw := public.admin_challenge_save(null, 'standalone', 'Foraging week', 'A new idea every day.', null,
          '["Paper cup surprise", "Shred a cardboard tube", "Hide a treat in a basket"]', null, today, today + 6);
  perform public.admin_challenge_schedule(fw);
  gl := public.admin_challenge_save(null, 'standalone', 'Great Lakes photo week', null, null, '["Morning light"]', 'great-lakes', today, today + 3);
  perform public.admin_challenge_schedule(gl);
  se := public.admin_challenge_save(null, 'standalone', 'Later on', null, null, '["One"]', null, today + 30, today + 36);
  perform public.admin_challenge_schedule(se);
  old := public.admin_challenge_save(null, 'standalone', 'Still a draft', null, null, '["One"]', 'southeast', today, today + 2);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := (select array_agg(title) from public.flock_challenges_current()) = array['Foraging week', 'Great Lakes photo week'];
  ok := ok and not exists (select 1 from public.flock_challenge(se)) and not exists (select 1 from public.flock_challenge(old));
  ok := ok and (select total_count = 3 and not joined and state = 'open' and days_left = 6 from public.flock_challenge(fw));
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', s, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := ok and (select array_agg(title) from public.flock_challenges_current()) = array['Foraging week'];
  ok := ok and not exists (select 1 from public.flock_challenge(gl));
  reset role;
  if ok then passed := passed + 1; else failed := array_append(failed, 'members see open challenges, a chapter one only in its chapter'); end if;

  -- 3) One at a time per audience: overlapping days are refused, another
  --    chapter is fine; food templates are refused.
  perform set_config('request.jwt.claims', json_build_object('sub', ad, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := true;
  jc := public.admin_challenge_save(null, 'journey', 'Step up in two weeks', null, 'step-up', null, null, today + 3, today + 16);
  msg := null; begin perform public.admin_challenge_schedule(jc); exception when others then msg := sqlerrm; end;
  ok := ok and msg = 'challenge_overlap';
  perform public.admin_challenge_schedule(old);
  msg := null;
  begin diet := public.admin_challenge_save(null, 'journey', 'Veggie month', null, 'diet-conversion', null, 'southeast', today + 40, today + 50);
  exception when others then msg := sqlerrm; end;
  ok := ok and msg = 'no_food_challenges';
  -- The Flock-wide journey challenge moves to after Foraging week.
  perform public.admin_challenge_save(jc, 'journey', 'Step up in two weeks', null, 'step-up', null, null, today + 7, today + 20);
  msg := null; begin perform public.admin_challenge_schedule(jc); exception when others then msg := sqlerrm; end;
  ok := ok and msg is null;
  reset role;
  if ok then passed := passed + 1; else failed := array_append(failed, 'one challenge at a time per audience, no food templates'); end if;

  -- 4) Joining and entries: join first, one entry per prompt, entries stay
  --    off Today's feed, and the last prompt finishes the challenge.
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := true;
  msg := null; begin perform public.flock_challenge_entry_create(fw, 1, 'Took her ten seconds.', '{}', null, false); exception when others then msg := sqlerrm; end;
  ok := ok and msg = 'join_first';
  msg := null; begin perform public.flock_challenge_join(fw, bb, false); exception when others then msg := sqlerrm; end;
  ok := ok and msg = 'pick one of your birds';
  ok := ok and public.flock_challenge_join(fw, ba, true) is null;
  e1 := public.flock_challenge_entry_create(fw, 1, 'Took her ten seconds.', '{}', null, false);
  msg := null; begin perform public.flock_challenge_entry_create(fw, 1, 'Again!', '{}', null, false); exception when others then msg := sqlerrm; end;
  ok := ok and msg = 'already_posted';
  e2 := public.flock_challenge_entry_create(fw, 2, 'Shredded in a minute.', '{}', null, false);
  ok := ok and not public.flock_challenge_finished(fw);
  e3 := public.flock_challenge_entry_create(fw, 3, 'Found it in the basket.', '{}', null, false);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := ok and public.flock_challenge_finished(fw);
  ok := ok and (select finished and done_count = 3 and joined and my_bird_name = 'Kiwi' and feature_ok from public.flock_challenge(fw));
  ok := ok and not exists (select 1 from public.flock_feed('everything', null, 50) f where f.post_id in (e1, e2, e3));
  ok := ok and (select array_agg(prompt order by prompt) from public.flock_challenge_entries(fw)) = array[1, 2, 3];
  ok := ok and (select level from public.flock_my_badges() where badge = 'challenge_champ') = 1;
  reset role;
  if ok then passed := passed + 1; else failed := array_append(failed, 'entries, finishing and the Challenge champ badge'); end if;

  -- 5) Entries follow the challenge's audience and the block rules; the
  --    joined faces leave blocked people out.
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.flock_challenge_join(gl, bb, false);
  eo := public.flock_challenge_entry_create(gl, 1, 'Morning on the perch.', '{}', null, false);
  ok := (select count(*) from public.flock_challenge_entries(fw)) = 3;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', s, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := ok and not exists (select 1 from public.flock_post(eo));
  msg := null; begin perform * from public.flock_challenge_entries(gl); exception when others then msg := sqlerrm; end;
  ok := ok and msg = 'not found';
  reset role;
  insert into public.flock_blocks (blocker_id, blocked_id) values (k, a);
  perform set_config('request.jwt.claims', json_build_object('sub', k, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := ok and (select count(*) from public.flock_challenge_entries(fw)) = 0
    and (select member_count = 1 and jsonb_array_length(faces) = 0 from public.flock_challenge(fw));
  reset role;
  if ok then passed := passed + 1; else failed := array_append(failed, 'entries follow the audience and block rules'); end if;

  -- 6) After the end day: no joining or entries, the feed stays readable,
  --    and the wrap-up features only entries whose authors said yes.
  update public.flock_challenges set starts_on = today - 10, ends_on = today - 4 where id = fw;
  update public.flock_challenges set starts_on = today - 10, ends_on = today - 1 where id = gl;
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := not exists (select 1 from public.flock_challenges_current() where challenge_id in (fw, gl));
  ok := ok and (select state from public.flock_challenge(fw)) = 'closed';
  msg := null; begin perform public.flock_challenge_join(fw, bb, true); exception when others then msg := sqlerrm; end;
  ok := ok and msg = 'challenge_closed';
  msg := null; begin perform public.flock_challenge_entry_create(gl, 1, 'Late one.', '{}', null, false); exception when others then msg := sqlerrm; end;
  ok := ok and msg = 'challenge_closed';
  ok := ok and (select count(*) from public.flock_challenge_entries(fw)) = 3;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ad, 'role', 'authenticated')::text, true);
  set local role authenticated;
  msg := null; begin perform public.admin_challenge_wrap_up(gl, 'Thank you!', array[eo]); exception when others then msg := sqlerrm; end;
  ok := ok and msg = 'feature_needs_permission';
  perform public.admin_challenge_wrap_up(fw, 'What a week. Thank you, everyone.', array[e2, e1]);
  perform public.admin_challenge_pin(fw, e3);
  msg := null; begin perform public.admin_challenge_wrap_up(jc, 'Too early', '{}'); exception when others then msg := sqlerrm; end;
  ok := ok and msg = 'wrap_up_after_close';
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := ok and (select wrap_up = 'What a week. Thank you, everyone.' and featured_post_ids = array[e2, e1] and pinned_post_id = e3
                from public.flock_challenge(fw));
  reset role;
  -- Saying no later takes them out of the wrap-up and the pin.
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.flock_challenge_set_feature(fw, false);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := ok and (select featured_post_ids = '{}' and pinned_post_id is null from public.flock_challenge(fw));
  reset role;
  if ok then passed := passed + 1; else failed := array_append(failed, 'closing, the wrap-up and permission to feature'); end if;

  -- 7) A journey challenge counts its journey: finished after joining and by
  --    the end day; a "Just me" journey's badge stays off the profile.
  --    (b's entry finished the one-prompt Great Lakes challenge in 5; it goes,
  --    so the journey is b's only way to the badge.)
  delete from public.flock_posts where id = eo;
  update public.flock_challenges set starts_on = today, ends_on = today + 10 where id = jc;
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  -- (Each step is named, so a failure says which one.)
  msg := null;
  if public.flock_challenge_join(jc, bb, false) is not null then msg := 'join returned a journey'; end if;
  reset role;
  insert into public.journeys (bird_id, created_by, template_id, status, visibility, rhythm)
  values (bb, b, step, 'active', 'private', 'most_days') returning id into jr;
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if msg is null and not coalesce((select my_journey_id = jr from public.flock_challenge(jc)), false) then msg := 'the journey isn''t linked'; end if;
  if msg is null and coalesce((select finished from public.flock_challenge(jc)), true) then msg := 'finished before the journey'; end if;
  reset role;
  update public.journeys set status = 'finished', finished_at = now() where id = jr;
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if msg is null and not coalesce((select finished from public.flock_challenge(jc)), false) then msg := 'not finished with the journey'; end if;
  if msg is null and coalesce((select level from public.flock_my_badges() where badge = 'challenge_champ'), 0) <> 1 then msg := 'no Challenge champ'; end if;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if msg is null and not exists (select 1 from public.flock_member_badges(b) where badge = 'first_steps') then msg := 'profile shows nothing'; end if;
  if msg is null and exists (select 1 from public.flock_member_badges(b) where badge = 'challenge_champ') then msg := 'a Just me badge on the profile'; end if;
  reset role;
  if msg is null then passed := passed + 1; else failed := array_append(failed, 'journey challenges count their journey (' || msg || ')'); end if;

  -- 8) Started challenges can't be edited, unscheduled or deleted; drafts can go.
  perform set_config('request.jwt.claims', json_build_object('sub', ad, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := true;
  msg := null; begin perform public.admin_challenge_save(jc, 'journey', 'Renamed', null, 'step-up', null, null, today, today + 10); exception when others then msg := sqlerrm; end;
  ok := ok and msg = 'started_challenges_stay';
  msg := null; begin perform public.admin_challenge_unschedule(jc); exception when others then msg := sqlerrm; end;
  ok := ok and msg = 'started_challenges_stay';
  msg := null; begin perform public.admin_challenge_delete(jc); exception when others then msg := sqlerrm; end;
  ok := ok and msg = 'only drafts can be deleted';
  perform public.admin_challenge_unschedule(se);
  perform public.admin_challenge_delete(se);
  ok := ok and (select count(*) from public.admin_challenges()) = 4;
  reset role;
  if ok then passed := passed + 1; else failed := array_append(failed, 'started challenges stay as they are'); end if;

  -- 9) Deleting an account removes its memberships.
  insert into public.flock_challenge_members (challenge_id, user_id, bird_id) values (jc, k, bk);
  delete from auth.users where id = k;
  ok := not exists (select 1 from public.flock_challenge_members where user_id = k);
  if ok then passed := passed + 1; else failed := array_append(failed, 'account deletion removes memberships'); end if;

  raise exception 'FLOCK CHALLENGES CHECKS: % passed, % failed%', passed, coalesce(array_length(failed, 1), 0),
    case when array_length(failed, 1) > 0 then ': ' || array_to_string(failed, ', ') else '' end;
end $$;
