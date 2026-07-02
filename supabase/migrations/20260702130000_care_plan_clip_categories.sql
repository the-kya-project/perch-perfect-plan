-- Three new owner-clip categories plus an "anything else" catch-all, stored the
-- same way as the existing watch clips: one text column per category on
-- care_plans holding a "cfstream:<uid>" reference (or a legacy storage path).
-- Additive only; the existing clip_* columns are untouched.
alter table public.care_plans
  add column if not exists clip_food_prep_path text,
  add column if not exists clip_toys_foraging_path text,
  add column if not exists clip_targeting_path text,
  add column if not exists clip_anything_else_path text;
