-- The original Google Form waitlist (Dec 2025 – Sep 2026) joins waitlist_signups.
--
-- Brittany's first waitlist was a Google Form. Those 22 people are backfilled
-- into public.waitlist_signups (source 'waitlist-google-form', with their
-- original sign-up time) and then added to Brevo list 4 by the one-time hook
-- /api/public/hooks/waitlist-brevo-backfill. The form asked a few things the
-- app and website forms don't:
--
--   chapter_lead_interest  adds 3 = "Would like more information" (1 = yes,
--                          2 = no, as before; Brevo's attribute only has 1/2)
--   birds                  free text: which birds they have
--   location               free text, as they typed it ("KY", "southwest
--                          ohio"); it doesn't map onto the 9 PRIMARY_CHAPTER
--                          regions, so it's kept as written
--
-- Access is unchanged: RLS stays on, admins may read (the row policy covers
-- every column), nobody else may read or write, the service role writes.
--
-- Idempotent: safe to run again.

alter table public.waitlist_signups drop constraint if exists waitlist_signups_source_check;
alter table public.waitlist_signups add constraint waitlist_signups_source_check
  check (source in ('waitlist-app', 'waitlist-website', 'waitlist-google-form'));

alter table public.waitlist_signups drop constraint if exists waitlist_signups_chapter_lead_interest_check;
alter table public.waitlist_signups add constraint waitlist_signups_chapter_lead_interest_check
  check (chapter_lead_interest in (1, 2, 3));

alter table public.waitlist_signups add column if not exists birds text;
alter table public.waitlist_signups add column if not exists location text;

alter table public.waitlist_signups drop constraint if exists waitlist_signups_birds_check;
alter table public.waitlist_signups add constraint waitlist_signups_birds_check
  check (char_length(birds) <= 500);
alter table public.waitlist_signups drop constraint if exists waitlist_signups_location_check;
alter table public.waitlist_signups add constraint waitlist_signups_location_check
  check (char_length(location) <= 200);

-- Unchanged, restated so this file alone shows the access rules.
alter table public.waitlist_signups enable row level security;
revoke all on table public.waitlist_signups from public, anon, authenticated;
grant select on table public.waitlist_signups to authenticated;
grant all on table public.waitlist_signups to service_role;
