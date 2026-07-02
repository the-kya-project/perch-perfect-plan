-- SECURITY: lock handoff_accept_transfer to service_role only.
--
-- Postgres grants EXECUTE on new functions to PUBLIC by default, and the restore
-- migration (like the original) only ADDED a service_role grant without revoking
-- that default. So anon/authenticated inherited execute and could call
-- /rest/v1/rpc/handoff_accept_transfer directly with an arbitrary p_handoff_id
-- and p_new_owner = themselves, bypassing the recipient-email check that lives in
-- the acceptHandoff server fn — an arbitrary ownership grab.
--
-- The intended design is: only the service-role handoff server fn calls this,
-- AFTER verifying the signed-in user is the handoff's intended recipient. Enforce
-- that by removing execute from everyone except service_role.

revoke execute on function public.handoff_accept_transfer(uuid, uuid) from public;
revoke execute on function public.handoff_accept_transfer(uuid, uuid) from anon;
revoke execute on function public.handoff_accept_transfer(uuid, uuid) from authenticated;
grant execute on function public.handoff_accept_transfer(uuid, uuid) to service_role;

notify pgrst, 'reload schema';
