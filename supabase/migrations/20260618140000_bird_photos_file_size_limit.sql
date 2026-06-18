-- Raise the bird-photos bucket's max file size to 250 MB.
--
-- Care-plan videos upload browser → Supabase Storage directly (no API layer in
-- between), so the bucket's file_size_limit is the only server-side cap. The
-- client compresses clips before upload, but the raw limit must stay generous so
-- that on devices where in-browser compression can't run, the original still
-- uploads instead of failing.
--
-- NOTE: if this bucket's limit was originally set in the Supabase dashboard,
-- confirm the dashboard value matches — a stale dashboard/global limit is the
-- usual reason an upload is still rejected as "too big" after raising it here.
update storage.buckets
set file_size_limit = 262144000  -- 250 * 1024 * 1024
where id = 'bird-photos';
