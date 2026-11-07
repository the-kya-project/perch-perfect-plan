-- Verification for 20261107180000_flock_profiles.
--
-- Self-contained and leaves nothing behind: it makes members, a non-member,
-- birds and choices, checks who can read and write what, then raises so the
-- whole block rolls back. The exception message IS the result:
--   "FLOCK PROFILES CHECKS: n passed, 0 failed"           → all good
--   "FLOCK PROFILES CHECKS: n passed, k failed: <names>"  → which ones broke
-- Run by .github/workflows/db-checks.yml on every PR (scripts/db-checks.sh).
do $$
declare
  m1  uuid := gen_random_uuid();  -- member, great-lakes
  m2  uuid := gen_random_uuid();  -- member, great-lakes
  m3  uuid := gen_random_uuid();  -- member, texas
  out uuid := gen_random_uuid();  -- signed in, not a member
  adm uuid := gen_random_uuid();  -- admin, not a member
  b1 uuid := gen_random_uuid();   -- m1's bird, shown
  b2 uuid := gen_random_uuid();   -- m1's bird, hidden
  b3 uuid := gen_random_uuid();   -- m2's bird, shown
  bo uuid := gen_random_uuid();   -- the non-member's bird
  passed int := 0; failed text[] := '{}';
  ok boolean; n int; denied boolean;
  cols text[];
begin
  insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  select '00000000-0000-0000-0000-000000000000', u, 'authenticated', 'authenticated', u::text || '@checks.invalid', '{}', '{}', now(), now()
  from unnest(array[m1, m2, m3, out, adm]) as u;
  insert into public.user_roles (user_id, role) values (adm, 'admin');
  insert into public.entitlements (user_id, plan, status, source, starts_at)
  select u, 'comp', 'active', 'manual', now() - interval '1 day' from unnest(array[m1, m2, m3]) as u;

  insert into public.birds (id, owner_id, name, species, notes, photo_url) values
    (b1, m1, 'Kiwi',  'Cockatiel',  'secret care note', m1::text || '/kiwi.jpg'),
    (b2, m1, 'Mango', 'Sun conure', 'secret care note', null),
    (b3, m2, 'Echo',  'Budgie',     'secret care note', null),
    (bo, out, 'Pip',  'Lovebird',   'secret care note', null);
  insert into public.flock_profiles (user_id, display_name, region_slug, setup_completed_at) values
    (m1, 'Ada L.', 'great-lakes', now()),
    (m2, 'Ben M.', 'great-lakes', now()),
    (m3, 'Cy T.',  'texas', now()),
    (out, 'Out S.', 'great-lakes', now());  -- a leftover profile from someone without access
  insert into public.flock_shown_birds (bird_id, user_id, shown) values (b1, m1, true), (b2, m1, false), (b3, m2, true);

  -- 1) A non-member can't read profiles or shown birds, directly or by function.
  perform set_config('request.jwt.claims', json_build_object('sub', out, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.flock_profiles where user_id <> out;
  n := n + (select count(*) from public.flock_shown_birds);
  denied := false;
  begin perform * from public.flock_visible_birds(); exception when insufficient_privilege then denied := true; end;
  ok := denied;
  denied := false;
  begin perform * from public.flock_member_profile(m1); exception when insufficient_privilege then denied := true; end;
  ok := ok and denied;
  denied := false;
  begin perform * from public.flock_chapter_members('great-lakes'); exception when insufficient_privilege then denied := true; end;
  ok := ok and denied;
  reset role;
  if n = 0 and ok then passed := passed + 1; else failed := array_append(failed, 'non-member reads nothing'); end if;

  -- 2) A member sees shown birds only: hidden ones never appear.
  perform set_config('request.jwt.claims', json_build_object('sub', m3, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select array_agg(name order by name) into cols from public.flock_visible_birds();
  reset role;
  if cols = array['Echo', 'Kiwi'] then passed := passed + 1; else failed := array_append(failed, 'only shown birds: ' || coalesce(array_to_string(cols, ','), 'none')); end if;

  -- 3) ...not even in a chapter's member list, and a non-member's birds never.
  perform set_config('request.jwt.claims', json_build_object('sub', m3, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select array_agg(array_to_string(bird_names, '+') order by display_name) into cols from public.flock_chapter_members('great-lakes');
  select member_count into n from public.flock_chapter('great-lakes');
  reset role;
  if cols = array['Kiwi', 'Echo'] and n = 2 then passed := passed + 1; else failed := array_append(failed, 'chapter lists members and shown birds: ' || coalesce(array_to_string(cols, ','), 'none') || ' n=' || coalesce(n, -1)); end if;

  -- 4) Hiding a bird hides it at once.
  update public.flock_shown_birds set shown = false where bird_id = b1;
  perform set_config('request.jwt.claims', json_build_object('sub', m3, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.flock_visible_birds(null, array[b1]);
  reset role;
  update public.flock_shown_birds set shown = true where bird_id = b1;
  if n = 0 then passed := passed + 1; else failed := array_append(failed, 'hide takes effect'); end if;

  -- 5) A member can't edit someone else's profile.
  perform set_config('request.jwt.claims', json_build_object('sub', m3, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update public.flock_profiles set bio = 'hacked' where user_id = m1;
  get diagnostics n = row_count;
  reset role;
  if n = 0 and (select bio from public.flock_profiles where user_id = m1) is null
  then passed := passed + 1; else failed := array_append(failed, 'cannot edit another profile'); end if;

  -- 6) ...nor add someone else's bird, nor change another member's choices.
  denied := false;
  perform set_config('request.jwt.claims', json_build_object('sub', m3, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    insert into public.flock_shown_birds (bird_id, user_id, shown) values (b3, m3, true);
  exception when insufficient_privilege then denied := true;
  end;
  update public.flock_shown_birds set shown = false where bird_id = b3;
  get diagnostics n = row_count;
  reset role;
  if denied and n = 0 and (select shown from public.flock_shown_birds where bird_id = b3)
  then passed := passed + 1; else failed := array_append(failed, 'cannot add or change others birds'); end if;

  -- 7) A non-member can't add even their own bird.
  denied := false;
  perform set_config('request.jwt.claims', json_build_object('sub', out, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    insert into public.flock_shown_birds (bird_id, user_id, shown) values (bo, out, true);
  exception when insufficient_privilege then denied := true;
  end;
  reset role;
  if denied then passed := passed + 1; else failed := array_append(failed, 'non-member cannot show birds'); end if;

  -- 8) A member can edit their own profile and choices.
  perform set_config('request.jwt.claims', json_build_object('sub', m1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update public.flock_profiles set bio = 'Two birds, one opinionated.', region_slug = 'texas' where user_id = m1;
  update public.flock_shown_birds set shown = true where bird_id = b2;
  reset role;
  if (select region_slug from public.flock_profiles where user_id = m1) = 'texas'
     and (select shown from public.flock_shown_birds where bird_id = b2)
  then passed := passed + 1; else failed := array_append(failed, 'member edits own'); end if;

  -- 9) Changing region moves you between chapters at once.
  perform set_config('request.jwt.claims', json_build_object('sub', m2, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := (select member_count from public.flock_chapter('texas')) = 2
    and (select member_count from public.flock_chapter('great-lakes')) = 1;
  reset role;
  if ok then passed := passed + 1; else failed := array_append(failed, 'region change moves chapter'); end if;

  -- 10) The new functions return only the allowed fields: no care columns.
  select array_agg(distinct x) into cols from (
    select unnest(p.proargnames) as x
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname = 'public'
      and p.proname in ('flock_visible_birds', 'flock_member_profile', 'flock_chapter', 'flock_chapter_members', 'flock_my_setup')
  ) s;
  if not (cols && array['notes', 'medications', 'medical_conditions', 'normal_weight', 'microchip', 'band_number', 'photo_url', 'email', 'address', 'grams', 'sitter_email', 'owner_phone'])
  then passed := passed + 1; else failed := array_append(failed, 'care fields exposed: ' || array_to_string(cols, ',')); end if;

  -- 11) A member can't read care tables of another member's shown bird directly.
  perform set_config('request.jwt.claims', json_build_object('sub', m3, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.birds where id in (b1, b3);
  reset role;
  if n = 0 then passed := passed + 1; else failed := array_append(failed, 'birds table stays private'); end if;

  -- 12) An admin who isn't a member can use the Flock: read others, keep their own profile.
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into public.flock_profiles (user_id, display_name, region_slug, setup_completed_at) values (adm, 'Admin A.', 'great-lakes', now());
  update public.flock_profiles set bio = 'admin' where user_id = adm;
  select count(*) into n from public.flock_member_profile(m2);
  ok := n = 1 and (select count(*) from public.flock_profiles where user_id = m1) = 1;
  reset role;
  if ok then passed := passed + 1; else failed := array_append(failed, 'admin can use the flock'); end if;

  -- 13) Profiles of people without access never show, even with a profile row.
  perform set_config('request.jwt.claims', json_build_object('sub', m3, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.flock_member_profile(out);
  n := n + (select count(*) from public.flock_chapter_members('great-lakes') where user_id = out);
  reset role;
  if n = 0 then passed := passed + 1; else failed := array_append(failed, 'no-access profiles hidden'); end if;

  -- 14) Founder badge comes from a real claim.
  insert into public.founding_claims (user_id, spot_number, region_slug)
  values (m2, (select coalesce(max(spot_number), 0) + 1 from public.founding_claims), 'great-lakes');
  perform set_config('request.jwt.claims', json_build_object('sub', m3, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := (select is_founder from public.flock_member_profile(m2)) and not (select is_founder from public.flock_member_profile(m3));
  reset role;
  if ok then passed := passed + 1; else failed := array_append(failed, 'founder badge'); end if;

  -- 15) Setup prefills: claim region and spot for a founder.
  perform set_config('request.jwt.claims', json_build_object('sub', m2, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := (select suggested_region = 'great-lakes' and founding_spot is not null from public.flock_my_setup());
  reset role;
  if ok then passed := passed + 1; else failed := array_append(failed, 'setup prefill'); end if;

  -- 16) Profile photos must live in the member's own folder.
  denied := false;
  begin
    update public.flock_profiles set photo_path = m2::text || '/x.jpg' where user_id = m1;
  exception when check_violation then denied := true;
  end;
  if denied then passed := passed + 1; else failed := array_append(failed, 'photo path in own folder'); end if;

  -- 17) The avatar bucket is private, with size and type limits.
  select not public and file_size_limit <= 2097152 and allowed_mime_types <@ array['image/jpeg', 'image/png', 'image/webp']
  into ok from storage.buckets where id = 'flock-avatars';
  if ok then passed := passed + 1; else failed := array_append(failed, 'avatar bucket private and limited'); end if;

  raise exception 'FLOCK PROFILES CHECKS: % passed, % failed%', passed, coalesce(array_length(failed, 1), 0),
    case when array_length(failed, 1) > 0 then ': ' || array_to_string(failed, ', ') else '' end;
end $$;
