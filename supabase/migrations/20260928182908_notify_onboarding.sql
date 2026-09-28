-- An opt-out for the getting-started emails.
--
-- The Flock Report already had notify_monthly_letter; the seven onboarding
-- letters had nothing, so there was no way to stop them short of unsubscribing
-- from everything. Default true: an account that has just signed up expects the
-- tour, and existing accounts mid-series should not have it cut off.
--
-- This flag and notify_monthly_letter control ONLY those two programmes.
-- Transactional mail — sits, handoffs, household invites, the serious-concern
-- alert, account email — ignores both, because those are not marketing and a
-- reader who turned off a newsletter has not asked to stop hearing that their
-- sitter flagged something.
alter table public.profiles
  add column if not exists notify_onboarding boolean not null default true;

comment on column public.profiles.notify_onboarding is
  'The seven getting-started emails. Default true. Never gates transactional mail.';
