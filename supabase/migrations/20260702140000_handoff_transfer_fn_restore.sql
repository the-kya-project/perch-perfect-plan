-- RESTORE handoff_accept_transfer. Migration 20260623191000 that defined this
-- function is recorded as applied in the migration history, but the function is
-- absent from the database (lost in a revert: registered via the baseline
-- `migration repair` without its SQL ever running, and no later migration drops
-- it). Because 20260623191000 is marked applied, `db push` won't re-run it — so
-- this new migration re-creates the function idempotently.
--
-- Definition is identical to the original (atomic ownership swap; see
-- 20260623191000_handoff_transfer_fn.sql). Called only by the service-role
-- handoff server fn AFTER it verifies the signed-in user is the handoff's
-- intended recipient; execute is granted to service_role only.

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

grant execute on function public.handoff_accept_transfer(uuid, uuid) to service_role;

-- Nudge PostgREST to reload its schema cache so the RPC resolves immediately.
notify pgrst, 'reload schema';
