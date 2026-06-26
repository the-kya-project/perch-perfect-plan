-- Only a bird's OWNER may set up a sit for it.
--
-- Hole: "sits owner all" only checked owner_id = auth.uid() on insert, and
-- "sit_birds owner all" only required owning the SIT (not the bird). So a
-- household member could insert their OWN sit (owner_id = themselves) and then
-- attach the actual owner's bird — effectively setting up a sit, and minting a
-- sitter invite token, for a bird they don't own.
--
-- Fix (defense-in-depth alongside the UI gating):
--   • sit_birds write now also requires owning the linked BIRD.
--   • sits insert/update now also requires the caller to own at least one bird,
--     so a pure household member (owns none) can't even create a bare sit row.
-- Owner create/edit is unaffected (the owner owns both the sit and the bird).
-- The caregiver read policies (20260624170000) are separate and untouched.

drop policy if exists "sit_birds owner all" on public.sit_birds;
create policy "sit_birds owner all" on public.sit_birds for all to authenticated
  using (
    exists (select 1 from public.sits s
            where s.id = sit_birds.sit_id and s.owner_id = auth.uid())
  )
  with check (
    exists (select 1 from public.sits s
            where s.id = sit_birds.sit_id and s.owner_id = auth.uid())
    and exists (select 1 from public.birds b
                where b.id = sit_birds.bird_id and b.owner_id = auth.uid())
  );

drop policy if exists "sits owner all" on public.sits;
create policy "sits owner all" on public.sits for all to authenticated
  using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid()
    and exists (select 1 from public.birds b where b.owner_id = auth.uid())
  );
