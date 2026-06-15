
CREATE TABLE public.owner_emergency_defaults (
  owner_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  owner_phone text,
  backup_name text,
  backup_phone text,
  avian_vet_name text,
  avian_vet_phone text,
  avian_vet_address text,
  emergency_vet_name text,
  emergency_vet_phone text,
  emergency_vet_address text,
  poison_control text,
  carrier_location text,
  first_aid_kit_location text,
  emergency_authorization text,
  spending_limit text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.owner_emergency_defaults TO authenticated;
GRANT ALL ON public.owner_emergency_defaults TO service_role;

ALTER TABLE public.owner_emergency_defaults ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_emergency_defaults self all"
  ON public.owner_emergency_defaults
  FOR ALL
  TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

CREATE TRIGGER owner_emergency_defaults_updated_at
  BEFORE UPDATE ON public.owner_emergency_defaults
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
