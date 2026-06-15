ALTER TABLE public.birds
  ADD COLUMN IF NOT EXISTS photo_position TEXT,
  ADD COLUMN IF NOT EXISTS birth_date DATE;