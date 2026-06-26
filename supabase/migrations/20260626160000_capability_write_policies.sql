-- Enforcement pass: gate write policies by has_capability() / has_household_capability(),
-- and collapse overlapping (FOR ALL + FOR SELECT) policies into exactly ONE
-- permissive policy per command per table (clears the 8 "Multiple Permissive
-- Policies" advisor warnings: anchor_photos, bird_members, care_plans,
-- emergency_contacts, moments, routine_tasks, sit_birds, sits).
--
-- Baseline read = any household member ('view'); writes gated per capability.
-- Owners always pass (the functions short-circuit on the bird/household owner).
-- auth.uid() is wrapped as (select auth.uid()) to keep the initplan optimization.
--
-- Decisions applied (from review):
--   1. daily_logs (the scan table) writes -> record_health.
--   2. moments + anchor_photos stay OWNER-ONLY to write (keepsakes are
--      owner-curated); only their overlapping policies are collapsed + a member
--      'view' read added.
--   3. sits + sit_birds stay OWNER-ONLY to write (preserve PR #248); only the
--      overlap is collapsed + member/caregiver read folded into one SELECT.
--      sit_checklist_items is left fully as-is (owner-only, no advisor warning).
--   4. Extra (unlisted) tables capped: photo_logs->log_daily_care,
--      journal_entries->record_health, handoffs->manage_flock,
--      household_invites->manage_household, task_completions->log_daily_care.
--      weight_logs left as legacy; owner_emergency_defaults left self-only.
--
-- The previous per-row "author can edit own" nuance on weight_entries /
-- daily_logs / journal_entries / photo_logs is intentionally replaced by
-- capability gating (household trust model).

-- ===========================================================================
-- Household-level companion to has_capability (for owner-keyed tables).
-- ===========================================================================
create or replace function public.has_household_capability(p_owner_id uuid, p_user_id uuid, p_capability text)
returns boolean language sql stable security definer set search_path = '' as $$
  select case
    when p_owner_id = p_user_id then true
    when p_capability = 'view' then exists (
      select 1 from public.household_member_permissions h
      where h.owner_id = p_owner_id and h.member_user_id = p_user_id)
    else exists (
      select 1 from public.household_member_permissions h
      where h.owner_id = p_owner_id and h.member_user_id = p_user_id
        and p_capability = any(h.capabilities))
  end;
$$;
revoke execute on function public.has_household_capability(uuid, uuid, text) from public, anon;
grant execute on function public.has_household_capability(uuid, uuid, text) to authenticated, service_role;

-- ===========================================================================
-- PER-BIRD TABLES — has_capability(bird_id, (select auth.uid()), cap)
-- ===========================================================================

-- weight_entries -> log_daily_care -----------------------------------------
drop policy if exists "weight_entries author or owner delete" on public.weight_entries;
drop policy if exists "weight_entries member insert" on public.weight_entries;
drop policy if exists "weight_entries member read" on public.weight_entries;
drop policy if exists "weight_entries author or owner update" on public.weight_entries;
create policy "weight_entries read" on public.weight_entries for select to authenticated
  using (public.has_capability(bird_id, (select auth.uid()), 'view'));
create policy "weight_entries insert" on public.weight_entries for insert to authenticated
  with check (public.has_capability(bird_id, (select auth.uid()), 'log_daily_care'));
create policy "weight_entries update" on public.weight_entries for update to authenticated
  using (public.has_capability(bird_id, (select auth.uid()), 'log_daily_care'))
  with check (public.has_capability(bird_id, (select auth.uid()), 'log_daily_care'));
create policy "weight_entries delete" on public.weight_entries for delete to authenticated
  using (public.has_capability(bird_id, (select auth.uid()), 'log_daily_care'));

-- daily_logs (scans) -> record_health --------------------------------------
drop policy if exists "daily_logs author or owner delete" on public.daily_logs;
drop policy if exists "daily_logs member insert" on public.daily_logs;
drop policy if exists "daily_logs member read" on public.daily_logs;
drop policy if exists "daily_logs author or owner update" on public.daily_logs;
create policy "daily_logs read" on public.daily_logs for select to authenticated
  using (public.has_capability(bird_id, (select auth.uid()), 'view'));
create policy "daily_logs insert" on public.daily_logs for insert to authenticated
  with check (public.has_capability(bird_id, (select auth.uid()), 'record_health'));
create policy "daily_logs update" on public.daily_logs for update to authenticated
  using (public.has_capability(bird_id, (select auth.uid()), 'record_health'))
  with check (public.has_capability(bird_id, (select auth.uid()), 'record_health'));
create policy "daily_logs delete" on public.daily_logs for delete to authenticated
  using (public.has_capability(bird_id, (select auth.uid()), 'record_health'));

-- care_plans -> edit_care_plans (one row/bird, sections are columns) --------
drop policy if exists "care_plans owner write" on public.care_plans;
drop policy if exists "care_plans member read" on public.care_plans;
create policy "care_plans read" on public.care_plans for select to authenticated
  using (public.has_capability(bird_id, (select auth.uid()), 'view'));
create policy "care_plans insert" on public.care_plans for insert to authenticated
  with check (public.has_capability(bird_id, (select auth.uid()), 'edit_care_plans'));
create policy "care_plans update" on public.care_plans for update to authenticated
  using (public.has_capability(bird_id, (select auth.uid()), 'edit_care_plans'))
  with check (public.has_capability(bird_id, (select auth.uid()), 'edit_care_plans'));
create policy "care_plans delete" on public.care_plans for delete to authenticated
  using (public.has_capability(bird_id, (select auth.uid()), 'edit_care_plans'));

-- emergency_contacts -> manage_emergency -----------------------------------
drop policy if exists "emergency_contacts owner write" on public.emergency_contacts;
drop policy if exists "emergency_contacts member read" on public.emergency_contacts;
create policy "emergency_contacts read" on public.emergency_contacts for select to authenticated
  using (public.has_capability(bird_id, (select auth.uid()), 'view'));
create policy "emergency_contacts insert" on public.emergency_contacts for insert to authenticated
  with check (public.has_capability(bird_id, (select auth.uid()), 'manage_emergency'));
create policy "emergency_contacts update" on public.emergency_contacts for update to authenticated
  using (public.has_capability(bird_id, (select auth.uid()), 'manage_emergency'))
  with check (public.has_capability(bird_id, (select auth.uid()), 'manage_emergency'));
create policy "emergency_contacts delete" on public.emergency_contacts for delete to authenticated
  using (public.has_capability(bird_id, (select auth.uid()), 'manage_emergency'));

-- routine_tasks (definitions) -> edit_care_plans (bird via care_plans) ------
drop policy if exists "routine_tasks owner write" on public.routine_tasks;
drop policy if exists "routine_tasks member read" on public.routine_tasks;
create policy "routine_tasks read" on public.routine_tasks for select to authenticated
  using (public.has_capability((select cp.bird_id from public.care_plans cp where cp.id = care_plan_id), (select auth.uid()), 'view'));
create policy "routine_tasks insert" on public.routine_tasks for insert to authenticated
  with check (public.has_capability((select cp.bird_id from public.care_plans cp where cp.id = care_plan_id), (select auth.uid()), 'edit_care_plans'));
create policy "routine_tasks update" on public.routine_tasks for update to authenticated
  using (public.has_capability((select cp.bird_id from public.care_plans cp where cp.id = care_plan_id), (select auth.uid()), 'edit_care_plans'))
  with check (public.has_capability((select cp.bird_id from public.care_plans cp where cp.id = care_plan_id), (select auth.uid()), 'edit_care_plans'));
create policy "routine_tasks delete" on public.routine_tasks for delete to authenticated
  using (public.has_capability((select cp.bird_id from public.care_plans cp where cp.id = care_plan_id), (select auth.uid()), 'edit_care_plans'));

-- photo_logs -> log_daily_care ---------------------------------------------
drop policy if exists "photo_logs owner delete" on public.photo_logs;
drop policy if exists "photo_logs member insert" on public.photo_logs;
drop policy if exists "photo_logs member read" on public.photo_logs;
drop policy if exists "photo_logs owner update" on public.photo_logs;
create policy "photo_logs read" on public.photo_logs for select to authenticated
  using (public.has_capability(bird_id, (select auth.uid()), 'view'));
create policy "photo_logs insert" on public.photo_logs for insert to authenticated
  with check (public.has_capability(bird_id, (select auth.uid()), 'log_daily_care'));
create policy "photo_logs update" on public.photo_logs for update to authenticated
  using (public.has_capability(bird_id, (select auth.uid()), 'log_daily_care'))
  with check (public.has_capability(bird_id, (select auth.uid()), 'log_daily_care'));
create policy "photo_logs delete" on public.photo_logs for delete to authenticated
  using (public.has_capability(bird_id, (select auth.uid()), 'log_daily_care'));

-- journal_entries -> record_health (molt, meds, vet visits) -----------------
drop policy if exists "journal_entries author or owner delete" on public.journal_entries;
drop policy if exists "journal_entries member insert" on public.journal_entries;
drop policy if exists "journal_entries member read" on public.journal_entries;
drop policy if exists "journal_entries author or owner update" on public.journal_entries;
create policy "journal_entries read" on public.journal_entries for select to authenticated
  using (public.has_capability(bird_id, (select auth.uid()), 'view'));
create policy "journal_entries insert" on public.journal_entries for insert to authenticated
  with check (public.has_capability(bird_id, (select auth.uid()), 'record_health'));
create policy "journal_entries update" on public.journal_entries for update to authenticated
  using (public.has_capability(bird_id, (select auth.uid()), 'record_health'))
  with check (public.has_capability(bird_id, (select auth.uid()), 'record_health'));
create policy "journal_entries delete" on public.journal_entries for delete to authenticated
  using (public.has_capability(bird_id, (select auth.uid()), 'record_health'));

-- moments -> OWNER-ONLY write (keepsakes owner-curated), member read --------
drop policy if exists "moments owner write" on public.moments;
drop policy if exists "moments member read" on public.moments;
create policy "moments read" on public.moments for select to authenticated
  using (public.has_capability(bird_id, (select auth.uid()), 'view'));
create policy "moments insert" on public.moments for insert to authenticated
  with check (public.has_bird_access(bird_id, (select auth.uid())) = 'owner');
create policy "moments update" on public.moments for update to authenticated
  using (public.has_bird_access(bird_id, (select auth.uid())) = 'owner')
  with check (public.has_bird_access(bird_id, (select auth.uid())) = 'owner');
create policy "moments delete" on public.moments for delete to authenticated
  using (public.has_bird_access(bird_id, (select auth.uid())) = 'owner');

-- anchor_photos -> OWNER-ONLY write, member read ---------------------------
drop policy if exists "anchor_photos owner write" on public.anchor_photos;
drop policy if exists "anchor_photos member read" on public.anchor_photos;
create policy "anchor_photos read" on public.anchor_photos for select to authenticated
  using (public.has_capability(bird_id, (select auth.uid()), 'view'));
create policy "anchor_photos insert" on public.anchor_photos for insert to authenticated
  with check (public.has_bird_access(bird_id, (select auth.uid())) = 'owner');
create policy "anchor_photos update" on public.anchor_photos for update to authenticated
  using (public.has_bird_access(bird_id, (select auth.uid())) = 'owner')
  with check (public.has_bird_access(bird_id, (select auth.uid())) = 'owner');
create policy "anchor_photos delete" on public.anchor_photos for delete to authenticated
  using (public.has_bird_access(bird_id, (select auth.uid())) = 'owner');

-- handoffs -> manage_flock (sender keeps visibility; recipient accepts via
-- the existing security-definer RPC, which bypasses RLS) --------------------
drop policy if exists "handoffs sender all" on public.handoffs;
create policy "handoffs read" on public.handoffs for select to authenticated
  using (sender_user_id = (select auth.uid()) or public.has_capability(bird_id, (select auth.uid()), 'view'));
create policy "handoffs insert" on public.handoffs for insert to authenticated
  with check (sender_user_id = (select auth.uid()) and public.has_capability(bird_id, (select auth.uid()), 'manage_flock'));
create policy "handoffs update" on public.handoffs for update to authenticated
  using (public.has_capability(bird_id, (select auth.uid()), 'manage_flock'))
  with check (public.has_capability(bird_id, (select auth.uid()), 'manage_flock'));
create policy "handoffs delete" on public.handoffs for delete to authenticated
  using (public.has_capability(bird_id, (select auth.uid()), 'manage_flock'));

-- ===========================================================================
-- HOUSEHOLD / BIRD-OWNER KEYED TABLES
-- ===========================================================================

-- birds -> manage_flock. SELECT/UPDATE/DELETE use has_capability(id,…) (id IS
-- the bird_id; covers owner + hmp + bird_members read). INSERT has no existing
-- row, so gate on the NEW row's owner_id (nuance C).
drop policy if exists "birds owner delete" on public.birds;
drop policy if exists "birds insert self" on public.birds;
drop policy if exists "birds member select" on public.birds;
drop policy if exists "birds owner update" on public.birds;
create policy "birds read" on public.birds for select to authenticated
  using (public.has_capability(id, (select auth.uid()), 'view'));
create policy "birds insert" on public.birds for insert to authenticated
  with check (owner_id = (select auth.uid()) or public.has_household_capability(owner_id, (select auth.uid()), 'manage_flock'));
create policy "birds update" on public.birds for update to authenticated
  using (public.has_capability(id, (select auth.uid()), 'manage_flock'))
  with check (public.has_capability(id, (select auth.uid()), 'manage_flock'));
create policy "birds delete" on public.birds for delete to authenticated
  using (public.has_capability(id, (select auth.uid()), 'manage_flock'));

-- bird_members -> manage_household (per-bird; read covers any member) --------
drop policy if exists "bird_members owner write" on public.bird_members;
drop policy if exists "bird_members read" on public.bird_members;
create policy "bird_members read" on public.bird_members for select to authenticated
  using (public.has_capability(bird_id, (select auth.uid()), 'view'));
create policy "bird_members insert" on public.bird_members for insert to authenticated
  with check (public.has_capability(bird_id, (select auth.uid()), 'manage_household'));
create policy "bird_members update" on public.bird_members for update to authenticated
  using (public.has_capability(bird_id, (select auth.uid()), 'manage_household'))
  with check (public.has_capability(bird_id, (select auth.uid()), 'manage_household'));
create policy "bird_members delete" on public.bird_members for delete to authenticated
  using (public.has_capability(bird_id, (select auth.uid()), 'manage_household'));

-- household_invites -> manage_household (management data; only managers see) --
drop policy if exists "household_invites owner all" on public.household_invites;
create policy "household_invites read" on public.household_invites for select to authenticated
  using (public.has_household_capability(owner_id, (select auth.uid()), 'manage_household'));
create policy "household_invites insert" on public.household_invites for insert to authenticated
  with check (public.has_household_capability(owner_id, (select auth.uid()), 'manage_household'));
create policy "household_invites update" on public.household_invites for update to authenticated
  using (public.has_household_capability(owner_id, (select auth.uid()), 'manage_household'))
  with check (public.has_household_capability(owner_id, (select auth.uid()), 'manage_household'));
create policy "household_invites delete" on public.household_invites for delete to authenticated
  using (public.has_household_capability(owner_id, (select auth.uid()), 'manage_household'));

-- sits -> OWNER-ONLY write (preserve PR #248); collapse overlap, fold member +
-- assigned-caregiver into one SELECT.
drop policy if exists "sits owner all" on public.sits;
drop policy if exists "sits caregiver read" on public.sits;
create policy "sits read" on public.sits for select to authenticated
  using (public.has_household_capability(owner_id, (select auth.uid()), 'view') or caregiver_user_id = (select auth.uid()));
create policy "sits insert" on public.sits for insert to authenticated
  with check (owner_id = (select auth.uid()) and exists (select 1 from public.birds b where b.owner_id = (select auth.uid())));
create policy "sits update" on public.sits for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
create policy "sits delete" on public.sits for delete to authenticated
  using (owner_id = (select auth.uid()));

-- sit_birds -> OWNER-ONLY write (preserve PR #248: own the sit AND the bird);
-- collapse overlap, fold member + caregiver into one SELECT.
drop policy if exists "sit_birds owner all" on public.sit_birds;
drop policy if exists "sit_birds caregiver read" on public.sit_birds;
create policy "sit_birds read" on public.sit_birds for select to authenticated
  using (
    public.has_capability(bird_id, (select auth.uid()), 'view')
    or exists (select 1 from public.sits s where s.id = sit_id and s.caregiver_user_id = (select auth.uid()))
  );
create policy "sit_birds insert" on public.sit_birds for insert to authenticated
  with check (
    exists (select 1 from public.sits s where s.id = sit_id and s.owner_id = (select auth.uid()))
    and exists (select 1 from public.birds b where b.id = bird_id and b.owner_id = (select auth.uid()))
  );
create policy "sit_birds update" on public.sit_birds for update to authenticated
  using (exists (select 1 from public.sits s where s.id = sit_id and s.owner_id = (select auth.uid())))
  with check (
    exists (select 1 from public.sits s where s.id = sit_id and s.owner_id = (select auth.uid()))
    and exists (select 1 from public.birds b where b.id = bird_id and b.owner_id = (select auth.uid()))
  );
create policy "sit_birds delete" on public.sit_birds for delete to authenticated
  using (exists (select 1 from public.sits s where s.id = sit_id and s.owner_id = (select auth.uid())));

-- task_completions -> log_daily_care (household-keyed via sits.owner_id; lets
-- household caregivers check off tasks. External sitters use the service-role
-- token path, which bypasses RLS.)
drop policy if exists "task_completions owner delete" on public.task_completions;
drop policy if exists "task_completions owner write" on public.task_completions;
drop policy if exists "task_completions owner read" on public.task_completions;
drop policy if exists "task_completions owner update" on public.task_completions;
create policy "task_completions read" on public.task_completions for select to authenticated
  using (exists (select 1 from public.sits s where s.id = sit_id
                 and (s.caregiver_user_id = (select auth.uid())
                      or public.has_household_capability(s.owner_id, (select auth.uid()), 'view'))));
create policy "task_completions insert" on public.task_completions for insert to authenticated
  with check (exists (select 1 from public.sits s where s.id = sit_id
                      and public.has_household_capability(s.owner_id, (select auth.uid()), 'log_daily_care')));
create policy "task_completions update" on public.task_completions for update to authenticated
  using (exists (select 1 from public.sits s where s.id = sit_id
                 and public.has_household_capability(s.owner_id, (select auth.uid()), 'log_daily_care')))
  with check (exists (select 1 from public.sits s where s.id = sit_id
                      and public.has_household_capability(s.owner_id, (select auth.uid()), 'log_daily_care')));
create policy "task_completions delete" on public.task_completions for delete to authenticated
  using (exists (select 1 from public.sits s where s.id = sit_id
                 and public.has_household_capability(s.owner_id, (select auth.uid()), 'log_daily_care')));
