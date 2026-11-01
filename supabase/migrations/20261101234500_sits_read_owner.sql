-- Fix: since 20261026120000_sits_scoped_to_member_birds, no owner could create
-- a sit ("You don't have permission to do that.", 42501).
--
-- The app inserts a sit and reads it back in the same request
-- (insert(...).select()), so Postgres checks the new row against "sits read".
-- That policy only called private.can_access_sit(id, ...), which finds the
-- owner by looking the sit up by id. Inside the insert the function can't see
-- the row being created, so it returned false even for the owner. The policy
-- before Oct 26 compared the row's own owner_id, which is why this worked then.
--
-- Check owner_id on the row directly again. The owner could already read every
-- one of their sits through can_access_sit, so this grants nothing new; the
-- household-member rule from Oct 26 is unchanged.

drop policy if exists "sits read" on public.sits;
create policy "sits read" on public.sits for select to authenticated
  using (
    owner_id = (select auth.uid())
    or caregiver_user_id = (select auth.uid())
    or private.can_access_sit(id, (select auth.uid()), 'view')
  );
