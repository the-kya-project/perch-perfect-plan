-- Sitter previews stop being sits.
--
-- "View as your sitter" used to provision a hidden sit (sitter_name =
-- '__preview__') so the real token-based sitter view had a token to load. Every
-- reader of `sits` then had to remember to skip it, and the Health tab didn't:
-- it showed "__preview__'s sit · 0 daily checks · 0 weights". Previews now get
-- their own table, read only by the sitter view's server functions, so nothing
-- that counts sits, sitters or activity can ever see one.
--
-- 1. public.sitter_previews: one token per (bird, person previewing). No client
--    policies: only the service role reads or writes it (server functions).
-- 2. Delete every existing preview sit. Preview sits never accept writes
--    (assertNotPreview), so nothing hangs off them but their sit_birds rows and
--    a few sit_open_events, which cascade. Columns that SET NULL on delete
--    (weight_entries, journal_entries, photo_logs, weight_logs) hold no rows
--    pointing at previews; checked 2026-10-20.
-- 3. A check constraint so a preview sit can't be created again, by old cached
--    web code or anything else.

create table if not exists public.sitter_previews (
  token text primary key
    default (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')),
  bird_id uuid not null references public.birds(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists sitter_previews_bird_creator_idx
  on public.sitter_previews (bird_id, created_by);

alter table public.sitter_previews enable row level security;
revoke all on public.sitter_previews from anon, authenticated;
grant all on public.sitter_previews to service_role;

delete from public.sits where sitter_name = '__preview__';

alter table public.sits drop constraint if exists sits_no_preview_chk;
alter table public.sits
  add constraint sits_no_preview_chk check (coalesce(sitter_name, '') <> '__preview__');
