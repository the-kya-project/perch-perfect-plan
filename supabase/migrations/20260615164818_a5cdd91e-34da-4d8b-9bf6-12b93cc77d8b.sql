
ALTER TABLE public.sit_checklist_items
  ADD COLUMN custom_label text,
  ADD COLUMN is_custom boolean NOT NULL DEFAULT false,
  ADD COLUMN tag text NOT NULL DEFAULT 'recommended'
    CHECK (tag IN ('recommended', 'optional'));

ALTER TABLE public.sits
  ADD COLUMN marked_ready_at timestamptz;
