-- Cron jobs get their own secret, and no secret is ever written where pg_cron
-- records it.
--
-- Before: every pg_cron job built `Authorization: Bearer <token>` from the
-- Vault secret `cron_function_token`, whose value is CARE_PLAN_REMINDER_SECRET,
-- the same key that signs links inside sent emails (unsubscribe, chart images,
-- /r/ click tracking, bereavement review). Until 20261008120000 the jobs held
-- that token in their command text, and pg_cron copied the command into every
-- cron.job_run_details row: 212 rows still had it.
--
-- 1. Vault secret `cron_hook_token`: a new random value made here, inside the
--    database, so it is in no file, log or env var. Only the cron jobs send
--    it, and the hooks check it against the Vault (public.cron_hook_token_matches,
--    service role only), so there is nothing to copy into Vercel and rotating
--    it is one vault.update_secret with no gap. The email-link key
--    (CARE_PLAN_REMINDER_SECRET) is untouched.
--
-- 2. private.call_cron_hook(path, body): the only way a job calls a hook. It
--    reads the token when it runs, so a job's command, and therefore every run
--    history row, is just `select private.call_cron_hook('/api/public/hooks/x')`.
--    The base URL is production's, unless the Vault holds `cron_hook_base_url`;
--    `cron_hook_extra_headers` (a JSON object) adds headers. Both exist only
--    when set by hand on staging, to run the jobs against a PR preview (which
--    sits behind Vercel Authentication).
--
-- 3. Every hook job (nine today) is re-pointed at it, keeping its id, name,
--    schedule and active flag. A job named here that doesn't exist is skipped.
--
-- 4. Run history: rows with a literal bearer token are deleted, and
--    `cron-history-prune-daily` keeps 14 days from now on. Scheduled only
--    where the hook jobs exist (production).
--
-- 5. Guards: the migration fails if any job command or history row still holds
--    a literal bearer token, or any job still reads `cron_function_token`. That
--    Vault secret (a copy of the email-link key) is then deleted.
--
-- Idempotent.

-- 1. The token -------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'cron_hook_token') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'cron_hook_token',
      'Bearer token pg_cron sends to /api/public/hooks/*. Only for cron; the email-link key is CARE_PLAN_REMINDER_SECRET.');
  end if;
end;
$$;

create or replace function public.cron_hook_token_matches(p_token text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(length(p_token) >= 32 and exists (
    select 1 from vault.decrypted_secrets
     where name = 'cron_hook_token' and decrypted_secret = p_token), false);
$$;

revoke all on function public.cron_hook_token_matches(text) from public, anon, authenticated;
grant execute on function public.cron_hook_token_matches(text) to service_role;

-- 2. The caller -------------------------------------------------------------------
create or replace function private.call_cron_hook(p_path text, p_body jsonb default '{}'::jsonb)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  tok text;
  base text;
  extra jsonb;
begin
  if p_path !~ '^/api/public/hooks/[a-z0-9-]+$' then
    raise exception 'call_cron_hook: not a hook path: %', p_path;
  end if;
  select decrypted_secret into tok from vault.decrypted_secrets where name = 'cron_hook_token';
  if tok is null then
    raise exception 'call_cron_hook: no cron_hook_token in Vault';
  end if;
  select decrypted_secret into base from vault.decrypted_secrets where name = 'cron_hook_base_url';
  select decrypted_secret::jsonb into extra from vault.decrypted_secrets where name = 'cron_hook_extra_headers';
  return net.http_post(
    url := coalesce(nullif(rtrim(base, '/'), ''), 'https://app.thekyaproject.com') || p_path,
    headers := coalesce(extra, '{}'::jsonb)
      || jsonb_build_object('Authorization', 'Bearer ' || tok, 'Content-Type', 'application/json'),
    body := coalesce(p_body, '{}'::jsonb));
end;
$$;

revoke all on function private.call_cron_hook(text, jsonb) from public, anon, authenticated;

-- 3-5. Jobs, history, guards --------------------------------------------------------------
do $$
declare
  j record;
  spec record;
begin
  if to_regclass('cron.job') is null then
    raise notice 'pg_cron not installed; no cron jobs to change';
    return;
  end if;

  for spec in
    select * from (values
      ('bereavement-note-daily',    '/api/public/hooks/bereavement-note',    '{}'),
      ('care-plan-reminders-daily', '/api/public/hooks/care-plan-reminders', '{}'),
      ('engagement-nudges-daily',   '/api/public/hooks/engagement-nudges',   '{}'),
      ('gift-emails-daily',         '/api/public/hooks/gift-emails',         '{}'),
      ('monthly-letter',            '/api/public/hooks/monthly-letter',      '{}'),
      ('onboarding-emails-daily',   '/api/public/hooks/onboarding-emails',   '{}'),
      ('onboarding-welcome-15min',  '/api/public/hooks/onboarding-welcome',  '{}'),
      ('save-error-alerts-15min',   '/api/public/hooks/save-error-alerts',   '{"mode":"urgent"}'),
      ('save-error-alerts-daily',   '/api/public/hooks/save-error-alerts',   '{"mode":"daily"}')
    ) as s(jobname, path, body)
  loop
    for j in select jobid, command from cron.job where jobname = spec.jobname loop
      -- The job must be calling the hook we think it is.
      if position(spec.path in j.command) = 0 then
        raise exception 'cron job % does not call %; not changed', spec.jobname, spec.path;
      end if;
      perform cron.alter_job(
        job_id := j.jobid,
        command := format('select private.call_cron_hook(%L, %L::jsonb)', spec.path, spec.body));
    end loop;
  end loop;

  delete from cron.job_run_details where command ~ 'Bearer [^''[:space:]]';

  if exists (select 1 from cron.job where jobname = 'onboarding-emails-daily')
     and not exists (select 1 from cron.job where jobname = 'cron-history-prune-daily') then
    perform cron.schedule(
      'cron-history-prune-daily',
      '45 3 * * *',
      $cmd$delete from cron.job_run_details where end_time < now() - interval '14 days'$cmd$);
  end if;

  if exists (select 1 from cron.job where command ~ 'Bearer [^''[:space:]]') then
    raise exception 'a cron.job command still contains an inline bearer token';
  end if;
  if exists (select 1 from cron.job_run_details where command ~ 'Bearer [^''[:space:]]') then
    raise exception 'cron.job_run_details still holds an inline bearer token';
  end if;
  if exists (select 1 from cron.job where position('cron_function_token' in command) > 0) then
    raise exception 'a cron job still reads cron_function_token';
  end if;
end;
$$;

-- The old secret was a copy of the email-link key; nothing reads it now.
delete from vault.secrets where name = 'cron_function_token';
