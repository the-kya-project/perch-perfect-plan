-- Multiple medications per bird: structured list on care_plans. The legacy
-- single-med text columns (birds.medications, care_plans.medication_schedule)
-- stay in place and are written as joined summaries by the health editor, so
-- every existing read surface keeps working. Additive + idempotent.

alter table public.care_plans
  add column if not exists medications_details jsonb not null default '[]'::jsonb;
