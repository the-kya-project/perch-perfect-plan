-- Verification for 20261124190000_journeys_skills_data (backlog 1.20a): every
-- skill can be started by a free account, new journeys get no milestones,
-- custom journeys take a description, journeys end with journey_finish, updates
-- can be a big moment, and the template text is the spec's draft.
--
-- Self-contained; raises at the end so everything rolls back:
--   "JOURNEYS SKILLS DATA CHECKS: n passed, 0 failed" → all good
-- Run by .github/workflows/db-checks.yml on every PR (scripts/db-checks.sh).
do $$
declare
  fr  uuid := gen_random_uuid();  -- free
  fm  uuid := gen_random_uuid();  -- Flock member
  bf  uuid := gen_random_uuid();  -- fr's bird
  bf2 uuid := gen_random_uuid();  -- fr's second bird
  bm  uuid := gen_random_uuid();  -- fm's bird
  passed int := 0; failed text[] := '{}';
  ok boolean; n int; denied boolean; j uuid; j2 uuid; j3 uuid; v text; st text;
  shared constant text[] := array['Keep sessions short.', 'Stop at the first sign of stress.', 'Never withhold food to make a bird hungrier for training.'];
begin
  -- 1) Template text: the spec's draft descriptions, no tips, safety notes as
  --    written (nail trims unchanged), everything still a draft, tiers and
  --    milestone history kept.
  ok := (select purpose from public.journey_templates where slug = 'step-up') = 'Your bird steps onto your hand calmly and by choice, without biting.'
    and (select purpose from public.journey_templates where slug = 'nail-trims') = 'Your bird stays calm while its nails are trimmed, without being wrapped in a towel.'
    and not exists (select 1 from public.journey_templates where cardinality(tips) > 0)
    and not exists (select 1 from public.journey_templates where review_status <> 'draft')
    and not exists (select 1 from public.journey_templates where safety_notes[1:3] <> shared)
    and (select count(*) from public.journey_templates) = 14
    and (select count(*) filter (where tier = 'premium') from public.journey_templates) = 7
    and (select count(*) from public.journey_template_milestones) > 0
    and not exists (
      select 1 from public.journey_templates
      where cardinality(safety_notes) <> case slug
        when 'nail-trims' then 10 when 'wing-touch' then 6 when 'diet-conversion' then 8
        when 'spin' then 4 when 'retrieve' then 4 when 'hang-upside-down' then 4 else 3 end);
  if ok then passed := passed + 1; else failed := array_append(failed, 'template text'); end if;

  -- 2) Diet conversion's five protective lines are its safety notes; the
  --    other tips are gone.
  ok := (select safety_notes[4:8] from public.journey_templates where slug = 'diet-conversion') = array[
      'Watch droppings and appetite as well as weight. If your bird stops eating, put the usual food back and call your vet.',
      'Some birds refuse new food so firmly that they stop eating. If your bird isn''t eating, go back to the usual food today and call your vet.',
      'Weigh in grams at the same time every day. A few grams matter on a bird.',
      'Take uneaten fresh food out after a few hours so it doesn''t spoil.',
      'How much to feed varies from bird to bird, even within a species. Your vet can tell you what''s right for yours.']::text[]
    and (select safety_notes[4] from public.journey_templates where slug = 'nail-trims') like 'Each nail has a blood vessel inside it%';
  if ok then passed := passed + 1; else failed := array_append(failed, 'diet conversion and nail trim safety notes'); end if;

  -- 3) The skill video: set and cleared through the admin function, a bad
  --    reference refused, no video at opening.
  ok := not exists (select 1 from public.journey_templates where video_ref is not null);
  perform public.admin_update_journey_template('recall', '{"video_ref": "cfstream:recallvideo01"}');
  ok := ok and (select video_ref from public.journey_templates where slug = 'recall') = 'cfstream:recallvideo01';
  perform public.admin_update_journey_template('recall', '{"video_ref": null}');
  ok := ok and (select video_ref from public.journey_templates where slug = 'recall') is null;
  denied := false;
  begin perform public.admin_update_journey_template('recall', '{"video_ref": "https://example.com/v.mp4"}');
  exception when check_violation then denied := true; end;
  if ok and denied then passed := passed + 1; else failed := array_append(failed, 'skill video reference'); end if;

  -- Setup: a free account and a Flock member, journeys on for everyone.
  insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  select '00000000-0000-0000-0000-000000000000', u, 'authenticated', 'authenticated', u::text || '@checks.invalid', '{}', '{}', now(), now()
  from unnest(array[fr, fm]) as u;
  insert into public.entitlements (user_id, plan, status, source, starts_at) values
    (fm, 'comp', 'active', 'manual', now() - interval '1 day');
  insert into public.birds (id, owner_id, name, species) values
    (bf, fr, 'Kiwi', 'Cockatiel'), (bf2, fr, 'Pip', 'Budgie'), (bm, fm, 'Echo', 'Amazon');
  insert into public.clip_assets (uid, bird_id) values ('kiwiclip0001', bf), ('kiwiclip0002', bf);
  update public.journey_settings set audience = 'everyone' where id;

  perform set_config('request.jwt.claims', json_build_object('sub', fr, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- 4) A free account can start every one of the 14 skills, Flock-only ones
  --    included, and no journey gets milestone rows.
  n := 0;
  for v in select slug from public.journey_templates order by sort_order loop
    begin
      perform public.journey_start(bf, v, null, null, null, 'most_days', 'private', null);
      n := n + 1;
    exception when others then null;
    end;
  end loop;
  reset role;
  ok := n = 14
    and (select count(*) from public.journeys where bird_id = bf) = 14
    and not exists (select 1 from public.journey_milestones m join public.journeys jj on jj.id = m.journey_id where jj.bird_id = bf);
  if ok then passed := passed + 1; else failed := array_append(failed, 'free account starts all 14 skills, no milestones (' || n || ')'); end if;

  -- 5) Still private only, and one open journey per skill per bird.
  set local role authenticated;
  st := null;
  begin perform public.journey_start(bf2, 'recall', null, null, null, 'most_days', 'community', null);
  exception when others then st := sqlstate; end;
  ok := st = '42501';
  st := null;
  begin perform public.journey_start(bf, 'recall', null, null, null, 'most_days', 'private', null);
  exception when others then st := sqlstate; end;
  ok := ok and st = '23505';
  if ok then passed := passed + 1; else failed := array_append(failed, 'free stays private; one open journey per skill'); end if;

  -- 6) Your own skill: a name and an optional description, no milestones;
  --    still one open at a time on the free plan; a description is refused on
  --    a template journey and over 500 characters.
  j := public.journey_start(bf2, null, 'Bath time', null, null, 'weekends', 'private', null, '  Splashing in a shallow dish.  ');
  reset role;
  ok := (select custom_description from public.journeys where id = j) = 'Splashing in a shallow dish.'
    and not exists (select 1 from public.journey_milestones where journey_id = j);
  set local role authenticated;
  st := null;
  begin perform public.journey_start(bf2, null, 'Shower perch', null, null, 'weekends', 'private', null);
  exception when others then st := sqlstate; end;
  ok := ok and st = '42501';
  st := null;
  begin perform public.journey_start(bf2, 'wave', null, null, null, 'weekends', 'private', null, 'A description');
  exception when others then st := sqlstate; end;
  ok := ok and st = '22023';
  reset role;
  if ok then passed := passed + 1; else failed := array_append(failed, 'your own skill'); end if;

  -- 7) The source journey column only goes on custom journeys; deleting the
  --    source clears it.
  denied := false;
  begin update public.journeys set source_journey_id = j where bird_id = bf and template_id is not null;
  exception when check_violation then denied := true; end;
  insert into public.journeys (bird_id, created_by, custom_name, visibility, rhythm, status, source_journey_id)
  values (bf, fr, 'Copied skill', 'private', 'weekends', 'finished', j) returning id into j2;
  delete from public.journeys where id = j;
  ok := denied and (select source_journey_id from public.journeys where id = j2) is null;
  if ok then passed := passed + 1; else failed := array_append(failed, 'source journey column'); end if;

  -- 8) "[Bird] learned it!" adds the skill; "We're happy where we are" adds
  --    nothing; diet conversion adds no known skill; finishing twice is refused.
  set local role authenticated;
  select id into j from public.journeys where bird_id = bf and template_id = (select id from public.journey_templates where slug = 'step-up');
  v := public.journey_finish(j, 'learned');
  ok := v = 'finished';
  select id into j2 from public.journeys where bird_id = bf and template_id = (select id from public.journey_templates where slug = 'wave');
  v := public.journey_finish(j2, 'happy_where_we_are');
  ok := ok and v = 'happy_where_we_are';
  select id into j3 from public.journeys where bird_id = bf and template_id = (select id from public.journey_templates where slug = 'diet-conversion');
  v := public.journey_finish(j3, 'learned');
  ok := ok and v = 'finished';
  st := null;
  begin perform public.journey_finish(j, 'learned');
  exception when others then st := sqlstate; end;
  ok := ok and st = '22023';
  st := null;
  begin perform public.journey_finish(j2, 'sort of');
  exception when others then st := sqlstate; end;
  reset role;
  ok := ok and st = '22023'
    and exists (select 1 from public.bird_skills where bird_id = bf and name = 'Step up' and source = 'journey' and journey_id = j)
    and not exists (select 1 from public.bird_skills where bird_id = bf and journey_id in (j2, j3))
    and (select status from public.journeys where id = j) = 'finished'
    and (select finished_at from public.journeys where id = j2) is not null;
  if ok then passed := passed + 1; else failed := array_append(failed, 'journey_finish'); end if;

  -- 9) A weight pause blocks "learned" (only the vet confirmation lifts it),
  --    but "We're happy where we are" still ends it.
  select id into j from public.journeys where bird_id = bf and template_id = (select id from public.journey_templates where slug = 'recall');
  update public.journeys set status = 'paused', paused_reason = 'weight_drop', paused_at = now() where id = j;
  set local role authenticated;
  st := null;
  begin perform public.journey_finish(j, 'learned');
  exception when others then st := sqlstate; end;
  ok := st = '42501';
  v := public.journey_finish(j, 'happy_where_we_are');
  reset role;
  ok := ok and v = 'happy_where_we_are' and (select paused_reason from public.journeys where id = j) is null;
  if ok then passed := passed + 1; else failed := array_append(failed, 'weight pause and finishing'); end if;

  -- 10) An update can be a big moment; milestones never finish a journey.
  select id into j from public.journeys where bird_id = bf and template_id = (select id from public.journey_templates where slug = 'spin');
  set local role authenticated;
  j2 := public.journey_post_update(j, 'cfstream:kiwiclip0001', 'all_in', 'Full circle!', true);
  j3 := public.journey_post_update(j, 'cfstream:kiwiclip0002', 'distracted', null);
  st := null;
  begin perform public.journey_reach_milestone(j, 1);
  exception when others then st := sqlstate; end;
  reset role;
  ok := (select is_big_moment from public.journey_updates where id = j2)
    and not (select is_big_moment from public.journey_updates where id = j3)
    and (select milestone_position from public.journey_updates where id = j2) is null
    and st = 'P0002'
    and (select status from public.journeys where id = j) = 'active';
  if ok then passed := passed + 1; else failed := array_append(failed, 'big moment; milestones never finish'); end if;

  -- 11) The old signatures are gone (one journey_start, one journey_post_update).
  ok := (select count(*) from pg_proc p join pg_namespace s on s.oid = p.pronamespace
         where s.nspname in ('public', 'private') and p.proname = 'journey_start') = 2
    and (select count(*) from pg_proc p join pg_namespace s on s.oid = p.pronamespace
         where s.nspname in ('public', 'private') and p.proname = 'journey_post_update') = 2
    and to_regprocedure('public.journey_start(uuid, text, text, text[], integer[], text, text, text, text)') is not null
    and to_regprocedure('public.journey_post_update(uuid, text, text, text, boolean)') is not null
    and to_regprocedure('public.journey_finish(uuid, text)') is not null;
  if ok then passed := passed + 1; else failed := array_append(failed, 'function signatures'); end if;

  raise exception 'JOURNEYS SKILLS DATA CHECKS: % passed, % failed%', passed, coalesce(array_length(failed, 1), 0),
    case when array_length(failed, 1) > 0 then ': ' || array_to_string(failed, ', ') else '' end;
end $$;
