-- Click tracking for the onboarding emails and The Flock Report.
--
-- Its own table rather than more columns on app_launch_clicks. That table is
-- deliberately NOT keyed to a person (its links are opened signed-out from a
-- TikTok bio or an inbox, and the point is a count per campaign) and its rows
-- are shaped around app-store routing: UTMs, store target, chooser. These rows
-- are the opposite — always one known account, one email, one button variant,
-- one link — and they are joined to onboarding_email_log by (user_id, email).
-- Mixing the two would leave half the columns empty on every row and blur two
-- reports that answer different questions. What IS shared is the machinery:
-- the same redirect pattern, the same platform / in-app browser / bot
-- detection, and the same rule that the user agent is read and never stored.
--
-- One row per click, bots included. A bot click is kept and flagged so it can
-- be audited, and every report filters it out.

create table if not exists public.email_clicks (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid not null references auth.users (id) on delete cascade,
  email text not null,            -- EmailTag: welcome, series_weighing, …, flock_report
  cta_variant text,               -- 'standard' | 'no_bird'; null outside onboarding
  link_key text not null,         -- cta_primary, settings, bird_weight, blog_article, …
  destination text not null,      -- exactly where the reader was sent
  sent_at timestamptz,            -- when the email went out (from the signed link)
  platform text,                  -- 'ios' | 'android' | 'desktop' | 'other'
  in_app_browser text,            -- 'tiktok' | 'instagram' | 'facebook' | null
  is_bot boolean not null default false,
  bot_reason text,                -- user_agent | no_user_agent | head_request | too_fast | burst
  is_test boolean not null default false  -- from the onboarding hook's testSend; never reported
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'email_clicks_variant_check') then
    alter table public.email_clicks
      add constraint email_clicks_variant_check check (cta_variant is null or cta_variant in ('standard', 'no_bird'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'email_clicks_bot_reason_check') then
    alter table public.email_clicks
      add constraint email_clicks_bot_reason_check check (is_bot = (bot_reason is not null));
  end if;
end $$;

create index if not exists email_clicks_email_idx on public.email_clicks (email, created_at desc);
create index if not exists email_clicks_user_email_idx on public.email_clicks (user_id, email, created_at desc);

-- Service-role only, like app_launch_clicks: written by the /r/ redirect with
-- the admin client, read by reports. No policies on purpose.
alter table public.email_clicks enable row level security;

-- Log one click, in one round trip, so the redirect's short logging budget
-- covers it.
--
-- The "burst" rule lives here because it needs the earlier rows: a link
-- scanner opens EVERY link in an email within a second or two, which no person
-- does. When a click lands within 5 seconds of a click on a DIFFERENT link in
-- the same email for the same account, both are flagged. Repeat clicks on the
-- same link are left alone — people double-tap.
create or replace function public.log_email_click(
  p_user_id uuid,
  p_email text,
  p_cta_variant text,
  p_link_key text,
  p_destination text,
  p_sent_at timestamptz,
  p_platform text,
  p_in_app_browser text,
  p_is_bot boolean,
  p_bot_reason text,
  p_is_test boolean default false
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_burst boolean;
begin
  select exists (
    select 1 from public.email_clicks c
    where c.user_id = p_user_id
      and c.email = p_email
      and c.link_key <> p_link_key
      and c.created_at > now() - interval '5 seconds'
  ) into v_burst;

  insert into public.email_clicks
    (user_id, email, cta_variant, link_key, destination, sent_at, platform, in_app_browser, is_bot, bot_reason, is_test)
  values
    (p_user_id, p_email, p_cta_variant, p_link_key, p_destination, p_sent_at, p_platform, p_in_app_browser,
     p_is_bot or v_burst,
     case when p_is_bot then p_bot_reason when v_burst then 'burst' else null end,
     coalesce(p_is_test, false));

  if v_burst then
    update public.email_clicks c
       set is_bot = true, bot_reason = coalesce(c.bot_reason, 'burst')
     where c.user_id = p_user_id
       and c.email = p_email
       and c.created_at > now() - interval '5 seconds'
       and not c.is_bot;
  end if;
end;
$$;

revoke all on function public.log_email_click(uuid, text, text, text, text, timestamptz, text, text, boolean, text, boolean) from public, anon, authenticated;
grant execute on function public.log_email_click(uuid, text, text, text, text, timestamptz, text, text, boolean, text, boolean) to service_role;

-- Real human clicks only, for reporting: no bots, no test sends.
-- security_invoker: no privileges of its own, so the base table's RLS still
-- applies and only the service role reads it.
create or replace view public.email_clicks_human
with (security_invoker = true) as
select * from public.email_clicks where not is_bot and not is_test;

revoke all on public.email_clicks_human from anon, authenticated;
