-- Structured triage reasons: array of {key, answer} so the concern can be
-- rendered in the reader's language instead of the English prose stored in
-- daily_logs.triage_reasons. Nullable/additive; the English text column stays
-- for back-compat and for the 4 pre-existing rows (which have no codes and fall
-- back to that text). Inherits existing daily_logs RLS.
alter table public.daily_logs add column if not exists triage_reason_codes jsonb;
