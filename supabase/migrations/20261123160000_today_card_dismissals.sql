-- "Got it" on Home's seasonal and holiday Today card (backlog D2.1). Additive
-- only: one new table; nothing existing changes.
--
-- One row per account: the card last dismissed and the last day of that run of
-- the card. The app hides that card through that day, so it comes back next
-- year (or after a holiday card has interrupted it). Deleting an account
-- removes its row.

create table if not exists public.today_card_dismissals (
  user_id uuid primary key references auth.users (id) on delete cascade,
  card_id text not null check (card_id ~ '^[a-zA-Z]{2,40}$'),
  through_date date not null,
  dismissed_at timestamptz not null default now()
);

comment on table public.today_card_dismissals is
  'The Today card each account last dismissed with "Got it", hidden through through_date. See src/lib/todayCardDismissal.ts.';

alter table public.today_card_dismissals enable row level security;
revoke all on public.today_card_dismissals from anon, authenticated;
grant select, insert, update on public.today_card_dismissals to authenticated;
grant select, insert, update, delete on public.today_card_dismissals to service_role;

drop policy if exists "today_card_dismissals read own" on public.today_card_dismissals;
create policy "today_card_dismissals read own" on public.today_card_dismissals
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists "today_card_dismissals add own" on public.today_card_dismissals;
create policy "today_card_dismissals add own" on public.today_card_dismissals
  for insert to authenticated with check (user_id = (select auth.uid()));

drop policy if exists "today_card_dismissals change own" on public.today_card_dismissals;
create policy "today_card_dismissals change own" on public.today_card_dismissals
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
