-- Verification for 20261108120000_flock_todays_idea.
--
-- Self-contained and leaves nothing behind: an admin, six Flock members with a
-- bird each, a free user; ideas on today, past days and no day. Checks who sees
-- what, that drafts never reach members, the favorite fallback, answers, the
-- tally's 5-answer floor, photos and the admin schedule, then rolls back.
--   "FLOCK TODAYS IDEA CHECKS: n passed, 0 failed"           → all good
--   "FLOCK TODAYS IDEA CHECKS: n passed, k failed: <names>"  → which ones broke
-- Run by .github/workflows/db-checks.yml on every PR (scripts/db-checks.sh).
do $$
declare
  ad  uuid := gen_random_uuid();
  fr  uuid := gen_random_uuid();
  m   uuid[] := array[gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid()];
  b   uuid[] := array[gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid()];
  v_today date := private.flock_today();
  i_today uuid; i_fav uuid; i_old uuid; i_new uuid; ph text;
  passed int := 0; failed text[] := '{}';
  ok boolean; n int; denied boolean; r record;
begin
  insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  select '00000000-0000-0000-0000-000000000000', x, 'authenticated', 'authenticated', x::text || '@checks.invalid', '{}', '{}', now(), now()
  from unnest(array[ad, fr] || m) as x;
  insert into public.entitlements (user_id, plan, status, source, starts_at)
  select x, 'comp', 'active', 'manual', now() - interval '1 day' from unnest(m) as x;
  insert into public.user_roles (user_id, role) values (ad, 'admin');
  insert into public.birds (id, owner_id, name, species)
  select b[k], m[k], 'Bird ' || k, (array['Sun conure', 'Sun conure', 'Caique', 'Caique', 'Cockatiel', 'African grey'])[k] from generate_series(1, 6) k;
  -- Start from a clean slate of ideas (the seeded drafts come back on rollback).
  delete from public.flock_ideas;
  insert into public.flock_ideas (title, category, body, status, scheduled_on) values ('Wrap a treat in a paper cup', 'enrichment', 'Fold a cup around a treat.', 'draft', v_today) returning id into i_today;
  insert into public.flock_ideas (title, category, body, status, scheduled_on, is_favorite) values ('Muffin tin foraging', 'enrichment', 'Treats under paper.', 'ready', v_today - 10, true) returning id into i_fav;
  insert into public.flock_ideas (title, category, body, status, scheduled_on) values ('Wave', 'training', 'Reward a lifted foot.', 'ready', v_today - 3) returning id into i_old;

  -- 1) Non-members get nothing; only admins schedule.
  ok := true;
  perform set_config('request.jwt.claims', json_build_object('sub', fr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  denied := false; begin perform * from public.flock_todays_idea(); exception when insufficient_privilege then denied := true; end; ok := ok and denied;
  denied := false; begin perform public.flock_idea_try(i_today, 'loved', null, null); exception when insufficient_privilege then denied := true; end; ok := ok and denied;
  denied := false; begin perform * from public.flock_idea_media_refs(i_today); exception when insufficient_privilege then denied := true; end; ok := ok and denied;
  denied := false; begin perform 1 from public.flock_ideas; exception when insufficient_privilege then denied := true; end; ok := ok and denied;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', m[1], 'role', 'authenticated')::text, true);
  set local role authenticated;
  denied := false; begin perform * from public.admin_ideas_schedule(null, 14); exception when insufficient_privilege then denied := true; end; ok := ok and denied;
  denied := false; begin perform public.admin_save_idea(null, 'Mine', 'enrichment', 'x', null, 'ready', false, null); exception when insufficient_privilege then denied := true; end; ok := ok and denied;
  denied := false; begin perform 1 from public.flock_idea_tries; exception when insufficient_privilege then denied := true; end; ok := ok and denied;
  reset role;
  if ok then passed := passed + 1; else failed := array_append(failed, 'members only; admins schedule'); end if;

  -- 2) A draft never reaches members: today's draft is skipped for the favorite.
  perform set_config('request.jwt.claims', json_build_object('sub', m[1], 'role', 'authenticated')::text, true);
  set local role authenticated;
  select * into r from public.flock_todays_idea();
  ok := r.idea_id = i_fav and r.is_reused and r.title = 'Muffin tin foraging';
  denied := false; begin perform public.flock_idea_try(i_today, 'loved', b[1], null); exception when no_data_found then denied := true; end; ok := ok and denied;
  reset role;
  if ok then passed := passed + 1; else failed := array_append(failed, 'drafts never show; an empty day reuses a favorite'); end if;

  -- 3) Ready today shows today's idea; no favorites and nothing ready shows nothing.
  update public.flock_ideas set status = 'ready' where id = i_today;
  perform set_config('request.jwt.claims', json_build_object('sub', m[1], 'role', 'authenticated')::text, true);
  set local role authenticated;
  select * into r from public.flock_todays_idea();
  ok := r.idea_id = i_today and not r.is_reused and r.category = 'enrichment';
  reset role;
  update public.flock_ideas set status = 'draft' where id = i_today;
  update public.flock_ideas set is_favorite = false where id = i_fav;
  perform set_config('request.jwt.claims', json_build_object('sub', m[1], 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := ok and not exists (select 1 from public.flock_todays_idea());
  reset role;
  update public.flock_ideas set status = 'ready' where id = i_today;
  update public.flock_ideas set is_favorite = true where id = i_fav;
  if ok then passed := passed + 1; else failed := array_append(failed, 'ready today shows; nothing ready shows nothing'); end if;

  -- 4) We tried it: once a day per member (changing the answer updates it),
  --    only for your own bird, only today's idea.
  perform set_config('request.jwt.claims', json_build_object('sub', m[1], 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.flock_idea_try(i_today, 'curious', b[1], null);
  perform public.flock_idea_try(i_today, 'loved', b[1], null);
  denied := false; begin perform public.flock_idea_try(i_today, 'loved', b[2], null); exception when insufficient_privilege then denied := true; end;
  ok := denied;
  denied := false; begin perform public.flock_idea_try(i_old, 'loved', b[1], null); exception when no_data_found then denied := true; end;
  ok := ok and denied and (select my_outcome from public.flock_todays_idea()) = 'loved' and (select my_bird_id from public.flock_todays_idea()) = b[1];
  reset role;
  ok := ok and (select count(*) from public.flock_idea_tries where user_id = m[1]) = 1;
  if ok then passed := passed + 1; else failed := array_append(failed, 'one answer a day, your own bird, today''s idea'); end if;

  -- 5) The tally stays hidden under 5 answers, then shows how many, % loved,
  --    and species loved by 2+.
  for n in 2..4 loop
    perform set_config('request.jwt.claims', json_build_object('sub', m[n], 'role', 'authenticated')::text, true);
    set local role authenticated;
    perform public.flock_idea_try(i_today, case when n = 4 then 'curious' else 'loved' end, b[n], null);
    reset role;
  end loop;
  perform set_config('request.jwt.claims', json_build_object('sub', m[1], 'role', 'authenticated')::text, true);
  set local role authenticated;
  select * into r from public.flock_todays_idea();
  ok := r.tried is null and r.loved_pct is null and r.top_species is null;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', m[5], 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.flock_idea_try(i_today, 'not_for', b[5], null);
  select * into r from public.flock_todays_idea();
  -- 5 answers: loved by Sun conure x2 and Caique x1 → 60% loved; only Sun conure has 2+.
  ok := ok and r.tried = 5 and r.loved_pct = 60 and r.top_species = array['Sun conure'];
  reset role;
  if ok then passed := passed + 1; else failed := array_append(failed, 'tally hidden under 5, then counts'); end if;

  -- 6) Photos: only your own upload; everyone's photos come back only for
  --    today's idea, with the bird's name and outcome (no member names).
  ph := m[6]::text || '/' || gen_random_uuid()::text || '.jpg';
  insert into storage.objects (bucket_id, name) values ('flock-posts', ph);
  perform set_config('request.jwt.claims', json_build_object('sub', m[1], 'role', 'authenticated')::text, true);
  set local role authenticated;
  denied := false; begin perform public.flock_idea_try(i_today, 'loved', b[1], ph); exception when invalid_parameter_value then denied := true; end;
  ok := denied;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', m[6], 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.flock_idea_try(i_today, 'loved', b[6], ph);
  ok := ok and (select count(*) from public.flock_idea_media_refs(i_today) where kind = 'try' and path = ph and bird_name = 'Bird 6' and outcome = 'loved') = 1
           and (select photo_count from public.flock_todays_idea()) = 1;
  denied := false; begin perform * from public.flock_idea_media_refs(i_old); exception when no_data_found then denied := true; end;
  ok := ok and denied;
  reset role;
  if ok then passed := passed + 1; else failed := array_append(failed, 'photos: your own, today only'); end if;

  -- 7) Admin schedule: two weeks with drafts and gaps flagged, swap days, new
  --    ideas, and one idea per day.
  perform set_config('request.jwt.claims', json_build_object('sub', ad, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := (select count(*) from public.admin_ideas_schedule(null, 14)) = 14
    and exists (select 1 from public.admin_ideas_schedule(null, 14) where day = v_today and idea_id = i_today and status = 'ready')
    and exists (select 1 from public.admin_ideas_schedule(null, 14) where day = v_today + 1 and idea_id is null and reused_idea_id = i_fav and reused_title = 'Muffin tin foraging');
  i_new := public.admin_save_idea(null, 'Five-minute target session', 'training', 'Reward each touch.', null, 'draft', false, v_today + 1);
  perform public.admin_swap_idea_days(v_today, v_today + 1);
  ok := ok and exists (select 1 from public.admin_ideas_schedule(null, 14) where day = v_today and idea_id = i_new and status = 'draft')
           and exists (select 1 from public.admin_ideas_schedule(null, 14) where day = v_today + 1 and idea_id = i_today);
  denied := false; begin perform public.admin_save_idea(null, 'Clash', 'project', 'x', null, 'ready', false, v_today); exception when unique_violation then denied := true; end;
  ok := ok and denied and exists (select 1 from public.admin_ideas_unscheduled() where idea_id = i_old);
  reset role;
  -- Today's slot now holds a draft: members get the favorite, not the draft.
  perform set_config('request.jwt.claims', json_build_object('sub', m[2], 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := ok and (select idea_id from public.flock_todays_idea()) = i_fav;
  reset role;
  if ok then passed := passed + 1; else failed := array_append(failed, 'admin schedule'); end if;

  raise exception 'FLOCK TODAYS IDEA CHECKS: % passed, % failed%', passed, coalesce(array_length(failed, 1), 0),
    case when array_length(failed, 1) > 0 then ': ' || array_to_string(failed, ', ') else '' end;
end $$;
