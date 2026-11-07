-- Verification for 20261107120000_flock_entitlement_grants.
--
-- Self-contained and leaves nothing behind: it makes its own people, claims and
-- gifts, moves the Flock's opening day around, checks who is a member and who
-- has app premium at each step, then raises so the whole block rolls back. The
-- exception message IS the result:
--   "FLOCK GRANTS CHECKS: n passed, 0 failed"           → all good
--   "FLOCK GRANTS CHECKS: n passed, k failed: <names>"  → which ones broke
-- Run by .github/workflows/db-checks.yml on every PR (scripts/db-checks.sh).
do $$
declare
  adm uuid := gen_random_uuid();  -- an admin
  fdr uuid := gen_random_uuid();  -- a founder
  r1  uuid := gen_random_uuid();  -- Flock gift
  r2  uuid := gen_random_uuid();  -- app premium gift
  r3  uuid := gen_random_uuid();  -- Flock gift, then refunded
  r4  uuid := gen_random_uuid();  -- premium running, then a Flock gift arrives
  r5  uuid := gen_random_uuid();  -- an expired Flock gift
  cmp uuid := gen_random_uuid();  -- comp
  cld uuid := gen_random_uuid();  -- chapter lead
  rev uuid := gen_random_uuid();  -- comp, then revoked
  tag text := substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);
  passed int := 0; failed text[] := '{}';
  ok boolean; n int;
  g1 uuid; g2 uuid; g3 uuid; g4 uuid; g4b uuid; g5 uuid; gf uuid;
  opens timestamptz;
  e public.entitlements;
  denied boolean;
begin
  insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  select '00000000-0000-0000-0000-000000000000', u, 'authenticated', 'authenticated', u::text || '@checks.invalid', '{}', '{}', now(), now()
  from unnest(array[adm, fdr, r1, r2, r3, r4, r5, cmp, cld, rev]) as u;
  insert into public.user_roles (user_id, role) values (adm, 'admin');

  -- A fresh start: the Flock has no opening day.
  update public.flock_settings set flock_opens_at = null where id;

  -- Gifts (paid), each redeemed below.
  insert into public.gift_purchases (plan, buyer_email, recipient_name, amount_paid_cents, stripe_checkout_session_id, gift_code)
  values ('flock_year', 'b@checks.invalid', 'R1', 24900, 'cs_fg1_' || tag, private.new_gift_code()) returning id into g1;
  insert into public.gift_purchases (plan, buyer_email, recipient_name, amount_paid_cents, stripe_checkout_session_id, gift_code)
  values ('app_premium_year', 'b@checks.invalid', 'R2', 4900, 'cs_fg2_' || tag, private.new_gift_code()) returning id into g2;
  insert into public.gift_purchases (plan, buyer_email, recipient_name, amount_paid_cents, stripe_checkout_session_id, gift_code)
  values ('flock_year', 'b@checks.invalid', 'R3', 24900, 'cs_fg3_' || tag, private.new_gift_code()) returning id into g3;

  -- 1) A founding claim grants a founding entitlement, with no start yet.
  insert into public.founding_claims (user_id, spot_number, region_slug)
  values (fdr, (select coalesce(max(spot_number), 0) + 1 from public.founding_claims), 'great-lakes');
  select * into e from public.entitlements where user_id = fdr and source = 'founding';
  if e.id is not null and e.plan = 'founding' and e.starts_at is null then passed := passed + 1; else failed := array_append(failed, 'claim grants founding row'); end if;

  -- 2) Founding before the opening day: exists, grants nothing visible.
  if not private.is_flock_member(fdr) and not private.has_app_premium(fdr) then passed := passed + 1; else failed := array_append(failed, 'founding: nothing before opening'); end if;

  -- Redeem the three gifts before any opening day.
  update public.gift_purchases set status = 'redeemed', redeemed_by = r1, redeemed_at = now() where id = g1;
  update public.gift_purchases set status = 'redeemed', redeemed_by = r2, redeemed_at = now() where id = g2;
  update public.gift_purchases set status = 'redeemed', redeemed_by = r3, redeemed_at = now() where id = g3;

  -- 3) A redeemed gift grants a row of the right plan, not started.
  select count(*) into n from public.entitlements
  where (gift_purchase_id = g1 and plan = 'annual' and user_id = r1 and starts_at is null)
     or (gift_purchase_id = g2 and plan = 'app_premium' and user_id = r2 and starts_at is null);
  if n = 2 then passed := passed + 1; else failed := array_append(failed, 'gifts grant rows'); end if;

  -- 4) Gifts before the opening day grant nothing yet.
  if not private.is_flock_member(r1) and not private.has_app_premium(r2) then passed := passed + 1; else failed := array_append(failed, 'gifts: nothing before opening'); end if;

  -- 5) Only an admin sets the opening day.
  denied := false;
  perform set_config('request.jwt.claims', json_build_object('sub', r1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.admin_set_flock_opens_at(now());
  exception when insufficient_privilege then denied := true;
  end;
  reset role;
  if denied then passed := passed + 1; else failed := array_append(failed, 'non-admin cannot set opening'); end if;

  -- Opening day in a month (as the admin).
  opens := date_trunc('second', now()) + interval '30 days';
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.admin_set_flock_opens_at(opens);
  reset role;
  perform set_config('request.jwt.claims', '', true);

  -- 6) Opening day set but still ahead: founding is scheduled, not active.
  select * into e from public.entitlements where user_id = fdr and source = 'founding';
  if e.starts_at = opens and e.free_until = opens + interval '6 months' and e.current_period_end = e.free_until
     and not private.is_flock_member(fdr)
  then passed := passed + 1; else failed := array_append(failed, 'founding scheduled for opening'); end if;

  -- 7) A Flock gift redeemed before opening starts at opening (not yet started).
  select * into e from public.entitlements where gift_purchase_id = g1;
  if e.starts_at = opens and e.current_period_end = opens + interval '1 year' and not private.is_flock_member(r1)
  then passed := passed + 1; else failed := array_append(failed, 'gift not yet started'); end if;

  -- The Flock opened yesterday.
  opens := date_trunc('second', now()) - interval '1 day';
  perform private.set_flock_opens_at(opens);

  -- 8) Founding after opening: a member (trialing), six free months from opening.
  select * into e from public.entitlements where user_id = fdr and source = 'founding';
  if private.is_flock_member(fdr) and e.status = 'trialing' and e.free_until = opens + interval '6 months'
  then passed := passed + 1; else failed := array_append(failed, 'founding active from opening'); end if;

  -- 9) Flock membership includes app premium.
  if private.has_app_premium(fdr) then passed := passed + 1; else failed := array_append(failed, 'flock includes premium'); end if;

  -- 10) Flock gift: the year starts at the later of redemption and opening (redemption, today).
  select * into e from public.entitlements where gift_purchase_id = g1;
  if private.is_flock_member(r1) and e.starts_at = (select redeemed_at from public.gift_purchases where id = g1)
     and e.current_period_end = e.starts_at + interval '1 year'
  then passed := passed + 1; else failed := array_append(failed, 'flock gift active'); end if;

  -- 11) App premium gift: premium, not Flock.
  if private.has_app_premium(r2) and not private.is_flock_member(r2) then passed := passed + 1; else failed := array_append(failed, 'premium gift'); end if;

  -- 12) A refund after redemption ends access.
  if private.is_flock_member(r3) then
    update public.gift_purchases set status = 'refunded', refunded_at = now(), amount_refunded_cents = 24900 where id = g3;
    select * into e from public.entitlements where gift_purchase_id = g3;
    if not private.is_flock_member(r3) and not private.has_app_premium(r3) and e.status = 'canceled'
    then passed := passed + 1; else failed := array_append(failed, 'refund ends access'); end if;
  else
    failed := array_append(failed, 'refund ends access (never started)');
  end if;

  -- 13) Stacking: a founder's Flock gift queues after the free months.
  insert into public.gift_purchases (plan, buyer_email, recipient_name, amount_paid_cents, stripe_checkout_session_id, gift_code)
  values ('flock_year', 'b@checks.invalid', 'F', 24900, 'cs_fgf_' || tag, private.new_gift_code()) returning id into gf;
  update public.gift_purchases set status = 'redeemed', redeemed_by = fdr, redeemed_at = now() where id = gf;
  select * into e from public.entitlements where gift_purchase_id = gf;
  if e.starts_at = opens + interval '6 months' and e.current_period_end = opens + interval '6 months' + interval '1 year'
     and private.is_flock_member(fdr)
  then passed := passed + 1; else failed := array_append(failed, 'gift stacks after founding'); end if;

  -- 14) Overlap never takes time: premium running, then a Flock gift arrives;
  --     the premium year's end moves out by the Flock year it overlaps.
  insert into public.gift_purchases (plan, buyer_email, recipient_name, amount_paid_cents, stripe_checkout_session_id, gift_code)
  values ('app_premium_year', 'b@checks.invalid', 'R4', 4900, 'cs_fg4_' || tag, private.new_gift_code()) returning id into g4;
  update public.gift_purchases set status = 'redeemed', redeemed_by = r4, redeemed_at = now() where id = g4;
  insert into public.gift_purchases (plan, buyer_email, recipient_name, amount_paid_cents, stripe_checkout_session_id, gift_code)
  values ('flock_year', 'b@checks.invalid', 'R4', 24900, 'cs_fg4b_' || tag, private.new_gift_code()) returning id into g4b;
  update public.gift_purchases set status = 'redeemed', redeemed_by = r4, redeemed_at = now() where id = g4b;
  -- The premium year plus every day of the Flock year that overlapped it.
  select * into e from public.entitlements where gift_purchase_id = g4;
  if e.current_period_end = e.starts_at + interval '1 year'
       + (select current_period_end - starts_at from public.entitlements where gift_purchase_id = g4b)
     and private.is_flock_member(r4)
  then passed := passed + 1; else failed := array_append(failed, 'premium extended by flock overlap'); end if;

  -- 15) Grants are idempotent: re-granting a claim or gift adds nothing.
  perform private.grant_founding((select id from public.founding_claims where user_id = fdr));
  perform private.grant_gift(g1);
  select count(*) into n from public.entitlements where user_id in (fdr, r1);
  if n = 3 then passed := passed + 1; else failed := array_append(failed, 'idempotent grants'); end if;

  -- 16) Expired: a Flock gift whose year ran out. (Opening long ago, redeemed two years ago.)
  perform private.set_flock_opens_at(now() - interval '3 years');
  insert into public.gift_purchases (plan, buyer_email, recipient_name, amount_paid_cents, stripe_checkout_session_id, gift_code)
  values ('flock_year', 'b@checks.invalid', 'R5', 24900, 'cs_fg5_' || tag, private.new_gift_code()) returning id into g5;
  update public.gift_purchases set status = 'redeemed', redeemed_by = r5, redeemed_at = now() - interval '2 years' where id = g5;
  select * into e from public.entitlements where gift_purchase_id = g5;
  if e.current_period_end < now() and not private.is_flock_member(r5) then passed := passed + 1; else failed := array_append(failed, 'expired gift'); end if;

  -- 17) Started grants keep their dates when the opening day moves.
  select * into e from public.entitlements where user_id = fdr and source = 'founding';
  if e.starts_at = opens then passed := passed + 1; else failed := array_append(failed, 'started grants keep dates'); end if;

  -- 18) Comp, chapter lead and revoked (admin grants).
  perform private.grant_manual_entitlement(cmp::text || '@checks.invalid', 'comp', null, 'check');
  perform private.grant_manual_entitlement(cld::text || '@checks.invalid', 'chapter_lead', null, 'check');
  perform private.grant_manual_entitlement(rev::text || '@checks.invalid', 'comp', null, 'check');
  perform private.revoke_manual_entitlement(rev::text || '@checks.invalid');
  if private.is_flock_member(cmp) and private.has_app_premium(cmp) then passed := passed + 1; else failed := array_append(failed, 'comp'); end if;
  if private.is_flock_member(cld) then passed := passed + 1; else failed := array_append(failed, 'chapter lead'); end if;
  if not private.is_flock_member(rev) and not private.has_app_premium(rev) then passed := passed + 1; else failed := array_append(failed, 'revoked'); end if;

  -- 19) The RPCs answer for yourself as before.
  perform set_config('request.jwt.claims', json_build_object('sub', r1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := public.is_flock_member() and public.has_app_premium();
  reset role;
  if ok then passed := passed + 1; else failed := array_append(failed, 'self RPCs'); end if;

  -- 20) A signed-in user can't write entitlements: insert, update, delete.
  perform set_config('request.jwt.claims', json_build_object('sub', r2, 'role', 'authenticated')::text, true);
  set local role authenticated;
  n := 0;
  begin
    insert into public.entitlements (user_id, plan, status, source) values (r2, 'comp', 'active', 'manual');
  exception when insufficient_privilege then n := n + 1;
  end;
  begin
    update public.entitlements set current_period_end = now() + interval '10 years' where user_id = r2;
  exception when insufficient_privilege then n := n + 1;
  end;
  begin
    delete from public.entitlements where user_id = r2;
  exception when insufficient_privilege then n := n + 1;
  end;
  -- ...nor run the grant functions directly.
  begin
    perform private.grant_gift(g2);
  exception when insufficient_privilege then n := n + 1;
  end;
  reset role;
  if n = 4 then passed := passed + 1; else failed := array_append(failed, 'user cannot write entitlements (' || n || '/4)'); end if;

  -- 21) The kill switch still works through its new wrapper, admin only.
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.admin_set_flock_ui(false);
  ok := not public.flock_enabled();
  perform public.admin_set_flock_ui(true);
  ok := ok and public.flock_enabled();
  reset role;
  if ok then passed := passed + 1; else failed := array_append(failed, 'kill switch wrapper'); end if;

  -- 22) admin_set_flock_ui is no longer SECURITY DEFINER (the advisor's warning).
  select not prosecdef into ok from pg_proc where oid = 'public.admin_set_flock_ui(boolean)'::regprocedure;
  if ok then passed := passed + 1; else failed := array_append(failed, 'wrapper is invoker'); end if;

  -- 23) Admin views: each claim and gift with its entitlement and dates.
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.admin_founding_entitlements() f where f.entitlement_id is not null and f.free_until is not null;
  select n + count(*) into n from public.admin_gift_entitlements() g where g.gift_id in (g1, g2) and g.starts_at is not null;
  reset role;
  if n >= 3 then passed := passed + 1; else failed := array_append(failed, 'admin views'); end if;

  -- 24) ...and nobody else can read them.
  denied := false;
  perform set_config('request.jwt.claims', json_build_object('sub', r1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform * from public.admin_gift_entitlements();
  exception when insufficient_privilege then denied := true;
  end;
  reset role;
  if denied then passed := passed + 1; else failed := array_append(failed, 'admin views admin only'); end if;

  raise exception 'FLOCK GRANTS CHECKS: % passed, % failed%', passed, coalesce(array_length(failed, 1), 0),
    case when array_length(failed, 1) > 0 then ': ' || array_to_string(failed, ', ') else '' end;
end $$;
