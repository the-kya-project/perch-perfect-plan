-- "Your home" reminders for sitters, entered once and shared by every bird the
-- owner has: hazards, off-limits areas, other pets, cleaning products. Same
-- shape as owner_emergency_defaults: one row per owner, and a bird's own
-- care_plans value (when set) wins over this row. Additive only — no existing
-- column changes; readers merge the two (src/lib/homeDefaults.ts).
CREATE TABLE IF NOT EXISTS public.owner_home_defaults (
  owner_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  hazards text[] NOT NULL DEFAULT '{}',
  hazards_other text,
  off_limits text,
  other_pets text,
  cleaning_instructions text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.owner_home_defaults TO authenticated;
GRANT ALL ON public.owner_home_defaults TO service_role;

ALTER TABLE public.owner_home_defaults ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owner_home_defaults self all" ON public.owner_home_defaults;
CREATE POLICY "owner_home_defaults self all"
  ON public.owner_home_defaults
  FOR ALL
  TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

DROP TRIGGER IF EXISTS owner_home_defaults_updated_at ON public.owner_home_defaults;
CREATE TRIGGER owner_home_defaults_updated_at
  BEFORE UPDATE ON public.owner_home_defaults
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
