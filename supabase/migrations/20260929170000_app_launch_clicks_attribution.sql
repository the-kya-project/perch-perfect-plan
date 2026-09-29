-- Campaign attribution for /get-app.
--
-- Extends the existing app_launch_clicks rather than adding a second table:
-- /get-app already logs here, and a parallel table would mean every visit
-- writing two rows with different names for the same ideas.
--
-- `resolved` keeps its name so existing code and queries keep working; the
-- reporting view exposes it as store_target.
--
-- user_agent is dropped at the end, but only AFTER the new columns are derived
-- from it — otherwise the existing rows lose their platform for good.

alter table public.app_launch_clicks
  add column if not exists utm_medium text,
  add column if not exists platform text,        -- 'ios' | 'android' | 'desktop' | 'other'
  add column if not exists in_app_browser text,  -- 'tiktok' | 'instagram' | 'facebook' | null
  add column if not exists referrer text,
  add column if not exists is_bot boolean not null default false;

-- ── Backfill from the user agent, before it goes ────────────────────────────
-- Bots first: Bytespider is TikTok's crawler, not the TikTok in-app browser,
-- and would otherwise be counted as a real visit from a phone.
update public.app_launch_clicks set is_bot = true
where user_agent is not null
  and user_agent ~* '(bot|crawler|spider|preview|facebookexternalhit|slackbot|twitterbot|googlebot|bytespider)';

update public.app_launch_clicks set platform =
  case
    when user_agent ~* '(iphone|ipad|ipod)' then 'ios'
    when user_agent ~* 'android' then 'android'
    when user_agent ~* '(macintosh|windows|x11|linux|cros)' then 'desktop'
    else 'other'
  end
where user_agent is not null and platform is null;

update public.app_launch_clicks set in_app_browser =
  case
    -- BytedanceWebview / musical_ly are what TikTok's in-app browser sends.
    when user_agent ~* '(bytedancewebview|musical_ly|tiktok)' then 'tiktok'
    when user_agent ~* 'instagram' then 'instagram'
    when user_agent ~* '(fban|fbav|fb_iab)' then 'facebook'
    else null
  end
where user_agent is not null and in_app_browser is null;

alter table public.app_launch_clicks drop column if exists user_agent;

create index if not exists app_launch_clicks_daily_idx
  on public.app_launch_clicks (created_at desc, utm_campaign);

-- ── Reporting ───────────────────────────────────────────────────────────────
-- security_invoker: the view carries no privileges of its own, so the base
-- table's RLS still applies and only the service role can read it.
create or replace view public.app_launch_clicks_daily
with (security_invoker = true) as
select
  date_trunc('day', created_at)::date as day,
  utm_source,
  utm_campaign,
  utm_content,
  resolved as store_target,
  count(*) as clicks
from public.app_launch_clicks
where is_bot = false
group by 1, 2, 3, 4, 5
order by 1 desc, 6 desc;

revoke all on public.app_launch_clicks_daily from anon, authenticated;
