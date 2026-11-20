-- Flock member blocking (payments plan build D; Apple guideline 1.2).
--
-- A member blocks another member. Blocking works both ways: once either has
-- blocked the other, neither sees the other's posts, comments, replies,
-- reactions, journeys, journey updates, profile, birds or notifications
-- anywhere in the Flock, and neither can comment on, react to or follow the
-- other's things (those writes already require the thing to be visible).
-- Nothing is deleted: rows stay, hidden, and come back on unblock. The blocked
-- person is never told.
--
-- What it never touches:
--   - Moderation. The review queue, reports and resolutions don't read blocks.
--     A report filed after a block still works (flock_report checks visibility
--     with blocks set aside), and review/notice notifications always arrive.
--   - A bird's household. Co-carers of the same bird keep seeing that bird's
--     journeys and updates; blocking is about the community, never care.
--   - Chapter events. Both people still see and RSVP to a chapter's event;
--     they just don't appear in each other's "who's going" list. Going/maybe
--     counts stay true numbers (the spot limit depends on them).
--   - The care app and free users: everything here is behind the Flock.
--
-- How: one table, one predicate (private.flock_blocked), and the predicate
-- added to the visibility functions every Flock screen reads through. The
-- existing functions are rewritten from their live definitions with exact
-- text replacements (as 20261120150000 did), so nothing else in them can be
-- reverted; each replacement must match, or the migration stops.
-- flock_profiles' member read policy and the flock-avatars read policy also
-- leave blocked members out, so a direct database or storage call can't get
-- around it. Account deletion removes block rows (foreign keys cascade).
--
-- Pinned by supabase/checks/flock_blocking_checks.sql.

-- 1) The table ----------------------------------------------------------------
create table if not exists public.flock_blocks (
  blocker_id uuid not null references auth.users (id) on delete cascade,
  blocked_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint flock_blocks_not_self check (blocker_id <> blocked_id)
);
create index if not exists flock_blocks_blocked_idx on public.flock_blocks (blocked_id, blocker_id);

alter table public.flock_blocks enable row level security;
revoke all on public.flock_blocks from anon, authenticated;
grant select on public.flock_blocks to authenticated;
-- The server runs as service_role (RLS bypassed, table privileges not).
grant select, insert, update, delete on public.flock_blocks to service_role;
drop policy if exists "flock_blocks own read" on public.flock_blocks;
-- Your own blocks only. Nobody can see who blocked them. Writes go through
-- flock_block().
create policy "flock_blocks own read" on public.flock_blocks for select to authenticated
  using (blocker_id = (select auth.uid()));

-- 2) The predicate --------------------------------------------------------------
-- True when either person has blocked the other. False for a missing or
-- identical person, and while flock_report checks visibility (the setting
-- kya.flock_ignore_blocks is set only inside private.flock_visible_ignoring_blocks).
create or replace function private.flock_blocked(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_a is not null and p_b is not null and p_a <> p_b
     and coalesce(current_setting('kya.flock_ignore_blocks', true), '') <> 'on'
     and exists (
       select 1 from public.flock_blocks b
       where (b.blocker_id = p_a and b.blocked_id = p_b)
          or (b.blocker_id = p_b and b.blocked_id = p_a)
     );
$$;
revoke all on function private.flock_blocked(uuid, uuid) from public, anon;
-- Row-level policies call it as the signed-in user; the private schema isn't
-- exposed to the API, so clients can't call it themselves.
grant execute on function private.flock_blocked(uuid, uuid) to authenticated;

-- Storage paths start with a user id; anything that isn't one is never "blocked".
create or replace function private.flock_blocked_folder(p_viewer uuid, p_folder text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_folder is null or p_folder !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  return private.flock_blocked(p_viewer, p_folder::uuid);
end;
$$;
revoke all on function private.flock_blocked_folder(uuid, text) from public, anon;
grant execute on function private.flock_blocked_folder(uuid, text) to authenticated;

-- Visibility with blocks set aside, for reports only.
create or replace function private.flock_visible_ignoring_blocks(p_user_id uuid, p_type text, p_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v boolean;
begin
  perform set_config('kya.flock_ignore_blocks', 'on', true);
  v := private.flock_subject_visible(p_user_id, p_type, p_id);
  perform set_config('kya.flock_ignore_blocks', '', true);
  return v;
exception when others then
  perform set_config('kya.flock_ignore_blocks', '', true);
  raise;
end;
$$;
revoke all on function private.flock_visible_ignoring_blocks(uuid, text, uuid) from public, anon, authenticated;

-- 3) Block, unblock, and your list ---------------------------------------------
create or replace function private.flock_block(p_user_id uuid, p_on boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
begin
  perform private.assert_can_use_flock();
  if p_user_id is null or p_user_id = v_me then
    raise exception 'you can''t block yourself' using errcode = '22023';
  end if;
  if coalesce(p_on, true) then
    if not exists (select 1 from public.flock_profiles fp where fp.user_id = p_user_id) then
      raise exception 'member not found' using errcode = 'P0002';
    end if;
    insert into public.flock_blocks (blocker_id, blocked_id) values (v_me, p_user_id)
    on conflict do nothing;
  else
    delete from public.flock_blocks where blocker_id = v_me and blocked_id = p_user_id;
  end if;
end;
$$;
revoke all on function private.flock_block(uuid, boolean) from public, anon;
grant execute on function private.flock_block(uuid, boolean) to authenticated;

create or replace function public.flock_block(p_user_id uuid, p_on boolean default true)
returns void
language sql
security invoker
set search_path = ''
as $$ select private.flock_block(p_user_id, p_on); $$;
revoke all on function public.flock_block(uuid, boolean) from public, anon;
grant execute on function public.flock_block(uuid, boolean) to authenticated;

-- Who you've blocked, newest first, with the name and photo you need to
-- recognise them and unblock. Only ever your own blocks.
create or replace function private.flock_my_blocks()
returns table (user_id uuid, display_name text, photo_path text, blocked_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.assert_can_use_flock();
  return query
    select b.blocked_id, fp.display_name, fp.photo_path, b.created_at
    from public.flock_blocks b
    left join public.flock_profiles fp on fp.user_id = b.blocked_id
    where b.blocker_id = auth.uid()
    order by b.created_at desc;
end;
$$;
revoke all on function private.flock_my_blocks() from public, anon;
grant execute on function private.flock_my_blocks() to authenticated;

create or replace function public.flock_my_blocks()
returns table (user_id uuid, display_name text, photo_path text, blocked_at timestamptz)
language sql
stable
security invoker
set search_path = ''
as $$ select * from private.flock_my_blocks(); $$;
revoke all on function public.flock_my_blocks() from public, anon;
grant execute on function public.flock_my_blocks() to authenticated;

-- A blocked member's avatar can't be signed either.
create or replace function private.flock_avatar_readable(p_viewer uuid, p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.can_use_flock(p_viewer)
     and not private.flock_blocked_folder(p_viewer, (storage.foldername(p_name))[1]);
$$;
revoke all on function private.flock_avatar_readable(uuid, text) from public, anon;
grant execute on function private.flock_avatar_readable(uuid, text) to authenticated;

-- 4) The existing functions, each rewritten from its live definition ----------
create or replace function private.flock_block_patch(p_sig text, p_pairs text[])
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_def text := pg_get_functiondef(p_sig::regprocedure);
  i integer;
begin
  if array_length(p_pairs, 1) % 2 <> 0 then
    raise exception 'flock_block_patch(%): pairs must come in twos', p_sig;
  end if;
  for i in 1 .. array_length(p_pairs, 1) by 2 loop
    if position(p_pairs[i] in v_def) = 0 then
      raise exception 'flock_block_patch(%): anchor not found: %', p_sig, p_pairs[i];
    end if;
    v_def := replace(v_def, p_pairs[i], p_pairs[i + 1]);
  end loop;
  execute v_def;
end;
$$;

-- Posts: a blocked author's posts are invisible (feeds, single post, counts,
-- photos, comments and reactions on them, reports aside).
select private.flock_block_patch('private.flock_post_visible(uuid, uuid)', array[
  'and private.can_use_flock(p.author_id)',
  'and private.can_use_flock(p.author_id)
            and not private.flock_blocked(p_user_id, p.author_id)'
]);

-- Comments and journey updates by a blocked person (a bird's household
-- always sees its own bird's updates).
select private.flock_block_patch('private.flock_subject_visible(uuid, text, uuid)', array[
  'and (not private.flock_is_hidden(''journey_update'', p_id)',
  'and (not private.flock_blocked(p_user_id, v_author) or private.has_bird_access(v_bird, p_user_id) is not null)
       and (not private.flock_is_hidden(''journey_update'', p_id)',
  '(c.status = ''live'' and private.can_use_flock(c.author_id)',
  '(c.status = ''live'' and private.can_use_flock(c.author_id) and not private.flock_blocked(p_user_id, c.author_id)'
]);

-- Journeys: a community journey started by, or on a bird owned by, a blocked
-- person (household access unchanged).
select private.flock_block_patch('private.journey_viewable(uuid, uuid)', array[
  'and private.can_use_flock(j.created_by)',
  'and private.can_use_flock(j.created_by)
            and not private.flock_blocked(p_user_id, j.created_by)
            and not private.flock_blocked(p_user_id, (select bo.owner_id from public.birds bo where bo.id = j.bird_id))'
]);

-- Post cards: comment and reaction counts leave out blocked people.
select private.flock_block_patch('private.flock_post_rows(uuid)', array[
  'where c.subject_type = ''post'' and c.subject_id = p.id and c.status = ''live'')',
  'where c.subject_type = ''post'' and c.subject_id = p.id and c.status = ''live''
            and not private.flock_blocked(p_user_id, c.author_id))',
  'from public.flock_reactions r where r.subject_type = ''post'' and r.subject_id = p.id',
  'from public.flock_reactions r where r.subject_type = ''post'' and r.subject_id = p.id
      and not private.flock_blocked(p_user_id, r.user_id)'
]);

select private.flock_block_patch('private.flock_comment_counts(text, uuid[])', array[
  'and c.status = ''live'')',
  'and c.status = ''live'' and not private.flock_blocked(auth.uid(), c.author_id))'
]);

-- Comment threads: a blocked person's comments and replies, replies under a
-- blocked person's comment, their name in "Replying to", their reactions.
select private.flock_block_patch('private.flock_comments_for(text, uuid)', array[
  '(c.status = ''live'' and private.can_use_flock(c.author_id)',
  '(c.status = ''live'' and private.can_use_flock(c.author_id) and not private.flock_blocked(auth.uid(), c.author_id)',
  '(pc.status = ''live'' and private.can_use_flock(pc.author_id)',
  '(pc.status = ''live'' and private.can_use_flock(pc.author_id) and not private.flock_blocked(auth.uid(), pc.author_id)',
  'rp.display_name, c.body',
  'case when private.flock_blocked(auth.uid(), c.reply_to_user) then null else rp.display_name end, c.body',
  'from public.flock_reactions r where r.subject_type = ''comment'' and r.subject_id = c.id',
  'from public.flock_reactions r where r.subject_type = ''comment'' and r.subject_id = c.id
        and not private.flock_blocked(auth.uid(), r.user_id)'
]);

-- People lists.
select private.flock_block_patch('private.flock_reactors(text, uuid)', array[
  'and private.can_use_flock(r.user_id)',
  'and private.can_use_flock(r.user_id) and not private.flock_blocked(auth.uid(), r.user_id)'
]);
select private.flock_block_patch('private.flock_member_profile(uuid)', array[
  'and private.can_use_flock(p.user_id)',
  'and private.can_use_flock(p.user_id) and not private.flock_blocked(auth.uid(), p.user_id)'
]);
select private.flock_block_patch('private.flock_visible_birds(uuid[], uuid[])', array[
  'and private.can_use_flock(s.user_id)',
  'and private.can_use_flock(s.user_id) and not private.flock_blocked(auth.uid(), s.user_id)'
]);
select private.flock_block_patch('private.flock_chapter_members(text)', array[
  'and private.can_use_flock(p.user_id)',
  'and private.can_use_flock(p.user_id) and not private.flock_blocked(auth.uid(), p.user_id)'
]);
select private.flock_block_patch('private.flock_chapter_roster(text)', array[
  'and private.can_use_flock(p.user_id)',
  'and private.can_use_flock(p.user_id) and not private.flock_blocked(auth.uid(), p.user_id)'
]);

-- Chapter events: the "who's going" faces leave out blocked people.
select private.flock_block_patch('private.flock_event(uuid)', array[
  'and private.can_use_flock(r.user_id)',
  'and private.can_use_flock(r.user_id) and not private.flock_blocked(auth.uid(), r.user_id)'
]);

-- Journey cards: follower counts.
select private.flock_block_patch('private.journey_card_rows(uuid)', array[
  '(select count(*)::integer from public.journey_follows f where f.journey_id = j.id),',
  '(select count(*)::integer from public.journey_follows f where f.journey_id = j.id
           and not private.flock_blocked(p_user_id, f.user_id)),'
]);

-- Journey updates: a blocked household member's updates on a community
-- journey, and blocked people's reactions.
select private.flock_block_patch('private.journey_view_updates(uuid)', array[
  'where u.journey_id = p_journey_id',
  'where u.journey_id = p_journey_id
      and (not private.flock_blocked(auth.uid(), u.author_id) or private.has_bird_access(u.bird_id, auth.uid()) is not null)',
  'from public.flock_reactions r where r.subject_type = ''journey_update'' and r.subject_id = u.id and r.kind',
  'from public.flock_reactions r where r.subject_type = ''journey_update'' and r.subject_id = u.id and not private.flock_blocked(auth.uid(), r.user_id) and r.kind'
]);
select private.flock_block_patch('private.journey_milestone_cards(integer)', array[
  'where uu.journey_id = c.journey_id',
  'where uu.journey_id = c.journey_id
        and (not private.flock_blocked(auth.uid(), uu.author_id) or private.has_bird_access(uu.bird_id, auth.uid()) is not null)',
  'from public.flock_reactions r where r.subject_type = ''journey_milestone'' and r.subject_id = m.id and r.kind',
  'from public.flock_reactions r where r.subject_type = ''journey_milestone'' and r.subject_id = m.id and not private.flock_blocked(auth.uid(), r.user_id) and r.kind'
]);
select private.flock_block_patch('private.journey_clip_refs(uuid, uuid[])', array[
  'where u.journey_id = p_journey_id and u.clip_ref is not null',
  'where u.journey_id = p_journey_id and u.clip_ref is not null
      and (not private.flock_blocked(auth.uid(), u.author_id) or private.has_bird_access(u.bird_id, auth.uid()) is not null)'
]);
select private.flock_block_patch('private.journey_finisher_tips_for(text)', array[
  'and f.author_id <> auth.uid()',
  'and f.author_id <> auth.uid()
        and not private.flock_blocked(auth.uid(), f.author_id)'
]);

-- Today's idea: "We tried it" photos and their count.
select private.flock_block_patch('private.flock_idea_media_refs(uuid)', array[
  'and private.can_use_flock(t.user_id)',
  'and private.can_use_flock(t.user_id) and not private.flock_blocked(auth.uid(), t.user_id)'
]);
select private.flock_block_patch('private.flock_todays_idea()', array[
  'and private.can_use_flock(t.user_id)',
  'and private.can_use_flock(t.user_id) and not private.flock_blocked(auth.uid(), t.user_id)'
]);

-- Notifications: none written from a blocked person, and older ones from them
-- drop out of the list. Review and notice (the Kya team) always arrive.
select private.flock_block_patch('private.flock_notify(uuid, text, uuid, text, uuid, text, text)', array[
  'if not private.flock_subject_visible(p_user, p_type, p_id) then return; end if;',
  'if not private.flock_subject_visible(p_user, p_type, p_id) then return; end if;
  if p_kind not in (''review'', ''notice'') and private.flock_blocked(p_user, p_actor) then return; end if;'
]);
select private.flock_block_patch('private.flock_notifications_list(text, integer)', array[
  'and n.created_at > now() - interval ''60 days''',
  'and n.created_at > now() - interval ''60 days''
      and (n.kind in (''review'', ''notice'') or not private.flock_blocked(auth.uid(), n.actor_id))'
]);

-- Reports work before and after a block.
select private.flock_block_patch('private.flock_report(text, uuid, text, text)', array[
  'or not private.flock_subject_visible(auth.uid(), p_subject_type, p_subject_id) then',
  'or not private.flock_visible_ignoring_blocks(auth.uid(), p_subject_type, p_subject_id) then'
]);

drop function private.flock_block_patch(text, text[]);

-- 5) Direct reads ---------------------------------------------------------------
-- Members could read every Flock profile directly; now not a blocked one.
drop policy if exists "flock_profiles read" on public.flock_profiles;
create policy "flock_profiles read" on public.flock_profiles for select to authenticated
  using (user_id = (select auth.uid())
         or (private.is_flock_member((select auth.uid()))
             and not private.flock_blocked((select auth.uid()), user_id)));

drop policy if exists "flock-avatars flock read" on storage.objects;
create policy "flock-avatars flock read" on storage.objects for select to authenticated
  using (bucket_id = 'flock-avatars' and private.flock_avatar_readable(auth.uid(), name));
