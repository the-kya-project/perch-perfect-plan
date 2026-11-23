-- Verification for 20261123203000_kyas_crew (backlog 1.15).
--
-- Self-contained and leaves nothing behind: it creates a Crew member and a
-- regular member, runs Crew subscriptions through the webhook's function the
-- way the webhook does, checks access, giving and that app users can't call it,
-- then raises so the whole block rolls back.
--   "CREW CHECKS: n passed, 0 failed"           → all good
--   "CREW CHECKS: n passed, k failed: <names>"  → which ones broke
-- Run it in the SQL editor (or the Supabase MCP execute_sql) on a branch.
do $$
declare
  crw uuid := gen_random_uuid();
  reg uuid := gen_random_uuid();
  passed int := 0; failed text[] := '{}';
  tag text := substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);
  ok boolean; n int; id1 uuid; id2 uuid;
  period_end timestamptz := now() + interval '1 month';
begin
  insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  select '00000000-0000-0000-0000-000000000000', u, 'authenticated', 'authenticated', u::text || '@checks.invalid', '{}', '{}', now(), now()
  from unnest(array[crw, reg]) u;

  -- 1) The plan check takes both Crew plans and still refuses anything else.
  begin
    insert into public.entitlements (user_id, plan, status, source) values (reg, 'crew_weekly', 'active', 'manual');
    ok := false;
  exception when check_violation then ok := true;
  end;
  if ok then passed := passed + 1; else failed := array_append(failed, 'plan check refuses unknown plans'); end if;

  -- 2) A Crew subscription is a Flock membership and records 25% giving.
  id1 := public.billing_record_stripe_subscription(crw, 'cus_c_' || tag, 'sub_c_' || tag, 'crew_annual', 'active', 'prod_c_' || tag, period_end, false, true);
  if private.is_flock_member(crw)
     and (select plan = 'crew_annual' and giving_rate = 0.25 from public.entitlements where id = id1)
  then passed := passed + 1; else failed := array_append(failed, 'crew row grants and gives 25%'); end if;

  -- 3) The same subscription again (a renewal or repeated event) updates the one row.
  id2 := public.billing_record_stripe_subscription(crw, 'cus_c_' || tag, 'sub_c_' || tag, 'crew_annual', 'active', 'prod_c_' || tag, period_end + interval '1 year', false, true);
  if id1 = id2 and (select count(*) from public.entitlements where source = 'stripe' and external_ref = 'sub_c_' || tag) = 1
  then passed := passed + 1; else failed := array_append(failed, 'one row per subscription'); end if;

  -- 4) The monthly plan records 25% too, whatever its status.
  perform public.billing_record_stripe_subscription(crw, 'cus_c_' || tag, 'sub_cm_' || tag, 'crew_monthly', 'past_due', null, now() + interval '5 days', false, true);
  if (select giving_rate from public.entitlements where source = 'stripe' and external_ref = 'sub_cm_' || tag) = 0.25
  then passed := passed + 1; else failed := array_append(failed, 'monthly crew gives 25%'); end if;

  -- 5) Other paid plans record 20%.
  perform public.billing_record_stripe_subscription(reg, 'cus_r_' || tag, 'sub_r_' || tag, 'monthly', 'active', null, period_end, false, true);
  if (select giving_rate from public.entitlements where source = 'stripe' and external_ref = 'sub_r_' || tag) = 0.20
  then passed := passed + 1; else failed := array_append(failed, 'regular plans give 20%'); end if;

  -- 6) Switching a regular subscription to Crew moves it to 25%.
  perform public.billing_record_stripe_subscription(reg, 'cus_r_' || tag, 'sub_r_' || tag, 'crew_monthly', 'active', null, period_end, false, true);
  if (select giving_rate from public.entitlements where source = 'stripe' and external_ref = 'sub_r_' || tag) = 0.25
  then passed := passed + 1; else failed := array_append(failed, 'switch to crew gives 25%'); end if;

  -- 7) The membership ends: access stops.
  perform public.billing_record_stripe_subscription(crw, 'cus_c_' || tag, 'sub_c_' || tag, 'crew_annual', 'canceled', 'prod_c_' || tag, now() - interval '1 minute', false, false);
  perform public.billing_record_stripe_subscription(crw, 'cus_c_' || tag, 'sub_cm_' || tag, 'crew_monthly', 'canceled', null, now() - interval '1 minute', false, false);
  if not private.is_flock_member(crw)
  then passed := passed + 1; else failed := array_append(failed, 'ended crew loses access'); end if;

  -- 8) App users can't call the billing function; their own rows stay readable.
  perform set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', reg)::text, true);
  set local role authenticated;
  ok := true;
  begin perform public.billing_record_stripe_subscription(reg, 'cus_x', 'sub_x', 'crew_monthly', 'active', null, null, false, true); ok := false; exception when insufficient_privilege then null; end;
  select count(*) into n from public.entitlements where source = 'stripe' and giving_rate is not null;
  reset role;
  if ok and n = 1 then passed := passed + 1; else failed := array_append(failed, 'app users locked out, own rows readable'); end if;

  -- 9) Rows nobody wrote through billing keep a null giving rate.
  insert into public.entitlements (user_id, plan, status, source) values (reg, 'comp', 'active', 'manual') returning id into id1;
  if (select giving_rate is null from public.entitlements where id = id1)
  then passed := passed + 1; else failed := array_append(failed, 'other rows untouched'); end if;

  raise exception 'CREW CHECKS: % passed, % failed%', passed, coalesce(array_length(failed, 1), 0),
    case when array_length(failed, 1) > 0 then ': ' || array_to_string(failed, '; ') else '' end;
end $$;
