-- Repair birds whose setup_complete was stomped back to false.
--
-- persistStep wrote `setup_complete: complete` (default FALSE) on EVERY wizard
-- navigation, so re-entering "Walk through it again" on a finished bird
-- un-completed it in the DB and resurrected the "Set up care plan" CTA. The
-- code fix makes completion sticky (only ever writes true); this backfills the
-- birds that were already stomped.
--
-- Criterion: setup_step reached the final wizard step (8 = the review step,
-- only reachable by walking the whole wizard) but setup_complete is false.
-- Mid-wizard birds (step < 8) are left alone — they may genuinely be unfinished.
update public.birds
set setup_complete = true
where setup_complete = false
  and setup_step >= 8
  and passed_at is null;
