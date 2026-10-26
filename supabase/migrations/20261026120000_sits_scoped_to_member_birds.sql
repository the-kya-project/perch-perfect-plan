-- Security: a household member could read every sit their owner had, including
-- sits for birds they were never given. A sit row carries the sitter's name,
-- email and invite_token, and /sitter/<token> opens the full sitter view of
-- every bird on the sit (care plan, emergency contacts, the owner's phone).
-- QA pass, Oct 2026: a viewer on Kiwi and Mango opened the sitter link for a
-- sit covering only the Professor.
--
-- The household-wide check (has_household_capability) answered "is this person
-- in the owner's household?", not "may they see these birds?". Sits now also
-- require the member to be able to see EVERY bird on the sit, the same per-bird
-- gate the birds themselves use (private.has_capability(..., 'view')).
--
-- Applies to reading sits, the household manage_sits delete path, and
-- task_completions (which are keyed through the sit). The owner and the sit's
-- assigned household caregiver are unaffected. External sitters use the
-- service-role token path, which bypasses RLS, so their access is unchanged.
--
-- A sit with no birds yet (mid-creation) is visible to the owner only.

create or replace function private.can_access_sit(p_sit_id uuid, p_user_id uuid, p_capability text)
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  with s as (select owner_id from public.sits where id = p_sit_id)
  select case
    when not exists (select 1 from s) then false
    when (select owner_id from s) = p_user_id then true
    when not private.has_household_capability((select owner_id from s), p_user_id, p_capability) then false
    -- Every bird on the sit must be one this member can see.
    else exists (select 1 from public.sit_birds sb where sb.sit_id = p_sit_id)
      and not exists (
        select 1 from public.sit_birds sb
        where sb.sit_id = p_sit_id
          and not private.has_capability(sb.bird_id, p_user_id, 'view')
      )
  end;
$$;

revoke all on function private.can_access_sit(uuid, uuid, text) from public, anon;
grant execute on function private.can_access_sit(uuid, uuid, text) to authenticated, service_role;

-- sits
drop policy if exists "sits read" on public.sits;
create policy "sits read" on public.sits for select to authenticated
  using (
    caregiver_user_id = (select auth.uid())
    or private.can_access_sit(id, (select auth.uid()), 'view')
  );

drop policy if exists "sits delete" on public.sits;
create policy "sits delete" on public.sits for delete to authenticated
  using (
    owner_id = (select auth.uid())
    or private.can_access_sit(id, (select auth.uid()), 'manage_sits')
  );

-- task_completions
drop policy if exists "task_completions read" on public.task_completions;
create policy "task_completions read" on public.task_completions for select to authenticated
  using (exists (
    select 1 from public.sits s where s.id = sit_id
      and (s.caregiver_user_id = (select auth.uid())
           or private.can_access_sit(s.id, (select auth.uid()), 'view'))
  ));

drop policy if exists "task_completions insert" on public.task_completions;
create policy "task_completions insert" on public.task_completions for insert to authenticated
  with check (private.can_access_sit(sit_id, (select auth.uid()), 'log_daily_care'));

drop policy if exists "task_completions update" on public.task_completions;
create policy "task_completions update" on public.task_completions for update to authenticated
  using (private.can_access_sit(sit_id, (select auth.uid()), 'log_daily_care'))
  with check (private.can_access_sit(sit_id, (select auth.uid()), 'log_daily_care'));

drop policy if exists "task_completions delete" on public.task_completions;
create policy "task_completions delete" on public.task_completions for delete to authenticated
  using (private.can_access_sit(sit_id, (select auth.uid()), 'log_daily_care'));

-- Members removed from their owner's last bird used to keep their household
-- permissions row, and with it household-wide reads (sits, invites,
-- handoffs). Clear rows that no longer have any bird behind them. The app now
-- removes the row when the last bird goes (household.functions.ts).
delete from public.household_member_permissions h
where not exists (
  select 1 from public.bird_members bm
  join public.birds b on b.id = bm.bird_id
  where bm.user_id = h.member_user_id
    and bm.role = 'household'
    and b.owner_id = h.owner_id
);
