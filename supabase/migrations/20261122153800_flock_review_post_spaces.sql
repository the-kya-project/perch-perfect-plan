-- Backlog 0.5: the review queue shows each item's space.
--
-- flock_review_queue already returns a post id for a reported post and for a
-- reported comment on a post, but not which space the post is in. This adds a
-- separate lookup for that, so the queue can say "Learn together" or
-- "Great Lakes chapter". Additive only: no existing function, table or policy
-- changes.
--
-- Reviewers only (private.can_review: admins, and rows in flock_reviewers),
-- and only for posts that are in the queue right now: a pending post, or a
-- post with an open report on it or on one of its comments, by a member the
-- reviewer covers (private.reviewer_covers, the queue's own rule). Anyone
-- else gets no rows. Returns the space and, for a chapter post, the
-- chapter's name; nothing else about the post.

create or replace function private.flock_review_post_spaces(p_post_ids uuid[])
returns table (post_id uuid, space text, chapter_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.space, rg.name
  from public.flock_posts p
  left join public.regions rg on rg.slug = p.region_slug
  where private.can_review(auth.uid())
    and p.id = any(coalesce(p_post_ids, '{}'::uuid[]))
    and (
      (p.status = 'pending' and private.reviewer_covers(auth.uid(), p.author_id))
      or exists (
        select 1 from public.flock_reports r
        where r.resolved_at is null and r.subject_type = 'post' and r.subject_id = p.id
          and private.reviewer_covers(auth.uid(), p.author_id)
      )
      or exists (
        select 1 from public.flock_reports r
        join public.flock_comments c on c.id = r.subject_id
        where r.resolved_at is null and r.subject_type = 'comment'
          and c.subject_type = 'post' and c.subject_id = p.id
          and private.reviewer_covers(auth.uid(), c.author_id)
      )
    );
$$;

revoke all on function private.flock_review_post_spaces(uuid[]) from public, anon;
grant execute on function private.flock_review_post_spaces(uuid[]) to authenticated, service_role;

create or replace function public.flock_review_post_spaces(p_post_ids uuid[])
returns table (post_id uuid, space text, chapter_name text)
language sql stable security invoker set search_path = ''
as $$ select * from private.flock_review_post_spaces(p_post_ids); $$;

revoke all on function public.flock_review_post_spaces(uuid[]) from public, anon;
grant execute on function public.flock_review_post_spaces(uuid[]) to authenticated, service_role;
