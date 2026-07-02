-- Per-bird access scoping for has_capability.
--
-- BEFORE: has_capability(bird, uid, 'view') was `hmp OR bird_members` — an
-- household_member_permissions row (owner-level, created on invite-accept) granted
-- 'view' on EVERY one of the owner's birds, independent of bird_members. Two
-- consequences:
--   1) Removing a member from ONE bird (deletes that bird_members row) did NOT
--      revoke the bird — hmp still granted view. ("removing birds should remove")
--   2) Inviting a member to a SUBSET of birds still let them see ALL of the
--      owner's birds (and any birds added later).
-- Non-view capabilities were `hmp AND cap` — also household-wide, so a member
-- removed from a bird could still hold write capabilities on it.
--
-- AFTER: bird_members is the per-bird access list; household_member_permissions is
-- the per-household capability set. A member can see/act on a bird ONLY if they
-- have a bird_members row for THAT bird:
--   - owner short-circuits (birds.owner_id)
--   - no bird_members row for this bird  -> no access (any capability)
--   - 'view'                             -> granted by the bird_members row
--   - other capability                  -> also requires the cap in the member's
--                                           household_member_permissions.capabilities
-- Deleting a bird_members row now fully revokes that bird (DB read via this
-- function AND storage read via has_bird_access, which already keys on
-- bird_members — so records and photos revoke together, per-bird).
--
-- Storage/photo access (has_bird_access) is unchanged; it already gates on
-- bird_members, so this aligns the record-access function to the same per-bird
-- source of truth.
--
-- BEHAVIOR CHANGE: a household member now sees only the birds they were
-- explicitly invited to / added to (a bird_members row), not every bird the owner
-- owns. Members invited to all birds are unaffected; members invited to a subset
-- now correctly see only that subset, and birds added later are not auto-shared
-- until the member is added to them.

create or replace function public.has_capability(p_bird_id uuid, p_user_id uuid, p_capability text)
returns boolean language sql stable security definer set search_path = '' as $$
  with b as (select owner_id from public.birds where id = p_bird_id)
  select case
    when not exists (select 1 from b) then false
    when (select owner_id from b) = p_user_id then true
    -- Per-bird gate: must be a member OF THIS BIRD.
    when not exists (
      select 1 from public.bird_members bm
      where bm.bird_id = p_bird_id and bm.user_id = p_user_id
    ) then false
    when p_capability = 'view' then true
    -- Non-view: the household capability set governs WHAT they can do.
    else exists (
      select 1 from public.household_member_permissions h
      where h.owner_id = (select owner_id from b)
        and h.member_user_id = p_user_id
        and p_capability = any(h.capabilities)
    )
  end;
$$;
