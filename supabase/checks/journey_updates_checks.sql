-- Verification for 20261107220000_journeys_updates, as changed by
-- 20261124190000_journeys_skills_data (skills, not milestones: new journeys have
-- no milestone rows and end through journey_finish).
--
-- Self-contained and leaves nothing behind: makes a free user, a paid Flock member,
-- a Flock member, an admin and a stranger, birds, clips, journeys and weights,
-- checks posting, big moments, finishing, tips, sharing, status and Diet
-- conversion's weight safeguard, then raises so everything rolls back.
--   "JOURNEY UPDATES CHECKS: n passed, 0 failed"           → all good
--   "JOURNEY UPDATES CHECKS: n passed, k failed: <names>"  → which ones broke
-- Run by .github/workflows/db-checks.yml on every PR (scripts/db-checks.sh).
do $$
declare
  fr  uuid := gen_random_uuid();  -- free
  pr  uuid := gen_random_uuid();  -- Flock member on a paid annual plan (app premium is gone)
  fm  uuid := gen_random_uuid();  -- Flock member
  adm uuid := gen_random_uuid();  -- admin
  st  uuid := gen_random_uuid();  -- stranger
  bf  uuid := gen_random_uuid();  -- fr's bird
  bp  uuid := gen_random_uuid();  -- pr's bird
  bm  uuid := gen_random_uuid();  -- fm's bird
  bd  uuid := gen_random_uuid();  -- fm's bird on a diet
  bx  uuid := gen_random_uuid();  -- pr's bird that has passed
  jf uuid; jp uuid; jm uuid; jd uuid; jc uuid; jh uuid; js uuid; jx uuid;
  passed int := 0; failed text[] := '{}';
  ok boolean; n int; denied boolean; u uuid; r record; v text;
begin
  insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  select '00000000-0000-0000-0000-000000000000', x, 'authenticated', 'authenticated', x::text || '@checks.invalid', '{}', '{}', now(), now()
  from unnest(array[fr, pr, fm, adm, st]) as x;
  -- Test members have agreed to the community guidelines (20261128180000).
  insert into public.flock_guideline_agreements (user_id, version)
  select u.id, public.current_guidelines_version() from auth.users u where u.email like '%@checks.invalid'
  on conflict do nothing;
  insert into public.user_roles (user_id, role) values (adm, 'admin');
  insert into public.entitlements (user_id, plan, status, source, starts_at) values
    (pr, 'annual',      'active', 'manual', now() - interval '1 day'),
    (fm, 'comp',        'active', 'manual', now() - interval '1 day');
  insert into public.birds (id, owner_id, name, species) values
    (bf, fr, 'Kiwi', 'Cockatiel'), (bp, pr, 'Mango', 'Sun conure'), (bm, fm, 'Echo', 'Amazon'), (bd, fm, 'Juno', 'Amazon'),
    (bx, pr, 'Sunny', 'Sun conure');
  insert into public.clip_assets (uid, bird_id)
  select 'kiwi' || lpad(g::text, 8, '0'), bf from generate_series(1, 12) g;
  insert into public.clip_assets (uid, bird_id) values ('echoclip0001', bm), ('echoclip0002', bm), ('mangoclip001', bp);
  update public.journey_settings set audience = 'everyone', diet_pause_drop_pct = 5, diet_notice_drop_pct = 2.5;

  perform set_config('request.jwt.claims', json_build_object('sub', fr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  jf := public.journey_start(bf, 'step-up', null, null, array[1], 'most_days', 'private', null);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', pr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  jp := public.journey_start(bp, 'wave', null, null, null, 'most_days', 'private', null);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', fm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  jm := public.journey_start(bm, null, 'Bath time', array['Near the dish', 'Toes in', 'Splashes'], null, 'weekends', 'community', null);
  jd := public.journey_start(bd, 'diet-conversion', null, null, null, 'most_days', 'community', null);
  reset role;

  -- 0) New journeys get no milestone rows, even when an app build from before
  --    the redesign still sends milestones or "already" positions (both are
  --    ignored; today's screens send neither).
  if not exists (select 1 from public.journey_milestones where journey_id in (jf, jp, jm, jd))
     and (select custom_name from public.journeys where id = jm) = 'Bath time' then
    passed := passed + 1; else failed := array_append(failed, 'new journeys have no milestones'); end if;

  -- 1) Post an update: clip, engagement, caption; a "?" makes it a Question; no milestone
  --    position on a journey without milestones; not a big moment unless asked.
  perform set_config('request.jwt.claims', json_build_object('sub', fr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  u := public.journey_post_update(jf, 'cfstream:kiwi00000001', 'all_in', 'Three seconds on my hand! Almonds or walnuts?');
  select * into r from public.journey_updates where id = u;
  reset role;
  if r.is_question and r.engagement = 'all_in' and r.milestone_position is null and not r.is_big_moment and r.author_id = fr then
    passed := passed + 1; else failed := array_append(failed, 'post an update'); end if;

  -- 1b) "This was a big moment" is stored with the update.
  perform set_config('request.jwt.claims', json_build_object('sub', fm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  u := public.journey_post_update(jm, 'cfstream:echoclip0002', 'all_in', 'First splash!', true);
  select * into r from public.journey_updates where id = u;
  reset role;
  if r.is_big_moment and r.milestone_position is null and not r.is_question then
    passed := passed + 1; else failed := array_append(failed, 'post: big moment stored'); end if;

  -- 2) Engagement is required; a clip from another bird is refused; a stranger can't post.
  perform set_config('request.jwt.claims', json_build_object('sub', fr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  n := 0;
  begin perform public.journey_post_update(jf, 'cfstream:kiwi00000002', null, null); exception when invalid_parameter_value then n := n + 1; end;
  begin perform public.journey_post_update(jf, 'cfstream:mangoclip001', 'all_in', null); exception when insufficient_privilege then n := n + 1; end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', st, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin perform public.journey_post_update(jf, 'cfstream:kiwi00000002', 'all_in', null); exception when no_data_found then n := n + 1; end;
  reset role;
  if n = 3 then passed := passed + 1; else failed := array_append(failed, 'post: engagement, own clip, members only'); end if;

  -- 3) Free: 10 clips per journey, then refused.
  perform set_config('request.jwt.claims', json_build_object('sub', fr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  for n in 2..10 loop
    perform public.journey_post_update(jf, 'cfstream:kiwi' || lpad(n::text, 8, '0'), 'distracted', null);
  end loop;
  denied := false;
  begin perform public.journey_post_update(jf, 'cfstream:kiwi00000011', 'all_in', null); exception when insufficient_privilege then denied := true; end;
  reset role;
  if denied and (select count(*) from public.journey_updates where journey_id = jf) = 10 then
    passed := passed + 1; else failed := array_append(failed, 'free: clip limit per journey'); end if;

  -- 4) A new journey has no milestone to reach; "[Bird] learned it!" finishes it and adds the skill.
  perform set_config('request.jwt.claims', json_build_object('sub', fm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := false;
  begin perform public.journey_reach_milestone(jm, 1); exception when no_data_found then ok := true; end;
  v := public.journey_finish(jm, 'learned');
  reset role;
  if ok and v = 'finished'
     and (select status = 'finished' and finished_at is not null from public.journeys where id = jm)
     and exists (select 1 from public.bird_skills where bird_id = bm and name = 'Bath time' and source = 'journey' and journey_id = jm) then
    passed := passed + 1; else failed := array_append(failed, 'finish learned adds the skill'); end if;

  -- 4b) Milestones are history: reaching every one on a journey that still has them never finishes it.
  insert into public.journey_milestones (journey_id, position, title) values
    (jp, 1, 'Lifts a foot.'), (jp, 2, 'Waves on cue.');
  perform set_config('request.jwt.claims', json_build_object('sub', pr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.journey_reach_milestone(jp, 1);
  select * into r from public.journey_reach_milestone(jp, 2);
  reset role;
  if not r.finished and r.done = 2 and r.total = 2
     and (select status = 'active' and finished_at is null from public.journeys where id = jp)
     and not exists (select 1 from public.bird_skills where bird_id = bp) then
    passed := passed + 1; else failed := array_append(failed, 'reach milestone never finishes'); end if;

  -- 5) A finished journey takes no more posts and can't be finished again; a finisher tip saves only once it's finished.
  perform set_config('request.jwt.claims', json_build_object('sub', fm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  n := 0;
  begin perform public.journey_post_update(jm, 'cfstream:echoclip0001', 'all_in', null); exception when invalid_parameter_value then n := n + 1; end;
  begin perform public.journey_finish(jm, 'learned'); exception when invalid_parameter_value then n := n + 1; end;
  begin perform public.journey_finish(jm, 'happy_where_we_are'); exception when invalid_parameter_value then n := n + 1; end;
  begin perform public.journey_save_finisher_tip(jd, 'Too early'); exception when invalid_parameter_value then n := n + 1; end;
  perform public.journey_save_finisher_tip(jm, 'Warm water and a favorite toy did it.');
  reset role;
  if n = 4 and exists (select 1 from public.journey_finisher_tips where journey_id = jm)
     and (select status from public.journeys where id = jm) = 'finished'
     and (select count(*) from public.bird_skills where bird_id = bm) = 1 then
    passed := passed + 1; else failed := array_append(failed, 'finished: no more posts, no second finish; tip after finish'); end if;

  -- 6) Finisher tips: Flock members read them; free accounts get none; no direct reads.
  -- (Tips show only from finished journeys and never to their own author, so
  --  this one is written by someone else and its journey counts as finished.)
  insert into public.journey_finisher_tips (journey_id, template_id, author_id, body)
  values (jp, (select id from public.journey_templates where slug = 'wave'), fm, 'Keep the treat hand low.');
  update public.journeys set status = 'finished' where id = jp;
  perform set_config('request.jwt.claims', json_build_object('sub', pr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.journey_finisher_tips_for('wave');
  ok := n = 1;
  denied := false;
  begin perform count(*) from public.journey_finisher_tips; exception when insufficient_privilege then denied := true; end;
  ok := ok and denied;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', fr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.journey_finisher_tips_for('wave');
  reset role;
  update public.journeys set status = 'active' where id = jp;
  if ok and n = 0 then passed := passed + 1; else failed := array_append(failed, 'finisher tips: members only'); end if;

  -- 7) Sharing a milestone and community visibility are for Flock members. Only a
  --    reached history milestone can be shared; new journeys have none to share.
  perform set_config('request.jwt.claims', json_build_object('sub', fr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  n := 0;
  begin perform public.journey_set_visibility(jf, 'community'); exception when insufficient_privilege then n := n + 1; end;
  begin perform public.journey_share_milestone(jf, 1); exception when insufficient_privilege then n := n + 1; end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', fm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin perform public.journey_share_milestone(jm, 1); exception when invalid_parameter_value then n := n + 1; end;
  begin perform public.journey_share_milestone(jd, 3); exception when invalid_parameter_value then n := n + 1; end;
  perform public.journey_set_visibility(jm, 'private');
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', pr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.journey_share_milestone(jp, 2);
  reset role;
  if n = 4 and (select shared_at is not null from public.journey_milestones where journey_id = jp and position = 2)
     and (select shared_at is null from public.journey_milestones where journey_id = jp and position = 1)
     and (select visibility from public.journeys where id = jm) = 'private' then
    passed := passed + 1; else failed := array_append(failed, 'sharing is for members'); end if;

  -- 8) Pause, resume, happy where we are; finished can't change; paused can't post.
  perform set_config('request.jwt.claims', json_build_object('sub', pr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.journey_set_status(jp, 'paused');
  n := 0;
  begin perform public.journey_post_update(jp, 'cfstream:mangoclip001', 'all_in', null); exception when invalid_parameter_value then n := n + 1; end;
  perform public.journey_set_status(jp, 'active');
  perform public.journey_set_status(jp, 'happy_where_we_are');
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', fm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin perform public.journey_set_status(jm, 'active'); exception when invalid_parameter_value then n := n + 1; end;
  reset role;
  if n = 2 and (select status from public.journeys where id = jp) = 'happy_where_we_are' then
    passed := passed + 1; else failed := array_append(failed, 'status changes'); end if;

  -- 8b) journey_finish: "learned" works from a member's pause; "happy where we are" adds
  --     no skill; an unknown way to finish and a bird that has passed are refused.
  perform set_config('request.jwt.claims', json_build_object('sub', pr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  jh := public.journey_start(bp, 'high-five', null, null, null, 'most_days', 'private', null);
  js := public.journey_start(bp, 'spin', null, null, null, 'most_days', 'private', null);
  jx := public.journey_start(bx, 'recall', null, null, null, 'most_days', 'private', null);
  perform public.journey_set_status(jh, 'paused');
  v := public.journey_finish(jh, 'learned');
  ok := v = 'finished';
  perform public.journey_set_status(js, 'paused');
  v := public.journey_finish(js, 'happy_where_we_are');
  ok := ok and v = 'happy_where_we_are';
  n := 0;
  begin perform public.journey_finish(jp, 'done'); exception when invalid_parameter_value then n := n + 1; end;
  begin perform public.journey_finish(jp, null); exception when invalid_parameter_value then n := n + 1; end;
  reset role;
  update public.birds set passed_at = now() where id = bx;
  perform set_config('request.jwt.claims', json_build_object('sub', pr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin perform public.journey_finish(jx, 'learned'); exception when invalid_parameter_value then n := n + 1; end;
  reset role;
  if ok and n = 3
     and (select status = 'finished' and finished_at is not null and paused_reason is null from public.journeys where id = jh)
     and exists (select 1 from public.bird_skills where bird_id = bp and source = 'journey' and journey_id = jh
                 and template_id = (select id from public.journey_templates where slug = 'high-five'))
     and (select status = 'happy_where_we_are' and finished_at is not null from public.journeys where id = js)
     and not exists (select 1 from public.bird_skills where journey_id = js)
     and (select count(*) from public.bird_skills where bird_id = bp) = 1
     and (select status from public.journeys where id = jx) = 'active'
     and not exists (select 1 from public.bird_skills where bird_id = bx) then
    passed := passed + 1; else failed := array_append(failed, 'finish: learned, happy, refusals'); end if;

  -- 9) Diet conversion: starting weight from the first week after the start
  --    (private.diet_starting_weight, started_at to started_at + 7 days, with no
  --    milestones since 20261125030000); 2.5% is a heads-up, 5% pauses.
  --    (Since 20261108160000 these compare the average of the last 3 weigh-ins;
  --    diet_weight_rules_checks.sql covers the rules in detail.)
  update public.journeys set started_at = now() - interval '20 days' where id = jd;
  insert into public.weight_entries (bird_id, grams, measured_at) values
    (bd, 400, now() - interval '19 days'), (bd, 402, now() - interval '17 days'), (bd, 398, now() - interval '15 days'),
    (bd, 389, now() - interval '2 days'), (bd, 388, now() - interval '1 day');  -- 400 → 388.5 average = 2.9%
  perform set_config('request.jwt.claims', json_build_object('sub', fm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select * into r from public.journey_weight_check(jd);
  ok := r.start_grams = 400 and r.current_grams = 388 and r.level = 'notice' and not r.paused;
  reset role;
  insert into public.weight_entries (bird_id, grams, measured_at) values (bd, 378, now() - interval '12 hours'), (bd, 372, now() - interval '6 hours');  -- 379.3 average = 5.2%
  perform set_config('request.jwt.claims', json_build_object('sub', fm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select * into r from public.journey_weight_check(jd);
  ok := ok and r.level = 'pause' and r.paused;
  reset role;
  if ok and (select status = 'paused' and paused_reason = 'weight_drop' from public.journeys where id = jd) then
    passed := passed + 1; else failed := array_append(failed, 'diet: heads-up at 2.5%, pause at 5%'); end if;

  -- 10) A weight pause lifts only by confirming the vet call (and "learned" is refused
  --     until then); then it measures from the latest weight.
  perform set_config('request.jwt.claims', json_build_object('sub', fm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  n := 0;
  begin perform public.journey_set_status(jd, 'active'); exception when insufficient_privilege then n := n + 1; end;
  begin perform public.journey_finish(jd, 'learned'); exception when insufficient_privilege then n := n + 1; end;
  begin perform public.journey_resume_after_vet(jd, false); exception when invalid_parameter_value then n := n + 1; end;
  reset role;
  ok := (select status = 'paused' and paused_reason = 'weight_drop' from public.journeys where id = jd);
  perform set_config('request.jwt.claims', json_build_object('sub', fm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.journey_resume_after_vet(jd, true);
  select * into r from public.journey_weight_check(jd);
  reset role;
  if n = 3 and ok and (select status from public.journeys where id = jd) = 'active' and r.level = 'none' and r.start_grams = 372 then
    passed := passed + 1; else failed := array_append(failed, 'diet: resume only after confirming the vet call'); end if;

  -- 10b) Diet conversion finishes as "learned" with no known skill added.
  perform set_config('request.jwt.claims', json_build_object('sub', fm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v := public.journey_finish(jd, 'learned');
  reset role;
  if v = 'finished' and (select status = 'finished' and finished_at is not null from public.journeys where id = jd)
     and not exists (select 1 from public.bird_skills where bird_id = bd) then
    passed := passed + 1; else failed := array_append(failed, 'diet: learned adds no skill'); end if;

  -- 11) Thresholds are settings an admin changes; nobody else can.
  perform set_config('request.jwt.claims', json_build_object('sub', fm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  denied := false;
  begin perform public.admin_set_diet_thresholds(10, 5); exception when insufficient_privilege then denied := true; end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.admin_set_diet_thresholds(10, 5);
  ok := false;
  begin perform public.admin_set_diet_thresholds(2, 3); exception when invalid_parameter_value then ok := true; end;
  reset role;
  if denied and ok and (select diet_pause_drop_pct = 10 from public.journey_settings) then
    passed := passed + 1; else failed := array_append(failed, 'diet thresholds are admin settings'); end if;

  -- 12) Other journeys have no weight check.
  perform set_config('request.jwt.claims', json_build_object('sub', fr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select * into r from public.journey_weight_check(jf);
  reset role;
  if r.level = 'none' and r.start_grams is null then passed := passed + 1; else failed := array_append(failed, 'no weight check outside diet'); end if;

  -- 13) Phrasing: every template milestone has an ask and a done line; only admins edit them.
  perform set_config('request.jwt.claims', json_build_object('sub', fm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  denied := false;
  begin perform public.admin_set_journey_milestone_words('recall', 3, 'x', 'y'); exception when insufficient_privilege then denied := true; end;
  reset role;
  if denied and not exists (select 1 from public.journey_template_milestones where ask is null or done_line is null)
     and (select done_line from public.journey_template_milestones m join public.journey_templates t on t.id = m.template_id where t.slug = 'recall' and m.position = 3) = 'flew to you' then
    passed := passed + 1; else failed := array_append(failed, 'phrasing seeded, admin edits'); end if;

  -- 14) Tips: read while journeys are on, nothing when they're off; never about withholding food.
  perform set_config('request.jwt.claims', json_build_object('sub', fr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.journey_tips;
  reset role;
  ok := n = 5;
  update public.journey_settings set audience = 'off';
  perform set_config('request.jwt.claims', json_build_object('sub', fr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.journey_tips;
  reset role;
  update public.journey_settings set audience = 'everyone';
  if ok and n = 0 and not exists (select 1 from public.journey_tips where body ~* '\mwithhold|\mskip (a |the )?meal|\mless food|\mfast(ing)?\M') then
    passed := passed + 1; else failed := array_append(failed, 'tips'); end if;

  -- 15) No direct writes; no public SECURITY DEFINER journey functions.
  perform set_config('request.jwt.claims', json_build_object('sub', fr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  n := 0;
  begin insert into public.journey_updates (journey_id, bird_id, author_id, clip_ref) values (jf, bf, fr, 'cfstream:kiwi00000012');
  exception when insufficient_privilege then n := n + 1; end;
  begin update public.journeys set status = 'active', paused_reason = null where id = jf;
  exception when insufficient_privilege then n := n + 1; end;
  reset role;
  select count(*) into r from pg_proc p join pg_namespace s on s.oid = p.pronamespace
  where s.nspname = 'public' and p.prosecdef and (p.proname like '%journey%' or p.proname like 'admin_set_diet%');
  if n = 2 and r.count = 0 then passed := passed + 1; else failed := array_append(failed, 'no direct writes; invoker wrappers only'); end if;

  raise exception 'JOURNEY UPDATES CHECKS: % passed, % failed%', passed, coalesce(array_length(failed, 1), 0),
    case when array_length(failed, 1) > 0 then ': ' || array_to_string(failed, ', ') else '' end;
end $$;
