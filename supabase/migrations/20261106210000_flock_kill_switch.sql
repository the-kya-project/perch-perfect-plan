-- The Flock kill switch: one admin-only setting that turns every piece of Flock
-- UI off, admins included, without a deploy. Additive only.
--
-- public.flock_enabled() is the one check the app uses to show any Flock entry
-- point (the Community tab, the header link, the /flock route guard, reopening
-- in Flock mode). It now also requires the switch to be on, so flipping it off
-- hides all of that for everyone within the app's five-minute cache (or at
-- once on a reload). It changes no care-app table, policy, trigger or function:
-- flock_enabled() is Flock-only, and is_admin() and the Flock tables' RLS are
-- left as they are.
--
-- Flip it (Supabase dashboard → SQL editor, production project):
--   select public.admin_set_flock_ui(false);   -- Flock UI off for everyone
--   select public.admin_set_flock_ui(true);    -- back on (admins only, as before)
--   select * from public.flock_settings;       -- current state, who, when
-- A signed-in admin can call the same RPC from the app. Anyone else gets
-- "admin only".

create table if not exists public.flock_settings (
  -- A single row: the primary key can only ever be true.
  id         boolean primary key default true check (id),
  ui_enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  -- SET NULL so deleting an admin's account never blocks on a flip they made.
  updated_by uuid references auth.users (id) on delete set null
);

insert into public.flock_settings (id, ui_enabled)
values (true, true)
on conflict (id) do nothing;

-- No table access for app users at all: it is read through flock_enabled() and
-- changed through admin_set_flock_ui().
alter table public.flock_settings enable row level security;
revoke all on public.flock_settings from anon, authenticated;
-- The server runs as service_role (bypasses RLS, not privileges); a database
-- built from migrations gives it nothing by default (service_role_grants_checks).
grant select, insert, update, delete on public.flock_settings to service_role;

create or replace function private.flock_ui_on()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  -- A missing row reads as on, so the switch can only ever remove UI.
  select coalesce((select ui_enabled from public.flock_settings where id), true);
$$;

revoke all on function private.flock_ui_on() from public, anon;
grant execute on function private.flock_ui_on() to authenticated, service_role;

-- Same signature, grants and SECURITY INVOKER as before; only the body gains
-- the switch.
create or replace function public.flock_enabled()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(private.is_admin(auth.uid()), false) and private.flock_ui_on();
$$;

revoke all on function public.flock_enabled() from public, anon;
grant execute on function public.flock_enabled() to authenticated, service_role;

create or replace function public.admin_set_flock_ui(p_enabled boolean)
returns public.flock_settings
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_row public.flock_settings;
begin
  if p_enabled is null then
    raise exception 'p_enabled must be true or false' using errcode = '22004';
  end if;
  -- Admin, the service role, or the database owner (SQL editor).
  perform private.assert_entitlement_admin();
  insert into public.flock_settings (id, ui_enabled, updated_at, updated_by)
  values (true, p_enabled, now(), auth.uid())
  on conflict (id) do update
    set ui_enabled = excluded.ui_enabled, updated_at = excluded.updated_at, updated_by = excluded.updated_by
  returning * into v_row;
  return v_row;
end;
$$;

revoke all on function public.admin_set_flock_ui(boolean) from public, anon;
grant execute on function public.admin_set_flock_ui(boolean) to authenticated, service_role;
