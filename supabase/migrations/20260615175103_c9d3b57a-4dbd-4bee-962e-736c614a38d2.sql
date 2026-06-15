
ALTER TABLE public.care_plans
  ADD COLUMN IF NOT EXISTS fresh_food_removal_minutes integer NOT NULL DEFAULT 120,
  ADD COLUMN IF NOT EXISTS food_bowl_wash_cadence text NOT NULL DEFAULT 'after_each_fresh',
  ADD COLUMN IF NOT EXISTS water_bowl_wash_cadence text NOT NULL DEFAULT 'once_daily',
  ADD COLUMN IF NOT EXISTS food_hygiene_notes text;
