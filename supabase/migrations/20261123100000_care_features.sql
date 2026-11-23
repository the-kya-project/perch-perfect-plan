-- Care-app feature switches (backlog D2.1). Additive only: one new table and
-- three new functions; nothing existing changes.
--
-- A switch for a care-app feature that isn't health content, so it doesn't
-- belong in public.health_features (20261122203000). Same shape: off / admins
-- / everyone. The list is CARE_FEATURES in src/lib/careFeatures.ts.
--
-- The first one is 'today_cards', the seasonal and holiday Today card on Home
-- (src/lib/seasonalCalendar.ts). It starts off, so nobody sees a change. With
-- one admin account in production, 'admins' means Brittany's account only.
--
-- Change one in the SQL editor:
--   select public.admin_set_care_feature('today_cards', 'admins');
-- See them all:
--   select * from public.care_features order by feature;

create table if not exists public.care_features (
  feature text primary key check (feature ~ '^[a-z][a-z_]{2,40}$'),
  audience text not null default 'off' check (audience in ('off', 'admins', 'everyone')),
  description text not null,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

comment on table public.care_features is
  'One switch per care-app feature (off / admins / everyone). Read through care_feature_enabled(); change with admin_set_care_feature(). List: src/lib/careFeatures.ts.';

alter table public.care_features enable row level security;
revoke all on public.care_features from anon, authenticated;
grant select, insert, update, delete on public.care_features to service_role;

-- Read only through functions: a policy that allows nothing, stated plainly.
drop policy if exists "care_features no direct access" on public.care_features;
create policy "care_features no direct access" on public.care_features
  for select to authenticated using (false);

insert into public.care_features (feature, audience, description) values
  ('today_cards', 'off', 'The seasonal and holiday Today card on Home (backlog D2.1)')
on conflict (feature) do nothing;

create or replace function private.care_feature_on_for(p_feature text, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select f.audience = 'everyone'
        or (f.audience = 'admins' and p_user_id is not null and private.is_admin(p_user_id))
    from public.care_features f where f.feature = p_feature
  ), false);
$$;

revoke all on function private.care_feature_on_for(text, uuid) from public, anon;
grant execute on function private.care_feature_on_for(text, uuid) to authenticated, service_role;

-- True when the feature is on for the caller. An unknown feature is off.
create or replace function public.care_feature_enabled(p_feature text)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select private.care_feature_on_for(p_feature, auth.uid());
$$;

revoke all on function public.care_feature_enabled(text) from public, anon;
grant execute on function public.care_feature_enabled(text) to authenticated, service_role;

create or replace function private.set_care_feature(p_feature text, p_audience text)
returns public.care_features
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_row public.care_features;
begin
  if p_audience is null or p_audience not in ('off', 'admins', 'everyone') then
    raise exception 'p_audience must be off, admins or everyone' using errcode = '22023';
  end if;
  perform private.assert_entitlement_admin();
  update public.care_features
     set audience = p_audience, updated_at = now(), updated_by = auth.uid()
   where feature = p_feature
  returning * into v_row;
  if v_row.feature is null then
    raise exception 'no care feature %', p_feature using errcode = 'P0002';
  end if;
  return v_row;
end;
$$;

revoke all on function private.set_care_feature(text, text) from public, anon;
grant execute on function private.set_care_feature(text, text) to authenticated, service_role;

create or replace function public.admin_set_care_feature(p_feature text, p_audience text)
returns public.care_features
language sql volatile security invoker set search_path = ''
as $$ select * from private.set_care_feature(p_feature, p_audience); $$;

revoke all on function public.admin_set_care_feature(text, text) from public, anon;
grant execute on function public.admin_set_care_feature(text, text) to authenticated, service_role;
