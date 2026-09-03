-- Journal attachments: several documents (vet records, lab results, discharge
-- summaries) per journal entry. Additive — journal_entries.photo_path and the
-- journal-photos bucket are untouched and keep working exactly as before.
--
-- Files live in a NEW private bucket `journal-attachments`, keyed
-- "<bird_id>/<uuid>.<ext>" exactly like journal-photos. A separate bucket is
-- needed because journal-photos restricts allowed_mime_types to images, so a
-- PDF would be rejected by the bucket before RLS ever ran; widening that shared
-- bucket would change guarantees for the existing photo path. The storage
-- policies below are the proven journal-photos predicate verbatim (bird access
-- on folder[1]) — only the bucket id differs.

create table if not exists public.journal_attachments (
  id                uuid primary key default gen_random_uuid(),
  journal_entry_id  uuid not null references public.journal_entries(id) on delete cascade,
  -- Denormalised from the entry so every RLS check and bird-scoped sweep can
  -- filter without a join, matching every other bird-scoped child table.
  bird_id           uuid not null references public.birds(id) on delete cascade,
  storage_path      text not null unique,
  file_name         text not null,
  mime_type         text not null,
  size_bytes        bigint not null check (size_bytes > 0),
  -- Mirrors journal_entries.logged_by: plain uuid, no FK to auth.users.
  uploaded_by       uuid,
  created_at        timestamptz not null default now()
);

create index if not exists journal_attachments_entry_idx on public.journal_attachments (journal_entry_id);
create index if not exists journal_attachments_bird_idx  on public.journal_attachments (bird_id, created_at desc);

alter table public.journal_attachments enable row level security;

-- Mirrors journal_entries exactly: read on 'view', write on 'record_health',
-- delete owner-only.
drop policy if exists "journal_attachments read" on public.journal_attachments;
create policy "journal_attachments read" on public.journal_attachments
  for select using (private.has_capability(bird_id, (select auth.uid()), 'view'));

drop policy if exists "journal_attachments insert" on public.journal_attachments;
create policy "journal_attachments insert" on public.journal_attachments
  for insert with check (private.has_capability(bird_id, (select auth.uid()), 'record_health'));

drop policy if exists "journal_attachments update" on public.journal_attachments;
create policy "journal_attachments update" on public.journal_attachments
  for update using (private.has_capability(bird_id, (select auth.uid()), 'record_health'))
  with check (private.has_capability(bird_id, (select auth.uid()), 'record_health'));

drop policy if exists "journal_attachments delete" on public.journal_attachments;
create policy "journal_attachments delete" on public.journal_attachments
  for delete using (exists (
    select 1 from public.birds b
    where b.id = journal_attachments.bird_id and b.owner_id = (select auth.uid())
  ));

-- 25 MB: PDFs have no client-side compression path, and multi-page scanned vet
-- records routinely exceed the 10 MB image ceiling. PDF-only for now; widening
-- is a bucket update, not a migration.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('journal-attachments', 'journal-attachments', false, 26214400, array['application/pdf'])
on conflict (id) do nothing;

drop policy if exists "journal-attachments member read" on storage.objects;
create policy "journal-attachments member read" on storage.objects for select to authenticated
  using (bucket_id = 'journal-attachments'
         and private.has_bird_access(public.safe_uuid((storage.foldername(name))[1]), auth.uid()) is not null);

drop policy if exists "journal-attachments member insert" on storage.objects;
create policy "journal-attachments member insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'journal-attachments'
              and private.has_bird_access(public.safe_uuid((storage.foldername(name))[1]), auth.uid()) is not null);

drop policy if exists "journal-attachments member update" on storage.objects;
create policy "journal-attachments member update" on storage.objects for update to authenticated
  using (bucket_id = 'journal-attachments'
         and private.has_bird_access(public.safe_uuid((storage.foldername(name))[1]), auth.uid()) is not null);

drop policy if exists "journal-attachments member delete" on storage.objects;
create policy "journal-attachments member delete" on storage.objects for delete to authenticated
  using (bucket_id = 'journal-attachments'
         and private.has_bird_access(public.safe_uuid((storage.foldername(name))[1]), auth.uid()) is not null);
