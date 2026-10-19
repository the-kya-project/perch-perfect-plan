-- Bereavement notes now wait for Brittany's review.
--
-- When an owner marks a bird as passed, Brittany gets an email with the note
-- the owner would receive and a link to a review page with "Send this note"
-- and "Don't send". Nothing reaches the owner until she chooses. The first
-- case that prompted it: a bird added and marked passed 22 seconds later, a
-- past loss being recorded, where an automatic "I'm so sorry" the next morning
-- would have read oddly.
--
-- One row per review. bird_ids holds every bird the note would cover (one
-- owner, usually one bird). decision is null while waiting; 'send' or 'skip'
-- once she chooses. bereavement_email_log stays the record of what was SENT;
-- this table is the record of what was REVIEWED, and a bird in any review row
-- is never queued again.

create table if not exists public.bereavement_reviews (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  bird_ids uuid[] not null,
  created_at timestamptz not null default now(),
  decision text check (decision in ('send', 'skip')),
  decided_at timestamptz
);

create index if not exists bereavement_reviews_owner_idx
  on public.bereavement_reviews (owner_id, created_at desc);

-- Lets "is this bird already queued?" be answered without scanning arrays.
create index if not exists bereavement_reviews_bird_ids_idx
  on public.bereavement_reviews using gin (bird_ids);

alter table public.bereavement_reviews enable row level security;

-- No policies on purpose, same as bereavement_email_log: written and read only
-- by the server with the service-role key. No ordinary client sees it.
