-- Verification for 20261123203000_kyas_crew (backlog 1.15).
--
-- Self-contained and leaves nothing behind: it creates a Crew member, a regular
-- member and an admin, runs Crew subscriptions through the webhook's function
-- the way the webhook does, checks access, giving, the sponsored seat, the
-- admin view and that app users can't reach any of it, then raises so the
-- whole block rolls back.
--   "CREW CHECKS: n passed, 0 failed"           → all good
--   "CREW CHECKS: n passed, k failed: <names>"  → which ones broke
-- Run it in the SQL editor (or the Supabase MCP execute_sql) on a branch.
do $$
declare
  crw uuid := gen_random_uuid();
  reg uuid := gen_random_uuid();
  adm uuid := gen_random_uuid();
  passed int := 0; failed text[] := '{}';
  tag text := substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);
  ok boolean; n int; id1 uuid; id2 uuid;
  s record;
  base_sponsored bigint; base_used bigint;
  period_end timestamptz := now() + interval '1 month';
begin
  insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  select '00000000-0000-0000-0000-000000000000', u, 'authenticated', 'authenticated', u::text || '@checks.invalid', '{}', '{}', now(), now()
  from unnest(array[crw, reg, adm]) u;
  insert into public.user_roles (user_id, role) values (adm, 'admin');

  select sponsored, used into base_sponsored, base_used from private.crew_sponsorship_summary_admin();

  -- 1) The plan check takes both Crew plans and still refuses anything else.
  begin
    insert into public.entitlements (user_id, plan, status, source) values (reg, 'crew_weekly', 'active', 'manual');
    ok := false;
  exception when check_violation then ok := true;
  end;
  if ok then passed := passed + 1; else failed := array_append(failed, 'plan check refuses unknown plans'); end if;

  -- 2) A Crew subscription is a Flock membership, records 25% giving and adds one seat.
  id1 := public.billing_record_stripe_subscription(crw, 'cus_c_' || tag, 'sub_c_' || tag, 'crew_annual', 'active', 'prod_c_' || tag, period_end, false, true);
  if private.is_flock_member(crw)
     and (select plan = 'crew_annual' and giving_rate = 0.25 from public.entitlements where id = id1)
     and (select count(*) from public.crew_sponsorships where subscription_ref = 'sub_c_' || tag and sponsor_user_id = crw and entitlement_id = id1 and months = 6) = 1
  then passed := passed + 1; else failed := array_append(failed, 'crew row grants, gives 25%, sponsors a seat'); end if;

  -- 3) The same subscription again (a renewal or repeated event) never adds a second seat.
  id2 := public.billing_record_stripe_subscription(crw, 'cus_c_' || tag, 'sub_c_' || tag, 'crew_annual', 'active', 'prod_c_' || tag, period_end + interval '1 year', false, true);
  if id1 = id2 and (select count(*) from public.crew_sponsorships where subscription_ref = 'sub_c_' || tag) = 1
  then passed := passed + 1; else failed := array_append(failed, 'one seat per subscription'); end if;

  -- 4) A Crew row that isn't active (a payment failed) adds no seat; the monthly plan works too.
  perform public.billing_record_stripe_subscription(crw, 'cus_c_' || tag, 'sub_cm_' || tag, 'crew_monthly', 'past_due', null, now() + interval '5 days', false, true);
  if not exists (select 1 from public.crew_sponsorships where subscription_ref = 'sub_cm_' || tag)
     and (select giving_rate from public.entitlements where source = 'stripe' and external_ref = 'sub_cm_' || tag) = 0.25
  then passed := passed + 1; else failed := array_append(failed, 'no seat until active'); end if;

  -- 5) Other paid plans record 20%.
  perform public.billing_record_stripe_subscription(reg, 'cus_r_' || tag, 'sub_r_' || tag, 'monthly', 'active', null, period_end, false, true);
  if (select giving_rate from public.entitlements where source = 'stripe' and external_ref = 'sub_r_' || tag) = 0.20
     and not exists (select 1 from public.crew_sponsorships where subscription_ref = 'sub_r_' || tag)
  then passed := passed + 1; else failed := array_append(failed, 'regular plans give 20%, no seat'); end if;

  -- 6) Switching a regular subscription to Crew (the same subscription) sponsors a seat then.
  perform public.billing_record_stripe_subscription(reg, 'cus_r_' || tag, 'sub_r_' || tag, 'crew_monthly', 'active', null, period_end, false, true);
  if (select giving_rate from public.entitlements where source = 'stripe' and external_ref = 'sub_r_' || tag) = 0.25
     and (select count(*) from public.crew_sponsorships where subscription_ref = 'sub_r_' || tag) = 1
  then passed := passed + 1; else failed := array_append(failed, 'switch to crew sponsors a seat'); end if;

  -- 7) The admin view counts seats sponsored and used, and available can go below zero.
  insert into public.crew_seat_uses (adopter_user_id) select reg from generate_series(1, 3);
  perform set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', adm)::text, true);
  set local role authenticated;
  select * into s from public.admin_crew_sponsorship_summary();
  select count(*) into n from public.admin_crew_sponsorships();
  reset role;
  if s.sponsored = base_sponsored + 2 and s.used = base_used + 3 and s.available = s.sponsored - s.used
     and s.crew_members >= 2 and n >= 2
  then passed := passed + 1; else failed := array_append(failed, 'admin summary and list'); end if;

  -- 8) The membership ends: access stops, the seat stays, and the list says so.
  perform public.billing_record_stripe_subscription(crw, 'cus_c_' || tag, 'sub_c_' || tag, 'crew_annual', 'canceled', 'prod_c_' || tag, now() - interval '1 minute', false, false);
  perform public.billing_record_stripe_subscription(crw, 'cus_c_' || tag, 'sub_cm_' || tag, 'crew_monthly', 'canceled', null, now() - interval '1 minute', false, false);
  if not private.is_flock_member(crw)
     and exists (select 1 from public.crew_sponsorships where subscription_ref = 'sub_c_' || tag)
     -- crw's yearly seat now shows as no longer Crew; reg's monthly one still does.
     and exists (select 1 from private.crew_sponsorships_admin() where plan = 'crew_annual' and not sponsor_still_crew)
     and exists (select 1 from private.crew_sponsorships_admin() where plan = 'crew_monthly' and sponsor_still_crew)
  then passed := passed + 1; else failed := array_append(failed, 'ended crew keeps its seat'); end if;

  -- 9) App users and visitors can't read the new tables or the admin view.
  perform set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', reg)::text, true);
  set local role authenticated;
  ok := true;
  begin perform 1 from public.crew_sponsorships; ok := false; exception when insufficient_privilege then null; end;
  begin perform 1 from public.crew_seat_uses; ok := false; exception when insufficient_privilege then null; end;
  begin perform * from public.admin_crew_sponsorship_summary(); ok := false; exception when insufficient_privilege then null; end;
  begin perform * from public.admin_crew_sponsorships(); ok := false; exception when insufficient_privilege then null; end;
  begin perform public.billing_record_stripe_subscription(reg, 'cus_x', 'sub_x', 'crew_monthly', 'active', null, null, false, true); ok := false; exception when insufficient_privilege then null; end;
  -- Their own entitlement rows stay readable, the giving rate included.
  select count(*) into n from public.entitlements where source = 'stripe' and giving_rate is not null;
  reset role;
  if ok and n = 1 then passed := passed + 1; else failed := array_append(failed, 'app users locked out, own rows readable'); end if;

  set local role anon;
  ok := true;
  begin perform 1 from public.crew_sponsorships; ok := false; exception when insufficient_privilege then null; end;
  begin perform * from public.admin_crew_sponsorship_summary(); ok := false; exception when insufficient_privilege then null; end;
  reset role;
  if ok then passed := passed + 1; else failed := array_append(failed, 'signed-out visitors locked out'); end if;

  -- 10) Rows nobody wrote through billing keep a null giving rate.
  insert into public.entitlements (user_id, plan, status, source) values (reg, 'comp', 'active', 'manual') returning id into id1;
  if (select giving_rate is null from public.entitlements where id = id1)
  then passed := passed + 1; else failed := array_append(failed, 'other rows untouched'); end if;

  -- 11) Deleting a sponsor's account keeps the seat, without the account.
  delete from auth.users where id = crw;
  if (select sponsor_user_id is null and entitlement_id is null from public.crew_sponsorships where subscription_ref = 'sub_c_' || tag)
  then passed := passed + 1; else failed := array_append(failed, 'seat survives account deletion'); end if;

  raise exception 'CREW CHECKS: % passed, % failed%', passed, coalesce(array_length(failed, 1), 0),
    case when array_length(failed, 1) > 0 then ': ' || array_to_string(failed, '; ') else '' end;
end $$;
