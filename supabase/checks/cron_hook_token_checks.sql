-- Verification for 20261102150000_cron_hook_token.
--
-- Self-contained and leaves nothing behind: the request it queues through
-- pg_net and the job it schedules are rolled back with everything else when
-- the block raises its result at the end (pg_net only sends committed
-- requests). The exception message IS the result:
--   "CRON TOKEN CHECKS: n passed, 0 failed"           → all good
--   "CRON TOKEN CHECKS: n passed, k failed: <names>"  → which ones broke
-- Run it in the SQL editor (or the Supabase MCP execute_sql) on a branch.
do $$
declare
  passed int := 0; failed text[] := '{}';
  tok text; ok boolean; n int; req bigint; hdrs jsonb; u text; jid bigint;
begin
  -- 1) The cron token exists in the Vault: 64 random hex characters.
  select decrypted_secret into tok from vault.decrypted_secrets where name = 'cron_hook_token';
  if tok ~ '^[0-9a-f]{64}$' then passed := passed + 1; else failed := array_append(failed, 'cron_hook_token in Vault'); end if;

  -- 2) The hooks' check: the token matches; anything else doesn't.
  if public.cron_hook_token_matches(tok) and not public.cron_hook_token_matches(tok || 'x')
     and not public.cron_hook_token_matches(null) and not public.cron_hook_token_matches('') then
    passed := passed + 1;
  else failed := array_append(failed, 'cron_hook_token_matches'); end if;

  -- 3) App users can't ask (it would be an oracle for the token).
  ok := true;
  set local role anon;
  begin perform public.cron_hook_token_matches('x'); ok := false; exception when insufficient_privilege then null; end;
  reset role;
  set local role authenticated;
  begin perform public.cron_hook_token_matches('x'); ok := false; exception when insufficient_privilege then null; end;
  reset role;
  if ok then passed := passed + 1; else failed := array_append(failed, 'matcher closed to app users'); end if;

  -- 4) …nor make the database call a hook.
  ok := true;
  set local role authenticated;
  begin perform private.call_cron_hook('/api/public/hooks/gift-emails'); ok := false; exception when insufficient_privilege then null; end;
  reset role;
  if ok then passed := passed + 1; else failed := array_append(failed, 'call_cron_hook closed to app users'); end if;

  -- 5) Only hook paths.
  begin
    perform private.call_cron_hook('/api/public/../admin');
    failed := array_append(failed, 'call_cron_hook refuses other paths');
  exception when raise_exception then passed := passed + 1;
  end;

  -- 6) A call queues one request to the hook with the token in its header
  --    (rolled back below, so nothing is sent).
  if to_regclass('net.http_request_queue') is not null then
    req := private.call_cron_hook('/api/public/hooks/gift-emails', '{"dryRun":true}'::jsonb);
    select headers, url into hdrs, u from net.http_request_queue where id = req;
    if hdrs ->> 'Authorization' = 'Bearer ' || tok and u like '%/api/public/hooks/gift-emails' then
      passed := passed + 1;
    else failed := array_append(failed, format('call_cron_hook request (%s)', u)); end if;
  else
    passed := passed + 1; -- no pg_net here: nothing to queue
  end if;

  -- 7) A job that calls a hook carries no secret: its command, and so every
  --    run-history row pg_cron copies from it, is just the call.
  if to_regclass('cron.job') is not null then
    jid := cron.schedule('cron-token-check', '0 0 1 1 *', $cmd$select private.call_cron_hook('/api/public/hooks/gift-emails')$cmd$);
    select count(*) into n from cron.job where jobid = jid and (position(tok in command) > 0 or command ~* 'bearer');
    if n = 0 then passed := passed + 1; else failed := array_append(failed, 'job command has no token'); end if;
  else
    passed := passed + 1;
  end if;

  -- 8) No job and no run-history row holds a literal bearer token, and no job
  --    reads the old secret.
  if to_regclass('cron.job') is not null then
    select count(*) into n from cron.job where command ~ 'Bearer [^''[:space:]]' or position('cron_function_token' in command) > 0;
    select n + count(*) into n from cron.job_run_details where command ~ 'Bearer [^''[:space:]]' or position(tok in command) > 0;
  else
    n := 0;
  end if;
  if n = 0 then passed := passed + 1; else failed := array_append(failed, format('no token in jobs or history (%s)', n)); end if;

  -- 9) The old secret (a copy of the email-link key) is gone from the Vault.
  if not exists (select 1 from vault.secrets where name = 'cron_function_token') then passed := passed + 1;
  else failed := array_append(failed, 'cron_function_token removed'); end if;

  raise exception 'CRON TOKEN CHECKS: % passed, % failed%', passed, coalesce(array_length(failed, 1), 0),
    case when array_length(failed, 1) > 0 then ': ' || array_to_string(failed, '; ') else '' end;
end
$$;
