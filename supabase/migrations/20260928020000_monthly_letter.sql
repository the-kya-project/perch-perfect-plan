-- The monthly letter: an opt-out, and the send log.
--
-- The letter's own footer says "You can turn off the monthly letter in Settings
-- at any time", so the column has to exist for that sentence to be true. It
-- defaults to true: this is the recap of a record the owner is already keeping,
-- not marketing, and existing accounts should not have to opt in to keep
-- getting something they already expect. The Settings toggle that writes it is
-- a separate change — until it ships, the column is only readable by the cron.
alter table public.profiles
  add column if not exists notify_monthly_letter boolean not null default true;

comment on column public.profiles.notify_monthly_letter is
  'Monthly recap letter, sent on the 2nd. Default true; the letter footer promises this can be turned off in Settings.';

-- One row per account per month, so a retry, a double-fire of the cron, or a
-- manual re-run can never send the same month twice. The month is stored as the
-- first day of the month being RECAPPED (September's recap, sent 2 October, is
-- 2026-09-01) — that is the thing there can only be one of.
create table if not exists public.monthly_letter_log (
  owner_id uuid not null references auth.users (id) on delete cascade,
  recap_month date not null,
  sent_at timestamptz not null default now(),
  bird_count int,
  all_quiet boolean,
  primary key (owner_id, recap_month)
);

create index if not exists monthly_letter_log_month_idx
  on public.monthly_letter_log (recap_month desc, sent_at desc);

alter table public.monthly_letter_log enable row level security;

-- No policies, same as bereavement_email_log: written and read only by the cron
-- through the service-role key, which bypasses RLS. It is send bookkeeping.
