-- 1) Join table
CREATE TABLE public.sit_birds (
  sit_id  uuid NOT NULL REFERENCES public.sits(id) ON DELETE CASCADE,
  bird_id uuid NOT NULL REFERENCES public.birds(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (sit_id, bird_id)
);

CREATE INDEX sit_birds_bird_idx ON public.sit_birds(bird_id);
CREATE INDEX sit_birds_sit_idx  ON public.sit_birds(sit_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sit_birds TO authenticated;
GRANT ALL ON public.sit_birds TO service_role;

ALTER TABLE public.sit_birds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sit_birds owner all"
ON public.sit_birds
FOR ALL
TO authenticated
USING (EXISTS (SELECT 1 FROM public.sits s WHERE s.id = sit_birds.sit_id AND s.owner_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.sits s WHERE s.id = sit_birds.sit_id AND s.owner_id = auth.uid()));

-- 2) Backfill existing sits
INSERT INTO public.sit_birds (sit_id, bird_id)
SELECT id, bird_id FROM public.sits
ON CONFLICT DO NOTHING;

-- 3) Drop the single-bird column from sits
ALTER TABLE public.sits DROP COLUMN bird_id;
