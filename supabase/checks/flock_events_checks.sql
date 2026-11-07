-- Verification for 20261108130000_flock_chapter_events.
--
-- Self-contained and leaves nothing behind: an admin; Flock members in Great
-- Lakes (m1, m2, m3) and Texas (m4); a free user. Checks who sees events,
-- locations and online links, RSVP limits, suggestions and their review,
-- cancelling, reminders, the in-person unlock, and Today's idea's time zone,
-- then rolls back.
--   "FLOCK EVENTS CHECKS: n passed, 0 failed"           → all good
--   "FLOCK EVENTS CHECKS: n passed, k failed: <names>"  → which ones broke
-- Run by .github/workflows/db-checks.yml on every PR (scripts/db-checks.sh).
do $$
declare
  ad uuid := gen_random_uuid();
  m1 uuid := gen_random_uuid();
  m2 uuid := gen_random_uuid();
  m3 uuid := gen_random_uuid();
  m4 uuid := gen_random_uuid();
  fr uuid := gen_random_uuid();
  e_meet uuid; e_online uuid; e_vol uuid; e_sug uuid; e_sug2 uuid; e_tx uuid;
  passed int := 0; failed text[] := '{}';
  ok boolean; n int; denied boolean; msg text; r record;
begin
  insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  select '00000000-0000-0000-0000-000000000000', x, 'authenticated', 'authenticated', x::text || '@checks.invalid', '{}', '{}', now(), now()
  from unnest(array[ad, m1, m2, m3, m4, fr]) as x;
  insert into public.entitlements (user_id, plan, status, source, starts_at)
  select x, 'comp', 'active', 'manual', now() - interval '1 day' from unnest(array[m1, m2, m3, m4]) as x;
  insert into public.user_roles (user_id, role) values (ad, 'admin');
  insert into public.flock_profiles (user_id, display_name, region_slug, setup_completed_at) values
    (ad, 'Brittany K.', 'great-lakes', now()), (m1, 'Priya S.', 'great-lakes', now()), (m2, 'Alex R.', 'great-lakes', now()),
    (m3, 'Sam T.', 'great-lakes', now()), (m4, 'Jo K.', 'texas', now());
  update public.flock_chapter_settings set in_person_min_members = 15;

  -- An admin puts three events on the Great Lakes calendar and one in Texas.
  perform set_config('request.jwt.claims', json_build_object('sub', ad, 'role', 'authenticated')::text, true);
  set local role authenticated;
  e_meet := public.flock_event_save(null, 'great-lakes', 'meetup', 'Fall flock meetup', now() + interval '20 hours', now() + interval '22 hours',
                                    'in_person', 'Ann Arbor District Library · Room B', '343 S Fifth Ave, Ann Arbor', null, 'Humans only this time.', m1, null, null);
  e_online := public.flock_event_save(null, 'great-lakes', 'meetup', 'Foraging toy build night', now() + interval '5 days', null,
                                      'online', null, null, 'https://meet.example.com/foraging', 'Bring paper.', null, null, null);
  e_vol := public.flock_event_save(null, 'great-lakes', 'volunteer', 'Holiday volunteer day', now() + interval '10 days', null,
                                   'in_person', 'Midwest Avian Rescue', null, null, null, null, 2, null);
  e_tx := public.flock_event_save(null, 'texas', 'meetup', 'Houston bird swap', now() + interval '3 days', null,
                                  'in_person', 'Memorial Park', null, null, null, null, null, null);
  reset role;

  -- 1) Non-members (free) can't see or RSVP to anything.
  perform set_config('request.jwt.claims', json_build_object('sub', fr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := true;
  denied := false; begin perform * from public.flock_chapter_events('upcoming'); exception when insufficient_privilege then denied := true; end; ok := ok and denied;
  denied := false; begin perform * from public.flock_event(e_meet); exception when insufficient_privilege then denied := true; end; ok := ok and denied;
  denied := false; begin perform public.flock_event_rsvp(e_meet, 'going'); exception when insufficient_privilege then denied := true; end; ok := ok and denied;
  denied := false; begin perform public.flock_event_suggest(null, 'meetup', 'Mine', now() + interval '2 days', null, 'online', null, null, null, null, false); exception when insufficient_privilege then denied := true; end; ok := ok and denied;
  denied := false; begin perform 1 from public.flock_events; exception when insufficient_privilege then denied := true; end; ok := ok and denied;
  reset role;
  if ok then passed := passed + 1; else failed := array_append(failed, 'non-members see and RSVP nothing'); end if;

  -- 2) Only the chapter's members see its events and locations; another
  --    chapter's member sees none of it.
  perform set_config('request.jwt.claims', json_build_object('sub', m2, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := (select count(*) from public.flock_chapter_events('upcoming')) = 3
    and exists (select 1 from public.flock_event(e_meet) where place_name = 'Ann Arbor District Library · Room B' and address like '343 S Fifth%'
                and host_name = 'Priya S.' and region_name = 'Great Lakes')
    and not exists (select 1 from public.flock_chapter_events('upcoming') where event_id = e_tx);
  denied := false; begin perform * from public.flock_event(e_tx); exception when no_data_found then denied := true; end; ok := ok and denied;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', m4, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := ok and (select count(*) from public.flock_chapter_events('upcoming')) = 1;
  denied := false; begin perform * from public.flock_event(e_meet); exception when no_data_found then denied := true; end; ok := ok and denied;
  denied := false; begin perform public.flock_event_rsvp(e_meet, 'going'); exception when no_data_found then denied := true; end; ok := ok and denied;
  reset role;
  if ok then passed := passed + 1; else failed := array_append(failed, 'events and locations stay in their chapter'); end if;

  -- 3) An online event's link shows only to people going (and managers).
  perform set_config('request.jwt.claims', json_build_object('sub', m2, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := (select online_url from public.flock_event(e_online)) is null;
  perform public.flock_event_rsvp(e_online, 'maybe');
  ok := ok and (select online_url from public.flock_event(e_online)) is null;
  perform public.flock_event_rsvp(e_online, 'going');
  ok := ok and (select online_url from public.flock_event(e_online)) = 'https://meet.example.com/foraging';
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', m3, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := ok and (select online_url from public.flock_event(e_online)) is null;
  reset role;
  if ok then passed := passed + 1; else failed := array_append(failed, 'online links only for people going'); end if;

  -- 4) Spot limits hold: the third "going" on a 2-spot volunteer day is full;
  --    changing to maybe frees a spot; maybe never counts.
  for n in 1..2 loop
    perform set_config('request.jwt.claims', json_build_object('sub', (array[m1, m2])[n], 'role', 'authenticated')::text, true);
    set local role authenticated;
    perform public.flock_event_rsvp(e_vol, 'going');
    reset role;
  end loop;
  perform set_config('request.jwt.claims', json_build_object('sub', m3, 'role', 'authenticated')::text, true);
  set local role authenticated;
  msg := null;
  begin perform public.flock_event_rsvp(e_vol, 'going'); exception when raise_exception then get stacked diagnostics msg = message_text; end;
  ok := msg = 'event_full';
  perform public.flock_event_rsvp(e_vol, 'maybe');
  ok := ok and exists (select 1 from public.flock_chapter_events('upcoming') where event_id = e_vol and going = 2 and maybe = 1 and spot_limit = 2);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', m2, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.flock_event_rsvp(e_vol, 'going');  -- already going: no change, no error
  perform public.flock_event_rsvp(e_vol, null);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', m3, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.flock_event_rsvp(e_vol, 'going');
  ok := ok and (select going from public.flock_event(e_vol)) = 2;
  reset role;
  if ok then passed := passed + 1; else failed := array_append(failed, 'spot limits hold'); end if;

  -- 5) In person stays locked until the chapter has enough members; a
  --    suggestion is hidden from everyone but its suggester and the chapter's
  --    managers until it's approved.
  perform set_config('request.jwt.claims', json_build_object('sub', m2, 'role', 'authenticated')::text, true);
  set local role authenticated;
  msg := null;
  begin perform public.flock_event_suggest(null, 'meetup', 'Picnic', now() + interval '7 days', null, 'in_person', 'Fort Wayne park', null, null, null, true);
  exception when raise_exception then get stacked diagnostics msg = message_text; end;
  ok := msg = 'in_person_locked' and (select not in_person_open and member_count = 4 and in_person_min = 15 from public.flock_event_rules());
  e_sug := public.flock_event_suggest(null, 'meetup', 'Bird photo night', now() + interval '8 days', null, 'online', null, null, 'https://meet.example.com/photos', 'Share your best shots.', true);
  ok := ok and exists (select 1 from public.flock_chapter_events('upcoming') where event_id = e_sug and status = 'pending' and is_mine);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', m3, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := ok and not exists (select 1 from public.flock_chapter_events('upcoming') where event_id = e_sug);
  denied := false; begin perform * from public.flock_event(e_sug); exception when no_data_found then denied := true; end; ok := ok and denied;
  denied := false; begin perform public.flock_event_rsvp(e_sug, 'going'); exception when no_data_found then denied := true; end; ok := ok and denied;
  denied := false; begin perform * from public.flock_review_queue('events'); exception when insufficient_privilege then denied := true; end; ok := ok and denied;
  reset role;
  update public.flock_chapter_settings set in_person_min_members = 4;
  perform set_config('request.jwt.claims', json_build_object('sub', m2, 'role', 'authenticated')::text, true);
  set local role authenticated;
  e_sug2 := public.flock_event_suggest(null, 'meetup', 'Picnic', now() + interval '7 days', null, 'in_person', 'Fort Wayne park', null, null, null, false);
  reset role;
  update public.flock_chapter_settings set in_person_min_members = 15;
  if ok and e_sug2 is not null then passed := passed + 1; else failed := array_append(failed, 'in-person unlock and hidden suggestions'); end if;

  -- 6) Review: managers see event suggestions under Events; approving puts it
  --    on the calendar and tells the suggester; asking for changes needs a note.
  perform set_config('request.jwt.claims', json_build_object('sub', ad, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select * into r from public.flock_review_counts();
  ok := r.events = 2 and exists (select 1 from public.flock_review_queue('events') where subject_id = e_sug and event_mode = 'online' and author_name = 'Alex R.');
  denied := false; begin perform public.flock_review_event(e_sug2, 'changes', ''); exception when invalid_parameter_value then denied := true; end; ok := ok and denied;
  perform public.flock_review_event(e_sug, 'approve', null);
  perform public.flock_review_event(e_sug2, 'changes', 'Which part of the park?');
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', m3, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := ok and exists (select 1 from public.flock_chapter_events('upcoming') where event_id = e_sug and status = 'live')
           and exists (select 1 from public.flock_event(e_sug) where host_name = 'Alex R.')
           and exists (select 1 from public.flock_notifications_list('chapter', 50) where subject_id = e_sug and event_title = 'Bird photo night');
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', m2, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := ok and exists (select 1 from public.flock_notifications_list('all', 50) where kind = 'review' and subject_id = e_sug and detail = 'approved')
           and exists (select 1 from public.flock_event(e_sug2) where status = 'changes_requested' and review_note = 'Which part of the park?');
  -- Fixing it sends it back for review.
  perform public.flock_event_suggest(e_sug2, 'meetup', 'Picnic', now() + interval '7 days', null, 'in_person', 'Fort Wayne park, north shelter', null, null, null, false);
  ok := ok and (select status from public.flock_event(e_sug2)) = 'pending';
  reset role;
  if ok then passed := passed + 1; else failed := array_append(failed, 'review: approve, ask for changes'); end if;

  -- 7) Only managers create, edit or cancel; cancelling tells everyone going.
  perform set_config('request.jwt.claims', json_build_object('sub', m1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := true;
  denied := false; begin perform public.flock_event_save(null, 'great-lakes', 'meetup', 'Mine', now() + interval '2 days', null, 'online', null, null, null, null, null, null, null); exception when insufficient_privilege then denied := true; end; ok := ok and denied;
  denied := false; begin perform public.flock_event_save(e_meet, null, 'meetup', 'Renamed', now() + interval '2 days', null, 'in_person', null, null, null, null, null, null, null); exception when insufficient_privilege then denied := true; end; ok := ok and denied;
  denied := false; begin perform public.flock_event_cancel(e_meet, null); exception when insufficient_privilege then denied := true; end; ok := ok and denied;
  perform public.flock_event_rsvp(e_meet, 'going');
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ad, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.flock_event_cancel(e_online, 'Our host is sick. We''ll reschedule.');
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', m2, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := ok and exists (select 1 from public.flock_notifications_list('all', 50) where kind = 'event' and detail = 'cancelled' and subject_id = e_online and note like 'Our host%');
  denied := false; begin perform public.flock_event_rsvp(e_online, 'going'); exception when invalid_parameter_value then denied := true; end; ok := ok and denied;
  reset role;
  if ok then passed := passed + 1; else failed := array_append(failed, 'managers only create/edit/cancel; cancelling notifies'); end if;

  -- 8) The day-before reminder goes once to everyone going, and only them.
  n := private.flock_event_reminders();
  ok := (select count(*) from public.flock_notifications where kind = 'event' and detail = 'reminder' and subject_id = e_meet and user_id = m1) = 1;
  n := private.flock_event_reminders();
  ok := ok and n = 0 and (select count(*) from public.flock_notifications where kind = 'event' and detail = 'reminder' and subject_id = e_meet) = 1;
  if ok then passed := passed + 1; else failed := array_append(failed, 'reminders: once, going only'); end if;

  -- 9) Today's idea follows Eastern time.
  if private.flock_today() = (now() at time zone 'America/New_York')::date then passed := passed + 1;
  else failed := array_append(failed, 'Today is Eastern time'); end if;

  raise exception 'FLOCK EVENTS CHECKS: % passed, % failed%', passed, coalesce(array_length(failed, 1), 0),
    case when array_length(failed, 1) > 0 then ': ' || array_to_string(failed, ', ') else '' end;
end $$;
