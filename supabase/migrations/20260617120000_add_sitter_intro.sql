-- Phase 4 — assembled sitter intro.
-- sitter_intro: deterministic, owner-facing intro assembled from care-plan
--   fields (recomputed when Basics/Behavior change). Read by the sitter view.
-- owner_edited_intro: optional manual override; when present the sitter view
--   shows it instead of the assembled string. (Edit UI is out of scope.)
ALTER TABLE public.birds
  ADD COLUMN IF NOT EXISTS sitter_intro text,
  ADD COLUMN IF NOT EXISTS owner_edited_intro text;
