
-- Harden sitter invite tokens: server-side enforces token_expires_at = end_date + 1 day,
-- prevents clients from supplying or changing the opaque token, and keeps revoke working.

CREATE OR REPLACE FUNCTION public.enforce_sit_token_rules()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Always issue a fresh opaque token server-side; ignore any client-supplied value.
    NEW.invite_token := replace(gen_random_uuid()::text, '-', '')
                     || replace(gen_random_uuid()::text, '-', '');
  ELSIF TG_OP = 'UPDATE' THEN
    -- Token is immutable once issued; only revoke can stop access.
    NEW.invite_token := OLD.invite_token;
  END IF;

  -- Tie expiry to the sit's end date (one-day grace past end-of-day UTC).
  NEW.token_expires_at := ((NEW.end_date + 1)::timestamp AT TIME ZONE 'UTC');

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sits_enforce_token_rules ON public.sits;
CREATE TRIGGER sits_enforce_token_rules
BEFORE INSERT OR UPDATE ON public.sits
FOR EACH ROW EXECUTE FUNCTION public.enforce_sit_token_rules();

-- Backfill any existing rows whose expiry drifted from end_date.
UPDATE public.sits
SET token_expires_at = ((end_date + 1)::timestamp AT TIME ZONE 'UTC')
WHERE token_expires_at <> ((end_date + 1)::timestamp AT TIME ZONE 'UTC');
