-- Onboarding product emails: one row per (user, stage) ever sent, so the daily
-- cron can never send the same nudge twice. Written only by the service-role
-- cron route (/api/public/hooks/onboarding-emails); no client access at all.

create table if not exists public.onboarding_email_log (
  user_id uuid not null references auth.users (id) on delete cascade,
  stage text not null,
  sent_at timestamptz not null default now(),
  primary key (user_id, stage)
);

-- RLS on with no policies: anon/authenticated can do nothing; the service-role
-- key (used by the cron route) bypasses RLS.
alter table public.onboarding_email_log enable row level security;
