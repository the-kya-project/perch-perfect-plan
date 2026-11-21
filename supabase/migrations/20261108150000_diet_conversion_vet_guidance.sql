-- Diet conversion: the vet card, its saved choice, the milestone-2 reminder,
-- the lory/lorikeet block, and the "How to make it work" tips.
-- Additive: two new columns on public.journeys (a journeys-only table), one
-- new trigger on it, one new function, and a guarded update to the
-- diet-conversion template's tips (still draft). No care-app table, policy,
-- trigger or function changes.
--
--   journeys.vet_check        'talked' | 'will_call' (the vet card's answer)
--   journeys.vet_remind_after "Remind me later" on the milestone-2 card hides it until then
--
-- The card, the young-bird line and the disclaimer are copy in the app
-- (src/lib/journeys.ts); this file stores the answer and enforces the block.


-- 1) The vet card's answer ------------------------------------------------------------------

alter table public.journeys
  add column if not exists vet_check        text check (vet_check is null or vet_check in ('talked', 'will_call')),
  add column if not exists vet_remind_after timestamptz;

-- p_choice: 'talked' ("I've talked with our avian vet" / "Yes, we've talked"),
-- 'will_call' ("I'll call before we go further"), or 'remind_later' (the
-- milestone-2 card's "Remind me later": hidden for three days).
create or replace function private.journey_set_vet_check(p_journey_id uuid, p_choice text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  j public.journeys;
begin
  j := private.journey_for_member(p_journey_id);
  if not exists (select 1 from public.journey_templates t where t.id = j.template_id and t.slug = 'diet-conversion') then
    raise exception 'only Diet conversion asks about the vet' using errcode = '22023';
  end if;
  if p_choice = 'remind_later' then
    update public.journeys set vet_remind_after = now() + interval '3 days', updated_at = now() where id = j.id;
  elsif p_choice in ('talked', 'will_call') then
    update public.journeys set vet_check = p_choice, vet_remind_after = null, updated_at = now() where id = j.id;
  else
    raise exception 'unknown choice' using errcode = '22023';
  end if;
end;
$$;

revoke all on function private.journey_set_vet_check(uuid, text) from public, anon;
grant execute on function private.journey_set_vet_check(uuid, text) to authenticated, service_role;

create or replace function public.journey_set_vet_check(p_journey_id uuid, p_choice text)
returns void language sql volatile security invoker set search_path = ''
as $$ select private.journey_set_vet_check(p_journey_id, p_choice); $$;

revoke all on function public.journey_set_vet_check(uuid, text) from public, anon;
grant execute on function public.journey_set_vet_check(uuid, text) to authenticated, service_role;


-- 2) Lories and lorikeets can't start Diet conversion ----------------------------------------

-- They eat a nectar-based diet. Matched on the bird's species text.
create or replace function private.is_nectar_eater(p_species text)
returns boolean
language sql
immutable
set search_path = ''
as $$ select coalesce(p_species ~* '(lory|lories|lorikeet)', false); $$;

revoke all on function private.is_nectar_eater(text) from public, anon;
grant execute on function private.is_nectar_eater(text) to authenticated, service_role;

create or replace function private.journeys_block_nectar_diet()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.journey_templates t where t.id = new.template_id and t.slug = 'diet-conversion')
     and exists (select 1 from public.birds b where b.id = new.bird_id and private.is_nectar_eater(b.species)) then
    raise exception 'diet_not_for_nectar_eaters' using errcode = '22023';
  end if;
  return new;
end;
$$;

drop trigger if exists journeys_block_nectar_diet on public.journeys;
create trigger journeys_block_nectar_diet
  before insert on public.journeys
  for each row execute function private.journeys_block_nectar_diet();


-- 3) "How to make it work" -----------------------------------------------------------------

-- Only if the tips are still the original seed (never overwrite an edit made
-- with admin_update_journey_template). Draft, like the rest of the template.
update public.journey_templates
set tips = array[
      'Offer the new food first thing in the morning, with the usual food alongside.',
      'Eat it in front of them. Parrots are flock eaters and often try what they see you eat.',
      'Change one thing at a time, and go slower than feels necessary. Some birds take months, and that''s normal.',
      'Try different forms: chopped, warmed, crumbled over a favorite food, or tucked into a foraging toy.',
      'Watch droppings and appetite as well as weight. If your bird stops eating, put the usual food back and call your vet.',
      'Weigh in grams at the same time every day. A few grams matter on a bird.',
      'Some birds will refuse new food so firmly that they stop eating. If your bird isn''t eating, go back to the usual food today and call your vet.',
      'Take uneaten fresh food out after a few hours so it doesn''t spoil.',
      'Notice how your bird likes food already: warm or cool, soft or crunchy, chopped fine or in chunks. Offer the new food the same way.',
      'If your bird picks out the old food, crumble it finely over the new food and use a little less each day.',
      'How much to feed varies from bird to bird, even within a species. Your vet can tell you what''s right for yours.'
    ]::text[],
    updated_at = now()
where slug = 'diet-conversion'
  and tips = array[
      'Offer the new food first thing in the morning, when your bird is hungriest, with the usual food alongside.',
      'Eat it in front of them. Parrots are flock eaters and often try what they see you eat.',
      'Change one thing at a time, and go slower than feels necessary. Some birds take months, and that''s normal.',
      'Try different forms: chopped, warmed, crumbled over a favorite food, or tucked into a foraging toy.',
      'Watch droppings and appetite as well as weight. If your bird stops eating, put the usual food back and call your vet.'
    ]::text[];
