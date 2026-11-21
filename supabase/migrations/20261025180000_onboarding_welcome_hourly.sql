-- Onboarding welcome: sent about an hour after confirmation instead of in the
-- daily 15:00 UTC batch.
--
-- 1. public.onboarding_confirmations(p_confirmed_since): each account's
--    auth.users created_at, address and email_confirmed_at, for the two
--    onboarding hooks (service role only). With p_confirmed_since, only those
--    confirmed since then (the welcome hook asks for the last 48 hours); with
--    null, every account, confirmed or not (the daily batch).
--
-- 2. pg_cron job `onboarding-welcome-15min`: posts to
--    /api/public/hooks/onboarding-welcome at :07, :22, :37 and :52 past every
--    hour, with the bearer token from the Vault secret `cron_function_token`
--    (the value of CARE_PLAN_REMINDER_SECRET in Vercel), the same as the other
--    hooks. Off the quarter hours so it never fires in the same second as the
--    daily onboarding-emails batch (15:00), though the two are safe together:
--    the welcome row's primary key lets only one of them hold it.
--    Scheduled only where that secret exists, which is production: staging and
--    preview branches have no cron jobs and no token, and a job there would
--    post to the production app. The daily `onboarding-emails-daily` job is
--    unchanged.

create or replace function public.onboarding_confirmations(p_confirmed_since timestamptz default null)
returns table (user_id uuid, email text, created_at timestamptz, email_confirmed_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select u.id, u.email::text, u.created_at, u.email_confirmed_at
    from auth.users u
   where p_confirmed_since is null
      or u.email_confirmed_at >= p_confirmed_since;
$$;

revoke all on function public.onboarding_confirmations(timestamptz) from public, anon, authenticated;
grant execute on function public.onboarding_confirmations(timestamptz) to service_role;

do $$
begin
  if to_regclass('cron.job') is null then
    raise notice 'pg_cron not installed; onboarding-welcome job not scheduled';
    return;
  end if;
  if not exists (select 1 from vault.decrypted_secrets where name = 'cron_function_token') then
    raise notice 'no cron_function_token in Vault; onboarding-welcome job not scheduled';
    return;
  end if;
  if exists (select 1 from cron.job where jobname = 'onboarding-welcome-15min') then
    return;
  end if;
  perform cron.schedule(
    'onboarding-welcome-15min',
    '7,22,37,52 * * * *',
    $cmd$select net.http_post(
      url := 'https://app.thekyaproject.com/api/public/hooks/onboarding-welcome',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_function_token'),
        'Content-Type', 'application/json'),
      body := '{}'::jsonb)$cmd$
  );
end;
$$;
