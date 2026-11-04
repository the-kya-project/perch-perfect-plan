-- Pins docs/reports/welcome-overdue.sql (the daily health audit's welcome
-- check) to the welcome rule in src/lib/welcomeTiming.ts.
--
-- Loads the report file as written, makes its own accounts, runs the report
-- at chosen moments (kya.audit_now) and checks who it lists, then raises so
-- everything rolls back. The exception message IS the result:
--   "WELCOME OVERDUE CHECKS: n passed, 0 failed"           → all good
--   "WELCOME OVERDUE CHECKS: n passed, k failed: <names>"  → which ones broke
-- Run from the repo root (scripts/db-checks.sh does): the report is read with
-- psql's \set and a backtick, so this file needs psql, not the SQL editor.
--
-- The point: an account held on purpose for quiet hours (Jana, Austen, Nov
-- 2026: Apple sign-ins late in the evening their time) is never listed while
-- it waits, and a real miss is.
\set welcome_sql `cat docs/reports/welcome-overdue.sql`
select set_config('kya.welcome_overdue_sql', :'welcome_sql', false) as _loaded \gset

do $$
declare
  passed int := 0; failed text[] := '{}';
  -- Apple sign-in, confirmed 05:58 UTC = 23:58 Chicago: held to 8 AM (14:00 UTC).
  jana uuid := gen_random_uuid();
  -- Apple sign-in, confirmed 02:14 UTC = 22:14 New York: held to 13:00 UTC.
  austen uuid := gen_random_uuid();
  -- Email sign-up, no time zone: due at the hour, no hold.
  plain uuid := gen_random_uuid();
  -- Chicago, hour mark 21:59, but the first run (22:07) is at night → the
  -- first run after 7 AM (13:07 UTC).
  edge uuid := gen_random_uuid();
  -- Already welcomed / opted out / before the series / only a passed bird.
  welcomed uuid := gen_random_uuid();
  opted_out uuid := gen_random_uuid();
  pre_series uuid := gen_random_uuid();
  grieving uuid := gen_random_uuid();
  -- No profile row at all (the auth row alone must be enough).
  no_profile uuid := gen_random_uuid();
  -- A blank time zone (the profiles trigger stores it as none; unknown
  -- names are refused there, so they can't reach the report).
  bad_tz uuid := gen_random_uuid();
  -- Confirmed 3 days ago and never sent → 'missed'.
  missed uuid := gen_random_uuid();
  r record;
begin
  insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, email_confirmed_at)
  values
    ('00000000-0000-0000-0000-000000000000', jana, 'authenticated', 'authenticated', 'jana-check@privaterelay.appleid.com',
      '{"provider":"apple","providers":["apple"]}', '{"full_name":"Jana Check"}', '2026-11-04T05:58:12Z', now(), '2026-11-04T05:58:12.1Z'),
    ('00000000-0000-0000-0000-000000000000', austen, 'authenticated', 'authenticated', 'austen-check@privaterelay.appleid.com',
      '{"provider":"apple","providers":["apple"]}', '{"full_name":"Austen Check"}', '2026-11-03T02:14:29Z', now(), '2026-11-03T02:14:29.1Z'),
    ('00000000-0000-0000-0000-000000000000', plain, 'authenticated', 'authenticated', plain::text || '@checks.invalid',
      '{"provider":"email"}', '{}', '2026-11-04T09:50:00Z', now(), '2026-11-04T10:00:00Z'),
    ('00000000-0000-0000-0000-000000000000', edge, 'authenticated', 'authenticated', 'edge-check@privaterelay.appleid.com',
      '{"provider":"apple"}', '{}', '2026-11-05T02:59:00Z', now(), '2026-11-05T02:59:00Z'),
    ('00000000-0000-0000-0000-000000000000', welcomed, 'authenticated', 'authenticated', welcomed::text || '@checks.invalid',
      '{"provider":"email"}', '{}', '2026-11-04T09:50:00Z', now(), '2026-11-04T10:00:00Z'),
    ('00000000-0000-0000-0000-000000000000', opted_out, 'authenticated', 'authenticated', opted_out::text || '@checks.invalid',
      '{"provider":"email"}', '{}', '2026-11-04T09:50:00Z', now(), '2026-11-04T10:00:00Z'),
    ('00000000-0000-0000-0000-000000000000', pre_series, 'authenticated', 'authenticated', pre_series::text || '@checks.invalid',
      '{"provider":"email"}', '{}', '2026-09-01T00:00:00Z', now(), '2026-11-04T10:00:00Z'),
    ('00000000-0000-0000-0000-000000000000', grieving, 'authenticated', 'authenticated', grieving::text || '@checks.invalid',
      '{"provider":"email"}', '{}', '2026-11-04T09:50:00Z', now(), '2026-11-04T10:00:00Z'),
    ('00000000-0000-0000-0000-000000000000', no_profile, 'authenticated', 'authenticated', 'noprofile-check@privaterelay.appleid.com',
      '{"provider":"apple"}', '{}', '2026-11-04T10:00:00Z', now(), '2026-11-04T10:00:00Z'),
    ('00000000-0000-0000-0000-000000000000', bad_tz, 'authenticated', 'authenticated', bad_tz::text || '@checks.invalid',
      '{"provider":"email"}', '{}', '2026-11-04T01:00:00Z', now(), '2026-11-04T02:00:00Z'),
    ('00000000-0000-0000-0000-000000000000', missed, 'authenticated', 'authenticated', missed::text || '@checks.invalid',
      '{"provider":"email"}', '{}', '2026-11-01T09:00:00Z', now(), '2026-11-01T10:00:00Z');

  -- The sign-up trigger made a profile for each; set what the sign-up would have.
  update public.profiles p set created_at = u.created_at, time_zone = null, notify_onboarding = true
    from auth.users u where u.id = p.id and p.id in (jana, austen, plain, edge, welcomed, opted_out, pre_series, grieving, no_profile, bad_tz, missed);
  update public.profiles set time_zone = 'America/Chicago' where id in (jana, edge);
  update public.profiles set time_zone = 'America/New_York' where id = austen;
  update public.profiles set time_zone = '   ' where id = bad_tz;
  update public.profiles set notify_onboarding = false where id = opted_out;
  delete from public.profiles where id = no_profile;
  insert into public.onboarding_email_log (user_id, stage, status, sent_at) values (welcomed, 'welcome', 'sent', '2026-11-04T11:07:00Z');
  insert into public.birds (owner_id, name, passed_at) values (grieving, 'Sunny', '2026-11-04T09:00:00Z');

  create temp table overdue_now (at timestamptz, user_id uuid, scheduled_send_at timestamptz, quiet_hours_hold boolean, status text) on commit drop;
  -- Run the report, exactly as written, at each moment.
  for r in select unnest(array[
      '2026-11-03T12:00:00Z', '2026-11-03T14:01:00Z',
      '2026-11-04T11:59:00Z', '2026-11-04T12:01:00Z', '2026-11-04T13:12:00Z', '2026-11-04T14:30:00Z', '2026-11-04T15:01:00Z',
      '2026-11-05T05:30:00Z', '2026-11-05T13:59:00Z', '2026-11-05T14:01:00Z'
    ]::timestamptz[]) as at
  loop
    perform set_config('kya.audit_now', r.at::text, true);
    execute format(
      'insert into overdue_now select %L::timestamptz, user_id, scheduled_send_at, quiet_hours_hold, status from (%s) q',
      r.at, current_setting('kya.welcome_overdue_sql'));
  end loop;
  perform set_config('kya.audit_now', '', true);

  -- 1) Jana at 13:12 UTC (7 hours after confirming, still before 8 AM Chicago): not listed.
  if not exists (select 1 from overdue_now where user_id = jana and at = '2026-11-04T13:12:00Z')
    then passed := passed + 1; else failed := array_append(failed, 'jana waiting for 8 AM is not overdue'); end if;
  -- 2) Jana at 14:30 (sent at 14:07 in real life; still inside the allowance): not listed.
  if not exists (select 1 from overdue_now where user_id = jana and at = '2026-11-04T14:30:00Z')
    then passed := passed + 1; else failed := array_append(failed, 'jana inside the allowance'); end if;
  -- 3) Jana at 15:01 with no welcome: listed, scheduled 14:00 UTC, as a quiet-hours hold.
  if exists (select 1 from overdue_now where user_id = jana and at = '2026-11-04T15:01:00Z'
               and scheduled_send_at = '2026-11-04T14:00:00Z' and quiet_hours_hold and status = 'late')
    then passed := passed + 1; else failed := array_append(failed, 'jana listed once really late, scheduled 14:00'); end if;
  -- 4) Austen: not at 12:00 UTC (before 8 AM New York), listed at 14:01, scheduled 13:00.
  if not exists (select 1 from overdue_now where user_id = austen and at = '2026-11-03T12:00:00Z')
     and exists (select 1 from overdue_now where user_id = austen and at = '2026-11-03T14:01:00Z' and scheduled_send_at = '2026-11-03T13:00:00Z')
    then passed := passed + 1; else failed := array_append(failed, 'austen held to 13:00 UTC'); end if;
  -- 5) No time zone keeps the old 2-hour allowance: not at 1:59, listed at 2:01.
  if not exists (select 1 from overdue_now where user_id = plain and at = '2026-11-04T11:59:00Z')
     and exists (select 1 from overdue_now where user_id = plain and at = '2026-11-04T12:01:00Z'
                   and scheduled_send_at = '2026-11-04T11:00:00Z' and not quiet_hours_hold)
    then passed := passed + 1; else failed := array_append(failed, 'no time zone: overdue after 2 hours'); end if;
  -- 6) Hour mark 21:59 Chicago, first run 22:07 → held to 7 AM (13:00 UTC), as the hook does.
  if not exists (select 1 from overdue_now where user_id = edge and at in ('2026-11-05T05:30:00Z', '2026-11-05T13:59:00Z'))
     and exists (select 1 from overdue_now where user_id = edge and at = '2026-11-05T14:01:00Z' and scheduled_send_at = '2026-11-05T13:00:00Z')
    then passed := passed + 1; else failed := array_append(failed, 'first run at night waits for morning'); end if;
  -- 7) Never listed: welcomed, opted out, before the series, only a passed bird.
  if not exists (select 1 from overdue_now where user_id in (welcomed, opted_out, pre_series, grieving))
    then passed := passed + 1; else failed := array_append(failed, 'welcomed / opted out / pre-series / passed bird never listed'); end if;
  -- 8) An Apple account with no profile row is still checked (from auth.users alone).
  if exists (select 1 from overdue_now where user_id = no_profile and at = '2026-11-04T12:01:00Z')
    then passed := passed + 1; else failed := array_append(failed, 'no profile row still counted'); end if;
  -- 9) A blank time zone counts as none: no hold, even at 3 AM UTC.
  if exists (select 1 from overdue_now where user_id = bad_tz and at = '2026-11-04T11:59:00Z' and scheduled_send_at = '2026-11-04T03:00:00Z')
    then passed := passed + 1; else failed := array_append(failed, 'blank time zone → no hold'); end if;
  -- 10) Past the 48-hour window → 'missed'.
  if exists (select 1 from overdue_now where user_id = missed and at = '2026-11-04T11:59:00Z' and status = 'missed')
    then passed := passed + 1; else failed := array_append(failed, 'past 48 hours → missed'); end if;

  raise exception 'WELCOME OVERDUE CHECKS: % passed, % failed%', passed, coalesce(array_length(failed, 1), 0),
    case when array_length(failed, 1) > 0 then ': ' || array_to_string(failed, '; ') else '' end;
end;
$$;
