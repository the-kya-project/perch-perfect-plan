-- Owner-run health scans. The scan record (daily_logs) was sitter/sit-coupled;
-- extend it additively so a scan can be owner-initiated and unattached to a sit.
-- Existing sitter scans keep their sit_id and become source='sitter' by default.
--
-- BEFORE: daily_logs(..., sit_id uuid null, ...)   [no source / run_by]
-- AFTER:  + source text not null default 'sitter' ('owner'|'sitter')
--         + run_by uuid (the user who ran it; null for token sitters)
-- sit_id is already nullable; owner scans set source='owner', run_by=auth.uid(), sit_id=null.

alter table public.daily_logs
  add column if not exists source text not null default 'sitter' check (source in ('owner', 'sitter')),
  add column if not exists run_by uuid references auth.users(id) on delete set null;
