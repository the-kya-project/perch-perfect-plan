-- The vet nudge: tighter phrase lists, so everyday posts ("Is avocado safe for
-- parrots?", "Our smoke detector went off", "Kiwi loves heavy metal") don't
-- bring up a card. Flock only; changes rows in flock_vet_signs (a Flock table)
-- and nothing else. Everything stays review_status 'draft' until an avian vet
-- reviews the lists.
--
-- Matching is in the app (findVetSigns, src/lib/flockPosts.ts): case-insensitive,
-- whole words or phrases only, a hyphenated word counts as one word. So "a burn"
-- never matched "a burning question"; single words that are everyday words on
-- their own are replaced here by phrases that describe the emergency.

-- Urgent: single everyday words out, specific phrases in.
delete from public.flock_vet_signs
where tier = 'urgent' and phrase in (
  'chocolate', 'avocado', 'alcohol', 'caffeine', 'nonstick', 'non-stick', 'teflon', 'ptfe', 'aerosol', 'aerosols',
  'air freshener', 'hair spray', 'hairspray', 'bug spray', 'smoke', 'smoky', 'heavy metal', 'zinc', 'burned', 'burnt',
  'a burn', 'fell hard'
);

insert into public.flock_vet_signs (phrase, tier)
select p, 'urgent' from unnest(array[
  'ate avocado', 'got into avocado', 'drank alcohol', 'got into alcohol', 'had caffeine',
  'teflon fumes', 'ptfe fumes', 'overheated a pan', 'burned a pan', 'breathed in fumes',
  'sprayed near', 'sprayed in the room', 'smoke inhalation', 'breathed smoke', 'house fire',
  'heavy metal poisoning', 'chewed zinc', 'got burned', 'has a burn'
]::text[]) as p
on conflict (phrase) do update set tier = 'urgent', review_status = 'draft';

-- Today: words that also describe a happy, bathing or napping bird out; the
-- worrying version in. "fluffed up" goes too: on its own it matches "all fluffed
-- up after his bath".
delete from public.flock_vet_signs
where tier = 'today' and phrase in ('fluffed', 'fluffed up', 'puffed up', 'eyes closed', 'head tucked');

insert into public.flock_vet_signs (phrase, tier)
select p, 'today' from unnest(array[
  'fluffed up and sleeping', 'fluffed up all day', 'puffed up all day', 'sleeping on the bottom'
]::text[]) as p
on conflict (phrase) do update set tier = 'today', review_status = 'draft';
