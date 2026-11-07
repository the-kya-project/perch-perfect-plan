-- The Flock, step 4 (PR A): posts, comments, reactions, the vet nudge and
-- rate limits. Additive only: new tables, a new private bucket, new functions.
-- The one change to an existing table is widening flock_reactions'
-- subject_type check (a Flock table from step 3, built to be reused here) to
-- take 'post' and 'comment'. No care-app table, policy, trigger or function
-- changes.
--
-- Who sees a post (private.flock_post_visible):
--   * its author, always (a Do good post waiting for review included);
--   * other Flock members (and admins) only when it is 'live', its author can
--     still use the Flock, and, for a chapter post, the viewer is in that
--     chapter (their profile's region).
--   Do good posts start as 'pending' and stay invisible to everyone else until
--   approved (the review queue comes in PR B). Everything else is live at once.
-- Comments: on posts, journey updates and reached milestones; threaded one
-- level deep. Read and written only by people who can use the Flock and can
-- see the subject (a "Just me" journey never reaches anyone outside the bird's
-- household, so neither do its comments or reactions).
-- Photos: private 'flock-posts' bucket, "<user_id>/<uuid>.jpg". The app
-- re-encodes every photo to JPEG in the browser (drops EXIF, GPS included).
-- Nobody but the uploader can read the bucket directly; viewers get one-hour
-- signed links from the server, and only for posts and comments they may see
-- (flock_media_refs, src/lib/flockPostMedia.functions.ts).
-- Config you can edit (dashboard table editor, or the admin functions below):
--   flock_community_limits: posts, comments and photos per member per hour;
--   flock_vet_signs: the phrases that bring up the vet nudge.


-- 1) Config ------------------------------------------------------------------------------

create table if not exists public.flock_community_limits (
  kind       text primary key check (kind in ('posts', 'comments', 'photos')),
  per_hour   integer not null check (per_hour between 1 and 1000),
  updated_at timestamptz not null default now()
);
insert into public.flock_community_limits (kind, per_hour) values
  ('posts', 5), ('comments', 30), ('photos', 20)
on conflict (kind) do nothing;

-- Lowercase phrases, matched as whole words in a post or comment
-- (src/lib/flockPosts.ts). Never blocks anything; only shows the red card.
create table if not exists public.flock_vet_signs (
  phrase     text primary key check (phrase = lower(btrim(phrase)) and length(phrase) between 2 and 80),
  created_at timestamptz not null default now()
);
insert into public.flock_vet_signs (phrase) values
  ('fluffed up'), ('fluffed'), ('puffed up'), ('fluffing up'),
  ('sleeping a lot'), ('sleeping more'), ('sleepy all day'), ('lethargic'),
  ('not eating'), ('isn''t eating'), ('won''t eat'), ('stopped eating'), ('not eating much'), ('eating less'), ('lost weight'), ('losing weight'),
  ('bleeding'), ('blood'), ('broken blood feather'),
  ('tail bobbing'), ('tail bob'), ('tail is bobbing'),
  ('breathing hard'), ('breathing heavily'), ('open-mouth breathing'), ('open mouth breathing'), ('wheezing'), ('clicking when breathing'),
  ('sitting on the cage floor'), ('on the cage floor'), ('on the bottom of the cage'), ('sitting on the floor of the cage'),
  ('droppings changed'), ('change in droppings'), ('watery droppings'), ('black droppings'), ('blood in droppings'), ('bloody droppings'), ('no droppings'),
  ('can''t perch'), ('falling off the perch'), ('fell off the perch'), ('can''t stand'),
  ('vomiting'), ('throwing up'), ('discharge from'), ('swollen'), ('eyes closed'), ('head tucked'), ('seizure'), ('egg bound'), ('egg-bound')
on conflict (phrase) do nothing;

alter table public.flock_community_limits enable row level security;
alter table public.flock_vet_signs enable row level security;
revoke all on public.flock_community_limits, public.flock_vet_signs from anon, authenticated;
grant select, insert, update, delete on public.flock_community_limits, public.flock_vet_signs to service_role;
drop policy if exists "flock_community_limits no direct access" on public.flock_community_limits;
create policy "flock_community_limits no direct access" on public.flock_community_limits for select to authenticated using (false);
drop policy if exists "flock_vet_signs no direct access" on public.flock_vet_signs;
create policy "flock_vet_signs no direct access" on public.flock_vet_signs for select to authenticated using (false);


-- 2) Posts and comments -------------------------------------------------------------------

create table if not exists public.flock_posts (
  id          uuid primary key default gen_random_uuid(),
  author_id   uuid not null references auth.users(id) on delete cascade,
  -- learn = Learn together, good = Do good, chapter = the author's chapter, start = Start here.
  space       text not null check (space in ('learn', 'good', 'chapter', 'start')),
  region_slug text references public.regions(slug),
  title       text check (title is null or length(title) between 1 and 120),
  body        text not null check (length(btrim(body)) between 1 and 5000),
  bird_id     uuid references public.birds(id) on delete set null,
  photo_paths text[] not null default '{}' check (cardinality(photo_paths) <= 4),
  -- pending = waiting for review (Do good); the review queue (PR B) sets the rest.
  status      text not null default 'live' check (status in ('live', 'pending', 'changes_requested', 'declined', 'removed')),
  review_note text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  -- The member saw the vet nudge and chose "Post anyway, after I've called".
  vet_nudged  boolean not null default false,
  created_at  timestamptz not null default now(),
  edited_at   timestamptz,
  check ((space = 'chapter') = (region_slug is not null))
);
create index if not exists flock_posts_live_idx on public.flock_posts (status, created_at desc);
create index if not exists flock_posts_author_idx on public.flock_posts (author_id, created_at desc);
create index if not exists flock_posts_chapter_idx on public.flock_posts (region_slug, created_at desc) where space = 'chapter';

create table if not exists public.flock_comments (
  id            uuid primary key default gen_random_uuid(),
  subject_type  text not null check (subject_type in ('post', 'journey_update', 'journey_milestone')),
  subject_id    uuid not null,
  -- One level deep: a reply's parent is always a top-level comment.
  parent_id     uuid references public.flock_comments(id) on delete cascade,
  -- "Replying to [name]": whose comment the reply answers.
  reply_to_user uuid references auth.users(id) on delete set null,
  author_id     uuid not null references auth.users(id) on delete cascade,
  body          text not null check (length(btrim(body)) between 1 and 2000),
  photo_path    text,
  status        text not null default 'live' check (status in ('live', 'removed')),
  vet_nudged    boolean not null default false,
  created_at    timestamptz not null default now(),
  edited_at     timestamptz
);
create index if not exists flock_comments_subject_idx on public.flock_comments (subject_type, subject_id, created_at);
create index if not exists flock_comments_author_idx on public.flock_comments (author_id, created_at desc);
create index if not exists flock_comments_parent_idx on public.flock_comments (parent_id);

alter table public.flock_posts enable row level security;
alter table public.flock_comments enable row level security;
revoke all on public.flock_posts, public.flock_comments from anon, authenticated;
grant select, insert, update, delete on public.flock_posts, public.flock_comments to service_role;
-- Read and written only through the functions below.
drop policy if exists "flock_posts no direct access" on public.flock_posts;
create policy "flock_posts no direct access" on public.flock_posts for select to authenticated using (false);
drop policy if exists "flock_comments no direct access" on public.flock_comments;
create policy "flock_comments no direct access" on public.flock_comments for select to authenticated using (false);

-- Reactions (step 3's table) now also cover posts and comments.
alter table public.flock_reactions drop constraint if exists flock_reactions_subject_type_check;
alter table public.flock_reactions add constraint flock_reactions_subject_type_check
  check (subject_type in ('journey_update', 'journey_milestone', 'post', 'comment'));

-- Comments and reactions keyed by subject have no foreign key; these keep
-- them from outliving what they were on (a deleted post, comment, journey
-- update or milestone, however it was deleted).
create or replace function private.flock_subject_cleanup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_type text := tg_argv[0];
begin
  delete from public.flock_comments c where c.subject_type = v_type and c.subject_id = old.id;
  delete from public.flock_reactions r where r.subject_type = v_type and r.subject_id = old.id;
  return old;
end;
$$;

create or replace function private.flock_comment_cleanup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.flock_reactions r where r.subject_type = 'comment' and r.subject_id = old.id;
  return old;
end;
$$;

revoke all on function private.flock_subject_cleanup() from public, anon, authenticated;
revoke all on function private.flock_comment_cleanup() from public, anon, authenticated;

drop trigger if exists flock_posts_cleanup on public.flock_posts;
create trigger flock_posts_cleanup after delete on public.flock_posts
  for each row execute function private.flock_subject_cleanup('post');
drop trigger if exists flock_comments_cleanup on public.flock_comments;
create trigger flock_comments_cleanup after delete on public.flock_comments
  for each row execute function private.flock_comment_cleanup();
drop trigger if exists journey_updates_flock_cleanup on public.journey_updates;
create trigger journey_updates_flock_cleanup after delete on public.journey_updates
  for each row execute function private.flock_subject_cleanup('journey_update');
drop trigger if exists journey_milestones_flock_cleanup on public.journey_milestones;
create trigger journey_milestones_flock_cleanup after delete on public.journey_milestones
  for each row execute function private.flock_subject_cleanup('journey_milestone');


-- 3) Photos ---------------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('flock-posts', 'flock-posts', false, 3145728, array['image/jpeg'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "flock-posts own read" on storage.objects;
drop policy if exists "flock-posts own insert" on storage.objects;
drop policy if exists "flock-posts own delete" on storage.objects;
-- Your own uploads only (to preview and to clean up). Everyone else's photos
-- reach a viewer only as server-signed links.
create policy "flock-posts own read" on storage.objects for select to authenticated
  using (bucket_id = 'flock-posts' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "flock-posts own insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'flock-posts'
              and (storage.foldername(name))[1] = auth.uid()::text
              and private.can_use_flock(auth.uid()));
create policy "flock-posts own delete" on storage.objects for delete to authenticated
  using (bucket_id = 'flock-posts' and (storage.foldername(name))[1] = auth.uid()::text);

-- A photo path the caller uploaded: "<their id>/<uuid>.jpg", in the bucket.
create or replace function private.flock_own_photo_ok(p_user_id uuid, p_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_path ~ ('^' || p_user_id::text || '/[0-9a-f-]{36}\.jpg$')
     and exists (select 1 from storage.objects o where o.bucket_id = 'flock-posts' and o.name = p_path);
$$;

revoke all on function private.flock_own_photo_ok(uuid, text) from public, anon, authenticated;
grant execute on function private.flock_own_photo_ok(uuid, text) to service_role;


-- 4) Who may see what ----------------------------------------------------------------------

create or replace function private.flock_post_visible(p_user_id uuid, p_post_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user_id is not null and private.can_use_flock(p_user_id) and exists (
    select 1 from public.flock_posts p
    where p.id = p_post_id
      and (
        p.author_id = p_user_id
        or (p.status = 'live'
            and private.can_use_flock(p.author_id)
            and (p.space <> 'chapter'
                 or p.region_slug = (select fp.region_slug from public.flock_profiles fp where fp.user_id = p_user_id)))
      )
  );
$$;

-- A comment's subject (post, journey update, reached milestone), or a comment.
create or replace function private.flock_subject_visible(p_user_id uuid, p_type text, p_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_journey uuid;
  c public.flock_comments;
begin
  if p_user_id is null or not private.can_use_flock(p_user_id) then
    return false;
  end if;
  if p_type = 'post' then
    return private.flock_post_visible(p_user_id, p_id);
  elsif p_type = 'journey_update' then
    select u.journey_id into v_journey from public.journey_updates u where u.id = p_id;
    return v_journey is not null and private.journey_viewable(p_user_id, v_journey);
  elsif p_type = 'journey_milestone' then
    select m.journey_id into v_journey from public.journey_milestones m where m.id = p_id and m.state = 'reached';
    return v_journey is not null and private.journey_viewable(p_user_id, v_journey);
  elsif p_type = 'comment' then
    select * into c from public.flock_comments x where x.id = p_id;
    if c.id is null then return false; end if;
    return (c.author_id = p_user_id or (c.status = 'live' and private.can_use_flock(c.author_id)))
       and private.flock_subject_visible(p_user_id, c.subject_type, c.subject_id);
  end if;
  return false;
end;
$$;

revoke all on function private.flock_post_visible(uuid, uuid) from public, anon;
revoke all on function private.flock_subject_visible(uuid, text, uuid) from public, anon;
grant execute on function private.flock_post_visible(uuid, uuid) to authenticated, service_role;
grant execute on function private.flock_subject_visible(uuid, text, uuid) to authenticated, service_role;

-- Over the hourly limit: raises 'rate_limited' with the kind in DETAIL, which
-- the app turns into a kind message. p_photos = photos this write adds.
create or replace function private.flock_check_rate(p_user_id uuid, p_kind text, p_photos integer)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_limit integer;
  v_used integer;
begin
  select l.per_hour into v_limit from public.flock_community_limits l where l.kind = p_kind;
  if p_kind = 'posts' then
    select count(*) into v_used from public.flock_posts p where p.author_id = p_user_id and p.created_at > now() - interval '1 hour';
  else
    select count(*) into v_used from public.flock_comments c where c.author_id = p_user_id and c.created_at > now() - interval '1 hour';
  end if;
  if v_limit is not null and v_used >= v_limit then
    raise exception 'rate_limited' using errcode = 'P0001', detail = p_kind;
  end if;
  if coalesce(p_photos, 0) > 0 then
    select l.per_hour into v_limit from public.flock_community_limits l where l.kind = 'photos';
    select coalesce((select sum(cardinality(p.photo_paths)) from public.flock_posts p
                     where p.author_id = p_user_id and p.created_at > now() - interval '1 hour'), 0)
         + (select count(*) from public.flock_comments c
            where c.author_id = p_user_id and c.photo_path is not null and c.created_at > now() - interval '1 hour')
      into v_used;
    if v_limit is not null and v_used + p_photos > v_limit then
      raise exception 'rate_limited' using errcode = 'P0001', detail = 'photos';
    end if;
  end if;
end;
$$;

revoke all on function private.flock_check_rate(uuid, text, integer) from public, anon, authenticated;
grant execute on function private.flock_check_rate(uuid, text, integer) to service_role;


-- 5) Reading -----------------------------------------------------------------------------

-- Posts the caller may see, with public fields only: the author's Community
-- name, region, photo path and founder badge; an attached bird's name (only
-- while it is shown, or the caller's own) and whether its photo may show.
create or replace function private.flock_post_rows(p_user_id uuid)
returns table (
  post_id uuid, author_id uuid, author_name text, author_region text, author_photo_path text, author_is_founder boolean,
  space text, region_slug text, region_name text, title text, body text, photo_count integer,
  bird_id uuid, bird_name text, bird_has_photo boolean, status text, review_note text,
  created_at timestamptz, edited_at timestamptz, is_mine boolean, comment_count integer,
  great_job integer, been_there integer, rooting_for_you integer, love_this integer, mine text[]
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.author_id, fp.display_name, ar.name, fp.photo_path,
         exists (select 1 from public.founding_claims fc where fc.user_id = p.author_id),
         p.space, p.region_slug, cr.name, p.title, p.body, cardinality(p.photo_paths),
         case when bv.ok then p.bird_id end,
         case when bv.ok then b.name::text end,
         coalesce(bv.ok and private.journey_bird_photo_visible(p_user_id, p.bird_id), false),
         p.status, case when p.author_id = p_user_id then p.review_note end,
         p.created_at, p.edited_at, p.author_id = p_user_id,
         (select count(*)::integer from public.flock_comments c
          where c.subject_type = 'post' and c.subject_id = p.id and c.status = 'live'),
         coalesce(rx.great_job, 0), coalesce(rx.been_there, 0), coalesce(rx.rooting_for_you, 0), coalesce(rx.love_this, 0),
         coalesce(rx.mine, '{}')
  from public.flock_posts p
  left join public.flock_profiles fp on fp.user_id = p.author_id
  left join public.regions ar on ar.slug = fp.region_slug
  left join public.regions cr on cr.slug = p.region_slug
  left join public.birds b on b.id = p.bird_id
  left join lateral (
    select b.id is not null and b.passed_at is null and (
      private.has_bird_access(b.id, p_user_id) is not null
      or exists (select 1 from public.flock_shown_birds s where s.bird_id = b.id and s.user_id = p.author_id and s.shown)
    ) as ok
  ) bv on true
  left join lateral (
    select count(*) filter (where r.kind = 'great_job')::integer as great_job,
           count(*) filter (where r.kind = 'been_there')::integer as been_there,
           count(*) filter (where r.kind = 'rooting_for_you')::integer as rooting_for_you,
           count(*) filter (where r.kind = 'love_this')::integer as love_this,
           array_agg(r.kind order by r.kind) filter (where r.user_id = p_user_id) as mine
    from public.flock_reactions r where r.subject_type = 'post' and r.subject_id = p.id
  ) rx on true
  where private.flock_post_visible(p_user_id, p.id);
$$;

revoke all on function private.flock_post_rows(uuid) from public, anon;
grant execute on function private.flock_post_rows(uuid) to authenticated, service_role;

-- Today and the Chapter tab. p_space: everything | learn | good | start |
-- chapter (the caller's chapter). Everything includes the caller's chapter's
-- posts. Newest first; p_before pages back.
create or replace function private.flock_feed(p_space text, p_before timestamptz, p_limit integer)
returns setof record
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.assert_can_use_flock();
  if p_space is null or p_space not in ('everything', 'learn', 'good', 'start', 'chapter') then
    raise exception 'unknown space' using errcode = '22023';
  end if;
  return query
    select r.* from private.flock_post_rows(auth.uid()) r
    where (p_space = 'everything' or r.space = p_space)
      and r.created_at < coalesce(p_before, 'infinity'::timestamptz)
    order by r.created_at desc, r.post_id
    limit least(greatest(coalesce(p_limit, 20), 1), 50);
end;
$$;

create or replace function private.flock_post(p_post_id uuid)
returns setof record
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.assert_can_use_flock();
  return query select r.* from private.flock_post_rows(auth.uid()) r where r.post_id = p_post_id;
end;
$$;

-- Comments on something the caller may see. Top-level comments and replies
-- come back together, oldest first; the app nests replies under parent_id.
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
  perform private.assert_can_use_flock();
  if p_subject_type not in ('post', 'journey_update', 'journey_milestone')
     or not private.flock_subject_visible(auth.uid(), p_subject_type, p_subject_id) then
    raise exception 'not found' using errcode = 'P0002';
  end if;
  return query
    select c.id, c.parent_id, c.author_id, fp.display_name, ar.name, fp.photo_path,
           rp.display_name, c.body, c.photo_path is not null, c.created_at, c.edited_at, c.author_id = auth.uid(),
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
    ) rx on true
    where c.subject_type = p_subject_type and c.subject_id = p_subject_id
      and (c.author_id = auth.uid() or (c.status = 'live' and private.can_use_flock(c.author_id)))
      -- A reply shows only while its thread's top comment does.
      and (c.parent_id is null or exists (
            select 1 from public.flock_comments pc where pc.id = c.parent_id
              and (pc.author_id = auth.uid() or (pc.status = 'live' and private.can_use_flock(pc.author_id)))))
    order by c.created_at, c.id;
end;
$$;

-- Comment counts for a batch of subjects the caller may see (Today's cards,
-- the story viewer). Subjects the caller can't see are left out.
create or replace function private.flock_comment_counts(p_subject_type text, p_ids uuid[])
returns table (subject_id uuid, comment_count integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.assert_can_use_flock();
  return query
    select s.id, (select count(*)::integer from public.flock_comments c
                  where c.subject_type = p_subject_type and c.subject_id = s.id and c.status = 'live')
    from unnest(coalesce(p_ids, '{}')) as s(id)
    where cardinality(p_ids) <= 200
      and private.flock_subject_visible(auth.uid(), p_subject_type, s.id);
end;
$$;

-- Who reacted: each person's Community name, region and reaction.
create or replace function private.flock_reactors(p_subject_type text, p_subject_id uuid)
returns table (user_id uuid, display_name text, region_name text, photo_path text, kind text, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.assert_can_use_flock();
  if p_subject_type not in ('post', 'comment', 'journey_update', 'journey_milestone')
     or not private.flock_subject_visible(auth.uid(), p_subject_type, p_subject_id) then
    raise exception 'not found' using errcode = 'P0002';
  end if;
  return query
    select r.user_id, fp.display_name, rg.name, fp.photo_path, r.kind, r.created_at
    from public.flock_reactions r
    join public.flock_profiles fp on fp.user_id = r.user_id
    left join public.regions rg on rg.slug = fp.region_slug
    where r.subject_type = p_subject_type and r.subject_id = p_subject_id
      and private.can_use_flock(r.user_id)
    order by r.created_at desc;
end;
$$;

-- Photo paths for posts and comments the caller may see. Only the server calls
-- this (as the caller) and turns the paths into one-hour signed links.
create or replace function private.flock_media_refs(p_post_ids uuid[], p_comment_ids uuid[])
returns table (subject_type text, subject_id uuid, idx integer, path text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.assert_can_use_flock();
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

-- The vet nudge's phrases.
create or replace function private.flock_vet_signs()
returns setof text
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.assert_can_use_flock();
  return query select s.phrase from public.flock_vet_signs s order by s.phrase;
end;
$$;

revoke all on function private.flock_feed(text, timestamptz, integer) from public, anon;
revoke all on function private.flock_post(uuid) from public, anon;
revoke all on function private.flock_comments_for(text, uuid) from public, anon;
revoke all on function private.flock_comment_counts(text, uuid[]) from public, anon;
revoke all on function private.flock_reactors(text, uuid) from public, anon;
revoke all on function private.flock_media_refs(uuid[], uuid[]) from public, anon;
revoke all on function private.flock_vet_signs() from public, anon;
grant execute on function private.flock_feed(text, timestamptz, integer) to authenticated, service_role;
grant execute on function private.flock_post(uuid) to authenticated, service_role;
grant execute on function private.flock_comments_for(text, uuid) to authenticated, service_role;
grant execute on function private.flock_comment_counts(text, uuid[]) to authenticated, service_role;
grant execute on function private.flock_reactors(text, uuid) to authenticated, service_role;
grant execute on function private.flock_media_refs(uuid[], uuid[]) to authenticated, service_role;
grant execute on function private.flock_vet_signs() to authenticated, service_role;


-- 6) Writing -----------------------------------------------------------------------------

create or replace function private.flock_post_create(
  p_space text, p_title text, p_body text, p_photo_paths text[], p_bird_id uuid, p_vet_nudged boolean
)
returns table (post_id uuid, status text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_region text;
  v_paths text[] := coalesce(p_photo_paths, '{}');
  v_path text;
  v_status text;
  v_id uuid;
begin
  perform private.assert_can_use_flock();
  select fp.region_slug into v_region from public.flock_profiles fp where fp.user_id = v_me;
  if not found then
    raise exception 'set up your Community profile first' using errcode = '42501';
  end if;
  if p_space is null or p_space not in ('learn', 'good', 'chapter', 'start') then
    raise exception 'unknown space' using errcode = '22023';
  end if;
  if p_space = 'chapter' and (v_region is null or v_region = 'other') then
    raise exception 'choose your region to post to a chapter' using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_body, ''))) not between 1 and 5000 then
    raise exception 'write a few words (up to 5,000 characters)' using errcode = '22023';
  end if;
  if p_title is not null and length(btrim(p_title)) > 120 then
    raise exception 'titles are up to 120 characters' using errcode = '22023';
  end if;
  if cardinality(v_paths) > 4 or cardinality(v_paths) <> (select count(distinct x) from unnest(v_paths) x) then
    raise exception 'up to four photos' using errcode = '22023';
  end if;
  foreach v_path in array v_paths loop
    if not private.flock_own_photo_ok(v_me, v_path) then
      raise exception 'photo not found' using errcode = '22023';
    end if;
  end loop;
  if p_bird_id is not null and not exists (
    select 1 from public.flock_shown_birds s
    join public.birds b on b.id = s.bird_id and b.owner_id = s.user_id
    where s.bird_id = p_bird_id and s.user_id = v_me and s.shown and b.passed_at is null
  ) then
    raise exception 'attach one of the birds you show in the Community' using errcode = '22023';
  end if;
  perform private.flock_check_rate(v_me, 'posts', cardinality(v_paths));
  v_status := case when p_space = 'good' then 'pending' else 'live' end;
  insert into public.flock_posts (author_id, space, region_slug, title, body, bird_id, photo_paths, status, vet_nudged)
  values (v_me, p_space, case when p_space = 'chapter' then v_region end,
          nullif(btrim(coalesce(p_title, '')), ''), btrim(p_body), p_bird_id, v_paths, v_status, coalesce(p_vet_nudged, false))
  returning id into v_id;
  return query select v_id, v_status;
end;
$$;

-- Edit your own post's title and text. A Do good post goes back for review.
create or replace function private.flock_post_edit(p_post_id uuid, p_title text, p_body text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  p public.flock_posts;
begin
  perform private.assert_can_use_flock();
  select * into p from public.flock_posts x where x.id = p_post_id;
  if p.id is null or p.author_id <> auth.uid() then
    raise exception 'not found' using errcode = 'P0002';
  end if;
  if p.status = 'removed' then
    raise exception 'this post was removed' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_body, ''))) not between 1 and 5000 then
    raise exception 'write a few words (up to 5,000 characters)' using errcode = '22023';
  end if;
  if p_title is not null and length(btrim(p_title)) > 120 then
    raise exception 'titles are up to 120 characters' using errcode = '22023';
  end if;
  update public.flock_posts x
  set title = nullif(btrim(coalesce(p_title, '')), ''), body = btrim(p_body), edited_at = now(),
      status = case when x.space = 'good' then 'pending' else x.status end
  where x.id = p.id
  returning x.status into p.status;
  return p.status;
end;
$$;

-- Delete your own post. Returns every photo path that goes with it (its own
-- and its comments') so the server can remove the files.
create or replace function private.flock_post_delete(p_post_id uuid)
returns table (path text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  p public.flock_posts;
  v_paths text[];
begin
  perform private.assert_can_use_flock();
  select * into p from public.flock_posts x where x.id = p_post_id;
  if p.id is null or p.author_id <> auth.uid() then
    raise exception 'not found' using errcode = 'P0002';
  end if;
  v_paths := p.photo_paths || coalesce((select array_agg(c.photo_path) from public.flock_comments c
                                        where c.subject_type = 'post' and c.subject_id = p.id and c.photo_path is not null), '{}');
  delete from public.flock_posts x where x.id = p.id;
  return query select unnest(v_paths);
end;
$$;

-- Comment, or reply. p_reply_to = the comment being answered (a top-level
-- comment or a reply); the new reply nests under that thread's top comment,
-- with "Replying to" its author.
create or replace function private.flock_comment_create(
  p_subject_type text, p_subject_id uuid, p_reply_to uuid, p_body text, p_photo_path text, p_vet_nudged boolean
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_parent uuid;
  v_reply_user uuid;
  r public.flock_comments;
  v_id uuid;
begin
  perform private.assert_can_use_flock();
  if not exists (select 1 from public.flock_profiles fp where fp.user_id = v_me) then
    raise exception 'set up your Community profile first' using errcode = '42501';
  end if;
  if p_subject_type is null or p_subject_type not in ('post', 'journey_update', 'journey_milestone')
     or not private.flock_subject_visible(v_me, p_subject_type, p_subject_id) then
    raise exception 'not found' using errcode = 'P0002';
  end if;
  if p_subject_type = 'post' and not exists (select 1 from public.flock_posts x where x.id = p_subject_id and x.status = 'live') then
    raise exception 'comments open once the post is live' using errcode = '42501';
  end if;
  if p_subject_type <> 'post' and not (private.journey_limits_for(v_me)).can_share then
    raise exception 'comments come with Flock membership' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_body, ''))) not between 1 and 2000 then
    raise exception 'write a few words (up to 2,000 characters)' using errcode = '22023';
  end if;
  if p_photo_path is not null and not private.flock_own_photo_ok(v_me, p_photo_path) then
    raise exception 'photo not found' using errcode = '22023';
  end if;
  if p_reply_to is not null then
    select * into r from public.flock_comments x where x.id = p_reply_to;
    if r.id is null or r.subject_type <> p_subject_type or r.subject_id <> p_subject_id
       or not private.flock_subject_visible(v_me, 'comment', r.id) then
      raise exception 'not found' using errcode = 'P0002';
    end if;
    v_parent := coalesce(r.parent_id, r.id);
    v_reply_user := r.author_id;
  end if;
  perform private.flock_check_rate(v_me, 'comments', case when p_photo_path is null then 0 else 1 end);
  insert into public.flock_comments (subject_type, subject_id, parent_id, reply_to_user, author_id, body, photo_path, vet_nudged)
  values (p_subject_type, p_subject_id, v_parent, v_reply_user, v_me, btrim(p_body), p_photo_path, coalesce(p_vet_nudged, false))
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function private.flock_comment_edit(p_comment_id uuid, p_body text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.assert_can_use_flock();
  if length(btrim(coalesce(p_body, ''))) not between 1 and 2000 then
    raise exception 'write a few words (up to 2,000 characters)' using errcode = '22023';
  end if;
  update public.flock_comments c set body = btrim(p_body), edited_at = now()
  where c.id = p_comment_id and c.author_id = auth.uid() and c.status = 'live';
  if not found then
    raise exception 'not found' using errcode = 'P0002';
  end if;
end;
$$;

-- Delete your own comment (a top comment takes its replies with it). Returns
-- the photo paths that go with it.
create or replace function private.flock_comment_delete(p_comment_id uuid)
returns table (path text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  c public.flock_comments;
  v_paths text[];
begin
  perform private.assert_can_use_flock();
  select * into c from public.flock_comments x where x.id = p_comment_id;
  if c.id is null or c.author_id <> auth.uid() then
    raise exception 'not found' using errcode = 'P0002';
  end if;
  select coalesce(array_agg(x.photo_path), '{}') into v_paths
  from public.flock_comments x where (x.id = c.id or x.parent_id = c.id) and x.photo_path is not null;
  delete from public.flock_comments x where x.id = c.id;
  return query select unnest(v_paths);
end;
$$;

-- Great job / Been there / Rooting for you / Love this, on anything the caller
-- may see. Journey subjects keep step 3's rules (private.journey_react).
create or replace function private.flock_react(p_subject_type text, p_subject_id uuid, p_kind text, p_on boolean)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if p_subject_type in ('journey_update', 'journey_milestone') then
    perform private.journey_react(p_subject_type, p_subject_id, p_kind, p_on);
    return;
  end if;
  perform private.assert_can_use_flock();
  if p_kind is null or p_kind not in ('great_job', 'been_there', 'rooting_for_you', 'love_this') then
    raise exception 'unknown reaction' using errcode = '22023';
  end if;
  if p_subject_type is null or p_subject_type not in ('post', 'comment')
     or not private.flock_subject_visible(auth.uid(), p_subject_type, p_subject_id) then
    raise exception 'not found' using errcode = 'P0002';
  end if;
  if p_subject_type = 'post' and not exists (select 1 from public.flock_posts x where x.id = p_subject_id and x.status = 'live') then
    raise exception 'not found' using errcode = 'P0002';
  end if;
  if p_on then
    insert into public.flock_reactions (subject_type, subject_id, user_id, kind)
    values (p_subject_type, p_subject_id, auth.uid(), p_kind) on conflict do nothing;
  else
    delete from public.flock_reactions r
    where r.subject_type = p_subject_type and r.subject_id = p_subject_id and r.user_id = auth.uid() and r.kind = p_kind;
  end if;
end;
$$;

revoke all on function private.flock_post_create(text, text, text, text[], uuid, boolean) from public, anon;
revoke all on function private.flock_post_edit(uuid, text, text) from public, anon;
revoke all on function private.flock_post_delete(uuid) from public, anon;
revoke all on function private.flock_comment_create(text, uuid, uuid, text, text, boolean) from public, anon;
revoke all on function private.flock_comment_edit(uuid, text) from public, anon;
revoke all on function private.flock_comment_delete(uuid) from public, anon;
revoke all on function private.flock_react(text, uuid, text, boolean) from public, anon;
grant execute on function private.flock_post_create(text, text, text, text[], uuid, boolean) to authenticated, service_role;
grant execute on function private.flock_post_edit(uuid, text, text) to authenticated, service_role;
grant execute on function private.flock_post_delete(uuid) to authenticated, service_role;
grant execute on function private.flock_comment_create(text, uuid, uuid, text, text, boolean) to authenticated, service_role;
grant execute on function private.flock_comment_edit(uuid, text) to authenticated, service_role;
grant execute on function private.flock_comment_delete(uuid) to authenticated, service_role;
grant execute on function private.flock_react(text, uuid, text, boolean) to authenticated, service_role;


-- 7) Admin settings ------------------------------------------------------------------------
--   select public.admin_set_flock_limit('posts', 5);        -- posts | comments | photos, per hour
--   select public.admin_add_vet_sign('panting');
--   select public.admin_remove_vet_sign('panting');

create or replace function private.set_flock_limit(p_kind text, p_per_hour integer)
returns public.flock_community_limits
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_row public.flock_community_limits;
begin
  perform private.assert_entitlement_admin();
  if p_per_hour is null or p_per_hour not between 1 and 1000 then
    raise exception 'pick a number from 1 to 1000' using errcode = '22023';
  end if;
  update public.flock_community_limits l set per_hour = p_per_hour, updated_at = now()
  where l.kind = p_kind returning l.* into v_row;
  if v_row.kind is null then
    raise exception 'unknown limit: use posts, comments or photos' using errcode = '22023';
  end if;
  return v_row;
end;
$$;

create or replace function private.add_vet_sign(p_phrase text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.assert_entitlement_admin();
  if length(btrim(coalesce(p_phrase, ''))) not between 2 and 80 then
    raise exception 'a phrase of 2 to 80 characters' using errcode = '22023';
  end if;
  insert into public.flock_vet_signs (phrase) values (lower(btrim(p_phrase))) on conflict do nothing;
end;
$$;

create or replace function private.remove_vet_sign(p_phrase text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.assert_entitlement_admin();
  delete from public.flock_vet_signs s where s.phrase = lower(btrim(p_phrase));
end;
$$;

revoke all on function private.set_flock_limit(text, integer) from public, anon;
revoke all on function private.add_vet_sign(text) from public, anon;
revoke all on function private.remove_vet_sign(text) from public, anon;
grant execute on function private.set_flock_limit(text, integer) to authenticated, service_role;
grant execute on function private.add_vet_sign(text) to authenticated, service_role;
grant execute on function private.remove_vet_sign(text) to authenticated, service_role;


-- 8) Invoker wrappers the app calls ----------------------------------------------------------

create or replace function public.flock_feed(p_space text default 'everything', p_before timestamptz default null, p_limit integer default 20)
returns table (
  post_id uuid, author_id uuid, author_name text, author_region text, author_photo_path text, author_is_founder boolean,
  space text, region_slug text, region_name text, title text, body text, photo_count integer,
  bird_id uuid, bird_name text, bird_has_photo boolean, status text, review_note text,
  created_at timestamptz, edited_at timestamptz, is_mine boolean, comment_count integer,
  great_job integer, been_there integer, rooting_for_you integer, love_this integer, mine text[]
) language sql stable security invoker set search_path = ''
as $$
  select * from private.flock_feed(p_space, p_before, p_limit) as f(
    post_id uuid, author_id uuid, author_name text, author_region text, author_photo_path text, author_is_founder boolean,
    space text, region_slug text, region_name text, title text, body text, photo_count integer,
    bird_id uuid, bird_name text, bird_has_photo boolean, status text, review_note text,
    created_at timestamptz, edited_at timestamptz, is_mine boolean, comment_count integer,
    great_job integer, been_there integer, rooting_for_you integer, love_this integer, mine text[]);
$$;

create or replace function public.flock_post(p_post_id uuid)
returns table (
  post_id uuid, author_id uuid, author_name text, author_region text, author_photo_path text, author_is_founder boolean,
  space text, region_slug text, region_name text, title text, body text, photo_count integer,
  bird_id uuid, bird_name text, bird_has_photo boolean, status text, review_note text,
  created_at timestamptz, edited_at timestamptz, is_mine boolean, comment_count integer,
  great_job integer, been_there integer, rooting_for_you integer, love_this integer, mine text[]
) language sql stable security invoker set search_path = ''
as $$
  select * from private.flock_post(p_post_id) as f(
    post_id uuid, author_id uuid, author_name text, author_region text, author_photo_path text, author_is_founder boolean,
    space text, region_slug text, region_name text, title text, body text, photo_count integer,
    bird_id uuid, bird_name text, bird_has_photo boolean, status text, review_note text,
    created_at timestamptz, edited_at timestamptz, is_mine boolean, comment_count integer,
    great_job integer, been_there integer, rooting_for_you integer, love_this integer, mine text[]);
$$;

create or replace function public.flock_comments_for(p_subject_type text, p_subject_id uuid)
returns table (
  comment_id uuid, parent_id uuid, author_id uuid, author_name text, author_region text, author_photo_path text,
  reply_to_name text, body text, has_photo boolean, created_at timestamptz, edited_at timestamptz, is_mine boolean,
  great_job integer, been_there integer, rooting_for_you integer, love_this integer, mine text[]
) language sql stable security invoker set search_path = ''
as $$ select * from private.flock_comments_for(p_subject_type, p_subject_id); $$;

create or replace function public.flock_comment_counts(p_subject_type text, p_ids uuid[])
returns table (subject_id uuid, comment_count integer)
language sql stable security invoker set search_path = ''
as $$ select * from private.flock_comment_counts(p_subject_type, p_ids); $$;

create or replace function public.flock_reactors(p_subject_type text, p_subject_id uuid)
returns table (user_id uuid, display_name text, region_name text, photo_path text, kind text, created_at timestamptz)
language sql stable security invoker set search_path = ''
as $$ select * from private.flock_reactors(p_subject_type, p_subject_id); $$;

create or replace function public.flock_media_refs(p_post_ids uuid[] default null, p_comment_ids uuid[] default null)
returns table (subject_type text, subject_id uuid, idx integer, path text)
language sql stable security invoker set search_path = ''
as $$ select * from private.flock_media_refs(p_post_ids, p_comment_ids); $$;

create or replace function public.flock_vet_signs()
returns setof text language sql stable security invoker set search_path = ''
as $$ select * from private.flock_vet_signs(); $$;

create or replace function public.flock_post_create(
  p_space text, p_title text default null, p_body text default null, p_photo_paths text[] default '{}',
  p_bird_id uuid default null, p_vet_nudged boolean default false
)
returns table (post_id uuid, status text) language sql volatile security invoker set search_path = ''
as $$ select * from private.flock_post_create(p_space, p_title, p_body, p_photo_paths, p_bird_id, p_vet_nudged); $$;

create or replace function public.flock_post_edit(p_post_id uuid, p_title text, p_body text)
returns text language sql volatile security invoker set search_path = ''
as $$ select private.flock_post_edit(p_post_id, p_title, p_body); $$;

create or replace function public.flock_post_delete(p_post_id uuid)
returns table (path text) language sql volatile security invoker set search_path = ''
as $$ select * from private.flock_post_delete(p_post_id); $$;

create or replace function public.flock_comment_create(
  p_subject_type text, p_subject_id uuid, p_reply_to uuid default null, p_body text default null,
  p_photo_path text default null, p_vet_nudged boolean default false
)
returns uuid language sql volatile security invoker set search_path = ''
as $$ select private.flock_comment_create(p_subject_type, p_subject_id, p_reply_to, p_body, p_photo_path, p_vet_nudged); $$;

create or replace function public.flock_comment_edit(p_comment_id uuid, p_body text)
returns void language sql volatile security invoker set search_path = ''
as $$ select private.flock_comment_edit(p_comment_id, p_body); $$;

create or replace function public.flock_comment_delete(p_comment_id uuid)
returns table (path text) language sql volatile security invoker set search_path = ''
as $$ select * from private.flock_comment_delete(p_comment_id); $$;

create or replace function public.flock_react(p_subject_type text, p_subject_id uuid, p_kind text, p_on boolean)
returns void language sql volatile security invoker set search_path = ''
as $$ select private.flock_react(p_subject_type, p_subject_id, p_kind, p_on); $$;

create or replace function public.admin_set_flock_limit(p_kind text, p_per_hour integer)
returns public.flock_community_limits language sql volatile security invoker set search_path = ''
as $$ select * from private.set_flock_limit(p_kind, p_per_hour); $$;

create or replace function public.admin_add_vet_sign(p_phrase text)
returns void language sql volatile security invoker set search_path = ''
as $$ select private.add_vet_sign(p_phrase); $$;

create or replace function public.admin_remove_vet_sign(p_phrase text)
returns void language sql volatile security invoker set search_path = ''
as $$ select private.remove_vet_sign(p_phrase); $$;

revoke all on function public.flock_feed(text, timestamptz, integer) from public, anon;
revoke all on function public.flock_post(uuid) from public, anon;
revoke all on function public.flock_comments_for(text, uuid) from public, anon;
revoke all on function public.flock_comment_counts(text, uuid[]) from public, anon;
revoke all on function public.flock_reactors(text, uuid) from public, anon;
revoke all on function public.flock_media_refs(uuid[], uuid[]) from public, anon;
revoke all on function public.flock_vet_signs() from public, anon;
revoke all on function public.flock_post_create(text, text, text, text[], uuid, boolean) from public, anon;
revoke all on function public.flock_post_edit(uuid, text, text) from public, anon;
revoke all on function public.flock_post_delete(uuid) from public, anon;
revoke all on function public.flock_comment_create(text, uuid, uuid, text, text, boolean) from public, anon;
revoke all on function public.flock_comment_edit(uuid, text) from public, anon;
revoke all on function public.flock_comment_delete(uuid) from public, anon;
revoke all on function public.flock_react(text, uuid, text, boolean) from public, anon;
revoke all on function public.admin_set_flock_limit(text, integer) from public, anon;
revoke all on function public.admin_add_vet_sign(text) from public, anon;
revoke all on function public.admin_remove_vet_sign(text) from public, anon;
grant execute on function public.flock_feed(text, timestamptz, integer) to authenticated, service_role;
grant execute on function public.flock_post(uuid) to authenticated, service_role;
grant execute on function public.flock_comments_for(text, uuid) to authenticated, service_role;
grant execute on function public.flock_comment_counts(text, uuid[]) to authenticated, service_role;
grant execute on function public.flock_reactors(text, uuid) to authenticated, service_role;
grant execute on function public.flock_media_refs(uuid[], uuid[]) to authenticated, service_role;
grant execute on function public.flock_vet_signs() to authenticated, service_role;
grant execute on function public.flock_post_create(text, text, text, text[], uuid, boolean) to authenticated, service_role;
grant execute on function public.flock_post_edit(uuid, text, text) to authenticated, service_role;
grant execute on function public.flock_post_delete(uuid) to authenticated, service_role;
grant execute on function public.flock_comment_create(text, uuid, uuid, text, text, boolean) to authenticated, service_role;
grant execute on function public.flock_comment_edit(uuid, text) to authenticated, service_role;
grant execute on function public.flock_comment_delete(uuid) to authenticated, service_role;
grant execute on function public.flock_react(text, uuid, text, boolean) to authenticated, service_role;
grant execute on function public.admin_set_flock_limit(text, integer) to authenticated, service_role;
grant execute on function public.admin_add_vet_sign(text) to authenticated, service_role;
grant execute on function public.admin_remove_vet_sign(text) to authenticated, service_role;
