-- Email logs: give service_role the table privileges production already has.
--
-- This project's default privileges give service_role no SELECT, INSERT,
-- UPDATE or DELETE on new public tables (see 20261023140000), and service_role
-- bypasses RLS but not table privileges. On production these three were
-- granted by hand and never migrated, so any database built from migrations
-- (staging, preview branches, a restore) can't run the email hooks:
--   onboarding_email_log  onboarding-emails, onboarding-welcome, monthly-letter
--   monthly_letter_log    monthly-letter, onboarding-emails (Flock Report de-dup)
--   bereavement_reviews   bereavement-note, bereavementReview.server.ts
-- Production's service_role has SELECT, INSERT, UPDATE, DELETE, REFERENCES,
-- TRIGGER and TRUNCATE on each; the defaults already give the last three, so
-- this grants the other four and nothing else. On production it's a no-op.
-- anon and authenticated are left as they are.

grant select, insert, update, delete on public.onboarding_email_log to service_role;
grant select, insert, update, delete on public.monthly_letter_log to service_role;
grant select, insert, update, delete on public.bereavement_reviews to service_role;
