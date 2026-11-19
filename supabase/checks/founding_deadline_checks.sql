-- Verification for 20261118140000_founding_deadline_jan31.
--
-- Founding 50 claims close at the end of Sunday, Jan 31, 2027 in Indianapolis
-- (Eastern), or when all 50 spots are claimed, whichever comes first.
--
-- Self-contained and leaves nothing behind: it makes its own accounts and
-- claims, then raises so the whole block rolls back. The exception message IS
-- the result:
--   "FOUNDING DEADLINE CHECKS: n passed, 0 failed"           → all good
--   "FOUNDING DEADLINE CHECKS: n passed, k failed: <names>"  → which ones broke
-- Run by .github/workflows/db-checks.yml on every PR (scripts/db-checks.sh).
do $$
declare
  d timestamptz := private.founding_deadline();
  usr uuid := gen_random_uuid();
  late uuid := gen_random_uuid();
  region text;
  passed int := 0; failed text[] := '{}';
  ok boolean;
  st record;
  err text;
  i int;
  u uuid;
begin
  select slug into region from public.regions order by sort_order limit 1;

  -- 1) The close is 2027-02-01 05:00 UTC (midnight Feb 1, Indianapolis, EST).
  if d = timestamptz '2027-02-01 05:00:00+00' then passed := passed + 1; else failed := array_append(failed, 'deadline instant'); end if;

  -- 2) 11:59:59 pm on Jan 31 in Indianapolis is still before the close.
  if (timestamp '2027-01-31 23:59:59' at time zone 'America/Indiana/Indianapolis') < d then passed := passed + 1; else failed := array_append(failed, 'Jan 31 23:59:59 open'); end if;

  -- 3) Midnight Feb 1 in Indianapolis is the close itself (closed from then on).
  if (timestamp '2027-02-01 00:00:00' at time zone 'America/Indiana/Indianapolis') = d then passed := passed + 1; else failed := array_append(failed, 'Feb 1 00:00 closed'); end if;

  -- 4) The old close (end of Dec 31, 2026) and opening day (Jan 4) are now inside the window.
  if timestamptz '2027-01-01 05:00:00+00' < d and timestamptz '2027-01-04 05:00:00+00' < d then passed := passed + 1; else failed := array_append(failed, 'Jan 1 and Jan 4 open'); end if;

  -- 5) The public counter agrees with the clock and the cap. (Written to keep
  --    passing after Jan 31, 2027: open must be false then.)
  select * into st from public.founding_status();
  if st.cap = 50 and st.open = (now() < d and st.claimed < 50) then passed := passed + 1; else failed := array_append(failed, 'status open = clock and cap'); end if;

  insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values
    ('00000000-0000-0000-0000-000000000000', usr, 'authenticated', 'authenticated', usr::text || '@checks.invalid', '{}', '{}', now(), now()),
    ('00000000-0000-0000-0000-000000000000', late, 'authenticated', 'authenticated', late::text || '@checks.invalid', '{}', '{}', now(), now());

  -- 6) Before the close, a signed-in person can claim (after it, they're refused with founding_closed).
  err := null;
  perform set_config('request.jwt.claims', json_build_object('sub', usr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.claim_founding_spot(region, 'checks');
  exception when others then
    err := sqlerrm;
  end;
  reset role;
  if (now() < d and err is null and exists (select 1 from public.founding_claims where user_id = usr))
     or (now() >= d and err = 'founding_closed') then
    passed := passed + 1;
  else
    failed := array_append(failed, 'claim before close (' || coalesce(err, 'ok') || ')');
  end if;

  -- 7) Whichever comes first: once all 50 spots are taken, the counter says
  --    closed and the next claim is refused, even before Jan 31.
  if now() < d then
    for i in 1..50 loop
      exit when (select count(*) from public.founding_claims) >= 50;
      u := gen_random_uuid();
      insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
      values ('00000000-0000-0000-0000-000000000000', u, 'authenticated', 'authenticated', u::text || '@checks.invalid', '{}', '{}', now(), now());
      insert into public.founding_claims (user_id, spot_number, region_slug)
      select u, s::smallint, region
      from generate_series(1, 50) s
      where not exists (select 1 from public.founding_claims c where c.spot_number = s)
      order by s limit 1;
    end loop;

    select * into st from public.founding_status();
    err := null;
    perform set_config('request.jwt.claims', json_build_object('sub', late, 'role', 'authenticated')::text, true);
    set local role authenticated;
    begin
      perform public.claim_founding_spot(region, null);
    exception when others then
      err := sqlerrm;
    end;
    reset role;
    if st.claimed = 50 and not st.open and err = 'founding_full' then passed := passed + 1; else failed := array_append(failed, 'full before close (' || coalesce(err, 'ok') || ')'); end if;
  else
    passed := passed + 1; -- after the close the cap can't be reached by claims; nothing to test
  end if;

  raise exception 'FOUNDING DEADLINE CHECKS: % passed, % failed%', passed, coalesce(array_length(failed, 1), 0),
    case when array_length(failed, 1) > 0 then ': ' || array_to_string(failed, ', ') else '' end;
end $$;
