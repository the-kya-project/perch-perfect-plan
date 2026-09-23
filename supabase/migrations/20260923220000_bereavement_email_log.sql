-- One row per bird we have sent the bereavement note for. The note is a
-- personal message from Brittany; sending it twice would be worse than not
-- sending it at all, so the send is gated on this table rather than on any
-- derived state.
--
-- bird_id is the primary key: once per bird, forever, even if passed_at is
-- cleared and re-set.

create table if not exists public.bereavement_email_log (
  bird_id uuid primary key references public.birds (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  sent_at timestamptz not null default now()
);

create index if not exists bereavement_email_log_owner_idx
  on public.bereavement_email_log (owner_id, sent_at desc);

alter table public.bereavement_email_log enable row level security;

-- No policies on purpose: this table is written and read ONLY by the cron via
-- the service-role key, which bypasses RLS. With RLS on and no policy, every
-- ordinary client — owner included — sees nothing, which is what we want: it
-- is send bookkeeping, not user-facing data.
