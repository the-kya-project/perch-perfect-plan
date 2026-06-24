-- Household-as-caregiver: a sit may be covered by a household member instead of
-- an external sitter. One caregiver per sit. The household member already has
-- household-role access to the bird via bird_members; this migration only adds
-- the assignment + the read access on the sit itself so the app can shift their
-- experience for the duration. No new permissions on bird-scoped data.
--
-- Two-path sit caregiver:
--   external sitter:  invite_token + sitter_email (existing flow, untouched)
--   household member: caregiver_user_id, no token
-- A check constraint enforces exactly one path.

-- 1) The new "household caregiver" column.
alter table public.sits
  add column caregiver_user_id uuid null references auth.users(id) on delete set null;

-- 2) Make the token columns nullable so caregiver sits don't have to mint a
--    token nobody uses. Existing external-sitter rows keep their values.
alter table public.sits alter column invite_token drop not null;
alter table public.sits alter column token_expires_at drop not null;

-- 3) Mutual exclusivity: a sit has EITHER a token (external sitter) OR a
--    caregiver_user_id (household), never both, never neither.
alter table public.sits add constraint sits_one_caregiver_chk check (
  (invite_token is not null and caregiver_user_id is null) or
  (invite_token is null and caregiver_user_id is not null)
);

-- 4) Attribution: sit_id on the two log tables that don't already carry it, so
--    a sit's activity feed can be derived from sit_id (not date-range), which
--    avoids over-including household-member entries made by NON-caregivers
--    during the same window.
alter table public.weight_entries
  add column sit_id uuid null references public.sits(id) on delete set null;
alter table public.journal_entries
  add column sit_id uuid null references public.sits(id) on delete set null;

-- 5) RLS — the household caregiver needs to READ the sits row + its sit_birds
--    join while they're assigned. They already have read access to the BIRDS
--    via bird_members (unchanged). This adds the assignment visibility only.
drop policy if exists "sits caregiver read" on public.sits;
create policy "sits caregiver read" on public.sits
  for select using (caregiver_user_id = auth.uid());

drop policy if exists "sit_birds caregiver read" on public.sit_birds;
create policy "sit_birds caregiver read" on public.sit_birds
  for select using (
    exists (select 1 from public.sits s
            where s.id = sit_birds.sit_id and s.caregiver_user_id = auth.uid())
  );

-- Existing owner-read policies on sits + sit_birds are unchanged. The external
-- sitter token flow + /sit/[token] route are unchanged.
