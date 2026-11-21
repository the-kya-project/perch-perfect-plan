-- Verification for 20261102170000_service_role_table_grants.
--
-- The server (cron hooks, webhooks, server functions) runs as service_role,
-- which bypasses RLS but not table privileges. Production's default privileges
-- hand it everything on a new public table; a database built from migrations
-- gives it nothing, so a table whose migration forgets the grant works on
-- production and fails everywhere else. This checks every public table and
-- view, so a new one without the grant fails here too.
--
-- Raises its result so nothing is left behind:
--   "SERVICE ROLE GRANTS CHECKS: n passed, 0 failed"           → all good
--   "SERVICE ROLE GRANTS CHECKS: n passed, k failed: <names>"  → which ones broke
-- Run it in the SQL editor (or the Supabase MCP execute_sql) on a branch.
do $$
declare
  passed int := 0; failed text[] := '{}';
  t text; p text;
  -- Deliberate exceptions: table → privileges service_role must NOT need.
  --   gift_purchases: a gift is never deleted, only refunded (20261023140000).
  skip constant jsonb := '{"public.gift_purchases": ["delete"]}';
  -- The tables this migration covers must be there (a rename shouldn't
  -- quietly drop one from the check).
  covered constant text[] := array[
    'onboarding_email_log', 'monthly_letter_log', 'bereavement_reviews',
    'bereavement_email_log', 'app_launch_email_log', 'app_launch_clicks',
    'app_launch_clicks_daily', 'email_clicks', 'email_clicks_human',
    'notification_log', 'household_member_permissions', 'journal_attachments',
    'clip_assets', 'flock_profiles', 'entitlements', 'founding_claims',
    'regions', 'user_roles'];
  missing text[];
begin
  select array_agg(x) into missing from unnest(covered) x where to_regclass('public.' || x) is null;
  if missing is null then passed := passed + 1;
  else failed := array_append(failed, 'covered tables exist: ' || array_to_string(missing, ', ')); end if;

  for t in
    select 'public.' || c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p', 'v') order by c.relname
  loop
    foreach p in array array['select', 'insert', 'update', 'delete'] loop
      continue when coalesce(skip -> t, '[]') ? p;
      if has_table_privilege('service_role', t, p) then
        passed := passed + 1;
      else
        failed := array_append(failed, format('service_role %s on %s', p, t));
      end if;
    end loop;
  end loop;

  raise exception 'SERVICE ROLE GRANTS CHECKS: % passed, % failed%', passed, coalesce(array_length(failed, 1), 0),
    case when array_length(failed, 1) > 0 then ': ' || array_to_string(failed, '; ') else '' end;
end $$;
