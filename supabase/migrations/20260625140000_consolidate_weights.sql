-- Consolidate weight history onto weight_entries (the single source of truth).
--
-- Background: weight_entries already has every owner/sitter/scan write, and a
-- sit_id column (20260624170000). An earlier one-time backfill (20260621120000)
-- copied weight_logs → weight_entries but (a) predates any rows the setup screen
-- has written to weight_logs since, and (b) did NOT carry sit_id, so migrated
-- sitter weights lost their sit linkage.
--
-- This migration:
--   1) inserts any weight_logs rows not yet in weight_entries, carrying sit_id;
--   2) backfills sit_id onto rows the earlier copy brought over without it.
-- weight_logs is intentionally LEFT IN PLACE (verify first, drop later).
-- Idempotent: (1) guards on NOT EXISTS, (2) only fills NULL sit_id.

-- 1) Insert still-missing weight_logs rows (now WITH sit_id).
insert into public.weight_entries (bird_id, grams, measured_at, sit_id, source, note, created_at)
select wl.bird_id,
       wl.weight,
       wl.logged_at,
       wl.sit_id,
       case when wl.sit_id is not null then 'sitter' else 'owner' end,
       wl.notes,
       wl.logged_at
from public.weight_logs wl
where not exists (
  select 1 from public.weight_entries we
  where we.bird_id = wl.bird_id
    and we.measured_at = wl.logged_at
    and we.grams = wl.weight
);

-- 2) Backfill sit_id onto already-copied rows that lost it in the first backfill.
update public.weight_entries we
set sit_id = wl.sit_id
from public.weight_logs wl
where we.sit_id is null
  and wl.sit_id is not null
  and we.bird_id = wl.bird_id
  and we.measured_at = wl.logged_at
  and we.grams = wl.weight;
