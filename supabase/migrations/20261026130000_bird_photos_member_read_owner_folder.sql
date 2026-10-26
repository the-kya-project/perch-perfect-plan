-- Security: anyone who knew a bird photo's storage path could read it.
--
-- "bird-photos member read" (20260626120000) allows reading an object when some
-- bird the caller can access has that object's name as its photo_url. But
-- photo_url is writable by the bird's owner, so a stranger could create a bird
-- of their own whose photo_url is another owner's path and read the file.
-- Paths contain a random uuid, so they can't be guessed, but former household
-- members, former sitters and previous owners after a handoff all know them.
-- Verified on staging in the QA pass, Oct 2026.
--
-- Every bird photo is uploaded into its owner's folder ("<owner_id>/…",
-- birdPhoto.ts; the insert policy enforces the uploader's own folder), and a
-- handoff moves it into the new owner's folder (handoff.functions.ts). So the
-- member path now also requires the object to sit in the folder of the bird's
-- owner. Members and owners keep reading their birds' photos; a decoy bird
-- pointing at someone else's file matches nothing.

drop policy if exists "bird-photos member read" on storage.objects;
create policy "bird-photos member read" on storage.objects for select to authenticated
  using (
    bucket_id = 'bird-photos'
    and exists (
      select 1
      from public.birds b
      where b.photo_url = storage.objects.name
        and (storage.foldername(storage.objects.name))[1] = b.owner_id::text
        and private.has_bird_access(b.id, (select auth.uid())) is not null
    )
  );
