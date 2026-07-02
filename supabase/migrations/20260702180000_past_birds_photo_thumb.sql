-- Keepsake thumbnail for past (handed-off) birds. The bird's live photo moves to
-- the new owner's storage folder on handoff (and the sender loses access), so the
-- sender's memory needs a SELF-CONTAINED copy: a small base64 data-URL thumbnail
-- stored on the past_birds row itself (owner-read RLS already covers it; no
-- storage access needed). Captured server-side at handoff time.
alter table public.past_birds
  add column if not exists photo_thumb text;

-- Extend handoff_accept_transfer to accept the thumbnail and store it on the
-- snapshot. Drop the 2-arg version and recreate with a defaulted 3rd param so
-- there's a single function (old 2-arg callers still resolve via the default,
-- keeping the deploy window safe). Only the past_birds insert changes vs.
-- 20260702170000.
drop function if exists public.handoff_accept_transfer(uuid, uuid);

create or replace function public.handoff_accept_transfer(
  p_handoff_id uuid,
  p_new_owner uuid,
  p_photo_thumb text default null
)
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
  -- new owner. Clear foster status and the stale "fostering since" atomically.
  -- No-ops for a non-foster bird.
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

  -- Sender's read-only memory snapshot (was_foster + keepsake thumbnail).
  insert into public.past_birds
    (original_owner_id, bird_name, species, intake_date, departed_on, recipient_name, mode, was_foster, photo_thumb)
  values
    (v_sender, v_name, v_species, v_intake, current_date, v_recipient, 'app', v_foster, p_photo_thumb);

  -- Finalize.
  update public.handoffs
  set status = 'accepted', accepted_user_id = p_new_owner, completed_at = now()
  where id = p_handoff_id;
end;
$$;

-- Execute locked to service_role only (default PUBLIC grant on the new function
-- must be revoked; the server fn holds the recipient-email authorization gate).
revoke execute on function public.handoff_accept_transfer(uuid, uuid, text) from public;
revoke execute on function public.handoff_accept_transfer(uuid, uuid, text) from anon;
revoke execute on function public.handoff_accept_transfer(uuid, uuid, text) from authenticated;
grant execute on function public.handoff_accept_transfer(uuid, uuid, text) to service_role;

notify pgrst, 'reload schema';
