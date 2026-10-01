-- Country on the click log, for /get (the TikTok and Instagram bio link).
--
-- /get is a third entry point into the existing redirect, alongside /get-app
-- and /review, so it logs to app_launch_clicks like the other two rather than
-- to a table of its own. `path` gains 'get' as a value — it is plain text with
-- no check constraint, so nothing here has to change for that.
--
-- country comes from Vercel's x-vercel-ip-country header, resolved at the
-- edge. The IP itself is never read or stored, and the user agent is still
-- dropped on the floor after platform/in_app_browser/is_bot are derived from
-- it (see 20260929170000) — this adds a coarse geography column, not a
-- fingerprint.

alter table public.app_launch_clicks
  add column if not exists country text;  -- ISO 3166-1 alpha-2, or null off-platform

-- RLS is already enabled on this table with no policies, which is what keeps
-- it service-role-only; adding a column does not change that.

-- Re-create the daily view so country and path are available to report on.
-- Unchanged otherwise: still security_invoker (no privileges of its own, so
-- the base table's RLS applies), still excludes bots, and still exposes
-- `resolved` as store_target. `path` is added alongside, so paid social can be
-- read apart from the email without a second query.
--
-- Dropped rather than replaced: `create or replace view` can only append
-- columns at the end, and this inserts path and country in the middle. Nothing
-- reads the view from the app, so dropping it costs nothing.
drop view if exists public.app_launch_clicks_daily;

create view public.app_launch_clicks_daily
with (security_invoker = true) as
select
  date_trunc('day', created_at)::date as day,
  path,
  utm_source,
  utm_campaign,
  utm_content,
  country,
  resolved as store_target,
  count(*) as clicks
from public.app_launch_clicks
where is_bot = false
group by 1, 2, 3, 4, 5, 6, 7
order by 1 desc, 8 desc;

revoke all on public.app_launch_clicks_daily from anon, authenticated;
