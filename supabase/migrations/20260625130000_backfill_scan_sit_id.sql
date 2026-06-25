-- Backfill daily_logs.sit_id for scans run DURING an active sit that were never
-- tagged with it. Symptom this fixes: a sit card's "View scans" filters by
-- sit_id and showed nothing even though scans exist within the sit's dates.
--
-- New scans are already tagged at write time (sitter submit sets sit_id from the
-- token's sit; owner submit sets it from the active caregiver sit). This only
-- repairs historical rows where sit_id is NULL.
--
-- For each untagged scan, attach the sit that covers its bird on its log_date.
-- Real per-trip preview sits (sitter_name = '__preview__') are excluded so a
-- throwaway preview never claims a real scan. If two real sits overlap the same
-- bird+date (rare), the most recently started one wins.
-- Idempotent: only touches rows where sit_id IS NULL, so re-running is a no-op.

UPDATE public.daily_logs AS dl
SET sit_id = (
  SELECT s.id
  FROM public.sits s
  JOIN public.sit_birds sb ON sb.sit_id = s.id
  WHERE sb.bird_id = dl.bird_id
    AND dl.log_date BETWEEN s.start_date AND s.end_date
    AND COALESCE(s.sitter_name, '') <> '__preview__'
  ORDER BY s.start_date DESC
  LIMIT 1
)
WHERE dl.sit_id IS NULL
  AND EXISTS (
    SELECT 1
    FROM public.sits s2
    JOIN public.sit_birds sb2 ON sb2.sit_id = s2.id
    WHERE sb2.bird_id = dl.bird_id
      AND dl.log_date BETWEEN s2.start_date AND s2.end_date
      AND COALESCE(s2.sitter_name, '') <> '__preview__'
  );
