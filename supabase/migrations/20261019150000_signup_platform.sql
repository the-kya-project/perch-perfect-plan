-- Which app the user signed up in: 'ios' | 'android' | 'web'.
--
-- First-touch attribution can't see inside the native apps: the webview has no
-- referrer and always opens on "/", so every App Store / Play Store signup was
-- recorded as source "direct", indistinguishable from someone typing the URL.
-- This column separates them. Email signups pass it via signUp metadata (copied
-- here by the trigger); OAuth signups get it client-side on return — see
-- lib/attribution.ts.
--
-- NEW USERS ONLY. No backfill: older rows stay null (unknown).

alter table public.profiles
  add column if not exists signup_platform text;

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
    signup_platform
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
    nullif(meta->>'signup_platform', '')
  )
  on conflict (id) do nothing;

  return new;
end;
$$;
