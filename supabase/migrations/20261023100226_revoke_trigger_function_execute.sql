-- Trigger functions are not RPCs. Both of these are SECURITY DEFINER and
-- `returns trigger`, and they carried PostgreSQL's default EXECUTE grant to
-- PUBLIC, so the security advisor flagged them as callable by anon and
-- authenticated at /rest/v1/rpc/<name>.
--
-- Revoking EXECUTE does not affect the triggers: PostgreSQL checks EXECUTE on
-- a trigger function only when the trigger is created, not each time it
-- fires. profiles_time_zone_to_sits (on profiles) and sits_enforce_token_rules
-- (on sits) keep firing for every role, as before.
--
-- A later `create or replace function` keeps these revokes; only a drop and
-- re-create would bring the default grant back.

revoke execute on function public.apply_profile_time_zone_to_sits() from public, anon, authenticated;
revoke execute on function public.enforce_sit_token_rules() from public, anon, authenticated;
