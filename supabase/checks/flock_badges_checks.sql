-- Verification for 20261124013000_flock_badges (backlog 1.13a).
--
-- Self-contained and leaves nothing behind: an admin; members a (a long
-- history), b (a newcomer), c (only "Just me" journeys), h (hides badges),
-- k (blocks a); a free user. Checks each badge's rule, that past activity is
-- recorded once as at_launch, that later badges and levels arrive unseen and
-- one at a time, that seen clears them, that a profile counts only
-- "Everyone in the Flock" journeys, that hiding and blocking leave a profile
-- empty, and that no app user reads the tables, then rolls back.
--   "FLOCK BADGES CHECKS: n passed, 0 failed"           → all good
--   "FLOCK BADGES CHECKS: n passed, k failed: <names>"  → which ones broke
-- Run by .github/workflows/db-checks.yml on every PR (scripts/db-checks.sh).
do $$
declare
  ad uuid := gen_random_uuid();
  a uuid := gen_random_uuid();
  b uuid := gen_random_uuid();
  c uuid := gen_random_uuid();
  h uuid := gen_random_uuid();
  k uuid := gen_random_uuid();
  fr uuid := gen_random_uuid();
  ba uuid := gen_random_uuid();
  bc uuid := gen_random_uuid();
  wave uuid; step uuid; v uuid; ch uuid; jc uuid;
  passed int := 0; failed text[] := '{}';
  ok boolean; denied boolean; n int;
begin
  insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  select '00000000-0000-0000-0000-000000000000', x, 'authenticated', 'authenticated', x::text || '@checks.invalid', '{}', '{}', now(), now()
  from unnest(array[ad, a, b, c, h, k, fr]) as x;
  insert into public.entitlements (user_id, plan, status, source, starts_at)
  select x, 'comp', 'active', 'manual', now() - interval '1 day' from unnest(array[a, b, c, h, k]) as x;
  insert into public.user_roles (user_id, role) values (ad, 'admin');
  insert into public.birds (id, owner_id, name, species) values (ba, a, 'Kiwi', 'Cockatiel'), (bc, c, 'Mango', 'Sun conure');
  insert into public.flock_profiles (user_id, display_name, region_slug, setup_completed_at) values
    (ad, 'Kya team', 'great-lakes', now()), (a, 'Alex R.', 'great-lakes', now()), (b, 'Blake S.', 'great-lakes', null),
    (c, 'Casey T.', 'great-lakes', now()), (h, 'Harper R.', 'great-lakes', now()), (k, 'Kai L.', 'great-lakes', now());
  select id into wave from public.journey_templates where slug = 'wave';
  select id into step from public.journey_templates where slug = 'step-up';

  -- a's history: three finished community journeys (one a trick), an approved
  -- Do good post, and a vote.
  insert into public.journeys (bird_id, created_by, template_id, status, visibility, rhythm, finished_at) values
    (ba, a, wave, 'finished', 'community', 'most_days', now() - interval '30 days'),
    (ba, a, step, 'finished', 'community', 'most_days', now() - interval '20 days');
  insert into public.journeys (bird_id, created_by, custom_name, status, visibility, rhythm, finished_at) values
    (ba, a, 'Gentle towel time', 'finished', 'community', 'weekends', now() - interval '10 days');
  insert into public.flock_posts (author_id, space, body, status, reviewed_by, reviewed_at)
  values (a, 'good', 'We fostered two lovebirds for the rescue.', 'live', ad, now());
  insert into public.flock_votes (question, status, closes_at, opened_at) values ('Where should the donation go?', 'open', now() + interval '7 days', now())
  returning id into v;
  insert into public.flock_vote_choices (vote_id, position, name) values (v, 1, 'A rescue') returning id into ch;
  insert into public.flock_vote_ballots (vote_id, user_id, choice_id) values (v, a, ch);
  -- c: a finished trick, but only "Just me".
  insert into public.journeys (bird_id, created_by, template_id, status, visibility, rhythm, finished_at)
  values (bc, c, wave, 'finished', 'private', 'most_days', now()) returning id into jc;

  -- 1) Free users, visitors and direct access get nothing.
  perform set_config('request.jwt.claims', json_build_object('sub', fr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := true;
  denied := false; begin perform * from public.flock_my_badges(); exception when insufficient_privilege then denied := true; end; ok := ok and denied;
  denied := false; begin perform * from public.flock_member_badges(a); exception when insufficient_privilege then denied := true; end; ok := ok and denied;
  denied := false; begin perform public.flock_set_badges_shown(false); exception when insufficient_privilege then denied := true; end; ok := ok and denied;
  denied := false; begin perform 1 from public.flock_badge_awards; exception when insufficient_privilege then denied := true; end; ok := ok and denied;
  denied := false; begin perform 1 from public.flock_badge_settings; exception when insufficient_privilege then denied := true; end; ok := ok and denied;
  reset role;
  set local role anon;
  denied := false; begin perform * from public.flock_my_badges(); exception when insufficient_privilege then denied := true; end; ok := ok and denied;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  denied := false; begin perform 1 from public.flock_badge_awards; exception when insufficient_privilege then denied := true; end; ok := ok and denied;
  denied := false; begin perform * from private.flock_badge_levels(a, false); exception when insufficient_privilege then denied := true; end; ok := ok and denied;
  reset role;
  if ok then passed := passed + 1; else failed := array_append(failed, 'free users, visitors and direct reads get nothing'); end if;

  -- 2) a's first look: every badge in order, history counted once as at_launch.
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := (select array_agg(badge) from public.flock_my_badges())
          = array['first_steps', 'journey_finisher', 'trick_star', 'good_neighbor', 'voice_of_the_flock', 'challenge_champ'];
  reset role;
  ok := ok
    and (select count(*) from public.flock_badge_awards where user_id = a) = 5
    and (select level from public.flock_badge_awards where user_id = a and badge = 'journey_finisher') = 3
    and not exists (select 1 from public.flock_badge_awards where user_id = a and badge = 'challenge_champ')
    and (select bool_and(at_launch and unseen) from public.flock_badge_awards where user_id = a);
  if ok then passed := passed + 1; else failed := array_append(failed, 'past activity is recorded once, at launch'); end if;

  -- 3) Seen clears just the ones named, or all of them.
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.flock_badges_seen(array['first_steps']);
  reset role;
  ok := (select count(*) from public.flock_badge_awards where user_id = a and unseen) = 4;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.flock_badges_seen(null);
  reset role;
  ok := ok and not exists (select 1 from public.flock_badge_awards where user_id = a and unseen);
  if ok then passed := passed + 1; else failed := array_append(failed, 'seen clears the celebration'); end if;

  -- 4) Later progress: seven more finished journeys raise the level to 10,
  --    unseen and not at_launch; earned badges never drop.
  insert into public.journeys (bird_id, created_by, custom_name, status, visibility, rhythm, finished_at)
  select ba, a, 'Journey ' || g, 'finished', 'community', 'weekends', now() from generate_series(1, 7) g;
  delete from public.flock_vote_ballots where user_id = a;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := (select level = 10 and unseen and not at_launch from public.flock_my_badges() where badge = 'journey_finisher')
    and (select level = 1 and not unseen from public.flock_my_badges() where badge = 'voice_of_the_flock');
  reset role;
  if ok then passed := passed + 1; else failed := array_append(failed, 'a new level arrives unseen, and earned badges stay'); end if;

  -- 5) b, a newcomer: no profile setup yet, nothing earned; finishing setup
  --    and having a suggested place approved by someone else earns two.
  --    A lead's own listing doesn't count.
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := (select count(*) from public.flock_my_badges() where level > 0) = 0;
  reset role;
  insert into public.flock_places (region_slug, kind, name, status, created_by, reviewed_by, reviewed_at)
  values ('great-lakes', 'vet', 'Own listing', 'live', b, b, now());
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := ok and (select level from public.flock_my_badges() where badge = 'good_neighbor') = 0;
  reset role;
  update public.flock_profiles set setup_completed_at = now() where user_id = b;
  insert into public.flock_places (region_slug, kind, name, status, created_by, reviewed_by, reviewed_at)
  values ('great-lakes', 'rescue', 'Suggested rescue', 'live', b, ad, now());
  insert into public.flock_posts (author_id, space, body, status) values (b, 'good', 'Still waiting for review.', 'pending');
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := ok and (select array_agg(badge order by badge) from public.flock_my_badges() where level > 0 and unseen and not at_launch)
                 = array['first_steps', 'good_neighbor'];
  reset role;
  if ok then passed := passed + 1; else failed := array_append(failed, 'first steps and good neighbor follow their rules'); end if;

  -- 6) Profiles: a's shows the earned badges; c's trick, only "Just me",
  --    shows on c's own Badges screen and nowhere else, until it's shared.
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := (select level from public.flock_my_badges() where badge = 'trick_star') = 1
    and (select level from public.flock_my_badges() where badge = 'journey_finisher') = 1
    and (select array_agg(badge) from public.flock_member_badges(c)) = array['first_steps'];
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := ok
    and (select array_agg(badge) from public.flock_member_badges(c)) = array['first_steps']
    and (select array_agg(badge || ':' || level) from public.flock_member_badges(a))
          = array['first_steps:1', 'journey_finisher:10', 'trick_star:1', 'good_neighbor:1', 'voice_of_the_flock:1'];
  reset role;
  update public.journeys set visibility = 'community' where id = jc;
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := ok and (select array_agg(badge) from public.flock_member_badges(c)) = array['first_steps', 'journey_finisher', 'trick_star'];
  reset role;
  -- Back to "Just me": it stops counting on the profile, and stays earned.
  update public.journeys set visibility = 'private' where id = jc;
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := ok and (select array_agg(badge) from public.flock_member_badges(c)) = array['first_steps'];
  reset role;
  ok := ok and exists (select 1 from public.flock_badge_awards where user_id = c and badge = 'trick_star');
  if ok then passed := passed + 1; else failed := array_append(failed, '"Just me" journey badges never reach anyone else'); end if;

  -- 7) Hiding: h's profile shows nothing, to others and to h; showing again
  --    brings them back. The choice defaults to shown.
  perform set_config('request.jwt.claims', json_build_object('sub', h, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform * from public.flock_my_badges();
  ok := public.flock_badges_shown() = true and (select count(*) from public.flock_member_badges(h)) = 1;
  ok := ok and public.flock_set_badges_shown(false) = false and public.flock_badges_shown() = false
    and (select count(*) from public.flock_member_badges(h)) = 0;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := ok and (select count(*) from public.flock_member_badges(h)) = 0;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', h, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.flock_set_badges_shown(true);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := ok and (select count(*) from public.flock_member_badges(h)) = 1;
  reset role;
  if ok then passed := passed + 1; else failed := array_append(failed, 'hiding badges empties the profile'); end if;

  -- 8) Blocking either way leaves the profile empty.
  insert into public.flock_blocks (blocker_id, blocked_id) values (k, a);
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := (select count(*) from public.flock_member_badges(k)) = 0;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', k, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := ok and (select count(*) from public.flock_member_badges(a)) = 0
    and (select count(*) from public.flock_member_badges(h)) = 1;
  reset role;
  if ok then passed := passed + 1; else failed := array_append(failed, 'blocks hide badges both ways'); end if;

  -- 9) Someone who can't use the Flock any more shows no badges; admins use it.
  delete from public.entitlements where user_id = h;
  perform set_config('request.jwt.claims', json_build_object('sub', ad, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := (select count(*) from public.flock_member_badges(h)) = 0
    and (select level from public.flock_my_badges() where badge = 'first_steps') = 1;
  reset role;
  if ok then passed := passed + 1; else failed := array_append(failed, 'only people who can use the Flock show badges'); end if;

  -- 10) Deleting an account removes its badges and its choice.
  delete from auth.users where id = h;
  ok := not exists (select 1 from public.flock_badge_awards where user_id = h)
    and not exists (select 1 from public.flock_badge_settings where user_id = h);
  if ok then passed := passed + 1; else failed := array_append(failed, 'account deletion removes badges'); end if;

  raise exception 'FLOCK BADGES CHECKS: % passed, % failed%', passed, coalesce(array_length(failed, 1), 0),
    case when array_length(failed, 1) > 0 then ': ' || array_to_string(failed, ', ') else '' end;
end $$;
