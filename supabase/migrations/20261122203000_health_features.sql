-- Health feature switches (backlog 1.2). Additive only: one new table and four
-- new functions; nothing existing changes.
--
-- Every health feature gets its own switch, off / admins / everyone, so a
-- feature without an avian vet's approval can stay hidden while everything
-- else works. Features are added by migration (one row each); the list and
-- what each switch covers is HEALTH_FEATURES in src/lib/healthFeatures.ts,
-- and the values each feature uses are in src/lib/healthRules.ts.
--
-- The features that are already live start at 'everyone', so nothing anyone
-- sees changes. Nothing reads these switches yet: wiring a live feature to its
-- switch is a separate change.
--
-- 'everyone' is every signed-in person, and the server (service role) for pages
-- with no account, such as a sit link; 'admins' means signed-in admins only.
--
-- Change one in the SQL editor:
--   select public.admin_set_health_feature('weight_baseline', 'admins');
-- See them all:
--   select * from public.health_features order by feature;

create table if not exists public.health_features (
  feature text primary key check (feature ~ '^[a-z][a-z_]{2,40}$'),
  audience text not null default 'off' check (audience in ('off', 'admins', 'everyone')),
  description text not null,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

comment on table public.health_features is
  'One switch per health feature (off / admins / everyone). Read through health_feature_enabled(); change with admin_set_health_feature(). Values: src/lib/healthRules.ts.';

alter table public.health_features enable row level security;
revoke all on public.health_features from anon, authenticated;
grant select, insert, update, delete on public.health_features to service_role;

-- Read only through functions: a policy that allows nothing, stated plainly.
drop policy if exists "health_features no direct access" on public.health_features;
create policy "health_features no direct access" on public.health_features
  for select to authenticated using (false);

insert into public.health_features (feature, audience, description) values
  ('daily_health_check', 'everyone', 'The daily and full health check and its triage (live)'),
  ('care_weight_trend', 'everyone', 'Weight trend, the Home weight pill and the "Save anyway?" check (live)'),
  ('emergency_guides', 'everyone', 'The emergency guides, keep-warm range and poison lines on the sitter page (live)'),
  ('passing_guidance', 'everyone', 'Guidance when a bird passes: necropsy, keeping, burial (live)'),
  ('diet_conversion', 'everyone', 'The Diet conversion journey''s vet card and weight safeguard (Flock, behind journeys_enabled)'),
  ('vet_nudge', 'everyone', 'The "call your vet" card on Flock posts (Flock, behind flock_enabled)'),
  ('weight_baseline', 'off', 'Each bird''s own normal weight and its alerts (backlog D1, not built yet)')
on conflict (feature) do nothing;

create or replace function private.health_feature_on_for(p_feature text, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select f.audience = 'everyone'
        or (f.audience = 'admins' and p_user_id is not null and private.is_admin(p_user_id))
    from public.health_features f where f.feature = p_feature
  ), false);
$$;

revoke all on function private.health_feature_on_for(text, uuid) from public, anon;
grant execute on function private.health_feature_on_for(text, uuid) to authenticated, service_role;

-- True when the feature is on for the caller. An unknown feature is off.
create or replace function public.health_feature_enabled(p_feature text)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select private.health_feature_on_for(p_feature, auth.uid());
$$;

revoke all on function public.health_feature_enabled(text) from public, anon;
grant execute on function public.health_feature_enabled(text) to authenticated, service_role;

create or replace function private.set_health_feature(p_feature text, p_audience text)
returns public.health_features
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_row public.health_features;
begin
  if p_audience is null or p_audience not in ('off', 'admins', 'everyone') then
    raise exception 'p_audience must be off, admins or everyone' using errcode = '22023';
  end if;
  perform private.assert_entitlement_admin();
  update public.health_features
     set audience = p_audience, updated_at = now(), updated_by = auth.uid()
   where feature = p_feature
  returning * into v_row;
  if v_row.feature is null then
    raise exception 'no health feature %', p_feature using errcode = 'P0002';
  end if;
  return v_row;
end;
$$;

revoke all on function private.set_health_feature(text, text) from public, anon;
grant execute on function private.set_health_feature(text, text) to authenticated, service_role;

create or replace function public.admin_set_health_feature(p_feature text, p_audience text)
returns public.health_features
language sql volatile security invoker set search_path = ''
as $$ select * from private.set_health_feature(p_feature, p_audience); $$;

revoke all on function public.admin_set_health_feature(text, text) from public, anon;
grant execute on function public.admin_set_health_feature(text, text) to authenticated, service_role;
