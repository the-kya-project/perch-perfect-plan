-- Optional per-item note on a health check. When an item is marked NOT normal
-- (concerning / not sure), whoever runs the check may add a short free-text note
-- explaining what they saw (e.g. "left foot looks swollen", "didn't finish
-- breakfast"). Optional everywhere: a flagged item without a note still saves.
--
-- Stored as a jsonb map keyed by the scan FIELD key (alertness, food, droppings,
-- breathing, posture, noise, fluffed, vomiting, injury, exposure) → the note.
-- Only not-normal items get an entry. One column (not per-item columns) keeps it
-- flexible if the field set changes. Existing daily_logs RLS (record_health for
-- members, owner, and the token-scoped sitter path) already governs writes — no
-- policy change; this is just a new nullable column.

alter table public.daily_logs
  add column if not exists item_notes jsonb;
