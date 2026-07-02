-- Close a lingering access-grant path on handoff. A pending household_invite
-- carries a snapshot list of bird_ids; the previous owner may have a pending
-- invite that names the bird being handed off. The transfer previously left that
-- invite untouched, so the invitee could accept LATER and be granted
-- bird_members on a bird that now belongs to the new owner — a third party
-- gaining access without the new owner's consent (same failure class as the
-- "removed member still sees birds" bug).
--
-- Fix here: on transfer, remove the handed-off bird from every pending invite's
-- bird_ids so the reference is cleaned together with bird_members/sit_birds.
-- (The acceptHouseholdInvite server fn also re-checks current ownership at accept
-- time as defense in depth.) Only this one line is added vs. 20260702140000.

create or replace function public.handoff_accept_transfer(p_handoff_id uuid, p_new_owner uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bird uuid;
  v_sender uuid;
  v_recipient text;
  v_name text;
  v_species text;
  v_intake date;
  v_foster boolean;
begin
  select bird_id, sender_user_id, recipient_name
    into v_bird, v_sender, v_recipient
  from public.handoffs where id = p_handoff_id for update;
  if v_bird is null then raise exception 'handoff not found'; end if;
  if p_new_owner = v_sender then raise exception 'cannot hand off to yourself'; end if;

  select name, species, intake_date, coalesce(is_foster, false)
    into v_name, v_species, v_intake, v_foster
  from public.birds where id = v_bird;

  -- New owner membership (don't duplicate if somehow present).
  insert into public.bird_members (bird_id, user_id, role)
  values (v_bird, p_new_owner, 'owner')
  on conflict (bird_id, user_id) do update set role = 'owner';

  -- Owner mirror.
  update public.birds set owner_id = p_new_owner where id = v_bird;

  -- Remove the previous owner AND all household members on this bird.
  delete from public.bird_members where bird_id = v_bird and user_id <> p_new_owner;

  -- Detach from any sits → cancels sitter access to THIS bird only.
  delete from public.sit_birds where bird_id = v_bird;

  -- Prune the handed-off bird from any pending household invites so a later
  -- accept can't grant a third party access to the new owner's bird.
  update public.household_invites
  set bird_ids = array_remove(bird_ids, v_bird)
  where status = 'pending' and v_bird = any(bird_ids);

  -- Sender's read-only memory snapshot.
  insert into public.past_birds
    (original_owner_id, bird_name, species, intake_date, departed_on, recipient_name, mode, was_foster)
  values
    (v_sender, v_name, v_species, v_intake, current_date, v_recipient, 'app', v_foster);

  -- Finalize.
  update public.handoffs
  set status = 'accepted', accepted_user_id = p_new_owner, completed_at = now()
  where id = p_handoff_id;
end;
$$;

-- Keep execute locked to service_role only (create-or-replace preserves grants,
-- but be explicit so this migration is self-contained and safe if re-ordered).
revoke execute on function public.handoff_accept_transfer(uuid, uuid) from public;
revoke execute on function public.handoff_accept_transfer(uuid, uuid) from anon;
revoke execute on function public.handoff_accept_transfer(uuid, uuid) from authenticated;
grant execute on function public.handoff_accept_transfer(uuid, uuid) to service_role;

notify pgrst, 'reload schema';
