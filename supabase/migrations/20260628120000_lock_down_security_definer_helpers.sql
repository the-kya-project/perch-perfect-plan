-- Security (advisor): SECURITY DEFINER helper functions were callable as public
-- RPC by signed-in users. Lock them down without changing any RLS semantics.
--
-- Flagged:
--   public.birds_sync_owner_member()              -- TRIGGER helper, never user-callable
--   public.has_bird_access(uuid, uuid)            -- called by bird-scoped RLS
--   public.has_capability(uuid, uuid, text)       -- called by capability RLS
--   public.has_household_capability(uuid, uuid, text)
--
-- Why this works WITHOUT recreating ~80 policies:
--   RLS policy expressions reference a function by its OID, not by name.
--   `ALTER FUNCTION ... SET SCHEMA private` keeps the SAME OID, so every policy
--   that calls these helpers keeps calling the same function — now living in a
--   schema PostgREST does not expose. Postgres evaluates policies via that OID
--   (no name lookup), and the functions are SECURITY DEFINER, so they keep
--   working identically. No policy is altered; access semantics are unchanged.
--
-- Why EXECUTE stays granted to authenticated/service_role:
--   RLS policy evaluation runs the helper AS the querying role, so that role
--   needs EXECUTE. Granting EXECUTE inside a NON-exposed schema (`private`) is
--   NOT RPC access — PostgREST only exposes `public` (+ graphql_public/storage),
--   so private.* has no /rest/v1/rpc/ endpoint. PUBLIC and anon are revoked
--   (defense-in-depth; no anon role evaluates these policies — authenticated
--   app traffic uses `authenticated`, and the sitter/public paths use the
--   service role, which bypasses RLS).
--
-- birds_sync_owner_member stays a trigger in public: trigger functions fire
-- without the invoking user holding EXECUTE, so revoking EXECUTE from everyone
-- leaves the trigger working while removing all direct callability.

-- 1) A private schema PostgREST does not expose.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

-- 2) Trigger-only helper — not user-callable at all (trigger keeps firing).
revoke all on function public.birds_sync_owner_member() from public, anon, authenticated;

-- 3) Move the RLS helpers out of the API schema. Policies follow them by OID.
alter function public.has_bird_access(uuid, uuid) set schema private;
alter function public.has_capability(uuid, uuid, text) set schema private;
alter function public.has_household_capability(uuid, uuid, text) set schema private;

-- 4) Harden search_path = '' on all three (bodies are fully schema-qualified
--    to public.*, so this is safe; has_bird_access previously used `public`).
alter function private.has_bird_access(uuid, uuid) set search_path = '';
alter function private.has_capability(uuid, uuid, text) set search_path = '';
alter function private.has_household_capability(uuid, uuid, text) set search_path = '';

-- 5) Grants: only the policy-evaluating roles get EXECUTE; never PUBLIC/anon.
revoke all on function private.has_bird_access(uuid, uuid) from public, anon;
revoke all on function private.has_capability(uuid, uuid, text) from public, anon;
revoke all on function private.has_household_capability(uuid, uuid, text) from public, anon;

grant execute on function private.has_bird_access(uuid, uuid) to authenticated, service_role;
grant execute on function private.has_capability(uuid, uuid, text) to authenticated, service_role;
grant execute on function private.has_household_capability(uuid, uuid, text) to authenticated, service_role;
