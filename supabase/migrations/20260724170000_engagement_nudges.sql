-- Engagement nudges: weight-reminder + check-in push notifications.
--
-- notification_log records every nudge sent (dedupe/cooldowns for the
-- engagement-nudges cron hook + effectiveness analysis). Service-role writes
-- only; owners may read their own rows.
--
-- profiles gain per-nudge push toggles (default on; the settings screen
-- exposes them). Push-only in v1 — no email counterpart for nudges.

alter table public.profiles
  add column if not exists push_weight_reminder boolean not null default true,
  add column if not exists push_checkin_reminder boolean not null default true;

create table if not exists public.notification_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  bird_id uuid references public.birds (id) on delete cascade,
  type text not null,
  channel text not null default 'push',
  sent_at timestamptz not null default now()
);

create index if not exists notification_log_user_type_idx
  on public.notification_log (user_id, type, sent_at desc);

alter table public.notification_log enable row level security;

drop policy if exists "read own notification log" on public.notification_log;
create policy "read own notification log"
  on public.notification_log for select
  using (auth.uid() = user_id);
-- no insert/update/delete policies: writes go through the service role only
