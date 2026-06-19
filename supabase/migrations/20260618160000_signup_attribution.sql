-- First-touch signup traffic attribution on the user's profile.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS signup_source text,
  ADD COLUMN IF NOT EXISTS signup_medium text,
  ADD COLUMN IF NOT EXISTS signup_campaign text,
  ADD COLUMN IF NOT EXISTS signup_term text,
  ADD COLUMN IF NOT EXISTS signup_content text,
  ADD COLUMN IF NOT EXISTS signup_referrer text,
  ADD COLUMN IF NOT EXISTS signup_landing_page text,
  ADD COLUMN IF NOT EXISTS signup_first_seen_at timestamptz;

-- Extend the new-user trigger to copy attribution from signup metadata.
-- Email/password signups pass it via supabase.auth.signUp({ options: { data } }),
-- so it lands here even when email confirmation defers the session or the user
-- confirms on another device. OAuth signups carry no such metadata (the columns
-- stay null) and are filled client-side on return — see lib/attribution.ts.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (
    id, email, display_name, marketing_opt_in,
    signup_source, signup_medium, signup_campaign, signup_term,
    signup_content, signup_referrer, signup_landing_page, signup_first_seen_at
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
    COALESCE((NEW.raw_user_meta_data->>'marketing_opt_in')::boolean, false),
    NULLIF(NEW.raw_user_meta_data->>'signup_source', ''),
    NULLIF(NEW.raw_user_meta_data->>'signup_medium', ''),
    NULLIF(NEW.raw_user_meta_data->>'signup_campaign', ''),
    NULLIF(NEW.raw_user_meta_data->>'signup_term', ''),
    NULLIF(NEW.raw_user_meta_data->>'signup_content', ''),
    NULLIF(NEW.raw_user_meta_data->>'signup_referrer', ''),
    NULLIF(NEW.raw_user_meta_data->>'signup_landing_page', ''),
    (NULLIF(NEW.raw_user_meta_data->>'signup_first_seen_at', ''))::timestamptz
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
