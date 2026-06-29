-- Cover the sits.sits_lead_user_id_fkey foreign key with an index. lead_user_id
-- (the assigned-caregiver column) is joined/filtered, and an uncovered FK was
-- flagged by the Supabase advisor. Only this FK is indexed here; the other
-- "unused index" advisories are left until production traffic justifies them.
create index if not exists idx_sits_lead_user_id on public.sits (lead_user_id);
