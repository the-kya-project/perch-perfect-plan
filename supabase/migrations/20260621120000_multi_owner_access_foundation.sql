-- =====================================================================
-- Multi-owner access foundation (schema + RLS + one access function)
-- No UI. No household/transfer flows. No reminders table.
--
-- BEFORE (relevant):
--   birds(owner_id uuid not null, ...)                RLS: owner_id = auth.uid()
--   care_plans/routine_tasks/emergency_contacts/
--     daily_logs/photo_logs/weight_logs               RLS: EXISTS(birds b WHERE b.owner_id = auth.uid())
--   sits/sit_birds/task_completions                   RLS: via sits.owner_id  (UNCHANGED here)
--   bird-photos bucket                                RLS: owner-uid folder   (UNCHANGED here)
--   (no bird_members; no has_bird_access; no weight_entries/journal_entries/moments; no identity cols)
--
-- AFTER:
--   bird_members(bird_id,user_id,role) — SOURCE OF TRUTH for bird access
--   has_bird_access(b_id,u_id) -> 'owner' | 'household' | null  (SECURITY DEFINER)
--   birds + all bird-scoped facet tables gate via has_bird_access()
--   birds.owner_id KEPT as the convenience mirror of the current owner
--     (~13 app files + the new-bird flow rely on it; useful for transfer later).
--     A trigger keeps a role='owner' bird_members row in sync on insert.
--   Identity fields added INLINE on birds (it's only 20 cols and already holds
--     name/species/sex/birth_date); reuses birds.birth_date as hatch_date and
--     birds.sex, adding only the 6 genuinely-new columns. (No 1:1 table.)
--   New facets: weight_entries, journal_entries, moments (+ journal-photos bucket)
--
-- NOTE: 'owner' and 'household' are the only roles, so "read where access is not
-- null" and "write for owner+household" are the SAME set today — bird-scoped
-- policies use a single has_bird_access(...) IS NOT NULL condition. Add a
-- read-only role later by splitting USING (read) from WITH CHECK (write).
-- With ZERO household rows, every check reduces to "is the owner", so behavior
-- is byte-for-byte identical to the current single-owner app.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------

-- Tolerant uuid cast for storage path parsing (bad input -> null -> denied).
create or replace function public.safe_uuid(t text)
returns uuid language plpgsql immutable as $$
begin return t::uuid; exception when others then return null; end;
$$;

-- ---------------------------------------------------------------------
-- 1) Membership table — the single source of truth for bird access
-- ---------------------------------------------------------------------
create table if not exists public.bird_members (
  bird_id    uuid not null references public.birds(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       text not null check (role in ('owner','household')),
  created_at timestamptz not null default now(),
  unique (bird_id, user_id)
);
create index if not exists bird_members_bird_idx on public.bird_members(bird_id);
create index if not exists bird_members_user_idx on public.bird_members(user_id);

grant select, insert, update, delete on public.bird_members to authenticated;
grant all on public.bird_members to service_role;

-- Backfill: every existing bird gets its current owner as a member.
insert into public.bird_members (bird_id, user_id, role)
select id, owner_id, 'owner' from public.birds
on conflict (bird_id, user_id) do nothing;

-- Keep the owner membership row in sync when a bird is created (app still just
-- inserts birds with owner_id; this guarantees the member row exists so the
-- owner immediately has access under the new RLS). SECURITY DEFINER so it runs
-- regardless of bird_members RLS.
create or replace function public.birds_sync_owner_member()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.bird_members (bird_id, user_id, role)
  values (new.id, new.owner_id, 'owner')
  on conflict (bird_id, user_id) do update set role = 'owner';
  return new;
end;
$$;
drop trigger if exists birds_sync_owner_member_ins on public.birds;
create trigger birds_sync_owner_member_ins
  after insert on public.birds
  for each row execute function public.birds_sync_owner_member();

-- ---------------------------------------------------------------------
-- 2) THE access function — used by every bird-scoped policy
-- ---------------------------------------------------------------------
create or replace function public.has_bird_access(b_id uuid, u_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role
  from public.bird_members
  where bird_id = b_id and user_id = u_id
  limit 1;
$$;
grant execute on function public.has_bird_access(uuid, uuid) to authenticated, service_role;
grant execute on function public.safe_uuid(text) to authenticated, service_role;

-- bird_members RLS: members can see their bird's membership; only the owner writes.
alter table public.bird_members enable row level security;
drop policy if exists "bird_members read" on public.bird_members;
create policy "bird_members read" on public.bird_members for select to authenticated
  using (public.has_bird_access(bird_id, auth.uid()) is not null);
drop policy if exists "bird_members owner write" on public.bird_members;
create policy "bird_members owner write" on public.bird_members for all to authenticated
  using (public.has_bird_access(bird_id, auth.uid()) = 'owner')
  with check (public.has_bird_access(bird_id, auth.uid()) = 'owner');

-- ---------------------------------------------------------------------
-- 3) Identity fields (inline on birds; reuses birth_date=hatch_date + sex)
-- ---------------------------------------------------------------------
alter table public.birds
  add column if not exists microchip     text,
  add column if not exists band_number   text,
  add column if not exists sex_method    text check (sex_method in ('dna','surgical','visual','unknown')),
  add column if not exists origin        text,
  add column if not exists acquired_on   date,
  add column if not exists lineage_notes text;

-- ---------------------------------------------------------------------
-- 4) New record-facet tables
-- ---------------------------------------------------------------------
create table if not exists public.weight_entries (
  id          uuid primary key default gen_random_uuid(),
  bird_id     uuid not null references public.birds(id) on delete cascade,
  grams       numeric not null,
  measured_at timestamptz not null default now(),
  logged_by   uuid references auth.users(id) on delete set null,
  source      text not null default 'owner' check (source in ('owner','sitter')),
  note        text,
  created_at  timestamptz not null default now()
);
create index if not exists weight_entries_bird_idx on public.weight_entries(bird_id, measured_at desc);
grant select, insert, update, delete on public.weight_entries to authenticated;
grant all on public.weight_entries to service_role;

create table if not exists public.journal_entries (
  id          uuid primary key default gen_random_uuid(),
  bird_id     uuid not null references public.birds(id) on delete cascade,
  kind        text not null check (kind in ('molt','meds','vet','behavior','note','other')),
  title       text,
  body        text,
  occurred_on date not null,
  photo_path  text,
  logged_by   uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists journal_entries_bird_idx on public.journal_entries(bird_id, occurred_on desc);
grant select, insert, update, delete on public.journal_entries to authenticated;
grant all on public.journal_entries to service_role;

create table if not exists public.moments (
  id             uuid primary key default gen_random_uuid(),
  bird_id        uuid not null references public.birds(id) on delete cascade,
  kind           text not null check (kind in ('gotcha_day','birthday','years_together','custom')),
  title          text,
  on_date        date,
  recurs         boolean not null default false,
  auto_generated boolean not null default false,
  created_at     timestamptz not null default now()
);
create index if not exists moments_bird_idx on public.moments(bird_id);
grant select, insert, update, delete on public.moments to authenticated;
grant all on public.moments to service_role;

-- New-facet RLS (one condition: access set == write set today)
alter table public.weight_entries enable row level security;
drop policy if exists "weight_entries member all" on public.weight_entries;
create policy "weight_entries member all" on public.weight_entries for all to authenticated
  using (public.has_bird_access(bird_id, auth.uid()) is not null)
  with check (public.has_bird_access(bird_id, auth.uid()) is not null);

alter table public.journal_entries enable row level security;
drop policy if exists "journal_entries member all" on public.journal_entries;
create policy "journal_entries member all" on public.journal_entries for all to authenticated
  using (public.has_bird_access(bird_id, auth.uid()) is not null)
  with check (public.has_bird_access(bird_id, auth.uid()) is not null);

alter table public.moments enable row level security;
drop policy if exists "moments member all" on public.moments;
create policy "moments member all" on public.moments for all to authenticated
  using (public.has_bird_access(bird_id, auth.uid()) is not null)
  with check (public.has_bird_access(bird_id, auth.uid()) is not null);

-- ---------------------------------------------------------------------
-- 5) Re-point existing bird-scoped tables at has_bird_access
--    (sits / sit_birds / task_completions / owner_emergency_defaults stay
--     owner_id-scoped — they're sit/account-scoped, out of this prompt's scope.)
-- ---------------------------------------------------------------------

-- birds: split per command so INSERT (no member row exists yet — the trigger
-- adds it after) stays "you can create a bird you own", while read/update/delete
-- route through membership. Delete stays owner-only.
drop policy if exists "birds owner all" on public.birds;
drop policy if exists "birds member select" on public.birds;
drop policy if exists "birds insert self"   on public.birds;
drop policy if exists "birds member update" on public.birds;
drop policy if exists "birds owner delete"  on public.birds;
create policy "birds member select" on public.birds for select to authenticated
  using (public.has_bird_access(id, auth.uid()) is not null);
create policy "birds insert self" on public.birds for insert to authenticated
  with check (owner_id = auth.uid());
create policy "birds member update" on public.birds for update to authenticated
  using (public.has_bird_access(id, auth.uid()) is not null)
  with check (public.has_bird_access(id, auth.uid()) is not null);
create policy "birds owner delete" on public.birds for delete to authenticated
  using (public.has_bird_access(id, auth.uid()) = 'owner');

drop policy if exists "care_plans owner all" on public.care_plans;
create policy "care_plans member all" on public.care_plans for all to authenticated
  using (public.has_bird_access(bird_id, auth.uid()) is not null)
  with check (public.has_bird_access(bird_id, auth.uid()) is not null);

drop policy if exists "routine_tasks owner all" on public.routine_tasks;
create policy "routine_tasks member all" on public.routine_tasks for all to authenticated
  using (public.has_bird_access((select cp.bird_id from public.care_plans cp where cp.id = care_plan_id), auth.uid()) is not null)
  with check (public.has_bird_access((select cp.bird_id from public.care_plans cp where cp.id = care_plan_id), auth.uid()) is not null);

drop policy if exists "emergency_contacts owner all" on public.emergency_contacts;
create policy "emergency_contacts member all" on public.emergency_contacts for all to authenticated
  using (public.has_bird_access(bird_id, auth.uid()) is not null)
  with check (public.has_bird_access(bird_id, auth.uid()) is not null);

drop policy if exists "daily_logs owner all" on public.daily_logs;
create policy "daily_logs member all" on public.daily_logs for all to authenticated
  using (public.has_bird_access(bird_id, auth.uid()) is not null)
  with check (public.has_bird_access(bird_id, auth.uid()) is not null);

drop policy if exists "photo_logs owner all" on public.photo_logs;
create policy "photo_logs member all" on public.photo_logs for all to authenticated
  using (public.has_bird_access(bird_id, auth.uid()) is not null)
  with check (public.has_bird_access(bird_id, auth.uid()) is not null);

drop policy if exists "weight_logs owner all" on public.weight_logs;
create policy "weight_logs member all" on public.weight_logs for all to authenticated
  using (public.has_bird_access(bird_id, auth.uid()) is not null)
  with check (public.has_bird_access(bird_id, auth.uid()) is not null);

-- ---------------------------------------------------------------------
-- 6) Backfill weight_entries from the existing weight_logs history so the
--    merged timeline has the past data. (weight_logs is now legacy; a later
--    prompt points writers at weight_entries. Safe one-time copy.)
-- ---------------------------------------------------------------------
insert into public.weight_entries (bird_id, grams, measured_at, source, note, created_at)
select wl.bird_id, wl.weight, wl.logged_at,
       case when wl.sit_id is not null then 'sitter' else 'owner' end,
       wl.notes, wl.logged_at
from public.weight_logs wl
where not exists (
  select 1 from public.weight_entries we
  where we.bird_id = wl.bird_id and we.measured_at = wl.logged_at and we.grams = wl.weight
);

-- ---------------------------------------------------------------------
-- 7) Journal photo storage — private, bird-scoped. Keys: "<bird_id>/<file>".
--    Reads/writes via the app are server-mediated (service role); these
--    policies are the bird-scoped backstop for any direct authenticated access.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('journal-photos', 'journal-photos', false)
on conflict (id) do nothing;

drop policy if exists "journal-photos member read"   on storage.objects;
drop policy if exists "journal-photos member insert" on storage.objects;
drop policy if exists "journal-photos member update" on storage.objects;
drop policy if exists "journal-photos member delete" on storage.objects;
create policy "journal-photos member read" on storage.objects for select to authenticated
  using (bucket_id = 'journal-photos'
         and public.has_bird_access(public.safe_uuid((storage.foldername(name))[1]), auth.uid()) is not null);
create policy "journal-photos member insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'journal-photos'
              and public.has_bird_access(public.safe_uuid((storage.foldername(name))[1]), auth.uid()) is not null);
create policy "journal-photos member update" on storage.objects for update to authenticated
  using (bucket_id = 'journal-photos'
         and public.has_bird_access(public.safe_uuid((storage.foldername(name))[1]), auth.uid()) is not null);
create policy "journal-photos member delete" on storage.objects for delete to authenticated
  using (bucket_id = 'journal-photos'
         and public.has_bird_access(public.safe_uuid((storage.foldername(name))[1]), auth.uid()) is not null);

commit;

-- =====================================================================
-- ROLLBACK (reverse, run manually if needed):
--   begin;
--   -- restore owner_id policies
--   drop policy if exists "birds member select" on public.birds;
--   drop policy if exists "birds insert self" on public.birds;
--   drop policy if exists "birds member update" on public.birds;
--   drop policy if exists "birds owner delete" on public.birds;
--   create policy "birds owner all" on public.birds for all to authenticated
--     using (owner_id = auth.uid()) with check (owner_id = auth.uid());
--   -- (similarly recreate "<table> owner all" EXISTS(birds…owner_id) policies for
--   --  care_plans, routine_tasks, emergency_contacts, daily_logs, photo_logs, weight_logs)
--   drop policy if exists "journal-photos member read" on storage.objects; -- + insert/update/delete
--   drop table if exists public.moments, public.journal_entries, public.weight_entries cascade;
--   drop trigger if exists birds_sync_owner_member_ins on public.birds;
--   drop function if exists public.birds_sync_owner_member();
--   drop function if exists public.has_bird_access(uuid,uuid);
--   drop table if exists public.bird_members cascade;
--   alter table public.birds drop column if exists microchip, drop column if exists band_number,
--     drop column if exists sex_method, drop column if exists origin,
--     drop column if exists acquired_on, drop column if exists lineage_notes;
--   -- weight_entries backfill rows are dropped with the table.
--   commit;
-- =====================================================================
