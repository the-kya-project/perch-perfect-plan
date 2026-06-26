-- "Who's in charge of this sit" — the responsible/lead household member.
--
-- Distinct from caregiver_user_id (which is who COVERS the sit when a household
-- member sits instead of an external sitter). lead_user_id is the responsible
-- person regardless of whether the sitter is external or household, and defaults
-- to the owner. Keyed on auth.users id, same identity as owner_id /
-- caregiver_user_id / bird_members.user_id.
--
-- Membership enforcement is app-level (the picker only offers the owner + the
-- household members who have access to every bird on the sit), matching the
-- existing caregiver_user_id pattern (no DB membership constraint there either);
-- the FK guarantees a real user. Notification/handoff routing to the lead is a
-- later pass.

alter table public.sits
  add column lead_user_id uuid null references auth.users(id) on delete set null;

-- Backfill: every existing sit's lead is its creator/owner (so none are null).
update public.sits set lead_user_id = owner_id where lead_user_id is null;
