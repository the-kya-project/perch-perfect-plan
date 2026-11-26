-- Backlog 1.20f: a bird's household reads the comments on that bird's
-- journeys, even without a Flock membership (Brittany, Nov 26, 2026: "free
-- household co-carers should be able to read, but not write, comments on their
-- own bird's journeys").
--
-- Reading only. Every write stays Flock-only and is untouched:
-- flock_comment_create/edit/delete, flock_react and flock_report all still
-- call assert_can_use_flock() and flock_subject_visible(), which this
-- migration doesn't change. Nobody outside the household gains anything:
-- the new check needs bird access (owner or household) AND journey_viewable
-- (so journeys must be on for them, journeys_enabled()).
--
-- Three reads are rewritten from their live definitions (pg_get_functiondef
-- on production, Nov 26, 2026). The only change in each is the gate at the top
-- and one "or private.flock_household_reads(...)" next to the existing
-- visibility check; the comment filters (live, author still in the Flock,
-- blocks, moderation, replies only under a shown top comment) are unchanged.
--   private.flock_comments_for    the comment list
--   private.flock_comment_counts  the counts on Today's cards and the story
--   private.flock_media_refs      comment photos (signed on the server)
-- The public wrappers call these and are unchanged.

-- 1) Does this person read comments on this subject as the bird's household?
--    journey_update / journey_milestone (reached) on a bird they can access,
--    on a journey they may view; 'comment' = a shown comment on such a subject.
create or replace function private.flock_household_reads(p_user_id uuid, p_type text, p_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_journey uuid;
  v_bird uuid;
  c public.flock_comments;
begin
  if p_user_id is null or p_id is null then
    return false;
  end if;
  if p_type = 'journey_update' then
    select u.journey_id, u.bird_id into v_journey, v_bird from public.journey_updates u where u.id = p_id;
  elsif p_type = 'journey_milestone' then
    select m.journey_id, j.bird_id into v_journey, v_bird
    from public.journey_milestones m join public.journeys j on j.id = m.journey_id
    where m.id = p_id and m.state = 'reached';
  elsif p_type = 'comment' then
    select * into c from public.flock_comments x where x.id = p_id;
    if c.id is null then return false; end if;
    return (c.author_id = p_user_id
            or (c.status = 'live' and private.can_use_flock(c.author_id) and not private.flock_blocked(p_user_id, c.author_id) and not private.flock_is_hidden('comment', c.id)))
       and c.subject_type in ('journey_update', 'journey_milestone')
       and private.flock_household_reads(p_user_id, c.subject_type, c.subject_id);
  else
    return false;
  end if;
  return v_journey is not null
     and private.has_bird_access(v_bird, p_user_id) is not null
     and private.journey_viewable(p_user_id, v_journey);
end;
$$;

revoke all on function private.flock_household_reads(uuid, text, uuid) from public, anon, authenticated;

-- 2) The comment list.
create or replace function private.flock_comments_for(p_subject_type text, p_subject_id uuid)
 RETURNS TABLE(comment_id uuid, parent_id uuid, author_id uuid, author_name text, author_region text, author_photo_path text, reply_to_name text, body text, has_photo boolean, created_at timestamp with time zone, edited_at timestamp with time zone, is_mine boolean, great_job integer, been_there integer, rooting_for_you integer, love_this integer, mine text[])
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  -- 1.20f: a bird's household reads its journeys' comments without the Flock.
  if not private.can_use_flock(auth.uid())
     and not private.flock_household_reads(auth.uid(), p_subject_type, p_subject_id) then
    raise exception 'flock members only' using errcode = '42501';
  end if;
  if p_subject_type not in ('post', 'journey_update', 'journey_milestone')
     or not (private.flock_subject_visible(auth.uid(), p_subject_type, p_subject_id)
             or private.flock_household_reads(auth.uid(), p_subject_type, p_subject_id)) then
    raise exception 'not found' using errcode = 'P0002';
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
$function$;

-- 3) Counts on Today's cards and the story viewer.
create or replace function private.flock_comment_counts(p_subject_type text, p_ids uuid[])
 RETURNS TABLE(subject_id uuid, comment_count integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  -- 1.20f: journeys' counts for a bird's household, without the Flock.
  if not private.can_use_flock(auth.uid())
     and not (p_subject_type in ('journey_update', 'journey_milestone') and private.can_use_journeys(auth.uid())) then
    raise exception 'flock members only' using errcode = '42501';
  end if;
  return query
    select s.id, (select count(*)::integer from public.flock_comments c
                  where c.subject_type = p_subject_type and c.subject_id = s.id and c.status = 'live' and not private.flock_blocked(auth.uid(), c.author_id))
    from unnest(coalesce(p_ids, '{}')) as s(id)
    where cardinality(p_ids) <= 200
      and (private.flock_subject_visible(auth.uid(), p_subject_type, s.id)
           or private.flock_household_reads(auth.uid(), p_subject_type, s.id));
end;
$function$;

-- 4) Comment photos. Posts stay Flock-only (a non-member gets none).
create or replace function private.flock_media_refs(p_post_ids uuid[], p_comment_ids uuid[])
 RETURNS TABLE(subject_type text, subject_id uuid, idx integer, path text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  -- 1.20f: comment photos for a bird's household, without the Flock. Asking
  -- for any post's photos without the Flock is still refused, as before.
  if not private.can_use_flock(auth.uid())
     and (coalesce(cardinality(p_post_ids), 0) > 0 or not private.can_use_journeys(auth.uid())) then
    raise exception 'flock members only' using errcode = '42501';
  end if;
  return query
    select 'post'::text, p.id, (x.ord - 1)::integer, x.path
    from public.flock_posts p
    cross join lateral unnest(p.photo_paths) with ordinality as x(path, ord)
    where p.id = any (coalesce(p_post_ids, '{}')) and private.can_use_flock(auth.uid()) and private.flock_post_visible(auth.uid(), p.id)
    union all
    select 'comment'::text, c.id, 0, c.photo_path
    from public.flock_comments c
    where c.id = any (coalesce(p_comment_ids, '{}')) and c.photo_path is not null
      and (private.flock_subject_visible(auth.uid(), 'comment', c.id)
           or private.flock_household_reads(auth.uid(), 'comment', c.id));
end;
$function$;
