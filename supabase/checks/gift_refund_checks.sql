-- Verification for 20261106200000_gift_partial_refunds.
--
-- Self-contained and leaves nothing behind: it creates a user and three gifts,
-- runs them through redeeming and refunding the way the webhook does, checks the
-- launch rule and the refunded-amount limits, then raises an exception so the
-- whole block rolls back. The exception message IS the result:
--   "GIFT REFUND CHECKS: n passed, 0 failed"           → all good
--   "GIFT REFUND CHECKS: n passed, k failed: <names>"  → which ones broke
-- Run it in the SQL editor (or the Supabase MCP execute_sql) on a branch.
do $$
declare
  u uuid := gen_random_uuid();
  passed int := 0; failed text[] := '{}';
  a uuid; b uuid; c uuid;
  ok boolean; n int;
  tag text := substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);
begin
  insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', u, 'authenticated', 'authenticated', u::text || '@checks.invalid', '{}', '{}', now(), now());

  insert into public.gift_purchases (plan, buyer_email, recipient_name, amount_paid_cents, stripe_checkout_session_id, stripe_payment_intent_id, gift_code)
  values ('flock_year', 'b@checks.invalid', 'A', 24900, 'cs_check_a_' || tag, 'pi_check_a_' || tag, private.new_gift_code())
  returning id into a;
  insert into public.gift_purchases (plan, buyer_email, recipient_name, amount_paid_cents, stripe_checkout_session_id, stripe_payment_intent_id, gift_code)
  values ('flock_year', 'b@checks.invalid', 'B', 30000, 'cs_check_b_' || tag, 'pi_check_b_' || tag, private.new_gift_code())
  returning id into b;
  insert into public.gift_purchases (plan, buyer_email, recipient_name, amount_paid_cents, stripe_checkout_session_id, stripe_payment_intent_id, gift_code)
  values ('flock_year', 'b@checks.invalid', 'C', 30000, 'cs_check_c_' || tag, 'pi_check_c_' || tag, private.new_gift_code())
  returning id into c;

  -- 1) A new gift starts with nothing refunded.
  select count(*) into n from public.gift_purchases where id in (a, b, c) and amount_refunded_cents = 0;
  if n = 3 then passed := passed + 1; else failed := array_append(failed, 'default 0'); end if;

  -- 2) A partial refund is recorded and the gift stays usable.
  update public.gift_purchases set amount_refunded_cents = 1000 where id = a;
  select status = 'paid' into ok from public.gift_purchases where id = a;
  if ok then passed := passed + 1; else failed := array_append(failed, 'partial keeps paid'); end if;

  -- 3) The refunded amount can't go below zero or past what was paid.
  begin
    update public.gift_purchases set amount_refunded_cents = 24901 where id = a;
    ok := false;
  exception when check_violation then ok := true;
  end;
  if ok then passed := passed + 1; else failed := array_append(failed, 'cap at amount paid'); end if;
  begin
    update public.gift_purchases set amount_refunded_cents = -1 where id = a;
    ok := false;
  exception when check_violation then ok := true;
  end;
  if ok then passed := passed + 1; else failed := array_append(failed, 'no negative'); end if;

  -- 4) Launch rule: a redeemed gift grants membership...
  update public.gift_purchases set status = 'redeemed', redeemed_by = u, redeemed_at = now() where id = b;
  select private.gift_grants_membership(status) into ok from public.gift_purchases where id = b;
  if ok then passed := passed + 1; else failed := array_append(failed, 'redeemed grants'); end if;

  -- 5) ...and once refunded it does NOT, though redeemed_by is still recorded.
  update public.gift_purchases set status = 'refunded', refunded_at = now(), amount_refunded_cents = 30000 where id = b;
  select private.gift_grants_membership(status) = false and redeemed_by = u into ok from public.gift_purchases where id = b;
  if ok then passed := passed + 1; else failed := array_append(failed, 'refunded with redeemer does not grant'); end if;

  -- 6) Paid-but-unredeemed and unknown statuses never grant.
  if private.gift_grants_membership('paid') = false and private.gift_grants_membership(null) = false
  then passed := passed + 1; else failed := array_append(failed, 'paid/null do not grant'); end if;

  -- 7) Signed-in people can't call the rule directly; it is for the service role.
  perform set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', u)::text, true);
  set local role authenticated;
  begin
    perform private.gift_grants_membership('redeemed');
    ok := false;
  exception when insufficient_privilege then ok := true;
  end;
  reset role;
  if ok then passed := passed + 1; else failed := array_append(failed, 'authenticated cannot execute'); end if;

  -- 8) A signed-in redeemer still can't change the refunded amount.
  update public.gift_purchases set status = 'redeemed', redeemed_by = u, redeemed_at = now() where id = c;
  set local role authenticated;
  begin
    update public.gift_purchases set amount_refunded_cents = 0 where id = c;
    ok := false;
  exception when insufficient_privilege then ok := true;
  end;
  reset role;
  if ok then passed := passed + 1; else failed := array_append(failed, 'authenticated cannot update'); end if;

  -- 9) No refunded gift anywhere claims a partial amount.
  select count(*) into n from public.gift_purchases where status = 'refunded' and amount_refunded_cents <> amount_paid_cents and id <> b;
  if n = 0 then passed := passed + 1; else failed := array_append(failed, format('backfill (%s rows)', n)); end if;

  raise exception 'GIFT REFUND CHECKS: % passed, % failed%', passed, cardinality(failed),
    case when cardinality(failed) > 0 then ': ' || array_to_string(failed, ', ') else '' end;
end;
$$;
