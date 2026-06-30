-- Let the owner choose a starting permission preset when inviting a household
-- member (preset-level only; per-capability tuning stays on the permissions
-- screen). The chosen preset rides on the invite row and is applied at accept
-- time instead of the previously-hardcoded "caregiver".
--
-- Valid values mirror capabilities.ts ASSIGNABLE_PRESETS (no "custom" — that's a
-- derived state, never assigned). Default 'caregiver' keeps existing behavior
-- for any code path that omits it, and backfills pending invites unchanged.

alter table public.household_invites
  add column if not exists preset text not null default 'caregiver'
    check (preset in ('viewer', 'caregiver', 'care_manager', 'co_owner'));
