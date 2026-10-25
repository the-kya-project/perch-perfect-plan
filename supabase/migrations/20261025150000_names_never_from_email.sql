-- Names in emails: never made from an email address.
--
-- Sign in with Apple users who hide their email get a relay address such as
-- 2dkh5ctcgb@privaterelay.appleid.com. With no name metadata, the sign-up
-- trigger fell back to the part before the @, so emails said "Welcome to the
-- flock, 2dkh5ctcgb." Every email template has a nameless version, so a person
-- who gave no name now simply has none (null) and is greeted without one.
--
-- 1. handle_new_user: no email-prefix fallback for full/display/first name, and
--    a name equal to the email prefix (the old sign-up form sent one) is
--    dropped. Otherwise identical to 20261025130000_signup_locale_and_confirmed_check.
--    NEW USERS ONLY. Existing prefix-derived names are cleared separately,
--    after review.
--
-- 2. onboarding_email_log.resent_at: when a logged email was re-delivered by
--    hand (the onboarding hook's `resend` mode, for a send that bounced). Also
--    the guard that stops a second resend of the same email.

alter table public.onboarding_email_log
  add column if not exists resent_at timestamptz;

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
  -- Full name: email/password signup form → Google/Apple full_name/name →
  -- given+family. NO email fallback: a person who gave no name has no name
  -- (null), and emails greet them without one.
  v_full := coalesce(
    nullif(btrim(meta->>'display_name'), ''),
    nullif(btrim(meta->>'full_name'), ''),
    nullif(btrim(meta->>'name'), ''),
    nullif(btrim(concat_ws(' ', meta->>'given_name', meta->>'family_name')), '')
  );
  -- A name that is exactly the part of the address before the @ isn't a name
  -- (the sign-up form used to send it as display_name).
  if v_full = split_part(new.email, '@', 1) then
    v_full := null;
  end if;
  -- First name: Google given_name → first word of the full name.
  v_first := coalesce(
    nullif(btrim(meta->>'given_name'), ''),
    nullif(split_part(v_full, ' ', 1), '')
  );
  if v_first = split_part(new.email, '@', 1) then
    v_first := null;
  end if;

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
