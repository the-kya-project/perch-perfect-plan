-- =====================================================================
-- Household sharing — permanent, account-based, per-bird "view + log".
-- Builds on bird_members + has_bird_access (multi-owner foundation).
-- Sitter sharing (token links) is UNCHANGED by this migration.
--
-- PERMISSION SPLIT this introduces (was: every bird-scoped table had ONE
-- "member all" policy → any member, incl. household, could write everything):
--
--   READ (SELECT)            : any member (owner OR household)      [unchanged]
--   WRITE on OWNER tables     : role = 'owner' ONLY                  [TIGHTENED]
--     birds (basics/identity), care_plans, routine_tasks,
--     emergency_contacts, moments, anchor_photos
--   WRITE on LOG tables       : any member may INSERT; UPDATE/DELETE [TIGHTENED]
--     limited to the OWNER or the row's AUTHOR (logged_by/run_by):
--     weight_entries, journal_entries, daily_logs, photo_logs
--
-- Owner-only checks reuse the existing has_bird_access(...) = 'owner' — no new
-- helper function is added (has_bird_access already returns the role).
--
-- Cross-owner isolation is preserved: a user with no bird_members row for a
-- bird gets has_bird_access = NULL → denied on every policy.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1) household_invites — email invitations that grant role='household'
--    on accept. Read/write by the owner only; the accept/decline path is
--    token-based via a SECURITY-DEFINER / service-role server fn (so an
--    invitee — possibly logged out or a different account — never needs a
--    direct RLS read). bird_ids ownership is validated in the server fn.
-- ---------------------------------------------------------------------
create extension if not exists citext;

create table if not exists public.household_invites (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null references auth.users(id) on delete cascade,
  invitee_email    citext not null,
  invitee_name     text,
  bird_ids         uuid[] not null,
  token            text not null unique,
  status           text not null default 'pending'
                     check (status in ('pending','accepted','declined','canceled','expired')),
  created_at       timestamptz not null default now(),
  expires_at       timestamptz not null default (now() + interval '14 days'),
  accepted_user_id uuid references auth.users(id) on delete set null
);
create index if not exists household_invites_owner_idx on public.household_invites(owner_id);
create index if not exists household_invites_token_idx on public.household_invites(token);
create index if not exists household_invites_email_idx on public.household_invites(invitee_email);

grant select, insert, update, delete on public.household_invites to authenticated;
grant all on public.household_invites to service_role;

alter table public.household_invites enable row level security;
drop policy if exists "household_invites owner all" on public.household_invites;
create policy "household_invites owner all" on public.household_invites for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- ---------------------------------------------------------------------
-- 2) source='household' on the log tables (additive — recreate the checks)
-- ---------------------------------------------------------------------
alter table public.weight_entries drop constraint if exists weight_entries_source_check;
alter table public.weight_entries
  add constraint weight_entries_source_check check (source in ('owner','sitter','household'));

alter table public.daily_logs drop constraint if exists daily_logs_source_check;
alter table public.daily_logs
  add constraint daily_logs_source_check check (source in ('owner','sitter','household'));

-- ---------------------------------------------------------------------
-- 3) OWNER-ONLY write tables — members read, only the owner writes.
--    (Replaces the prior single "member all" policy on each.)
-- ---------------------------------------------------------------------

-- birds: keep member SELECT, self INSERT, owner DELETE; tighten UPDATE to owner.
drop policy if exists "birds member update" on public.birds;
create policy "birds owner update" on public.birds for update to authenticated
  using (public.has_bird_access(id, auth.uid()) = 'owner')
  with check (public.has_bird_access(id, auth.uid()) = 'owner');

-- care_plans
drop policy if exists "care_plans member all" on public.care_plans;
drop policy if exists "care_plans member read" on public.care_plans;
drop policy if exists "care_plans owner write" on public.care_plans;
create policy "care_plans member read" on public.care_plans for select to authenticated
  using (public.has_bird_access(bird_id, auth.uid()) is not null);
create policy "care_plans owner write" on public.care_plans for all to authenticated
  using (public.has_bird_access(bird_id, auth.uid()) = 'owner')
  with check (public.has_bird_access(bird_id, auth.uid()) = 'owner');

-- routine_tasks (bird_id resolved via care_plans)
drop policy if exists "routine_tasks member all" on public.routine_tasks;
drop policy if exists "routine_tasks member read" on public.routine_tasks;
drop policy if exists "routine_tasks owner write" on public.routine_tasks;
create policy "routine_tasks member read" on public.routine_tasks for select to authenticated
  using (public.has_bird_access((select cp.bird_id from public.care_plans cp where cp.id = care_plan_id), auth.uid()) is not null);
create policy "routine_tasks owner write" on public.routine_tasks for all to authenticated
  using (public.has_bird_access((select cp.bird_id from public.care_plans cp where cp.id = care_plan_id), auth.uid()) = 'owner')
  with check (public.has_bird_access((select cp.bird_id from public.care_plans cp where cp.id = care_plan_id), auth.uid()) = 'owner');

-- emergency_contacts
drop policy if exists "emergency_contacts member all" on public.emergency_contacts;
drop policy if exists "emergency_contacts member read" on public.emergency_contacts;
drop policy if exists "emergency_contacts owner write" on public.emergency_contacts;
create policy "emergency_contacts member read" on public.emergency_contacts for select to authenticated
  using (public.has_bird_access(bird_id, auth.uid()) is not null);
create policy "emergency_contacts owner write" on public.emergency_contacts for all to authenticated
  using (public.has_bird_access(bird_id, auth.uid()) = 'owner')
  with check (public.has_bird_access(bird_id, auth.uid()) = 'owner');

-- moments (keepsakes are owner-curated; household views but does not add)
drop policy if exists "moments member all" on public.moments;
drop policy if exists "moments member read" on public.moments;
drop policy if exists "moments owner write" on public.moments;
create policy "moments member read" on public.moments for select to authenticated
  using (public.has_bird_access(bird_id, auth.uid()) is not null);
create policy "moments owner write" on public.moments for all to authenticated
  using (public.has_bird_access(bird_id, auth.uid()) = 'owner')
  with check (public.has_bird_access(bird_id, auth.uid()) = 'owner');

-- anchor_photos (moment photos) — same as moments
drop policy if exists "anchor_photos member all" on public.anchor_photos;
drop policy if exists "anchor_photos member read" on public.anchor_photos;
drop policy if exists "anchor_photos owner write" on public.anchor_photos;
create policy "anchor_photos member read" on public.anchor_photos for select to authenticated
  using (public.has_bird_access(bird_id, auth.uid()) is not null);
create policy "anchor_photos owner write" on public.anchor_photos for all to authenticated
  using (public.has_bird_access(bird_id, auth.uid()) = 'owner')
  with check (public.has_bird_access(bird_id, auth.uid()) = 'owner');

-- ---------------------------------------------------------------------
-- 4) LOG tables — any member may INSERT (view + log); UPDATE/DELETE limited
--    to the OWNER or the row's author. Sitters write these via service role
--    (RLS-exempt), so sitter logging is unaffected.
-- ---------------------------------------------------------------------

-- weight_entries (author = logged_by)
drop policy if exists "weight_entries member all" on public.weight_entries;
drop policy if exists "weight_entries member read" on public.weight_entries;
drop policy if exists "weight_entries member insert" on public.weight_entries;
drop policy if exists "weight_entries author or owner update" on public.weight_entries;
drop policy if exists "weight_entries author or owner delete" on public.weight_entries;
create policy "weight_entries member read" on public.weight_entries for select to authenticated
  using (public.has_bird_access(bird_id, auth.uid()) is not null);
create policy "weight_entries member insert" on public.weight_entries for insert to authenticated
  with check (public.has_bird_access(bird_id, auth.uid()) is not null);
create policy "weight_entries author or owner update" on public.weight_entries for update to authenticated
  using (public.has_bird_access(bird_id, auth.uid()) = 'owner' or logged_by = auth.uid())
  with check (public.has_bird_access(bird_id, auth.uid()) = 'owner' or logged_by = auth.uid());
create policy "weight_entries author or owner delete" on public.weight_entries for delete to authenticated
  using (public.has_bird_access(bird_id, auth.uid()) = 'owner' or logged_by = auth.uid());

-- journal_entries (author = logged_by)
drop policy if exists "journal_entries member all" on public.journal_entries;
drop policy if exists "journal_entries member read" on public.journal_entries;
drop policy if exists "journal_entries member insert" on public.journal_entries;
drop policy if exists "journal_entries author or owner update" on public.journal_entries;
drop policy if exists "journal_entries author or owner delete" on public.journal_entries;
create policy "journal_entries member read" on public.journal_entries for select to authenticated
  using (public.has_bird_access(bird_id, auth.uid()) is not null);
create policy "journal_entries member insert" on public.journal_entries for insert to authenticated
  with check (public.has_bird_access(bird_id, auth.uid()) is not null);
create policy "journal_entries author or owner update" on public.journal_entries for update to authenticated
  using (public.has_bird_access(bird_id, auth.uid()) = 'owner' or logged_by = auth.uid())
  with check (public.has_bird_access(bird_id, auth.uid()) = 'owner' or logged_by = auth.uid());
create policy "journal_entries author or owner delete" on public.journal_entries for delete to authenticated
  using (public.has_bird_access(bird_id, auth.uid()) = 'owner' or logged_by = auth.uid());

-- daily_logs (author = run_by; sitter rows have run_by null → owner-only edits)
drop policy if exists "daily_logs member all" on public.daily_logs;
drop policy if exists "daily_logs member read" on public.daily_logs;
drop policy if exists "daily_logs member insert" on public.daily_logs;
drop policy if exists "daily_logs author or owner update" on public.daily_logs;
drop policy if exists "daily_logs author or owner delete" on public.daily_logs;
create policy "daily_logs member read" on public.daily_logs for select to authenticated
  using (public.has_bird_access(bird_id, auth.uid()) is not null);
create policy "daily_logs member insert" on public.daily_logs for insert to authenticated
  with check (public.has_bird_access(bird_id, auth.uid()) is not null);
create policy "daily_logs author or owner update" on public.daily_logs for update to authenticated
  using (public.has_bird_access(bird_id, auth.uid()) = 'owner' or run_by = auth.uid())
  with check (public.has_bird_access(bird_id, auth.uid()) = 'owner' or run_by = auth.uid());
create policy "daily_logs author or owner delete" on public.daily_logs for delete to authenticated
  using (public.has_bird_access(bird_id, auth.uid()) = 'owner' or run_by = auth.uid());

-- photo_logs (no author column → member insert, owner-only update/delete)
drop policy if exists "photo_logs member all" on public.photo_logs;
drop policy if exists "photo_logs member read" on public.photo_logs;
drop policy if exists "photo_logs member insert" on public.photo_logs;
drop policy if exists "photo_logs owner write" on public.photo_logs;
create policy "photo_logs member read" on public.photo_logs for select to authenticated
  using (public.has_bird_access(bird_id, auth.uid()) is not null);
create policy "photo_logs member insert" on public.photo_logs for insert to authenticated
  with check (public.has_bird_access(bird_id, auth.uid()) is not null);
create policy "photo_logs owner update" on public.photo_logs for update to authenticated
  using (public.has_bird_access(bird_id, auth.uid()) = 'owner')
  with check (public.has_bird_access(bird_id, auth.uid()) = 'owner');
create policy "photo_logs owner delete" on public.photo_logs for delete to authenticated
  using (public.has_bird_access(bird_id, auth.uid()) = 'owner');

-- NOTE: weight_logs (legacy, no longer written from the UI) intentionally keeps
-- its existing "weight_logs member all" policy — leaving it untouched avoids any
-- behavior change to deprecated data. journal-photos storage policies are
-- already member-scoped; household can attach journal photos (consistent with
-- "add journal entries").

commit;
