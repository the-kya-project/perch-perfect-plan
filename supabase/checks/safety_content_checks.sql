-- Verification for 20261121180000_safety_content_fixes. Run on a branch or
-- preview (Database checks runs every file here). Raises at the end with the
-- tally, so nothing persists.
do $$
declare
  passed int := 0;
  failed text[] := '{}';
  notes text[];
begin
  -- 1) Nail trims carries the quick, bleeding, stop signs and "ask a vet" guidance.
  select safety_notes into notes from public.journey_templates where slug = 'nail-trims';
  if notes is not null
     and array_to_string(notes, ' ') ilike '%quick%'
     and array_to_string(notes, ' ') ilike '%styptic powder%'
     and array_to_string(notes, ' ') ilike '%cornstarch%'
     and array_to_string(notes, ' ') ilike '%Call your avian vet right away%'
     and array_to_string(notes, ' ') ilike '%Stop for the day%'
     and array_to_string(notes, ' ') ilike '%experienced avian groomer%'
     and (select review_status from public.journey_templates where slug = 'nail-trims') = 'draft' then
    passed := passed + 1; else failed := array_append(failed, 'nail trims safety guidance, still draft'); end if;

  -- 2) No guide card claims a review that hasn't happened.
  if not exists (select 1 from public.guide_cards where reviewed_by = 'The Kya Project · Parrot Care Bible')
     and not exists (select 1 from public.guide_cards where reviewed_by ilike '%vet%' and reviewed_by not ilike '%in progress%')
     and not exists (select 1 from public.guide_cards where reviewed_at is not null and reviewed_by ilike '%in progress%') then
    passed := passed + 1; else failed := array_append(failed, 'guide cards: honest review label'); end if;

  -- 3) No journey tip mentions hunger or training before a meal.
  if not exists (select 1 from public.journey_tips where body ilike '%hungry%' or body ilike '%before breakfast%' or body ilike '%withhold%') then
    passed := passed + 1; else failed := array_append(failed, 'journey tips never tie training to hunger'); end if;

  raise exception 'SAFETY CONTENT CHECKS: % passed, % failed%', passed, coalesce(array_length(failed, 1), 0),
    case when array_length(failed, 1) > 0 then ': ' || array_to_string(failed, ', ') else '' end;
end $$;
