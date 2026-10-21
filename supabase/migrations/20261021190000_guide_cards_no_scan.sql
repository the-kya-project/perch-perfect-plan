-- Parrots 101: no "scan" in visible copy. The app calls it the daily health
-- check; two seeded guide_cards rows (20260615135444) still said "scan" in
-- text the sitter reads. Each UPDATE matches the exact old value, so it is a
-- no-op if the row was already changed (idempotent, safe to re-run).
--
-- Not changed (not shown to sitters): slugs (rule-daily-scan, scan-*), the
-- category key "02-the-daily-health-scan" (mapped to a topic in the app), and
-- search_keywords ("daily check scan baseline" — keeps "scan" searchable).

update public.guide_cards
set what_to_do = 'Run the daily health check every day. Photograph anything unusual before cleaning.'
where slug = 'rule-daily-scan'
  and what_to_do = 'Run the daily health scan every day. Photograph anything unusual before cleaning.';

update public.guide_cards
set quick_answer = 'A quick room check prevents most accidents.'
where slug = 'room-checklist'
  and quick_answer = 'A quick room scan prevents most accidents.';
