-- Verification for 20261102170000_service_role_email_log_grants.
--
-- The email hooks run as service_role, which bypasses RLS but not table
-- privileges. Raises its result so nothing is left behind:
--   "EMAIL LOG GRANTS CHECKS: n passed, 0 failed"           → all good
--   "EMAIL LOG GRANTS CHECKS: n passed, k failed: <names>"  → which ones broke
-- Run it in the SQL editor (or the Supabase MCP execute_sql) on a branch.
do $$
declare
  passed int := 0; failed text[] := '{}';
  t text; p text;
begin
  foreach t in array array['public.onboarding_email_log', 'public.monthly_letter_log', 'public.bereavement_reviews'] loop
    foreach p in array array['select', 'insert', 'update', 'delete'] loop
      if has_table_privilege('service_role', t, p) then
        passed := passed + 1;
      else
        failed := array_append(failed, format('service_role %s on %s', p, t));
      end if;
    end loop;
  end loop;

  raise exception 'EMAIL LOG GRANTS CHECKS: % passed, % failed%', passed, coalesce(array_length(failed, 1), 0),
    case when array_length(failed, 1) > 0 then ': ' || array_to_string(failed, '; ') else '' end;
end $$;
