-- One guidelines agreement: the walk-through's (Brittany, Nov 28, 2026).
--
-- Until now joining needed the join step's own "I agree to the community
-- guidelines" checkbox, recorded in flock_agreements at
-- private.flock_guidelines_version() ('2026-12'). The walk-through
-- (20261128180000) now records agreement in flock_guideline_agreements at
-- public.current_guidelines_version(), and the join step drops its checkbox.
--
-- What changes: private.flock_agreed(user), which flock_join() and
-- flock_my_access() read, is now true when the person has BOTH
--   - a join record (flock_agreements: their chapter and "I'm 18 or older",
--     still written by flock_agree() from the join step), and
--   - the walk-through agreement at the current guidelines version.
-- Its signature, grants and callers are unchanged.
--
-- The guidelines' only version is now public.current_guidelines_version()
-- (with GUIDELINES_VERSION in src/flock/guidelines/version.ts). The join
-- record's private.flock_guidelines_version() stays '2026-12' and is frozen:
-- never bump it; it no longer stands for the guidelines' words.
--
-- Flock-only: nothing in the care app reads flock_agreed. Pinned by
-- supabase/checks/flock_guideline_agreements_checks.sql (joining needs the
-- walk-through) and flock_open_checks.sql.

create or replace function private.flock_agreed(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
      select 1 from public.flock_agreements a
      where a.user_id = p_user and a.guidelines_version = private.flock_guidelines_version()
    )
    and exists (
      select 1 from public.flock_guideline_agreements g
      where g.user_id = p_user and g.version = public.current_guidelines_version()
    );
$$;
revoke all on function private.flock_agreed(uuid) from public, anon;
grant execute on function private.flock_agreed(uuid) to authenticated, service_role;

-- The join record's version is frozen; say so where it's defined.
comment on function private.flock_guidelines_version() is
  'Frozen at 2026-12: the version of the join record (flock_agreements: chapter and 18+). Never bump it. The community guidelines'' version is public.current_guidelines_version() (20261128210000).';
