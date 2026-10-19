-- Onboarding as one system: the log records skips as well as sends.
--
-- The daily onboarding cron now walks one ordered list of slots per account
-- (welcome, the two add-a-bird nudges, then the six series stages) and settles
-- each slot exactly once: SENT, or SKIPPED with a reason (the account already
-- did what the stage asks, already has a bird, or cannot share). The existing
-- primary key (user_id, stage) is what guarantees "once ever", for skips too.
--
--   status          'sent' | 'skipped'. Existing rows are all sends, so the
--                   default backfills them correctly with no UPDATE.
--   skipped_reason  why a slot was skipped; null on a send.
--   cta_variant     which primary button went out: 'standard' (the stage's own
--                   feature) or 'no_bird' (the add-a-bird flow). Null on skips
--                   and on rows written before this migration.
--
-- Anything that reads this table as "emails sent" must now filter
-- status = 'sent' — the engagement-nudges same-day check does.

alter table public.onboarding_email_log
  add column if not exists status text not null default 'sent',
  add column if not exists skipped_reason text,
  add column if not exists cta_variant text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'onboarding_email_log_status_check') then
    alter table public.onboarding_email_log
      add constraint onboarding_email_log_status_check check (status in ('sent', 'skipped'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'onboarding_email_log_cta_variant_check') then
    alter table public.onboarding_email_log
      add constraint onboarding_email_log_cta_variant_check check (cta_variant is null or cta_variant in ('standard', 'no_bird'));
  end if;
  -- A skip always says why; a send never carries a reason.
  if not exists (select 1 from pg_constraint where conname = 'onboarding_email_log_skip_reason_check') then
    alter table public.onboarding_email_log
      add constraint onboarding_email_log_skip_reason_check
      check ((status = 'skipped') = (skipped_reason is not null));
  end if;
end $$;

-- The same-day checks (onboarding and the push nudges) read today's sends.
create index if not exists onboarding_email_log_sent_at_idx
  on public.onboarding_email_log (sent_at desc) where status = 'sent';
