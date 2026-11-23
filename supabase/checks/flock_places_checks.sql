-- Verification for 20261123140000_flock_chapter_places (backlog 1.6).
--
-- Self-contained and leaves nothing behind: an admin; a Great Lakes chapter
-- lead (ld); Flock members in Great Lakes (m1, m2) and Texas (m4); a member
-- with no chapter yet (m5); a free user. Checks who sees listings and
-- suggestions, who may add, edit, reorder and remove them, the review, and
-- that app users can't touch the table, then rolls back.
--   "FLOCK PLACES CHECKS: n passed, 0 failed"           → all good
--   "FLOCK PLACES CHECKS: n passed, k failed: <names>"  → which ones broke
-- Run by .github/workflows/db-checks.yml on every PR (scripts/db-checks.sh).
do $$
declare
  ad uuid := gen_random_uuid();
  ld uuid := gen_random_uuid();
  m1 uuid := gen_random_uuid();
  m2 uuid := gen_random_uuid();
  m4 uuid := gen_random_uuid();
  m5 uuid := gen_random_uuid();
  fr uuid := gen_random_uuid();
  p_vet1 uuid; p_vet2 uuid; p_vet3 uuid; p_res uuid; p_tx uuid; s1 uuid; s2 uuid; s_tx uuid;
  passed int := 0; failed text[] := '{}';
  ok boolean; n int; denied boolean; msg text; names text[];
begin
  insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  select '00000000-0000-0000-0000-000000000000', x, 'authenticated', 'authenticated', x::text || '@checks.invalid', '{}', '{}', now(), now()
  from unnest(array[ad, ld, m1, m2, m4, m5, fr]) as x;
  insert into public.entitlements (user_id, plan, status, source, starts_at)
  select x, 'comp', 'active', 'manual', now() - interval '1 day' from unnest(array[ld, m1, m2, m4, m5]) as x;
  insert into public.user_roles (user_id, role) values (ad, 'admin');
  insert into public.flock_profiles (user_id, display_name, region_slug, setup_completed_at) values
    (ad, 'Brittany K.', 'texas', now()), (ld, 'Lee D.', 'great-lakes', now()), (m1, 'Priya S.', 'great-lakes', now()),
    (m2, 'Alex R.', 'great-lakes', now()), (m4, 'Jo K.', 'texas', now()), (m5, 'Max P.', 'other', now());
  insert into public.flock_chapter_leads (user_id, region_slug) values (ld, 'great-lakes');

  -- An admin (whose own chapter is Texas) fills Great Lakes and Texas.
  perform set_config('request.jwt.claims', json_build_object('sub', ad, 'role', 'authenticated')::text, true);
  set local role authenticated;
  p_vet1 := public.flock_place_save(null, 'great-lakes', 'vet', 'Lakeshore Bird & Exotic Clinic', 'Fort Wayne, IN', '(260) 555-0100', 'lakeshorebirds.example.com', 'Sees macaws and greys. Open Saturdays.');
  p_res := public.flock_place_save(null, 'great-lakes', 'rescue', 'Birds and Beaks', 'Indiana', null, 'https://birdsandbeaks.example.org', 'Adoptions, fostering, and great advice.');
  p_vet2 := public.flock_place_save(null, 'great-lakes', 'vet', 'Northside Avian', 'Grand Rapids, MI', null, null, 'Calm with nervous birds.');
  p_tx := public.flock_place_save(null, 'texas', 'shop', 'Houston Bird Supply', 'Houston, TX', null, null, null);
  reset role;

  -- 1) Free users and signed-out visitors get nothing, and app users can't
  --    read or write the table directly.
  perform set_config('request.jwt.claims', json_build_object('sub', fr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := true;
  denied := false; begin perform * from public.flock_chapter_places(null); exception when insufficient_privilege then denied := true; end; ok := ok and denied;
  denied := false; begin perform * from public.flock_place_rules(null); exception when insufficient_privilege then denied := true; end; ok := ok and denied;
  denied := false; begin perform public.flock_place_suggest('vet', 'Mine', null, null); exception when insufficient_privilege then denied := true; end; ok := ok and denied;
  denied := false; begin perform * from public.flock_place_suggestions(); exception when insufficient_privilege then denied := true; end; ok := ok and denied;
  denied := false; begin perform 1 from public.flock_places; exception when insufficient_privilege then denied := true; end; ok := ok and denied;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', m1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  denied := false; begin perform 1 from public.flock_places; exception when insufficient_privilege then denied := true; end; ok := ok and denied;
  denied := false; begin insert into public.flock_places (region_slug, kind, name, status) values ('great-lakes', 'vet', 'Sneaky', 'live'); exception when insufficient_privilege then denied := true; end; ok := ok and denied;
  reset role;
  set local role anon;
  denied := false; begin perform * from public.flock_chapter_places(null); exception when insufficient_privilege then denied := true; end; ok := ok and denied;
  reset role;
  if ok then passed := passed + 1; else failed := array_append(failed, 'free users, visitors and direct access get nothing'); end if;

  -- 2) A member sees their own chapter's listings, vets first, then rescues,
  --    in order, with a bare website given https://; never another chapter's.
  perform set_config('request.jwt.claims', json_build_object('sub', m1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select array_agg(name order by ord) into names from (select name, row_number() over () as ord from public.flock_chapter_places(null)) q;
  ok := names = array['Lakeshore Bird & Exotic Clinic', 'Northside Avian', 'Birds and Beaks']
    and (select website from public.flock_chapter_places(null) where place_id = p_vet1) = 'https://lakeshorebirds.example.com'
    and not exists (select 1 from public.flock_chapter_places(null) where place_id = p_tx)
    and (select not can_manage and pending = 0 and region_slug = 'great-lakes' and region_name = 'Great Lakes' from public.flock_place_rules(null));
  denied := false; begin perform * from public.flock_chapter_places('texas'); exception when insufficient_privilege then denied := true; end; ok := ok and denied;
  denied := false; begin perform * from public.flock_place_rules('texas'); exception when insufficient_privilege then denied := true; end; ok := ok and denied;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', m4, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := ok and (select count(*) from public.flock_chapter_places(null)) = 1;
  reset role;
  -- No chapter yet: no listings, and no suggesting.
  perform set_config('request.jwt.claims', json_build_object('sub', m5, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := ok and (select count(*) from public.flock_chapter_places(null)) = 0;
  denied := false; begin perform public.flock_place_suggest('vet', 'Somewhere', null, null); exception when invalid_parameter_value then denied := true; end; ok := ok and denied;
  reset role;
  if ok then passed := passed + 1; else failed := array_append(failed, 'members see only their chapter, in order'); end if;

  -- 3) A suggestion is invisible to members (the suggester included) until
  --    approved; only the chapter's lead and admins see it waiting.
  perform set_config('request.jwt.claims', json_build_object('sub', m2, 'role', 'authenticated')::text, true);
  set local role authenticated;
  s1 := public.flock_place_suggest('vet', '  Maple Grove Animal Hospital ', 'Ann Arbor, MI', 'Dr. Kim treated our cockatoo.');
  s2 := public.flock_place_suggest('shop', 'Feather & Perch', null, null);
  ok := not exists (select 1 from public.flock_chapter_places(null) where place_id in (s1, s2));
  denied := false; begin perform * from public.flock_place_suggestions(); exception when insufficient_privilege then denied := true; end; ok := ok and denied;
  denied := false; begin perform public.flock_place_suggest('clinic', 'Wrong kind', null, null); exception when invalid_parameter_value then denied := true; end; ok := ok and denied;
  denied := false; begin perform public.flock_place_suggest('vet', '   ', null, null); exception when invalid_parameter_value then denied := true; end; ok := ok and denied;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', m4, 'role', 'authenticated')::text, true);
  set local role authenticated;
  s_tx := public.flock_place_suggest('rescue', 'Lone Star Parrot Rescue', 'Austin, TX', null);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', m1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := ok and not exists (select 1 from public.flock_chapter_places(null) where place_id in (s1, s2));
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ld, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := ok and (select count(*) from public.flock_place_suggestions()) = 2
    and exists (select 1 from public.flock_place_suggestions() where place_id = s1 and name = 'Maple Grove Animal Hospital'
                and suggested_by_name = 'Alex R.' and region_name = 'Great Lakes')
    and not exists (select 1 from public.flock_place_suggestions() where place_id = s_tx)
    and (select can_manage and is_lead and pending = 2 from public.flock_place_rules(null));
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ad, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := ok and (select count(*) from public.flock_place_suggestions()) = 3
    and (select can_manage and not is_lead and pending = 2 from public.flock_place_rules('great-lakes'));
  reset role;
  if ok then passed := passed + 1; else failed := array_append(failed, 'suggestions wait unseen for the chapter''s managers'); end if;

  -- 4) The lead approves one (it goes live at the end of its kind) and
  --    declines one (it's deleted); a lead can't review another chapter's.
  perform set_config('request.jwt.claims', json_build_object('sub', ld, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.flock_place_review(s1, 'approve');
  perform public.flock_place_review(s2, 'decline');
  denied := false; begin perform public.flock_place_review(s_tx, 'approve'); exception when no_data_found then denied := true; end; ok := denied;
  denied := false; begin perform public.flock_place_review(s1, 'approve'); exception when no_data_found then denied := true; end; ok := ok and denied;
  reset role;
  ok := ok and not exists (select 1 from public.flock_places where id = s2)
    and exists (select 1 from public.flock_places where id = s_tx and status = 'pending');
  perform set_config('request.jwt.claims', json_build_object('sub', m1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select array_agg(name order by ord) into names from (select name, row_number() over () as ord from public.flock_chapter_places(null) where kind = 'vet') q;
  ok := ok and names = array['Lakeshore Bird & Exotic Clinic', 'Northside Avian', 'Maple Grove Animal Hospital'];
  denied := false; begin perform public.flock_place_review(s_tx, 'approve'); exception when insufficient_privilege then denied := true; end; ok := ok and denied;
  reset role;
  if ok then passed := passed + 1; else failed := array_append(failed, 'approve lists it, decline deletes it, own chapter only'); end if;

  -- 5) Members can't add, edit, move or remove; a lead can in their own
  --    chapter only; an admin can in any chapter.
  perform set_config('request.jwt.claims', json_build_object('sub', m1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := true;
  denied := false; begin perform public.flock_place_save(null, 'great-lakes', 'vet', 'Mine', null, null, null, null); exception when insufficient_privilege then denied := true; end; ok := ok and denied;
  denied := false; begin perform public.flock_place_save(p_vet1, 'great-lakes', 'vet', 'Renamed', null, null, null, null); exception when no_data_found then denied := true; end; ok := ok and denied;
  denied := false; begin perform public.flock_place_move(p_vet2, -1); exception when no_data_found then denied := true; end; ok := ok and denied;
  denied := false; begin perform public.flock_place_remove(p_vet1); exception when no_data_found then denied := true; end; ok := ok and denied;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ld, 'role', 'authenticated')::text, true);
  set local role authenticated;
  denied := false; begin perform public.flock_place_save(null, 'texas', 'vet', 'Not mine', null, null, null, null); exception when insufficient_privilege then denied := true; end; ok := ok and denied;
  denied := false; begin perform public.flock_place_save(p_tx, 'texas', 'shop', 'Renamed', null, null, null, null); exception when no_data_found then denied := true; end; ok := ok and denied;
  denied := false; begin perform public.flock_place_remove(p_tx); exception when no_data_found then denied := true; end; ok := ok and denied;
  denied := false; begin perform * from public.flock_chapter_places('texas'); exception when insufficient_privilege then denied := true; end; ok := ok and denied;
  p_vet3 := public.flock_place_save(null, 'great-lakes', 'vet', 'Riverside Exotics', 'Toledo, OH', '419-555-0199', null, null);
  perform public.flock_place_save(p_vet2, 'great-lakes', 'vet', 'Dr. Patel, Northside Avian', 'Grand Rapids, MI', null, 'http://northside.example.com', 'Calm with nervous birds.');
  ok := ok and exists (select 1 from public.flock_chapter_places(null) where place_id = p_vet2 and name = 'Dr. Patel, Northside Avian'
                       and website = 'http://northside.example.com' and updated_at >= (select created_at from public.flock_places where id = p_vet2));
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ad, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := ok and (select count(*) from public.flock_chapter_places('great-lakes')) = 5;
  perform public.flock_place_save(p_tx, 'texas', 'shop', 'Houston Bird Supply Co.', 'Houston, TX', null, '', '');
  ok := ok and exists (select 1 from public.flock_chapter_places(null) where place_id = p_tx and name = 'Houston Bird Supply Co.' and website is null and note is null);
  reset role;
  if ok then passed := passed + 1; else failed := array_append(failed, 'only the chapter''s lead and admins add and edit'); end if;

  -- 6) Reordering: up and down within a kind, and the ends stay put.
  perform set_config('request.jwt.claims', json_build_object('sub', ld, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.flock_place_move(p_vet3, -1);
  perform public.flock_place_move(p_vet1, -1);   -- already first: no change
  perform public.flock_place_move(p_res, 1);     -- only rescue: no change
  select array_agg(name order by ord) into names from (select name, row_number() over () as ord from public.flock_chapter_places(null) where kind = 'vet') q;
  ok := names = array['Lakeshore Bird & Exotic Clinic', 'Dr. Patel, Northside Avian', 'Riverside Exotics', 'Maple Grove Animal Hospital'];
  perform public.flock_place_move(p_vet1, 1);
  select array_agg(name order by ord) into names from (select name, row_number() over () as ord from public.flock_chapter_places(null) where kind = 'vet') q;
  ok := ok and names = array['Dr. Patel, Northside Avian', 'Lakeshore Bird & Exotic Clinic', 'Riverside Exotics', 'Maple Grove Animal Hospital'];
  denied := false; begin perform public.flock_place_move(p_vet1, 2); exception when invalid_parameter_value then denied := true; end; ok := ok and denied;
  -- Changing a listing's kind puts it at the end of the new kind.
  perform public.flock_place_save(p_vet3, 'great-lakes', 'shop', 'Riverside Exotics', 'Toledo, OH', '419-555-0199', null, null);
  ok := ok and (select kind from public.flock_chapter_places(null) where place_id = p_vet3) = 'shop';
  reset role;
  if ok then passed := passed + 1; else failed := array_append(failed, 'reordering within a kind'); end if;

  -- 7) Removing a listing deletes it; removing a chapter lead ends their
  --    access at once.
  perform set_config('request.jwt.claims', json_build_object('sub', ld, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.flock_place_remove(p_vet3);
  reset role;
  ok := not exists (select 1 from public.flock_places where id = p_vet3);
  delete from public.flock_chapter_leads where user_id = ld;
  perform set_config('request.jwt.claims', json_build_object('sub', ld, 'role', 'authenticated')::text, true);
  set local role authenticated;
  denied := false; begin perform public.flock_place_remove(p_vet1); exception when no_data_found then denied := true; end; ok := ok and denied;
  denied := false; begin perform * from public.flock_place_suggestions(); exception when insufficient_privilege then denied := true; end; ok := ok and denied;
  ok := ok and (select not can_manage from public.flock_place_rules(null));
  reset role;
  if ok then passed := passed + 1; else failed := array_append(failed, 'remove deletes; an ex-lead can''t manage'); end if;

  -- 8) A member may have only so many suggestions waiting at once.
  perform set_config('request.jwt.claims', json_build_object('sub', m1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  for n in 1..private.flock_place_suggest_limit() loop
    perform public.flock_place_suggest('shop', 'Shop ' || n, null, null);
  end loop;
  msg := null;
  begin perform public.flock_place_suggest('shop', 'One too many', null, null); exception when raise_exception then get stacked diagnostics msg = message_text; end;
  ok := msg = 'rate_limited';
  reset role;
  if ok then passed := passed + 1; else failed := array_append(failed, 'waiting suggestions are capped'); end if;

  raise exception 'FLOCK PLACES CHECKS: % passed, % failed%', passed, coalesce(array_length(failed, 1), 0),
    case when array_length(failed, 1) > 0 then ': ' || array_to_string(failed, ', ') else '' end;
end $$;
