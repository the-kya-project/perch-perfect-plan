-- The Flock, Phase 1: data and access foundation. Additive only.
--
-- Adds who-has-access (entitlements), an admin role, regions, and Flock member
-- profiles, plus the helpers the app will gate on. No existing table, policy or
-- function is changed, and nothing here is visible to regular users: the one
-- frontend switch, public.flock_enabled(), is true only for admins until launch.
--
-- Conventions (same as 20260628120000_lock_down_security_definer_helpers):
--   * Helpers that take an arbitrary user id live in `private`, which PostgREST
--     does not expose, so they are callable from RLS and SQL but are not RPCs.
--   * Every SECURITY DEFINER function pins search_path = '' and fully
--     qualifies names. EXECUTE is revoked from PUBLIC and anon on every new
--     function.
--   * This project's default ACL grants anon/authenticated ALL on new public
--     tables, so every new table revokes that first and grants back only what
--     its policies need.
--   * Every user-keyed table cascades from auth.users, so account deletion
--     (deleteMyAccount -> auth.admin.deleteUser) removes these rows with it.
--
-- Access rule ("in good standing"):
--   active / trialing  -> access while current_period_end is null or in the future
--   past_due / canceled -> access only until a future current_period_end
-- A manual comp grant with no end date therefore never expires.
-- Flock membership = any plan other than app_premium in good standing.
-- App premium      = any plan in good standing (Flock includes premium).


-- 1) Roles ------------------------------------------------------------------

create table if not exists public.user_roles (
  user_id    uuid not null references auth.users (id) on delete cascade,
  role       text not null check (role in ('admin')),
  created_at timestamptz not null default now(),
  primary key (user_id, role)
);

alter table public.user_roles enable row level security;
revoke all on public.user_roles from anon, authenticated;
grant select on public.user_roles to authenticated;

-- Read-only, own rows. No write policy: roles are assigned server-side only.
drop policy if exists "user_roles self read" on public.user_roles;
create policy "user_roles self read" on public.user_roles
  for select to authenticated
  using (user_id = (select auth.uid()));

create or replace function private.is_admin(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = p_user_id and role = 'admin'
  );
$$;


-- 2) Entitlements -----------------------------------------------------------

create table if not exists public.entitlements (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users (id) on delete cascade,
  plan               text not null check (plan in ('founding', 'monthly', 'annual', 'app_premium', 'chapter_lead', 'comp')),
  status             text not null check (status in ('active', 'trialing', 'past_due', 'canceled')),
  source             text not null check (source in ('stripe', 'apple', 'google', 'manual')),
  current_period_end timestamptz,
  -- The payment provider's subscription id, for future webhooks to upsert on.
  external_ref       text,
  note               text,
  -- Who granted a manual row. SET NULL so deleting an admin's account never
  -- blocks on grants they made.
  granted_by         uuid references auth.users (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists entitlements_user_id_idx on public.entitlements (user_id);
create index if not exists entitlements_granted_by_idx on public.entitlements (granted_by);
create unique index if not exists entitlements_source_external_ref_key
  on public.entitlements (source, external_ref) where external_ref is not null;
-- At most one manual row per user; admin_grant_entitlement upserts on this.
create unique index if not exists entitlements_one_manual_per_user
  on public.entitlements (user_id) where source = 'manual';

drop trigger if exists entitlements_set_updated_at on public.entitlements;
create trigger entitlements_set_updated_at
  before update on public.entitlements
  for each row execute function public.set_updated_at();

alter table public.entitlements enable row level security;
revoke all on public.entitlements from anon, authenticated;
grant select on public.entitlements to authenticated;

-- Read-only, own rows. No insert/update/delete policy and no write grant:
-- only the service role (future payment webhooks) and the admin functions
-- below can change entitlements.
drop policy if exists "entitlements self read" on public.entitlements;
create policy "entitlements self read" on public.entitlements
  for select to authenticated
  using (user_id = (select auth.uid()));

create or replace function private.is_flock_member(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.entitlements e
    where e.user_id = p_user_id
      and e.plan <> 'app_premium'
      and (
        (e.status in ('active', 'trialing') and (e.current_period_end is null or e.current_period_end > now()))
        or (e.status in ('past_due', 'canceled') and e.current_period_end > now())
      )
  );
$$;

create or replace function private.has_app_premium(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.entitlements e
    where e.user_id = p_user_id
      and (
        (e.status in ('active', 'trialing') and (e.current_period_end is null or e.current_period_end > now()))
        or (e.status in ('past_due', 'canceled') and e.current_period_end > now())
      )
  );
$$;

revoke all on function private.is_admin(uuid) from public, anon;
revoke all on function private.is_flock_member(uuid) from public, anon;
revoke all on function private.has_app_premium(uuid) from public, anon;
grant execute on function private.is_admin(uuid) to authenticated, service_role;
grant execute on function private.is_flock_member(uuid) to authenticated, service_role;
grant execute on function private.has_app_premium(uuid) to authenticated, service_role;


-- 3) Callable checks (RPC) --------------------------------------------------
-- SECURITY INVOKER wrappers over the private helpers. A signed-in user may
-- ask about themself; asking about anyone else needs admin or the service
-- role, so membership cannot be enumerated across accounts.

create or replace function private.assert_can_inspect(p_target uuid)
returns void
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if p_target is distinct from auth.uid()
     and coalesce(auth.jwt() ->> 'role', '') <> 'service_role'
     and not (auth.jwt() is null and session_user in ('postgres', 'supabase_admin'))
     and not private.is_admin(auth.uid()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
end;
$$;

revoke all on function private.assert_can_inspect(uuid) from public, anon;
grant execute on function private.assert_can_inspect(uuid) to authenticated, service_role;

create or replace function public.is_flock_member(p_user_id uuid default null)
returns boolean
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_target uuid := coalesce(p_user_id, auth.uid());
begin
  if v_target is null then
    return false;
  end if;
  perform private.assert_can_inspect(v_target);
  return private.is_flock_member(v_target);
end;
$$;

create or replace function public.has_app_premium(p_user_id uuid default null)
returns boolean
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_target uuid := coalesce(p_user_id, auth.uid());
begin
  if v_target is null then
    return false;
  end if;
  perform private.assert_can_inspect(v_target);
  return private.has_app_premium(v_target);
end;
$$;

create or replace function public.is_admin(p_user_id uuid default null)
returns boolean
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_target uuid := coalesce(p_user_id, auth.uid());
begin
  if v_target is null then
    return false;
  end if;
  perform private.assert_can_inspect(v_target);
  return private.is_admin(v_target);
end;
$$;

-- The hidden Flock flag: the one check the frontend uses to decide whether to
-- show any Flock entry point. Admin-only until launch; widen it here then.
create or replace function public.flock_enabled()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(private.is_admin(auth.uid()), false);
$$;

revoke all on function public.is_flock_member(uuid) from public, anon;
revoke all on function public.has_app_premium(uuid) from public, anon;
revoke all on function public.is_admin(uuid) from public, anon;
revoke all on function public.flock_enabled() from public, anon;
grant execute on function public.is_flock_member(uuid) to authenticated, service_role;
grant execute on function public.has_app_premium(uuid) to authenticated, service_role;
grant execute on function public.is_admin(uuid) to authenticated, service_role;
grant execute on function public.flock_enabled() to authenticated, service_role;


-- 4) Admin grant / revoke of manual entitlements ----------------------------
-- Callable by an admin (via the app's signed-in session), the service role,
-- or the database owner (dashboard SQL editor). Only ever touches the user's
-- single source = 'manual' row; Stripe/Apple/Google rows are never modified.

create or replace function private.assert_entitlement_admin()
returns void
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  -- The owner exception applies only with no request JWT at all (dashboard
  -- SQL editor, migrations). Any request context, including an editor
  -- session impersonating a user via request.jwt.claims, is judged by its
  -- claims like a real API call.
  if private.is_admin(auth.uid())
     or coalesce(auth.jwt() ->> 'role', '') = 'service_role'
     or (auth.jwt() is null and session_user in ('postgres', 'supabase_admin')) then
    return;
  end if;
  raise exception 'admin only' using errcode = '42501';
end;
$$;

revoke all on function private.assert_entitlement_admin() from public, anon;
grant execute on function private.assert_entitlement_admin() to authenticated, service_role;

create or replace function private.grant_manual_entitlement(
  p_email      text,
  p_plan       text,
  p_period_end timestamptz default null,
  p_note       text default null
)
returns public.entitlements
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_row     public.entitlements;
begin
  perform private.assert_entitlement_admin();

  select id into v_user_id
  from auth.users
  where lower(email) = lower(btrim(p_email));
  if v_user_id is null then
    raise exception 'no account with email %', p_email using errcode = 'P0002';
  end if;

  -- Upsert the user's one manual row: replace plan / period / note.
  insert into public.entitlements (user_id, plan, status, source, current_period_end, note, granted_by)
  values (v_user_id, p_plan, 'active', 'manual', p_period_end, p_note, auth.uid())
  on conflict (user_id) where source = 'manual'
  do update set
    plan               = excluded.plan,
    status             = 'active',
    current_period_end = excluded.current_period_end,
    note               = excluded.note,
    granted_by         = excluded.granted_by
  returning * into v_row;

  return v_row;
end;
$$;

-- Revoking ends access now but keeps the row as a record.
create or replace function private.revoke_manual_entitlement(p_email text)
returns public.entitlements
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_row     public.entitlements;
begin
  perform private.assert_entitlement_admin();

  select id into v_user_id
  from auth.users
  where lower(email) = lower(btrim(p_email));
  if v_user_id is null then
    raise exception 'no account with email %', p_email using errcode = 'P0002';
  end if;

  update public.entitlements
  set status = 'canceled',
      current_period_end = now(),
      granted_by = auth.uid()
  where user_id = v_user_id and source = 'manual'
  returning * into v_row;

  if v_row.id is null then
    raise exception 'no manual entitlement for %', p_email using errcode = 'P0002';
  end if;

  return v_row;
end;
$$;

revoke all on function private.grant_manual_entitlement(text, text, timestamptz, text) from public, anon;
revoke all on function private.revoke_manual_entitlement(text) from public, anon;
grant execute on function private.grant_manual_entitlement(text, text, timestamptz, text) to authenticated, service_role;
grant execute on function private.revoke_manual_entitlement(text) to authenticated, service_role;

-- RPC entry points. SECURITY INVOKER: the elevated write happens only inside
-- the private functions above, after their admin check.
create or replace function public.admin_grant_entitlement(
  p_email      text,
  p_plan       text,
  p_period_end timestamptz default null,
  p_note       text default null
)
returns public.entitlements
language sql
volatile
security invoker
set search_path = ''
as $$
  select * from private.grant_manual_entitlement(p_email, p_plan, p_period_end, p_note);
$$;

create or replace function public.admin_revoke_entitlement(p_email text)
returns public.entitlements
language sql
volatile
security invoker
set search_path = ''
as $$
  select * from private.revoke_manual_entitlement(p_email);
$$;

revoke all on function public.admin_grant_entitlement(text, text, timestamptz, text) from public, anon;
revoke all on function public.admin_revoke_entitlement(text) from public, anon;
grant execute on function public.admin_grant_entitlement(text, text, timestamptz, text) to authenticated, service_role;
grant execute on function public.admin_revoke_entitlement(text) to authenticated, service_role;


-- 5) Regions ----------------------------------------------------------------
-- A member's chapter IS their region: chapter assignment follows
-- flock_profiles.region_slug automatically. A separate chapters table can be
-- added if chapters ever stop mapping one-to-one onto regions.

create table if not exists public.regions (
  slug       text primary key,
  name       text not null unique,
  states     text[] not null default '{}',
  sort_order smallint not null unique
);

alter table public.regions enable row level security;
revoke all on public.regions from anon, authenticated;
grant select on public.regions to authenticated;

drop policy if exists "regions read" on public.regions;
create policy "regions read" on public.regions
  for select to authenticated
  using (true);

insert into public.regions (slug, name, states, sort_order) values
  ('california',        'California',        '{CA}',                     1),
  ('florida',           'Florida',           '{FL}',                     2),
  ('great-lakes',       'Great Lakes',       '{IL,IN,MI,OH}',            3),
  ('mid-atlantic',      'Mid-Atlantic',      '{PA,NJ,MD,DE,DC,VA}',      4),
  ('northeast',         'Northeast',         '{NY,MA,CT,RI,VT,NH,ME}',   5),
  ('pacific-northwest', 'Pacific Northwest', '{WA,OR}',                  6),
  ('southeast',         'Southeast',         '{GA,NC,SC,TN}',            7),
  ('southwest',         'Southwest',         '{AZ,NM,NV}',               8),
  ('texas',             'Texas',             '{TX}',                     9),
  ('other',             'Other region',      '{}',                      10)
on conflict (slug) do update set
  name = excluded.name,
  states = excluded.states,
  sort_order = excluded.sort_order;


-- 6) Flock member profiles --------------------------------------------------
-- Deliberately separate from profiles and from all care data. No column here
-- references a bird, care plan or log; attaching birds to posts comes later
-- and is always an explicit act.

create table if not exists public.flock_profiles (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  display_name text not null
    check (display_name = btrim(display_name) and char_length(display_name) between 1 and 50),
  region_slug  text not null references public.regions (slug) on update cascade,
  bio          text check (bio is null or char_length(bio) <= 280),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists flock_profiles_region_slug_idx on public.flock_profiles (region_slug);

drop trigger if exists flock_profiles_set_updated_at on public.flock_profiles;
create trigger flock_profiles_set_updated_at
  before update on public.flock_profiles
  for each row execute function public.set_updated_at();

alter table public.flock_profiles enable row level security;
revoke all on public.flock_profiles from anon, authenticated;
grant select, insert, update, delete on public.flock_profiles to authenticated;

-- Your own row always; other members' rows only while you are a member.
drop policy if exists "flock_profiles read" on public.flock_profiles;
create policy "flock_profiles read" on public.flock_profiles
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or private.is_flock_member((select auth.uid()))
  );

-- Create / edit only your own row, and only while you are a member.
drop policy if exists "flock_profiles insert" on public.flock_profiles;
create policy "flock_profiles insert" on public.flock_profiles
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and private.is_flock_member((select auth.uid()))
  );

drop policy if exists "flock_profiles update" on public.flock_profiles;
create policy "flock_profiles update" on public.flock_profiles
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and private.is_flock_member((select auth.uid()))
  );

-- Anyone may remove their own profile, member or not.
drop policy if exists "flock_profiles delete" on public.flock_profiles;
create policy "flock_profiles delete" on public.flock_profiles
  for delete to authenticated
  using (user_id = (select auth.uid()));


-- 7) Seed the founder as admin ----------------------------------------------
-- No-op where the account does not exist (preview branches, local).

insert into public.user_roles (user_id, role)
select id, 'admin' from auth.users
where lower(email) = 'brittany@thekyaproject.com'
on conflict do nothing;
