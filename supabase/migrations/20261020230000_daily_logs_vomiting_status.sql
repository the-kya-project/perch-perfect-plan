-- Store the daily check's "face clean, no vomiting" answer.
--
-- 20260619170000_scan_vomiting_status added this column, but production never
-- got it: that version is recorded as applied in schema_migrations (from the
-- one-time `migration repair` of the dashboard-era files) while the column
-- does not exist. The app writes vomiting_status best-effort, so every answer
-- to that question since has been silently dropped. Same statement under a new
-- version so it actually runs. Idempotent: a database that has the column is
-- untouched. Existing checks keep a null answer (it was never stored).
alter table public.daily_logs
  add column if not exists vomiting_status text;
