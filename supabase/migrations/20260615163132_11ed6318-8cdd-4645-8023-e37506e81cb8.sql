
ALTER TABLE public.care_plans
  ADD COLUMN IF NOT EXISTS clip_step_up_path text,
  ADD COLUMN IF NOT EXISTS clip_food_water_path text,
  ADD COLUMN IF NOT EXISTS clip_locations_path text,
  ADD COLUMN IF NOT EXISTS clip_bedtime_path text;
