-- Household / co-owner members couldn't load bird PROFILE photos.
--
-- The bird-photos bucket only had an owner-folder read policy
-- ((storage.foldername(name))[1] = auth.uid()), but photos live under the
-- OWNER's uid folder (`<owner_id>/<uuid>.jpg`). So a member's signed-URL request
-- was denied by Storage RLS. Legacy base64 photos (inline in birds.photo_url)
-- still rendered for members, but newer bucket uploads 404'd — the reported
-- "newer pics aren't showing up for household members" (e.g. Buzz, Golden foster).
--
-- Add a member read policy, scoped tightly: a member may read a bird-photos
-- object only if it IS the current photo of a bird they have access to. (The
-- journal-photos member policy can't be copied verbatim — those objects are
-- foldered by bird_id, these by owner_id — so we match the object name against
-- birds.photo_url instead. storage.objects.name is fully qualified because the
-- birds table also has a `name` column.)

drop policy if exists "bird-photos member read" on storage.objects;
create policy "bird-photos member read" on storage.objects for select to authenticated
  using (
    bucket_id = 'bird-photos'
    and exists (
      select 1
      from public.birds b
      where b.photo_url = storage.objects.name
        and public.has_bird_access(b.id, auth.uid()) is not null
    )
  );
