-- Verification for 20261107200000_journeys_core.
--
-- Self-contained and leaves nothing behind: it makes a free user, a premium
-- user, a Flock member, an admin, a household member and a stranger, birds and
-- clips, then checks every access rule, and raises so the whole block rolls
-- back. The exception message IS the result:
--   "JOURNEYS CHECKS: n passed, 0 failed"           → all good
--   "JOURNEYS CHECKS: n passed, k failed: <names>"  → which ones broke
-- Run by .github/workflows/db-checks.yml on every PR (scripts/db-checks.sh).
do $$
declare
  fr  uuid := gen_random_uuid();  -- free
  pr  uuid := gen_random_uuid();  -- app premium
  fm  uuid := gen_random_uuid();  -- Flock member
  adm uuid := gen_random_uuid();  -- admin, no membership
  hh  uuid := gen_random_uuid();  -- household member on fr's bird
  st  uuid := gen_random_uuid();  -- stranger (free, no access to anyone's bird)
  bf  uuid := gen_random_uuid();  -- fr's bird
  bf2 uuid := gen_random_uuid();  -- fr's second bird
  bp  uuid := gen_random_uuid();  -- pr's bird
  bm  uuid := gen_random_uuid();  -- fm's bird
  bd  uuid := gen_random_uuid();  -- fr's bird that has passed
  passed int := 0; failed text[] := '{}';
  ok boolean; n int; denied boolean; j uuid; j2 uuid; v text; r record;
begin
  insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  select '00000000-0000-0000-0000-000000000000', u, 'authenticated', 'authenticated', u::text || '@checks.invalid', '{}', '{}', now(), now()
  from unnest(array[fr, pr, fm, adm, hh, st]) as u;
  insert into public.user_roles (user_id, role) values (adm, 'admin');
  insert into public.entitlements (user_id, plan, status, source, starts_at) values
    (pr, 'app_premium', 'active', 'manual', now() - interval '1 day'),
    (fm, 'comp',        'active', 'manual', now() - interval '1 day');
  insert into public.birds (id, owner_id, name, species) values
    (bf, fr, 'Kiwi', 'Cockatiel'), (bf2, fr, 'Pip', 'Budgie'), (bp, pr, 'Mango', 'Sun conure'),
    (bm, fm, 'Echo', 'Amazon'), (bd, fr, 'Old Blue', 'Budgie');
  update public.birds set passed_at = now() where id = bd;
  insert into public.bird_members (bird_id, user_id, role) values (bf, hh, 'household') on conflict do nothing;
  insert into public.clip_assets (uid, bird_id) values ('kiwiclip0001', bf), ('mangoclip001', bp);

  -- Everything starts with journeys off in the care app.
  update public.journey_settings set audience = 'off';

  -- 1) Off: a non-admin sees no templates, can't start, and journeys_enabled() is false.
  perform set_config('request.jwt.claims', json_build_object('sub', fr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.journey_templates;
  ok := n = 0 and not public.journeys_enabled();
  denied := false;
  begin perform public.journey_start(bf, 'step-up', null, null, null, 'most_days', 'private', null);
  exception when insufficient_privilege then denied := true; end;
  reset role;
  if ok and denied then passed := passed + 1; else failed := array_append(failed, 'off: non-admin gets nothing'); end if;

  -- 2) The flag: admins only, then everyone; only an admin may flip it.
  perform set_config('request.jwt.claims', json_build_object('sub', fr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  denied := false;
  begin perform public.admin_set_journeys('everyone'); exception when insufficient_privilege then denied := true; end;
  reset role;
  update public.journey_settings set audience = 'admins';
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := public.journeys_enabled();
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', fr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := ok and not public.journeys_enabled();
  reset role;
  if denied and ok then passed := passed + 1; else failed := array_append(failed, 'journeys_enabled: admins only, admin flips it'); end if;

  -- From here journeys are on for everyone, so each tier's rules can be checked.
  update public.journey_settings set audience = 'everyone';

  -- 3) Free: all 14 templates are listed (premium ones show, locked).
  perform set_config('request.jwt.claims', json_build_object('sub', fr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.journey_templates;
  select * into r from public.journey_my_access();
  reset role;
  if n = 14 and r.tier = 'free' and not r.can_use_premium and not r.can_share
     and r.max_clip_seconds = 60 and r.max_clips_per_journey = 10 and r.max_open_custom = 1 then
    passed := passed + 1; else failed := array_append(failed, 'free: 14 templates listed, free limits'); end if;

  -- 4) Free: a free template, privately, with "already does" marks and a day-one clip.
  perform set_config('request.jwt.claims', json_build_object('sub', fr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  j := public.journey_start(bf, 'step-up', null, null, array[1, 2], 'few_times_week', 'private', 'cfstream:kiwiclip0001');
  select count(*) into n from public.journey_milestones where journey_id = j and state = 'already';
  ok := n = 2 and (select count(*) from public.journey_milestones where journey_id = j) = 7
    and (select count(*) from public.journey_updates where journey_id = j and is_day_one) = 1;
  reset role;
  if ok then passed := passed + 1; else failed := array_append(failed, 'free: start Step up with already-does and day-one clip'); end if;

  -- 5) Free: a premium template is refused.
  perform set_config('request.jwt.claims', json_build_object('sub', fr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  denied := false;
  begin perform public.journey_start(bf, 'wave', null, null, null, 'most_days', 'private', null);
  exception when insufficient_privilege then denied := true; end;
  reset role;
  if denied then passed := passed + 1; else failed := array_append(failed, 'free: premium template refused'); end if;

  -- 6) Free: sharing with the community is refused.
  perform set_config('request.jwt.claims', json_build_object('sub', fr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  denied := false;
  begin perform public.journey_start(bf, 'recall', null, null, null, 'most_days', 'community', null);
  exception when insufficient_privilege then denied := true; end;
  reset role;
  if denied then passed := passed + 1; else failed := array_append(failed, 'free: community visibility refused'); end if;

  -- 7) Free: one custom journey at a time; a second opens once the first ends.
  perform set_config('request.jwt.claims', json_build_object('sub', fr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  j2 := public.journey_start(bf, null, 'Bath time', array['Near the dish', 'Toes in', 'Splashes'], null, 'weekends', 'private', null);
  denied := false;
  begin perform public.journey_start(bf2, null, 'Shower perch', array['Sees it', 'Steps on', 'Stays'], null, 'weekends', 'private', null);
  exception when insufficient_privilege then denied := true; end;
  reset role;
  update public.journeys set status = 'happy_where_we_are', finished_at = now() where id = j2;
  perform set_config('request.jwt.claims', json_build_object('sub', fr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := false;
  begin perform public.journey_start(bf2, null, 'Shower perch', array['Sees it', 'Steps on', 'Stays'], null, 'weekends', 'private', null); ok := true;
  exception when others then ok := false; end;
  reset role;
  if denied and ok then passed := passed + 1; else failed := array_append(failed, 'free: one custom journey at a time'); end if;

  -- 8) The limit is config: raise free's custom limit and a second open one is allowed.
  update public.journey_limits set max_open_custom = 2 where tier = 'free';
  perform set_config('request.jwt.claims', json_build_object('sub', fr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := false;
  begin perform public.journey_start(bf, null, 'Foot target', array['Looks', 'Lifts', 'Touches'], null, 'weekends', 'private', null); ok := true;
  exception when others then ok := false; end;
  reset role;
  update public.journey_limits set max_open_custom = 1 where tier = 'free';
  if ok then passed := passed + 1; else failed := array_append(failed, 'limits are config values'); end if;

  -- 9) Custom journeys need 3 to 8 milestones and a name.
  perform set_config('request.jwt.claims', json_build_object('sub', pr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  n := 0;
  begin perform public.journey_start(bp, null, 'Too short', array['One', 'Two'], null, 'weekends', 'private', null);
  exception when invalid_parameter_value then n := n + 1; end;
  begin perform public.journey_start(bp, null, 'Too long', array['1','2','3','4','5','6','7','8','9'], null, 'weekends', 'private', null);
  exception when invalid_parameter_value then n := n + 1; end;
  begin perform public.journey_start(bp, null, '  ', array['1','2','3'], null, 'weekends', 'private', null);
  exception when invalid_parameter_value then n := n + 1; end;
  reset role;
  if n = 3 then passed := passed + 1; else failed := array_append(failed, 'custom: 3 to 8 milestones and a name'); end if;

  -- 10) Premium: premium templates, unlimited custom journeys, still private only.
  perform set_config('request.jwt.claims', json_build_object('sub', pr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select * into r from public.journey_my_access();
  ok := r.tier = 'premium' and r.can_use_premium and not r.can_share and r.can_view_community
    and r.max_clip_seconds = 300 and r.max_clips_per_journey = 20 and r.max_open_custom is null;
  begin
    perform public.journey_start(bp, 'wave', null, null, null, 'most_days', 'private', null);
    perform public.journey_start(bp, null, 'A', array['1','2','3'], null, 'weekends', 'private', null);
    perform public.journey_start(bp, null, 'B', array['1','2','3'], null, 'weekends', 'private', null);
  exception when others then ok := false; end;
  denied := false;
  begin perform public.journey_start(bp, 'spin', null, null, null, 'most_days', 'community', null);
  exception when insufficient_privilege then denied := true; end;
  reset role;
  if ok and denied then passed := passed + 1; else failed := array_append(failed, 'premium: every template, unlimited custom, private only'); end if;

  -- 11) Flock member: may share with the community; clips up to 20 minutes, no clip limit.
  perform set_config('request.jwt.claims', json_build_object('sub', fm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select * into r from public.journey_my_access();
  ok := r.tier = 'flock' and r.can_share and r.max_clip_seconds = 1200 and r.max_clips_per_journey is null;
  begin perform public.journey_start(bm, 'spin', null, null, null, 'most_days', 'community', null);
  exception when others then ok := false; end;
  reset role;
  if ok then passed := passed + 1; else failed := array_append(failed, 'flock: shares, 20-minute clips, no clip limit'); end if;

  -- 12) An admin counts as a Flock member before opening day.
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select * into r from public.journey_my_access();
  reset role;
  if r.tier = 'flock' then passed := passed + 1; else failed := array_append(failed, 'admin: flock tier'); end if;

  -- 13) Household: reads and starts journeys on the bird; a stranger can do neither.
  perform set_config('request.jwt.claims', json_build_object('sub', hh, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.journeys where bird_id = bf;
  ok := n >= 2;
  begin perform public.journey_start(bf, 'recall', null, null, null, 'most_days', 'private', null);
  exception when others then ok := false; end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', st, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.journeys;
  n := n + (select count(*) from public.journey_milestones) + (select count(*) from public.journey_updates) + (select count(*) from public.bird_skills);
  denied := false;
  begin perform public.journey_start(bf, 'target-training', null, null, null, 'most_days', 'private', null);
  exception when insufficient_privilege then denied := true; end;
  reset role;
  if ok and n = 0 and denied then passed := passed + 1; else failed := array_append(failed, 'household reads and starts; stranger gets nothing'); end if;

  -- 14) Writes only through the functions: no direct inserts or updates.
  perform set_config('request.jwt.claims', json_build_object('sub', fr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  n := 0;
  begin insert into public.journeys (bird_id, created_by, custom_name, rhythm) values (bf, fr, 'x', 'weekends');
  exception when insufficient_privilege then n := n + 1; end;
  begin update public.journey_milestones set state = 'reached' where journey_id = j;
  exception when insufficient_privilege then n := n + 1; end;
  begin insert into public.bird_skills (bird_id, name, source) values (bf, 'Wave', 'known');
  exception when insufficient_privilege then n := n + 1; end;
  begin update public.journey_limits set max_clip_seconds = 3600;
  exception when insufficient_privilege then n := n + 1; end;
  reset role;
  if n = 4 then passed := passed + 1; else failed := array_append(failed, 'no direct writes'); end if;

  -- 15) Day-one clip must belong to the bird; a passed bird can't start one.
  perform set_config('request.jwt.claims', json_build_object('sub', fr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  denied := false;
  begin perform public.journey_start(bf, 'wing-touch', null, null, null, 'most_days', 'private', 'cfstream:mangoclip001');
  exception when insufficient_privilege then denied := true; end;
  ok := false;
  begin perform public.journey_start(bd, 'recall', null, null, null, 'most_days', 'private', null);
  exception when invalid_parameter_value then ok := true; end;
  reset role;
  if denied and ok then passed := passed + 1; else failed := array_append(failed, 'day-one clip is the bird''s; passed bird refused'); end if;

  -- 16) One open journey per template per bird; all milestones "already" is refused.
  perform set_config('request.jwt.claims', json_build_object('sub', fr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  n := 0;
  begin perform public.journey_start(bf, 'step-up', null, null, null, 'most_days', 'private', null);
  exception when unique_violation then n := n + 1; end;
  begin perform public.journey_start(bf2, 'carrier-comfort', null, null, array[1,2,3,4,5,6,7], 'most_days', 'private', null);
  exception when invalid_parameter_value then n := n + 1; end;
  reset role;
  if n = 2 then passed := passed + 1; else failed := array_append(failed, 'one open per template; something left to work on'); end if;

  -- 17) Clip allowance per tier, and the per-journey count.
  insert into public.journey_updates (journey_id, bird_id, author_id, clip_ref)
  select j, bf, fr, 'cfstream:fill' || lpad(g::text, 8, '0') from generate_series(1, 9) g;  -- 9 + the day-one clip = 10
  perform set_config('request.jwt.claims', json_build_object('sub', fr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select * into r from public.journey_clip_allowance(bf, j);
  ok := r.max_seconds = 60 and r.clips_used = 10 and r.clips_max = 10 and not r.can_add;
  select * into r from public.journey_clip_allowance(bf, null);
  ok := ok and r.can_add and r.max_seconds = 60;
  denied := false;
  begin perform * from public.journey_clip_allowance(bp, null); exception when insufficient_privilege then denied := true; end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', fm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select * into r from public.journey_clip_allowance(bm, null);
  ok := ok and r.max_seconds = 1200 and r.clips_max is null and r.can_add;
  reset role;
  if ok and denied then passed := passed + 1; else failed := array_append(failed, 'clip allowance per tier'); end if;

  -- 18) Known skills: set, narrow, and journey-learned skills stay.
  insert into public.bird_skills (bird_id, name, source, journey_id) values (bf, 'Bath time', 'journey', j2);
  perform set_config('request.jwt.claims', json_build_object('sub', hh, 'role', 'authenticated')::text, true);
  set local role authenticated;
  n := public.bird_set_known_skills(bf, array['wave', 'target-training']);
  ok := n = 3;
  n := public.bird_set_known_skills(bf, array['wave']);
  ok := ok and n = 2 and exists (select 1 from public.bird_skills where bird_id = bf and name = 'Bath time');
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', st, 'role', 'authenticated')::text, true);
  set local role authenticated;
  denied := false;
  begin perform public.bird_set_known_skills(bf, array['spin']); exception when insufficient_privilege then denied := true; end;
  reset role;
  if ok and denied then passed := passed + 1; else failed := array_append(failed, 'known skills'); end if;

  -- 19) Template text: only an admin edits it; new journeys get new wording, old ones keep theirs.
  perform set_config('request.jwt.claims', json_build_object('sub', fr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  denied := false;
  begin perform public.admin_update_journey_template('step-up', '{"purpose": "x"}'); exception when insufficient_privilege then denied := true; end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.admin_update_journey_template('step-up', '{"purpose": "New purpose.", "review_status": "approved"}');
  perform public.admin_set_journey_milestone('step-up', 3, 'New third rung.');
  ok := false;
  begin perform public.admin_update_journey_template('step-up', '{"tier": "free"}');
  exception when invalid_parameter_value then ok := true; end;
  reset role;
  select (select purpose from public.journey_templates where slug = 'step-up') = 'New purpose.'
     and (select title from public.journey_milestones where journey_id = j and position = 3) <> 'New third rung.'
    into v;
  if denied and ok and v::boolean then passed := passed + 1; else failed := array_append(failed, 'admin edits template text'); end if;

  -- 20) The seed: 7 free, 7 premium, the doc's milestone counts, Diet conversion's safeguards.
  select count(*) filter (where tier = 'free') = 7 and count(*) filter (where tier = 'premium') = 7
     and (select count(*) from public.journey_template_milestones m join public.journey_templates t on t.id = m.template_id where t.slug = 'spin') = 5
     and (select count(*) from public.journey_template_milestones m join public.journey_templates t on t.id = m.template_id where t.slug = 'step-up') = 7
     and (select array_length(safeguards, 1) from public.journey_templates where slug = 'diet-conversion') = 4
     and bool_and(array_length(safety_notes, 1) = 3)
    into ok from public.journey_templates;
  if ok then passed := passed + 1; else failed := array_append(failed, 'seed matches the doc'); end if;

  -- 21) The public admin functions are invoker wrappers (privileged bodies live in private).
  select count(*) into n from pg_proc p join pg_namespace s on s.oid = p.pronamespace
  where s.nspname = 'public' and p.prosecdef
    and p.proname in ('admin_set_journeys', 'admin_update_journey_template', 'admin_set_journey_milestone',
                      'journey_my_access', 'journey_clip_allowance', 'journey_start', 'bird_set_known_skills', 'journeys_enabled');
  if n = 0 then passed := passed + 1; else failed := array_append(failed, 'no public security definer journey functions'); end if;

  raise exception 'JOURNEYS CHECKS: % passed, % failed%', passed, coalesce(array_length(failed, 1), 0),
    case when array_length(failed, 1) > 0 then ': ' || array_to_string(failed, ', ') else '' end;
end $$;
