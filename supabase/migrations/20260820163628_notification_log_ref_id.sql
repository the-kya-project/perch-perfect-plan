-- notification_log.ref_id: optional reference to the entity a notification is
-- about (e.g. a sit id for care-plan reminders). Text, not uuid, so it can
-- point at different entity kinds later without another migration; no FK for the
-- same reason. Replaces the old "type = care_plan_reminder:<sitId>" composite
-- hack so `type` stays a clean, groupable notification kind.
alter table public.notification_log
  add column if not exists ref_id text;

-- Supports the care-plan-reminders per-sit dedupe lookup (type + ref_id).
create index if not exists notification_log_type_ref_idx
  on public.notification_log (type, ref_id);
