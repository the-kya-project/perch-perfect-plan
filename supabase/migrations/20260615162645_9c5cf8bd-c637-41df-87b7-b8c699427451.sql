
ALTER TABLE public.care_plans
  ADD COLUMN IF NOT EXISTS step_up text,
  ADD COLUMN IF NOT EXISTS step_up_notes text,
  ADD COLUMN IF NOT EXISTS handlers text,
  ADD COLUMN IF NOT EXISTS likes text,
  ADD COLUMN IF NOT EXISTS fears_triggers text,
  ADD COLUMN IF NOT EXISTS bite_risk text,
  ADD COLUMN IF NOT EXISTS cage_location text,
  ADD COLUMN IF NOT EXISTS out_of_cage_mode text,
  ADD COLUMN IF NOT EXISTS out_of_cage_notes text,
  ADD COLUMN IF NOT EXISTS hazards text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS hazards_other text,
  ADD COLUMN IF NOT EXISTS off_limits text;
