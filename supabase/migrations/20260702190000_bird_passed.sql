-- "A bird has passed" handling.
--
-- birds.passed_at: set ONLY by the owner (mark-as-passed). A passed bird keeps
-- its full record (care plan, weights, journal, moments) as a memorial; it just
-- leaves the active flock and all daily reminders/prompts pause (owner side via
-- list filters, sitter side via the sitter context treating it as paused, cron
-- side via an explicit skip).
--
-- sit_birds.reminders_paused_at: set by the SITTER's "something's wrong" flow.
-- Per-sit, per-bird, temporary: it pauses the sitter's daily prompts for that
-- bird and never touches the bird's record. Only the owner can mark a bird as
-- passed.
alter table public.birds
  add column if not exists passed_at timestamptz;

alter table public.sit_birds
  add column if not exists reminders_paused_at timestamptz;
