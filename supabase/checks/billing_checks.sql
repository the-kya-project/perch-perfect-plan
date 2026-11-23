-- Verification for 20261123180000_billing_foundation (backlog 1.14).
--
-- Self-contained and leaves nothing behind: it creates a founder and a regular
-- member, runs Stripe subscriptions through the webhook's functions the way the
-- webhook does, checks access, the founding forfeit rule, idempotency and that
-- app users can't reach any of it, then raises so the whole block rolls back.
--   "BILLING CHECKS: n passed, 0 failed"           → all good
--   "BILLING CHECKS: n passed, k failed: <names>"  → which ones broke
-- Run it in the SQL editor (or the Supabase MCP execute_sql) on a branch.
do $$
declare
  fdr uuid := gen_random_uuid();
  reg uuid := gen_random_uuid();
  passed int := 0; failed text[] := '{}';
  tag text := substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);
  ok boolean; n int; id1 uuid; id2 uuid;
  season_end timestamptz := now() + interval '30 days';
begin
  insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  select '00000000-0000-0000-0000-000000000000', u, 'authenticated', 'authenticated', u::text || '@checks.invalid', '{}', '{}', now(), now()
  from unnest(array[fdr, reg]) u;

  insert into public.founding_claims (user_id, spot_number, region_slug)
  values (fdr, (select coalesce(max(spot_number), 0) + 1 from public.founding_claims), 'great-lakes');

  -- 1) A new claim starts with the founding price open.
  if public.billing_founding_price_open(fdr) and not public.billing_founding_price_open(reg)
  then passed := passed + 1; else failed := array_append(failed, 'founding price open for founders only'); end if;

  -- 2) Adding a card in the free season: a trialing founding row, and access.
  id1 := public.billing_record_stripe_subscription(fdr, 'cus_f_' || tag, 'sub_f_' || tag, 'founding', 'trialing', 'prod_' || tag, season_end, false, true);
  select count(*) into n from public.entitlements
  where id = id1 and source = 'stripe' and plan = 'founding' and status = 'trialing'
    and current_period_end = season_end and will_renew and not cancel_at_period_end
    -- The claim's own grant keeps the claim link (one row per claim).
    and founding_claim_id is null;
  if n = 1 and private.is_flock_member(fdr) then passed := passed + 1; else failed := array_append(failed, 'trialing founding row grants'); end if;

  -- 3) The same subscription again (a repeated or later event) updates the one row.
  id2 := public.billing_record_stripe_subscription(fdr, 'cus_f_' || tag, 'sub_f_' || tag, 'founding', 'active', 'prod_' || tag, season_end + interval '1 month', false, true);
  select count(*) into n from public.entitlements where user_id = fdr and source = 'stripe';
  if id1 = id2 and n = 1 and (select status from public.entitlements where id = id1) = 'active'
  then passed := passed + 1; else failed := array_append(failed, 'one row per subscription'); end if;

  -- 4) Turning off auto-renew keeps access and the founding price.
  perform public.billing_record_stripe_subscription(fdr, 'cus_f_' || tag, 'sub_f_' || tag, 'founding', 'active', 'prod_' || tag, season_end + interval '1 month', true, false);
  if private.is_flock_member(fdr) and public.billing_founding_price_open(fdr)
     and (select cancel_at_period_end and not will_renew from public.entitlements where id = id1)
  then passed := passed + 1; else failed := array_append(failed, 'auto-renew off keeps price'); end if;

  -- 5) A payment that fails keeps access through the period (past_due).
  perform public.billing_record_stripe_subscription(fdr, 'cus_f_' || tag, 'sub_f_' || tag, 'founding', 'past_due', 'prod_' || tag, now() + interval '10 days', false, true);
  if private.is_flock_member(fdr) and public.billing_founding_price_open(fdr)
  then passed := passed + 1; else failed := array_append(failed, 'past_due keeps access and price'); end if;

  -- 6) The membership actually ends: access stops and the founding price is forfeited.
  perform public.billing_record_stripe_subscription(fdr, 'cus_f_' || tag, 'sub_f_' || tag, 'founding', 'canceled', 'prod_' || tag, now() - interval '1 minute', false, false);
  if not exists (select 1 from public.entitlements where user_id = fdr and source = 'stripe' and private.entitlement_grants_now(starts_at, status, current_period_end))
     and not public.billing_founding_price_open(fdr)
     and (select forfeited_at is not null from public.founding_claims where user_id = fdr)
  then passed := passed + 1; else failed := array_append(failed, 'ended founding forfeits price'); end if;

  -- 7) The founding price needs a founding claim.
  begin
    perform public.billing_record_stripe_subscription(reg, 'cus_r_' || tag, 'sub_rx_' || tag, 'founding', 'trialing', null, season_end, false, true);
    ok := false;
  exception when others then ok := sqlerrm like '%founding claim%';
  end;
  if ok then passed := passed + 1; else failed := array_append(failed, 'founding needs a claim'); end if;

  -- 8) A regular yearly member gets an annual row; unknown plans and statuses are refused.
  perform public.billing_record_stripe_subscription(reg, 'cus_r_' || tag, 'sub_r_' || tag, 'annual', 'trialing', null, season_end, false, true);
  if (select plan from public.entitlements where source = 'stripe' and external_ref = 'sub_r_' || tag) = 'annual' and private.is_flock_member(reg)
  then passed := passed + 1; else failed := array_append(failed, 'annual row'); end if;
  begin
    perform public.billing_record_stripe_subscription(reg, 'cus_r_' || tag, 'sub_r2_' || tag, 'comp', 'active', null, season_end, false, true);
    ok := false;
  exception when others then ok := sqlerrm like '%unknown plan%';
  end;
  begin
    perform public.billing_record_stripe_subscription(reg, 'cus_r_' || tag, 'sub_r2_' || tag, 'monthly', 'incomplete', null, season_end, false, true);
    ok := false;
  exception when others then ok := ok and sqlerrm like '%unknown status%';
  end;
  if ok then passed := passed + 1; else failed := array_append(failed, 'plan and status refused'); end if;

  -- 9) A subscription or customer can't move to another account.
  begin
    perform public.billing_record_stripe_subscription(reg, 'cus_r_' || tag, 'sub_f_' || tag, 'monthly', 'active', null, season_end, false, true);
    ok := false;
  exception when others then ok := sqlerrm like '%another account%';
  end;
  begin
    perform public.billing_record_stripe_subscription(reg, 'cus_f_' || tag, 'sub_r3_' || tag, 'monthly', 'active', null, season_end, false, true);
    ok := false;
  exception when others then ok := ok and sqlerrm like '%another account%';
  end;
  if ok then passed := passed + 1; else failed := array_append(failed, 'no moving between accounts'); end if;

  -- 10) Events: new once, done once, and a failed attempt can be retried.
  if public.billing_claim_event('stripe', 'evt_' || tag, 'customer.subscription.updated', 'sub_r_' || tag)
     and public.billing_claim_event('stripe', 'evt_' || tag, 'customer.subscription.updated', 'sub_r_' || tag)
  then passed := passed + 1; else failed := array_append(failed, 'unfinished event is retried'); end if;
  perform public.billing_finish_event('stripe', 'evt_' || tag, 'recorded');
  select count(*) into n from public.billing_events where event_id = 'evt_' || tag;
  if not public.billing_claim_event('stripe', 'evt_' || tag, 'customer.subscription.updated', 'sub_r_' || tag) and n = 1
  then passed := passed + 1; else failed := array_append(failed, 'finished event is skipped'); end if;

  -- 11) Free-season rows are untouched by billing: shape constraint still holds.
  begin
    insert into public.entitlements (user_id, plan, status, source, external_ref)
    values (reg, 'comp', 'trialing', 'free_season', null);
    ok := false;
  exception when check_violation then ok := true;
  end;
  if ok then passed := passed + 1; else failed := array_append(failed, 'free-season shape unchanged'); end if;

  -- 12) App users can't read the billing tables or call the functions.
  perform set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', reg)::text, true);
  set local role authenticated;
  ok := true;
  begin perform 1 from public.billing_customers; ok := false; exception when insufficient_privilege then null; end;
  begin perform 1 from public.billing_events; ok := false; exception when insufficient_privilege then null; end;
  begin perform public.billing_record_stripe_subscription(reg, 'cus_x', 'sub_x', 'monthly', 'active', null, null, false, true); ok := false; exception when insufficient_privilege then null; end;
  begin perform public.billing_claim_event('stripe', 'evt_x', 't', null); ok := false; exception when insufficient_privilege then null; end;
  begin perform public.billing_finish_event('stripe', 'evt_x', 'x'); ok := false; exception when insufficient_privilege then null; end;
  begin perform public.billing_founding_price_open(reg); ok := false; exception when insufficient_privilege then null; end;
  -- Their own entitlement rows stay readable, as before.
  select count(*) into n from public.entitlements where source = 'stripe';
  reset role;
  if ok and n = 1 then passed := passed + 1; else failed := array_append(failed, 'app users locked out, own rows readable'); end if;

  set local role anon;
  ok := true;
  begin perform 1 from public.billing_customers; ok := false; exception when insufficient_privilege then null; end;
  begin perform public.billing_claim_event('stripe', 'evt_y', 't', null); ok := false; exception when insufficient_privilege then null; end;
  reset role;
  if ok then passed := passed + 1; else failed := array_append(failed, 'signed-out visitors locked out'); end if;

  -- 13) Deleting an account removes its billing customer row.
  delete from auth.users where id = reg;
  if not exists (select 1 from public.billing_customers where user_id = reg) then passed := passed + 1; else failed := array_append(failed, 'account deletion cascades'); end if;

  raise exception 'BILLING CHECKS: % passed, % failed%', passed, coalesce(array_length(failed, 1), 0),
    case when array_length(failed, 1) > 0 then ': ' || array_to_string(failed, '; ') else '' end;
end $$;
