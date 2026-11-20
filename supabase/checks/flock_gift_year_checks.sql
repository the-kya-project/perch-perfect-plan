-- Verification for 20261120180000_flock_gift_year_after_free_season: a Flock
-- gift year starts on the later of redemption and the free season's end, runs
-- a full year, and moves (until it starts) when the free season's end moves.
--
-- Self-contained: its own admin and three gift recipients, moves opening day
-- and the free season's end around, then raises so everything rolls back.
--   "FLOCK GIFT YEAR CHECKS: n passed, 0 failed"           → all good
--   "FLOCK GIFT YEAR CHECKS: n passed, k failed: <names>"  → which ones broke
-- Run by .github/workflows/db-checks.yml on every PR (scripts/db-checks.sh).
do $$
declare
  adm uuid := gen_random_uuid();  -- admin
  ga  uuid := gen_random_uuid();  -- redeems before opening day
  gb  uuid := gen_random_uuid();  -- redeems during the free season, then joins the Flock
  gc  uuid := gen_random_uuid();  -- redeems after the free season has ended
  tag text := substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);
  passed int := 0; failed text[] := '{}';
  ok boolean; r record;
  pa uuid; pb uuid; pc uuid;
  season_end timestamptz;
  e public.entitlements; before_b public.entitlements;
begin
  insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  select '00000000-0000-0000-0000-000000000000', u, 'authenticated', 'authenticated', u::text || '@checks.invalid', '{}', '{}', now(), now()
  from unnest(array[adm, ga, gb, gc]) as u;
  insert into public.user_roles (user_id, role) values (adm, 'admin');
  insert into public.gift_purchases (plan, buyer_email, recipient_name, amount_paid_cents, stripe_checkout_session_id, gift_code)
  values ('flock_year', 'b@checks.invalid', 'A', 30000, 'cs_gya_' || tag, private.new_gift_code()) returning id into pa;
  insert into public.gift_purchases (plan, buyer_email, recipient_name, amount_paid_cents, stripe_checkout_session_id, gift_code)
  values ('flock_year', 'b@checks.invalid', 'B', 30000, 'cs_gyb_' || tag, private.new_gift_code()) returning id into pb;
  insert into public.gift_purchases (plan, buyer_email, recipient_name, amount_paid_cents, stripe_checkout_session_id, gift_code)
  values ('flock_year', 'b@checks.invalid', 'C', 30000, 'cs_gyc_' || tag, private.new_gift_code()) returning id into pc;

  -- Like production today: no opening day, the stored Jul 6, 2027 end.
  update public.flock_settings set flock_opens_at = null, ui_enabled = true,
    free_season_ends_at = timestamp '2027-07-06 00:00:00' at time zone 'America/New_York' where id;
  season_end := (select free_season_ends_at from public.flock_settings where id);

  -- 1) Redeemed before opening day is set: the row exists, with no dates and
  --    no access yet.
  update public.gift_purchases set status = 'redeemed', redeemed_by = ga, redeemed_at = now() where id = pa;
  select * into e from public.entitlements where gift_purchase_id = pa;
  if e.id is not null and e.plan = 'annual' and e.starts_at is null and e.current_period_end is null and not private.is_flock_member(ga)
  then passed := passed + 1; else failed := array_append(failed, 'before opening: row, no dates, no access'); end if;

  -- 2) Once opening day is set (still ahead), that gift year starts when the
  --    free season ends (Jul 6, 2027), not on opening day, and runs a year.
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.admin_set_flock_opens_at(now() + interval '10 days');
  reset role;
  select * into e from public.entitlements where gift_purchase_id = pa;
  if e.starts_at = season_end and e.current_period_end = season_end + interval '1 year' and e.status = 'active'
     and not private.is_flock_member(ga)
  then passed := passed + 1; else failed := array_append(failed, 'before opening: starts at the season end, a full year'); end if;

  -- 3) Moving the free season's end (the admin setter) moves the gift year;
  --    moving it back restores it.
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.admin_set_free_season_ends_at(season_end + interval '7 days');
  reset role;
  select * into e from public.entitlements where gift_purchase_id = pa;
  ok := e.starts_at = season_end + interval '7 days' and e.current_period_end = season_end + interval '7 days' + interval '1 year';
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.admin_set_free_season_ends_at(season_end);
  reset role;
  select * into e from public.entitlements where gift_purchase_id = pa;
  ok := ok and e.starts_at = season_end and e.current_period_end = season_end + interval '1 year';
  if ok then passed := passed + 1; else failed := array_append(failed, 'season end moves the gift year (and back)'); end if;

  -- The Flock opened ten days ago; the free season runs to Jul 6, 2027.
  update public.flock_settings set flock_opens_at = now() - interval '10 days' where id;
  perform private.reschedule_pending_grants(null);

  -- 4) Redeemed during the free season: the gift year still starts when the
  --    free season ends; the gift gives no access before then.
  update public.gift_purchases set status = 'redeemed', redeemed_by = gb, redeemed_at = now() where id = pb;
  select * into e from public.entitlements where gift_purchase_id = pb;
  if e.starts_at = season_end and e.current_period_end = season_end + interval '1 year' and not private.is_flock_member(gb)
  then passed := passed + 1; else failed := array_append(failed, 'during the free season: starts at the season end'); end if;

  -- 5) That gift holder joins the Flock (gate simulated open, rolled back):
  --    free access now through the free season, and the gift row is exactly
  --    the same before and after, including after rescheduling.
  select * into before_b from public.entitlements where gift_purchase_id = pb;
  create or replace function public.flock_enabled()
  returns boolean language sql stable security invoker set search_path = ''
  as $f$ select auth.uid() is not null and private.flock_ui_on(); $f$;
  perform set_config('request.jwt.claims', json_build_object('sub', gb, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select * into r from public.flock_join();
  reset role;
  perform private.reschedule_pending_grants(null);
  select * into e from public.entitlements where gift_purchase_id = pb;
  if r.result = 'joined' and private.is_flock_member(gb)
     and row(e.*) is not distinct from row(before_b.*)
     and (select current_period_end from public.entitlements where user_id = gb and source = 'free_season') = e.starts_at
  then passed := passed + 1; else failed := array_append(failed, 'gift holder joins: free now, gift row unchanged, gift follows the free season'); end if;

  -- The free season has ended (its end a day ago).
  update public.flock_settings set free_season_ends_at = now() - interval '1 day' where id;
  perform private.reschedule_pending_grants(null);

  -- 6) Redeemed after the free season ended: the year starts on redemption
  --    and runs a full year; access starts at once.
  update public.gift_purchases set status = 'redeemed', redeemed_by = gc, redeemed_at = now() where id = pc;
  select * into e from public.entitlements where gift_purchase_id = pc;
  if e.starts_at = (select redeemed_at from public.gift_purchases where id = pc)
     and e.current_period_end = e.starts_at + interval '1 year' and private.is_flock_member(gc)
  then passed := passed + 1; else failed := array_append(failed, 'after the free season: starts on redemption'); end if;

  -- 7) Gifts that hadn't started moved with the earlier end: each starts at
  --    the later of its redemption and the new end, and the holder (now past
  --    the free season) has the Flock through the gift.
  ok := true;
  for r in select gp.id, gp.redeemed_by, gp.redeemed_at from public.gift_purchases gp where gp.id in (pa, pb) loop
    select * into e from public.entitlements where gift_purchase_id = r.id;
    ok := ok and e.starts_at = greatest(r.redeemed_at, now() - interval '1 day')
             and e.current_period_end = e.starts_at + interval '1 year'
             and private.is_flock_member(r.redeemed_by);
  end loop;
  if ok then passed := passed + 1; else failed := array_append(failed, 'unstarted gifts follow the season end'); end if;

  -- 8) A gift year that has started keeps its dates when the end moves again.
  select * into before_b from public.entitlements where gift_purchase_id = pc;
  update public.flock_settings set free_season_ends_at = now() - interval '3 days' where id;
  perform private.reschedule_pending_grants(null);
  select * into e from public.entitlements where gift_purchase_id = pc;
  if row(e.*) is not distinct from row(before_b.*) then passed := passed + 1;
  else failed := array_append(failed, 'started gift keeps its dates'); end if;

  raise exception 'FLOCK GIFT YEAR CHECKS: % passed, % failed%', passed, coalesce(array_length(failed, 1), 0),
    case when array_length(failed, 1) > 0 then ': ' || array_to_string(failed, ', ') else '' end;
end $$;
