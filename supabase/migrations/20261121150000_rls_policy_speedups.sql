-- Clears the Supabase performance advisor's warnings on three tables by
-- rewriting their row-level security policies. Every policy allows and denies
-- exactly the same rows as before; only how Postgres evaluates them changes.
-- Pinned by supabase/checks/rls_policy_speedups_checks.sql.
--
-- 1) auth_rls_initplan: notification_log and owner_home_defaults called
--    auth.uid() bare, so Postgres re-ran it for every row. Wrapped as
--    (select auth.uid()) it runs once per query. Same names, roles, commands.
--
-- 2) multiple_permissive_policies: flock_profiles had two permissive policies
--    each for select, insert and update (a member one and an admin one), so
--    Postgres checked both on every row. Permissive policies combine with OR,
--    so each pair becomes one policy whose condition is the OR of the two:
--      select: admin read            OR member read
--      insert: (own AND admin)       OR (own AND member)  = own AND (admin OR member)
--      update: USING  (own AND admin) OR own              = own
--              CHECK  (own AND admin) OR (own AND member) = own AND (admin OR member)
--    (For update, Postgres ORs the USING clauses and the CHECK clauses
--    separately, which is why the merged USING is just "own".) The member
--    policies keep their names; the "admin" ones are dropped. The delete
--    policy was already single and already wrapped: untouched.
--
-- Nothing else changes: no table, column, grant, function or trigger. The
-- library_resources warnings and the citext/pg_net notices are left as they are.

-- notification_log ------------------------------------------------------------
drop policy if exists "read own notification log" on public.notification_log;
create policy "read own notification log" on public.notification_log
  for select
  using ((select auth.uid()) = user_id);

-- owner_home_defaults ---------------------------------------------------------
drop policy if exists "owner_home_defaults self all" on public.owner_home_defaults;
create policy "owner_home_defaults self all" on public.owner_home_defaults
  for all
  to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

-- flock_profiles --------------------------------------------------------------
drop policy if exists "flock_profiles admin read" on public.flock_profiles;
drop policy if exists "flock_profiles read" on public.flock_profiles;
create policy "flock_profiles read" on public.flock_profiles for select to authenticated
  using (private.is_admin((select auth.uid()))
         or user_id = (select auth.uid())
         or (private.is_flock_member((select auth.uid()))
             and not private.flock_blocked((select auth.uid()), user_id)));

drop policy if exists "flock_profiles admin insert own" on public.flock_profiles;
drop policy if exists "flock_profiles insert" on public.flock_profiles;
create policy "flock_profiles insert" on public.flock_profiles for insert to authenticated
  with check (user_id = (select auth.uid())
              and (private.is_admin((select auth.uid()))
                   or private.is_flock_member((select auth.uid()))));

drop policy if exists "flock_profiles admin update own" on public.flock_profiles;
drop policy if exists "flock_profiles update" on public.flock_profiles;
create policy "flock_profiles update" on public.flock_profiles for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid())
              and (private.is_admin((select auth.uid()))
                   or private.is_flock_member((select auth.uid()))));
