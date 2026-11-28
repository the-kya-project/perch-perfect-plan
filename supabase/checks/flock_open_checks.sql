-- Verification for 20261122100000_flock_open_to_members (build C).
--
-- Self-contained and leaves nothing behind: its own admin, free users, a comp
-- member, a founder and a gift holder. It moves opening day and the members
-- switch around, then raises so everything rolls back.
--   "FLOCK OPEN CHECKS: n passed, 0 failed"           → all good
--   "FLOCK OPEN CHECKS: n passed, k failed: <names>"  → which ones broke
-- Run by .github/workflows/db-checks.yml on every PR (scripts/db-checks.sh).
do $$
declare
  adm uuid := gen_random_uuid();  -- admin
  fre uuid := gen_random_uuid();  -- free user who joins
  fr2 uuid := gen_random_uuid();  -- free user who says no to 18+
  cmp uuid := gen_random_uuid();  -- comp member
  fdr uuid := gen_random_uuid();  -- founder
  gft uuid := gen_random_uuid();  -- gift holder (gift year after the free season)
  tag text := substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);
  v   text := private.flock_guidelines_version();
  passed int := 0; failed text[] := '{}';
  ok boolean; st text; r record; u uuid; g1 uuid;
  before_g public.entitlements; before_f public.entitlements; a public.flock_agreements;
begin
  insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  select '00000000-0000-0000-0000-000000000000', x, 'authenticated', 'authenticated', x::text || '@checks.invalid', '{}', '{}', now(), now()
  from unnest(array[adm, fre, fr2, cmp, fdr, gft]) as x;
  -- Test members have agreed to the community guidelines (20261128180000).
  insert into public.flock_guideline_agreements (user_id, version)
  select u.id, public.current_guidelines_version() from auth.users u where u.email like '%@checks.invalid'
  on conflict do nothing;
  insert into public.user_roles (user_id, role) values (adm, 'admin');
  insert into public.entitlements (user_id, plan, status, source, starts_at) values (cmp, 'comp', 'active', 'manual', now() - interval '1 day');
  insert into public.founding_claims (user_id, spot_number, region_slug)
  values (fdr, (select coalesce(max(spot_number), 0) + 1 from public.founding_claims), 'great-lakes');
  insert into public.gift_purchases (plan, buyer_email, recipient_name, amount_paid_cents, stripe_checkout_session_id, gift_code)
  values ('flock_year', 'b@checks.invalid', 'G1', 30000, 'cs_open_' || tag, private.new_gift_code()) returning id into g1;
  update public.gift_purchases set status = 'redeemed', redeemed_by = gft, redeemed_at = now() where id = g1;

  -- Start like production today: kill switch on, no opening day, the switch
  -- at its default.
  update public.flock_settings set ui_enabled = true, flock_opens_at = null, members_open = false,
    free_season_ends_at = timestamp '2027-07-06 00:00:00' at time zone 'America/New_York' where id;

  -- 1) Merged switched off: members_open defaults to false, and only admins
  --    pass the gate. Nobody else can agree, join or ask where they stand.
  ok := (select column_default from information_schema.columns
         where table_schema = 'public' and table_name = 'flock_settings' and column_name = 'members_open') = 'false';
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := ok and public.flock_enabled();
  reset role;
  foreach u in array array[fre, cmp, fdr, gft] loop
    perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
    set local role authenticated;
    ok := ok and not public.flock_enabled();
    st := null; begin perform public.flock_agree('great-lakes', 'X Y.', true, v, 'care_app'); exception when others then st := sqlstate; end; ok := ok and st = '42501';
    st := null; begin perform * from public.flock_join(); exception when others then st := sqlstate; end; ok := ok and st = '42501';
    st := null; begin perform * from public.flock_my_access(); exception when others then st := sqlstate; end; ok := ok and st = '42501';
    reset role;
  end loop;
  ok := ok and not exists (select 1 from public.flock_agreements where user_id in (fre, cmp, fdr, gft));
  if ok then passed := passed + 1; else failed := array_append(failed, 'off by default: admins only, no agree/join/access'); end if;

  -- 2) Each condition alone isn't enough: opening day set but the switch off;
  --    the switch on but no opening day; both on but the kill switch off
  --    (which also closes it to admins).
  ok := true;
  update public.flock_settings set flock_opens_at = now() - interval '1 day', members_open = false where id;
  perform set_config('request.jwt.claims', json_build_object('sub', fre, 'role', 'authenticated')::text, true);
  set local role authenticated; ok := ok and not public.flock_enabled(); reset role;
  update public.flock_settings set flock_opens_at = null, members_open = true where id;
  set local role authenticated; ok := ok and not public.flock_enabled(); reset role;
  update public.flock_settings set flock_opens_at = now() - interval '1 day', members_open = true, ui_enabled = false where id;
  set local role authenticated; ok := ok and not public.flock_enabled(); reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  set local role authenticated; ok := ok and not public.flock_enabled(); reset role;
  update public.flock_settings set ui_enabled = true, members_open = false where id;
  if ok then passed := passed + 1; else failed := array_append(failed, 'needs opening day AND the switch AND the kill switch on'); end if;

  -- 3) Only admins flip the switch, and the flip is recorded.
  perform set_config('request.jwt.claims', json_build_object('sub', fre, 'role', 'authenticated')::text, true);
  set local role authenticated;
  st := null; begin perform public.admin_set_flock_members_open(true); exception when others then st := sqlstate; end;
  reset role;
  ok := st = '42501' and not (select members_open from public.flock_settings where id);
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.admin_set_flock_members_open(true);
  reset role;
  ok := ok and (select members_open and members_open_changed_by = adm and members_open_changed_at is not null from public.flock_settings where id);
  if ok then passed := passed + 1; else failed := array_append(failed, 'admins only flip the switch'); end if;

  -- From here: opening day yesterday and the switch on.

  -- 4) The door is open, the Flock isn't: a free user passes flock_enabled()
  --    but every member read is still refused, and the library stays shut.
  perform set_config('request.jwt.claims', json_build_object('sub', fre, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := public.flock_enabled() and not private.can_read_library();
  st := null; begin perform * from public.flock_my_setup(); exception when others then st := sqlstate; end; ok := ok and st = '42501';
  st := null; begin perform * from public.flock_founders(); exception when others then st := sqlstate; end; ok := ok and st = '42501';
  select * into r from public.flock_my_access();
  ok := ok and not r.member_now and not r.has_membership and not r.agreed and not r.is_admin and r.guidelines_version = v;
  reset role;
  if ok then passed := passed + 1; else failed := array_append(failed, 'open door: non-members still read nothing'); end if;

  -- 5) The 18+ step: false or blank is refused and saves nothing.
  perform set_config('request.jwt.claims', json_build_object('sub', fr2, 'role', 'authenticated')::text, true);
  set local role authenticated;
  st := null; begin perform public.flock_agree('great-lakes', 'Fran T.', false, v, 'care_app'); exception when others then st := sqlstate || ':' || sqlerrm; end;
  ok := st = '22023:adult_required';
  st := null; begin perform public.flock_agree('great-lakes', 'Fran T.', null, v, 'care_app'); exception when others then st := sqlstate || ':' || sqlerrm; end;
  ok := ok and st = '22023:adult_required';
  st := null; begin perform * from public.flock_join(); exception when others then st := sqlstate || ':' || sqlerrm; end;
  ok := ok and st = '42501:agree_first';
  reset role;
  ok := ok and not exists (select 1 from public.flock_agreements where user_id = fr2)
    and not exists (select 1 from public.flock_profiles where user_id = fr2)
    and not exists (select 1 from public.entitlements where user_id = fr2);
  if ok then passed := passed + 1; else failed := array_append(failed, '18+ required; no join without agreeing'); end if;

  -- 6) An old guidelines version or an unknown chapter is refused.
  perform set_config('request.jwt.claims', json_build_object('sub', fr2, 'role', 'authenticated')::text, true);
  set local role authenticated;
  st := null; begin perform public.flock_agree('great-lakes', 'Fran T.', true, 'old', 'care_app'); exception when others then st := sqlstate || ':' || sqlerrm; end;
  ok := st = '22023:guidelines_outdated';
  st := null; begin perform public.flock_agree('nowhere', 'Fran T.', true, v, 'care_app'); exception when others then st := sqlstate || ':' || sqlerrm; end;
  ok := ok and st = '22023:unknown_region';
  reset role;
  ok := ok and not exists (select 1 from public.flock_agreements where user_id = fr2);
  if ok then passed := passed + 1; else failed := array_append(failed, 'current guidelines and a real chapter only'); end if;

  -- 7) Joining: agree (chapter, 18+, guidelines, source), then join. One
  --    agreement, a profile in that chapter with setup still to do, one
  --    free-season row, access now (opening day has passed).
  perform set_config('request.jwt.claims', json_build_object('sub', fre, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := public.flock_agree('texas', 'Free T.', true, v, 'email') = v;
  select * into r from public.flock_join();
  ok := ok and r.result = 'joined';
  select * into r from public.flock_join();
  ok := ok and r.result = 'already_joined';
  select * into r from public.flock_my_access();
  ok := ok and r.member_now and r.has_membership and r.agreed;
  reset role;
  select * into a from public.flock_agreements where user_id = fre;
  ok := ok and a.guidelines_version = v and a.adult_confirmed_at is not null and a.join_source = 'email'
    and (select region_slug = 'texas' and display_name = 'Free T.' and setup_completed_at is null from public.flock_profiles where user_id = fre)
    and (select count(*) from public.entitlements where user_id = fre and source = 'free_season') = 1
    and private.can_use_flock(fre);
  if ok then passed := passed + 1; else failed := array_append(failed, 'join: agreement, chapter, one free-season row, access'); end if;

  -- 8) Agreements: your own row only; no direct writes.
  perform set_config('request.jwt.claims', json_build_object('sub', fr2, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := not exists (select 1 from public.flock_agreements where user_id = fre);
  st := null; begin insert into public.flock_agreements (user_id, adult_confirmed_at, guidelines_version) values (fr2, now(), v); exception when others then st := sqlstate; end;
  ok := ok and st = '42501';
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', fre, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := ok and (select count(*) from public.flock_agreements) = 1;
  st := null; begin update public.flock_agreements set adult_confirmed_at = now() where user_id = fre; exception when others then st := sqlstate; end;
  ok := ok and st = '42501';
  reset role;
  if ok then passed := passed + 1; else failed := array_append(failed, 'agreements: own row, read only'); end if;

  -- 9) Founders agree too, and get no second membership.
  select * into before_f from public.entitlements where user_id = fdr and source = 'founding';
  perform set_config('request.jwt.claims', json_build_object('sub', fdr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  st := null; begin perform * from public.flock_join(); exception when others then st := sqlstate || ':' || sqlerrm; end;
  ok := st = '42501:agree_first';
  perform public.flock_agree('great-lakes', 'Fay D.', true, v, 'founding');
  select * into r from public.flock_join();
  ok := ok and r.result = 'founder';
  reset role;
  ok := ok and not exists (select 1 from public.entitlements where user_id = fdr and source = 'free_season')
    and (select count(*) from public.entitlements where user_id = fdr) = (case when before_f.id is null then 0 else 1 end)
    and private.flock_agreed(fdr);
  if ok then passed := passed + 1; else failed := array_append(failed, 'founders: agree, no second membership'); end if;

  -- 10) A member with a running membership (a comp) agrees and gets nothing new.
  perform set_config('request.jwt.claims', json_build_object('sub', cmp, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.flock_agree('great-lakes', 'Cam P.', true, v, 'website');
  select * into r from public.flock_join();
  reset role;
  if r.result = 'member' and (select count(*) from public.entitlements where user_id = cmp) = 1
  then passed := passed + 1; else failed := array_append(failed, 'existing members: no second membership'); end if;

  -- 11) A gift holder whose gift year starts after the free season: agrees,
  --     gets the free season from opening day, and the gift row is unchanged.
  select * into before_g from public.entitlements where user_id = gft and source = 'gift';
  perform set_config('request.jwt.claims', json_build_object('sub', gft, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select * into r from public.flock_my_access();
  ok := r.has_membership and not r.member_now and not r.agreed;
  perform public.flock_agree('great-lakes', 'Gil H.', true, v, 'gift');
  select * into r from public.flock_join();
  ok := ok and r.result = 'joined';
  reset role;
  ok := ok and row((select x from public.entitlements x where x.user_id = gft and x.source = 'gift').*) is not distinct from row(before_g.*)
    and (select join_source from public.flock_agreements where user_id = gft) = 'gift';
  if ok then passed := passed + 1; else failed := array_append(failed, 'gift holders: agree, free season, gift row unchanged'); end if;

  -- 12) A new guidelines version means agreeing again (the old one no longer
  --     counts); simulated by changing the version.
  create or replace function private.flock_guidelines_version()
  returns text language sql immutable set search_path = '' as $f$ select 'next'::text; $f$;
  ok := not private.flock_agreed(fre);
  create or replace function private.flock_guidelines_version()
  returns text language sql immutable set search_path = '' as $f$ select '2026-12'::text; $f$;
  ok := ok and private.flock_agreed(fre);
  if ok then passed := passed + 1; else failed := array_append(failed, 'a new guidelines version asks again'); end if;

  -- 13) Switch off again: everyone but admins is outside, memberships stay.
  update public.flock_settings set members_open = false where id;
  perform set_config('request.jwt.claims', json_build_object('sub', fre, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := not public.flock_enabled();
  st := null; begin perform * from public.flock_my_access(); exception when others then st := sqlstate; end; ok := ok and st = '42501';
  reset role;
  ok := ok and exists (select 1 from public.entitlements where user_id = fre and source = 'free_season');
  if ok then passed := passed + 1; else failed := array_append(failed, 'switch off: closed again, memberships kept'); end if;

  -- 14) Signed-out visitors can't call any of it.
  update public.flock_settings set members_open = true where id;
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  set local role anon;
  ok := true;
  st := null; begin perform public.flock_enabled(); exception when others then st := sqlstate; end; ok := ok and st = '42501';
  st := null; begin perform public.flock_agree('great-lakes', 'A B.', true, v, 'care_app'); exception when others then st := sqlstate; end; ok := ok and st = '42501';
  st := null; begin perform * from public.flock_my_access(); exception when others then st := sqlstate; end; ok := ok and st = '42501';
  st := null; begin perform public.admin_set_flock_members_open(false); exception when others then st := sqlstate; end; ok := ok and st = '42501';
  reset role;
  if ok then passed := passed + 1; else failed := array_append(failed, 'signed out: refused'); end if;

  raise exception 'FLOCK OPEN CHECKS: % passed, % failed%', passed, coalesce(array_length(failed, 1), 0),
    case when array_length(failed, 1) > 0 then ': ' || array_to_string(failed, ', ') else '' end;
end $$;
