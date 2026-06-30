-- Capture the REAL name for new users (esp. Google sign-in).
--
-- Google OAuth puts the real name in auth.users.raw_user_meta_data as
-- `full_name` / `name` / `given_name` / `family_name` — but NOT `display_name`.
-- The old trigger only read `display_name`, so Google users fell through to the
-- email prefix (e.g. "brittanyreneeking"). This captures the real full + first
-- name, and only falls back to the email prefix when there is NO name metadata
-- at all (e.g. a bare email/password signup with no name).
--
-- Columns:
--   full_name  — canonical full name (from OAuth or the signup form).
--   first_name — given name, displayed in-app.
--   display_name — kept as the full name so every existing reader (which already
--     extracts the first token via firstName()) shows the correct first name
--     with NO app change required.
--
-- NEW USERS ONLY. No backfill — the one existing affected account is fixed by hand.

alter table public.profiles
  add column if not exists full_name  text,
  add column if not exists first_name text;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  meta   jsonb := new.raw_user_meta_data;
  v_full  text;
  v_first text;
begin
  -- Full name: email/password signup form → Google full_name/name → given+family
  -- → (last resort) the email prefix.
  v_full := coalesce(
    nullif(btrim(meta->>'display_name'), ''),
    nullif(btrim(meta->>'full_name'), ''),
    nullif(btrim(meta->>'name'), ''),
    nullif(btrim(concat_ws(' ', meta->>'given_name', meta->>'family_name')), ''),
    split_part(new.email, '@', 1)
  );
  -- First name: Google given_name → first token of the full name → email prefix.
  v_first := coalesce(
    nullif(btrim(meta->>'given_name'), ''),
    nullif(split_part(v_full, ' ', 1), ''),
    split_part(new.email, '@', 1)
  );

  insert into public.profiles (
    id, email, display_name, full_name, first_name, marketing_opt_in,
    signup_source, signup_medium, signup_campaign, signup_term,
    signup_content, signup_referrer, signup_landing_page, signup_first_seen_at
  )
  values (
    new.id, new.email, v_full, v_full, v_first,
    coalesce((meta->>'marketing_opt_in')::boolean, false),
    nullif(meta->>'signup_source', ''),
    nullif(meta->>'signup_medium', ''),
    nullif(meta->>'signup_campaign', ''),
    nullif(meta->>'signup_term', ''),
    nullif(meta->>'signup_content', ''),
    nullif(meta->>'signup_referrer', ''),
    nullif(meta->>'signup_landing_page', ''),
    (nullif(meta->>'signup_first_seen_at', ''))::timestamptz
  )
  on conflict (id) do nothing;

  return new;
end;
$$;
