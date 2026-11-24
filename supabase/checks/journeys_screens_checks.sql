-- Verification for 20261124230000_journeys_screens (backlog 1.20b): what the
-- new journey screens read. The vet nudge's phrases reach free accounts;
-- Today's journey cards are big moments and "learned it" finishes from
-- journeys you follow, never a "Just me" journey or a blocked person's; the
-- followed rings get each journey's latest clip; big moments are tagged only
-- on updates the caller may see; "How others did it" lists other members'
-- community journeys for one skill, Flock members only; and a journey
-- challenge counts no milestones.
--
-- Self-contained; raises at the end so everything rolls back:
--   "JOURNEYS SCREENS CHECKS: n passed, 0 failed" → all good
-- Run by .github/workflows/db-checks.yml on every PR (scripts/db-checks.sh).
do $$
declare
  m1 uuid := gen_random_uuid();  -- Flock member, owns the birds
  m2 uuid := gen_random_uuid();  -- another Flock member, follows m1's journey
  fr uuid := gen_random_uuid();  -- free
  b1 uuid := gen_random_uuid();  -- m1's bird
  b2 uuid := gen_random_uuid();  -- m1's second bird
  bf uuid := gen_random_uuid();  -- fr's bird
  jc uuid; jp uuid; jf uuid; u1 uuid; u2 uuid; u3 uuid; up uuid;
  passed int := 0; failed text[] := '{}';
  ok boolean; n int; st text;
begin
  insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  select '00000000-0000-0000-0000-000000000000', x, 'authenticated', 'authenticated', x::text || '@checks.invalid', '{}', '{}', now(), now()
  from unnest(array[m1, m2, fr]) as x;
  insert into public.entitlements (user_id, plan, status, source, starts_at) values
    (m1, 'comp', 'active', 'manual', now() - interval '1 day'),
    (m2, 'comp', 'active', 'manual', now() - interval '1 day');
  insert into public.birds (id, owner_id, name, species) values
    (b1, m1, 'Kiwi', 'Cockatiel'), (b2, m1, 'Mango', 'Conure'), (bf, fr, 'Pip', 'Budgie');
  insert into public.flock_profiles (user_id, display_name, region_slug, setup_completed_at) values (m1, 'Alex R.', 'great-lakes', now());
  insert into public.clip_assets (uid, bird_id) values
    ('kiwiclip0001', b1), ('kiwiclip0002', b1), ('kiwiclip0003', b1), ('mangoclip001', b2), ('pipclip00001', bf);
  update public.journey_settings set audience = 'everyone' where id;

  -- m1: a community recall journey with two updates (one a big moment), a
  -- "Just me" step-up journey with a big moment, and a finished community wave.
  perform set_config('request.jwt.claims', json_build_object('sub', m1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  jc := public.journey_start(b1, 'recall', null, null, null, 'most_days', 'community', null);
  u1 := public.journey_post_update(jc, 'cfstream:kiwiclip0001', 'all_in', 'First flight across!', true);
  u2 := public.journey_post_update(jc, 'cfstream:kiwiclip0002', 'distracted', null, false);
  jp := public.journey_start(b2, 'step-up', null, null, null, 'most_days', 'private', null);
  up := public.journey_post_update(jp, 'cfstream:mangoclip001', 'all_in', 'Stepped up!', true);
  jf := public.journey_start(b1, 'wave', null, null, null, 'most_days', 'community', null);
  u3 := public.journey_post_update(jf, 'cfstream:kiwiclip0003', 'all_in', null, false);
  perform public.journey_finish(jf, 'learned');
  reset role;
  -- One transaction means one now(): spread the times out so the order is real.
  update public.journey_updates set created_at = now() - interval '3 days' where id = u1;
  update public.journey_updates set created_at = now() - interval '2 days' where id = u2;
  -- m2 follows all three (a "Just me" follow can't happen through the app; a
  -- stray row must still show nothing).
  insert into public.journey_follows (journey_id, user_id) values (jc, m2), (jf, m2), (jp, m2);

  -- 1) The vet nudge's phrases reach a free account through the journey
  --    function, and stay Flock-only through the Flock one.
  perform set_config('request.jwt.claims', json_build_object('sub', fr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  n := (select count(*) from public.journey_vet_sign_tiers());
  st := null;
  begin perform count(*) from public.flock_vet_sign_tiers(); exception when others then st := sqlstate; end;
  reset role;
  ok := n = (select count(*) from public.flock_vet_signs) and n > 0 and st is not null;
  if ok then passed := passed + 1; else failed := array_append(failed, 'vet signs for journeys (' || n || ', ' || coalesce(st, 'allowed') || ')'); end if;

  -- 2) Moment cards for a follower: the big moment and the finish, newest
  --    first; never the "Just me" journey's big moment, never an ordinary update.
  perform set_config('request.jwt.claims', json_build_object('sub', m2, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := (select count(*) from public.journey_moment_cards(20)) = 2
    and exists (select 1 from public.journey_moment_cards(20) c where c.card_kind = 'big_moment' and c.update_id = u1
                and c.caption = 'First flight across!' and c.has_clip and c.owner_region is not null)
    and exists (select 1 from public.journey_moment_cards(20) c where c.card_kind = 'learned' and c.journey_id = jf and c.update_id is null)
    and not exists (select 1 from public.journey_moment_cards(20) c where c.journey_id = jp or c.update_id in (u2, up))
    and (select c.card_kind from public.journey_moment_cards(20) c limit 1) = 'learned';
  reset role;
  if ok then passed := passed + 1; else failed := array_append(failed, 'moment cards'); end if;

  -- 3) Reactions on a big moment count, a blocked member's are left out, and
  --    blocking the owner hides their cards altogether.
  perform set_config('request.jwt.claims', json_build_object('sub', m2, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.journey_react('journey_update', u1, 'great_job', true);
  ok := (select c.great_job from public.journey_moment_cards(20) c where c.update_id = u1) = 1
    and (select c.mine from public.journey_moment_cards(20) c where c.update_id = u1) = array['great_job']::text[];
  perform public.flock_block(m1, true);
  ok := ok and (select count(*) from public.journey_moment_cards(20)) = 0;
  perform public.flock_block(m1, false);
  ok := ok and (select count(*) from public.journey_moment_cards(20)) = 2;
  reset role;
  if ok then passed := passed + 1; else failed := array_append(failed, 'moment card reactions and blocks'); end if;

  -- 4) A hidden big moment drops out for the follower, not for its household.
  insert into public.flock_moderation (subject_type, subject_id, state) values ('journey_update', u1, 'hidden');
  perform set_config('request.jwt.claims', json_build_object('sub', m2, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := not exists (select 1 from public.journey_moment_cards(20) c where c.update_id = u1)
    and not exists (select 1 from public.journey_big_moments(jc));
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', m1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := ok and exists (select 1 from public.journey_big_moments(jc) b where b.update_id = u1);
  reset role;
  delete from public.flock_moderation where subject_id = u1;
  if ok then passed := passed + 1; else failed := array_append(failed, 'hidden big moment'); end if;

  -- 5) Big moments: only on updates the caller may see. The household sees
  --    the "Just me" journey's; another member and a free account see nothing.
  perform set_config('request.jwt.claims', json_build_object('sub', m1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := (select array_agg(b.update_id) from public.journey_big_moments(jp) b) = array[up]
    and (select array_agg(b.update_id) from public.journey_big_moments(jc) b) = array[u1];
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', m2, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := ok and not exists (select 1 from public.journey_big_moments(jp))
    and (select array_agg(b.update_id) from public.journey_big_moments(jc) b) = array[u1];
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', fr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := ok and not exists (select 1 from public.journey_big_moments(jc)) and not exists (select 1 from public.journey_big_moments(jp));
  reset role;
  if ok then passed := passed + 1; else failed := array_append(failed, 'big moments visibility'); end if;

  -- 6) Followed rings: the latest clip on each followed community journey,
  --    nothing for the "Just me" one.
  perform set_config('request.jwt.claims', json_build_object('sub', m2, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := (select l.update_id from public.journey_following_latest() l where l.journey_id = jc) = u2
    and (select l.update_id from public.journey_following_latest() l where l.journey_id = jf) = u3
    and not exists (select 1 from public.journey_following_latest() l where l.journey_id = jp);
  reset role;
  if ok then passed := passed + 1; else failed := array_append(failed, 'followed rings latest clip'); end if;

  -- 7) "How others did it": other members' community journeys for the skill,
  --    never your own or a "Just me" one, and nothing for a free account.
  perform set_config('request.jwt.claims', json_build_object('sub', m2, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := (select array_agg(s.journey_id) from public.journey_skill_journeys('recall') s) = array[jc]
    and (select array_agg(s.journey_id) from public.journey_skill_journeys('wave') s) = array[jf]
    and not exists (select 1 from public.journey_skill_journeys('step-up'));
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', m1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := ok and not exists (select 1 from public.journey_skill_journeys('recall'));
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', fr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := ok and not exists (select 1 from public.journey_skill_journeys('recall'));
  reset role;
  if ok then passed := passed + 1; else failed := array_append(failed, 'how others did it'); end if;

  -- 8) A free account's journey never reaches anyone outside its household
  --    through the new functions.
  perform set_config('request.jwt.claims', json_build_object('sub', fr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  jp := public.journey_start(bf, 'recall', null, null, null, 'most_days', 'private', null);
  up := public.journey_post_update(jp, 'cfstream:pipclip00001', 'all_in', 'Came when called', true);
  reset role;
  insert into public.journey_follows (journey_id, user_id) values (jp, m2);
  perform set_config('request.jwt.claims', json_build_object('sub', m2, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := not exists (select 1 from public.journey_moment_cards(50) c where c.journey_id = jp)
    and not exists (select 1 from public.journey_big_moments(jp))
    and not exists (select 1 from public.journey_following_latest() l where l.journey_id = jp)
    and not exists (select 1 from public.journey_skill_journeys('recall') s where s.journey_id = jp);
  reset role;
  if ok then passed := passed + 1; else failed := array_append(failed, 'free journey stays in its household'); end if;

  -- 9) A journey challenge counts no milestones; the finish still decides.
  ok := position('journey_milestones' in pg_get_functiondef('private.flock_challenge_rows(uuid)'::regprocedure)) = 0
    and position('journey_template_milestones' in pg_get_functiondef('private.flock_challenge_rows(uuid)'::regprocedure)) = 0
    and position('j.status = ''finished''' in pg_get_functiondef('private.flock_challenge_done(uuid, uuid, boolean)'::regprocedure)) > 0
    and to_regprocedure('private.journeys_screens_patch(text, text[])') is null;
  if ok then passed := passed + 1; else failed := array_append(failed, 'journey challenge progress'); end if;

  -- 10) Nobody signed out reaches any of them.
  n := 0;
  set local role anon;
  begin perform count(*) from public.journey_vet_sign_tiers(); exception when insufficient_privilege then n := n + 1; end;
  begin perform count(*) from public.journey_moment_cards(20); exception when insufficient_privilege then n := n + 1; end;
  begin perform count(*) from public.journey_following_latest(); exception when insufficient_privilege then n := n + 1; end;
  begin perform count(*) from public.journey_big_moments(jc); exception when insufficient_privilege then n := n + 1; end;
  begin perform count(*) from public.journey_skill_journeys('recall'); exception when insufficient_privilege then n := n + 1; end;
  reset role;
  if n = 5 then passed := passed + 1; else failed := array_append(failed, 'signed out refused (' || n || ')'); end if;

  raise exception 'JOURNEYS SCREENS CHECKS: % passed, % failed%', passed, coalesce(array_length(failed, 1), 0),
    case when array_length(failed, 1) > 0 then ': ' || array_to_string(failed, ', ') else '' end;
end $$;
