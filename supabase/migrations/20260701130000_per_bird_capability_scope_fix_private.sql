-- CORRECTS 20260701120000, which targeted the wrong schema.
--
-- 20260628120000 moved has_capability into the `private` schema (policies bind by
-- OID, so RLS actually calls private.has_capability). The previous per-bird
-- migration ran `create or replace function PUBLIC.has_capability`, which:
--   1) created a NEW, dead public.has_capability (referenced by no policy), and
--   2) left the ENFORCED private.has_capability on the old logic — so per-bird
--      scoping never took effect;
--   3) re-exposed a public.has_capability RPC (the lockdown had removed it).
--
-- Fix: apply the per-bird logic to the ACTUAL enforced function
-- (private.has_capability, same OID the policies call), and drop the stray public
-- copy to restore the lockdown posture.

create or replace function private.has_capability(p_bird_id uuid, p_user_id uuid, p_capability text)
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

-- Preserve the lockdown grants on the enforced (private) function.
revoke all on function private.has_capability(uuid, uuid, text) from public, anon;
grant execute on function private.has_capability(uuid, uuid, text) to authenticated, service_role;

-- Remove the stray public copy created by 20260701120000 (restores the lockdown:
-- these helpers must NOT be callable as a PostgREST RPC).
drop function if exists public.has_capability(uuid, uuid, text);
