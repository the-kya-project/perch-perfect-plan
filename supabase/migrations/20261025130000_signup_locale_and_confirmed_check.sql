-- Two changes for the sign-up confirmation flow.
--
-- 1. profiles.locale at sign-up. Email sign-ups send the app's language as
--    user_metadata.locale; the trigger now copies it onto the profile, so a new
--    email account never starts with a null locale (and so never gets English
--    lifecycle emails after Dutch auth emails). Google and Apple sign-ups carry
--    no locale; ensureProfileLocale fills theirs from the browser on first
--    sign-in, as before. Otherwise identical to 20261019150000_signup_platform.
--
--    NEW USERS ONLY. Existing null rows are backfilled separately, after review.
--
-- 2. public.auth_email_confirmed(email): has this address confirmed its
--    account? /link-expired asks (through a server function, service role
--    only) so that someone clicking an old confirmation link for an account
--    that's already confirmed goes straight to sign-in instead of being sent
--    yet another link. Supabase's resend can't tell us: for a confirmed
--    account it returns success and sends nothing.

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
    signup_content, signup_referrer, signup_landing_page, signup_first_seen_at,
    signup_platform, locale
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
    (nullif(meta->>'signup_first_seen_at', ''))::timestamptz,
    nullif(meta->>'signup_platform', ''),
    -- The language the app was showing at sign-up (signUp sends "en" or
    -- "nl" as user_metadata.locale). Normalized the same way as pickLocale:
    -- anything Dutch → 'nl', anything else that's set → 'en'.
    case
      when nullif(btrim(meta->>'locale'), '') is null then null
      when lower(btrim(meta->>'locale')) like 'nl%' then 'nl'
      else 'en'
    end
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

-- Server-only: not callable by anon or signed-in users.
create or replace function public.auth_email_confirmed(p_email text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from auth.users u
    where lower(u.email) = lower(btrim(p_email))
      and u.email_confirmed_at is not null
  );
$$;

revoke all on function public.auth_email_confirmed(text) from public, anon, authenticated;
grant execute on function public.auth_email_confirmed(text) to service_role;
