-- Verification for the Journeys redesign as a whole (backlog 1.20, "skills,
-- not milestones": 20261124190000_journeys_skills_data,
-- 20261124230000_journeys_screens, 20261125010000_journeys_member_skills and
-- 20261125030000_diet_starting_weight). The spec's three promises, checked
-- end to end across every read the app uses (docs/flock/journeys-redesign.md,
-- "Tests and docs"; backlog 1.20e):
--
--   A. A free account can start every one of the 14 skills, privately, and
--      never sees community content: no community journeys, updates, big
--      moments, member skills, finisher tips, comments or clips, and it can't
--      follow, react, comment or start a member skill. Each read is first shown
--      to work for a Flock member, so an empty answer means "not for you",
--      never "broken".
--   B. Diet conversion pauses exactly as before without milestones: a new
--      journey (no milestone rows) and a pre-redesign one (milestone 1 reached
--      after its first week, as the old screens did) fed the same weigh-ins
--      give the same weight check after every one, ending in the same pause.
--   C. A "Just me" journey never reaches anyone outside its household (a Flock
--      member, a free account, an admin, a stranger), through any read or
--      write the app uses, while the household sees and posts on it.
--
-- Self-contained and leaves nothing behind: raises so the block rolls back.
--   "JOURNEYS REDESIGN CHECKS: n passed, 0 failed"           → all good
--   "JOURNEYS REDESIGN CHECKS: n passed, k failed: <names>"  → which ones broke
-- Run by .github/workflows/db-checks.yml on every PR (scripts/db-checks.sh).
do $$
declare
  m1  uuid := gen_random_uuid();  -- Flock member, owns Kiwi and Mango
  m2  uuid := gen_random_uuid();  -- another Flock member (the viewer)
  fr  uuid := gen_random_uuid();  -- free
  adm uuid := gen_random_uuid();  -- admin, no membership, no bird access
  st  uuid := gen_random_uuid();  -- stranger (free, no access to anyone's bird)
  hh  uuid := gen_random_uuid();  -- household on Kiwi (free tier)
  b1  uuid := gen_random_uuid();  -- m1's Kiwi (shown)
  b2  uuid := gen_random_uuid();  -- m1's Mango
  bf  uuid := gen_random_uuid();  -- fr's Pip
  bn  uuid := gen_random_uuid();  -- m1's diet bird, new journey
  bo  uuid := gen_random_uuid();  -- m1's diet bird, pre-redesign journey
  jc uuid; jm uuid; jf uuid; jp uuid; jpc uuid; jn uuid; jo uuid;
  uc uuid; um uuid; up uuid; upc uuid; cc uuid; cp uuid;
  viewers uuid[]; who uuid; slug text;
  seq numeric[] := array[388, 378, 374];
  got_n text[] := '{}'; got_o text[] := '{}';
  rn record; ro record;
  passed int := 0; failed text[] := '{}';
  ok boolean; n int; denied boolean; r record; k int;
begin
  insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  select '00000000-0000-0000-0000-000000000000', x, 'authenticated', 'authenticated', x::text || '@checks.invalid', '{}', '{}', now(), now()
  from unnest(array[m1, m2, fr, adm, st, hh]) as x;
  insert into public.user_roles (user_id, role) values (adm, 'admin');
  insert into public.entitlements (user_id, plan, status, source, starts_at) values
    (m1, 'comp', 'active', 'manual', now() - interval '1 day'),
    (m2, 'comp', 'active', 'manual', now() - interval '1 day');
  insert into public.birds (id, owner_id, name, species) values
    (b1, m1, 'Kiwi', 'Cockatiel'), (b2, m1, 'Mango', 'Sun conure'), (bf, fr, 'Pip', 'Cockatiel'),
    (bn, m1, 'Nova', 'Amazon'), (bo, m1, 'Olive', 'Amazon');
  insert into public.bird_members (bird_id, user_id, role) values (b1, hh, 'household') on conflict do nothing;
  insert into public.flock_profiles (user_id, display_name, region_slug, setup_completed_at) values
    (m1, 'Alex R.', 'great-lakes', now()), (m2, 'Robin P.', 'great-lakes', now());
  insert into public.flock_shown_birds (bird_id, user_id, shown) values (b1, m1, true);
  insert into public.clip_assets (uid, bird_id) values
    ('kiwiclip0001', b1), ('kiwiclip0002', b1), ('kiwiclip0003', b1), ('kiwiclip0004', b1), ('mangoclip001', b2);
  update public.journey_settings set audience = 'everyone', diet_pause_drop_pct = 5, diet_notice_drop_pct = 2.5, diet_avg_count = 3,
    diet_avg_recent_days = 3, diet_avg_min_recent = 2, diet_notice_clear_pct = 1.5, diet_slide_days = 7, diet_slide_drop_pct = 3,
    diet_slide_min_readings = 4, diet_sudden_drop_pct = 8, diet_min_drop_grams = 2, diet_missed_days = 2;

  -- m1's journeys: on Kiwi, Recall (community, a big moment that's a question),
  -- their own skill Bell ringing (community, so a member skill), Step up and
  -- their own skill Quiet mornings (both Just me, each with a big moment); on
  -- Mango, Wave (community), finished as learned with a finisher tip.
  perform set_config('request.jwt.claims', json_build_object('sub', m1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  jc := public.journey_start(b1, 'recall', null, null, null, 'most_days', 'community', null);
  uc := public.journey_post_update(jc, 'cfstream:kiwiclip0001', 'all_in', 'Almonds or walnuts?', true);
  jm := public.journey_start(b1, null, 'Bell ringing', null, null, 'most_days', 'community', null, 'Rings the bell when it wants out.');
  um := public.journey_post_update(jm, 'cfstream:kiwiclip0002', 'all_in', 'First ring!', true);
  jp := public.journey_start(b1, 'step-up', null, null, null, 'most_days', 'private', null);
  up := public.journey_post_update(jp, 'cfstream:kiwiclip0003', 'all_in', 'Stepped up from the cage top?', true);
  jpc := public.journey_start(b1, null, 'Quiet mornings', null, null, 'most_days', 'private', null, 'Calm until the blinds go up.');
  upc := public.journey_post_update(jpc, 'cfstream:kiwiclip0004', 'all_in', 'Quiet until seven!', true);
  jf := public.journey_start(b2, 'wave', null, null, null, 'most_days', 'community', 'cfstream:mangoclip001');
  perform public.journey_finish(jf, 'learned');
  perform public.journey_save_finisher_tip(jf, 'Reward the first lift.');
  cc := public.flock_comment_create('journey_update', uc, null, 'Walnuts, always.');
  cp := public.flock_comment_create('journey_update', up, null, 'Note to self: try the perch next.');
  reset role;

  -- m2 follows the community journey, so it has big-moment cards on Today.
  perform set_config('request.jwt.claims', json_build_object('sub', m2, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.journey_follow(jc, true);
  reset role;

  -- A0) The setup itself: no milestone rows on any new journey.
  ok := not exists (select 1 from public.journey_milestones where journey_id in (jc, jm, jp, jpc, jf));
  if ok then passed := passed + 1; else failed := array_append(failed, 'setup: new journeys have no milestones'); end if;

  -- A1) A Flock member sees the community content through every read (the
  --     positive control for A3).
  perform set_config('request.jwt.claims', json_build_object('sub', m2, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := exists (select 1 from public.journey_feed('for_you', 200) where journey_id = jc)
    and exists (select 1 from public.journey_view(jc))
    and exists (select 1 from public.journey_view_updates(jc) where update_id = uc)
    and exists (select 1 from public.journey_big_moments(jc) where update_id = uc)
    and exists (select 1 from public.journey_moment_cards(50) where journey_id = jc and card_kind = 'big_moment')
    and exists (select 1 from public.journey_following() where journey_id = jc)
    and exists (select 1 from public.journey_following_latest() where journey_id = jc)
    and exists (select 1 from public.journey_skill_journeys('recall', 20) where journey_id = jc)
    and exists (select 1 from public.journey_finisher_tips_for('wave'))
    and exists (select 1 from public.journey_member_skills(null, 30) where journey_id = jm)
    and exists (select 1 from public.journey_custom_about(jm) where is_member_skill)
    and exists (select 1 from public.journey_clip_refs(jc, null))
    and exists (select 1 from public.flock_comments_for('journey_update', uc) where comment_id = cc);
  reset role;
  if ok then passed := passed + 1; else failed := array_append(failed, 'member sees community content (control)'); end if;

  -- A2) A free account starts every one of the 14 skills, privately, with no
  --     milestone rows, and only privately.
  perform set_config('request.jwt.claims', json_build_object('sub', fr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  n := 0;
  for slug in select t.slug from public.journey_templates t order by t.sort_order loop
    begin
      perform public.journey_start(bf, slug, null, null, null, 'most_days', 'private', null);
      n := n + 1;
    exception when others then
      failed := array_append(failed, 'free: start ' || slug || ' (' || sqlerrm || ')');
    end;
  end loop;
  denied := false;
  begin perform public.journey_start(bf, null, 'Shower perch', null, null, 'most_days', 'community', null);
  exception when insufficient_privilege then denied := true; end;
  reset role;
  ok := n = 14 and denied
    and (select count(*) from public.journeys where bird_id = bf) = 14
    and (select count(distinct template_id) from public.journeys where bird_id = bf) = 14
    and not exists (select 1 from public.journeys where bird_id = bf and visibility <> 'private')
    and not exists (select 1 from public.journey_milestones m join public.journeys j on j.id = m.journey_id where j.bird_id = bf);
  if ok then passed := passed + 1; else failed := array_append(failed, 'free: every skill can be started, only privately'); end if;

  -- A3) ...and sees none of the community content: every read A1 used comes
  --     back empty (or refuses).
  perform set_config('request.jwt.claims', json_build_object('sub', fr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := true;
  begin
    ok := not exists (select 1 from public.journey_feed('for_you', 200))
             and not exists (select 1 from public.journey_feed('tricks', 200))
             and not exists (select 1 from public.journey_feed('basics', 200))
             and not exists (select 1 from public.journey_view(jc))
             and not exists (select 1 from public.journey_view(jf))
             and not exists (select 1 from public.journey_view_updates(jc))
             and not exists (select 1 from public.journey_big_moments(jc))
             and not exists (select 1 from public.journey_moment_cards(50))
             and not exists (select 1 from public.journey_following())
             and not exists (select 1 from public.journey_following_latest())
             and not exists (select 1 from public.journey_skill_journeys('recall', 20))
             and not exists (select 1 from public.journey_finisher_tips_for('wave'))
             and not exists (select 1 from public.journey_member_skills(null, 30))
             and not exists (select 1 from public.journey_member_skills('bell', 30))
             and not exists (select 1 from public.journey_custom_about(jm))
             and (select count(*) from public.journeys where id in (jc, jm, jf)) = 0
             and (select count(*) from public.journey_updates where journey_id in (jc, jm, jf)) = 0;
  end;
  denied := false;
  begin perform * from public.journey_clip_refs(jc, null); exception when no_data_found or insufficient_privilege then denied := true; end;
  ok := ok and denied;
  -- Comments are Flock-only: refused ("flock members only"), so nothing seen.
  n := 0;
  begin select count(*) into n from public.flock_comments_for('journey_update', uc);
  exception when insufficient_privilege or no_data_found then n := 0; end;
  ok := ok and n = 0;
  reset role;
  if ok then passed := passed + 1; else failed := array_append(failed, 'free: no community content anywhere'); end if;

  -- A4) ...and can't act on it: follow, react, comment, start a member skill.
  perform set_config('request.jwt.claims', json_build_object('sub', fr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  n := 0;
  begin perform public.journey_follow(jc, true); exception when others then n := n + 1; end;
  begin perform public.flock_react('journey_update', uc, 'great_job', true); exception when others then n := n + 1; end;
  begin perform public.flock_comment_create('journey_update', uc, null, 'Nice!'); exception when others then n := n + 1; end;
  begin perform public.journey_start_member_skill(jm, bf, 'most_days', 'private'); exception when others then n := n + 1; end;
  reset role;
  ok := n = 4
    and not exists (select 1 from public.journey_follows where user_id = fr)
    and not exists (select 1 from public.flock_reactions where user_id = fr)
    and not exists (select 1 from public.flock_comments where author_id = fr)
    and not exists (select 1 from public.journeys where bird_id = bf and source_journey_id is not null);
  if ok then passed := passed + 1; else failed := array_append(failed, 'free: no follow, reaction, comment or member skill'); end if;

  -- B) Diet conversion pauses exactly as before without milestones. Both birds
  --    weigh 400 g three times in the week after their start (20 days ago),
  --    then the same three readings; the pre-redesign journey also has its old
  --    milestone rows, milestone 1 reached when that week ended.
  insert into public.weight_entries (bird_id, grams, measured_at)
  select b, 400, now() - make_interval(days => d) from unnest(array[bn, bo]) b, unnest(array[19, 18, 17]) d;
  perform set_config('request.jwt.claims', json_build_object('sub', m1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  jn := public.journey_start(bn, 'diet-conversion', null, null, null, 'most_days', 'private', null);
  jo := public.journey_start(bo, 'diet-conversion', null, null, null, 'most_days', 'private', null);
  reset role;
  update public.journeys set started_at = now() - interval '20 days' where id in (jn, jo);
  insert into public.journey_milestones (journey_id, position, title, template_milestone_id, state, reached_at)
  select jo, m.position, m.title, m.id, case when m.position = 1 then 'reached' else 'todo' end,
         case when m.position = 1 then now() - interval '13 days' end
  from public.journey_template_milestones m join public.journey_templates t on t.id = m.template_id
  where t.slug = 'diet-conversion';
  ok := not exists (select 1 from public.journey_milestones where journey_id = jn)
    and exists (select 1 from public.journey_milestones where journey_id = jo);
  for k in 1 .. array_length(seq, 1) loop
    insert into public.weight_entries (bird_id, grams, measured_at)
    select b, seq[k], now() - make_interval(days => array_length(seq, 1) - k, hours => 1) from unnest(array[bn, bo]) b;
    perform set_config('request.jwt.claims', json_build_object('sub', m1, 'role', 'authenticated')::text, true);
    set local role authenticated;
    select * into rn from public.journey_weight_check(jn);
    select * into ro from public.journey_weight_check(jo);
    reset role;
    got_n := got_n || (case when rn.paused then 'pause:' || rn.pause_kind when rn.recheck then 'recheck' else rn.level end);
    got_o := got_o || (case when ro.paused then 'pause:' || ro.pause_kind when ro.recheck then 'recheck' else ro.level end);
    ok := ok and rn.start_grams = ro.start_grams and rn.avg_grams = ro.avg_grams and rn.drop_pct = ro.drop_pct
      and rn.start_set = ro.start_set and rn.level = ro.level and rn.paused = ro.paused
      and rn.pause_kind is not distinct from ro.pause_kind;
  end loop;
  ok := ok and got_n = array['none', 'notice', 'pause:drop'] and got_o = got_n and rn.start_grams = 400 and rn.start_set
    and (select bool_and(status = 'paused' and paused_reason = 'weight_drop' and weight_pause_kind = 'drop')
         from public.journeys where id in (jn, jo));
  -- Paused by weight: neither can be finished as learned; both resume only
  -- after the vet call is confirmed, re-based on the latest weight.
  perform set_config('request.jwt.claims', json_build_object('sub', m1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  n := 0;
  begin perform public.journey_finish(jn, 'learned'); exception when others then n := n + 1; end;
  begin perform public.journey_finish(jo, 'learned'); exception when others then n := n + 1; end;
  begin
    perform public.journey_resume_after_vet(jn, true);
    perform public.journey_resume_after_vet(jo, true);
  exception when others then ok := false;
  end;
  select * into rn from public.journey_weight_check(jn);
  select * into ro from public.journey_weight_check(jo);
  reset role;
  ok := ok and n = 2 and not rn.paused and not ro.paused and rn.start_grams = ro.start_grams and rn.start_grams = 374
    and (select bool_and(status = 'active') from public.journeys where id in (jn, jo));
  if ok then passed := passed + 1; else failed := array_append(failed, 'diet: same pause with and without milestones ' || got_n::text || ' vs ' || got_o::text); end if;

  -- C1) A Just me journey (a skill and the owner's own) never reaches anyone
  --     outside the household: by id, in feeds, as cards or member skills, as
  --     updates, big moments, clips or comments.
  viewers := array[m2, fr, adm, st];
  k := 0;  -- viewers it reached
  foreach who in array viewers loop
    perform set_config('request.jwt.claims', json_build_object('sub', who, 'role', 'authenticated')::text, true);
    set local role authenticated;
    begin
      ok := not exists (select 1 from public.journey_feed('for_you', 200) where journey_id in (jp, jpc))
               and not exists (select 1 from public.journey_view(jp))
               and not exists (select 1 from public.journey_view(jpc))
               and not exists (select 1 from public.journey_view_updates(jp))
               and not exists (select 1 from public.journey_view_updates(jpc))
               and not exists (select 1 from public.journey_view_milestones(jp))
               and not exists (select 1 from public.journey_big_moments(jp))
               and not exists (select 1 from public.journey_big_moments(jpc))
               and not exists (select 1 from public.journey_moment_cards(50) where journey_id in (jp, jpc))
               and not exists (select 1 from public.journey_following() where journey_id in (jp, jpc))
               and not exists (select 1 from public.journey_following_latest() where journey_id in (jp, jpc))
               and not exists (select 1 from public.journey_skill_journeys('step-up', 50) where journey_id = jp)
               and not exists (select 1 from public.journey_member_skills(null, 50) where journey_id = jpc)
               and not exists (select 1 from public.journey_member_skills('quiet', 50) where journey_id = jpc)
               and not exists (select 1 from public.journey_custom_about(jpc))
               and (select count(*) from public.journeys where id in (jp, jpc)) = 0
               and (select count(*) from public.journey_updates where journey_id in (jp, jpc)) = 0;
    end;
    denied := false;
    begin perform * from public.journey_clip_refs(jp, null); exception when no_data_found or insufficient_privilege then denied := true; end;
    ok := ok and denied;
    -- Comments: refused for a free account ("flock members only") and "not found" for
    -- anyone else, both meaning nothing seen.
    n := 0;
    begin select count(*) into n from public.flock_comments_for('journey_update', up);
    exception when insufficient_privilege or no_data_found then n := 0; end;
    ok := ok and n = 0;
    reset role;
    if not ok then
      k := k + 1;
      failed := array_append(failed, 'Just me reached ' || case who when m2 then 'a member' when fr then 'a free account' when adm then 'an admin' else 'a stranger' end);
    end if;
  end loop;
  if k = 0 then passed := passed + 1; end if;

  -- C2) ...nobody outside can act on it: follow, react, comment, start it as a
  --     member skill.
  n := 0;
  foreach who in array viewers loop
    perform set_config('request.jwt.claims', json_build_object('sub', who, 'role', 'authenticated')::text, true);
    set local role authenticated;
    begin perform public.journey_follow(jp, true); exception when others then n := n + 1; end;
    begin perform public.flock_react('journey_update', up, 'great_job', true); exception when others then n := n + 1; end;
    begin perform public.flock_comment_create('journey_update', up, null, 'Go Kiwi!'); exception when others then n := n + 1; end;
    reset role;
  end loop;
  perform set_config('request.jwt.claims', json_build_object('sub', m2, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin perform public.journey_start_member_skill(jpc, gen_random_uuid(), 'most_days', 'private'); exception when others then n := n + 1; end;
  reset role;
  ok := n = 3 * array_length(viewers, 1) + 1
    and not exists (select 1 from public.journey_follows where journey_id in (jp, jpc))
    and not exists (select 1 from public.flock_reactions where subject_id in (up, upc))
    and (select count(*) from public.flock_comments where subject_id = up) = 1;
  if ok then passed := passed + 1; else failed := array_append(failed, 'Just me: nobody outside can follow, react, comment or copy'); end if;

  -- C3) ...while the household sees it, its update and comment, and posts on it.
  perform set_config('request.jwt.claims', json_build_object('sub', hh, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := exists (select 1 from public.journey_view(jp))
    and exists (select 1 from public.journey_view(jpc))
    and exists (select 1 from public.journey_view_updates(jp) where update_id = up)
    and (select count(*) from public.journeys where id in (jp, jpc)) = 2;
  reset role;
  insert into public.clip_assets (uid, bird_id) values ('kiwiclip0009', b1);
  perform set_config('request.jwt.claims', json_build_object('sub', hh, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := ok and public.journey_post_update(jp, 'cfstream:kiwiclip0009', 'distracted', 'Co-carer here.') is not null;
  reset role;
  -- Comments are a Flock feature: the owner (a member) reads the one on it.
  perform set_config('request.jwt.claims', json_build_object('sub', m1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := ok and exists (select 1 from public.flock_comments_for('journey_update', up) where comment_id = cp);
  reset role;
  if ok then passed := passed + 1; else failed := array_append(failed, 'Just me: the household sees and posts'); end if;

  -- C4) Making it a community journey later is the owner's choice, and only
  --     then does a member see it (the control for C1).
  perform set_config('request.jwt.claims', json_build_object('sub', m1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.journey_set_visibility(jp, 'community');
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', m2, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := exists (select 1 from public.journey_view(jp)) and exists (select 1 from public.journey_view_updates(jp) where update_id = up);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', fr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := ok and not exists (select 1 from public.journey_view(jp));
  reset role;
  if ok then passed := passed + 1; else failed := array_append(failed, 'Just me → community: members only, once the owner shares'); end if;

  raise exception 'JOURNEYS REDESIGN CHECKS: % passed, % failed%', passed, coalesce(array_length(failed, 1), 0),
    case when array_length(failed, 1) > 0 then ': ' || array_to_string(failed, ', ') else '' end;
end $$;
