-- Storage hardening: image-only MIME allowlists + a sane size cap on the
-- photo buckets. Affects NEW uploads only (existing objects are untouched).
--
-- journal-photos previously had no file_size_limit and no MIME allowlist.
-- bird-photos had a 250 MB cap (kept — it also holds legacy video clips) but no
-- MIME allowlist. New clips go to Cloudflare Stream, not storage, so both
-- buckets now only receive images.

-- journal-photos: images only, 15 MB cap (phone photos sit well under this).
update storage.buckets
set
  file_size_limit = 15728640, -- 15 MiB
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
where id = 'journal-photos';

-- bird-photos: add the same image-only allowlist; leave its existing size cap.
update storage.buckets
set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
where id = 'bird-photos';
