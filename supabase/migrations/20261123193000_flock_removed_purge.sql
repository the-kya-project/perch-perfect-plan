-- Backlog 1.4 (legal draft D9): content a reviewer removed, and closed
-- reports, are kept for 180 days after they were resolved, then deleted.
--
-- How: the daily job from 1.3 (`flock-deleted-purge-daily` →
-- /api/public/hooks/flock-purge) first calls flock_moderation_purge(). For each
-- post or comment a reviewer removed (flock_moderation.state = 'removed') at
-- least 180 days ago, it moves the item, and the comments under it, into
-- flock_deleted_items exactly as deleting it would (1.3), already due, and
-- deletes it. The same run's purge then removes their photos through the
-- Storage API and deletes the held items, with 1.3's rules: a photo something
-- else still uses is kept, and an item whose photos fail to delete waits for
-- the next run. The moderation row goes too. Reports closed (kept or removed)
-- at least 180 days ago are deleted.
--
-- Left as they are: removed journey updates (they still show to the bird's
-- household; the update and its clip wait for Brittany's call, see the PR),
-- content waiting for review ('hidden'), and open reports.
--
-- Additive only: two new functions. No existing table, policy, trigger or
-- function changes, and no data changes until the job runs.
--
-- Pinned by supabase/checks/flock_moderation_checks.sql.

-- How long removed content and closed reports are kept (D9).
create or replace function private.flock_removed_hold()
returns interval
language sql
immutable
set search_path = ''
as $$ select interval '180 days' $$;

revoke all on function private.flock_removed_hold() from public, anon, authenticated;
grant execute on function private.flock_removed_hold() to service_role;


-- Service role only (called by /api/public/hooks/flock-purge). Returns how
-- many removed posts and comments were moved to the purge, and how many closed
-- reports were deleted; with p_dry_run, how many would be, changing nothing.
create or replace function private.flock_moderation_purge(p_dry_run boolean)
returns table (posts integer, comments integer, reports integer)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_cut timestamptz := now() - private.flock_removed_hold();
  m record;
  p public.flock_posts;
  c public.flock_comments;
  v_held uuid;
  v_until timestamptz;
  n_posts integer := 0;
  n_comments integer := 0;
  n_reports integer := 0;
begin
  -- Removed posts, with every comment on them. Posts first, so a removed
  -- comment on a removed post goes with its post.
  for m in
    select x.subject_id, x.updated_at from public.flock_moderation x
    where x.subject_type = 'post' and x.state = 'removed' and x.updated_at <= v_cut
    order by x.updated_at
  loop
    select * into p from public.flock_posts x where x.id = m.subject_id;
    if p.id is not null then
      n_posts := n_posts + 1;
      if not coalesce(p_dry_run, false) then
        v_until := m.updated_at + private.flock_removed_hold();
        insert into public.flock_deleted_items (kind, original_id, author_id, row_data, photo_paths, purge_after)
        values ('post', p.id, p.author_id, to_jsonb(p), p.photo_paths, v_until)
        returning id into v_held;
        insert into public.flock_deleted_items (kind, original_id, author_id, held_with, row_data, photo_paths, purge_after)
        select 'comment', x.id, x.author_id, v_held, to_jsonb(x),
               case when x.photo_path is null then '{}'::text[] else array[x.photo_path] end, v_until
        from public.flock_comments x
        where x.subject_type = 'post' and x.subject_id = p.id;
        delete from public.flock_posts x where x.id = p.id;
      end if;
    end if;
    if not coalesce(p_dry_run, false) then
      delete from public.flock_moderation x where x.subject_type = 'post' and x.subject_id = m.subject_id;
    end if;
  end loop;

  -- Removed comments, with their replies.
  for m in
    select x.subject_id, x.updated_at from public.flock_moderation x
    where x.subject_type = 'comment' and x.state = 'removed' and x.updated_at <= v_cut
    order by x.updated_at
  loop
    select * into c from public.flock_comments x where x.id = m.subject_id;
    -- In a dry run, a comment on a removed post counted above isn't counted twice.
    if c.id is not null and not (coalesce(p_dry_run, false) and c.subject_type = 'post' and exists (
         select 1 from public.flock_moderation y
         where y.subject_type = 'post' and y.subject_id = c.subject_id and y.state = 'removed' and y.updated_at <= v_cut)) then
      n_comments := n_comments + 1;
      if not coalesce(p_dry_run, false) then
        v_until := m.updated_at + private.flock_removed_hold();
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
      end if;
    end if;
    if not coalesce(p_dry_run, false) then
      delete from public.flock_moderation x where x.subject_type = 'comment' and x.subject_id = m.subject_id;
    end if;
  end loop;

  -- Closed reports.
  if coalesce(p_dry_run, false) then
    select count(*)::integer into n_reports from public.flock_reports r
    where r.resolved_at is not null and r.resolved_at <= v_cut;
  else
    delete from public.flock_reports r where r.resolved_at is not null and r.resolved_at <= v_cut;
    get diagnostics n_reports = row_count;
  end if;

  return query select n_posts, n_comments, n_reports;
end;
$$;

revoke all on function private.flock_moderation_purge(boolean) from public, anon, authenticated;
grant execute on function private.flock_moderation_purge(boolean) to service_role;

create or replace function public.flock_moderation_purge(p_dry_run boolean default false)
returns table (posts integer, comments integer, reports integer)
language sql
volatile
security invoker
set search_path = ''
as $$ select * from private.flock_moderation_purge(p_dry_run) $$;

revoke all on function public.flock_moderation_purge(boolean) from public, anon, authenticated;
grant execute on function public.flock_moderation_purge(boolean) to service_role;
