-- Verification for 20261119160000_founding_no_deadline and
-- 20261119150000_founding_free_season_end.
--
-- Founding 50 claims have no closing date: they stay open until all 50 spots
-- are claimed (founding_deadline() is infinity).
-- Founders' free months end with the free season, Tuesday, Jul 6, 2027
-- (00:00 Eastern), not six months after opening day (which would be Jul 4).
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
  fs uuid := gen_random_uuid();
  fdr uuid;
  e public.entitlements;
  season timestamptz;
  region text;
  passed int := 0; failed text[] := '{}';
  ok boolean;
  st record;
  err text;
  i int;
  u uuid;
begin
  select slug into region from public.regions order by sort_order limit 1;

  -- 1) No closing date: the deadline is infinity.
  if d = 'infinity'::timestamptz then passed := passed + 1; else failed := array_append(failed, 'no closing date'); end if;

  -- 2) The old closes (end of Dec 31, 2026 and end of Jan 31, 2027) and a date years out are all still open.
  if timestamptz '2027-01-01 05:00:00+00' < d and timestamptz '2027-02-01 05:00:00+00' < d and timestamptz '2035-01-01 00:00:00+00' < d
  then passed := passed + 1; else failed := array_append(failed, 'old closes and later dates open'); end if;

  -- 3) The public counter is open exactly while fewer than 50 are claimed.
  select * into st from public.founding_status();
  if st.cap = 50 and st.open = (st.claimed < 50) then passed := passed + 1; else failed := array_append(failed, 'status open = cap only'); end if;

  insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values
    ('00000000-0000-0000-0000-000000000000', usr, 'authenticated', 'authenticated', usr::text || '@checks.invalid', '{}', '{}', now(), now()),
    ('00000000-0000-0000-0000-000000000000', late, 'authenticated', 'authenticated', late::text || '@checks.invalid', '{}', '{}', now(), now()),
    ('00000000-0000-0000-0000-000000000000', fs, 'authenticated', 'authenticated', fs::text || '@checks.invalid', '{}', '{}', now(), now());

  -- 4) A signed-in person can claim while spots are left (never founding_closed).
  err := null;
  perform set_config('request.jwt.claims', json_build_object('sub', usr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.claim_founding_spot(region, 'checks');
  exception when others then
    err := sqlerrm;
  end;
  reset role;
  if (st.claimed < 50 and err is null and exists (select 1 from public.founding_claims where user_id = usr))
     or (st.claimed >= 50 and err = 'founding_full') then
    passed := passed + 1;
  else
    failed := array_append(failed, 'claim before close (' || coalesce(err, 'ok') || ')');
  end if;

  -- Free season: the founder from 4), or one claimed directly if 4) found no spot left.
  fdr := usr;
  if not exists (select 1 from public.founding_claims where user_id = usr) then
    insert into public.founding_claims (user_id, spot_number, region_slug)
    select fs, s::smallint, region
    from generate_series(1, 50) s
    where not exists (select 1 from public.founding_claims c where c.spot_number = s)
    order by s limit 1;
    fdr := fs;
  end if;
  -- There's no stored free-season end since 20261122120000; give it a sample
  -- one (the checks below were written around Jul 6, 2027, a sample date here).
  update public.flock_settings set flock_opens_at = null,
    free_season_ends_at = timestamp '2027-07-06 00:00:00' at time zone 'America/New_York' where id;
  season := private.free_season_ends_at();
  -- Opening day is set as the server would (service role), not as the claimant.
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);

  -- 5) The free season ends at 00:00 Eastern on Tue, Jul 6, 2027 (04:00 UTC, EDT).
  if season = timestamptz '2027-07-06 04:00:00+00' then passed := passed + 1; else failed := array_append(failed, 'free season end instant'); end if;

  -- 6) Before opening day is set, a founder's grant has no dates yet.
  perform private.set_flock_opens_at(null);
  select * into e from public.entitlements where user_id = fdr and source = 'founding';
  if e.id is not null and e.starts_at is null and e.free_until is null then passed := passed + 1; else failed := array_append(failed, 'no dates before opening'); end if;

  -- 7) Opening Mon, Jan 4, 2027: free until Jul 6 (the profile's day, in UTC, too), not Jul 4.
  perform private.set_flock_opens_at(timestamp '2027-01-04 00:00:00' at time zone 'America/New_York');
  select * into e from public.entitlements where user_id = fdr and source = 'founding';
  if e.starts_at = timestamptz '2027-01-04 05:00:00+00'
     and e.free_until = season and e.current_period_end = season and e.status = 'trialing'
     and to_char(e.free_until at time zone 'UTC', 'YYYY-MM-DD') = '2027-07-06'
     and e.free_until <> (timestamp '2027-01-04 00:00:00' at time zone 'America/New_York') + interval '6 months'
  then passed := passed + 1; else failed := array_append(failed, 'founder free until Jul 6'); end if;

  -- 8) Moving opening day doesn't move the end: it's one date for everyone.
  perform private.set_flock_opens_at(timestamp '2027-01-11 00:00:00' at time zone 'America/New_York');
  select * into e from public.entitlements where user_id = fdr and source = 'founding';
  if e.starts_at = timestamptz '2027-01-11 05:00:00+00' and e.free_until = season then passed := passed + 1; else failed := array_append(failed, 'end fixed when opening moves'); end if;

  -- 9) Only the server can read the date.
  if not has_function_privilege('authenticated', 'private.free_season_ends_at()', 'execute')
     and not has_function_privilege('anon', 'private.free_season_ends_at()', 'execute')
  then passed := passed + 1; else failed := array_append(failed, 'free season reader is server-only'); end if;
  perform private.set_flock_opens_at(null);

  -- 10) The cap is the only limit: once all 50 spots are taken, the counter
  --     says closed and the next claim is refused with founding_full.
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
  if st.claimed = 50 and not st.open and err = 'founding_full' then passed := passed + 1; else failed := array_append(failed, 'full at 50 (' || coalesce(err, 'ok') || ')'); end if;

  raise exception 'FOUNDING DEADLINE CHECKS: % passed, % failed%', passed, coalesce(array_length(failed, 1), 0),
    case when array_length(failed, 1) > 0 then ': ' || array_to_string(failed, ', ') else '' end;
end $$;
