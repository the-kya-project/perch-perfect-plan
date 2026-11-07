-- Verification for 20261107220000_journeys_updates.
--
-- Self-contained and leaves nothing behind: makes a free user, a premium user,
-- a Flock member, an admin and a stranger, birds, clips, journeys and weights,
-- checks posting, milestones, finishing, tips, sharing, status and Diet
-- conversion's weight safeguard, then raises so everything rolls back.
--   "JOURNEY UPDATES CHECKS: n passed, 0 failed"           → all good
--   "JOURNEY UPDATES CHECKS: n passed, k failed: <names>"  → which ones broke
-- Run by .github/workflows/db-checks.yml on every PR (scripts/db-checks.sh).
do $$
declare
  fr  uuid := gen_random_uuid();  -- free
  pr  uuid := gen_random_uuid();  -- app premium
  fm  uuid := gen_random_uuid();  -- Flock member
  adm uuid := gen_random_uuid();  -- admin
  st  uuid := gen_random_uuid();  -- stranger
  bf  uuid := gen_random_uuid();  -- fr's bird
  bp  uuid := gen_random_uuid();  -- pr's bird
  bm  uuid := gen_random_uuid();  -- fm's bird
  bd  uuid := gen_random_uuid();  -- fm's bird on a diet
  jf uuid; jp uuid; jm uuid; jd uuid; jc uuid;
  passed int := 0; failed text[] := '{}';
  ok boolean; n int; denied boolean; u uuid; r record;
begin
  insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  select '00000000-0000-0000-0000-000000000000', x, 'authenticated', 'authenticated', x::text || '@checks.invalid', '{}', '{}', now(), now()
  from unnest(array[fr, pr, fm, adm, st]) as x;
  insert into public.user_roles (user_id, role) values (adm, 'admin');
  insert into public.entitlements (user_id, plan, status, source, starts_at) values
    (pr, 'app_premium', 'active', 'manual', now() - interval '1 day'),
    (fm, 'comp',        'active', 'manual', now() - interval '1 day');
  insert into public.birds (id, owner_id, name, species) values
    (bf, fr, 'Kiwi', 'Cockatiel'), (bp, pr, 'Mango', 'Sun conure'), (bm, fm, 'Echo', 'Amazon'), (bd, fm, 'Juno', 'Amazon');
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

  -- 1) Post an update: clip, engagement, caption; a "?" makes it a Question; it records the milestone being worked on.
  perform set_config('request.jwt.claims', json_build_object('sub', fr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  u := public.journey_post_update(jf, 'cfstream:kiwi00000001', 'all_in', 'Three seconds on my hand! Almonds or walnuts?');
  select * into r from public.journey_updates where id = u;
  reset role;
  if r.is_question and r.engagement = 'all_in' and r.milestone_position = 2 and r.author_id = fr then
    passed := passed + 1; else failed := array_append(failed, 'post an update'); end if;

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

  -- 4) Reaching milestones; the last one finishes the journey and adds the skill.
  perform set_config('request.jwt.claims', json_build_object('sub', fm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select * into r from public.journey_reach_milestone(jm, 1);
  ok := not r.finished and r.done = 1 and r.total = 3;
  perform public.journey_reach_milestone(jm, 2);
  select * into r from public.journey_reach_milestone(jm, 3);
  ok := ok and r.finished and r.done = 3;
  reset role;
  if ok and (select status from public.journeys where id = jm) = 'finished'
     and exists (select 1 from public.bird_skills where bird_id = bm and name = 'Bath time' and source = 'journey' and journey_id = jm) then
    passed := passed + 1; else failed := array_append(failed, 'milestones and finishing'); end if;

  -- 5) A finished journey takes no more posts or milestones; a finisher tip saves only once it's finished.
  perform set_config('request.jwt.claims', json_build_object('sub', fm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  n := 0;
  begin perform public.journey_post_update(jm, 'cfstream:echoclip0001', 'all_in', null); exception when invalid_parameter_value then n := n + 1; end;
  begin perform public.journey_save_finisher_tip(jd, 'Too early'); exception when invalid_parameter_value then n := n + 1; end;
  perform public.journey_save_finisher_tip(jm, 'Warm water and a favorite toy did it.');
  reset role;
  if n = 2 and exists (select 1 from public.journey_finisher_tips where journey_id = jm) then
    passed := passed + 1; else failed := array_append(failed, 'finished: no more posts; tip after finish'); end if;

  -- 6) Finisher tips: app premium and members read them; free accounts get none; no direct reads.
  insert into public.journey_finisher_tips (journey_id, template_id, author_id, body)
  values (jp, (select id from public.journey_templates where slug = 'wave'), pr, 'Keep the treat hand low.');
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
  if ok and n = 0 then passed := passed + 1; else failed := array_append(failed, 'finisher tips: premium and members only'); end if;

  -- 7) Sharing a milestone and community visibility are for Flock members.
  perform set_config('request.jwt.claims', json_build_object('sub', fr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  n := 0;
  begin perform public.journey_set_visibility(jf, 'community'); exception when insufficient_privilege then n := n + 1; end;
  begin perform public.journey_share_milestone(jf, 1); exception when insufficient_privilege then n := n + 1; end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', fm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.journey_share_milestone(jm, 2);
  begin perform public.journey_share_milestone(jd, 3); exception when invalid_parameter_value then n := n + 1; end;
  perform public.journey_set_visibility(jm, 'private');
  reset role;
  if n = 3 and (select shared_at is not null from public.journey_milestones where journey_id = jm and position = 2)
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

  -- 9) Diet conversion: starting weight from milestone 1's week; 2.5% is a heads-up, 5% pauses.
  update public.journeys set started_at = now() - interval '20 days' where id = jd;
  insert into public.weight_entries (bird_id, grams, measured_at) values
    (bd, 400, now() - interval '19 days'), (bd, 402, now() - interval '17 days'), (bd, 398, now() - interval '15 days'),
    (bd, 389, now() - interval '5 days');  -- 400 → 389 = 2.75%
  perform set_config('request.jwt.claims', json_build_object('sub', fm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select * into r from public.journey_weight_check(jd);
  ok := r.start_grams = 400 and r.current_grams = 389 and r.level = 'notice' and not r.paused;
  reset role;
  insert into public.weight_entries (bird_id, grams, measured_at) values (bd, 378, now() - interval '1 day');  -- 5.5%
  perform set_config('request.jwt.claims', json_build_object('sub', fm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select * into r from public.journey_weight_check(jd);
  ok := ok and r.level = 'pause' and r.paused;
  reset role;
  if ok and (select status = 'paused' and paused_reason = 'weight_drop' from public.journeys where id = jd) then
    passed := passed + 1; else failed := array_append(failed, 'diet: heads-up at 2.5%, pause at 5%'); end if;

  -- 10) A weight pause lifts only by confirming the vet call; then it measures from the latest weight.
  perform set_config('request.jwt.claims', json_build_object('sub', fm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  n := 0;
  begin perform public.journey_set_status(jd, 'active'); exception when insufficient_privilege then n := n + 1; end;
  begin perform public.journey_resume_after_vet(jd, false); exception when invalid_parameter_value then n := n + 1; end;
  perform public.journey_resume_after_vet(jd, true);
  select * into r from public.journey_weight_check(jd);
  reset role;
  if n = 2 and (select status from public.journeys where id = jd) = 'active' and r.level = 'none' and r.start_grams = 378 then
    passed := passed + 1; else failed := array_append(failed, 'diet: resume only after confirming the vet call'); end if;

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
