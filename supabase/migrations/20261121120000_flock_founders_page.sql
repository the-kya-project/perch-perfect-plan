-- The founding members page (payments plan build H).
--
-- A founder chooses whether to be listed: "Show me on the founding members
-- page", unchecked by default, on /founding's region step and later on their
-- Flock profile. Existing claims start unchecked (the column's default).
--
-- The page is inside the Flock (behind flock_enabled(), like every Flock
-- screen) and never public. It reads through public.flock_founders(), which
-- returns exactly four things per founder: display name, profile photo path,
-- chapter name and founding spot number, in spot order. Only founders who
-- opted in, and never a founder who has blocked the viewer or whom the viewer
-- has blocked (private.flock_blocked, 20261121100000).
--
-- Additive only: one column on founding_claims (a Flock table; the care app
-- never reads it) and new functions. claim_founding_spot() is unchanged: the
-- app saves the choice right after the claim with founding_set_show(), which
-- needs only a signed-in founder (the claim page is public and works before
-- the Flock opens to members).
--
-- Pinned by supabase/checks/flock_founders_page_checks.sql.

alter table public.founding_claims
  add column if not exists show_on_founders_page boolean not null default false,
  add column if not exists show_changed_at timestamptz;

-- Set your own choice. Members can read their own claim (existing policy) but
-- have no write grant on the table; this is the only way to change it.
create or replace function private.founding_set_show(p_show boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_show boolean := coalesce(p_show, false);
begin
  if v_me is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  update public.founding_claims
  set show_on_founders_page = v_show, show_changed_at = now()
  where user_id = v_me;
  if not found then
    raise exception 'no founding spot' using errcode = 'P0002';
  end if;
  return v_show;
end;
$$;
revoke all on function private.founding_set_show(boolean) from public, anon;
grant execute on function private.founding_set_show(boolean) to authenticated;

create or replace function public.founding_set_show(p_show boolean)
returns boolean
language sql
security invoker
set search_path = ''
as $$ select private.founding_set_show(p_show); $$;
revoke all on function public.founding_set_show(boolean) from public, anon;
grant execute on function public.founding_set_show(boolean) to authenticated;

-- The page. Four fields, nothing else: no user id, email, bio, birds or claim
-- details. Founders who opted in, in spot order, minus anyone blocked either
-- way. The chapter is the founder's current Flock region.
create or replace function private.flock_founders()
returns table (display_name text, photo_path text, chapter_name text, spot_number integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.assert_can_use_flock();
  return query
    select fp.display_name, fp.photo_path, r.name, fc.spot_number::integer
    from public.founding_claims fc
    join public.flock_profiles fp on fp.user_id = fc.user_id
    left join public.regions r on r.slug = fp.region_slug
    where fc.show_on_founders_page
      and not private.flock_blocked(auth.uid(), fc.user_id)
    order by fc.spot_number;
end;
$$;
revoke all on function private.flock_founders() from public, anon;
grant execute on function private.flock_founders() to authenticated;

create or replace function public.flock_founders()
returns table (display_name text, photo_path text, chapter_name text, spot_number integer)
language sql
stable
security invoker
set search_path = ''
as $$ select * from private.flock_founders(); $$;
revoke all on function public.flock_founders() from public, anon;
grant execute on function public.flock_founders() to authenticated;
