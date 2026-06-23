-- =====================================================================
-- Bird handoff (transfer of ownership) + foster intake + foster-fail.
-- Additive only. Reuses bird_members + has_bird_access; sitter & household
-- sharing are untouched. No scheduled notifications.
--
-- KEY RLS NOTE: NO existing policy is changed. A handoff transfer is performed
-- by a SERVICE-ROLE server fn that, in one transaction, swaps the bird_members
-- 'owner' row to the recipient, removes the previous owner's + household rows,
-- and updates birds.owner_id. The existing multi-owner/household RLS then
-- enforces isolation automatically: once the previous owner has no bird_members
-- row, has_bird_access(bird, them) = NULL → denied on every bird-scoped policy,
-- and birds.owner_id no longer matches them. So this migration only ADDS the
-- foster columns + two tables (handoffs, past_birds) and their own policies.
-- =====================================================================

begin;

-- 1) Foster + intake/permanent dates on birds ------------------------
alter table public.birds
  add column if not exists is_foster boolean not null default false,
  add column if not exists intake_date date,
  add column if not exists became_permanent_on date;

-- 2) handoffs — a pending/competed transfer of ownership -------------
-- Owner (sender) reads/writes their own rows. The recipient accept/decline
-- path is token-based via a service-role server fn (the token is the access
-- check), so the recipient never needs a direct RLS read. token required for
-- mode='app', null for mode='pdf'. Pending expires in 14 days.
create table if not exists public.handoffs (
  id               uuid primary key default gen_random_uuid(),
  bird_id          uuid not null references public.birds(id) on delete cascade,
  sender_user_id   uuid not null references auth.users(id) on delete cascade,
  recipient_email  citext,
  recipient_name   text,
  mode             text not null check (mode in ('app','pdf')),
  token            text unique,
  status           text not null default 'pending'
                     check (status in ('pending','accepted','declined','canceled','expired','offline_completed')),
  created_at       timestamptz not null default now(),
  expires_at       timestamptz not null default (now() + interval '14 days'),
  completed_at     timestamptz,
  accepted_user_id uuid references auth.users(id) on delete set null
);
create index if not exists handoffs_bird_idx   on public.handoffs(bird_id);
create index if not exists handoffs_sender_idx on public.handoffs(sender_user_id);
create index if not exists handoffs_token_idx  on public.handoffs(token);

grant select, insert, update, delete on public.handoffs to authenticated;
grant all on public.handoffs to service_role;

alter table public.handoffs enable row level security;
drop policy if exists "handoffs sender all" on public.handoffs;
create policy "handoffs sender all" on public.handoffs for all to authenticated
  using (sender_user_id = auth.uid())
  with check (sender_user_id = auth.uid());

-- 3) past_birds — the sender's read-only memory snapshot ------------
-- NOT linked to the bird record (which now belongs to the recipient and must be
-- fully inaccessible to the former owner). Stores only the snapshot fields.
-- Rows are created by the service-role transfer fn; users only READ their own.
create table if not exists public.past_birds (
  id                uuid primary key default gen_random_uuid(),
  original_owner_id uuid not null references auth.users(id) on delete cascade,
  bird_name         text not null,
  species           text,
  intake_date       date,
  departed_on       date not null,
  recipient_name    text,
  mode              text not null check (mode in ('app','pdf')),
  was_foster        boolean not null default false,
  created_at        timestamptz not null default now()
);
create index if not exists past_birds_owner_idx on public.past_birds(original_owner_id);

grant select, insert, update, delete on public.past_birds to authenticated;
grant all on public.past_birds to service_role;

alter table public.past_birds enable row level security;
drop policy if exists "past_birds owner read" on public.past_birds;
create policy "past_birds owner read" on public.past_birds for select to authenticated
  using (original_owner_id = auth.uid());
-- (No insert/update/delete policy for `authenticated` → only the service-role
-- transfer fn writes past_birds.)

commit;
