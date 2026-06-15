ALTER TABLE public.birds
  ADD COLUMN IF NOT EXISTS setup_complete boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS setup_step integer NOT NULL DEFAULT 0;
UPDATE public.birds SET setup_complete = true WHERE setup_complete = false;