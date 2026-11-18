-- The Flock library: guides, checklists, videos and links that admins write
-- and members read. Additive only: one new table, one new private bucket, new
-- functions. No care-app table, policy, trigger or function changes, and the
-- Flock gate (public.flock_enabled()) is not touched.
--
-- Who can do what (enforced by RLS on the table and on storage.objects):
--   * Admins (private.is_admin) create, edit, publish, unpublish and delete
--     resources, see drafts, and upload, read and remove the bucket's files.
--   * Anyone else who passes the Flock gate AND can use the Flock (a member,
--     once the gate opens) reads published resources and their files, and
--     nothing else. private.can_read_library() is that rule, in one place.
--   * Free users read nothing (their queries return no rows); signed-out
--     visitors have no grant at all.
-- Today the gate is admins only, so in practice only admins can read.
--
-- Reads: the table directly (RLS) for the admin screen; public.flock_library_search
-- and public.flock_library_resource for members (SECURITY INVOKER, so the same
-- RLS applies to whoever calls them). Files: 'flock-library' bucket,
-- "covers/<uuid>.jpg" (re-encoded to JPEG in the browser, so no EXIF/GPS) and
-- "files/<uuid>.pdf"; the app makes one-hour signed links, which storage only
-- signs for someone the read policy lets see the file.
--
-- No resources are seeded.


-- 1) Who may read the library -----------------------------------------------------------

-- Passes the Flock gate (admins only today; the kill switch turns it off) and
-- may use the Flock (member or admin). Widening the gate at launch widens this
-- with it, and only to members.
create or replace function private.can_read_library()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
     and coalesce(public.flock_enabled(), false)
     and private.can_use_flock(auth.uid());
$$;

revoke all on function private.can_read_library() from public, anon;
grant execute on function private.can_read_library() to authenticated, service_role;


-- 2) Resources ----------------------------------------------------------------------------

-- The library's topics are the Library screen's subject chips
-- (LIBRARY_SUBJECTS in src/lib/flockNav.ts); keep the two lists in step.
create table if not exists public.library_resources (
  id              uuid primary key default gen_random_uuid(),
  title           text not null check (length(btrim(title)) between 1 and 140),
  summary         text not null default '' check (length(summary) <= 300),
  -- Markdown: headings, paragraphs, lists, "- [ ]" checklist items, bold,
  -- italics and links. Rendered as text by the app, never as HTML.
  body            text not null default '' check (length(body) <= 60000),
  resource_type   text not null default 'guide' check (resource_type in ('guide', 'checklist', 'video', 'link')),
  topics          text[] not null default '{}'
                  check (topics <@ array['foraging', 'diet', 'training', 'hormones', 'conservation']::text[]),
  species         text[] not null default '{}' check (cardinality(species) <= 12),
  cover_path      text check (cover_path is null or cover_path ~ '^covers/[0-9a-f-]{36}\.jpg$'),
  external_url    text check (external_url is null or (external_url ~* '^https?://[^[:space:]]+$' and length(external_url) <= 2000)),
  attachment_path text check (attachment_path is null or attachment_path ~ '^files/[0-9a-f-]{36}\.pdf$'),
  status          text not null default 'draft' check (status in ('draft', 'published')),
  vet_reviewed    boolean not null default false,
  vet_reviewer    text check (vet_reviewer is null or length(vet_reviewer) between 1 and 120),
  vet_reviewed_on date,
  -- When it first went live. Unpublishing keeps it, so a republished
  -- resource keeps its place in the list.
  published_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  -- A published resource can be found and opened: a summary, at least one
  -- topic (so the subject filters find it), and a link for videos and links.
  constraint library_resources_published_complete check (
    status <> 'published'
    or (length(btrim(summary)) > 0
        and cardinality(topics) > 0
        and published_at is not null
        and (resource_type not in ('video', 'link') or external_url is not null))
  )
);

create index if not exists library_resources_published_idx
  on public.library_resources (published_at desc) where status = 'published';

-- Tidy what's saved: trimmed text, species tags trimmed, blank and duplicate
-- tags dropped (first spelling wins), topics in a fixed order, empty strings
-- as null, and published_at stamped the first time it goes live.
create or replace function private.library_resources_tidy()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.title := btrim(new.title);
  new.summary := btrim(coalesce(new.summary, ''));
  new.body := coalesce(new.body, '');
  new.external_url := nullif(btrim(coalesce(new.external_url, '')), '');
  new.vet_reviewer := nullif(btrim(coalesce(new.vet_reviewer, '')), '');
  new.species := coalesce((
    select array_agg(s.tag order by s.n)
    from (
      select distinct on (lower(btrim(x.tag))) btrim(x.tag) as tag, x.n
      from unnest(coalesce(new.species, '{}'::text[])) with ordinality as x(tag, n)
      where btrim(coalesce(x.tag, '')) <> ''
      order by lower(btrim(x.tag)), x.n
    ) s
  ), '{}'::text[]);
  if exists (select 1 from unnest(new.species) t where length(t) > 60) then
    raise exception 'species tags are at most 60 characters' using errcode = '22001';
  end if;
  new.topics := coalesce((
    select array_agg(t order by array_position(array['foraging', 'diet', 'training', 'hormones', 'conservation']::text[], t))
    from (select distinct t from unnest(coalesce(new.topics, '{}'::text[])) t) d
  ), '{}'::text[]);
  if new.status = 'published' and new.published_at is null then
    new.published_at := now();
  end if;
  if tg_op = 'UPDATE' then
    new.created_at := old.created_at;
  end if;
  return new;
end;
$$;

revoke all on function private.library_resources_tidy() from public, anon;
grant execute on function private.library_resources_tidy() to authenticated, service_role;

drop trigger if exists library_resources_tidy on public.library_resources;
create trigger library_resources_tidy before insert or update on public.library_resources
  for each row execute function private.library_resources_tidy();

drop trigger if exists library_resources_updated_at on public.library_resources;
create trigger library_resources_updated_at before update on public.library_resources
  for each row execute function public.set_updated_at();

-- Access. The default ACL gives anon/authenticated everything on new public
-- tables, so start from nothing: signed-out visitors get no grant at all, and
-- signed-in accounts get only what the policies below allow.
alter table public.library_resources enable row level security;
revoke all on public.library_resources from public, anon, authenticated;
grant select, insert, update, delete on public.library_resources to authenticated;
grant select, insert, update, delete on public.library_resources to service_role;

drop policy if exists "library_resources admins read" on public.library_resources;
drop policy if exists "library_resources readers see published" on public.library_resources;
drop policy if exists "library_resources admins insert" on public.library_resources;
drop policy if exists "library_resources admins update" on public.library_resources;
drop policy if exists "library_resources admins delete" on public.library_resources;

create policy "library_resources admins read" on public.library_resources
  for select to authenticated using (private.is_admin(auth.uid()));
create policy "library_resources readers see published" on public.library_resources
  for select to authenticated using (status = 'published' and private.can_read_library());
create policy "library_resources admins insert" on public.library_resources
  for insert to authenticated with check (private.is_admin(auth.uid()));
create policy "library_resources admins update" on public.library_resources
  for update to authenticated using (private.is_admin(auth.uid())) with check (private.is_admin(auth.uid()));
create policy "library_resources admins delete" on public.library_resources
  for delete to authenticated using (private.is_admin(auth.uid()));


-- 3) Files: private 'flock-library' bucket ---------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('flock-library', 'flock-library', false, 26214400, array['image/jpeg', 'application/pdf'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- A file a library reader may open: the cover or attachment of a published
-- resource, for someone who passes the library's read rule.
create or replace function private.library_file_readable(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_name is not null
     and private.can_read_library()
     and exists (
       select 1 from public.library_resources r
       where r.status = 'published' and (r.cover_path = p_name or r.attachment_path = p_name)
     );
$$;

revoke all on function private.library_file_readable(text) from public, anon;
grant execute on function private.library_file_readable(text) to authenticated, service_role;

drop policy if exists "flock-library read" on storage.objects;
drop policy if exists "flock-library admins insert" on storage.objects;
drop policy if exists "flock-library admins update" on storage.objects;
drop policy if exists "flock-library admins delete" on storage.objects;

create policy "flock-library read" on storage.objects for select to authenticated
  using (bucket_id = 'flock-library'
         and (private.is_admin(auth.uid()) or private.library_file_readable(name)));
create policy "flock-library admins insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'flock-library'
              and private.is_admin(auth.uid())
              and (name ~ '^covers/[0-9a-f-]{36}\.jpg$' or name ~ '^files/[0-9a-f-]{36}\.pdf$'));
create policy "flock-library admins update" on storage.objects for update to authenticated
  using (bucket_id = 'flock-library' and private.is_admin(auth.uid()))
  with check (bucket_id = 'flock-library' and private.is_admin(auth.uid()));
create policy "flock-library admins delete" on storage.objects for delete to authenticated
  using (bucket_id = 'flock-library' and private.is_admin(auth.uid()));


-- 4) Member reads (SECURITY INVOKER: the table's RLS decides what comes back) -------------------

-- Published resources, newest first. p_q: every word must appear in the
-- title, summary, body or a species tag (case-insensitive; % and _ are
-- literal). p_type / p_topic: one type and one topic, or null for any.
create or replace function public.flock_library_search(
  p_q text default null, p_type text default null, p_topic text default null, p_limit integer default 100
)
returns table (
  id uuid, title text, summary text, resource_type text, topics text[], species text[],
  cover_path text, has_attachment boolean, vet_reviewed boolean, published_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select r.id, r.title, r.summary, r.resource_type, r.topics, r.species,
         r.cover_path, r.attachment_path is not null, r.vet_reviewed, r.published_at
  from public.library_resources r
  where r.status = 'published'
    and (p_type is null or r.resource_type = p_type)
    and (p_topic is null or p_topic = any (r.topics))
    and not exists (
      select 1
      from regexp_split_to_table(btrim(coalesce(left(p_q, 100), '')), '[[:space:]]+') as w(word)
      where w.word <> ''
        and not (
          concat_ws(' ', r.title, r.summary, r.body, array_to_string(r.species, ' '))
          ilike '%' || replace(replace(replace(w.word, '\', '\\'), '%', '\%'), '_', '\_') || '%'
        )
    )
  order by r.published_at desc, r.id
  limit least(greatest(coalesce(p_limit, 100), 1), 200);
$$;

-- One published resource, in full. No row when it doesn't exist, isn't
-- published, or the caller may not read the library.
create or replace function public.flock_library_resource(p_id uuid)
returns table (
  id uuid, title text, summary text, body text, resource_type text, topics text[], species text[],
  cover_path text, external_url text, attachment_path text,
  vet_reviewed boolean, vet_reviewer text, vet_reviewed_on date, published_at timestamptz, updated_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select r.id, r.title, r.summary, r.body, r.resource_type, r.topics, r.species,
         r.cover_path, r.external_url, r.attachment_path,
         r.vet_reviewed, r.vet_reviewer, r.vet_reviewed_on, r.published_at, r.updated_at
  from public.library_resources r
  where r.id = p_id and r.status = 'published';
$$;

revoke all on function public.flock_library_search(text, text, text, integer) from public, anon;
revoke all on function public.flock_library_resource(uuid) from public, anon;
grant execute on function public.flock_library_search(text, text, text, integer) to authenticated, service_role;
grant execute on function public.flock_library_resource(uuid) to authenticated, service_role;
