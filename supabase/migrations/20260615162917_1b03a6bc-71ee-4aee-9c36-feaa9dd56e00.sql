
ALTER TABLE public.care_plans
  ADD COLUMN IF NOT EXISTS baseline_droppings_path text,
  ADD COLUMN IF NOT EXISTS baseline_clip_path text,
  ADD COLUMN IF NOT EXISTS medication_schedule text,
  ADD COLUMN IF NOT EXISTS whats_normal text;
