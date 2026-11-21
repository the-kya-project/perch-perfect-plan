-- The Flock, step 4 (PR B): reporting, the review queue, and in-app
-- notifications. Additive only: new tables and functions, plus new versions of
-- Flock functions from steps 3 and 4A so hidden or removed content stops
-- showing (journey_view_updates, journey_milestone_cards, journey_clip_refs,
-- flock_post_visible, flock_subject_visible, flock_comments_for) and a
-- trigger on Flock tables to send notifications. No care-app table, policy,
-- trigger or function changes.
--
-- Reports: any Flock member can report a post, comment or journey update
-- (once each). Content stays up until open reports reach
-- flock_moderation_settings.report_threshold (default 3), then it's hidden
-- from everyone but its author (and, for a journey update, the bird's
-- household) until reviewed. "Remove it" hides it for good; "Keep it" closes
-- the reports and shows it again; "Message them" sends the author an in-app
-- notice and leaves it in the queue.
-- Review queue (/admin/review): Do good posts waiting for review, and reported
-- content. private.can_review() is admins today; a row in flock_reviewers
-- (optionally limited to a chapter) is how a chapter lead gets access later.
-- Notifications: replies, cheers, review results, new clips in followed
-- journeys, chapter posts and notices. Written only when the recipient may
-- see the content, and checked again when read. Separate from care reminders;
-- no push or email yet.


-- 1) Settings and reviewers ---------------------------------------------------------------

create table if not exists public.flock_moderation_settings (
  id               boolean primary key default true check (id),
  report_threshold integer not null default 3 check (report_threshold between 1 and 100),
  updated_at       timestamptz not null default now(),
  updated_by       uuid references auth.users(id) on delete set null
);
insert into public.flock_moderation_settings (id) values (true) on conflict (id) do nothing;

-- Who reviews besides admins. region_slug null = every chapter.
create table if not exists public.flock_reviewers (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  region_slug text references public.regions(slug),
  created_at  timestamptz not null default now()
);

alter table public.flock_moderation_settings enable row level security;
alter table public.flock_reviewers enable row level security;
revoke all on public.flock_moderation_settings, public.flock_reviewers from anon, authenticated;
grant select, insert, update, delete on public.flock_moderation_settings, public.flock_reviewers to service_role;
drop policy if exists "flock_moderation_settings no direct access" on public.flock_moderation_settings;
create policy "flock_moderation_settings no direct access" on public.flock_moderation_settings for select to authenticated using (false);
drop policy if exists "flock_reviewers no direct access" on public.flock_reviewers;
create policy "flock_reviewers no direct access" on public.flock_reviewers for select to authenticated using (false);

create or replace function private.can_review(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user_id is not null and (private.is_admin(p_user_id)
    or exists (select 1 from public.flock_reviewers r where r.user_id = p_user_id));
$$;

-- A reviewer limited to a chapter sees only items by members of that chapter.
create or replace function private.reviewer_covers(p_user_id uuid, p_author_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_admin(p_user_id) or exists (
    select 1 from public.flock_reviewers r
    where r.user_id = p_user_id
      and (r.region_slug is null
           or r.region_slug = (select fp.region_slug from public.flock_profiles fp where fp.user_id = p_author_id))
  );
$$;

create or replace function private.assert_can_review()
returns void
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if not private.can_review(auth.uid()) then
    raise exception 'reviewers only' using errcode = '42501';
  end if;
end;
$$;

revoke all on function private.can_review(uuid) from public, anon;
revoke all on function private.reviewer_covers(uuid, uuid) from public, anon;
revoke all on function private.assert_can_review() from public, anon;
grant execute on function private.can_review(uuid) to authenticated, service_role;
grant execute on function private.reviewer_covers(uuid, uuid) to authenticated, service_role;
grant execute on function private.assert_can_review() to authenticated, service_role;


-- 2) Reports and moderation state ---------------------------------------------------------

create table if not exists public.flock_reports (
  id           uuid primary key default gen_random_uuid(),
  subject_type text not null check (subject_type in ('post', 'comment', 'journey_update')),
  subject_id   uuid not null,
  reporter_id  uuid not null references auth.users(id) on delete cascade,
  reason       text not null check (reason in ('unkind', 'unsafe', 'spam', 'other')),
  note         text check (note is null or length(note) <= 500),
  created_at   timestamptz not null default now(),
  -- Set when a reviewer removes or keeps the content.
  resolved_at  timestamptz,
  resolution   text check (resolution is null or resolution in ('removed', 'kept')),
  unique (subject_type, subject_id, reporter_id)
);
create index if not exists flock_reports_open_idx on public.flock_reports (subject_type, subject_id) where resolved_at is null;

-- hidden = waiting for review after enough reports; removed = taken down.
create table if not exists public.flock_moderation (
  subject_type text not null check (subject_type in ('post', 'comment', 'journey_update')),
  subject_id   uuid not null,
  state        text not null check (state in ('hidden', 'removed')),
  updated_at   timestamptz not null default now(),
  updated_by   uuid references auth.users(id) on delete set null,
  -- "Message them": when the author was last sent a notice about it.
  messaged_at  timestamptz,
  primary key (subject_type, subject_id)
);

alter table public.flock_reports enable row level security;
alter table public.flock_moderation enable row level security;
revoke all on public.flock_reports, public.flock_moderation from anon, authenticated;
grant select, insert, update, delete on public.flock_reports, public.flock_moderation to service_role;
drop policy if exists "flock_reports no direct access" on public.flock_reports;
create policy "flock_reports no direct access" on public.flock_reports for select to authenticated using (false);
drop policy if exists "flock_moderation no direct access" on public.flock_moderation;
create policy "flock_moderation no direct access" on public.flock_moderation for select to authenticated using (false);

create or replace function private.flock_is_hidden(p_type text, p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.flock_moderation m where m.subject_type = p_type and m.subject_id = p_id);
$$;

revoke all on function private.flock_is_hidden(text, uuid) from public, anon;
grant execute on function private.flock_is_hidden(text, uuid) to authenticated, service_role;


-- 3) Visibility, now with moderation -------------------------------------------------------
-- Same rules as 20261108100000, plus: hidden or removed content shows only to
-- its author.

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
            and not private.flock_is_hidden('post', p.id)
            and (p.space <> 'chapter'
                 or p.region_slug = (select fp.region_slug from public.flock_profiles fp where fp.user_id = p_user_id)))
      )
  );
$$;

create or replace function private.flock_subject_visible(p_user_id uuid, p_type text, p_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_journey uuid;
  v_bird uuid;
  v_author uuid;
  c public.flock_comments;
begin
  if p_user_id is null or not private.can_use_flock(p_user_id) then
    return false;
  end if;
  if p_type = 'post' then
    return private.flock_post_visible(p_user_id, p_id);
  elsif p_type = 'journey_update' then
    select u.journey_id, u.bird_id, u.author_id into v_journey, v_bird, v_author from public.journey_updates u where u.id = p_id;
    return v_journey is not null and private.journey_viewable(p_user_id, v_journey)
       and (not private.flock_is_hidden('journey_update', p_id)
            or v_author = p_user_id or private.has_bird_access(v_bird, p_user_id) is not null);
  elsif p_type = 'journey_milestone' then
    select m.journey_id into v_journey from public.journey_milestones m where m.id = p_id and m.state = 'reached';
    return v_journey is not null and private.journey_viewable(p_user_id, v_journey);
  elsif p_type = 'comment' then
    select * into c from public.flock_comments x where x.id = p_id;
    if c.id is null then return false; end if;
    return (c.author_id = p_user_id
            or (c.status = 'live' and private.can_use_flock(c.author_id) and not private.flock_is_hidden('comment', c.id)))
       and private.flock_subject_visible(p_user_id, c.subject_type, c.subject_id);
  end if;
  return false;
end;
$$;

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
      and (c.author_id = auth.uid()
           or (c.status = 'live' and private.can_use_flock(c.author_id) and not private.flock_is_hidden('comment', c.id)))
      -- A reply shows only while its thread's top comment does.
      and (c.parent_id is null or exists (
            select 1 from public.flock_comments pc where pc.id = c.parent_id
              and (pc.author_id = auth.uid()
                   or (pc.status = 'live' and private.can_use_flock(pc.author_id) and not private.flock_is_hidden('comment', pc.id)))))
    order by c.created_at, c.id;
end;
$$;

-- Journey updates: a hidden or removed update shows only to its author and the
-- bird's household. (Step 3's functions, with that one filter added.)
create or replace function private.journey_view_updates(p_journey_id uuid)
returns table (
  update_id uuid, has_clip boolean, caption text, is_question boolean, is_day_one boolean, is_milestone boolean,
  milestone_position integer, created_at timestamptz,
  great_job integer, been_there integer, rooting_for_you integer, love_this integer, mine text[]
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.assert_can_use_journeys();
  if not private.journey_viewable(auth.uid(), p_journey_id) then
    return;
  end if;
  return query
    select u.id, u.clip_ref is not null, u.caption, u.is_question, u.is_day_one,
           exists (select 1 from public.journey_milestones m
                   where m.journey_id = u.journey_id and m.position = u.milestone_position and m.state = 'reached'
                     and m.reached_at between u.created_at and u.created_at + interval '1 hour'),
           u.milestone_position, u.created_at,
           (select count(*)::integer from public.flock_reactions r where r.subject_type = 'journey_update' and r.subject_id = u.id and r.kind = 'great_job'),
           (select count(*)::integer from public.flock_reactions r where r.subject_type = 'journey_update' and r.subject_id = u.id and r.kind = 'been_there'),
           (select count(*)::integer from public.flock_reactions r where r.subject_type = 'journey_update' and r.subject_id = u.id and r.kind = 'rooting_for_you'),
           (select count(*)::integer from public.flock_reactions r where r.subject_type = 'journey_update' and r.subject_id = u.id and r.kind = 'love_this'),
           coalesce((select array_agg(r.kind order by r.kind) from public.flock_reactions r
                     where r.subject_type = 'journey_update' and r.subject_id = u.id and r.user_id = auth.uid()), '{}')
    from public.journey_updates u
    where u.journey_id = p_journey_id
      and (not private.flock_is_hidden('journey_update', u.id)
           or u.author_id = auth.uid() or private.has_bird_access(u.bird_id, auth.uid()) is not null)
    order by u.created_at desc;
end;
$$;

create or replace function private.journey_milestone_cards(p_limit integer)
returns table (
  journey_id uuid, milestone_id uuid, bird_id uuid, bird_name text, bird_has_photo boolean, skill text, owner_name text, owner_region text,
  milestone_position integer, total integer, title text, reached_at timestamptz, update_id uuid, caption text, has_clip boolean,
  great_job integer, been_there integer, rooting_for_you integer, love_this integer, mine text[]
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.assert_can_use_journeys();
  return query
    select c.journey_id, m.id, c.bird_id, c.bird_name, c.bird_has_photo, c.skill, c.owner_name, rg.name,
           m.position, c.total, m.title, m.reached_at, u.id, u.caption, coalesce(u.clip_ref is not null, false),
           (select count(*)::integer from public.flock_reactions r where r.subject_type = 'journey_milestone' and r.subject_id = m.id and r.kind = 'great_job'),
           (select count(*)::integer from public.flock_reactions r where r.subject_type = 'journey_milestone' and r.subject_id = m.id and r.kind = 'been_there'),
           (select count(*)::integer from public.flock_reactions r where r.subject_type = 'journey_milestone' and r.subject_id = m.id and r.kind = 'rooting_for_you'),
           (select count(*)::integer from public.flock_reactions r where r.subject_type = 'journey_milestone' and r.subject_id = m.id and r.kind = 'love_this'),
           coalesce((select array_agg(r.kind order by r.kind) from public.flock_reactions r
                     where r.subject_type = 'journey_milestone' and r.subject_id = m.id and r.user_id = auth.uid()), '{}')
    from private.journey_card_rows(auth.uid()) c
    join public.journey_milestones m on m.journey_id = c.journey_id and m.state = 'reached'
    left join public.flock_profiles fp on fp.user_id = c.owner_id
    left join public.regions rg on rg.slug = fp.region_slug
    left join lateral (
      select uu.id, uu.caption, uu.clip_ref from public.journey_updates uu
      where uu.journey_id = c.journey_id and uu.milestone_position = m.position and uu.created_at <= m.reached_at
        and (not private.flock_is_hidden('journey_update', uu.id)
             or uu.author_id = auth.uid() or private.has_bird_access(uu.bird_id, auth.uid()) is not null)
      order by uu.created_at desc limit 1
    ) u on true
    where c.following
    order by m.reached_at desc
    limit least(greatest(coalesce(p_limit, 20), 1), 100);
end;
$$;

create or replace function private.journey_clip_refs(p_journey_id uuid, p_update_ids uuid[])
returns table (update_id uuid, clip_ref text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.assert_can_use_journeys();
  if not private.journey_viewable(auth.uid(), p_journey_id) then
    raise exception 'journey not found' using errcode = 'P0002';
  end if;
  return query
    select u.id, u.clip_ref from public.journey_updates u
    where u.journey_id = p_journey_id and u.clip_ref is not null
      and (p_update_ids is null or u.id = any (p_update_ids))
      and (not private.flock_is_hidden('journey_update', u.id)
           or u.author_id = auth.uid() or private.has_bird_access(u.bird_id, auth.uid()) is not null);
end;
$$;


-- 4) Notifications --------------------------------------------------------------------------

create table if not exists public.flock_notifications (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  -- reply = a comment on your post/journey or a reply to your comment;
  -- cheer = a reaction on your post, comment, journey update or milestone;
  -- review = your Do good post approved / needs changes / declined;
  -- clip = a new clip in a journey you follow; chapter = a new post in your
  -- chapter; notice = a note from a reviewer about something you posted.
  kind         text not null check (kind in ('reply', 'cheer', 'review', 'clip', 'chapter', 'notice')),
  actor_id     uuid references auth.users(id) on delete cascade,
  -- What it's about (where tapping goes).
  subject_type text not null check (subject_type in ('post', 'comment', 'journey_update', 'journey_milestone')),
  subject_id   uuid not null,
  -- reply: 'comment' or 'reply'; review: 'approved' | 'changes_requested' | 'declined'; cheer: the reaction.
  detail       text,
  -- review (changes requested) and notice: the reviewer's note.
  note         text check (note is null or length(note) <= 1000),
  -- The moment it happened (not the transaction's start), so the newest is first.
  created_at   timestamptz not null default clock_timestamp(),
  read_at      timestamptz
);
create index if not exists flock_notifications_user_idx on public.flock_notifications (user_id, created_at desc);

alter table public.flock_notifications enable row level security;
revoke all on public.flock_notifications from anon, authenticated;
grant select, insert, update, delete on public.flock_notifications to service_role;
drop policy if exists "flock_notifications no direct access" on public.flock_notifications;
create policy "flock_notifications no direct access" on public.flock_notifications for select to authenticated using (false);

-- One notification, only if the recipient may see what it's about.
create or replace function private.flock_notify(
  p_user uuid, p_kind text, p_actor uuid, p_type text, p_id uuid, p_detail text, p_note text
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if p_user is null or p_user = p_actor then return; end if;
  if not private.flock_subject_visible(p_user, p_type, p_id) then return; end if;
  insert into public.flock_notifications (user_id, kind, actor_id, subject_type, subject_id, detail, note)
  values (p_user, p_kind, p_actor, p_type, p_id, p_detail, p_note);
end;
$$;

revoke all on function private.flock_notify(uuid, text, uuid, text, uuid, text, text) from public, anon, authenticated;
grant execute on function private.flock_notify(uuid, text, uuid, text, uuid, text, text) to service_role;

-- Who owns a subject (the person a reply or cheer is for).
create or replace function private.flock_subject_owner(p_type text, p_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select case p_type
    when 'post' then (select p.author_id from public.flock_posts p where p.id = p_id)
    when 'comment' then (select c.author_id from public.flock_comments c where c.id = p_id)
    when 'journey_update' then (select u.author_id from public.journey_updates u where u.id = p_id)
    when 'journey_milestone' then (select j.created_by from public.journey_milestones m join public.journeys j on j.id = m.journey_id where m.id = p_id)
  end;
$$;

revoke all on function private.flock_subject_owner(text, uuid) from public, anon, authenticated;
grant execute on function private.flock_subject_owner(text, uuid) to service_role;

create or replace function private.flock_on_comment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := private.flock_subject_owner(new.subject_type, new.subject_id);
begin
  -- A reply tells the person answered; a comment tells the post's or journey's owner.
  if new.reply_to_user is not null then
    perform private.flock_notify(new.reply_to_user, 'reply', new.author_id, 'comment', new.id, 'reply', null);
  end if;
  if v_owner is distinct from new.reply_to_user then
    perform private.flock_notify(v_owner, 'reply', new.author_id, 'comment', new.id, 'comment', null);
  end if;
  return new;
end;
$$;

create or replace function private.flock_on_reaction()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.flock_notify(private.flock_subject_owner(new.subject_type, new.subject_id), 'cheer', new.user_id,
                               new.subject_type, new.subject_id, new.kind, null);
  return new;
end;
$$;

-- A new clip in a journey: everyone following it.
create or replace function private.flock_on_journey_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  f record;
begin
  if new.clip_ref is null then return new; end if;
  for f in select jf.user_id from public.journey_follows jf where jf.journey_id = new.journey_id loop
    perform private.flock_notify(f.user_id, 'clip', new.author_id, 'journey_update', new.id, null, null);
  end loop;
  return new;
end;
$$;

-- Chapter news: a new post in your chapter reaches its members.
create or replace function private.flock_on_post()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  f record;
begin
  if new.space <> 'chapter' or new.status <> 'live' then return new; end if;
  for f in select fp.user_id from public.flock_profiles fp where fp.region_slug = new.region_slug and fp.user_id <> new.author_id loop
    perform private.flock_notify(f.user_id, 'chapter', new.author_id, 'post', new.id, null, null);
  end loop;
  return new;
end;
$$;

revoke all on function private.flock_on_comment() from public, anon, authenticated;
revoke all on function private.flock_on_reaction() from public, anon, authenticated;
revoke all on function private.flock_on_journey_update() from public, anon, authenticated;
revoke all on function private.flock_on_post() from public, anon, authenticated;

drop trigger if exists flock_comments_notify on public.flock_comments;
create trigger flock_comments_notify after insert on public.flock_comments
  for each row execute function private.flock_on_comment();
drop trigger if exists flock_reactions_notify on public.flock_reactions;
create trigger flock_reactions_notify after insert on public.flock_reactions
  for each row execute function private.flock_on_reaction();
drop trigger if exists journey_updates_notify on public.journey_updates;
create trigger journey_updates_notify after insert on public.journey_updates
  for each row execute function private.flock_on_journey_update();
drop trigger if exists flock_posts_notify on public.flock_posts;
create trigger flock_posts_notify after insert on public.flock_posts
  for each row execute function private.flock_on_post();

-- Notifications go when what they're about goes.
create or replace function private.flock_notifications_cleanup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.flock_notifications n where n.subject_type = tg_argv[0] and n.subject_id = old.id;
  return old;
end;
$$;
revoke all on function private.flock_notifications_cleanup() from public, anon, authenticated;
drop trigger if exists flock_posts_notifications_cleanup on public.flock_posts;
create trigger flock_posts_notifications_cleanup after delete on public.flock_posts
  for each row execute function private.flock_notifications_cleanup('post');
drop trigger if exists flock_comments_notifications_cleanup on public.flock_comments;
create trigger flock_comments_notifications_cleanup after delete on public.flock_comments
  for each row execute function private.flock_notifications_cleanup('comment');
drop trigger if exists journey_updates_notifications_cleanup on public.journey_updates;
create trigger journey_updates_notifications_cleanup after delete on public.journey_updates
  for each row execute function private.flock_notifications_cleanup('journey_update');
drop trigger if exists journey_milestones_notifications_cleanup on public.journey_milestones;
create trigger journey_milestones_notifications_cleanup after delete on public.journey_milestones
  for each row execute function private.flock_notifications_cleanup('journey_milestone');

-- The notifications screen. Cheers on the same thing on the same day are one
-- row ("12 people cheered…"). Everything is checked again against what the
-- caller may see now. p_filter: all | replies | cheers | chapter.
create or replace function private.flock_notifications_list(p_filter text, p_limit integer)
returns table (
  ids uuid[], kind text, actor_name text, others integer, subject_type text, subject_id uuid, detail text, note text,
  -- Where it leads and what it's about.
  post_id uuid, post_title text, post_space text, journey_id uuid, bird_name text, skill text, milestone_title text,
  region_name text, created_at timestamptz, unread boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.assert_can_use_flock();
  return query
  with mine as (
    select n.* from public.flock_notifications n
    where n.user_id = auth.uid()
      and (p_filter is null or p_filter = 'all'
           or (p_filter = 'replies' and n.kind = 'reply')
           or (p_filter = 'cheers' and n.kind = 'cheer')
           or (p_filter = 'chapter' and n.kind = 'chapter'))
      and n.created_at > now() - interval '60 days'
  ),
  grouped as (
    select array_agg(m.id order by m.created_at desc) as ids, m.kind,
           (array_agg(m.actor_id order by m.created_at desc))[1] as actor_id,
           greatest(count(distinct m.actor_id) - 1, 0)::integer as others,
           m.subject_type, m.subject_id,
           (array_agg(m.detail order by m.created_at desc))[1] as detail,
           (array_agg(m.note order by m.created_at desc))[1] as note,
           max(m.created_at) as created_at, bool_or(m.read_at is null) as unread
    from mine m
    group by m.kind, m.subject_type, m.subject_id,
             case when m.kind = 'cheer' then date_trunc('day', m.created_at) end,
             case when m.kind = 'cheer' then null else m.id end
  )
  select g.ids, g.kind, fp.display_name, g.others, g.subject_type, g.subject_id, g.detail, g.note,
         coalesce(p.id, cp.id), coalesce(p.title, left(p.body, 80), cp.title, left(cp.body, 80)), coalesce(p.space, cp.space),
         j.id, b.name::text, coalesce(t.name, j.custom_name), jm.title, rg.name,
         g.created_at, g.unread
  from grouped g
  left join public.flock_profiles fp on fp.user_id = g.actor_id
  left join public.flock_posts p on g.subject_type = 'post' and p.id = g.subject_id
  left join public.flock_comments c on g.subject_type = 'comment' and c.id = g.subject_id
  left join public.flock_posts cp on c.subject_type = 'post' and cp.id = c.subject_id
  left join public.journey_updates ju on (g.subject_type = 'journey_update' and ju.id = g.subject_id)
                                      or (c.subject_type = 'journey_update' and ju.id = c.subject_id)
  left join public.journey_milestones jm on (g.subject_type = 'journey_milestone' and jm.id = g.subject_id)
                                         or (c.subject_type = 'journey_milestone' and jm.id = c.subject_id)
  left join public.journeys j on j.id = coalesce(ju.journey_id, jm.journey_id)
  left join public.birds b on b.id = j.bird_id
  left join public.journey_templates t on t.id = j.template_id
  left join public.regions rg on rg.slug = coalesce(p.region_slug, cp.region_slug)
  where g.kind in ('review', 'notice') and (p.author_id = auth.uid() or c.author_id = auth.uid() or ju.author_id = auth.uid())
     or private.flock_subject_visible(auth.uid(), g.subject_type, g.subject_id)
  order by g.created_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 100);
end;
$$;

create or replace function private.flock_notifications_mark_read(p_ids uuid[])
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.assert_can_use_flock();
  update public.flock_notifications n set read_at = now()
  where n.user_id = auth.uid() and n.read_at is null and (p_ids is null or n.id = any (p_ids));
end;
$$;

create or replace function private.flock_notifications_unread()
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.assert_can_use_flock();
  return (select count(*)::integer from public.flock_notifications n where n.user_id = auth.uid() and n.read_at is null);
end;
$$;

revoke all on function private.flock_notifications_list(text, integer) from public, anon;
revoke all on function private.flock_notifications_mark_read(uuid[]) from public, anon;
revoke all on function private.flock_notifications_unread() from public, anon;
grant execute on function private.flock_notifications_list(text, integer) to authenticated, service_role;
grant execute on function private.flock_notifications_mark_read(uuid[]) to authenticated, service_role;
grant execute on function private.flock_notifications_unread() to authenticated, service_role;


-- 5) Reporting ------------------------------------------------------------------------------

create or replace function private.flock_report(p_subject_type text, p_subject_id uuid, p_reason text, p_note text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_threshold integer;
  v_open integer;
begin
  perform private.assert_can_use_flock();
  if p_subject_type is null or p_subject_type not in ('post', 'comment', 'journey_update')
     or not private.flock_subject_visible(auth.uid(), p_subject_type, p_subject_id) then
    raise exception 'not found' using errcode = 'P0002';
  end if;
  if private.flock_subject_owner(p_subject_type, p_subject_id) = auth.uid() then
    raise exception 'you can''t report your own post' using errcode = '22023';
  end if;
  if p_reason is null or p_reason not in ('unkind', 'unsafe', 'spam', 'other') then
    raise exception 'pick a reason' using errcode = '22023';
  end if;
  insert into public.flock_reports (subject_type, subject_id, reporter_id, reason, note)
  values (p_subject_type, p_subject_id, auth.uid(), p_reason, nullif(left(btrim(coalesce(p_note, '')), 500), ''))
  on conflict (subject_type, subject_id, reporter_id) do update
    set reason = excluded.reason, note = excluded.note, created_at = now(), resolved_at = null, resolution = null;
  select s.report_threshold into v_threshold from public.flock_moderation_settings s;
  select count(*) into v_open from public.flock_reports r
  where r.subject_type = p_subject_type and r.subject_id = p_subject_id and r.resolved_at is null;
  if v_open >= coalesce(v_threshold, 3) then
    insert into public.flock_moderation (subject_type, subject_id, state)
    values (p_subject_type, p_subject_id, 'hidden') on conflict (subject_type, subject_id) do nothing;
  end if;
end;
$$;

revoke all on function private.flock_report(text, uuid, text, text) from public, anon;
grant execute on function private.flock_report(text, uuid, text, text) to authenticated, service_role;


-- 6) The review queue ------------------------------------------------------------------------

-- Everything waiting: Do good posts to review, and reported content (open
-- reports). p_filter: all | good | reports.
create or replace function private.flock_review_queue(p_filter text)
returns table (
  item_type text, subject_type text, subject_id uuid, author_id uuid, author_name text, author_region text,
  title text, body text, photo_count integer, created_at timestamptz,
  report_count integer, reasons text[], notes text[], hidden boolean, removed boolean, messaged_at timestamptz,
  post_id uuid, journey_id uuid
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.assert_can_review();
  return query
  select * from (
    select 'good'::text, 'post'::text, p.id, p.author_id, fp.display_name, rg.name, p.title, p.body, cardinality(p.photo_paths), p.created_at,
           0, '{}'::text[], '{}'::text[], false, false, null::timestamptz, p.id, null::uuid
    from public.flock_posts p
    left join public.flock_profiles fp on fp.user_id = p.author_id
    left join public.regions rg on rg.slug = fp.region_slug
    where p.status = 'pending' and coalesce(p_filter, 'all') in ('all', 'good')
      and private.reviewer_covers(auth.uid(), p.author_id)
    union all
    select 'report'::text, r.subject_type, r.subject_id, x.author_id, fp.display_name, rg.name, x.title, x.body, x.photo_count,
           max(r.created_at), count(*)::integer, array_agg(distinct r.reason), array_remove(array_agg(r.note), null),
           coalesce(m.state = 'hidden', false), coalesce(m.state = 'removed', false), m.messaged_at, x.post_id, x.journey_id
    from public.flock_reports r
    cross join lateral (
      select p.author_id, p.title, p.body, cardinality(p.photo_paths) as photo_count, p.id as post_id, null::uuid as journey_id
      from public.flock_posts p where r.subject_type = 'post' and p.id = r.subject_id
      union all
      select c.author_id, null, c.body, (c.photo_path is not null)::integer,
             case when c.subject_type = 'post' then c.subject_id end,
             case when c.subject_type = 'journey_update' then (select u.journey_id from public.journey_updates u where u.id = c.subject_id)
                  when c.subject_type = 'journey_milestone' then (select m2.journey_id from public.journey_milestones m2 where m2.id = c.subject_id) end
      from public.flock_comments c where r.subject_type = 'comment' and c.id = r.subject_id
      union all
      select u.author_id, null, u.caption, (u.clip_ref is not null)::integer, null, u.journey_id
      from public.journey_updates u where r.subject_type = 'journey_update' and u.id = r.subject_id
    ) x
    left join public.flock_moderation m on m.subject_type = r.subject_type and m.subject_id = r.subject_id
    left join public.flock_profiles fp on fp.user_id = x.author_id
    left join public.regions rg on rg.slug = fp.region_slug
    where r.resolved_at is null and coalesce(p_filter, 'all') in ('all', 'reports')
      and private.reviewer_covers(auth.uid(), x.author_id)
    group by r.subject_type, r.subject_id, x.author_id, fp.display_name, rg.name, x.title, x.body, x.photo_count,
             m.state, m.messaged_at, x.post_id, x.journey_id
  ) q
  order by 10 desc;
end;
$$;

create or replace function private.flock_review_counts()
returns table (good integer, reports integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.assert_can_review();
  return query
    select (select count(*)::integer from private.flock_review_queue('good')),
           (select count(*)::integer from private.flock_review_queue('reports'));
end;
$$;

-- Do good: approve, ask for changes (with a note for the author), or decline.
create or replace function private.flock_review_post(p_post_id uuid, p_decision text, p_note text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  p public.flock_posts;
  v_status text;
  v_note text := nullif(left(btrim(coalesce(p_note, '')), 1000), '');
begin
  perform private.assert_can_review();
  select * into p from public.flock_posts x where x.id = p_post_id;
  if p.id is null or p.status <> 'pending' or not private.reviewer_covers(auth.uid(), p.author_id) then
    raise exception 'not found' using errcode = 'P0002';
  end if;
  v_status := case p_decision when 'approve' then 'live' when 'changes' then 'changes_requested' when 'decline' then 'declined' end;
  if v_status is null then
    raise exception 'approve, changes or decline' using errcode = '22023';
  end if;
  if v_status = 'changes_requested' and v_note is null then
    raise exception 'add a note so they know what to change' using errcode = '22023';
  end if;
  update public.flock_posts x
  set status = v_status, review_note = v_note, reviewed_by = auth.uid(), reviewed_at = now()
  where x.id = p.id;
  insert into public.flock_notifications (user_id, kind, actor_id, subject_type, subject_id, detail, note)
  values (p.author_id, 'review', null, 'post', p.id,
          case v_status when 'live' then 'approved' else v_status end, v_note);
end;
$$;

-- Reported content: remove it, keep it (closes the reports), or message the author.
create or replace function private.flock_resolve_report(p_subject_type text, p_subject_id uuid, p_action text, p_note text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_author uuid := private.flock_subject_owner(p_subject_type, p_subject_id);
  v_note text := nullif(left(btrim(coalesce(p_note, '')), 1000), '');
begin
  perform private.assert_can_review();
  if v_author is null or p_subject_type not in ('post', 'comment', 'journey_update')
     or not private.reviewer_covers(auth.uid(), v_author)
     or not exists (select 1 from public.flock_reports r where r.subject_type = p_subject_type and r.subject_id = p_subject_id) then
    raise exception 'not found' using errcode = 'P0002';
  end if;
  if p_action = 'remove' then
    insert into public.flock_moderation (subject_type, subject_id, state, updated_by)
    values (p_subject_type, p_subject_id, 'removed', auth.uid())
    on conflict (subject_type, subject_id) do update set state = 'removed', updated_at = now(), updated_by = auth.uid();
    if p_subject_type = 'post' then update public.flock_posts x set status = 'removed' where x.id = p_subject_id; end if;
    if p_subject_type = 'comment' then update public.flock_comments x set status = 'removed' where x.id = p_subject_id; end if;
    update public.flock_reports r set resolved_at = now(), resolution = 'removed'
    where r.subject_type = p_subject_type and r.subject_id = p_subject_id and r.resolved_at is null;
    if v_note is not null then
      insert into public.flock_notifications (user_id, kind, subject_type, subject_id, detail, note)
      values (v_author, 'notice', p_subject_type, p_subject_id, 'removed', v_note);
    end if;
  elsif p_action = 'keep' then
    delete from public.flock_moderation m where m.subject_type = p_subject_type and m.subject_id = p_subject_id and m.state = 'hidden';
    update public.flock_reports r set resolved_at = now(), resolution = 'kept'
    where r.subject_type = p_subject_type and r.subject_id = p_subject_id and r.resolved_at is null;
  elsif p_action = 'message' then
    if v_note is null then
      raise exception 'write the message' using errcode = '22023';
    end if;
    insert into public.flock_notifications (user_id, kind, subject_type, subject_id, detail, note)
    values (v_author, 'notice', p_subject_type, p_subject_id, 'message', v_note);
    -- Messaging alone never hides anything; it only marks the item as messaged.
    update public.flock_moderation m set messaged_at = now()
    where m.subject_type = p_subject_type and m.subject_id = p_subject_id;
  else
    raise exception 'remove, keep or message' using errcode = '22023';
  end if;
end;
$$;

create or replace function private.flock_can_review()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$ select private.can_review(auth.uid()); $$;

create or replace function private.set_report_threshold(p_threshold integer)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.assert_entitlement_admin();
  if p_threshold is null or p_threshold not between 1 and 100 then
    raise exception 'pick a number from 1 to 100' using errcode = '22023';
  end if;
  update public.flock_moderation_settings s set report_threshold = p_threshold, updated_at = now(), updated_by = auth.uid();
end;
$$;

revoke all on function private.flock_review_queue(text) from public, anon;
revoke all on function private.flock_review_counts() from public, anon;
revoke all on function private.flock_review_post(uuid, text, text) from public, anon;
revoke all on function private.flock_resolve_report(text, uuid, text, text) from public, anon;
revoke all on function private.flock_can_review() from public, anon;
revoke all on function private.set_report_threshold(integer) from public, anon;
grant execute on function private.flock_review_queue(text) to authenticated, service_role;
grant execute on function private.flock_review_counts() to authenticated, service_role;
grant execute on function private.flock_review_post(uuid, text, text) to authenticated, service_role;
grant execute on function private.flock_resolve_report(text, uuid, text, text) to authenticated, service_role;
grant execute on function private.flock_can_review() to authenticated, service_role;
grant execute on function private.set_report_threshold(integer) to authenticated, service_role;


-- 7) Invoker wrappers the app calls -------------------------------------------------------------

create or replace function public.flock_report(p_subject_type text, p_subject_id uuid, p_reason text, p_note text default null)
returns void language sql volatile security invoker set search_path = ''
as $$ select private.flock_report(p_subject_type, p_subject_id, p_reason, p_note); $$;

create or replace function public.flock_notifications_list(p_filter text default 'all', p_limit integer default 50)
returns table (
  ids uuid[], kind text, actor_name text, others integer, subject_type text, subject_id uuid, detail text, note text,
  post_id uuid, post_title text, post_space text, journey_id uuid, bird_name text, skill text, milestone_title text,
  region_name text, created_at timestamptz, unread boolean
) language sql stable security invoker set search_path = ''
as $$ select * from private.flock_notifications_list(p_filter, p_limit); $$;

create or replace function public.flock_notifications_mark_read(p_ids uuid[] default null)
returns void language sql volatile security invoker set search_path = ''
as $$ select private.flock_notifications_mark_read(p_ids); $$;

create or replace function public.flock_notifications_unread()
returns integer language sql stable security invoker set search_path = ''
as $$ select private.flock_notifications_unread(); $$;

create or replace function public.flock_review_queue(p_filter text default 'all')
returns table (
  item_type text, subject_type text, subject_id uuid, author_id uuid, author_name text, author_region text,
  title text, body text, photo_count integer, created_at timestamptz,
  report_count integer, reasons text[], notes text[], hidden boolean, removed boolean, messaged_at timestamptz,
  post_id uuid, journey_id uuid
) language sql stable security invoker set search_path = ''
as $$ select * from private.flock_review_queue(p_filter); $$;

create or replace function public.flock_review_counts()
returns table (good integer, reports integer) language sql stable security invoker set search_path = ''
as $$ select * from private.flock_review_counts(); $$;

create or replace function public.flock_review_post(p_post_id uuid, p_decision text, p_note text default null)
returns void language sql volatile security invoker set search_path = ''
as $$ select private.flock_review_post(p_post_id, p_decision, p_note); $$;

create or replace function public.flock_resolve_report(p_subject_type text, p_subject_id uuid, p_action text, p_note text default null)
returns void language sql volatile security invoker set search_path = ''
as $$ select private.flock_resolve_report(p_subject_type, p_subject_id, p_action, p_note); $$;

create or replace function public.flock_can_review()
returns boolean language sql stable security invoker set search_path = ''
as $$ select private.flock_can_review(); $$;

create or replace function public.admin_set_report_threshold(p_threshold integer)
returns void language sql volatile security invoker set search_path = ''
as $$ select private.set_report_threshold(p_threshold); $$;

revoke all on function public.flock_report(text, uuid, text, text) from public, anon;
revoke all on function public.flock_notifications_list(text, integer) from public, anon;
revoke all on function public.flock_notifications_mark_read(uuid[]) from public, anon;
revoke all on function public.flock_notifications_unread() from public, anon;
revoke all on function public.flock_review_queue(text) from public, anon;
revoke all on function public.flock_review_counts() from public, anon;
revoke all on function public.flock_review_post(uuid, text, text) from public, anon;
revoke all on function public.flock_resolve_report(text, uuid, text, text) from public, anon;
revoke all on function public.flock_can_review() from public, anon;
revoke all on function public.admin_set_report_threshold(integer) from public, anon;
grant execute on function public.flock_report(text, uuid, text, text) to authenticated, service_role;
grant execute on function public.flock_notifications_list(text, integer) to authenticated, service_role;
grant execute on function public.flock_notifications_mark_read(uuid[]) to authenticated, service_role;
grant execute on function public.flock_notifications_unread() to authenticated, service_role;
grant execute on function public.flock_review_queue(text) to authenticated, service_role;
grant execute on function public.flock_review_counts() to authenticated, service_role;
grant execute on function public.flock_review_post(uuid, text, text) to authenticated, service_role;
grant execute on function public.flock_resolve_report(text, uuid, text, text) to authenticated, service_role;
grant execute on function public.flock_can_review() to authenticated, service_role;
grant execute on function public.admin_set_report_threshold(integer) to authenticated, service_role;
