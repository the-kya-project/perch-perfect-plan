-- Verification for 20261107230000_journeys_browse.
--
-- Self-contained and leaves nothing behind: two Flock members, an app premium
-- member, a free user, a household member and an admin; a community journey and
-- a "Just me" journey with clips, milestones and reactions. Checks who sees,
-- follows, reacts, gets clip references and deletes, then rolls back.
--   "JOURNEYS BROWSE CHECKS: n passed, 0 failed"           → all good
--   "JOURNEYS BROWSE CHECKS: n passed, k failed: <names>"  → which ones broke
-- Run by .github/workflows/db-checks.yml on every PR (scripts/db-checks.sh).
do $$
declare
  m1  uuid := gen_random_uuid();  -- Flock member, owns the birds
  m2  uuid := gen_random_uuid();  -- another Flock member
  pr  uuid := gen_random_uuid();  -- app premium
  fr  uuid := gen_random_uuid();  -- free
  hh  uuid := gen_random_uuid();  -- household on m1's bird (free tier)
  b1  uuid := gen_random_uuid();  -- m1's bird, shown, with a photo
  b2  uuid := gen_random_uuid();  -- m1's bird, not shown, with a photo
  jc uuid; jp uuid; uc uuid; up uuid; mc uuid;
  passed int := 0; failed text[] := '{}';
  ok boolean; n int; denied boolean; r record;
begin
  insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  select '00000000-0000-0000-0000-000000000000', x, 'authenticated', 'authenticated', x::text || '@checks.invalid', '{}', '{}', now(), now()
  from unnest(array[m1, m2, pr, fr, hh]) as x;
  insert into public.entitlements (user_id, plan, status, source, starts_at) values
    (m1, 'comp', 'active', 'manual', now() - interval '1 day'),
    (m2, 'comp', 'active', 'manual', now() - interval '1 day'),
    (pr, 'app_premium', 'active', 'manual', now() - interval '1 day');
  insert into public.birds (id, owner_id, name, species, photo_url) values
    (b1, m1, 'Kiwi', 'Cockatiel', m1::text || '/kiwi.jpg'), (b2, m1, 'Mango', 'Conure', m1::text || '/mango.jpg');
  insert into public.bird_members (bird_id, user_id, role) values (b1, hh, 'household'), (b2, hh, 'household') on conflict do nothing;
  insert into public.flock_profiles (user_id, display_name, region_slug, setup_completed_at) values (m1, 'Alex R.', 'great-lakes', now());
  insert into public.flock_shown_birds (bird_id, user_id, shown) values (b1, m1, true), (b2, m1, false);
  insert into public.clip_assets (uid, bird_id) values ('kiwiclip0001', b1), ('kiwiclip0002', b1), ('mangoclip001', b2);
  update public.journey_settings set audience = 'everyone';

  perform set_config('request.jwt.claims', json_build_object('sub', m1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  jc := public.journey_start(b1, 'recall', null, null, null, 'most_days', 'community', 'cfstream:kiwiclip0001');
  jp := public.journey_start(b2, 'step-up', null, null, null, 'most_days', 'private', 'cfstream:mangoclip001');
  uc := public.journey_post_update(jc, 'cfstream:kiwiclip0002', 'all_in', 'Hopped the gap!');
  perform public.journey_reach_milestone(jc, 1);
  select id into mc from public.journey_milestones where journey_id = jc and position = 1;
  select id into up from public.journey_updates where journey_id = jp limit 1;
  reset role;

  -- 1) A "Just me" journey never appears to anyone outside the household: not in
  --    feeds, not by id, no milestones, no updates, no clip references.
  ok := true;
  for n in 1..3 loop
    perform set_config('request.jwt.claims', json_build_object('sub', (array[m2, pr, fr])[n], 'role', 'authenticated')::text, true);
    set local role authenticated;
    ok := ok and not exists (select 1 from public.journey_feed('for_you', 200) where journey_id = jp)
             and not exists (select 1 from public.journey_view(jp))
             and not exists (select 1 from public.journey_view_milestones(jp))
             and not exists (select 1 from public.journey_view_updates(jp))
             and (select count(*) from public.journeys where id = jp) = 0;
    denied := false;
    begin perform * from public.journey_clip_refs(jp, null); exception when no_data_found then denied := true; end;
    ok := ok and denied;
    reset role;
  end loop;
  if ok then passed := passed + 1; else failed := array_append(failed, 'Just me never appears to anyone else'); end if;

  -- 2) ...but the bird's household sees it.
  perform set_config('request.jwt.claims', json_build_object('sub', hh, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.journey_view(jp);
  reset role;
  if n = 1 then passed := passed + 1; else failed := array_append(failed, 'household sees its own Just me journey'); end if;

  -- 3) A community journey: members and app premium see it; free accounts don't.
  ok := true;
  for n in 1..2 loop
    perform set_config('request.jwt.claims', json_build_object('sub', (array[m2, pr])[n], 'role', 'authenticated')::text, true);
    set local role authenticated;
    ok := ok and exists (select 1 from public.journey_feed('for_you', 50) where journey_id = jc and owner_name = 'Alex R.' and done = 1 and total = 7)
             and (select count(*) from public.journey_view_updates(jc)) = 2;
    reset role;
  end loop;
  perform set_config('request.jwt.claims', json_build_object('sub', fr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := ok and not exists (select 1 from public.journey_feed('for_you', 50)) and not exists (select 1 from public.journey_view(jc));
  reset role;
  if ok then passed := passed + 1; else failed := array_append(failed, 'community journeys: members and premium, not free'); end if;

  -- 4) Following is for Flock members: premium and free can't; nobody follows a Just me journey.
  perform set_config('request.jwt.claims', json_build_object('sub', m2, 'role', 'authenticated')::text, true);
  set local role authenticated;
  n := public.journey_follow(jc, true);
  ok := n = 1 and exists (select 1 from public.journey_following() where journey_id = jc)
        and exists (select 1 from public.journey_feed('following', 50) where journey_id = jc);
  denied := false;
  begin perform public.journey_follow(jp, true); exception when no_data_found then denied := true; end;
  ok := ok and denied;
  reset role;
  n := 0;
  for r in select unnest(array[pr, fr]) as who loop
    perform set_config('request.jwt.claims', json_build_object('sub', r.who, 'role', 'authenticated')::text, true);
    set local role authenticated;
    begin perform public.journey_follow(jc, true); exception when insufficient_privilege then n := n + 1; end;
    reset role;
  end loop;
  if ok and n = 2 then passed := passed + 1; else failed := array_append(failed, 'following: members only'); end if;

  -- 5) Reactions are for Flock members, on things they may see.
  perform set_config('request.jwt.claims', json_build_object('sub', m2, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.journey_react('journey_update', uc, 'great_job', true);
  perform public.journey_react('journey_update', uc, 'great_job', true);   -- once only
  perform public.journey_react('journey_milestone', mc, 'been_there', true);
  select * into r from public.journey_view_updates(jc) where update_id = uc;
  ok := r.great_job = 1 and r.mine = array['great_job'];
  denied := false;
  begin perform public.journey_react('journey_update', up, 'love_this', true); exception when no_data_found then denied := true; end;
  ok := ok and denied;
  reset role;
  n := 0;
  for r in select unnest(array[pr, fr]) as who loop
    perform set_config('request.jwt.claims', json_build_object('sub', r.who, 'role', 'authenticated')::text, true);
    set local role authenticated;
    begin perform public.journey_react('journey_update', uc, 'love_this', true); exception when insufficient_privilege then n := n + 1; end;
    reset role;
  end loop;
  if ok and n = 2 then passed := passed + 1; else failed := array_append(failed, 'reactions: members only, visible things only'); end if;

  -- 6) Clip references only for people who may see the journey (the server signs from these).
  perform set_config('request.jwt.claims', json_build_object('sub', pr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.journey_clip_refs(jc, null);
  reset role;
  ok := n = 2;
  perform set_config('request.jwt.claims', json_build_object('sub', fr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  denied := false;
  begin perform * from public.journey_clip_refs(jc, null); exception when no_data_found then denied := true; end;
  reset role;
  if ok and denied then passed := passed + 1; else failed := array_append(failed, 'clip references only for viewers'); end if;

  -- 7) Filters, the milestone cards in Today, and update tags.
  perform set_config('request.jwt.claims', json_build_object('sub', m2, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := exists (select 1 from public.journey_feed('basics', 50) where journey_id = jc)
        and not exists (select 1 from public.journey_feed('tricks', 50) where journey_id = jc);
  select * into r from public.journey_milestone_cards(20) where journey_id = jc;
  ok := ok and r.milestone_position = 1 and r.update_id = uc and r.caption = 'Hopped the gap!' and r.been_there = 1 and r.owner_region = 'Great Lakes';
  ok := ok and (select is_milestone from public.journey_view_updates(jc) where update_id = uc)
           and exists (select 1 from public.journey_view_updates(jc) where is_day_one and has_clip);
  reset role;
  if ok then passed := passed + 1; else failed := array_append(failed, 'filters, Today cards, tags'); end if;

  -- 8) A bird's photo shows outside the household only if its owner shows the bird.
  perform set_config('request.jwt.claims', json_build_object('sub', m2, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := (select bird_has_photo from public.journey_view(jc));
  reset role;
  update public.flock_shown_birds set shown = false where bird_id = b1;
  perform set_config('request.jwt.claims', json_build_object('sub', m2, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := ok and not (select bird_has_photo from public.journey_view(jc));
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', m1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := ok and (select bird_has_photo from public.journey_view(jc));
  reset role;
  update public.flock_shown_birds set shown = true where bird_id = b1;
  if ok then passed := passed + 1; else failed := array_append(failed, 'bird photos follow shown birds'); end if;

  -- 9) When the creator's membership ends, their community journey leaves others' view.
  update public.entitlements set status = 'canceled', current_period_end = now() - interval '1 minute' where user_id = m1;
  perform set_config('request.jwt.claims', json_build_object('sub', m2, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := not exists (select 1 from public.journey_view(jc));
  reset role;
  update public.entitlements set status = 'active', current_period_end = null where user_id = m1;
  if ok then passed := passed + 1; else failed := array_append(failed, 'lapsed creator hidden'); end if;

  -- 10) Delete: only the owner or whoever started it; clips are handed back, reactions and follows go too.
  perform set_config('request.jwt.claims', json_build_object('sub', m2, 'role', 'authenticated')::text, true);
  set local role authenticated;
  denied := false;
  begin perform * from public.journey_delete(jc); exception when no_data_found then denied := true; end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', hh, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin perform * from public.journey_delete(jc); exception when insufficient_privilege then denied := denied and true; when others then denied := false; end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', m1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.journey_delete(jc);
  reset role;
  if denied and n = 2 and not exists (select 1 from public.journeys where id = jc)
     and not exists (select 1 from public.flock_reactions where subject_id in (uc, mc))
     and not exists (select 1 from public.journey_follows where journey_id = jc) then
    passed := passed + 1; else failed := array_append(failed, 'delete: owner only, clips handed back'); end if;

  -- 11) Nothing readable directly; no public SECURITY DEFINER functions.
  perform set_config('request.jwt.claims', json_build_object('sub', m2, 'role', 'authenticated')::text, true);
  set local role authenticated;
  n := 0;
  begin perform count(*) from public.flock_reactions; exception when insufficient_privilege then n := n + 1; end;
  begin perform count(*) from public.journey_follows; exception when insufficient_privilege then n := n + 1; end;
  begin insert into public.journey_follows (journey_id, user_id) values (jp, m2); exception when insufficient_privilege then n := n + 1; end;
  reset role;
  select count(*) into r from pg_proc p join pg_namespace s on s.oid = p.pronamespace
  where s.nspname = 'public' and p.prosecdef and p.proname like 'journey%';
  if n = 3 and r.count = 0 then passed := passed + 1; else failed := array_append(failed, 'no direct access; invoker wrappers only'); end if;

  -- 12) Finisher tips: from finished journeys only, to app premium and members
  --     only, never your own, no names, newest first with a count; admins hide.
  declare
    t1 uuid; t2 uuid; t3 uuid; ja uuid; jb uuid; jx uuid; wave uuid;
  begin
    select id into wave from public.journey_templates where slug = 'wave';
    insert into public.journeys (id, bird_id, created_by, template_id, status, visibility, rhythm, finished_at)
    values (gen_random_uuid(), b1, m1, wave, 'finished', 'private', 'most_days', now()) returning id into ja;
    insert into public.journeys (id, bird_id, created_by, template_id, status, visibility, rhythm, finished_at)
    values (gen_random_uuid(), b2, m1, wave, 'finished', 'private', 'most_days', now()) returning id into jb;
    insert into public.journeys (id, bird_id, created_by, template_id, status, visibility, rhythm)
    values (gen_random_uuid(), b1, m2, wave, 'happy_where_we_are', 'private', 'most_days') returning id into jx;
    insert into public.journey_finisher_tips (journey_id, template_id, author_id, body, created_at) values
      (ja, wave, m1, 'Older tip.', now() - interval '2 days'),
      (jb, wave, m1, 'Newer tip.', now() - interval '1 day'),
      (jx, wave, m2, 'Not finished, never shown.', now());
    select id into t1 from public.journey_finisher_tips where journey_id = ja;
    select id into t2 from public.journey_finisher_tips where journey_id = jb;

    -- Another member and app premium see m1's two tips, newest first, with the count; no names.
    ok := true;
    for n in 1..2 loop
      perform set_config('request.jwt.claims', json_build_object('sub', (array[m2, pr])[n], 'role', 'authenticated')::text, true);
      set local role authenticated;
      ok := ok and (select array_agg(body order by created_at desc) from public.journey_finisher_tips_for('wave')) = array['Newer tip.', 'Older tip.']
               and (select min(total) from public.journey_finisher_tips_for('wave')) = 2;
      reset role;
    end loop;
    ok := ok and not exists (select 1 from information_schema.routines rt join information_schema.parameters pa on pa.specific_name = rt.specific_name
                             where rt.routine_schema = 'public' and rt.routine_name = 'journey_finisher_tips_for' and pa.parameter_name in ('display_name', 'author_id'));
    -- Free sees nothing; the author never sees their own.
    perform set_config('request.jwt.claims', json_build_object('sub', fr, 'role', 'authenticated')::text, true);
    set local role authenticated;
    ok := ok and not exists (select 1 from public.journey_finisher_tips_for('wave'));
    reset role;
    perform set_config('request.jwt.claims', json_build_object('sub', m1, 'role', 'authenticated')::text, true);
    set local role authenticated;
    ok := ok and not exists (select 1 from public.journey_finisher_tips_for('wave'));
    reset role;
    if ok then passed := passed + 1; else failed := array_append(failed, 'finisher tips: who sees what'); end if;

    -- Only an admin hides a tip; a hidden tip disappears and the count drops.
    perform set_config('request.jwt.claims', json_build_object('sub', m2, 'role', 'authenticated')::text, true);
    set local role authenticated;
    denied := false;
    begin perform public.admin_hide_finisher_tip(t2); exception when insufficient_privilege then denied := true; end;
    reset role;
    insert into public.user_roles (user_id, role) values (hh, 'admin');
    perform set_config('request.jwt.claims', json_build_object('sub', hh, 'role', 'authenticated')::text, true);
    set local role authenticated;
    perform public.admin_hide_finisher_tip(t2);
    reset role;
    perform set_config('request.jwt.claims', json_build_object('sub', m2, 'role', 'authenticated')::text, true);
    set local role authenticated;
    ok := (select array_agg(body) from public.journey_finisher_tips_for('wave')) = array['Older tip.']
          and (select min(total) from public.journey_finisher_tips_for('wave')) = 1;
    reset role;
    if denied and ok then passed := passed + 1; else failed := array_append(failed, 'admin hides a finisher tip'); end if;
  end;

  -- 13) Tip 1 has the new wording.
  if exists (select 1 from public.journey_tips where body = 'Try a short session before breakfast, when treats tend to feel extra special. Breakfast comes right after, as always.')
     and not exists (select 1 from public.journey_tips where body like '%a little hungry%') then
    passed := passed + 1; else failed := array_append(failed, 'tip 1 reworded'); end if;

  raise exception 'JOURNEYS BROWSE CHECKS: % passed, % failed%', passed, coalesce(array_length(failed, 1), 0),
    case when array_length(failed, 1) > 0 then ': ' || array_to_string(failed, ', ') else '' end;
end $$;
