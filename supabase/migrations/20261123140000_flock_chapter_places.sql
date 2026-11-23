-- Backlog 1.6: curated chapter collections (the chapter's Resources tab).
-- Additive only: one new table and new functions. No existing table, policy,
-- trigger or function changes, and nothing in the care app.
--
-- A listing (flock_places) belongs to one chapter (region_slug) and is an
-- Avian vet, a Rescue, or a Shop or service: a name, a city or area, a phone,
-- a website and a short note. No author, comments, reactions or ratings. The
-- same vet in two chapters is two rows.
--
-- Who sees what:
--   * Live listings: members of that chapter (their profile's region), and
--     whoever manages it (private.can_manage_chapter: admins for every
--     chapter, a chapter lead for their own).
--   * Suggestions (status 'pending'): only the chapter's managers, in
--     /admin/review → Places, until approved. Declining one deletes it.
-- Who writes:
--   * Any chapter member suggests a place (flock_place_suggest), at most
--     flock_place_suggest_limit() waiting at once.
--   * Managers add, edit, reorder and remove listings (flock_place_save,
--     flock_place_move, flock_place_remove) and approve or decline
--     suggestions (flock_place_review).
-- Everything goes through SECURITY DEFINER functions in private, with
-- invoker wrappers in public. App users have no grant on the table.


-- 1) Listings --------------------------------------------------------------------------

create table if not exists public.flock_places (
  id           uuid primary key default gen_random_uuid(),
  region_slug  text not null references public.regions(slug),
  kind         text not null check (kind in ('vet', 'rescue', 'shop')),
  name         text not null check (length(btrim(name)) between 1 and 120),
  area         text check (area is null or length(area) <= 120),
  phone        text check (phone is null or length(phone) <= 40),
  website      text check (website is null or (website ~* '^https?://' and length(website) <= 500)),
  note         text check (note is null or length(note) <= 300),
  -- Order within the chapter and kind; managers move listings up and down.
  position     integer not null default 0,
  -- pending = a member's suggestion, waiting for review; live = listed.
  -- A declined suggestion is deleted.
  status       text not null default 'pending' check (status in ('pending', 'live')),
  -- Who suggested or added it. Never shown on the listing; the review queue
  -- shows a suggester's Community name to the chapter's managers.
  created_by   uuid references auth.users(id) on delete set null,
  reviewed_by  uuid references auth.users(id) on delete set null,
  reviewed_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists flock_places_chapter_idx on public.flock_places (region_slug, kind, position) where status = 'live';
create index if not exists flock_places_pending_idx on public.flock_places (region_slug) where status = 'pending';
create index if not exists flock_places_created_by_idx on public.flock_places (created_by) where status = 'pending';

alter table public.flock_places enable row level security;
revoke all on public.flock_places from anon, authenticated;
grant select, insert, update, delete on public.flock_places to service_role;
drop policy if exists "flock_places no direct access" on public.flock_places;
create policy "flock_places no direct access" on public.flock_places for select to authenticated using (false);

-- How many suggestions one member may have waiting at once.
create or replace function private.flock_place_suggest_limit()
returns integer
language sql
immutable
set search_path = ''
as $$ select 10; $$;

revoke all on function private.flock_place_suggest_limit() from public, anon;
grant execute on function private.flock_place_suggest_limit() to authenticated, service_role;

-- The caller's chapter, or null ('other' counts as none).
create or replace function private.flock_my_chapter()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select nullif(fp.region_slug, 'other') from public.flock_profiles fp where fp.user_id = auth.uid();
$$;

revoke all on function private.flock_my_chapter() from public, anon;
grant execute on function private.flock_my_chapter() to authenticated, service_role;

-- Trim to null, and add https:// to a bare website ("example.com").
create or replace function private.flock_place_clean(p_text text, p_max integer)
returns text
language sql
immutable
set search_path = ''
as $$ select nullif(left(btrim(coalesce(p_text, '')), p_max), ''); $$;

create or replace function private.flock_place_website(p_url text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when private.flock_place_clean(p_url, 500) is null then null
    when private.flock_place_clean(p_url, 500) ~* '^https?://' then private.flock_place_clean(p_url, 500)
    else left('https://' || private.flock_place_clean(p_url, 500), 500)
  end;
$$;

revoke all on function private.flock_place_clean(text, integer) from public, anon;
revoke all on function private.flock_place_website(text) from public, anon;
grant execute on function private.flock_place_clean(text, integer) to authenticated, service_role;
grant execute on function private.flock_place_website(text) to authenticated, service_role;


-- 2) Reading ---------------------------------------------------------------------------

-- A chapter's live listings: the caller's own chapter (p_region null), or any
-- chapter the caller manages. Avian vets, then Rescues, then Shops and
-- services; each in the managers' order.
create or replace function private.flock_chapter_places(p_region text)
returns table (
  place_id uuid, region_slug text, kind text, name text, area text, phone text, website text, note text,
  "position" integer, updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_region text := coalesce(p_region, private.flock_my_chapter());
begin
  perform private.assert_can_use_flock();
  if v_region is null then
    return;
  end if;
  if v_region is distinct from private.flock_my_chapter() and not private.can_manage_chapter(auth.uid(), v_region) then
    raise exception 'not your chapter' using errcode = '42501';
  end if;
  return query
    select p.id, p.region_slug, p.kind, p.name, p.area, p.phone, p.website, p.note, p.position, p.updated_at
    from public.flock_places p
    where p.region_slug = v_region and p.status = 'live'
    order by array_position(array['vet', 'rescue', 'shop'], p.kind), p.position, p.created_at, p.id;
end;
$$;

-- What the Resources tab needs to know about the caller: their chapter,
-- whether they manage it, and (managers only) how many suggestions wait.
create or replace function private.flock_place_rules(p_region text)
returns table (region_slug text, region_name text, can_manage boolean, pending integer, is_lead boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_region text := coalesce(p_region, private.flock_my_chapter());
  v_manage boolean;
begin
  perform private.assert_can_use_flock();
  v_manage := v_region is not null and private.can_manage_chapter(auth.uid(), v_region);
  if v_region is distinct from private.flock_my_chapter() and not v_manage then
    raise exception 'not your chapter' using errcode = '42501';
  end if;
  return query
    select v_region, (select r.name from public.regions r where r.slug = v_region), v_manage,
           case when v_manage then (select count(*)::integer from public.flock_places p where p.region_slug = v_region and p.status = 'pending') else 0 end,
           coalesce(v_region is not null and private.chapter_lead_region(auth.uid()) = v_region, false);
end;
$$;

-- Suggestions waiting for the caller: every chapter for admins, their own
-- for a chapter lead, none for anyone else. Oldest first.
create or replace function private.flock_place_suggestions()
returns table (
  place_id uuid, region_slug text, region_name text, kind text, name text, area text, note text,
  suggested_by_name text, created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.assert_can_review_any();
  return query
    select p.id, p.region_slug, rg.name, p.kind, p.name, p.area, p.note, fp.display_name, p.created_at
    from public.flock_places p
    left join public.regions rg on rg.slug = p.region_slug
    left join public.flock_profiles fp on fp.user_id = p.created_by
    where p.status = 'pending' and private.can_manage_chapter(auth.uid(), p.region_slug)
    order by p.created_at, p.id;
end;
$$;

revoke all on function private.flock_chapter_places(text) from public, anon;
revoke all on function private.flock_place_rules(text) from public, anon;
revoke all on function private.flock_place_suggestions() from public, anon;
grant execute on function private.flock_chapter_places(text) to authenticated, service_role;
grant execute on function private.flock_place_rules(text) to authenticated, service_role;
grant execute on function private.flock_place_suggestions() to authenticated, service_role;


-- 3) Writing ---------------------------------------------------------------------------

-- The next position at the end of a chapter's kind.
create or replace function private.flock_place_next_position(p_region text, p_kind text)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(max(p.position), 0) + 1 from public.flock_places p
  where p.region_slug = p_region and p.kind = p_kind and p.status = 'live';
$$;

revoke all on function private.flock_place_next_position(text, text) from public, anon, authenticated;
grant execute on function private.flock_place_next_position(text, text) to service_role;

-- A member suggests a place for their own chapter. It waits for review and
-- shows to nobody but the chapter's managers until approved.
create or replace function private.flock_place_suggest(p_kind text, p_name text, p_area text, p_note text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_region text;
  v_id uuid;
begin
  perform private.assert_can_use_flock();
  v_region := private.flock_my_chapter();
  if v_region is null then
    raise exception 'choose your region to suggest a place' using errcode = '22023';
  end if;
  if p_kind is null or p_kind not in ('vet', 'rescue', 'shop') then
    raise exception 'pick avian vet, rescue, or shop or service' using errcode = '22023';
  end if;
  if private.flock_place_clean(p_name, 120) is null then
    raise exception 'add the place''s name' using errcode = '22023';
  end if;
  if (select count(*) from public.flock_places p where p.created_by = auth.uid() and p.status = 'pending')
     >= private.flock_place_suggest_limit() then
    raise exception 'rate_limited' using errcode = 'P0001', detail = 'places';
  end if;
  insert into public.flock_places (region_slug, kind, name, area, note, status, created_by)
  values (v_region, p_kind, private.flock_place_clean(p_name, 120), private.flock_place_clean(p_area, 120),
          private.flock_place_clean(p_note, 300), 'pending', auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

-- A manager adds a listing (p_id null: live at the end of its kind) or edits
-- a live one. Changing the kind moves it to the end of the new kind.
create or replace function private.flock_place_save(
  p_id uuid, p_region text, p_kind text, p_name text, p_area text, p_phone text, p_website text, p_note text
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  x public.flock_places;
  v_id uuid;
begin
  perform private.assert_can_use_flock();
  if p_kind is null or p_kind not in ('vet', 'rescue', 'shop') then
    raise exception 'pick avian vet, rescue, or shop or service' using errcode = '22023';
  end if;
  if private.flock_place_clean(p_name, 120) is null then
    raise exception 'add the place''s name' using errcode = '22023';
  end if;
  if p_id is null then
    if p_region is null or not private.can_manage_chapter(auth.uid(), p_region) then
      raise exception 'chapter leads and admins only' using errcode = '42501';
    end if;
    insert into public.flock_places (region_slug, kind, name, area, phone, website, note, position, status, created_by, reviewed_by, reviewed_at)
    values (p_region, p_kind, private.flock_place_clean(p_name, 120), private.flock_place_clean(p_area, 120),
            private.flock_place_clean(p_phone, 40), private.flock_place_website(p_website), private.flock_place_clean(p_note, 300),
            private.flock_place_next_position(p_region, p_kind), 'live', auth.uid(), auth.uid(), now())
    returning id into v_id;
    return v_id;
  end if;
  select * into x from public.flock_places p where p.id = p_id for update;
  if x.id is null or x.status <> 'live' or not private.can_manage_chapter(auth.uid(), x.region_slug) then
    raise exception 'not found' using errcode = 'P0002';
  end if;
  update public.flock_places p set
    kind = p_kind,
    name = private.flock_place_clean(p_name, 120),
    area = private.flock_place_clean(p_area, 120),
    phone = private.flock_place_clean(p_phone, 40),
    website = private.flock_place_website(p_website),
    note = private.flock_place_clean(p_note, 300),
    position = case when p_kind = x.kind then x.position else private.flock_place_next_position(x.region_slug, p_kind) end,
    updated_at = now()
  where p.id = x.id;
  return x.id;
end;
$$;

-- Move a live listing one place up (-1) or down (1) within its kind.
create or replace function private.flock_place_move(p_id uuid, p_direction integer)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  x public.flock_places;
  ids uuid[];
  i integer;
  j integer;
begin
  perform private.assert_can_use_flock();
  select * into x from public.flock_places p where p.id = p_id;
  if x.id is null or x.status <> 'live' or not private.can_manage_chapter(auth.uid(), x.region_slug) then
    raise exception 'not found' using errcode = 'P0002';
  end if;
  if p_direction is null or p_direction not in (-1, 1) then
    raise exception 'move up (-1) or down (1)' using errcode = '22023';
  end if;
  -- Lock the chapter's kind, then renumber it 1..n with the two swapped, so
  -- old ties or gaps never make a move do nothing.
  perform 1 from public.flock_places p
  where p.region_slug = x.region_slug and p.kind = x.kind and p.status = 'live' for update;
  select array_agg(p.id order by p.position, p.created_at, p.id) into ids
  from public.flock_places p
  where p.region_slug = x.region_slug and p.kind = x.kind and p.status = 'live';
  i := array_position(ids, x.id);
  j := i + p_direction;
  if j < 1 or j > cardinality(ids) then
    return;
  end if;
  ids[i] := ids[j];
  ids[j] := x.id;
  update public.flock_places p set position = s.n
  from unnest(ids) with ordinality as s(id, n)
  where p.id = s.id and p.position is distinct from s.n::integer;
end;
$$;

-- Remove a live listing for good.
create or replace function private.flock_place_remove(p_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  x public.flock_places;
begin
  perform private.assert_can_use_flock();
  select * into x from public.flock_places p where p.id = p_id;
  if x.id is null or x.status <> 'live' or not private.can_manage_chapter(auth.uid(), x.region_slug) then
    raise exception 'not found' using errcode = 'P0002';
  end if;
  delete from public.flock_places p where p.id = x.id;
end;
$$;

-- Approve a suggestion (live, at the end of its kind) or decline it (deleted).
create or replace function private.flock_place_review(p_id uuid, p_decision text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  x public.flock_places;
begin
  perform private.assert_can_review_any();
  select * into x from public.flock_places p where p.id = p_id for update;
  if x.id is null or x.status <> 'pending' or not private.can_manage_chapter(auth.uid(), x.region_slug) then
    raise exception 'not found' using errcode = 'P0002';
  end if;
  if p_decision is null or p_decision not in ('approve', 'decline') then
    raise exception 'approve or decline' using errcode = '22023';
  end if;
  if p_decision = 'decline' then
    delete from public.flock_places p where p.id = x.id;
    return;
  end if;
  update public.flock_places p set
    status = 'live', position = private.flock_place_next_position(x.region_slug, x.kind),
    reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now()
  where p.id = x.id;
end;
$$;

revoke all on function private.flock_place_suggest(text, text, text, text) from public, anon;
revoke all on function private.flock_place_save(uuid, text, text, text, text, text, text, text) from public, anon;
revoke all on function private.flock_place_move(uuid, integer) from public, anon;
revoke all on function private.flock_place_remove(uuid) from public, anon;
revoke all on function private.flock_place_review(uuid, text) from public, anon;
grant execute on function private.flock_place_suggest(text, text, text, text) to authenticated, service_role;
grant execute on function private.flock_place_save(uuid, text, text, text, text, text, text, text) to authenticated, service_role;
grant execute on function private.flock_place_move(uuid, integer) to authenticated, service_role;
grant execute on function private.flock_place_remove(uuid) to authenticated, service_role;
grant execute on function private.flock_place_review(uuid, text) to authenticated, service_role;


-- 4) Invoker wrappers the app calls ------------------------------------------------------

create or replace function public.flock_chapter_places(p_region text default null)
returns table (
  place_id uuid, region_slug text, kind text, name text, area text, phone text, website text, note text,
  "position" integer, updated_at timestamptz
) language sql stable security invoker set search_path = ''
as $$ select * from private.flock_chapter_places(p_region); $$;

create or replace function public.flock_place_rules(p_region text default null)
returns table (region_slug text, region_name text, can_manage boolean, pending integer, is_lead boolean)
language sql stable security invoker set search_path = ''
as $$ select * from private.flock_place_rules(p_region); $$;

create or replace function public.flock_place_suggestions()
returns table (
  place_id uuid, region_slug text, region_name text, kind text, name text, area text, note text,
  suggested_by_name text, created_at timestamptz
) language sql stable security invoker set search_path = ''
as $$ select * from private.flock_place_suggestions(); $$;

create or replace function public.flock_place_suggest(p_kind text, p_name text, p_area text default null, p_note text default null)
returns uuid language sql volatile security invoker set search_path = ''
as $$ select private.flock_place_suggest(p_kind, p_name, p_area, p_note); $$;

create or replace function public.flock_place_save(
  p_id uuid, p_region text, p_kind text, p_name text, p_area text default null, p_phone text default null,
  p_website text default null, p_note text default null
)
returns uuid language sql volatile security invoker set search_path = ''
as $$ select private.flock_place_save(p_id, p_region, p_kind, p_name, p_area, p_phone, p_website, p_note); $$;

create or replace function public.flock_place_move(p_id uuid, p_direction integer)
returns void language sql volatile security invoker set search_path = ''
as $$ select private.flock_place_move(p_id, p_direction); $$;

create or replace function public.flock_place_remove(p_id uuid)
returns void language sql volatile security invoker set search_path = ''
as $$ select private.flock_place_remove(p_id); $$;

create or replace function public.flock_place_review(p_id uuid, p_decision text)
returns void language sql volatile security invoker set search_path = ''
as $$ select private.flock_place_review(p_id, p_decision); $$;

revoke all on function public.flock_chapter_places(text) from public, anon;
revoke all on function public.flock_place_rules(text) from public, anon;
revoke all on function public.flock_place_suggestions() from public, anon;
revoke all on function public.flock_place_suggest(text, text, text, text) from public, anon;
revoke all on function public.flock_place_save(uuid, text, text, text, text, text, text, text) from public, anon;
revoke all on function public.flock_place_move(uuid, integer) from public, anon;
revoke all on function public.flock_place_remove(uuid) from public, anon;
revoke all on function public.flock_place_review(uuid, text) from public, anon;
grant execute on function public.flock_chapter_places(text) to authenticated, service_role;
grant execute on function public.flock_place_rules(text) to authenticated, service_role;
grant execute on function public.flock_place_suggestions() to authenticated, service_role;
grant execute on function public.flock_place_suggest(text, text, text, text) to authenticated, service_role;
grant execute on function public.flock_place_save(uuid, text, text, text, text, text, text, text) to authenticated, service_role;
grant execute on function public.flock_place_move(uuid, integer) to authenticated, service_role;
grant execute on function public.flock_place_remove(uuid) to authenticated, service_role;
grant execute on function public.flock_place_review(uuid, text) to authenticated, service_role;
