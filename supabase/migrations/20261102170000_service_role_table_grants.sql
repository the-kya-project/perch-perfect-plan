-- Give service_role the table privileges production already has, so a
-- database built from migrations matches it.
--
-- Why they differ: production's default privileges for tables postgres creates
-- in public give anon, authenticated and service_role everything. Newer
-- projects (staging, preview branches, a restore into a new project) give them
-- only TRUNCATE, REFERENCES, TRIGGER and MAINTAIN. Most migrations grant all to
-- service_role explicitly; these 18 never did, so on production service_role
-- has SELECT, INSERT, UPDATE and DELETE through the defaults, and anywhere else
-- it has none. service_role bypasses RLS but not table privileges, so the
-- server code that uses these tables fails there with "permission denied":
-- on staging, monthly-letter on onboarding_email_log and onboarding-emails on
-- monthly_letter_log, then household_member_permissions.
--
-- On production every grant below already exists, so this changes nothing.
-- It grants only the four privileges production has and the defaults don't
-- give (the other four come from the defaults). gift_purchases stays as
-- 20261023140000 left it: no DELETE, on purpose. anon and authenticated are
-- not touched here.

grant select, insert, update, delete on
  public.onboarding_email_log,
  public.monthly_letter_log,
  public.bereavement_reviews,
  public.bereavement_email_log,
  public.app_launch_email_log,
  public.app_launch_clicks,
  public.app_launch_clicks_daily,   -- view
  public.email_clicks,
  public.email_clicks_human,        -- view
  public.notification_log,
  public.household_member_permissions,
  public.journal_attachments,
  public.clip_assets,
  public.flock_profiles,
  public.entitlements,
  public.founding_claims,
  public.regions,
  public.user_roles
to service_role;
