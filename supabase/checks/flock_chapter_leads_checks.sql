-- Verification for 20261108140000_flock_chapter_leads.
--
-- Self-contained and leaves nothing behind: an admin; a would-be lead (ld) and
-- members in Great Lakes; a Texas member; a free user. Checks who makes
-- leads, what a lead may review and edit (their chapter's events only, never
-- Do good or reports), that removing a lead ends it at once, the entitlement
-- that goes with it, and the Members tab's roster. Then rolls back.
--   "FLOCK CHAPTER LEADS CHECKS: n passed, 0 failed"           → all good
--   "FLOCK CHAPTER LEADS CHECKS: n passed, k failed: <names>"  → which ones broke
-- Run by .github/workflows/db-checks.yml on every PR (scripts/db-checks.sh).
do $$
declare
  ad uuid := gen_random_uuid();
  ld uuid := gen_random_uuid();  -- becomes the Great Lakes lead (no other membership)
  m1 uuid := gen_random_uuid();
  m4 uuid := gen_random_uuid();  -- Texas
  fr uuid := gen_random_uuid();
  b1 uuid := gen_random_uuid(); b2 uuid := gen_random_uuid(); b3 uuid := gen_random_uuid();
  e_gl uuid; e_tx uuid; p_good uuid; ev uuid;
  passed int := 0; failed text[] := '{}';
  ok boolean; denied boolean; r record;
begin
  insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  select '00000000-0000-0000-0000-000000000000', x, 'authenticated', 'authenticated', x::text || '@checks.invalid', '{}', '{}', now(), now()
  from unnest(array[ad, ld, m1, m4, fr]) as x;
  insert into public.entitlements (user_id, plan, status, source, starts_at)
  select x, 'comp', 'active', 'manual', now() - interval '1 day' from unnest(array[m1, m4]) as x;
  insert into public.user_roles (user_id, role) values (ad, 'admin');
  insert into public.flock_profiles (user_id, display_name, region_slug, setup_completed_at) values
    (ad, 'Brittany K.', 'great-lakes', now()), (ld, 'Priya S.', 'great-lakes', now()), (m1, 'Alex R.', 'great-lakes', now()), (m4, 'Jo K.', 'texas', now());
  insert into public.birds (id, owner_id, name, species) values
    (b1, ld, 'Mango', 'Blue and gold macaw'), (b2, m1, 'Kiwi', 'Green-cheeked conure'), (b3, m1, 'Pip', 'Cockatiel');
  insert into public.flock_shown_birds (bird_id, user_id, shown) values (b1, ld, true), (b2, m1, true), (b3, m1, false);

  -- Suggestions in both chapters, a Do good post, and a report, all waiting.
  perform set_config('request.jwt.claims', json_build_object('sub', m1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  e_gl := public.flock_event_suggest(null, 'meetup', 'Bird photo night', now() + interval '8 days', null, 'online', null, null, null, null, true);
  select post_id into p_good from public.flock_post_create('good', null, 'Rescue needs pellets.', '{}', null, false);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', m4, 'role', 'authenticated')::text, true);
  set local role authenticated;
  e_tx := public.flock_event_suggest(null, 'meetup', 'Houston swap', now() + interval '8 days', null, 'online', null, null, null, null, true);
  reset role;

  -- 1) Only admins make or remove leads; making one grants the chapter_lead
  --    entitlement, which makes them a Flock member.
  perform set_config('request.jwt.claims', json_build_object('sub', m1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  denied := false; begin perform public.admin_set_chapter_lead(m1, true); exception when insufficient_privilege then denied := true; end;
  reset role;
  ok := denied and not private.can_use_flock(ld);
  perform set_config('request.jwt.claims', json_build_object('sub', ad, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := ok and public.admin_set_chapter_lead(ld, true) = 'great-lakes';
  reset role;
  ok := ok and private.can_use_flock(ld)
           and exists (select 1 from public.entitlements where user_id = ld and plan = 'chapter_lead' and source = 'chapter_lead' and status = 'active');
  if ok then passed := passed + 1; else failed := array_append(failed, 'admins make leads; it grants the entitlement'); end if;

  -- 2) A lead sees the review queue for their own chapter's events only:
  --    never another chapter's, never Do good, never reports.
  perform set_config('request.jwt.claims', json_build_object('sub', ld, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select * into r from public.flock_review_counts();
  ok := public.flock_can_review() and r.events = 1 and r.good = 0 and r.reports = 0
    and (select array_agg(subject_id) from public.flock_review_queue('all')) = array[e_gl]
    and not exists (select 1 from public.flock_review_queue('good'))
    and not exists (select 1 from public.flock_review_queue('reports'));
  denied := false; begin perform public.flock_review_event(e_tx, 'approve', null); exception when no_data_found then denied := true; end; ok := ok and denied;
  denied := false; begin perform public.flock_review_post(p_good, 'approve', null); exception when insufficient_privilege then denied := true; end; ok := ok and denied;
  denied := false; begin perform public.flock_resolve_report('post', p_good, 'keep', null); exception when insufficient_privilege then denied := true; end; ok := ok and denied;
  perform public.flock_review_event(e_gl, 'approve', null);
  reset role;
  ok := ok and (select status from public.flock_events where id = e_gl) = 'live' and (select status from public.flock_events where id = e_tx) = 'pending';
  if ok then passed := passed + 1; else failed := array_append(failed, 'leads review their own chapter''s events only'); end if;

  -- 3) A lead creates, edits and cancels events in their chapter only, and
  --    is shown as "chapter lead" when hosting.
  perform set_config('request.jwt.claims', json_build_object('sub', ld, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ev := public.flock_event_save(null, 'great-lakes', 'meetup', 'Fall flock meetup', now() + interval '3 days', null, 'in_person', 'Library', null, null, null, null, null, null);
  perform public.flock_event_save(ev, null, 'meetup', 'Fall flock meetup (Room B)', now() + interval '3 days', null, 'in_person', 'Library, Room B', null, null, null, null, null, null);
  ok := exists (select 1 from public.flock_event(ev) where title = 'Fall flock meetup (Room B)' and host_name = 'Priya S.' and host_is_lead and can_manage);
  denied := false; begin perform public.flock_event_save(null, 'texas', 'meetup', 'Not mine', now() + interval '3 days', null, 'online', null, null, null, null, null, null, null); exception when insufficient_privilege then denied := true; end; ok := ok and denied;
  reset role;
  if ok then passed := passed + 1; else failed := array_append(failed, 'leads manage their own chapter''s events only'); end if;

  -- 4) Removing a lead ends it at once: no queue, no event edits, no
  --    entitlement (and with no other membership, no Flock).
  perform set_config('request.jwt.claims', json_build_object('sub', ad, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.admin_set_chapter_lead(ld, false);
  reset role;
  ok := not private.can_use_flock(ld) and not exists (select 1 from public.entitlements where user_id = ld and source = 'chapter_lead');
  perform set_config('request.jwt.claims', json_build_object('sub', ld, 'role', 'authenticated')::text, true);
  set local role authenticated;
  denied := false; begin perform * from public.flock_review_queue('events'); exception when insufficient_privilege then denied := true; end; ok := ok and denied;
  denied := false; begin perform public.flock_event_cancel(ev, null); exception when insufficient_privilege then denied := true; end; ok := ok and denied;
  reset role;
  -- Even with their own membership, an ex-lead manages nothing.
  insert into public.entitlements (user_id, plan, status, source, starts_at) values (ld, 'comp', 'active', 'manual', now() - interval '1 day');
  perform set_config('request.jwt.claims', json_build_object('sub', ld, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := ok and not public.flock_can_review() and not (select can_manage from public.flock_event(ev));
  denied := false; begin perform public.flock_event_save(ev, null, 'meetup', 'Renamed', now() + interval '3 days', null, 'in_person', 'Library', null, null, null, null, null, null); exception when insufficient_privilege then denied := true; end; ok := ok and denied;
  reset role;
  if ok then passed := passed + 1; else failed := array_append(failed, 'removing a lead ends it at once'); end if;

  -- 5) The Members tab: names, photos, founder and lead badges, and only
  --    shown birds (name and species); members only.
  perform set_config('request.jwt.claims', json_build_object('sub', ad, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.admin_set_chapter_lead(ld, true);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', m1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := (select count(*) from public.flock_chapter_roster('great-lakes')) = 3
    and (select display_name from public.flock_chapter_roster('great-lakes') limit 1) = 'Priya S.'
    and exists (select 1 from public.flock_chapter_roster('great-lakes') where user_id = ld and is_lead and birds = '[{"name": "Mango", "species": "Blue and gold macaw"}]'::jsonb)
    and exists (select 1 from public.flock_chapter_roster('great-lakes') where user_id = m1 and not is_lead and birds = '[{"name": "Kiwi", "species": "Green-cheeked conure"}]'::jsonb)
    and public.flock_chapter_lead_of(ld) = 'great-lakes' and public.flock_chapter_lead_of(m1) is null;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', fr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  denied := false; begin perform * from public.flock_chapter_roster('great-lakes'); exception when insufficient_privilege then denied := true; end; ok := ok and denied;
  denied := false; begin perform 1 from public.flock_chapter_leads; exception when insufficient_privilege then denied := true; end; ok := ok and denied;
  reset role;
  if ok then passed := passed + 1; else failed := array_append(failed, 'members roster: badges and shown birds only'); end if;

  raise exception 'FLOCK CHAPTER LEADS CHECKS: % passed, % failed%', passed, coalesce(array_length(failed, 1), 0),
    case when array_length(failed, 1) > 0 then ': ' || array_to_string(failed, ', ') else '' end;
end $$;
