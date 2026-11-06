-- Sign-ups that should reach Brevo: our own copy, and loud failures.
--
-- Why: on Nov 6, 2026 an audit found Brevo list 4 ("TKP Waitlist") empty
-- although people had joined the waitlist from the app and the website, and
-- ten website submissions thrown away as bots because autofill had filled the
-- hidden anti-spam field. Brevo was the only record, so none of it could be
-- recovered.
--
-- 1. public.waitlist_signups: one row per person on the community waitlist
--    (app: joinWaitlist; website: site-forms form=waitlist). Written by the
--    service role only. Admins may read it; nobody else may read or write.
--
-- 2. public.site_form_holds: website submissions that looked like a bot ONLY
--    because the hidden field was filled (a real-looking email, and the form
--    was on screen long enough for a person). Held here for a person to look
--    at instead of being thrown away. Same access as waitlist_signups.
--
-- 3. public.save_errors accepts server-side rows: category 'config' (a
--    missing setting such as a Brevo list id), platform 'server' (the app's
--    server functions and the Supabase edge functions), and operation
--    'brevo_list' (adding a contact to a Brevo list). These rows are written
--    by the service role (src/lib/serverSaveErrors.server.ts,
--    supabase/functions/_shared/saveErrors.ts); still no personal data.
--
-- Idempotent: safe to run again.

-- 1. waitlist_signups --------------------------------------------------------
create table if not exists public.waitlist_signups (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  email text not null check (char_length(email) between 3 and 254 and email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'),
  email_normalized text generated always as (lower(btrim(email))) stored,
  first_name text check (char_length(first_name) <= 100),
  last_name text check (char_length(last_name) <= 100),
  -- The Brevo form's ids: 1 = yes, 2 = no.
  chapter_lead_interest smallint check (chapter_lead_interest in (1, 2)),
  -- The Brevo PRIMARY_CHAPTER ids, 1–9 (see WaitlistCard.tsx).
  primary_chapter smallint check (primary_chapter between 1 and 9),
  source text not null check (source in ('waitlist-app', 'waitlist-website')),
  -- What happened when we added them to Brevo list 4: 'added', 'skipped:<why>'
  -- or 'failed:<why>'. Null until tried. Lets a backfill find who is missing.
  brevo_status text check (char_length(brevo_status) <= 80),
  brevo_synced_at timestamptz
);

create unique index if not exists waitlist_signups_email_key on public.waitlist_signups (email_normalized);
create index if not exists waitlist_signups_created_at_idx on public.waitlist_signups (created_at);

alter table public.waitlist_signups enable row level security;
revoke all on table public.waitlist_signups from public, anon, authenticated;
grant select on table public.waitlist_signups to authenticated;
grant all on table public.waitlist_signups to service_role;

drop policy if exists "waitlist_signups admin read" on public.waitlist_signups;
create policy "waitlist_signups admin read" on public.waitlist_signups
  for select to authenticated
  using (private.is_admin((select auth.uid())));

-- 2. site_form_holds ---------------------------------------------------------
create table if not exists public.site_form_holds (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  -- The website form's name (newsletter, event-waitlist, contact, waitlist,
  -- rescue-partner, conservation-partner, visit-request).
  form text not null check (form ~ '^[a-z][a-z-]{0,39}$'),
  email text not null check (char_length(email) <= 254),
  -- The submission as sent, minus the hidden field's value.
  payload jsonb not null default '{}'::jsonb,
  -- Seconds between the form appearing and being sent, as the page reported.
  seconds_on_screen integer check (seconds_on_screen >= 0),
  -- Set when someone has looked at it.
  reviewed_at timestamptz,
  review_outcome text check (review_outcome in ('added', 'spam'))
);

create index if not exists site_form_holds_open_idx on public.site_form_holds (created_at) where reviewed_at is null;

alter table public.site_form_holds enable row level security;
revoke all on table public.site_form_holds from public, anon, authenticated;
grant select on table public.site_form_holds to authenticated;
grant all on table public.site_form_holds to service_role;

drop policy if exists "site_form_holds admin read" on public.site_form_holds;
create policy "site_form_holds admin read" on public.site_form_holds
  for select to authenticated
  using (private.is_admin((select auth.uid())));

-- Flood guard for both tables: anything public can make the server write a
-- row, so past 300 rows in 10 minutes new rows are dropped quietly.
create or replace function private.signup_rows_flood_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  recent integer;
begin
  execute format('select count(*) from %I.%I where created_at > now() - interval ''10 minutes''', tg_table_schema, tg_table_name)
    into recent;
  if recent >= 300 then
    return null;
  end if;
  return new;
end;
$$;

revoke all on function private.signup_rows_flood_guard() from public, anon, authenticated;

drop trigger if exists waitlist_signups_flood_guard on public.waitlist_signups;
create trigger waitlist_signups_flood_guard
  before insert on public.waitlist_signups
  for each row execute function private.signup_rows_flood_guard();

drop trigger if exists site_form_holds_flood_guard on public.site_form_holds;
create trigger site_form_holds_flood_guard
  before insert on public.site_form_holds
  for each row execute function private.signup_rows_flood_guard();

-- 3. save_errors: server-side rows ------------------------------------------
alter table public.save_errors drop constraint if exists save_errors_category_check;
alter table public.save_errors add constraint save_errors_category_check check (category in (
  'permission', 'conflict', 'still_linked', 'missing_required', 'invalid',
  'schema', 'auth', 'rejected', 'database', 'server', 'network', 'config'));

alter table public.save_errors drop constraint if exists save_errors_platform_check;
alter table public.save_errors add constraint save_errors_platform_check
  check (platform in ('web', 'ios', 'android', 'server'));

alter table public.save_errors drop constraint if exists save_errors_operation_check;
alter table public.save_errors add constraint save_errors_operation_check
  check (operation in ('write', 'delete', 'rpc', 'storage', 'server_fn', 'brevo_list'));
