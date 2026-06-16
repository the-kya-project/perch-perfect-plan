ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS notify_sitter_opened boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_sitter_log boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_care_plan_reminder boolean NOT NULL DEFAULT true;