-- Moments photo-first keepsakes. Custom milestones get a single photo; auto
-- anchors (Gotcha-day, Hatch-day — derived from identity dates, never stored as
-- rows) accrue one photo per year via a per-(bird, anchor, year) mapping.
-- Additive; preserves existing moments rows. Photos live in the existing
-- bird-scoped `journal-photos` bucket (separate records, never duplicated).
--
-- BEFORE: moments(id, bird_id, kind, title, on_date, recurs, auto_generated, created_at)
-- AFTER:  + moments.photo_path text   ·   new table anchor_photos

alter table public.moments
  add column if not exists photo_path text;

create table if not exists public.anchor_photos (
  id         uuid primary key default gen_random_uuid(),
  bird_id    uuid not null references public.birds(id) on delete cascade,
  anchor     text not null check (anchor in ('gotcha_day', 'hatch_day')),
  year       int  not null,
  photo_path text not null,
  created_at timestamptz not null default now(),
  unique (bird_id, anchor, year)
);
create index if not exists anchor_photos_bird_idx on public.anchor_photos(bird_id);

grant select, insert, update, delete on public.anchor_photos to authenticated;
grant all on public.anchor_photos to service_role;

alter table public.anchor_photos enable row level security;
drop policy if exists "anchor_photos member all" on public.anchor_photos;
create policy "anchor_photos member all" on public.anchor_photos for all to authenticated
  using (public.has_bird_access(bird_id, auth.uid()) is not null)
  with check (public.has_bird_access(bird_id, auth.uid()) is not null);
