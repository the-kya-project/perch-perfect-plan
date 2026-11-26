-- Co-carers read comments on their bird's journeys (backlog 1.20f).
--
-- A bird's household (owner or co-carer) sees and posts on that bird's
-- journeys, Flock member or not, but comments were Flock members only, so a
-- free co-carer couldn't read what members said on their own bird's updates
-- (Brittany, Nov 26, 2026, on #562). Now someone in the household reads them:
--
--   * flock_comments_for, flock_comment_counts and flock_media_refs (comment
--     photos) answer a non-member when the subject is a journey update or a
--     reached milestone of a bird they're in the household of. Every other
--     subject, and anyone outside the household, gets exactly what they got
--     before ("flock members only", or "not found").
--   * The comments shown are the ones everyone sees: live, from an author who
--     can still use the Flock, not hidden by moderation, not from someone
--     blocked either way, and a reply only while its top comment shows.
--   * Nothing else changes. Writing, editing, reacting, reporting and blocking
--     still go through flock_subject_visible, which needs a Flock member, so a
--     free co-carer can't do any of them; "Just me" journeys stay in the
--     household, because the household is the only one this path admits.
--
-- The three functions are rewritten from their live definitions (read from
-- production on Nov 26, 2026) with the household path added; their
-- flock_blocked lines are kept as they were.

-- 1) Who the household path admits -------------------------------------------

-- True when p_user_id is in the household of the bird whose journey update or
-- reached milestone this is. Only those two subjects; never a post.
create or replace function private.flock_household_subject(p_user_id uuid, p_type text, p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user_id is not null and case
    when p_type = 'journey_update' then exists (
      select 1 from public.journey_updates u join public.journeys j on j.id = u.journey_id
      where u.id = p_id and private.has_bird_access(j.bird_id, p_user_id) is not null)
    when p_type = 'journey_milestone' then exists (
      select 1 from public.journey_milestones m join public.journeys j on j.id = m.journey_id
      where m.id = p_id and m.state = 'reached' and private.has_bird_access(j.bird_id, p_user_id) is not null)
    else false
  end;
$$;

-- True when this comment is one flock_comments_for shows p_user_id through the
-- household path: on their bird's journey, and visible by the usual rules
-- (its top comment too, for a reply).
create or replace function private.flock_household_comment(p_user_id uuid, p_comment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.flock_comments c
    where c.id = p_comment_id
      and private.flock_household_subject(p_user_id, c.subject_type, c.subject_id)
      and (c.author_id = p_user_id
           or (c.status = 'live' and private.can_use_flock(c.author_id) and not private.flock_blocked(p_user_id, c.author_id) and not private.flock_is_hidden('comment', c.id)))
      and (c.parent_id is null or exists (
            select 1 from public.flock_comments pc where pc.id = c.parent_id
              and (pc.author_id = p_user_id
                   or (pc.status = 'live' and private.can_use_flock(pc.author_id) and not private.flock_blocked(p_user_id, pc.author_id) and not private.flock_is_hidden('comment', pc.id))))));
$$;

revoke all on function private.flock_household_subject(uuid, text, uuid) from public, anon;
revoke all on function private.flock_household_comment(uuid, uuid) from public, anon;
grant execute on function private.flock_household_subject(uuid, text, uuid) to authenticated, service_role;
grant execute on function private.flock_household_comment(uuid, uuid) to authenticated, service_role;


-- 2) Comments on a subject ------------------------------------------------------

create or replace function private.flock_comments_for(p_subject_type text, p_subject_id uuid)
returns table (
  comment_id uuid, parent_id uuid, author_id uuid, author_name text, author_region text, author_photo_path text,
  reply_to_name text, body text, has_photo boolean, created_at timestamptz, edited_at timestamptz, is_mine boolean,
  great_job integer, been_there integer, rooting_for_you integer, love_this integer, mine text[]
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  -- The bird's household reads its journeys' comments, member or not (1.20f).
  if not private.flock_household_subject(auth.uid(), p_subject_type, p_subject_id) then
    perform private.assert_can_use_flock();
    if p_subject_type not in ('post', 'journey_update', 'journey_milestone')
       or not private.flock_subject_visible(auth.uid(), p_subject_type, p_subject_id) then
      raise exception 'not found' using errcode = 'P0002';
    end if;
  end if;
  return query
    select c.id, c.parent_id, c.author_id, fp.display_name, ar.name, fp.photo_path,
           case when private.flock_blocked(auth.uid(), c.reply_to_user) then null else rp.display_name end, c.body, c.photo_path is not null, c.created_at, c.edited_at, c.author_id = auth.uid(),
           coalesce(rx.great_job, 0), coalesce(rx.been_there, 0), coalesce(rx.rooting_for_you, 0), coalesce(rx.love_this, 0),
           coalesce(rx.mine, '{}')
    from public.flock_comments c
    left join public.flock_profiles fp on fp.user_id = c.author_id
    left join public.regions ar on ar.slug = fp.region_slug
    left join public.flock_profiles rp on rp.user_id = c.reply_to_user
    left join lateral (
      select count(*) filter (where r.kind = 'great_job')::integer as great_job,
             count(*) filter (where r.kind = 'been_there')::integer as been_there,
             count(*) filter (where r.kind = 'rooting_for_you')::integer as rooting_for_you,
             count(*) filter (where r.kind = 'love_this')::integer as love_this,
             array_agg(r.kind order by r.kind) filter (where r.user_id = auth.uid()) as mine
      from public.flock_reactions r where r.subject_type = 'comment' and r.subject_id = c.id
        and not private.flock_blocked(auth.uid(), r.user_id)
    ) rx on true
    where c.subject_type = p_subject_type and c.subject_id = p_subject_id
      and (c.author_id = auth.uid()
           or (c.status = 'live' and private.can_use_flock(c.author_id) and not private.flock_blocked(auth.uid(), c.author_id) and not private.flock_is_hidden('comment', c.id)))
      -- A reply shows only while its thread's top comment does.
      and (c.parent_id is null or exists (
            select 1 from public.flock_comments pc where pc.id = c.parent_id
              and (pc.author_id = auth.uid()
                   or (pc.status = 'live' and private.can_use_flock(pc.author_id) and not private.flock_blocked(auth.uid(), pc.author_id) and not private.flock_is_hidden('comment', pc.id)))))
    order by c.created_at, c.id;
end;
$$;


-- 3) Comment counts ---------------------------------------------------------------

-- A non-member gets counts only for their own birds' journey updates and
-- milestones; asking about nothing of theirs is refused as before.
create or replace function private.flock_comment_counts(p_subject_type text, p_ids uuid[])
returns table (subject_id uuid, comment_count integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.can_use_flock(auth.uid()) then
    if not exists (select 1 from unnest(coalesce(p_ids, '{}')) as s(id)
                   where private.flock_household_subject(auth.uid(), p_subject_type, s.id)) then
      perform private.assert_can_use_flock();
    end if;
    return query
      select s.id, (select count(*)::integer from public.flock_comments c
                    where c.subject_type = p_subject_type and c.subject_id = s.id and c.status = 'live' and not private.flock_blocked(auth.uid(), c.author_id))
      from unnest(coalesce(p_ids, '{}')) as s(id)
      where cardinality(p_ids) <= 200
        and private.flock_household_subject(auth.uid(), p_subject_type, s.id);
    return;
  end if;
  return query
    select s.id, (select count(*)::integer from public.flock_comments c
                  where c.subject_type = p_subject_type and c.subject_id = s.id and c.status = 'live' and not private.flock_blocked(auth.uid(), c.author_id))
    from unnest(coalesce(p_ids, '{}')) as s(id)
    where cardinality(p_ids) <= 200
      and private.flock_subject_visible(auth.uid(), p_subject_type, s.id);
end;
$$;


-- 4) Comment photos -----------------------------------------------------------------

-- A non-member gets the photo paths of comments they read through the household
-- path, and nothing for posts; asking for anything else is refused as before.
create or replace function private.flock_media_refs(p_post_ids uuid[], p_comment_ids uuid[])
returns table (subject_type text, subject_id uuid, idx integer, path text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.can_use_flock(auth.uid()) then
    if cardinality(coalesce(p_post_ids, '{}')) > 0
       or not exists (select 1 from unnest(coalesce(p_comment_ids, '{}')) as i(id)
                      where private.flock_household_comment(auth.uid(), i.id)) then
      perform private.assert_can_use_flock();
    end if;
    return query
      select 'comment'::text, c.id, 0, c.photo_path
      from public.flock_comments c
      where c.id = any (coalesce(p_comment_ids, '{}')) and c.photo_path is not null
        and private.flock_household_comment(auth.uid(), c.id);
    return;
  end if;
  return query
    select 'post'::text, p.id, (x.ord - 1)::integer, x.path
    from public.flock_posts p
    cross join lateral unnest(p.photo_paths) with ordinality as x(path, ord)
    where p.id = any (coalesce(p_post_ids, '{}')) and private.flock_post_visible(auth.uid(), p.id)
    union all
    select 'comment'::text, c.id, 0, c.photo_path
    from public.flock_comments c
    where c.id = any (coalesce(p_comment_ids, '{}')) and c.photo_path is not null
      and private.flock_subject_visible(auth.uid(), 'comment', c.id);
end;
$$;
