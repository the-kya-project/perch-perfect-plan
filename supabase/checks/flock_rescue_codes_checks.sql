-- Verification for 20261126130000_flock_rescue_codes (backlog 1.16): partner
-- rescue codes, the adopter's form, admin review, and the six months an
-- approved adoption gives.
--
-- Self-contained: its own admin, adopters and a founder; moves opening day and
-- the free season's end; simulates the members switch being on by replacing
-- flock_enabled() inside the transaction; then raises so everything rolls back.
--   "FLOCK RESCUE CODES CHECKS: n passed, 0 failed"           → all good
--   "FLOCK RESCUE CODES CHECKS: n passed, k failed: <names>"  → which ones broke
-- Run by .github/workflows/db-checks.yml on every PR (scripts/db-checks.sh).
do $$
declare
  adm uuid := gen_random_uuid();  -- admin
  a1  uuid := gen_random_uuid();  -- adopter, approved before opening day
  a2  uuid := gen_random_uuid();  -- adopter on the limited code, approved after the free season
  a3  uuid := gen_random_uuid();  -- finds the limited code full
  a4  uuid := gen_random_uuid();  -- guesses codes
  a5  uuid := gen_random_uuid();  -- declined, tries again
  a6  uuid := gen_random_uuid();  -- claims a founding spot while waiting
  fd  uuid := gen_random_uuid();  -- a founder
  tag text := substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);
  passed int := 0; failed text[] := '{}';
  ok boolean; denied boolean; msg text; n int; v text;
  bb uuid; lim uuid; r1 uuid; r2 uuid; r5 uuid; r6 uuid; gp uuid;
  season_end timestamptz;
  e public.entitlements; g public.entitlements; s record;
begin
  insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  select '00000000-0000-0000-0000-000000000000', u, 'authenticated', 'authenticated', u::text || '@checks.invalid', '{}', '{}', now(), now()
  from unnest(array[adm, a1, a2, a3, a4, a5, a6, fd]) as u;
  insert into public.user_roles (user_id, role) values (adm, 'admin');
  insert into public.founding_claims (user_id, spot_number, region_slug)
  values (fd, (select min(x) from generate_series(1, 50) x where x not in (select spot_number from public.founding_claims)), 'texas');

  -- Like production today: no opening day; a stored end for the free season.
  update public.flock_settings set flock_opens_at = null, ui_enabled = true, members_open = false,
    free_season_ends_at = timestamp '2027-07-06 00:00:00' at time zone 'America/New_York' where id;
  season_end := (select free_season_ends_at from public.flock_settings where id);

  -- 1) With the members switch off, an adopter can't use a code at all.
  denied := false;
  perform set_config('request.jwt.claims', json_build_object('sub', a1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin perform public.flock_rescue_check('BIRDSANDBEAKS'); exception when insufficient_privilege then denied := true; end;
  reset role;
  if denied then passed := passed + 1; else failed := array_append(failed, 'switch off: adopters refused'); end if;

  -- 2) Admin adds partners; codes are stored in capitals, letters and digits only.
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  bb := public.admin_rescue_partner_save(null, 'Birds and Beaks', 'birds-and beaks' || tag, null, false);
  lim := public.admin_rescue_partner_save(null, 'Small Wings', 'small' || tag, 1, false);
  msg := null;
  begin perform public.admin_rescue_partner_save(null, 'Copy', 'BIRDS AND BEAKS' || upper(tag), null, false);
  exception when others then msg := sqlerrm; end;
  reset role;
  if (select code from public.rescue_partners where id = bb) = 'BIRDSANDBEAKS' || upper(tag) and msg = 'code_taken'
  then passed := passed + 1; else failed := array_append(failed, 'codes cleaned and unique'); end if;

  -- 3) Non-admins: no admin functions, no direct reads of the tables.
  perform set_config('request.jwt.claims', json_build_object('sub', a1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  n := 0;
  begin perform public.admin_rescue_partners(); exception when insufficient_privilege then n := n + 1; end;
  begin perform public.admin_rescue_review(gen_random_uuid(), 'approve'); exception when insufficient_privilege then n := n + 1; end;
  begin perform public.admin_rescue_partner_save(null, 'X', 'XXXXXX', null, false); exception when insufficient_privilege then n := n + 1; end;
  begin perform 1 from public.rescue_partners; exception when insufficient_privilege then n := n + 1; end;
  begin perform 1 from public.rescue_redemptions; exception when insufficient_privilege then n := n + 1; end;
  reset role;
  if n = 5 then passed := passed + 1; else failed := array_append(failed, 'non-admins: admin functions and tables refused (' || n || '/5)'); end if;

  -- The members switch, simulated on (rolled back).
  create or replace function public.flock_enabled()
  returns boolean language sql stable security invoker set search_path = ''
  as $f$ select auth.uid() is not null and private.flock_ui_on(); $f$;

  -- 4) A code checks out in any spacing or case; wrong and paused codes give the same answer.
  perform set_config('request.jwt.claims', json_build_object('sub', a1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select x.partner_name into v from public.flock_rescue_check('birds and beaks ' || tag) x where x.ok;
  select x.reason into msg from public.flock_rescue_check('NOPE' || tag) x;
  reset role;
  update public.rescue_partners set paused = true where id = bb;
  set local role authenticated;
  ok := v = 'Birds and Beaks' and msg = 'invalid';
  select x.reason into msg from public.flock_rescue_check('BIRDSANDBEAKS' || tag) x;
  reset role;
  update public.rescue_partners set paused = false where id = bb;
  if ok and msg = 'invalid' then passed := passed + 1; else failed := array_append(failed, 'check: right, wrong and paused codes'); end if;

  -- 5) The form: a future adoption date is refused; a good one waits; a second is refused.
  set local role authenticated;
  msg := null;
  begin perform public.flock_rescue_redeem('BIRDSANDBEAKS' || tag, 'Sunny', 'Sun conure', current_date + 5); exception when others then msg := sqlerrm; end;
  ok := msg = 'adopted_on';
  select x.redemption_id into r1 from public.flock_rescue_redeem('BIRDSANDBEAKS' || tag, '  Sunny ', 'Sun conure', current_date - 3) x;
  select x.reason into msg from public.flock_rescue_redeem('BIRDSANDBEAKS' || tag, 'Kiwi', 'Budgie', current_date - 3) x;
  select * into s from public.flock_rescue_status();
  reset role;
  if ok and msg = 'already_redeemed' and s.status = 'pending' and s.partner_name = 'Birds and Beaks' and s.bird_name = 'Sunny'
     and (select status from public.rescue_redemptions where id = r1) = 'pending'
  then passed := passed + 1; else failed := array_append(failed, 'form: date, waits, one per account'); end if;

  -- 6) A founder can't use a code.
  perform set_config('request.jwt.claims', json_build_object('sub', fd, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select x.reason into msg from public.flock_rescue_check('BIRDSANDBEAKS' || tag) x;
  select * into s from public.flock_rescue_status();
  reset role;
  if msg = 'founder' and s.redemption_id is null and s.has_founding then passed := passed + 1;
  else failed := array_append(failed, 'founder refused'); end if;

  -- 7) The use limit: the second adopter on a one-use code finds it full.
  perform set_config('request.jwt.claims', json_build_object('sub', a2, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select x.redemption_id into r2 from public.flock_rescue_redeem('SMALL' || tag, 'Pip', 'Cockatiel', current_date - 1) x;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', a3, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select x.reason into msg from public.flock_rescue_redeem('SMALL' || tag, 'Bo', 'Budgie', current_date - 1) x;
  reset role;
  if r2 is not null and msg = 'invalid' then passed := passed + 1; else failed := array_append(failed, 'use limit'); end if;

  -- 8) Guessing: ten wrong codes in an hour, then the limit.
  perform set_config('request.jwt.claims', json_build_object('sub', a4, 'role', 'authenticated')::text, true);
  set local role authenticated;
  for i in 1..10 loop
    perform public.flock_rescue_check('WRONG' || i || tag);
  end loop;
  select x.reason into msg from public.flock_rescue_check('BIRDSANDBEAKS' || tag) x;
  reset role;
  if msg = 'rate_limited' then passed := passed + 1; else failed := array_append(failed, 'rate limit'); end if;

  -- 9) Approved before opening day: a free comp membership with no dates and no access yet.
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.admin_rescue_redemptions('pending') x where x.redemption_id in (r1, r2);
  perform public.admin_rescue_review(r1, 'approve');
  msg := null;
  begin perform public.admin_rescue_review(r1, 'decline'); exception when others then msg := sqlerrm; end;
  reset role;
  select * into e from public.entitlements where id = (select entitlement_id from public.rescue_redemptions where id = r1);
  if n = 2 and msg = 'already_reviewed' and e.source = 'rescue' and e.plan = 'comp' and e.status = 'active'
     and e.starts_at is null and e.current_period_end is null and e.free_until is null and e.external_ref is null
     and not private.is_flock_member(a1)
  then passed := passed + 1; else failed := array_append(failed, 'approved before opening: no dates, no access'); end if;

  -- 10) Opening day set (still ahead): six months from the free season's end.
  update public.flock_settings set flock_opens_at = now() + interval '10 days' where id;
  perform private.reschedule_pending_grants(null);
  select * into e from public.entitlements where id = e.id;
  if e.starts_at = season_end
     and e.current_period_end = timestamp '2028-01-06 00:00:00' at time zone 'America/New_York'
     and not private.is_flock_member(a1)
  then passed := passed + 1; else failed := array_append(failed, 'starts at the season end, six months'); end if;

  -- 11) A gift the adopter redeems afterwards queues behind the six months.
  insert into public.gift_purchases (plan, buyer_email, recipient_name, amount_paid_cents, stripe_checkout_session_id, gift_code)
  values ('flock_half_year', 'b@checks.invalid', 'R', 15000, 'cs_rsc_' || tag, private.new_gift_code()) returning id into gp;
  update public.gift_purchases set status = 'redeemed', redeemed_by = a1, redeemed_at = now() where id = gp;
  select * into g from public.entitlements where gift_purchase_id = gp;
  if g.starts_at = e.current_period_end then passed := passed + 1; else failed := array_append(failed, 'a later gift queues behind'); end if;

  -- 12) Moving the free season's end moves the unstarted six months (and the gift behind it).
  update public.flock_settings set free_season_ends_at = season_end + interval '7 days' where id;
  perform private.reschedule_pending_grants(null);
  select * into e from public.entitlements where id = e.id;
  select * into g from public.entitlements where gift_purchase_id = gp;
  ok := e.starts_at = season_end + interval '7 days' and g.starts_at = e.current_period_end;
  update public.flock_settings set free_season_ends_at = season_end where id;
  perform private.reschedule_pending_grants(null);
  select * into e from public.entitlements where id = e.id;
  if ok and e.starts_at = season_end then passed := passed + 1; else failed := array_append(failed, 'season end moves it'); end if;

  -- 13) After the free season: approval starts the six months right away.
  update public.flock_settings set flock_opens_at = now() - interval '200 days', free_season_ends_at = now() - interval '3 days' where id;
  perform private.reschedule_pending_grants(null);
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.admin_rescue_review(r2, 'approve');
  reset role;
  select * into e from public.entitlements where id = (select entitlement_id from public.rescue_redemptions where id = r2);
  if e.starts_at = (select reviewed_at from public.rescue_redemptions where id = r2)
     and e.current_period_end = ((e.starts_at at time zone 'America/New_York') + interval '6 months') at time zone 'America/New_York'
     and private.is_flock_member(a2)
  then passed := passed + 1; else failed := array_append(failed, 'after the season: starts on approval, member now'); end if;

  -- 14) A started rescue membership keeps its dates when settings move.
  update public.flock_settings set free_season_ends_at = now() - interval '1 day' where id;
  perform private.reschedule_pending_grants(null);
  if (select starts_at from public.entitlements where id = e.id) = e.starts_at then passed := passed + 1;
  else failed := array_append(failed, 'started: keeps its dates'); end if;

  -- 15) Declined: no membership, and the adopter may try again.
  perform set_config('request.jwt.claims', json_build_object('sub', a5, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select x.redemption_id into r5 from public.flock_rescue_redeem('BIRDSANDBEAKS' || tag, 'Max', 'Amazon', current_date - 10) x;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.admin_rescue_review(r5, 'decline');
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', a5, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select * into s from public.flock_rescue_status();
  ok := s.status = 'declined';
  perform public.flock_rescue_seen(r5);
  ok := ok and (select x.ok from public.flock_rescue_redeem('BIRDSANDBEAKS' || tag, 'Max', 'Amazon parrot', current_date - 10) x);
  select * into s from public.flock_rescue_status();
  reset role;
  if ok and s.status = 'pending' and not exists (select 1 from public.entitlements where user_id = a5 and source = 'rescue')
  then passed := passed + 1; else failed := array_append(failed, 'declined: no membership, can try again'); end if;

  -- 16) Claimed a founding spot while waiting: the approval is refused.
  perform set_config('request.jwt.claims', json_build_object('sub', a6, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select x.redemption_id into r6 from public.flock_rescue_redeem('BIRDSANDBEAKS' || tag, 'Lou', 'Lovebird', current_date - 2) x;
  reset role;
  insert into public.founding_claims (user_id, spot_number, region_slug)
  values (a6, (select min(x) from generate_series(1, 50) x where x not in (select spot_number from public.founding_claims)), 'texas');
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  msg := null;
  begin perform public.admin_rescue_review(r6, 'approve'); exception when others then msg := sqlerrm; end;
  reset role;
  if msg = 'founder' and (select status from public.rescue_redemptions where id = r6) = 'pending'
  then passed := passed + 1; else failed := array_append(failed, 'founder since: approval refused'); end if;

  -- 17) The partner list counts approved and waiting; pausing works.
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.admin_rescue_partner_pause(bb, true);
  select count(*) into n from public.admin_rescue_partners() x
  where (x.partner_id = bb and x.approved = 1 and x.pending = 2 and x.paused)
     or (x.partner_id = lim and x.approved = 1 and x.pending = 0 and not x.paused and x.use_limit = 1);
  reset role;
  if n = 2 then passed := passed + 1; else failed := array_append(failed, 'partner counts and pause'); end if;

  -- 18) No payment, ever: a rescue row that isn't a free comp is refused.
  begin
    insert into public.entitlements (user_id, plan, status, source) values (a3, 'annual', 'active', 'rescue');
    failed := array_append(failed, 'rescue shape: annual refused');
  exception when check_violation then passed := passed + 1;
  end;
  begin
    insert into public.entitlements (user_id, plan, status, source, free_until) values (a3, 'comp', 'trialing', 'rescue', now());
    failed := array_append(failed, 'rescue shape: trial refused');
  exception when check_violation then passed := passed + 1;
  end;

  raise exception 'FLOCK RESCUE CODES CHECKS: % passed, % failed%', passed, coalesce(array_length(failed, 1), 0),
    case when array_length(failed, 1) > 0 then ': ' || array_to_string(failed, ', ') else '' end;
end $$;
