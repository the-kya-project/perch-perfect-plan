-- Fix: creating a bird failed with 42501 ("new row violates row-level security
-- policy for table birds") EVEN THOUGH the INSERT WITH CHECK (owner_id =
-- auth.uid()) passed and auth.uid() resolved correctly (verified live: token
-- sub == server auth.uid() == owner_id).
--
-- CAUSE: the app inserts with .select() -> INSERT ... RETURNING. To return the
-- new row, Postgres ALSO applies the SELECT policy to it. That policy was
-- has_bird_access(id, auth.uid()), which reads the bird_members ownership row —
-- but that row is created by the AFTER-INSERT trigger (birds_sync_owner_member)
-- in the SAME statement, and has_bird_access is STABLE, so it evaluates against
-- the statement's snapshot and cannot see the just-created membership. Net: a
-- brand-new bird is invisible to its own INSERT...RETURNING => 42501. (Reads of
-- existing birds work fine; their membership predates the snapshot.)
--
-- FIX: let an owner see their bird via owner_id directly (true immediately on the
-- new row, no membership lookup needed), in addition to membership-based access
-- for household members. Safe — owner_id = auth.uid() means it's the caller's own
-- bird; cross-owner protection is unchanged.
--
-- SCOPE: only `birds` has this self-referential trap (its membership is minted by
-- its own after-trigger). Other facet tables gate on has_bird_access(bird_id) for
-- an ALREADY-existing bird whose membership is committed, so their .select()
-- inserts are unaffected (verified: weight_entries, journal_entries, moments,
-- care_plans, daily_logs, etc.).

begin;

drop policy if exists "birds member select" on public.birds;
create policy "birds member select" on public.birds for select to authenticated
  using (owner_id = auth.uid() or public.has_bird_access(id, auth.uid()) is not null);

-- Remove the debug objects created while diagnosing this on the live DB
-- (no-ops if they aren't present, e.g. in a fresh environment).
drop trigger if exists birds_stamp_owner_ins on public.birds;
drop function if exists public.birds_stamp_owner();
drop function if exists public.whoami();

commit;
