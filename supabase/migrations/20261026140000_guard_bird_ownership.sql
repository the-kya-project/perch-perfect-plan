-- Security: a household member with the co-owner preset could take a bird from
-- its owner without a handoff. Verified on staging in the QA pass, Oct 2026,
-- as a co-owner on Kiwi only:
--   - update birds set owner_id = <self>         → succeeded; the owner became a
--     viewer of their own bird ("birds update" checks the row before the change
--     and nothing pins owner_id);
--   - update bird_members set role = 'owner'      → succeeded (self-promotion);
--   - delete the owner's own bird_members row     → succeeded;
--   - insert a household invite for Mango, a bird → succeeded, and accepting it
--     they were never given                        grants Mango.
-- None of this went through the handoff flow: no consent, no Past birds entry,
-- no sit cleanup, no undo.
--
-- Ownership only changes through a handoff (handoff_accept_transfer, SECURITY
-- DEFINER) or server code using the service role; owner memberships are written
-- by the birds_sync_owner_member trigger (SECURITY DEFINER). Those run as
-- postgres / service_role. The app never writes owner_id or bird_members from
-- the browser. So the two guards below refuse these changes only when the
-- request comes straight from a signed-in (or anonymous) API caller.
-- Co-owners keep everything else: editing birds, managing the household for
-- the birds they share, deleting birds.

create or replace function private.guard_bird_owner_change()
returns trigger
language plpgsql
set search_path to ''
as $$
begin
  if new.owner_id is distinct from old.owner_id and current_user in ('authenticated', 'anon') then
    raise exception 'A bird changes owner only through a handoff.' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists birds_guard_owner_change on public.birds;
create trigger birds_guard_owner_change
  before update of owner_id on public.birds
  for each row execute function private.guard_bird_owner_change();

create or replace function private.guard_owner_membership()
returns trigger
language plpgsql
set search_path to ''
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return coalesce(new, old);
  end if;
  if tg_op in ('INSERT', 'UPDATE') and new.role = 'owner' then
    raise exception 'Owner memberships follow the bird''s owner.' using errcode = '42501';
  end if;
  -- Deleting a bird cascades to its memberships, owner row included; the bird
  -- is gone by then, so that delete is allowed.
  if tg_op in ('UPDATE', 'DELETE') and old.role = 'owner'
     and exists (select 1 from public.birds b where b.id = old.bird_id) then
    raise exception 'Owner memberships follow the bird''s owner.' using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists bird_members_guard_owner on public.bird_members;
create trigger bird_members_guard_owner
  before insert or update or delete on public.bird_members
  for each row execute function private.guard_owner_membership();

revoke all on function private.guard_bird_owner_change() from public, anon, authenticated;
revoke all on function private.guard_owner_membership() from public, anon, authenticated;

-- Household invites: every invited bird must belong to that owner and be one
-- the inviter can see. acceptHouseholdInvite grants the invite's birds the
-- owner still owns, so an unchecked bird_ids list granted birds the inviter
-- was never given.
drop policy if exists "household_invites insert" on public.household_invites;
create policy "household_invites insert" on public.household_invites for insert to authenticated
  with check (
    private.has_household_capability(owner_id, (select auth.uid()), 'manage_household')
    and not exists (
      select 1 from unnest(bird_ids) as invited(id)
      where not exists (select 1 from public.birds b where b.id = invited.id and b.owner_id = household_invites.owner_id)
         or not private.has_capability(invited.id, (select auth.uid()), 'view')
    )
  );

drop policy if exists "household_invites update" on public.household_invites;
create policy "household_invites update" on public.household_invites for update to authenticated
  using (private.has_household_capability(owner_id, (select auth.uid()), 'manage_household'))
  with check (
    private.has_household_capability(owner_id, (select auth.uid()), 'manage_household')
    and not exists (
      select 1 from unnest(bird_ids) as invited(id)
      where not exists (select 1 from public.birds b where b.id = invited.id and b.owner_id = household_invites.owner_id)
         or not private.has_capability(invited.id, (select auth.uid()), 'view')
    )
  );
