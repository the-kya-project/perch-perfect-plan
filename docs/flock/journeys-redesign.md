# Journeys redesign (approved direction, content draft)

The build list for this is backlog item 1.20 (parts 1.20a to 1.20e) in [`docs/BACKLOG.md`](../BACKLOG.md). Every new or changed string goes to Brittany for copy review, and all template text stays `review_status = 'draft'` until she approves it.

## Decision

A journey is "I'm teaching [bird] to [skill]" plus the owner's own record of teaching it. There are no milestones, no steps, no progress tracking, no typical length and no "suggested first". Each of the 14 skills has a short description of the behavior, safety notes only where a bird could get hurt, and an optional short video (none at opening). The owner posts clips and notes however suits their bird and ends the journey when they choose: "[Bird] learned it!" (adds the skill to bird_skills, source 'journey') or "We're happy where we are" (adds nothing). Owners can add their own skill. Every skill is free to start. Free accounts keep journeys private. The Flock adds asking the community, seeing how others did it (community journeys, finisher tips), sharing your own journey, and finding and starting skills other members shared. Diet conversion is the one exception and keeps its safety structure.

## Ground rules

- Nothing journey-related appears in the care app unless journeys_enabled() is true. Flock surfaces stay behind flock_enabled(). Health items with their own switch stay off until a vet approves them.
- All database changes are additive. Never delete or overwrite production rows. Keep journey_template_milestones and journey_milestones as history.
- Fixed rules everywhere: stop at signs of stress, never suggest withholding food, never diagnose, diet conversion safeguards and the lory/lorikeet block unchanged. Weight thresholds are not to be changed.
- New strings go through the i18n workflow (English first, Dutch after English approval). Copy: sentence case, plain and warm, never "it's not about X, it's about Y".

## Screens

1. Journeys tab: "Your journeys" (active and paused, then finished), "Start something new", and for Flock members "From the Flock" (community journeys plus member skills). Today's followed rings show the latest clip and "Day N" instead of step counts. Milestone cards become "learned it" and big-moment cards.
2. Pick a skill: one list of all 14, no free/Flock split, grouped Handling and health, Foundations, Food, Tricks. Then "Your own skill" and, for Flock members, "Skills from the Flock" with search. If the bird already has the skill in bird_skills, show "[Bird] already knows this" and still allow starting it.
3. Skill page and setup: short description, video if any, safety notes, and "How others did it" (finisher tips and community journeys for this skill). For free accounts that section opens the existing "Part of the Flock" sheet (no price). Setup asks only which bird, how often (existing rhythm) and who sees it (Flock: community by default; free: private only). Remove the milestone checklist, the "already does" step and the "How to make it work" tips list.
4. Journey page: bird, skill, day count; description and safety notes collapse under the header; clip grid; day one vs. now; post an update, pause, "[Bird] learned it!", "We're happy where we are", delete. Diet conversion keeps its weight card, vet reminder card, weigh-in reminder, pause banner and disclaimer.
5. Post an update: keep clip, caption, the "how did today go" check and the hard-day tip; "?" still makes it a question. Remove the "Did [bird]...?" milestone question. Add an optional "This was a big moment" toggle that replaces milestone sharing (Today cards, sharing, the 1.7 Instagram cards). On a community journey a question also shows to the Flock to answer. On a private journey show "Ask the Flock" (free: opens the Flock sheet; members: offers to share). Run the vet nudge (flock_vet_signs) on every caption and question.
6. Finished: "[Bird] learned [skill]!" adds the skill and invites a finisher tip. Diet conversion finishes as "[Bird] is on the new diet" and adds no known skill.
7. Your own skill: name (up to 60 characters) and a short description in the owner's words (up to about 500 characters). No minimum or maximum steps (drop CUSTOM_MIN, CUSTOM_MAX, customProblem's step rules). If the name matches one of the 14, suggest that skill. Free accounts keep one open custom journey at a time.
8. Skills from the Flock: a Flock member's custom journey with community visibility and at least one post becomes findable right away, with no review, labeled everywhere it appears "Member-supplied journey" with a line that it was shared by a member and not reviewed by The Kya Project. "Start this skill" creates a custom journey for the viewer's bird, copies name and description, records the source journey, and shows "Started from [bird]'s journey" as a link while the source is visible. Reportable through flock_report.

## Data

- journey_templates keeps slugs and rows. Rewrite text through the admin functions as draft: purpose holds the short description, safety_notes holds the safety notes. Clear tips on every template; for diet conversion move its five safety lines (below) into safety_notes. Stop using done_when, suggested_first and typical_length (leave the columns). Add a nullable video reference column using the existing Cloudflare clip pipeline.
- All 14 templates startable by everyone. Gating (tier = 'premium', can_use_premium, isLocked, FlockOnlySheet on template tap) moves from starting a skill to the community features.
- New journeys create no milestone rows. Replace journey_reach_milestone and the milestone-based finish with a finish function taking 'learned' or 'happy_where_we_are'.
- Custom journeys add a nullable description and a nullable source journey reference.
- Add a big-moment flag on journey updates.
- Diet conversion: a starting-weight state that doesn't depend on milestone 1. Starting weight = average of the first week of daily weigh-ins after the journey starts, the same as milestone 1 today. The weight rules, the vet reminder ("from milestone 2" becomes "once the starting weight is set") and journey_weigh_reminders read from it. Every number stays in journey_settings, unchanged.
- Free clip limits unchanged (60 s, 10 clips per journey).

## Existing templates and started journeys

Production has 2 journeys, both active, both started 2026-11-07 (scale training with 3 posts; a custom journey with none). Keep every journey, post, clip, comment and reaction. Their milestone rows stay but aren't shown; they carry on in the new layout as ordinary journeys. The "started journeys keep their wording" rule is retired: every journey shows the skill's current description and safety notes.

## Edge cases

- Lories and lorikeets still can't start diet conversion (trigger and screen).
- An eclectus picking diet conversion sees the eclectus alert before the vet card. The alert is draft and stays hidden until a vet approves it.
- Unknown species: no species alert, always the general vet card.
- Keep one open journey per bird per template. Starting the same member skill twice for one bird shows the open journey.
- Lapsed Flock membership: community journeys and member skills hide as journey_viewable already does; copies others started keep their own text.
- Source deleted, hidden or blocked: copies keep their text and the "Started from" link disappears. flock_blocked applies to member skills everywhere.
- A bird with passed_at: its journeys become read-only.
- Household co-carers keep seeing and posting on the bird's journeys.
- Reported member skills follow the existing threshold and review queue.
- Every new screen follows the repo's iPhone Duo layout rules.

## Tests and docs

Update journeys_checks.sql, journey_updates_checks.sql, journeys_browse_checks.sql, diet_vet_guidance_checks.sql, diet_weight_rules_checks.sql, scripts/flock-shell.test.ts, e2e/flock.shell.ts, e2e/journey-fixture.json and the Flock analytics events (flockAnalytics.ts, docs/flock/analytics.md). Add checks that a free account can start every skill but never sees community content, that diet conversion pauses exactly as before without milestones, and that a private journey never reaches anyone outside its household. Update CLAUDE.md's Journeys section when the build lands.

## Skill content (draft, for template text)

Shared safety notes on every skill: Keep sessions short. Stop at the first sign of stress. Never withhold food to make a bird hungrier for training.

- Scale training: Your bird steps onto the scale calmly and stays still long enough for an accurate weight, so daily weigh-ins become easy.
- Wing touch: Your bird is comfortable having its wings touched and gently opened, the way a vet does during an exam, and it stays relaxed the whole time. Safety: Keep touches brief, because long body contact can trigger hormonal behavior. Never pull a wing that resists. If your bird has an injury, arthritis, or a wing that doesn't open fully, ask your avian vet what's comfortable first.
- Carrier comfort: Your bird walks into its carrier on its own and stays relaxed inside, so vet trips and travel start calmly.
- Nail trims: Your bird stays calm while its nails are trimmed, without being wrapped in a towel. Safety: keep the current nail trim safety notes exactly as they are.
- Stationing: Your bird goes to a chosen perch and stays there while you move around the room. It's especially helpful for birds that never want to leave your side.
- Target training: Your bird touches the tip of a stick and follows it, which gives you a gentle way to guide your bird almost anywhere.
- Step up: Your bird steps onto your hand calmly and by choice, without biting.
- Recall: Your bird comes to you when you call its name, whether that means flying across the room or walking along a perch. It's the most important safety skill if your bird ever gets out.
- Diet conversion: Your bird moves gradually from a seed-heavy diet to pellets, chop, and fresh foods while its weight stays steady. Safety notes (the five protective lines from the current tips; remove the other six): Watch droppings and appetite as well as weight. If your bird stops eating, put the usual food back and call your vet. / Some birds refuse new food so firmly that they stop eating. If your bird isn't eating, go back to the usual food today and call your vet. / Weigh in grams at the same time every day. A few grams matter on a bird. / Take uneaten fresh food out after a few hours so it doesn't spoil. / How much to feed varies from bird to bird, even within a species. Your vet can tell you what's right for yours.
- Eclectus diet alert (draft, hidden until vet approval): "Eclectus have specific food needs. They generally do best on plenty of fresh vegetables and fruit, and many avian vets advise caution with heavily fortified pellets and added vitamins. Please make a plan with your avian vet before changing {{name}}'s food."
- Wave: Your bird lifts one foot and waves it on cue.
- High five: Your bird touches its raised foot to your open palm.
- Spin: Your bird turns a full circle on its perch on cue. Safety: Skip this one, or keep it very small, for birds with balance, grip, or leg problems.
- Retrieve: Your bird picks up a small ball and drops it into your hand. Safety: Use objects too big to swallow, with no small parts or paint that could chip.
- Hang upside down: Your bird hangs upside down from your finger or a perch on cue, which turns a natural play behavior into a trick. Safety: Skip this one for birds with balance, grip, or leg problems, and practice over a soft surface.

## Needs avian vet review before opening

Diet weight thresholds; diet vet card, young-bird line, reminder timing and disclaimer; one week as enough for a starting weight; eclectus alert wording; which other species need a diet alert or block; nail trim safety notes; the wing touch lines; the spin and hang upside down notes; the vet-nudge phrase list as used on journey posts and questions.
