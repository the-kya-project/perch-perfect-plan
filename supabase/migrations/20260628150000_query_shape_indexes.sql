-- Indexes that match query shapes the code ACTUALLY runs (verified against the
-- source), not the full speculative review list. No existing indexes are dropped
-- (the app is too young for index-usage stats). Plain CREATE INDEX (not
-- CONCURRENTLY) because db push wraps migrations in a transaction and the tables
-- are tiny — a brief lock is fine.

-- Bird record + plan-editor logs + household activity feed all order daily_logs
-- by created_at desc for a bird. The existing daily_logs(bird_id, log_date desc)
-- sorts by the wrong column for these.
--   index.tsx: eq(bird_id) order(created_at desc) limit 15
--   plan.editor: eq(bird_id) order(created_at desc) limit 30
--   home.functions: in(bird_id) gte(created_at) order(created_at desc)
create index if not exists idx_daily_logs_bird_created
  on public.daily_logs (bird_id, created_at desc);

-- Journal feed/export order by created_at desc for a bird. The existing
-- journal_entries(bird_id, occurred_on desc) sorts by the wrong column.
--   export: eq(bird_id) order(created_at desc) limit 50
--   journal route: eq(bird_id) order(created_at desc)
--   home.functions: in(bird_id) gte(created_at) order(created_at desc)
create index if not exists idx_journal_entries_bird_created
  on public.journal_entries (bird_id, created_at desc);

-- getSitterScans joins scan photos by daily_log_id (.in("daily_log_id", ids)).
-- The existing photo_logs(bird_id, created_at) doesn't cover this key.
create index if not exists idx_photo_logs_daily_log_id
  on public.photo_logs (daily_log_id);

-- Active/upcoming caregiver lookups filter caregiver_user_id + the sit date
-- window, always with revoked = false; no caregiver_user_id index exists today.
--   useActiveCaregiver: eq(caregiver_user_id) lte(start_date) gte(end_date) eq(revoked,false)
--   loadUpcoming:       eq(caregiver_user_id) gt(start_date) eq(revoked,false) order(start_date)
create index if not exists idx_sits_caregiver_active
  on public.sits (caregiver_user_id, start_date, end_date)
  where revoked = false;
