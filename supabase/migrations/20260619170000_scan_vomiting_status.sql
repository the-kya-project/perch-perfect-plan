-- The daily health scan asks a "face clean / no vomiting" question, but there
-- was no column to store the sitter's answer, so it was silently dropped. Add it.
-- The app writes this column best-effort, so it is safe to apply at any time.
ALTER TABLE public.daily_logs
  ADD COLUMN IF NOT EXISTS vomiting_status text;
