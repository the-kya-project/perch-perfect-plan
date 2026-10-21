-- Record which kind of health check a daily_logs row is: the quick daily check
-- ('daily') or the full health check ('full'). Until now the app guessed it on
-- read (isFullCheck in src/lib/checkKind.ts); from here the app writes it on
-- every insert and only falls back to that guess when kind is null.
--
-- Nullable, no default, on purpose. Older builds that don't send kind (the
-- native apps run their bundled web build until they update, and the web app
-- can go live minutes before this migration) keep inserting rows without it.
-- A default of 'daily' would silently stamp their full health checks as daily;
-- null keeps them on the read-side guess instead, which is at least as good.
--
-- Backfill (owner's call: "existing checks: keep your best guess") applies the
-- same rule as the app's guess, in the same order, only where kind is null:
--   1. source 'sitter'                                   -> daily
--   2. any non-blank per-question note (item_notes)      -> full
--   3. a photo attached by the full check (photo_logs
--      notes 'Attached to health check')                 -> full
--   4. everything else                                   -> daily
-- One UPDATE per rule; each skips rows already set, so re-running is a no-op.

alter table public.daily_logs
  add column if not exists kind text;

alter table public.daily_logs drop constraint if exists daily_logs_kind_check;
alter table public.daily_logs
  add constraint daily_logs_kind_check check (kind is null or kind in ('daily', 'full'));

-- 1. A sitter's check is always the daily check.
update public.daily_logs
   set kind = 'daily'
 where kind is null
   and source = 'sitter';

-- 2. Only the full check stores per-question notes.
update public.daily_logs dl
   set kind = 'full'
 where dl.kind is null
   and case when jsonb_typeof(dl.item_notes) = 'object' then exists (
         select 1 from jsonb_each(dl.item_notes) e
          where jsonb_typeof(e.value) = 'string'
            and (e.value #>> '{}') ~ '\S'
       ) else false end;

-- 3. Only the full check attaches a photo.
update public.daily_logs dl
   set kind = 'full'
 where dl.kind is null
   and exists (
     select 1 from public.photo_logs p
      where p.daily_log_id = dl.id
        and p.notes = 'Attached to health check'
   );

-- 4. Everything else reads as the daily check (the more common kind).
update public.daily_logs
   set kind = 'daily'
 where kind is null;
