-- One-off app-launch announcement: a send log so a re-run cannot double-send,
-- and a click log so we can see which CTA people actually tap.
--
-- Nothing here touches profiles, birds, weights, journal_entries or
-- monthly_letter_log, and nothing here is read by the monthly hook.

create table if not exists public.app_launch_email_log (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  sent_at timestamptz not null default now()
);

-- Every /get-app and /review hit. Deliberately NOT keyed to a user: these URLs
-- are opened from an inbox, often signed out, and the point is the count per
-- CTA rather than who tapped it.
create table if not exists public.app_launch_clicks (
  id uuid primary key default gen_random_uuid(),
  path text not null,                -- 'get-app' | 'review'
  utm_content text,                  -- 'button' | 'badge-ios' | 'badge-android' | 'review'
  utm_source text,
  utm_campaign text,
  resolved text,                     -- 'ios' | 'android' | 'chooser'
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists app_launch_clicks_created_idx on public.app_launch_clicks (created_at desc);
create index if not exists app_launch_clicks_content_idx on public.app_launch_clicks (utm_content);

-- Service-role only. No policies are added on purpose: both tables are written
-- by server routes using the admin client, and nothing in the app reads them.
alter table public.app_launch_email_log enable row level security;
alter table public.app_launch_clicks enable row level security;
