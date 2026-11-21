-- Gift memberships: the daily job for dated recipient emails.
--
-- Same shape and secret as the other daily hooks: pg_cron posts to
-- /api/public/hooks/gift-emails with the bearer token from the Vault secret
-- `cron_function_token` (the value of CARE_PLAN_REMINDER_SECRET in Vercel).
-- Scheduled only where that secret exists, which is production: staging and
-- preview branches have no cron jobs and no token, and a job there would post
-- to the production app.

do $$
begin
  if to_regclass('cron.job') is null then
    raise notice 'pg_cron not installed; gift-emails job not scheduled';
    return;
  end if;
  if not exists (select 1 from vault.decrypted_secrets where name = 'cron_function_token') then
    raise notice 'no cron_function_token in Vault; gift-emails job not scheduled';
    return;
  end if;
  if exists (select 1 from cron.job where jobname = 'gift-emails-daily') then
    return;
  end if;
  -- 14:15 UTC is 9:15 in Indianapolis in winter.
  perform cron.schedule(
    'gift-emails-daily',
    '15 14 * * *',
    $cmd$select net.http_post(
      url := 'https://app.thekyaproject.com/api/public/hooks/gift-emails',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_function_token'),
        'Content-Type', 'application/json'),
      body := '{}'::jsonb)$cmd$
  );
end;
$$;
