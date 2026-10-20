-- Onboarding email report: one row per stage and button variant.
--
-- Run it in the Supabase SQL editor (read-only; it changes nothing).
--
--   sent              emails that went out (status = 'sent')
--   skipped           how many accounts skipped this stage, and why. Skips
--                     have no variant, so the same figure shows on each of the
--                     stage's rows.
--   humans_clicked    distinct people who clicked any link in that email.
--                     Bots and link scanners (is_bot) and test sends (is_test)
--                     are never counted.
--   click_rate        humans_clicked / sent, for sends that carried tracked
--                     links. Sends from before click tracking shipped show as
--                     variant '(before tracking)' and have no rate.
--   top_link          the link most people clicked, with that count
--
-- Change the date on the marked line to report on a window instead of all time.

with params as (
  select timestamptz '2026-01-01' as since          -- ← reporting window start
),
stage_order(stage, n) as (
  values ('welcome', 1), ('add_first_bird', 2), ('add_first_bird_reminder', 3),
         ('series_weighing', 4), ('series_health_check', 5), ('series_care_plan', 6),
         ('series_journal', 7), ('series_sharing', 8), ('series_vet', 9)
),
sends as (
  select l.stage, coalesce(l.cta_variant, '(before tracking)') as variant, count(*) as sent
  from public.onboarding_email_log l, params
  where l.status = 'sent' and l.sent_at >= params.since
  group by 1, 2
),
skips as (
  select stage,
         sum(n) as skipped,
         string_agg(skipped_reason || ' ' || n, ', ' order by n desc, skipped_reason) as skip_reasons
  from (
    select l.stage, l.skipped_reason, count(*) as n
    from public.onboarding_email_log l, params
    where l.status = 'skipped' and l.sent_at >= params.since
    group by 1, 2
  ) s
  group by 1
),
human as (
  select c.*
  from public.email_clicks c, params
  where not c.is_bot and not c.is_test and c.created_at >= params.since
),
clicks as (
  select email as stage, coalesce(cta_variant, '(none)') as variant, count(distinct user_id) as humans_clicked
  from human
  group by 1, 2
),
top_link as (
  select distinct on (stage, variant) stage, variant, link_key, people
  from (
    select email as stage, coalesce(cta_variant, '(none)') as variant, link_key, count(distinct user_id) as people
    from human
    group by 1, 2, 3
  ) t
  order by stage, variant, people desc, link_key
),
grid as (
  select stage, variant from sends
  union
  select stage, variant from clicks
  union
  -- A stage everyone skipped still gets a row, so you can see why it's quiet.
  select k.stage, '(skipped only)' from skips k
  where not exists (select 1 from sends s where s.stage = k.stage)
)
select
  g.stage,
  g.variant,
  coalesce(s.sent, 0)                                    as sent,
  coalesce(k.skipped, 0)                                 as skipped,
  coalesce(k.skip_reasons, '')                           as skip_reasons,
  coalesce(c.humans_clicked, 0)                          as humans_clicked,
  case when g.variant = '(before tracking)' or coalesce(s.sent, 0) = 0 then null
       else round(100.0 * coalesce(c.humans_clicked, 0) / s.sent, 1) end
                                                         as click_rate_pct,
  case when t.link_key is null then null
       else t.link_key || ' (' || t.people || ')' end    as top_link
from grid g
left join sends s    on s.stage = g.stage and s.variant = g.variant
left join skips k    on k.stage = g.stage
left join clicks c   on c.stage = g.stage and c.variant = g.variant
left join top_link t on t.stage = g.stage and t.variant = g.variant
left join stage_order o on o.stage = g.stage
order by coalesce(o.n, 99), g.stage, g.variant;

-- Every skip, by stage and reason:
--   select stage, skipped_reason, count(*) from public.onboarding_email_log
--   where status = 'skipped' group by 1, 2 order by 1, 3 desc;
--
-- The Flock Report's clicks (email = 'flock_report', no variant):
--   select link_key, count(distinct user_id) as people, count(*) as clicks
--   from public.email_clicks_human where email = 'flock_report'
--   group by 1 order by 2 desc;
--
-- Bot and scanner clicks, to see what the filter is catching:
--   select bot_reason, count(*) from public.email_clicks
--   where is_bot group by 1 order by 2 desc;
