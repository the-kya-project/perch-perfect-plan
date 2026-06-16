
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS marketing_opt_in boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name, marketing_opt_in)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
    COALESCE((NEW.raw_user_meta_data->>'marketing_opt_in')::boolean, false)
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Tighten sitter token expiry to end of the sit's end_date (was end_date + 1 day).
CREATE OR REPLACE FUNCTION public.enforce_sit_token_rules()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.invite_token := replace(gen_random_uuid()::text, '-', '')
                     || replace(gen_random_uuid()::text, '-', '');
  ELSIF TG_OP = 'UPDATE' THEN
    NEW.invite_token := OLD.invite_token;
  END IF;
  -- Expire at 23:59:59 UTC on the sit's end_date.
  NEW.token_expires_at := ((NEW.end_date + 1)::timestamp AT TIME ZONE 'UTC') - interval '1 second';
  RETURN NEW;
END;
$$;

UPDATE public.sits
SET token_expires_at = ((end_date + 1)::timestamp AT TIME ZONE 'UTC') - interval '1 second'
WHERE token_expires_at <> ((end_date + 1)::timestamp AT TIME ZONE 'UTC') - interval '1 second';
