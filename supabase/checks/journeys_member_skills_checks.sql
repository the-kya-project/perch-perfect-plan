-- Verification for 20261125010000_journeys_member_skills (backlog 1.20c):
-- "Skills from the Flock". A member's custom community journey with an update
-- is findable by other members (never by a free account, never through a
-- block, never once hidden), "Start this skill" copies it with its source, a
-- second start opens the same copy, and member skills are reported and
-- reviewed like posts.
--
-- Self-contained; raises at the end so everything rolls back:
--   "JOURNEYS MEMBER SKILLS CHECKS: n passed, 0 failed" → all good
-- Run by .github/workflows/db-checks.yml on every PR (scripts/db-checks.sh).
do $$
declare
  ad uuid := gen_random_uuid();   -- admin (reviewer)
  m1 uuid := gen_random_uuid();   -- member who shares the skill
  m2 uuid := gen_random_uuid();   -- member who starts it
  m3 uuid := gen_random_uuid();   -- another member
  hh uuid := gen_random_uuid();   -- household on m1's bird
  fr uuid := gen_random_uuid();   -- free account
  b1 uuid := gen_random_uuid();   -- m1's bird
  b2 uuid := gen_random_uuid();   -- m2's bird
  b3 uuid := gen_random_uuid();   -- m3's bird
  bf uuid := gen_random_uuid();   -- fr's bird
  passed int := 0; failed text[] := '{}';
  ok boolean; n int; st text; sk uuid; quiet uuid; priv uuid; tmpl uuid; copy1 uuid; copy2 uuid;
  r record;
begin
  insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  select '00000000-0000-0000-0000-000000000000', x, 'authenticated', 'authenticated', x::text || '@checks.invalid', '{}', '{}', now(), now()
  from unnest(array[ad, m1, m2, m3, hh, fr]) as x;
  -- Test members have agreed to the community guidelines (20261128180000).
  insert into public.flock_guideline_agreements (user_id, version)
  select u.id, public.current_guidelines_version() from auth.users u where u.email like '%@checks.invalid'
  on conflict do nothing;
  insert into public.entitlements (user_id, plan, status, source, starts_at)
  select x, 'comp', 'active', 'manual', now() - interval '1 day' from unnest(array[m1, m2, m3, hh]) as x;
  insert into public.user_roles (user_id, role) values (ad, 'admin');
  insert into public.birds (id, owner_id, name, species) values
    (b1, m1, 'Kiwi', 'Cockatiel'), (b2, m2, 'Mango', 'Sun conure'), (b3, m3, 'Echo', 'Amazon'), (bf, fr, 'Pip', 'Budgie');
  insert into public.bird_members (bird_id, user_id, role) values (b1, hh, 'household') on conflict do nothing;
  insert into public.flock_profiles (user_id, display_name, region_slug, setup_completed_at) values
    (ad, 'Kya team', 'great-lakes', now()), (m1, 'Alex R.', 'great-lakes', now()), (m2, 'Blake S.', 'great-lakes', now()),
    (m3, 'Casey T.', 'great-lakes', now()), (hh, 'Harper R.', 'great-lakes', now());
  insert into public.clip_assets (uid, bird_id) values ('skillclip001', b1), ('skillclip002', b1), ('skillclip003', b1);
  update public.journey_settings set audience = 'everyone';

  -- m1 shares a skill with a first clip, and three journeys that aren't member
  -- skills: a community one with no update, a private one, and a template one.
  perform set_config('request.jwt.claims', json_build_object('sub', m1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  sk := public.journey_start(b1, null, 'Bell ringing', null, null, 'most_days', 'community', 'cfstream:skillclip001', 'Kiwi rings the bell when it wants out.');
  quiet := public.journey_start(b1, null, 'Bath time', null, null, 'weekends', 'community', null, null);
  priv  := public.journey_start(b1, null, 'Shower perch', null, null, 'weekends', 'private', 'cfstream:skillclip002', null);
  tmpl  := public.journey_start(b1, 'recall', null, null, null, 'most_days', 'community', 'cfstream:skillclip003');
  -- Your own skills never show in your own search.
  ok := not exists (select 1 from public.journey_member_skills(null, 60));
  reset role;
  if ok then passed := passed + 1; else failed := array_append(failed, 'own skills left out'); end if;

  -- 1) Another member finds exactly the shared one, by name or description.
  perform set_config('request.jwt.claims', json_build_object('sub', m2, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := (select array_agg(journey_id) from public.journey_member_skills(null, 60)) = array[sk]
    and exists (select 1 from public.journey_member_skills('BELL', 60) where journey_id = sk and skill = 'Bell ringing'
                and description = 'Kiwi rings the bell when it wants out.' and bird_name = 'Kiwi' and owner_name = 'Alex R.' and updates = 1)
    and exists (select 1 from public.journey_member_skills('wants out', 60) where journey_id = sk)
    and not exists (select 1 from public.journey_member_skills('harness', 60));
  reset role;
  if ok then passed := passed + 1; else failed := array_append(failed, 'search finds member skills only'); end if;

  -- 2) A free account finds nothing and can't start one.
  perform set_config('request.jwt.claims', json_build_object('sub', fr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := not exists (select 1 from public.journey_member_skills(null, 60))
    and not exists (select 1 from public.journey_custom_about(sk));
  st := null;
  begin perform public.journey_start_member_skill(sk, bf, 'most_days', 'private');
  exception when others then st := sqlstate; end;
  reset role;
  if ok and st = 'P0002' then passed := passed + 1; else failed := array_append(failed, 'free accounts never see member skills'); end if;

  -- 3) "Start this skill": a copy with the name, description and source, no
  --    milestones; starting it again for the same bird opens the same copy;
  --    "Started from Kiwi's journey" shows; the non-skills can't be started.
  perform set_config('request.jwt.claims', json_build_object('sub', m2, 'role', 'authenticated')::text, true);
  set local role authenticated;
  copy1 := public.journey_start_member_skill(sk, b2, 'few_times_week', 'community');
  copy2 := public.journey_start_member_skill(sk, b2, 'weekends', 'private');
  select * into r from public.journey_custom_about(copy1);
  ok := copy1 = copy2 and r.source_journey_id = sk and r.source_bird_name = 'Kiwi'
    and r.description = 'Kiwi rings the bell when it wants out.' and not r.is_member_skill;
  st := null;
  begin perform public.journey_start_member_skill(quiet, b2, 'most_days', 'private');
  exception when others then st := sqlstate; end;
  ok := ok and st = 'P0002';
  st := null;
  begin perform public.journey_start_member_skill(sk, b3, 'most_days', 'private');
  exception when others then st := sqlstate; end;
  ok := ok and st = '42501';
  reset role;
  ok := ok and (select custom_name = 'Bell ringing' and custom_description = 'Kiwi rings the bell when it wants out.'
                       and source_journey_id = sk and template_id is null and visibility = 'community' and rhythm = 'few_times_week'
                from public.journeys where id = copy1)
    and not exists (select 1 from public.journey_milestones where journey_id = copy1)
    and (select count(*) from public.journeys where source_journey_id = sk) = 1;
  if ok then passed := passed + 1; else failed := array_append(failed, 'start this skill'); end if;

  -- 4) A block either way hides the skill and the "Started from" link; the
  --    copy keeps its text. Unblocking brings them back.
  perform set_config('request.jwt.claims', json_build_object('sub', m1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.flock_block(m2, true);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', m2, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select * into r from public.journey_custom_about(copy1);
  ok := not exists (select 1 from public.journey_member_skills(null, 60))
    and r.source_journey_id is null and r.source_bird_name is null and r.description = 'Kiwi rings the bell when it wants out.';
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', m1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.flock_block(m2, false);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', m2, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := ok and exists (select 1 from public.journey_member_skills(null, 60) where journey_id = sk)
    and (select source_journey_id from public.journey_custom_about(copy1)) = sk;
  reset role;
  if ok then passed := passed + 1; else failed := array_append(failed, 'blocks hide member skills'); end if;

  -- 5) Reporting: a member skill can be reported once per member; a template
  --    journey and your own skill can't.
  perform set_config('request.jwt.claims', json_build_object('sub', m3, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.flock_report('journey', sk, 'unsafe', 'Not safe for birds.');
  st := null;
  begin perform public.flock_report('journey', tmpl, 'spam', null);
  exception when others then st := sqlstate; end;
  ok := st = 'P0002';
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', m1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  st := null;
  begin perform public.flock_report('journey', sk, 'spam', null);
  exception when others then st := sqlstate; end;
  reset role;
  ok := ok and st = '22023'
    and (select count(*) from public.flock_reports where subject_type = 'journey' and subject_id = sk) = 1
    and not exists (select 1 from public.flock_moderation where subject_type = 'journey' and subject_id = sk);
  if ok then passed := passed + 1; else failed := array_append(failed, 'reporting a member skill'); end if;

  -- 6) At the threshold it's hidden from everyone outside the household
  --    (search, the journey page, the "Started from" link); the household
  --    still sees it; the copy keeps its text.
  update public.flock_moderation_settings set report_threshold = 2;
  perform set_config('request.jwt.claims', json_build_object('sub', m2, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.flock_report('journey', sk, 'unkind', null);
  ok := not exists (select 1 from public.journey_member_skills(null, 60))
    and not exists (select 1 from public.journey_view(sk))
    and (select source_journey_id from public.journey_custom_about(copy1)) is null
    and (select description from public.journey_custom_about(copy1)) = 'Kiwi rings the bell when it wants out.';
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', hh, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := ok and exists (select 1 from public.journey_view(sk));
  reset role;
  ok := ok and exists (select 1 from public.flock_moderation where subject_type = 'journey' and subject_id = sk and state = 'hidden');
  if ok then passed := passed + 1; else failed := array_append(failed, 'hidden at the threshold'); end if;

  -- 7) The review queue lists it with its name and description; "Keep it"
  --    shows it again; "Message them" reaches whoever started it, with the
  --    journey; "Remove it" hides it for good.
  perform set_config('request.jwt.claims', json_build_object('sub', ad, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := exists (select 1 from public.flock_review_queue('reports') q
                where q.item_type = 'report' and q.subject_type = 'journey' and q.subject_id = sk and q.author_id = m1
                  and q.title = 'Bell ringing' and q.body = 'Kiwi rings the bell when it wants out.' and q.journey_id = sk
                  and q.report_count = 2 and q.hidden);
  perform public.flock_resolve_report('journey', sk, 'keep', null);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', m3, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := ok and exists (select 1 from public.journey_member_skills(null, 60) where journey_id = sk);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ad, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.flock_resolve_report('journey', sk, 'message', 'Please add a safety note.');
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', m1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := ok and exists (select 1 from public.flock_notifications_list('all', 50) x
                       where x.kind = 'notice' and x.subject_type = 'journey' and x.subject_id = sk and x.journey_id = sk
                         and x.note = 'Please add a safety note.' and x.skill = 'Bell ringing');
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', m3, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.flock_report('journey', sk, 'unsafe', 'Still unsafe.');
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ad, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.flock_resolve_report('journey', sk, 'remove', null);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', m3, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := ok and not exists (select 1 from public.journey_member_skills(null, 60))
    and not exists (select 1 from public.journey_view(sk));
  reset role;
  ok := ok and exists (select 1 from public.flock_moderation where subject_type = 'journey' and subject_id = sk and state = 'removed');
  if ok then passed := passed + 1; else failed := array_append(failed, 'review queue for member skills'); end if;

  -- 8) A lapsed membership takes the skill out of the Flock; template
  --    journeys never get a journey moderation row and stay as they were.
  delete from public.flock_moderation where subject_type = 'journey' and subject_id = sk;
  delete from public.entitlements where user_id = m1;
  perform set_config('request.jwt.claims', json_build_object('sub', m2, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := not exists (select 1 from public.journey_member_skills(null, 60))
    and (select description from public.journey_custom_about(copy1)) = 'Kiwi rings the bell when it wants out.';
  reset role;
  if ok then passed := passed + 1; else failed := array_append(failed, 'lapsed membership'); end if;

  -- 9) The subject type checks take 'journey' and still refuse anything else.
  st := null;
  begin insert into public.flock_moderation (subject_type, subject_id, state) values ('bird', gen_random_uuid(), 'hidden');
  exception when check_violation then st := 'refused'; end;
  ok := st = 'refused'
    and exists (select 1 from pg_constraint where conrelid = 'public.flock_notifications'::regclass and contype = 'c'
                and pg_get_constraintdef(oid) like '%''journey''::text%' and pg_get_constraintdef(oid) like '%''event''::text%');
  if ok then passed := passed + 1; else failed := array_append(failed, 'subject type checks'); end if;

  raise exception 'JOURNEYS MEMBER SKILLS CHECKS: % passed, % failed%', passed, coalesce(array_length(failed, 1), 0),
    case when array_length(failed, 1) > 0 then ': ' || array_to_string(failed, ', ') else '' end;
end $$;
