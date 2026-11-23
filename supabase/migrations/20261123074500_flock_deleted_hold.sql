-- Backlog 1.3 (legal draft D10): a deleted post or comment is hidden from
-- everyone at once, its author included, and kept for 180 days before it and
-- its photos are deleted for good. Deleting a whole account stays immediate.
--
-- How: deleting still removes the row from flock_posts / flock_comments, so
-- every visibility rule, count, feed and notification behaves exactly as it
-- does today. Just before that, the delete functions copy what's being deleted
-- (the post and the comments on it, or a comment and its replies) into
-- flock_deleted_items, which nobody but the service role can read. Photos stay
-- in the bucket until the hold ends.
--
-- The daily job `flock-deleted-purge-daily` calls /api/public/hooks/flock-purge
-- (through private.call_cron_hook), which asks flock_purge_due() for items
-- whose hold is over, removes their photos through the Storage API (SQL can't
-- remove the files themselves), then deletes the items with
-- flock_purge_done(). An item whose photos fail to delete stays for the next
-- run, so running it again is always safe.
--
-- Account deletion: a held item belongs to its author (author_id cascades), so
-- deleting an account removes that person's held items at once, and the
-- account's file sweep (src/lib/accountMedia.ts) removes their photos.
--
-- Pinned by supabase/checks/flock_posts_checks.sql.

create table if not exists public.flock_deleted_items (
  id           uuid primary key default gen_random_uuid(),
  kind         text not null check (kind in ('post', 'comment')),
  -- The id the post or comment had.
  original_id  uuid not null,
  author_id    uuid not null references auth.users(id) on delete cascade,
  -- A comment held because the post (or top comment) it was under was
  -- deleted: the held post or comment. Kept, not cascaded, if that one goes
  -- first (its author deleted their account), so the comment's own photo is
  -- still purged on time.
  held_with    uuid references public.flock_deleted_items(id) on delete set null,
  -- The row as it was when deleted.
  row_data     jsonb not null,
  -- Its photos in the flock-posts bucket.
  photo_paths  text[] not null default '{}',
  deleted_at   timestamptz not null default now(),
  purge_after  timestamptz not null
);
create index if not exists flock_deleted_items_purge_idx on public.flock_deleted_items (purge_after);
create index if not exists flock_deleted_items_author_idx on public.flock_deleted_items (author_id);
create index if not exists flock_deleted_items_held_with_idx on public.flock_deleted_items (held_with);

alter table public.flock_deleted_items enable row level security;
revoke all on public.flock_deleted_items from anon, authenticated;
grant select, insert, update, delete on public.flock_deleted_items to service_role;
drop policy if exists "flock_deleted_items no direct access" on public.flock_deleted_items;
create policy "flock_deleted_items no direct access" on public.flock_deleted_items for select to authenticated using (false);

-- How long a deleted post or comment is kept (D10).
create or replace function private.flock_deleted_hold()
returns interval
language sql
immutable
set search_path = ''
as $$ select interval '180 days' $$;

revoke all on function private.flock_deleted_hold() from public, anon, authenticated;
grant execute on function private.flock_deleted_hold() to service_role;


-- Deleting your own post: same checks as before. The post and every comment
-- on it are held, then the post is deleted (its comments and reactions go with
-- it, by the existing cleanup trigger). Returns no photo paths now: the files
-- stay until the hold ends. (The return type is unchanged so the app's
-- deleteFlockPost keeps working either side of this migration.)
create or replace function private.flock_post_delete(p_post_id uuid)
returns table (path text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  p public.flock_posts;
  v_held uuid;
  v_until timestamptz := now() + private.flock_deleted_hold();
begin
  perform private.assert_can_use_flock();
  select * into p from public.flock_posts x where x.id = p_post_id;
  if p.id is null or p.author_id <> auth.uid() then
    raise exception 'not found' using errcode = 'P0002';
  end if;
  insert into public.flock_deleted_items (kind, original_id, author_id, row_data, photo_paths, purge_after)
  values ('post', p.id, p.author_id, to_jsonb(p), p.photo_paths, v_until)
  returning id into v_held;
  insert into public.flock_deleted_items (kind, original_id, author_id, held_with, row_data, photo_paths, purge_after)
  select 'comment', c.id, c.author_id, v_held, to_jsonb(c),
         case when c.photo_path is null then '{}'::text[] else array[c.photo_path] end, v_until
  from public.flock_comments c
  where c.subject_type = 'post' and c.subject_id = p.id;
  delete from public.flock_posts x where x.id = p.id;
  return;
end;
$$;

-- Deleting your own comment (a top comment takes its replies with it): the
-- comment and its replies are held, then deleted. Returns no photo paths now.
create or replace function private.flock_comment_delete(p_comment_id uuid)
returns table (path text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  c public.flock_comments;
  v_held uuid;
  v_until timestamptz := now() + private.flock_deleted_hold();
begin
  perform private.assert_can_use_flock();
  select * into c from public.flock_comments x where x.id = p_comment_id;
  if c.id is null or c.author_id <> auth.uid() then
    raise exception 'not found' using errcode = 'P0002';
  end if;
  insert into public.flock_deleted_items (kind, original_id, author_id, row_data, photo_paths, purge_after)
  values ('comment', c.id, c.author_id, to_jsonb(c),
          case when c.photo_path is null then '{}'::text[] else array[c.photo_path] end, v_until)
  returning id into v_held;
  insert into public.flock_deleted_items (kind, original_id, author_id, held_with, row_data, photo_paths, purge_after)
  select 'comment', x.id, x.author_id, v_held, to_jsonb(x),
         case when x.photo_path is null then '{}'::text[] else array[x.photo_path] end, v_until
  from public.flock_comments x
  where x.parent_id = c.id;
  delete from public.flock_comments x where x.id = c.id;
  return;
end;
$$;


-- The purge (service role only; called by /api/public/hooks/flock-purge).
--
-- Held items whose 180 days are over, oldest first, each with the photo paths
-- to remove: its own, minus any a live post, comment, We tried it, idea or
-- event still uses, or another held item that isn't due yet.
create or replace function private.flock_purge_due(p_limit integer)
returns table (item_id uuid, paths text[])
language sql
stable
security definer
set search_path = ''
as $$
  select d.id,
         coalesce((
           select array_agg(x.path order by x.path)
           from unnest(d.photo_paths) as x(path)
           where not exists (select 1 from public.flock_posts p where x.path = any (p.photo_paths))
             and not exists (select 1 from public.flock_comments c where c.photo_path = x.path)
             and not exists (select 1 from public.flock_idea_tries t where t.photo_path = x.path)
             and not exists (select 1 from public.flock_ideas i where i.photo_path = x.path)
             and not exists (select 1 from public.flock_events e where e.photo_path = x.path)
             and not exists (select 1 from public.flock_deleted_items o
                             where o.id <> d.id and o.purge_after > now() and x.path = any (o.photo_paths))
         ), '{}')
  from public.flock_deleted_items d
  where d.purge_after <= now()
  order by d.purge_after, d.id
  limit least(greatest(coalesce(p_limit, 100), 1), 500);
$$;

-- Deletes held items for good, once their photos are gone. Only items whose
-- hold is over; anything else in p_ids is ignored. Returns how many went.
create or replace function private.flock_purge_done(p_ids uuid[])
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  delete from public.flock_deleted_items d
  where d.id = any (coalesce(p_ids, '{}')) and d.purge_after <= now();
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function private.flock_purge_due(integer) from public, anon, authenticated;
revoke all on function private.flock_purge_done(uuid[]) from public, anon, authenticated;
grant execute on function private.flock_purge_due(integer) to service_role;
grant execute on function private.flock_purge_done(uuid[]) to service_role;

create or replace function public.flock_purge_due(p_limit integer default 100)
returns table (item_id uuid, paths text[])
language sql
stable
security invoker
set search_path = ''
as $$ select * from private.flock_purge_due(p_limit) $$;

create or replace function public.flock_purge_done(p_ids uuid[])
returns integer
language sql
volatile
security invoker
set search_path = ''
as $$ select private.flock_purge_done(p_ids) $$;

revoke all on function public.flock_purge_due(integer) from public, anon, authenticated;
revoke all on function public.flock_purge_done(uuid[]) from public, anon, authenticated;
grant execute on function public.flock_purge_due(integer) to service_role;
grant execute on function public.flock_purge_done(uuid[]) to service_role;


-- The daily job, 04:23 UTC. Scheduled only on production (where the care
-- app's own jobs run): staging and preview branches would otherwise call
-- production's hook with their own token.
do $$
begin
  if to_regclass('cron.job') is null then
    raise notice 'pg_cron not installed; flock-deleted-purge-daily not scheduled';
    return;
  end if;
  if not exists (select 1 from cron.job where jobname = 'onboarding-emails-daily') then
    raise notice 'not production; flock-deleted-purge-daily not scheduled';
    return;
  end if;
  if not exists (select 1 from cron.job where jobname = 'flock-deleted-purge-daily') then
    perform cron.schedule(
      'flock-deleted-purge-daily',
      '23 4 * * *',
      $cmd$select private.call_cron_hook('/api/public/hooks/flock-purge', '{}'::jsonb)$cmd$);
  end if;
end;
$$;
