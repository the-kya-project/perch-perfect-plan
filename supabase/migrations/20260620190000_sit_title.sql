-- Add an optional owner-facing name/label for a sit, e.g. "June vacation",
-- "August work trip". Distinct from sitter_name (the person sitting). Nullable
-- so existing sits and quick unnamed sits are unaffected.
ALTER TABLE public.sits ADD COLUMN IF NOT EXISTS title TEXT;
