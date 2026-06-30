-- One-time correction: repair profiles whose name was stomped with the email
-- prefix by the pre-20260630120000 trigger. Google sign-in carries the real name
-- in raw_user_meta_data (full_name / name / given_name / family_name), but the
-- old trigger only read `display_name` (absent for Google) and fell through to
-- split_part(email,'@',1) — e.g. "brittanyreneeking".
--
-- GUARDED so it can NEVER clobber a real name:
--   • only rows whose display_name STILL equals the email prefix (untouched by
--     the user since signup), AND
--   • only when real name metadata actually exists.
-- Rows the user has already corrected, or with no metadata, are left alone.

update public.profiles p
set
  full_name = coalesce(
    nullif(btrim(u.raw_user_meta_data->>'full_name'), ''),
    nullif(btrim(u.raw_user_meta_data->>'name'), ''),
    nullif(btrim(concat_ws(' ', u.raw_user_meta_data->>'given_name', u.raw_user_meta_data->>'family_name')), '')
  ),
  display_name = coalesce(
    nullif(btrim(u.raw_user_meta_data->>'full_name'), ''),
    nullif(btrim(u.raw_user_meta_data->>'name'), ''),
    nullif(btrim(concat_ws(' ', u.raw_user_meta_data->>'given_name', u.raw_user_meta_data->>'family_name')), '')
  ),
  first_name = coalesce(
    nullif(btrim(u.raw_user_meta_data->>'given_name'), ''),
    nullif(split_part(coalesce(
      nullif(btrim(u.raw_user_meta_data->>'full_name'), ''),
      nullif(btrim(u.raw_user_meta_data->>'name'), '')
    ), ' ', 1), '')
  )
from auth.users u
where u.id = p.id
  and p.display_name = split_part(u.email, '@', 1)
  and coalesce(
    nullif(btrim(u.raw_user_meta_data->>'full_name'), ''),
    nullif(btrim(u.raw_user_meta_data->>'name'), ''),
    nullif(btrim(concat_ws(' ', u.raw_user_meta_data->>'given_name', u.raw_user_meta_data->>'family_name')), '')
  ) is not null;
