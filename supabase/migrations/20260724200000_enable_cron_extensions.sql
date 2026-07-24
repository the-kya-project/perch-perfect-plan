-- Enable the scheduling machinery for the daily hooks (onboarding drip,
-- engagement nudges): pg_cron runs the schedule, pg_net makes the HTTP call.
-- The cron.schedule() job definitions themselves are NOT migrations — they
-- embed the CARE_PLAN_REMINDER_SECRET bearer token, so they are created
-- manually in the SQL editor (never committed).

create extension if not exists pg_cron;
create extension if not exists pg_net;
