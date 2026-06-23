-- Fix: creating a bird failed with
--   "new row violates row-level security policy for table birds".
--
-- ROOT CAUSE (chicken-and-egg): the live `birds` INSERT policy was gated on
-- has_bird_access(id, auth.uid()), but a brand-new bird has no bird_members
-- ownership row yet — that row is created FROM the bird (by the AFTER-INSERT
-- trigger). So at INSERT time has_bird_access() is null and the WITH CHECK fails,
-- blocking both "Next" and "Save & exit" on the Basics step.
--
-- The committed foundation migration already INTENDED the correct form
-- (WITH CHECK (owner_id = auth.uid())), but the database that was applied by hand
-- diverged to the has_bird_access-gated form. This migration re-asserts the
-- correct, non-chicken-and-egg create path.
--
-- SAFE + ADDITIVE + IDEMPOTENT: re-running is a no-op if the live policy is
-- already correct. Existing birds and data are untouched (we only backfill any
-- *missing* owner-membership rows). Cross-owner protection is preserved:
--   - INSERT WITH CHECK (owner_id = auth.uid()) lets a user create ONLY a bird
--     owned by themselves — never one assigned to another user.
--   - SELECT/UPDATE/DELETE stay gated on has_bird_access (unchanged), so no user
--     can read or write another owner's bird.
--   - We deliberately do NOT add a self-insert policy on bird_members: that would
--     let any user mint themselves an 'owner' row for ANY bird_id (a cross-owner
--     hole). The SECURITY DEFINER trigger is the only thing that mints ownership,
--     and it only fires for a bird the user just legitimately inserted.

begin;

-- 1) birds INSERT: the creator declares themselves owner. No pre-existing
--    membership required — the trigger below creates it the instant the bird
--    exists. Permissive, so this policy alone is sufficient to allow the insert.
drop policy if exists "birds insert self" on public.birds;
create policy "birds insert self" on public.birds for insert to authenticated
  with check (owner_id = auth.uid());

-- 2) Auto-create the owner membership the moment a bird is inserted. SECURITY
--    DEFINER so it writes bird_members regardless of that table's RLS. Idempotent
--    (re-create or replace). This guarantees the ownership record exists in the
--    same transaction as the bird, so every downstream facet insert
--    (care_plans, routine_tasks, emergency_contacts, weight_entries,
--    journal_entries, moments, daily_logs, …) immediately passes its
--    has_bird_access WITH CHECK.
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

-- 3) Backfill: guarantee every existing bird has its owner-membership row, so all
--    existing birds stay readable/editable by their owner no matter how they were
--    originally created. No-op where the row already exists.
insert into public.bird_members (bird_id, user_id, role)
select id, owner_id, 'owner'
from public.birds
where owner_id is not null
on conflict (bird_id, user_id) do nothing;

commit;
