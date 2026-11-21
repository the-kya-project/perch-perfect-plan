-- Safety content fixes (content only: no table, column, policy, grant or
-- function changes). All three are DRAFT, PENDING AVIAN VET REVIEW; they go
-- into the vet review packet (docs/flock/opening-scope.md, B7).
--
-- 1) Nail trims journey: safety guidance on the template's own safety notes,
--    which the journey setup screen shows ("Before you start"). The three
--    reminders every template carries stay first. The template stays
--    review_status = 'draft'. Journeys are off for everyone
--    (journeys_enabled() audience = off), so nobody sees this until they're on.
--    Sources:
--      VCA Animal Hospitals, "Beak and Nail Care in Birds"
--        https://vcahospitals.com/know-your-pet/beak-and-nail-care-in-birds
--        (the quick; trim a bit at a time; keep a clotting agent ready; rinse
--        it off afterwards because birds preen their feet; a vet can trim)
--      Merck Veterinary Manual, pet owner version, "Injuries and Accidents of
--        Pet Birds" https://www.merckvetmanual.com/bird-owners/disorders-and-diseases-of-birds/injuries-and-accidents-of-pet-birds
--        (continued bleeding needs a vet now; leave a clot alone; have the
--        bird checked afterwards; styptic powder may be harmful if swallowed)
--      Petco, "Basic First Aid for Pet Birds"
--        https://esg.petco.com/content/content-hub/home/articlePages/health-wellness/basic-first-air-for-pet-birds.html
--        (cornstarch or flour if there's no styptic powder)
--    The five-minute line comes from first-aid handouts, not a vet source:
--    the vet should confirm or change it.
--
-- 2) Parrots 101 guide cards: reviewed_by read 'The Kya Project · Parrot Care
--    Bible' with a review date, which reads as reviewed when no vet has
--    reviewed them. The app never shows these two columns (the sitter guide
--    says "General guidance, not vet-reviewed"), but the stored label is
--    made honest anyway, and the date is cleared until a review happens.
--
-- 3) Hard-day journey tip: the live tip ("Try a short session before
--    breakfast, when treats tend to feel extra special…") still leans on the
--    bird being a little hungry. The rewrite never ties training to hunger or
--    meals and points to a favorite treat saved for training.

-- 1) Nail trims
update public.journey_templates
   set safety_notes = array[
         'Keep sessions short.',
         'Stop at the first sign of stress.',
         'Never withhold food to make a bird hungrier for training.',
         'Each nail has a blood vessel inside it, called the quick. Trim only the very tip, a little at a time. On dark nails you can''t see the quick, so take even less.',
         'Have styptic powder within reach before you start. If you don''t have any, plain cornstarch or flour will do in a pinch.',
         'If a nail bleeds, stay calm and hold your bird gently. Press the powder onto the tip of the nail and keep light pressure on it until the bleeding stops.',
         'Once the bleeding stops, leave the nail alone. Gently rinse the powder off the foot later, because birds preen their feet and can swallow it.',
         'Call your avian vet right away if the bleeding hasn''t stopped after five minutes of pressure, if it starts again, or if your bird seems weak, fluffed up or is breathing hard. Even after a small bleed, it''s worth letting your vet know.',
         'Stop for the day if your bird pants, bites hard, thrashes or tries to get away. Go back to an easier step next time.',
         'Ask your avian vet or an experienced avian groomer to do the trim instead if your bird is very small, young, old or unwell, if their nails are too dark to see the quick, or if a trim has bled before and you''re not confident. Never trim a beak at home.'
       ]::text[],
       review_status = 'draft',
       updated_at = now()
 where slug = 'nail-trims'
   and safety_notes = array[
         'Keep sessions short.',
         'Stop at the first sign of stress.',
         'Never withhold food to make a bird hungrier for training.'
       ]::text[];

-- 2) Parrots 101 label
update public.guide_cards
   set reviewed_by = 'Written by The Kya Project · vet review in progress',
       reviewed_at = null
 where reviewed_by = 'The Kya Project · Parrot Care Bible';

-- 3) Hard-day tip
update public.journey_tips
   set body = 'Keep training separate from meals. Your bird should eat as usual, and a tiny piece of a favorite treat you save just for training will keep them interested.'
 where body = 'Try a short session before breakfast, when treats tend to feel extra special. Breakfast comes right after, as always.';
