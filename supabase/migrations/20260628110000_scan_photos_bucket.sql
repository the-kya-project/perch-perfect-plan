-- Private scan-photos bucket: health-scan photos move OUT of photo_logs.photo_url
-- (base64) into Storage; the column will hold the object PATH instead. Mirrors
-- the journal-photos bucket exactly — bird-scoped folder (<birdId>/<uuid>.jpg),
-- access via has_bird_access on the first path segment.
--
-- Ordering: this references public.has_bird_access and is intentionally
-- timestamped BEFORE 20260628120000 (which moves has_bird_access into the private
-- schema). On `db push` it runs first; the move migration then carries these
-- policies along by OID. Keep it before that file.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'scan-photos', 'scan-photos', false,
  15728640, -- 15 MiB (compressed scan photos are ~0.5 MB; this is a safety cap)
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "scan-photos member read"   on storage.objects;
drop policy if exists "scan-photos member insert" on storage.objects;
drop policy if exists "scan-photos member update" on storage.objects;
drop policy if exists "scan-photos member delete" on storage.objects;

create policy "scan-photos member read" on storage.objects for select to authenticated
  using (bucket_id = 'scan-photos'
         and public.has_bird_access(public.safe_uuid((storage.foldername(name))[1]), auth.uid()) is not null);
create policy "scan-photos member insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'scan-photos'
              and public.has_bird_access(public.safe_uuid((storage.foldername(name))[1]), auth.uid()) is not null);
create policy "scan-photos member update" on storage.objects for update to authenticated
  using (bucket_id = 'scan-photos'
         and public.has_bird_access(public.safe_uuid((storage.foldername(name))[1]), auth.uid()) is not null);
create policy "scan-photos member delete" on storage.objects for delete to authenticated
  using (bucket_id = 'scan-photos'
         and public.has_bird_access(public.safe_uuid((storage.foldername(name))[1]), auth.uid()) is not null);
