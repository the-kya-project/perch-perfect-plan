-- Let a household member with manage_sits delete a sit (owner could already).
-- The capability pass (20260626160000) left `sits delete` owner-only, so
-- manage_sits gated nothing for deletion. Broaden DELETE only — INSERT/UPDATE
-- stay owner-only (sit creation/editing remains the owner's, per PR #248).
--
-- Deleting a sit row cleans up its children automatically via existing FKs
-- (these run as a system cascade, NOT subject to RLS): sit_birds,
-- task_completions, sit_checklist_items are ON DELETE CASCADE; daily_logs /
-- photo_logs / weight_entries keep their rows with sit_id set to NULL
-- (ON DELETE SET NULL) — a sitter's logged scans/weights survive, just detached.
--
-- ORDERING: references public.has_household_capability, so this MUST sort BEFORE
-- 20260628120000 (which moves it to the private schema). It does (0626 < 0628);
-- after that move runs, this policy follows the function by OID.

drop policy if exists "sits delete" on public.sits;
create policy "sits delete" on public.sits for delete to authenticated
  using (owner_id = (select auth.uid()) or public.has_household_capability(owner_id, (select auth.uid()), 'manage_sits'));
