-- The Flock, step 5 (PR B): chapter leads and the chapter's Members tab.
-- Additive: a new table and functions; one Flock-only redefinition
-- (private.chapter_lead_region, a placeholder in 20261108130000, now reads the
-- leads table); and the entitlements source check widened by one value,
-- 'chapter_lead' (a superset, as 20261107120000 did for founding and gift).
-- No care-app table, policy, trigger or function changes.
--
-- A chapter lead (flock_chapter_leads) manages one chapter: reviews its event
-- suggestions in /admin/review (Events only; never Do good or reports, which
-- stay with private.can_review) and creates, edits and cancels its events.
-- Only admins make or remove a lead (admin_set_chapter_lead); making one also
-- grants the existing 'chapter_lead' entitlement (a Flock membership), and
-- removing one deletes it, so access ends at once.
-- The Members tab reads flock_chapter_roster: display name, photo, founder
-- and lead badges, and shown birds' names and species. Nothing else.


-- 1) Leads -------------------------------------------------------------------------------

create table if not exists public.flock_chapter_leads (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  region_slug text not null references public.regions(slug),
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists flock_chapter_leads_region_idx on public.flock_chapter_leads (region_slug);

alter table public.flock_chapter_leads enable row level security;
revoke all on public.flock_chapter_leads from anon, authenticated;
grant select, insert, update, delete on public.flock_chapter_leads to service_role;
drop policy if exists "flock_chapter_leads no direct access" on public.flock_chapter_leads;
create policy "flock_chapter_leads no direct access" on public.flock_chapter_leads for select to authenticated using (false);

create or replace function private.chapter_lead_region(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$ select l.region_slug from public.flock_chapter_leads l where l.user_id = p_user_id; $$;

-- The lead's membership: one 'chapter_lead' row per lead, source 'chapter_lead'.
do $$
declare c text;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.entitlements'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) like '%source%'
  loop
    execute format('alter table public.entitlements drop constraint %I', c);
  end loop;
end $$;
alter table public.entitlements
  add constraint entitlements_source_check
  check (source in ('stripe', 'apple', 'google', 'manual', 'founding', 'gift', 'chapter_lead'));
create unique index if not exists entitlements_one_chapter_lead_per_user
  on public.entitlements (user_id) where source = 'chapter_lead';

-- Make (p_on) or remove a chapter lead. The chapter is the member's own.
create or replace function private.set_chapter_lead(p_user_id uuid, p_on boolean)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_region text;
begin
  perform private.assert_entitlement_admin();
  if not coalesce(p_on, false) then
    delete from public.flock_chapter_leads l where l.user_id = p_user_id;
    delete from public.entitlements e where e.user_id = p_user_id and e.source = 'chapter_lead';
    return null;
  end if;
  select fp.region_slug into v_region from public.flock_profiles fp where fp.user_id = p_user_id;
  if v_region is null or v_region = 'other' then
    raise exception 'that member has no chapter yet' using errcode = '22023';
  end if;
  insert into public.flock_chapter_leads (user_id, region_slug, created_by)
  values (p_user_id, v_region, auth.uid())
  on conflict (user_id) do update set region_slug = excluded.region_slug, created_by = excluded.created_by, created_at = now();
  insert into public.entitlements (user_id, plan, status, source, starts_at, note, granted_by)
  values (p_user_id, 'chapter_lead', 'active', 'chapter_lead', now(), 'Chapter lead: ' || v_region, auth.uid())
  on conflict (user_id) where source = 'chapter_lead' do update set status = 'active', note = excluded.note, current_period_end = null;
  return v_region;
end;
$$;

revoke all on function private.set_chapter_lead(uuid, boolean) from public, anon;
grant execute on function private.set_chapter_lead(uuid, boolean) to authenticated, service_role;

-- Which chapter a member leads (public within the Flock: it's a badge).
create or replace function private.flock_chapter_lead_of(p_user_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.assert_can_use_flock();
  return private.chapter_lead_region(p_user_id);
end;
$$;

revoke all on function private.flock_chapter_lead_of(uuid) from public, anon;
grant execute on function private.flock_chapter_lead_of(uuid) to authenticated, service_role;


-- 2) The Members tab -----------------------------------------------------------------------

-- A chapter's members with their badges and shown birds (name and species).
create or replace function private.flock_chapter_roster(p_region_slug text)
returns table (user_id uuid, display_name text, photo_path text, is_founder boolean, is_lead boolean, birds jsonb)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.assert_can_use_flock();
  return query
    select p.user_id, p.display_name, p.photo_path,
           exists (select 1 from public.founding_claims c where c.user_id = p.user_id),
           coalesce(private.chapter_lead_region(p.user_id) = p_region_slug, false),
           coalesce((
             select jsonb_agg(jsonb_build_object('name', b.name, 'species', b.species) order by b.name)
             from public.flock_shown_birds s
             join public.birds b on b.id = s.bird_id and b.owner_id = s.user_id
             where s.user_id = p.user_id and s.shown and b.passed_at is null
           ), '[]'::jsonb)
    from public.flock_profiles p
    where p.region_slug = p_region_slug
      and private.can_use_flock(p.user_id)
    order by coalesce(private.chapter_lead_region(p.user_id) = p_region_slug, false) desc, p.display_name;
end;
$$;

revoke all on function private.flock_chapter_roster(text) from public, anon;
grant execute on function private.flock_chapter_roster(text) to authenticated, service_role;


-- 3) Invoker wrappers ------------------------------------------------------------------------

create or replace function public.admin_set_chapter_lead(p_user_id uuid, p_on boolean)
returns text language sql volatile security invoker set search_path = ''
as $$ select private.set_chapter_lead(p_user_id, p_on); $$;

create or replace function public.flock_chapter_lead_of(p_user_id uuid)
returns text language sql stable security invoker set search_path = ''
as $$ select private.flock_chapter_lead_of(p_user_id); $$;

create or replace function public.flock_chapter_roster(p_region_slug text)
returns table (user_id uuid, display_name text, photo_path text, is_founder boolean, is_lead boolean, birds jsonb)
language sql stable security invoker set search_path = ''
as $$ select * from private.flock_chapter_roster(p_region_slug); $$;

revoke all on function public.admin_set_chapter_lead(uuid, boolean) from public, anon;
revoke all on function public.flock_chapter_lead_of(uuid) from public, anon;
revoke all on function public.flock_chapter_roster(text) from public, anon;
grant execute on function public.admin_set_chapter_lead(uuid, boolean) to authenticated, service_role;
grant execute on function public.flock_chapter_lead_of(uuid) to authenticated, service_role;
grant execute on function public.flock_chapter_roster(text) to authenticated, service_role;
