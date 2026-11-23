-- Backlog 1.8: Do good voting and the founding vote.
-- Additive only: three new tables, a private bucket and new functions. No
-- existing table, policy, trigger or function changes, and nothing in the
-- care app.
--
-- A vote (flock_votes) is a question, a short description, two to eight
-- choices (flock_vote_choices: a name, a sentence or two, an optional photo),
-- an audience (every member, or founding members only) and a close date.
-- Admins write it as a draft, open it, close it early or extend it, and add
-- an announcement that shows with the results.
--
-- Who sees what:
--   * Drafts: admins only.
--   * An open or closed vote: Flock members (and admins); a founders-only
--     vote only to founding members (a founding_claims row) and admins.
--   * Before it closes: the question, the choices, how many have voted and
--     the caller's own choice. Never who's winning.
--   * After it closes: percentages, the winner and the announcement, unless
--     fewer than flock_vote_min_results() (10) people voted, when it says
--     "too few votes to share" and only admins see the counts.
--   * Admins see the counts per choice at any time.
--   * Nobody, admins included, can see how a specific member voted: ballots
--     are readable by no app user, and no function returns anyone's ballot
--     but the caller's own.
-- Everything goes through SECURITY DEFINER functions in private, with
-- invoker wrappers in public. App users have no grant on the tables.


-- 1) Tables ----------------------------------------------------------------------------

create table if not exists public.flock_votes (
  id           uuid primary key default gen_random_uuid(),
  question     text not null check (length(btrim(question)) between 1 and 200),
  description  text check (description is null or length(description) <= 600),
  audience     text not null default 'members' check (audience in ('members', 'founders')),
  -- draft → open → closed. An open vote also counts as closed once
  -- closes_at has passed (private.flock_vote_state). Closing early sets
  -- closes_at to the moment it closed.
  status       text not null default 'draft' check (status in ('draft', 'open', 'closed')),
  closes_at    timestamptz not null,
  opened_at    timestamptz,
  announcement text check (announcement is null or length(announcement) <= 1000),
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists flock_votes_live_idx on public.flock_votes (closes_at) where status <> 'draft';

create table if not exists public.flock_vote_choices (
  id          uuid primary key default gen_random_uuid(),
  vote_id     uuid not null references public.flock_votes(id) on delete cascade,
  position    integer not null,
  name        text not null check (length(btrim(name)) between 1 and 120),
  blurb       text check (blurb is null or length(blurb) <= 300),
  photo_path  text check (photo_path is null or photo_path ~ '^choices/[0-9a-f-]{36}\.jpg$'),
  created_at  timestamptz not null default now(),
  unique (vote_id, id)
);
create index if not exists flock_vote_choices_vote_idx on public.flock_vote_choices (vote_id, position);

-- One ballot per member per vote; changing your vote updates it. The choice
-- must belong to the same vote (the composite key).
create table if not exists public.flock_vote_ballots (
  vote_id     uuid not null references public.flock_votes(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  choice_id   uuid not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (vote_id, user_id),
  foreign key (vote_id, choice_id) references public.flock_vote_choices (vote_id, id) on delete cascade
);
create index if not exists flock_vote_ballots_choice_idx on public.flock_vote_ballots (vote_id, choice_id);
create index if not exists flock_vote_ballots_user_idx on public.flock_vote_ballots (user_id);

alter table public.flock_votes enable row level security;
alter table public.flock_vote_choices enable row level security;
alter table public.flock_vote_ballots enable row level security;
revoke all on public.flock_votes from anon, authenticated;
revoke all on public.flock_vote_choices from anon, authenticated;
revoke all on public.flock_vote_ballots from anon, authenticated;
grant select, insert, update, delete on public.flock_votes to service_role;
grant select, insert, update, delete on public.flock_vote_choices to service_role;
grant select, insert, update, delete on public.flock_vote_ballots to service_role;
drop policy if exists "flock_votes no direct access" on public.flock_votes;
drop policy if exists "flock_vote_choices no direct access" on public.flock_vote_choices;
drop policy if exists "flock_vote_ballots no direct access" on public.flock_vote_ballots;
create policy "flock_votes no direct access" on public.flock_votes for select to authenticated using (false);
create policy "flock_vote_choices no direct access" on public.flock_vote_choices for select to authenticated using (false);
create policy "flock_vote_ballots no direct access" on public.flock_vote_ballots for select to authenticated using (false);


-- 2) Rules -----------------------------------------------------------------------------

-- Fewer voters than this when a vote closes: "too few votes to share".
create or replace function private.flock_vote_min_results()
returns integer language sql immutable set search_path = '' as $$ select 10; $$;

-- How long a closed vote's results stay on Do good.
create or replace function private.flock_vote_results_days()
returns integer language sql immutable set search_path = '' as $$ select 14; $$;

create or replace function private.flock_vote_state(p_status text, p_closes_at timestamptz)
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when p_status = 'draft' then 'draft'
    when p_status = 'closed' or p_closes_at <= now() then 'closed'
    else 'open'
  end;
$$;

create or replace function private.flock_is_founder(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$ select p_user_id is not null and exists (select 1 from public.founding_claims fc where fc.user_id = p_user_id); $$;

-- May the caller see a (non-draft) vote with this audience?
create or replace function private.flock_vote_audience_ok(p_audience text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.can_use_flock(auth.uid())
     and (p_audience = 'members' or private.is_admin(auth.uid()) or private.flock_is_founder(auth.uid()));
$$;

create or replace function private.assert_flock_admin()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_admin(auth.uid()) then
    raise exception 'admins only' using errcode = '42501';
  end if;
end;
$$;

revoke all on function private.flock_vote_min_results() from public, anon;
revoke all on function private.flock_vote_results_days() from public, anon;
revoke all on function private.flock_vote_state(text, timestamptz) from public, anon;
revoke all on function private.flock_is_founder(uuid) from public, anon;
revoke all on function private.flock_vote_audience_ok(text) from public, anon;
revoke all on function private.assert_flock_admin() from public, anon;
grant execute on function private.flock_vote_min_results() to authenticated, service_role;
grant execute on function private.flock_vote_results_days() to authenticated, service_role;
grant execute on function private.flock_vote_state(text, timestamptz) to authenticated, service_role;
grant execute on function private.flock_is_founder(uuid) to authenticated, service_role;
grant execute on function private.flock_vote_audience_ok(text) to authenticated, service_role;
grant execute on function private.assert_flock_admin() to authenticated, service_role;


-- 3) Reading ---------------------------------------------------------------------------

-- One vote (p_id) or the current ones (p_id null: open votes, and votes that
-- closed within flock_vote_results_days(), newest closing first after the
-- open ones). Each row carries its choices as JSON, in order:
--   {choice_id, name, blurb, photo_path, percent, votes, winner}
-- percent and winner only once closed with enough voters; votes (the count)
-- only for admins. my_choice is the caller's own ballot, never anyone else's.
create or replace function private.flock_vote_rows(p_id uuid)
returns table (
  vote_id uuid, question text, description text, audience text, state text, closes_at timestamptz,
  voters integer, my_choice uuid, announcement text, too_few boolean, choices jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_admin boolean;
begin
  perform private.assert_can_use_flock();
  v_admin := private.is_admin(auth.uid());
  return query
    with v as (
      select x.*, private.flock_vote_state(x.status, x.closes_at) as st,
             (select count(*)::integer from public.flock_vote_ballots b where b.vote_id = x.id) as n
      from public.flock_votes x
      where (p_id is null or x.id = p_id)
        and (case
               when x.status = 'draft' then p_id is not null and v_admin
               else private.flock_vote_audience_ok(x.audience)
             end)
        and (p_id is not null
             or private.flock_vote_state(x.status, x.closes_at) = 'open'
             or (private.flock_vote_state(x.status, x.closes_at) = 'closed'
                 and x.closes_at > now() - make_interval(days => private.flock_vote_results_days())))
    ),
    c as (
      select ch.vote_id, ch.id, ch.position, ch.name, ch.blurb, ch.photo_path,
             (select count(*)::integer from public.flock_vote_ballots b where b.vote_id = ch.vote_id and b.choice_id = ch.id) as k
      from public.flock_vote_choices ch
      where ch.vote_id in (select v.id from v)
    )
    select v.id, v.question, v.description, v.audience, v.st, v.closes_at, v.n,
           (select b.choice_id from public.flock_vote_ballots b where b.vote_id = v.id and b.user_id = auth.uid()),
           case when v.st = 'closed' or v_admin then v.announcement end,
           v.st = 'closed' and v.n < private.flock_vote_min_results(),
           coalesce((
             select jsonb_agg(jsonb_build_object(
                      'choice_id', c.id, 'name', c.name, 'blurb', c.blurb, 'photo_path', c.photo_path,
                      'percent', case when v.st = 'closed' and v.n >= private.flock_vote_min_results()
                                      then round(100.0 * c.k / v.n)::integer end,
                      'votes', case when v_admin then c.k end,
                      'winner', v.st = 'closed' and v.n >= private.flock_vote_min_results() and c.k > 0
                                and c.k = (select max(c2.k) from c c2 where c2.vote_id = v.id)
                    ) order by c.position, c.id)
             from c where c.vote_id = v.id
           ), '[]'::jsonb)
    from v
    order by (v.st = 'open') desc, case when v.st = 'open' then v.closes_at end asc, v.closes_at desc, v.id;
end;
$$;

-- Admins: every vote, drafts included, for /admin/votes.
create or replace function private.admin_votes()
returns table (
  vote_id uuid, question text, audience text, state text, closes_at timestamptz, voters integer, choice_count integer, updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.assert_flock_admin();
  return query
    select x.id, x.question, x.audience, private.flock_vote_state(x.status, x.closes_at), x.closes_at,
           (select count(*)::integer from public.flock_vote_ballots b where b.vote_id = x.id),
           (select count(*)::integer from public.flock_vote_choices ch where ch.vote_id = x.id),
           x.updated_at
    from public.flock_votes x
    order by (x.status = 'draft') desc, x.closes_at desc, x.id;
end;
$$;

revoke all on function private.flock_vote_rows(uuid) from public, anon;
revoke all on function private.admin_votes() from public, anon;
grant execute on function private.flock_vote_rows(uuid) to authenticated, service_role;
grant execute on function private.admin_votes() to authenticated, service_role;


-- 4) Voting ----------------------------------------------------------------------------

-- Pick one choice, or change your pick, while the vote is open.
create or replace function private.flock_vote_cast(p_vote_id uuid, p_choice_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  x public.flock_votes;
begin
  perform private.assert_can_use_flock();
  select * into x from public.flock_votes v where v.id = p_vote_id for share;
  if x.id is null or x.status = 'draft' or not private.flock_vote_audience_ok(x.audience) then
    raise exception 'not found' using errcode = 'P0002';
  end if;
  if private.flock_vote_state(x.status, x.closes_at) <> 'open' then
    raise exception 'vote_closed' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.flock_vote_choices ch where ch.vote_id = x.id and ch.id = p_choice_id) then
    raise exception 'pick one of the choices' using errcode = '22023';
  end if;
  insert into public.flock_vote_ballots (vote_id, user_id, choice_id)
  values (x.id, auth.uid(), p_choice_id)
  on conflict (vote_id, user_id) do update set choice_id = excluded.choice_id, updated_at = now();
end;
$$;

revoke all on function private.flock_vote_cast(uuid, uuid) from public, anon;
grant execute on function private.flock_vote_cast(uuid, uuid) to authenticated, service_role;


-- 5) Admin writes ----------------------------------------------------------------------

-- Create (p_id null) or edit a draft: question, description, audience, close
-- date and its choices, in order (p_choices: [{name, blurb, photo_path}],
-- at most 8; opening needs at least 2). Once open, only the close date
-- (extend) and the announcement change, so nobody's ballot points at a
-- choice that was rewritten.
create or replace function private.admin_vote_save(
  p_id uuid, p_question text, p_description text, p_audience text, p_closes_at timestamptz, p_choices jsonb
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  x public.flock_votes;
  v_id uuid;
  v_choices jsonb := coalesce(p_choices, '[]'::jsonb);
begin
  perform private.assert_flock_admin();
  if nullif(btrim(coalesce(p_question, '')), '') is null then
    raise exception 'add the question' using errcode = '22023';
  end if;
  if p_audience is null or p_audience not in ('members', 'founders') then
    raise exception 'pick all members or founders only' using errcode = '22023';
  end if;
  if p_closes_at is null then
    raise exception 'add a close date' using errcode = '22023';
  end if;
  if jsonb_typeof(v_choices) <> 'array' then
    raise exception 'choices must be a list' using errcode = '22023';
  end if;
  if jsonb_array_length(v_choices) > 8 then
    raise exception 'up to eight choices' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(v_choices) e where nullif(btrim(coalesce(e->>'name', '')), '') is null) then
    raise exception 'every choice needs a name' using errcode = '22023';
  end if;
  if p_id is null then
    insert into public.flock_votes (question, description, audience, closes_at, created_by)
    values (btrim(p_question), nullif(btrim(coalesce(p_description, '')), ''), p_audience, p_closes_at, auth.uid())
    returning id into v_id;
  else
    select * into x from public.flock_votes v where v.id = p_id for update;
    if x.id is null then
      raise exception 'not found' using errcode = 'P0002';
    end if;
    if x.status <> 'draft' then
      raise exception 'only drafts can be edited' using errcode = '22023';
    end if;
    update public.flock_votes v set
      question = btrim(p_question), description = nullif(btrim(coalesce(p_description, '')), ''),
      audience = p_audience, closes_at = p_closes_at, updated_at = now()
    where v.id = x.id;
    v_id := x.id;
    delete from public.flock_vote_choices ch where ch.vote_id = v_id;
  end if;
  insert into public.flock_vote_choices (vote_id, position, name, blurb, photo_path)
  select v_id, e.ord::integer, left(btrim(e.val->>'name'), 120),
         nullif(left(btrim(coalesce(e.val->>'blurb', '')), 300), ''),
         nullif(e.val->>'photo_path', '')
  from jsonb_array_elements(v_choices) with ordinality as e(val, ord);
  return v_id;
end;
$$;

-- Open a draft: needs two to eight choices and a close date still ahead.
create or replace function private.admin_vote_open(p_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  x public.flock_votes;
  n integer;
begin
  perform private.assert_flock_admin();
  select * into x from public.flock_votes v where v.id = p_id for update;
  if x.id is null then
    raise exception 'not found' using errcode = 'P0002';
  end if;
  if x.status <> 'draft' then
    raise exception 'already opened' using errcode = '22023';
  end if;
  select count(*) into n from public.flock_vote_choices ch where ch.vote_id = x.id;
  if n < 2 or n > 8 then
    raise exception 'a vote needs two to eight choices' using errcode = '22023';
  end if;
  if x.closes_at <= now() then
    raise exception 'pick a close date that''s still ahead' using errcode = '22023';
  end if;
  update public.flock_votes v set status = 'open', opened_at = now(), updated_at = now() where v.id = x.id;
end;
$$;

-- Close an open vote now.
create or replace function private.admin_vote_close(p_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  x public.flock_votes;
begin
  perform private.assert_flock_admin();
  select * into x from public.flock_votes v where v.id = p_id for update;
  if x.id is null then
    raise exception 'not found' using errcode = 'P0002';
  end if;
  if private.flock_vote_state(x.status, x.closes_at) <> 'open' then
    raise exception 'this vote isn''t open' using errcode = '22023';
  end if;
  update public.flock_votes v set status = 'closed', closes_at = now(), updated_at = now() where v.id = x.id;
end;
$$;

-- Move an open vote's close date later.
create or replace function private.admin_vote_extend(p_id uuid, p_closes_at timestamptz)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  x public.flock_votes;
begin
  perform private.assert_flock_admin();
  select * into x from public.flock_votes v where v.id = p_id for update;
  if x.id is null then
    raise exception 'not found' using errcode = 'P0002';
  end if;
  if private.flock_vote_state(x.status, x.closes_at) <> 'open' then
    raise exception 'this vote isn''t open' using errcode = '22023';
  end if;
  if p_closes_at is null or p_closes_at <= x.closes_at then
    raise exception 'pick a later close date' using errcode = '22023';
  end if;
  update public.flock_votes v set closes_at = p_closes_at, updated_at = now() where v.id = x.id;
end;
$$;

-- The note that shows with the results (empty clears it).
create or replace function private.admin_vote_announce(p_id uuid, p_text text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.assert_flock_admin();
  update public.flock_votes v
  set announcement = nullif(left(btrim(coalesce(p_text, '')), 1000), ''), updated_at = now()
  where v.id = p_id;
  if not found then
    raise exception 'not found' using errcode = 'P0002';
  end if;
end;
$$;

-- Delete a draft. Returns its choices' photo paths, for the app to remove.
create or replace function private.admin_vote_delete(p_id uuid)
returns text[]
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  x public.flock_votes;
  v_paths text[];
begin
  perform private.assert_flock_admin();
  select * into x from public.flock_votes v where v.id = p_id for update;
  if x.id is null then
    raise exception 'not found' using errcode = 'P0002';
  end if;
  if x.status <> 'draft' then
    raise exception 'only drafts can be deleted' using errcode = '22023';
  end if;
  select coalesce(array_agg(ch.photo_path) filter (where ch.photo_path is not null), '{}') into v_paths
  from public.flock_vote_choices ch where ch.vote_id = x.id;
  delete from public.flock_votes v where v.id = x.id;
  return v_paths;
end;
$$;

revoke all on function private.admin_vote_save(uuid, text, text, text, timestamptz, jsonb) from public, anon;
revoke all on function private.admin_vote_open(uuid) from public, anon;
revoke all on function private.admin_vote_close(uuid) from public, anon;
revoke all on function private.admin_vote_extend(uuid, timestamptz) from public, anon;
revoke all on function private.admin_vote_announce(uuid, text) from public, anon;
revoke all on function private.admin_vote_delete(uuid) from public, anon;
grant execute on function private.admin_vote_save(uuid, text, text, text, timestamptz, jsonb) to authenticated, service_role;
grant execute on function private.admin_vote_open(uuid) to authenticated, service_role;
grant execute on function private.admin_vote_close(uuid) to authenticated, service_role;
grant execute on function private.admin_vote_extend(uuid, timestamptz) to authenticated, service_role;
grant execute on function private.admin_vote_announce(uuid, text) to authenticated, service_role;
grant execute on function private.admin_vote_delete(uuid) to authenticated, service_role;


-- 6) Choice photos: private 'flock-votes' bucket ------------------------------------------
-- choices/<uuid>.jpg, re-encoded to JPEG in the browser (no EXIF/GPS), 2 MB.
-- Admins do everything; anyone else reads only the photos of a vote they may
-- see (never a draft's). Admin content, so account deletion never touches it.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('flock-votes', 'flock-votes', false, 2097152, array['image/jpeg'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create or replace function private.flock_vote_file_readable(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_name is not null and exists (
    select 1 from public.flock_vote_choices ch
    join public.flock_votes v on v.id = ch.vote_id
    where ch.photo_path = p_name and v.status <> 'draft' and private.flock_vote_audience_ok(v.audience)
  );
$$;

revoke all on function private.flock_vote_file_readable(text) from public, anon;
grant execute on function private.flock_vote_file_readable(text) to authenticated, service_role;

drop policy if exists "flock-votes read" on storage.objects;
drop policy if exists "flock-votes admins insert" on storage.objects;
drop policy if exists "flock-votes admins update" on storage.objects;
drop policy if exists "flock-votes admins delete" on storage.objects;

create policy "flock-votes read" on storage.objects for select to authenticated
  using (bucket_id = 'flock-votes'
         and (private.is_admin(auth.uid()) or private.flock_vote_file_readable(name)));
create policy "flock-votes admins insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'flock-votes'
              and private.is_admin(auth.uid())
              and name ~ '^choices/[0-9a-f-]{36}\.jpg$');
create policy "flock-votes admins update" on storage.objects for update to authenticated
  using (bucket_id = 'flock-votes' and private.is_admin(auth.uid()))
  with check (bucket_id = 'flock-votes' and private.is_admin(auth.uid()));
create policy "flock-votes admins delete" on storage.objects for delete to authenticated
  using (bucket_id = 'flock-votes' and private.is_admin(auth.uid()));


-- 7) Invoker wrappers the app calls ------------------------------------------------------

create or replace function public.flock_votes_current()
returns table (
  vote_id uuid, question text, description text, audience text, state text, closes_at timestamptz,
  voters integer, my_choice uuid, announcement text, too_few boolean, choices jsonb
) language sql stable security invoker set search_path = ''
as $$ select * from private.flock_vote_rows(null); $$;

create or replace function public.flock_vote(p_id uuid)
returns table (
  vote_id uuid, question text, description text, audience text, state text, closes_at timestamptz,
  voters integer, my_choice uuid, announcement text, too_few boolean, choices jsonb
) language sql stable security invoker set search_path = ''
as $$ select * from private.flock_vote_rows(p_id) where p_id is not null; $$;

create or replace function public.flock_vote_cast(p_vote_id uuid, p_choice_id uuid)
returns void language sql volatile security invoker set search_path = ''
as $$ select private.flock_vote_cast(p_vote_id, p_choice_id); $$;

create or replace function public.admin_votes()
returns table (
  vote_id uuid, question text, audience text, state text, closes_at timestamptz, voters integer, choice_count integer, updated_at timestamptz
) language sql stable security invoker set search_path = ''
as $$ select * from private.admin_votes(); $$;

create or replace function public.admin_vote_save(
  p_id uuid, p_question text, p_description text, p_audience text, p_closes_at timestamptz, p_choices jsonb
)
returns uuid language sql volatile security invoker set search_path = ''
as $$ select private.admin_vote_save(p_id, p_question, p_description, p_audience, p_closes_at, p_choices); $$;

create or replace function public.admin_vote_open(p_id uuid)
returns void language sql volatile security invoker set search_path = ''
as $$ select private.admin_vote_open(p_id); $$;

create or replace function public.admin_vote_close(p_id uuid)
returns void language sql volatile security invoker set search_path = ''
as $$ select private.admin_vote_close(p_id); $$;

create or replace function public.admin_vote_extend(p_id uuid, p_closes_at timestamptz)
returns void language sql volatile security invoker set search_path = ''
as $$ select private.admin_vote_extend(p_id, p_closes_at); $$;

create or replace function public.admin_vote_announce(p_id uuid, p_text text)
returns void language sql volatile security invoker set search_path = ''
as $$ select private.admin_vote_announce(p_id, p_text); $$;

create or replace function public.admin_vote_delete(p_id uuid)
returns text[] language sql volatile security invoker set search_path = ''
as $$ select private.admin_vote_delete(p_id); $$;

revoke all on function public.flock_votes_current() from public, anon;
revoke all on function public.flock_vote(uuid) from public, anon;
revoke all on function public.flock_vote_cast(uuid, uuid) from public, anon;
revoke all on function public.admin_votes() from public, anon;
revoke all on function public.admin_vote_save(uuid, text, text, text, timestamptz, jsonb) from public, anon;
revoke all on function public.admin_vote_open(uuid) from public, anon;
revoke all on function public.admin_vote_close(uuid) from public, anon;
revoke all on function public.admin_vote_extend(uuid, timestamptz) from public, anon;
revoke all on function public.admin_vote_announce(uuid, text) from public, anon;
revoke all on function public.admin_vote_delete(uuid) from public, anon;
grant execute on function public.flock_votes_current() to authenticated, service_role;
grant execute on function public.flock_vote(uuid) to authenticated, service_role;
grant execute on function public.flock_vote_cast(uuid, uuid) to authenticated, service_role;
grant execute on function public.admin_votes() to authenticated, service_role;
grant execute on function public.admin_vote_save(uuid, text, text, text, timestamptz, jsonb) to authenticated, service_role;
grant execute on function public.admin_vote_open(uuid) to authenticated, service_role;
grant execute on function public.admin_vote_close(uuid) to authenticated, service_role;
grant execute on function public.admin_vote_extend(uuid, timestamptz) to authenticated, service_role;
grant execute on function public.admin_vote_announce(uuid, text) to authenticated, service_role;
grant execute on function public.admin_vote_delete(uuid) to authenticated, service_role;
