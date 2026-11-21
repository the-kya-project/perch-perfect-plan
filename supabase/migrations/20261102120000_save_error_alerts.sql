-- Save-error alerting.
--
-- Why: on Oct 26, 2026 a policy change (20261026120000) stopped every owner
-- creating a sit. The app showed "You don't have permission to do that." and
-- nobody heard about it for six days. Now every save the app reports as failed
-- leaves one anonymous row here, and /api/public/hooks/save-error-alerts emails
-- a summary (daily) and an urgent note (new kind of error, or 3+ people in an
-- hour). See src/lib/saveErrors.ts (what is recorded) and
-- src/lib/saveErrorAlerts.ts (when an email goes).
--
-- 1. public.save_errors: one row per failed save. Only shapes, never content:
--    an error category, the SQLSTATE, the table or function the error names,
--    the route PATTERN ("/sitter/$token/scan", never the URL), platform, app
--    version and build, role, and a hashed person id. No names, emails, bird
--    names, notes or error text.
--    App users (anon and authenticated) may INSERT those columns and nothing
--    else: no select, update or delete, and no policy that reads a row. The
--    insert has no RETURNING (supabase-js insert without .select()), so it
--    can't trip over its own read policy the way the sits insert did.
--    A trigger fills user_hash itself for a signed-in person (sha256 of
--    'kya:' || user id, the same id PostHog uses; see src/lib/userHash.ts), so
--    it can't be forged; anonymous visitors (sitter links) may only send an
--    'anon:' hash. It also drops rows quietly past 30 per person or 500 in
--    total in 10 minutes, so a loop or a stranger with the public key can't
--    flood the table or the inbox.
--
-- 2. public.save_error_alerts: which emails went out, so an urgent email goes
--    at most once per error type per day and the daily summary once a day.
--    Service role only.
--
-- 3. pg_cron jobs, scheduled only where the Vault secret `cron_function_token`
--    exists (production; staging and preview branches have none, and a job
--    there would post to the production app). The bearer token is read from
--    the Vault when the job runs, never written into the job:
--      save-error-alerts-15min  urgent check at :02, :17, :32, :47
--      save-error-alerts-daily  daily summary at 13:30 UTC
--
-- Idempotent: safe to run again (staging was given it by hand before merge).

-- 1. save_errors ------------------------------------------------------------
create table if not exists public.save_errors (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  category text not null check (category in (
    'permission', 'conflict', 'still_linked', 'missing_required', 'invalid',
    'schema', 'auth', 'rejected', 'database', 'server', 'network')),
  sqlstate text check (sqlstate ~ '^([0-9A-Z]{5}|PGRST[0-9]{3})$'),
  target text check (target ~ '^[a-z_][a-z0-9_]{0,62}$'),
  operation text check (operation in ('write', 'delete', 'rpc', 'storage', 'server_fn')),
  route text not null check (char_length(route) <= 120 and route ~ '^(/[A-Za-z0-9_$.-]*)+$|^unknown$'),
  platform text not null check (platform in ('web', 'ios', 'android')),
  app_version text not null check (app_version ~ '^[0-9A-Za-z.+-]{1,32}$'),
  web_build text check (web_build ~ '^[0-9A-Za-z]{1,40}$'),
  user_role text check (user_role in ('owner', 'household', 'sitter', 'anonymous')),
  environment text not null default 'production' check (environment in ('production', 'preview', 'development')),
  user_hash text check (user_hash ~ '^(anon:)?[0-9a-f]{16,64}$')
);

create index if not exists save_errors_created_at_idx on public.save_errors (created_at);
create index if not exists save_errors_user_recent_idx on public.save_errors (user_hash, created_at);

alter table public.save_errors enable row level security;

-- Supabase's default privileges give anon/authenticated everything on a new
-- public table; take it all back, then allow inserting the data columns only.
revoke all on table public.save_errors from public, anon, authenticated;
grant insert (category, sqlstate, target, operation, route, platform, app_version,
              web_build, user_role, environment, user_hash)
  on table public.save_errors to anon, authenticated;
grant all on table public.save_errors to service_role;

drop policy if exists "save_errors insert" on public.save_errors;
create policy "save_errors insert" on public.save_errors
  for insert to anon, authenticated
  with check (true);

create or replace function private.save_errors_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  new.created_at := now();
  if uid is not null then
    new.user_hash := encode(sha256(convert_to('kya:' || uid::text, 'UTF8')), 'hex');
  elsif new.user_hash is not null and new.user_hash !~ '^anon:' then
    new.user_hash := null;
  end if;

  -- Flood guards: drop the row (no error, nothing for the app to report).
  if new.user_hash is not null and (
       select count(*) from public.save_errors
        where user_hash = new.user_hash and created_at > now() - interval '10 minutes'
     ) >= 30 then
    return null;
  end if;
  if (select count(*) from public.save_errors where created_at > now() - interval '10 minutes') >= 500 then
    return null;
  end if;
  return new;
end;
$$;

revoke all on function private.save_errors_before_insert() from public, anon, authenticated;

drop trigger if exists save_errors_before_insert on public.save_errors;
create trigger save_errors_before_insert
  before insert on public.save_errors
  for each row execute function private.save_errors_before_insert();

-- 2. save_error_alerts --------------------------------------------------------
create table if not exists public.save_error_alerts (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('urgent', 'daily')),
  -- The error type ("permission|42501|sits|write"), or 'daily'.
  signature text not null,
  -- UTC day: one urgent email per type per day, one daily summary per day.
  alert_day date not null,
  -- urgent: why ('new', 'spike'). daily: empty.
  reasons text[] not null default '{}',
  -- Every error type the email covered, so a type is "new" only until it has
  -- been in an email once.
  signatures text[] not null default '{}',
  sent_at timestamptz not null default now(),
  unique (kind, signature, alert_day)
);

alter table public.save_error_alerts enable row level security;
revoke all on table public.save_error_alerts from public, anon, authenticated;
grant all on table public.save_error_alerts to service_role;

-- 3. Cron jobs ----------------------------------------------------------------
do $$
begin
  if to_regclass('cron.job') is null then
    raise notice 'pg_cron not installed; save-error-alerts jobs not scheduled';
    return;
  end if;
  if not exists (select 1 from vault.decrypted_secrets where name = 'cron_function_token') then
    raise notice 'no cron_function_token in Vault; save-error-alerts jobs not scheduled';
    return;
  end if;
  if not exists (select 1 from cron.job where jobname = 'save-error-alerts-15min') then
    perform cron.schedule(
      'save-error-alerts-15min',
      '2,17,32,47 * * * *',
      $cmd$select net.http_post(
        url := 'https://app.thekyaproject.com/api/public/hooks/save-error-alerts',
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_function_token'),
          'Content-Type', 'application/json'),
        body := '{"mode":"urgent"}'::jsonb)$cmd$
    );
  end if;
  if not exists (select 1 from cron.job where jobname = 'save-error-alerts-daily') then
    -- 13:30 UTC is 8:30 in Indianapolis in winter.
    perform cron.schedule(
      'save-error-alerts-daily',
      '30 13 * * *',
      $cmd$select net.http_post(
        url := 'https://app.thekyaproject.com/api/public/hooks/save-error-alerts',
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_function_token'),
          'Content-Type', 'application/json'),
        body := '{"mode":"daily"}'::jsonb)$cmd$
    );
  end if;
end;
$$;
