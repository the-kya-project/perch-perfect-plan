-- Owner-only delete for a bird's history: journal entries, health checks
-- (daily_logs), and weight entries.
--
-- BEFORE: the delete policies were capability-gated —
--   weight_entries -> log_daily_care ; daily_logs/journal_entries -> record_health
-- so a caregiver / care-manager (any preset holding that capability) could delete
-- a bird's history rows.
--
-- AFTER: deleting these rows is restricted to the bird's OWNER
-- (birds.owner_id = auth.uid()), regardless of preset. No other role — care
-- manager, co-owner (preset), caregiver, viewer — can delete, enforced here at
-- the DB. Read/insert/update policies are unchanged (logging still works for
-- capable members; only DELETE is owner-only). Owner short-circuits the birds
-- SELECT RLS, so the subquery is cheap for the only role that passes.

drop policy if exists "weight_entries delete" on public.weight_entries;
create policy "weight_entries delete" on public.weight_entries for delete to authenticated
  using (exists (
    select 1 from public.birds b
    where b.id = weight_entries.bird_id and b.owner_id = (select auth.uid())
  ));

drop policy if exists "daily_logs delete" on public.daily_logs;
create policy "daily_logs delete" on public.daily_logs for delete to authenticated
  using (exists (
    select 1 from public.birds b
    where b.id = daily_logs.bird_id and b.owner_id = (select auth.uid())
  ));

drop policy if exists "journal_entries delete" on public.journal_entries;
create policy "journal_entries delete" on public.journal_entries for delete to authenticated
  using (exists (
    select 1 from public.birds b
    where b.id = journal_entries.bird_id and b.owner_id = (select auth.uid())
  ));
