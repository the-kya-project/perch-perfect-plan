-- Verification for 20261120120000_flock_free_season_join (Join the Flock and
-- the free season's end).
--
-- Self-contained and leaves nothing behind: its own admin, free user, comp
-- member, founder, chapter lead, two gift holders and joiners; it moves
-- opening day and the free season's end around, and (part 2 only) simulates
-- the gate opening to everyone. Then it raises so everything rolls back.
--   "FLOCK FREE SEASON CHECKS: n passed, 0 failed"           → all good
--   "FLOCK FREE SEASON CHECKS: n passed, k failed: <names>"  → which ones broke
-- Run by .github/workflows/db-checks.yml on every PR (scripts/db-checks.sh).
do $$
declare
  adm uuid := gen_random_uuid();  -- admin
  fre uuid := gen_random_uuid();  -- plain free user
  cmp uuid := gen_random_uuid();  -- comp member (a Flock member, not an admin)
  fdr uuid := gen_random_uuid();  -- founder
  cld uuid := gen_random_uuid();  -- chapter lead
  gft uuid := gen_random_uuid();  -- Flock gift holder
  j1  uuid := gen_random_uuid();  -- joiner
  tag text := substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);
  passed int := 0; failed text[] := '{}';
  ok boolean; n int; st text; r record;
  g1 uuid; g2 uuid;
  e public.entitlements; before_f public.entitlements; before_g public.entitlements; before_p public.entitlements; before_c public.entitlements;
  season_end timestamptz;
begin
  insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  select '00000000-0000-0000-0000-000000000000', u, 'authenticated', 'authenticated', u::text || '@checks.invalid', '{}', '{}', now(), now()
  from unnest(array[adm, fre, cmp, fdr, cld, gft, j1]) as u;
  insert into public.user_roles (user_id, role) values (adm, 'admin');
  insert into public.entitlements (user_id, plan, status, source, starts_at) values (cmp, 'comp', 'active', 'manual', now() - interval '1 day');
  insert into public.entitlements (user_id, plan, status, source, starts_at) values (cld, 'chapter_lead', 'active', 'chapter_lead', now() - interval '1 day');
  insert into public.founding_claims (user_id, spot_number, region_slug)
  values (fdr, (select coalesce(max(spot_number), 0) + 1 from public.founding_claims), 'great-lakes');
  insert into public.gift_purchases (plan, buyer_email, recipient_name, amount_paid_cents, stripe_checkout_session_id, gift_code)
  values ('flock_year', 'b@checks.invalid', 'G1', 30000, 'cs_fs1_' || tag, private.new_gift_code()) returning id into g1;
  update public.gift_purchases set status = 'redeemed', redeemed_by = gft, redeemed_at = now() where id = g1;

  -- Start with no opening day, a sample free-season end (Jul 6, 2027; nothing
  -- is stored on production until Brittany sets it), UI on.
  update public.flock_settings set flock_opens_at = null, ui_enabled = true,
    free_season_ends_at = timestamp '2027-07-06 00:00:00' at time zone 'America/New_York' where id;
  season_end := (select free_season_ends_at from public.flock_settings where id);

  -- 1) The gate is unchanged: admins only, and the stored end is Jul 6, 2027.
  ok := pg_get_functiondef('public.flock_enabled()'::regprocedure) like '%is_admin%'
    and season_end = timestamp '2027-07-06 00:00:00' at time zone 'America/New_York';
  if ok then passed := passed + 1; else failed := array_append(failed, 'gate admins only, Jul 6 stored'); end if;

  -- 2) While the gate is admins only, nobody else can join: a free user, a
  --    member (comp), and a signed-out visitor are refused; no row is made.
  --    Even with opening day in the past.
  update public.flock_settings set flock_opens_at = now() - interval '1 day' where id;
  ok := true;
  for r in select unnest(array[fre, cmp]) as u loop
    perform set_config('request.jwt.claims', json_build_object('sub', r.u, 'role', 'authenticated')::text, true);
    set local role authenticated;
    st := null; begin perform * from public.flock_join(); exception when others then st := sqlstate; end;
    reset role;
    ok := ok and st = '42501';
  end loop;
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  set local role anon;
  st := null; begin perform * from public.flock_join(); exception when others then st := sqlstate; end;
  reset role;
  ok := ok and st = '42501'
    and not exists (select 1 from public.entitlements where source = 'free_season' and user_id in (fre, cmp));
  if ok then passed := passed + 1; else failed := array_append(failed, 'gate closed: free user, member, signed out refused'); end if;

  -- 3) An admin (who passes the gate) still can't join before opening day is set.
  update public.flock_settings set flock_opens_at = null where id;
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  st := null; begin perform * from public.flock_join(); exception when others then st := sqlstate || ':' || sqlerrm; end;
  reset role;
  if st = '55000:not_open' and not exists (select 1 from public.entitlements where user_id = adm) then passed := passed + 1;
  else failed := array_append(failed, 'no join before opening day is set'); end if;

  -- 4) A free-season row can never look like a trial or a bill.
  ok := true;
  begin insert into public.entitlements (user_id, plan, status, source) values (fre, 'comp', 'trialing', 'free_season'); ok := false; exception when check_violation then null; end;
  begin insert into public.entitlements (user_id, plan, status, source, external_ref) values (fre, 'comp', 'active', 'free_season', 'sub_123'); ok := false; exception when check_violation then null; end;
  begin insert into public.entitlements (user_id, plan, status, source) values (fre, 'monthly', 'active', 'free_season'); ok := false; exception when check_violation then null; end;
  begin insert into public.entitlements (user_id, plan, status, source, free_until) values (fre, 'comp', 'active', 'free_season', now()); ok := false; exception when check_violation then null; end;
  if ok then passed := passed + 1; else failed := array_append(failed, 'free-season rows: never trialing, billed or founding-shaped'); end if;

  -- From here on, simulate the gate opening to everyone (what PR C will
  -- decide), so the join rules themselves can be checked. Rolled back.
  create or replace function public.flock_enabled()
  returns boolean language sql stable security invoker set search_path = ''
  as $f$ select auth.uid() is not null and private.flock_ui_on(); $f$;
  -- Since build C, joining needs the guidelines and 18+ agreement first
  -- (flock_open_checks.sql covers that step); everyone here has agreed.
  insert into public.flock_agreements (user_id, adult_confirmed_at, guidelines_version)
  select u, now(), private.flock_guidelines_version() from unnest(array[adm, fre, cmp, fdr, cld, gft, j1]) as u
  on conflict (user_id) do nothing;

  -- Opening day ahead (Dec), so nothing has started yet.
  update public.flock_settings set flock_opens_at = now() + interval '10 days' where id;
  perform private.reschedule_pending_grants(null);
  select * into before_f from public.entitlements where user_id = fdr and source = 'founding';
  select * into before_g from public.entitlements where user_id = gft and source = 'gift';
  select * into before_c from public.entitlements where user_id = cld and source = 'chapter_lead';

  -- 5) Joining: one active row from opening day to the free season's end, no
  --    access before opening day; asking again changes nothing.
  perform set_config('request.jwt.claims', json_build_object('sub', j1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select * into r from public.flock_join();
  ok := r.result = 'joined' and r.starts_at = now() + interval '10 days' and r.ends_at = season_end;
  select * into r from public.flock_join();
  ok := ok and r.result = 'already_joined';
  reset role;
  select * into e from public.entitlements where user_id = j1 and source = 'free_season';
  ok := ok and (select count(*) from public.entitlements where user_id = j1) = 1
    and e.plan = 'comp' and e.status = 'active' and e.external_ref is null and e.free_until is null
    and not private.is_flock_member(j1) and private.journey_tier(j1) = 'free';
  if ok then passed := passed + 1; else failed := array_append(failed, 'join: one row, opening day to season end, nothing before'); end if;

  -- 6) Founders: nothing is created and their founding row is untouched.
  perform set_config('request.jwt.claims', json_build_object('sub', fdr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select * into r from public.flock_join();
  reset role;
  select * into e from public.entitlements where user_id = fdr and source = 'founding';
  if r.result = 'founder' and not exists (select 1 from public.entitlements where user_id = fdr and source = 'free_season')
     and row(e.*) is not distinct from row(before_f.*) then passed := passed + 1;
  else failed := array_append(failed, 'founder: nothing created, terms unchanged'); end if;

  -- 7) Chapter leads: nothing is created, their membership is untouched.
  perform set_config('request.jwt.claims', json_build_object('sub', cld, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select * into r from public.flock_join();
  reset role;
  select * into e from public.entitlements where user_id = cld and source = 'chapter_lead';
  if r.result = 'chapter_lead' and (select count(*) from public.entitlements where user_id = cld) = 1
     and row(e.*) is not distinct from row(before_c.*) then passed := passed + 1;
  else failed := array_append(failed, 'chapter lead: no second row'); end if;

  -- 8) Gift holders can join, and their gift rows don't
  --    change: not when they join, and not when grants are rescheduled.
  for r in select unnest(array[gft]) as u loop
    perform set_config('request.jwt.claims', json_build_object('sub', r.u, 'role', 'authenticated')::text, true);
    set local role authenticated;
    perform * from public.flock_join();
    reset role;
  end loop;
  perform private.reschedule_pending_grants(null);
  select * into e from public.entitlements where user_id = gft and source = 'gift';
  ok := row(e.*) is not distinct from row(before_g.*)
    and exists (select 1 from public.entitlements where user_id = gft and source = 'free_season');
  if ok then passed := passed + 1; else failed := array_append(failed, 'gift holders join; gift rows unchanged'); end if;

  -- 9) The admin setter moves every free-season row's end (and founders'
  --    free months, which haven't started); non-admins and blank dates are refused.
  perform set_config('request.jwt.claims', json_build_object('sub', fre, 'role', 'authenticated')::text, true);
  set local role authenticated;
  st := null; begin perform public.admin_set_free_season_ends_at(season_end + interval '1 day'); exception when others then st := sqlstate; end;
  reset role;
  ok := st = '42501';
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  st := null; begin perform public.admin_set_free_season_ends_at(null); exception when others then st := sqlstate; end;
  ok := ok and st = '22004';
  perform public.admin_set_free_season_ends_at(season_end + interval '1 day');
  reset role;
  ok := ok and (select current_period_end from public.entitlements where user_id = j1 and source = 'free_season') = season_end + interval '1 day'
    and (select free_until from public.entitlements where user_id = fdr and source = 'founding') = season_end + interval '1 day';
  -- And back to Jul 6.
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.admin_set_free_season_ends_at(season_end);
  reset role;
  ok := ok and (select current_period_end from public.entitlements where user_id = j1 and source = 'free_season') = season_end
    and (select free_until from public.entitlements where user_id = fdr and source = 'founding') = season_end;
  if ok then passed := passed + 1; else failed := array_append(failed, 'setter moves the season end; admins only'); end if;

  -- 10) Moving opening day moves a free-season row's start (it hasn't started).
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.admin_set_flock_opens_at(now() + interval '20 days');
  reset role;
  if (select starts_at from public.entitlements where user_id = j1 and source = 'free_season') = now() + interval '20 days'
  then passed := passed + 1; else failed := array_append(failed, 'opening day moves the start'); end if;

  -- 11) After opening day: free-season members have the Flock (and Flock journeys); the
  --     setter now refuses to move the season's end.
  update public.flock_settings set flock_opens_at = now() - interval '30 days' where id;
  perform private.reschedule_pending_grants(null);
  ok := private.is_flock_member(j1) and private.journey_tier(j1) = 'flock' and private.can_use_flock(j1);
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  st := null; begin perform public.admin_set_free_season_ends_at(season_end + interval '1 day'); exception when others then st := sqlstate; end;
  reset role;
  ok := ok and st = '55000';
  if ok then passed := passed + 1; else failed := array_append(failed, 'after opening: access, and the end is fixed'); end if;
  -- Snapshot the founder's and gift holders' rows as they stand after opening.
  select * into before_f from public.entitlements where user_id = fdr and source = 'founding';
  select * into before_g from public.entitlements where user_id = gft and source = 'gift';

  -- 12) The free season ends: free-season members lose Flock access AND
  --     Flock journeys (app premium is gone, #482); founders and gift holders
  --     keep theirs, their rows untouched.
  --     (Simulated by putting the end an hour in the past, as the setter would
  --     before opening; founders' started rows keep their own dates.)
  update public.flock_settings set free_season_ends_at = now() - interval '1 hour' where id;
  perform private.reschedule_pending_grants(null);
  ok := not private.is_flock_member(j1) and private.journey_tier(j1) = 'free' and not private.can_use_flock(j1)
    -- A gift holder who joined: the gift year (not yet started) moved with the
    -- season's end, so it starts on redemption (later than the new end) and
    -- they keep the Flock (20261120180000).
    and private.is_flock_member(gft) and private.journey_tier(gft) = 'flock'
    and (select x.starts_at from public.entitlements x where x.user_id = gft and x.source = 'gift')
        = greatest((select redeemed_at from public.gift_purchases where redeemed_by = gft), now() - interval '1 hour')
    and (select x.current_period_end = x.starts_at + interval '1 year' from public.entitlements x where x.user_id = gft and x.source = 'gift')
    and private.is_flock_member(fdr)
    and row((select x from public.entitlements x where x.user_id = fdr and x.source = 'founding').*) is not distinct from row(before_f.*);
  if ok then passed := passed + 1; else failed := array_append(failed, 'season end: free-season access ends; founders and gifts keep theirs'); end if;

  -- 13) After the free season, joining is refused and creates nothing.
  perform set_config('request.jwt.claims', json_build_object('sub', fre, 'role', 'authenticated')::text, true);
  set local role authenticated;
  st := null; begin perform * from public.flock_join(); exception when others then st := sqlstate || ':' || sqlerrm; end;
  reset role;
  if st = '55000:season_over' and not exists (select 1 from public.entitlements where user_id = fre)
  then passed := passed + 1; else failed := array_append(failed, 'no join after the free season'); end if;

  raise exception 'FLOCK FREE SEASON CHECKS: % passed, % failed%', passed, coalesce(array_length(failed, 1), 0),
    case when array_length(failed, 1) > 0 then ': ' || array_to_string(failed, ', ') else '' end;
end $$;
