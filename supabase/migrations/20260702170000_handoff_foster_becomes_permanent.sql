-- A handoff of a FOSTER bird is an adoption: the bird becomes PERMANENT for the
-- new owner. Previously the transfer only reassigned owner_id and left
-- is_foster=true, so the adopted bird landed in the new owner's fosters/"in your
-- care" section with the previous owner's "fostering since" (intake_date) still
-- showing. Clear foster status in the SAME atomic transaction as the ownership
-- swap, mirroring the foster-fail path (makePermanent): is_foster=false +
-- became_permanent_on=today. Also clear intake_date (a foster-only "with you
-- since" that is meaningless/stale for the new permanent owner). Non-foster
-- handoffs are unaffected (all three are no-ops when v_foster is false).
--
-- v_foster / was_foster in past_birds is unchanged: the SENDER's read-only memory
-- correctly records that this was a foster they had.
--
-- Only the birds UPDATE changes vs. 20260702160000.

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

  -- Owner mirror + adoption: a foster handed off becomes a PERMANENT bird for the
  -- new owner. Clear foster status and the stale "fostering since" here so it
  -- happens atomically with the transfer. No-ops for a non-foster bird.
  update public.birds set
    owner_id = p_new_owner,
    is_foster = case when v_foster then false else is_foster end,
    became_permanent_on = case when v_foster then current_date else became_permanent_on end,
    intake_date = case when v_foster then null else intake_date end
  where id = v_bird;

  -- Remove the previous owner AND all household members on this bird.
  delete from public.bird_members where bird_id = v_bird and user_id <> p_new_owner;

  -- Detach from any sits → cancels sitter access to THIS bird only.
  delete from public.sit_birds where bird_id = v_bird;

  -- Prune the handed-off bird from any pending household invites so a later
  -- accept can't grant a third party access to the new owner's bird.
  update public.household_invites
  set bird_ids = array_remove(bird_ids, v_bird)
  where status = 'pending' and v_bird = any(bird_ids);

  -- Sender's read-only memory snapshot (was_foster preserved from v_foster).
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

-- Keep execute locked to service_role only (self-contained + safe if re-ordered).
revoke execute on function public.handoff_accept_transfer(uuid, uuid) from public;
revoke execute on function public.handoff_accept_transfer(uuid, uuid) from anon;
revoke execute on function public.handoff_accept_transfer(uuid, uuid) from authenticated;
grant execute on function public.handoff_accept_transfer(uuid, uuid) to service_role;

notify pgrst, 'reload schema';
