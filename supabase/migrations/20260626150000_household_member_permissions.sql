-- Foundation for configurable per-member household permissions.
--
-- Identity (confirmed): bird_members.user_id and birds.owner_id both reference
-- auth.users(id), so this table + has_capability() key on auth.users(id) too.
-- A "household" == the owner of a bird (birds.owner_id); owner is authoritative
-- (a trigger also mirrors a role='owner' bird_members row, but owner_id is the
-- source of truth the function short-circuits on).
--
-- Capability keys + presets are mirrored in src/lib/capabilities.ts (keep in
-- sync with the CHECK constraints + the backfill below).
-- "View everything" is the baseline for any member — always true, never stored.
--
-- This pass ONLY lays the foundation. It does NOT rewrite other tables' policies
-- to call has_capability(), and builds no UI — those are separate passes.

create table public.household_member_permissions (
  owner_id uuid not null references auth.users(id) on delete cascade,
  member_user_id uuid not null references auth.users(id) on delete cascade,
  capabilities text[] not null default '{}',
  preset text not null default 'custom',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (owner_id, member_user_id),
  constraint hmp_caps_valid check (capabilities <@ array['log_daily_care','record_health','edit_care_plans','manage_emergency','manage_sits','manage_flock','manage_household']::text[]),
  constraint hmp_preset_valid check (preset in ('viewer','caregiver','care_manager','co_owner','custom')),
  constraint hmp_not_self check (owner_id <> member_user_id)
);
create index idx_hmp_member_user_id on public.household_member_permissions (member_user_id);

create or replace function public.has_capability(p_bird_id uuid, p_user_id uuid, p_capability text)
returns boolean language sql stable security definer set search_path = '' as $$
  with b as (select owner_id from public.birds where id = p_bird_id)
  select case
    when not exists (select 1 from b) then false
    when (select owner_id from b) = p_user_id then true
    when p_capability = 'view' then
      exists (select 1 from public.household_member_permissions h
              where h.owner_id = (select owner_id from b) and h.member_user_id = p_user_id)
      or exists (select 1 from public.bird_members bm
              where bm.bird_id = p_bird_id and bm.user_id = p_user_id)
    else exists (select 1 from public.household_member_permissions h
              where h.owner_id = (select owner_id from b)
                and h.member_user_id = p_user_id
                and p_capability = any(h.capabilities))
  end;
$$;

revoke execute on function public.has_capability(uuid, uuid, text) from public, anon;
grant execute on function public.has_capability(uuid, uuid, text) to authenticated, service_role;

alter table public.household_member_permissions enable row level security;

-- one permissive policy per command (no overlaps): owner OR self can read; only owner writes
create policy "hmp select" on public.household_member_permissions
  for select to authenticated
  using ((select auth.uid()) = owner_id or (select auth.uid()) = member_user_id);
create policy "hmp insert" on public.household_member_permissions
  for insert to authenticated
  with check ((select auth.uid()) = owner_id);
create policy "hmp update" on public.household_member_permissions
  for update to authenticated
  using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy "hmp delete" on public.household_member_permissions
  for delete to authenticated
  using ((select auth.uid()) = owner_id);

-- backfill: every existing non-owner member gets Caregiver, household-wide, deduped
insert into public.household_member_permissions (owner_id, member_user_id, capabilities, preset)
select distinct b.owner_id, bm.user_id, array['log_daily_care','record_health']::text[], 'caregiver'
from public.bird_members bm
join public.birds b on b.id = bm.bird_id
where bm.user_id <> b.owner_id
on conflict (owner_id, member_user_id) do nothing;
