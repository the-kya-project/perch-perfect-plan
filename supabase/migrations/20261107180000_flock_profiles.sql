-- The Flock, step 2: welcome, setup, profiles, chapters. Additive only.
--
-- Adds:
--   1. private.can_use_flock(user): a Flock member, or an admin (admins use the
--      Flock before it opens; members need it to have opened for them).
--   2. flock_profiles: photo_path and setup_completed_at, plus admin policies
--      so admins can read and keep their own profile before opening day. The
--      existing member policies are unchanged.
--   3. flock_shown_birds: which of a member's own birds other members may meet.
--   4. Read functions that return ONLY what other members may see (a profile's
--      display name, region, bio, photo path, founder badge; a shown bird's
--      name, species, and whether it has a photo). Care tables are never
--      returned: no weights, health, sits, care plans, notes or addresses.
--   5. flock_my_setup(): the setup screen's prefills (chapter suggestion,
--      founding spot).
--   6. A private 'flock-avatars' bucket (2 MB, JPEG/PNG/WebP), read by signed
--      URL by Flock members only, written by each member in their own folder.
-- No care-app table, policy, trigger or function changes. birds is read (never
-- written) by the SECURITY DEFINER functions below, which return name, species
-- and has_photo for shown birds only; bird photos for other members are signed
-- server-side (src/lib/flockMedia.functions.ts) for shown birds only.


-- 1) Who may use the Flock ------------------------------------------------------

create or replace function private.can_use_flock(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user_id is not null and (private.is_flock_member(p_user_id) or private.is_admin(p_user_id));
$$;

revoke all on function private.can_use_flock(uuid) from public, anon;
grant execute on function private.can_use_flock(uuid) to authenticated, service_role;

create or replace function private.assert_can_use_flock()
returns void
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if not private.can_use_flock(auth.uid()) then
    raise exception 'flock members only' using errcode = '42501';
  end if;
end;
$$;

revoke all on function private.assert_can_use_flock() from public, anon;
grant execute on function private.assert_can_use_flock() to authenticated, service_role;


-- 2) Profiles: photo, setup, admin access ----------------------------------------

alter table public.flock_profiles
  add column if not exists photo_path         text,
  add column if not exists setup_completed_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'flock_profiles_photo_in_own_folder') then
    alter table public.flock_profiles
      add constraint flock_profiles_photo_in_own_folder
      check (photo_path is null or (photo_path like user_id::text || '/%' and photo_path not like '%..%'));
  end if;
end $$;

comment on column public.flock_profiles.setup_completed_at is
  'When the member finished the one-minute setup. NULL = show the welcome.';

-- Admins use the Flock before it opens (they aren't members until then).
-- Additive policies; the member policies above stay as they are.
drop policy if exists "flock_profiles admin read" on public.flock_profiles;
create policy "flock_profiles admin read" on public.flock_profiles
  for select to authenticated
  using (private.is_admin((select auth.uid())));

drop policy if exists "flock_profiles admin insert own" on public.flock_profiles;
create policy "flock_profiles admin insert own" on public.flock_profiles
  for insert to authenticated
  with check (user_id = (select auth.uid()) and private.is_admin((select auth.uid())));

drop policy if exists "flock_profiles admin update own" on public.flock_profiles;
create policy "flock_profiles admin update own" on public.flock_profiles
  for update to authenticated
  using (user_id = (select auth.uid()) and private.is_admin((select auth.uid())))
  with check (user_id = (select auth.uid()) and private.is_admin((select auth.uid())));


-- 3) Which birds a member shows ---------------------------------------------------

create table if not exists public.flock_shown_birds (
  bird_id    uuid primary key references public.birds (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  shown      boolean not null default true,
  updated_at timestamptz not null default now()
);

create index if not exists flock_shown_birds_user_idx on public.flock_shown_birds (user_id);

drop trigger if exists flock_shown_birds_set_updated_at on public.flock_shown_birds;
create trigger flock_shown_birds_set_updated_at
  before update on public.flock_shown_birds
  for each row execute function public.set_updated_at();

alter table public.flock_shown_birds enable row level security;
revoke all on public.flock_shown_birds from anon, authenticated;
grant select, insert, update, delete on public.flock_shown_birds to authenticated;
grant select, insert, update, delete on public.flock_shown_birds to service_role;

-- Only your own rows; others see shown birds through the functions below.
drop policy if exists "flock_shown_birds own read" on public.flock_shown_birds;
create policy "flock_shown_birds own read" on public.flock_shown_birds
  for select to authenticated
  using (user_id = (select auth.uid()));

-- Only a bird you own, only while you can use the Flock.
drop policy if exists "flock_shown_birds own insert" on public.flock_shown_birds;
create policy "flock_shown_birds own insert" on public.flock_shown_birds
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and private.can_use_flock((select auth.uid()))
    and exists (select 1 from public.birds b where b.id = bird_id and b.owner_id = (select auth.uid()))
  );

drop policy if exists "flock_shown_birds own update" on public.flock_shown_birds;
create policy "flock_shown_birds own update" on public.flock_shown_birds
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and private.can_use_flock((select auth.uid()))
    and exists (select 1 from public.birds b where b.id = bird_id and b.owner_id = (select auth.uid()))
  );

drop policy if exists "flock_shown_birds own delete" on public.flock_shown_birds;
create policy "flock_shown_birds own delete" on public.flock_shown_birds
  for delete to authenticated
  using (user_id = (select auth.uid()));


-- 4) What other members may see ---------------------------------------------------
-- Every function checks the caller can use the Flock, and returns only the
-- listed fields. "Visible" = the owner can use the Flock, has a Flock profile,
-- marked the bird shown, still owns it, and the bird hasn't passed.

create or replace function private.flock_visible_birds(p_owner_ids uuid[], p_bird_ids uuid[])
returns table (bird_id uuid, owner_id uuid, name text, species text, has_photo boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.assert_can_use_flock();
  return query
    select b.id, b.owner_id, b.name::text, b.species::text, (b.photo_url is not null and b.photo_url <> '')
    from public.flock_shown_birds s
    join public.birds b on b.id = s.bird_id and b.owner_id = s.user_id
    join public.flock_profiles p on p.user_id = s.user_id
    where s.shown
      and b.passed_at is null
      and private.can_use_flock(s.user_id)
      and (p_owner_ids is null or s.user_id = any (p_owner_ids))
      and (p_bird_ids is null or b.id = any (p_bird_ids))
    order by b.name;
end;
$$;

create or replace function private.flock_member_profile(p_user_id uuid)
returns table (
  user_id uuid, display_name text, region_slug text, region_name text, region_states text[],
  bio text, photo_path text, is_founder boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.assert_can_use_flock();
  return query
    select p.user_id, p.display_name, p.region_slug, r.name, r.states, p.bio, p.photo_path,
           exists (select 1 from public.founding_claims c where c.user_id = p.user_id)
    from public.flock_profiles p
    join public.regions r on r.slug = p.region_slug
    where p.user_id = p_user_id
      and private.can_use_flock(p.user_id);
end;
$$;

-- A chapter is a region. Members = Flock profiles there whose owner can use
-- the Flock.
create or replace function private.flock_chapter(p_region_slug text)
returns table (region_slug text, name text, states text[], member_count integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.assert_can_use_flock();
  return query
    select r.slug, r.name, r.states,
           (select count(*)::integer from public.flock_profiles p
            where p.region_slug = r.slug and private.can_use_flock(p.user_id))
    from public.regions r
    where r.slug = p_region_slug;
end;
$$;

create or replace function private.flock_chapter_members(p_region_slug text)
returns table (user_id uuid, display_name text, photo_path text, is_founder boolean, bird_names text[])
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
           coalesce((
             select array_agg(b.name::text order by b.name)
             from public.flock_shown_birds s
             join public.birds b on b.id = s.bird_id and b.owner_id = s.user_id
             where s.user_id = p.user_id and s.shown and b.passed_at is null
           ), '{}')
    from public.flock_profiles p
    where p.region_slug = p_region_slug
      and private.can_use_flock(p.user_id)
    order by p.display_name;
end;
$$;

-- The setup screen's prefills, for the caller only. The chapter suggestion
-- comes from, in order: a Flock profile already on file (a founding claim
-- writes one), the founding claim's region, the waitlist's chapter answer
-- (Brevo ids 1-9 = regions.sort_order), then the account's time zone.
create or replace function private.flock_my_setup()
returns table (suggested_region text, founding_spot smallint, setup_completed_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_email text;
  v_tz    text;
  v_slug  text;
begin
  perform private.assert_can_use_flock();
  select lower(btrim(u.email)) into v_email from auth.users u where u.id = v_uid;
  select pr.time_zone into v_tz from public.profiles pr where pr.id = v_uid;

  v_slug := coalesce(
    (select p.region_slug from public.flock_profiles p where p.user_id = v_uid),
    (select c.region_slug from public.founding_claims c where c.user_id = v_uid),
    (select r.slug from public.waitlist_signups w join public.regions r on r.sort_order = w.primary_chapter
     where w.email_normalized = v_email order by w.created_at desc limit 1),
    case
      when v_tz = 'America/Los_Angeles' then 'california'
      when v_tz in ('America/Phoenix', 'America/Denver', 'America/Boise') then 'southwest'
      when v_tz like 'America/Indiana/%' or v_tz in ('America/Detroit', 'America/Chicago') then 'great-lakes'
      when v_tz = 'America/New_York' then 'northeast'
      else null
    end
  );

  return query
    select v_slug,
           (select c.spot_number from public.founding_claims c where c.user_id = v_uid),
           (select p.setup_completed_at from public.flock_profiles p where p.user_id = v_uid);
end;
$$;

revoke all on function private.flock_visible_birds(uuid[], uuid[]) from public, anon;
revoke all on function private.flock_member_profile(uuid) from public, anon;
revoke all on function private.flock_chapter(text) from public, anon;
revoke all on function private.flock_chapter_members(text) from public, anon;
revoke all on function private.flock_my_setup() from public, anon;
grant execute on function private.flock_visible_birds(uuid[], uuid[]) to authenticated, service_role;
grant execute on function private.flock_member_profile(uuid) to authenticated, service_role;
grant execute on function private.flock_chapter(text) to authenticated, service_role;
grant execute on function private.flock_chapter_members(text) to authenticated, service_role;
grant execute on function private.flock_my_setup() to authenticated, service_role;

-- RPC entry points: SECURITY INVOKER wrappers, like admin_grant_entitlement.
create or replace function public.flock_visible_birds(p_owner_ids uuid[] default null, p_bird_ids uuid[] default null)
returns table (bird_id uuid, owner_id uuid, name text, species text, has_photo boolean)
language sql stable security invoker set search_path = ''
as $$ select * from private.flock_visible_birds(p_owner_ids, p_bird_ids); $$;

create or replace function public.flock_member_profile(p_user_id uuid)
returns table (
  user_id uuid, display_name text, region_slug text, region_name text, region_states text[],
  bio text, photo_path text, is_founder boolean
)
language sql stable security invoker set search_path = ''
as $$ select * from private.flock_member_profile(p_user_id); $$;

create or replace function public.flock_chapter(p_region_slug text)
returns table (region_slug text, name text, states text[], member_count integer)
language sql stable security invoker set search_path = ''
as $$ select * from private.flock_chapter(p_region_slug); $$;

create or replace function public.flock_chapter_members(p_region_slug text)
returns table (user_id uuid, display_name text, photo_path text, is_founder boolean, bird_names text[])
language sql stable security invoker set search_path = ''
as $$ select * from private.flock_chapter_members(p_region_slug); $$;

create or replace function public.flock_my_setup()
returns table (suggested_region text, founding_spot smallint, setup_completed_at timestamptz)
language sql stable security invoker set search_path = ''
as $$ select * from private.flock_my_setup(); $$;

revoke all on function public.flock_visible_birds(uuid[], uuid[]) from public, anon;
revoke all on function public.flock_member_profile(uuid) from public, anon;
revoke all on function public.flock_chapter(text) from public, anon;
revoke all on function public.flock_chapter_members(text) from public, anon;
revoke all on function public.flock_my_setup() from public, anon;
grant execute on function public.flock_visible_birds(uuid[], uuid[]) to authenticated, service_role;
grant execute on function public.flock_member_profile(uuid) to authenticated, service_role;
grant execute on function public.flock_chapter(text) to authenticated, service_role;
grant execute on function public.flock_chapter_members(text) to authenticated, service_role;
grant execute on function public.flock_my_setup() to authenticated, service_role;


-- 5) Profile photos ------------------------------------------------------------------
-- Private bucket. Keys: "<user_id>/<file>". The app re-encodes every photo to
-- JPEG in the browser before upload (drops EXIF, GPS included) and refuses
-- files it can't re-encode; these limits are the backstop.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('flock-avatars', 'flock-avatars', false, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "flock-avatars flock read" on storage.objects;
drop policy if exists "flock-avatars own insert" on storage.objects;
drop policy if exists "flock-avatars own update" on storage.objects;
drop policy if exists "flock-avatars own delete" on storage.objects;
create policy "flock-avatars flock read" on storage.objects for select to authenticated
  using (bucket_id = 'flock-avatars' and private.can_use_flock(auth.uid()));
create policy "flock-avatars own insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'flock-avatars'
              and (storage.foldername(name))[1] = auth.uid()::text
              and private.can_use_flock(auth.uid()));
create policy "flock-avatars own update" on storage.objects for update to authenticated
  using (bucket_id = 'flock-avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "flock-avatars own delete" on storage.objects for delete to authenticated
  using (bucket_id = 'flock-avatars' and (storage.foldername(name))[1] = auth.uid()::text);
