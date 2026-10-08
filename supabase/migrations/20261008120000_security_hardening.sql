-- Security hardening.
--
-- 1. pg_cron jobs: move the bearer token out of the job commands into Vault.
--    The five hook jobs (onboarding-emails-daily, engagement-nudges-daily,
--    care-plan-reminders-daily, bereavement-note-daily, monthly-letter) were
--    created by hand in the SQL editor with the token written inline. This reads
--    the token from the existing commands at apply time, stores it as the Vault
--    secret `cron_function_token`, and rewrites each command so the header is
--    built from vault.decrypted_secrets. The token itself never appears in this
--    file. cron.alter_job only swaps the command, so each job keeps its id,
--    name, schedule and active flag (monthly-letter stays paused).
--    On a database without those jobs (preview branches, local) this is a no-op.
--
-- 2. bird-photos bucket: 250 MB -> 15 MB, matching journal-photos and
--    scan-photos. Clips now go to Cloudflare Stream, so the bucket only takes
--    photos; allowed_mime_types is left as is.
--
-- 3. public.journal_attachments: the four policies were created without a TO
--    clause (so they applied to `public`, i.e. anon too). Recreated identically,
--    scoped to authenticated.

-- 1. Cron token -> Vault ----------------------------------------------------
do $$
declare
  job_names constant text[] := array[
    'onboarding-emails-daily',
    'engagement-nudges-daily',
    'care-plan-reminders-daily',
    'bereavement-note-daily',
    'monthly-letter'
  ];
  tokens text[];
  tok text;
  existing text;
  j record;
begin
  if to_regclass('cron.job') is null then
    raise notice 'pg_cron not installed; skipping cron token migration';
    return;
  end if;

  -- Distinct literal tokens across the five jobs ('Bearer <token>' string literals).
  select array_agg(distinct m[1])
    into tokens
    from cron.job,
         lateral regexp_match(command, '''Bearer ([^'']+)''') as m
   where jobname = any(job_names)
     and m is not null;

  if tokens is null then
    raise notice 'no cron job carries an inline bearer token; nothing to move';
  else
    if array_length(tokens, 1) <> 1 then
      raise exception 'expected one shared bearer token across the cron jobs, found %',
        array_length(tokens, 1);
    end if;
    tok := tokens[1];

    select decrypted_secret into existing
      from vault.decrypted_secrets where name = 'cron_function_token';
    if existing is null then
      perform vault.create_secret(tok, 'cron_function_token',
        'Bearer token pg_cron jobs send to the /api/public/hooks/* endpoints');
    elsif existing <> tok then
      raise exception 'vault secret cron_function_token exists with a different value';
    end if;

    if not exists (select 1 from vault.decrypted_secrets
                    where name = 'cron_function_token' and decrypted_secret = tok) then
      raise exception 'vault secret cron_function_token does not hold the jobs'' token';
    end if;

    for j in
      select jobid, jobname, command from cron.job
       where jobname = any(job_names)
         and position(quote_literal('Bearer ' || tok) in command) > 0
    loop
      perform cron.alter_job(
        job_id  := j.jobid,
        command := replace(
          j.command,
          quote_literal('Bearer ' || tok),
          '''Bearer '' || (select decrypted_secret from vault.decrypted_secrets where name = ''cron_function_token'')'
        )
      );
    end loop;
  end if;

  -- No job may still carry "Bearer " followed by a literal token.
  if exists (select 1 from cron.job where command ~ 'Bearer [^''[:space:]]') then
    raise exception 'a cron.job command still contains an inline bearer token';
  end if;
end
$$;

-- 2. bird-photos size limit -------------------------------------------------
update storage.buckets
   set file_size_limit = 15728640 -- 15 MB
 where id = 'bird-photos';

-- 3. journal_attachments policies -> authenticated ---------------------------
drop policy if exists "journal_attachments read" on public.journal_attachments;
create policy "journal_attachments read" on public.journal_attachments
  for select to authenticated
  using (private.has_capability(bird_id, (select auth.uid()), 'view'));

drop policy if exists "journal_attachments insert" on public.journal_attachments;
create policy "journal_attachments insert" on public.journal_attachments
  for insert to authenticated
  with check (private.has_capability(bird_id, (select auth.uid()), 'record_health'));

drop policy if exists "journal_attachments update" on public.journal_attachments;
create policy "journal_attachments update" on public.journal_attachments
  for update to authenticated
  using (private.has_capability(bird_id, (select auth.uid()), 'record_health'))
  with check (private.has_capability(bird_id, (select auth.uid()), 'record_health'));

drop policy if exists "journal_attachments delete" on public.journal_attachments;
create policy "journal_attachments delete" on public.journal_attachments
  for delete to authenticated
  using (exists (
    select 1 from public.birds b
    where b.id = journal_attachments.bird_id and b.owner_id = (select auth.uid())
  ));
