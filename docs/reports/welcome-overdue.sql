-- Welcome emails that are overdue: the daily health audit's welcome check.
--
-- Read-only. Returns one row per confirmed account whose welcome should have
-- gone by now and hasn't (no welcome row in onboarding_email_log, sent or
-- skipped). No rows means nothing is late. An account waiting on purpose (the
-- 8 AM quiet-hours hold) is never listed while it waits.
--
-- It measures against the welcome's own scheduled send time, the same rule as
-- src/lib/welcomeTiming.ts, not "confirmed + 2 hours":
--
--   due        confirmed + 60 minutes
--   quiet      due lands 22:00–06:59 in profiles.time_zone → the next 08:00
--              there. No time zone, or one Postgres doesn't know → due.
--   first run  the hook runs at :07/:22/:37/:52 (UTC). If the first run at or
--              after that time is itself 22:00–06:59 local (confirmed just
--              before 9 PM, say), the hook holds it again, and it goes on the
--              first run after 07:00 local (the hook's late-send check ends
--              at 07:00, not 08:00), so this query expects it at 07:00.
--   late       overdue once now is more than 60 minutes past that time, which
--              is the old 2-hour allowance for an account with no hold.
--
-- Same accounts as the hook: confirmed, signed up on or after SERIES_LAUNCH
-- (2026-09-25), notify_onboarding not false, not an owner whose only birds
-- have passed (the hook sends them nothing, by design). Looks back 7 days.
--
-- `status` is 'late' while the hook can still send it (within 48 hours of
-- confirming) and 'missed' after that: the window closed and it will never go.
--
-- To check a past moment, set kya.audit_now first, e.g.
--   select set_config('kya.audit_now', '2026-11-04T13:12:00Z', false);
-- supabase/checks/welcome_overdue_checks.sql does that to pin this query to
-- the rule. scripts/onboarding-welcome.test.ts checks the numbers above match
-- welcomeTiming.ts. Change all three together.
with params as (
  select coalesce(nullif(current_setting('kya.audit_now', true), '')::timestamptz, now()) as now
),
accounts as (
  select
    u.id as user_id,
    p.first_name,
    u.raw_app_meta_data->>'provider' as provider,
    u.email_confirmed_at as confirmed_at,
    case when exists (select 1 from pg_catalog.pg_timezone_names z where z.name = p.time_zone)
         then p.time_zone end as time_zone
  from auth.users u
  left join public.profiles p on p.id = u.id
  cross join params
  where u.email_confirmed_at is not null
    and u.email_confirmed_at <= params.now
    and u.email_confirmed_at >= params.now - interval '7 days'
    and coalesce(p.created_at, u.created_at) >= timestamptz '2026-09-25 00:00:00+00'
    and p.notify_onboarding is distinct from false
    and not exists (
      select 1 from public.onboarding_email_log l
       where l.user_id = u.id and l.stage = 'welcome' and l.sent_at <= params.now)
    -- Only birds that have passed: the hook holds these (bird_passed).
    and not (
      exists (select 1 from public.birds b where b.owner_id = u.id and b.passed_at is not null)
      and not exists (select 1 from public.birds b where b.owner_id = u.id and b.passed_at is null)
      and not exists (
        select 1 from public.bird_members m join public.birds b on b.id = m.bird_id
         where m.user_id = u.id and m.role = 'household' and b.passed_at is null and b.owner_id <> u.id))
),
-- The 60-minute mark, and its local hour.
due as (
  select a.*, a.confirmed_at + interval '60 minutes' as due_at
  from accounts a
),
-- Held to 8 AM if the 60-minute mark is in quiet hours.
held as (
  select d.*,
    case
      when d.time_zone is null then d.due_at
      when extract(hour from d.due_at at time zone d.time_zone) >= 22
        then ((d.due_at at time zone d.time_zone)::date + 1 + time '08:00') at time zone d.time_zone
      when extract(hour from d.due_at at time zone d.time_zone) < 7
        then ((d.due_at at time zone d.time_zone)::date + time '08:00') at time zone d.time_zone
      else d.due_at
    end as hold_until
  from due d
),
-- The first hook run at or after that.
runs as (
  select h.*,
    (select min(t) from (
       select date_trunc('hour', h.hold_until, 'UTC') + make_interval(hours => hh, mins => mm) as t
         from unnest(array[0, 1]) hh, unnest(array[7, 22, 37, 52]) mm) x
      where t >= h.hold_until) as first_run
  from held h
),
-- …which waits for morning (07:00 local) if it lands in quiet hours.
sched as (
  select r.*,
    case
      when r.time_zone is null then r.hold_until
      when extract(hour from r.first_run at time zone r.time_zone) >= 22
        then ((r.first_run at time zone r.time_zone)::date + 1 + time '07:00') at time zone r.time_zone
      when extract(hour from r.first_run at time zone r.time_zone) < 7
        then ((r.first_run at time zone r.time_zone)::date + time '07:00') at time zone r.time_zone
      else r.hold_until
    end as send_at
  from runs r
)
select
  s.user_id,
  s.first_name,
  s.provider,
  s.time_zone,
  s.confirmed_at,
  s.send_at as scheduled_send_at,
  s.send_at > s.due_at as quiet_hours_hold,
  floor(extract(epoch from (params.now - s.send_at)) / 60)::int as minutes_late,
  case when params.now - s.confirmed_at > interval '48 hours' then 'missed' else 'late' end as status
from sched s
cross join params
where params.now > s.send_at + interval '60 minutes'
order by s.confirmed_at
