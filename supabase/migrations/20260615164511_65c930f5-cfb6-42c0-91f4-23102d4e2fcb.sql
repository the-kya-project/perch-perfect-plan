
CREATE TABLE public.sit_checklist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sit_id uuid NOT NULL REFERENCES public.sits(id) ON DELETE CASCADE,
  item_key text NOT NULL,
  checked boolean NOT NULL DEFAULT true,
  checked_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sit_id, item_key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sit_checklist_items TO authenticated;
GRANT ALL ON public.sit_checklist_items TO service_role;

ALTER TABLE public.sit_checklist_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage their sit checklist"
ON public.sit_checklist_items
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.sits s
    WHERE s.id = sit_checklist_items.sit_id
      AND s.owner_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.sits s
    WHERE s.id = sit_checklist_items.sit_id
      AND s.owner_id = auth.uid()
  )
);

CREATE INDEX sit_checklist_items_sit_id_idx ON public.sit_checklist_items(sit_id);
