-- Structured descriptor for auto-derived routine tasks, stored ALONGSIDE the
-- English title/instructions (which are never modified). Lets the sitter/owner
-- checklist render derived tasks in the reader's language while owner-typed
-- names stay verbatim. Nullable/additive; rows without it render their stored
-- title/instructions unchanged. Inherits existing routine_tasks RLS.
alter table public.routine_tasks add column if not exists derived jsonb;
