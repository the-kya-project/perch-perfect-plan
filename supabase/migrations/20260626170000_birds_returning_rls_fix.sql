-- P0: owner gets "new row violates row-level security policy for table birds"
-- when adding a bird, after the capability enforcement pass (20260626160000).
--
-- CAUSE — the exact trap first fixed in 20260622190000, re-broken by the
-- capability pass. The client inserts with .select() → INSERT ... RETURNING, so
-- Postgres ALSO applies the SELECT policy to the brand-new row. 20260626160000
-- replaced the owner-direct SELECT (`owner_id = auth.uid() OR …`) with a pure
-- `has_capability(id, auth.uid(), 'view')`. has_capability is STABLE and
-- re-queries public.birds by id; on the just-inserted row it evaluates against
-- the statement snapshot and can't see it → 'view' = false → the new bird is
-- invisible to its own RETURNING → 42501. (The INSERT WITH CHECK itself passes:
-- the client sends owner_id = auth.uid().)
--
-- FIX — restore the owner short-circuit on SELECT: `owner_id = (select
-- auth.uid())` is true immediately on the new row (its own column, no subquery /
-- snapshot), so the inserter (always the new bird's owner_id — an owner, or a
-- manage_flock member who becomes its owner) can read it back. Member reads of
-- EXISTING birds still flow through has_capability. Cross-owner protection is
-- unchanged (owner_id = auth.uid() only ever matches the caller's own bird).
--
-- Done as a clean reset (drop EVERY policy on birds, rebuild the intended four)
-- so any rogue/leftover/restrictive policy from the un-reconciled hand-applied
-- history — the other thing that produced this exact error before (20260622180000)
-- — is cleared too. Idempotent; touches no row data.
--
-- ORDERING: references public.has_capability / public.has_household_capability,
-- so this MUST sort BEFORE 20260628120000 (which moves them into the private
-- schema). It does (0626 < 0628); after that move runs, these policies follow
-- the functions by OID.

begin;

-- 1) Clean slate: remove all existing policies on birds (any name, any kind).
do $$
declare r record;
begin
  for r in select polname from pg_policy where polrelid = 'public.birds'::regclass
  loop
    execute format('drop policy %I on public.birds', r.polname);
  end loop;
end $$;

alter table public.birds enable row level security;

-- 2) Rebuild the intended capability-based policies.
-- SELECT: owner short-circuit FIRST (fixes INSERT...RETURNING on the new row),
-- then capability for members reading existing birds.
create policy "birds read" on public.birds for select to authenticated
  using (owner_id = (select auth.uid()) or public.has_capability(id, (select auth.uid()), 'view'));

-- INSERT: the creator declares themselves owner (owner_id = auth.uid()); a
-- manage_flock household member may also create. No pre-existing row, so this
-- gates on the NEW row's owner_id.
create policy "birds insert" on public.birds for insert to authenticated
  with check (owner_id = (select auth.uid()) or public.has_household_capability(owner_id, (select auth.uid()), 'manage_flock'));

-- UPDATE / DELETE: manage_flock on the existing bird (unchanged from 20260626160000).
create policy "birds update" on public.birds for update to authenticated
  using (public.has_capability(id, (select auth.uid()), 'manage_flock'))
  with check (public.has_capability(id, (select auth.uid()), 'manage_flock'));
create policy "birds delete" on public.birds for delete to authenticated
  using (public.has_capability(id, (select auth.uid()), 'manage_flock'));

-- 3) Re-assert the owner-membership trigger (idempotent). SECURITY DEFINER, so
-- it bypasses bird_members RLS and fires regardless of the caller's privileges.
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

commit;
