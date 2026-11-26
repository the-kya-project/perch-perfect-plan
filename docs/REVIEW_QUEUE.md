# Review queue

Things for Brittany to look over from the unattended agent runs, with PR links. Agents add new items at the **top** of their section, in the same PR as the work.

**Brittany clears items as she reviews them. Agents never remove or rewrite an item she hasn't cleared,** including items another run added. The rules are in CLAUDE.md, "Working the backlog unattended"; the run-by-run record is [`agent-log.md`](agent-log.md).

---

## Copy that merged

Every new or changed line of wording that merged, so it can be read after the fact. One item per PR.

Format:

```
### <PR link> · <item ID> <item title>
- **Where:** <screen, email or file the line appears in>
  - Before: "<old wording>" (or "new")
  - After: "<new wording>"
```

### [#563](https://github.com/the-kya-project/perch-perfect-plan/pull/563) · 1.15a Kya's Crew on the payment screen · **approved by Brittany (Nov 26, 2026)**
English only (Dutch waits for your read). All behind `BILLING_ENABLED` (off), web only. Prices come from Stripe; the amounts below are the ones in your mockup. Everything is from `CrewCardStep.dc.html` word for word unless marked "not in the mockup".
- **Where:** the card step, above the tiles (only when the Crew prices are set)
  - Before: "Pick how you pay"
  - After: "Pick your membership", then a small heading "Flock membership" above Yearly and Monthly
- **Where:** the Kya's Crew box under the Flock tiles
  - New: "Kya's Crew" / "For members who want to give a little more"
  - New: "Everything in a Flock membership" / "**25%** of what you pay goes to parrot rescue and conservation partners" / "Crew memberships help support free Flock access for rescue adopters"
  - New tiles: "Crew yearly", "$37/mo", "$444 once a year", "Save $96"; "Crew monthly", "$45/mo", "Billed monthly"
- **Where:** the giving panel at the top, with a Crew plan picked
  - Before: "Every membership gives back" / "20%"
  - After: "Kya's Crew gives back more" / "25%"
- **Where:** "What your membership keeps", with a Crew plan picked
  - New last line: "Crew memberships help support free Flock access for rescue adopters"
- **Where:** the button, with a Crew plan picked
  - Before: "Add my card · $0 today"
  - After: "Join Kya's Crew · $0 today"
- **Where:** the card step after the free season, with a Crew plan picked (not in the mockup)
  - Before: "Join the Flock"
  - After: "Join Kya's Crew"
- **Where:** Stripe's save-the-card page in the free season's last 48 hours, for a Crew plan (not in the mockup)
  - Before: "The Flock, {{price}} a year. You won't be charged until {{date}}. Cancel anytime before then from Membership and billing." (and "a month")
  - After: "Kya's Crew, {{price}} a year. You won't be charged until {{date}}. Cancel anytime before then from Membership and billing." (and "a month")
- **Where:** "You're all set" for a Crew member (not in the mockup)
  - Before: "**Thank you.** 20% of your membership will go to parrot rescue and conservation partners."
  - After: "**Thank you.** 25% of your Crew membership will go to parrot rescue and conservation partners."
  - Plan row: Before "Yearly" / "Monthly"; After "Crew yearly" / "Crew monthly"
- **Where:** Membership and billing, for a Crew member (not in the mockup)
  - Before: "Flock member" and "**Your membership gives back.** 20% goes to parrot rescue and conservation partners."
  - After: "Kya's Crew" and "**Your Crew membership gives back more.** 25% goes to parrot rescue and conservation partners."

### [#560](https://github.com/the-kya-project/perch-perfect-plan/pull/560) · 1.20d Diet conversion rework (Brittany approved the wording, Nov 25, 2026)
English only (Dutch waits for your read of the English). Behind `journeys_enabled()` (off in production) and the Flock gate. Both lines also go in the vet packet.
- **Where:** Diet conversion's setup, above the vet card, for an eclectus, only once the `diet_eclectus_alert` switch is on (it starts off)
  - New (the spec's draft, word for word): "Eclectus have specific food needs. They generally do best on plenty of fresh vegetables and fruit, and many avian vets advise caution with heavily fortified pellets and added vitamins. Please make a plan with your avian vet before changing {{name}}'s food."
- **Where:** Diet conversion's setup, "Safeguards built into this journey" (template text, draft)
  - Before: "Daily weigh-ins are part of every step, and the journey shows the weight trend right on its page."
  - After: "Daily weigh-ins are part of the whole journey, and the journey shows the weight trend right on its page."
- **Where:** the same "Safeguards built into this journey" list (template text, draft). Removed at Brittany's request (Nov 25, 2026).
  - Before: "If weight drops, the journey pauses with a clear message to call your avian vet. For Flock members, this uses the bird's own baseline alerts."
  - After: "If weight drops, the journey pauses with a clear message to call your avian vet."

### [#559](https://github.com/the-kya-project/perch-perfect-plan/pull/559) · 1.20c Member skills
English only (Dutch waits for your read of the English). Behind `journeys_enabled()` (off in production) and the Flock gate, so nobody sees these yet. Keys in `src/locales/en.jsonc`. **Please read the "Member-supplied journey" line especially.**
- **Where:** everywhere another member's own skill appears (journey page, Journeys tab cards, Today's cards, Skills from the Flock, its setup)
  - New: "Member-supplied journey"
  - New: "A member shared this skill. It hasn't been reviewed by The Kya Project."
- **Where:** Your own skill
  - Removed: "Milestones", "3 to 8 small steps, in order.", "Milestone {{n}}", "Remove milestone {{n}}", "Add a milestone"
  - Kept: "What's the goal?", "Bath time, harness, quieter mornings…"
  - New: "What does it look like?", "Optional", "In your own words: what will your bird do when it's learned?", "{{used}} of {{max}}" (the counter, e.g. "28 of 500")
  - New, when the name is one of the 14: "{{skill}} is one of our skills, with its description and safety notes." and "Start {{skill}} instead"
- **Where:** Pick a skill (members only)
  - New button: "Skills from the Flock"
- **Where:** Skills from the Flock
  - New: "Skills from the Flock" (title), "Search skills" (screen readers), "Bath time, harness, ringing a bell…" (search placeholder), "From {{name}} journey" (e.g. "From Sunny's journey · Robin P."), "No shared skills match that yet.", "No member skills shared yet.", "Skills from the Flock come with Flock membership." (a free account opening the link)
- **Where:** a member skill's setup and journey page
  - New: "See {{name}} journey", "Report this skill", "Start this skill", "Started from {{name}} journey", "Skill not available", "This skill isn't shared any more."
- **Where:** the report sheet, review queue and notifications
  - New: "Report this skill" (sheet title), "Report · member skill", "(no description)" (a reported skill with no description), "your skill {{skill}}" (a reviewer's notice)

### [#557](https://github.com/the-kya-project/perch-perfect-plan/pull/557) · 1.11 Buddy pods follow-up (#548): no buddy groups, stage pills · **merged Nov 25, 2026**
Merged with Brittany's go-ahead. English only (pods have no Dutch yet).
- **Where:** setup screen, "Pair me with buddies" box (`flock.pods.optInLine`)
  - Before: "A small group of 3 to 6 members on the same journey, from your chapter when possible. You can leave anytime."
  - After: "A small group of 3 to 6 members on the same skill, from your chapter when possible. You can leave anytime."
- **Where:** setup screen, the line under the box when Just me is picked (`flock.pods.optInJustMe`)
  - Before: "Your buddies see your name and that you're on this journey. Your progress stays private while the journey is Just me."
  - After: "Your buddies see your name and that you're on this skill, but not where you are on it."
- **Where:** Flock settings → Buddy pods, empty list (`flock.pods.listEmpty`)
  - Before: "When you start a journey, tick "Pair me with buddies working on this too" to join a small group on the same journey."
  - After: "When you start a skill, tick "Pair me with buddies working on this too" to join a small group working on the same one."
- **Where:** Flock settings → Privacy, what members see (`flock.privacy.see.pods`)
  - Before: "In a buddy pod you joined: that you're on the journey, and your progress unless the journey is "Just me""
  - After: "In a buddy pod you joined: that you're on the journey, and where you are on it (working on it, learned it, or happy where we are) unless the journey is "Just me""
- **Where:** pod page, the pill on each member row (new: `flock.pods.stageWorking`, `stageLearned`, `stageHappy`, `stagePrivate`)
  - Before: a progress bar, "Finished" after the name, or "Progress kept private"
  - After: "Working on it" / "Learned it" / "Happy where we are", or "Journey kept private" (plain quiet text, no pill)
- **Where:** "Your buddy pod has closed" card on a journey, under "Find new buddies" (new: `flock.pods.readOldPod`)
  - Before: (none)
  - After: "Read the old pod" (links to the closed pod)
- **Where:** `/admin/pods`, member rows
  - Before: "Finished" (`flock.pods.finishedTag`)
  - After: "Learned it" or "Happy where we are" (the stage strings above)
- **Where:** pod page, "You finished!" card: unchanged words ("Stay in the pod to cheer the others on, or leave whenever you like."), now shown for "learned it" and "we're happy where we are" alike.
- **Removed:** "Keep going together?" card (`flock.pods.keepGoingTitle`, `keepGoingLine`, `keepGoingYes` "Yes, keep going", `keepGoingNo` "No, thanks"); "Buddy group" (`flock.pods.groupTitle`); "How did your week go?" (`flock.pods.weeklyGroup`); "Asking to keep going" (`flock.podsAdmin.asking`); "{{name}}'s progress" (`flock.pods.progressAria`); "Progress kept private" (`flock.pods.progressPrivate`); "Finished" (`flock.pods.finishedTag`).

### [#554](https://github.com/the-kya-project/perch-perfect-plan/pull/554) · 1.20b Journeys redesign: screens
English only (Dutch waits for your read of the English, as 1.20 says). Behind `journeys_enabled()` (off in production) and the Flock gate, so nobody sees these yet. Keys in `src/locales/en.jsonc`.
- **Where:** Journeys tab
  - "Start a journey" → "Start something new"
  - New: "Your journeys", "Paused", "From the Flock", "Day {{day}}", "Learned it · {{count}} days", "Learned it" (card pill; was "Finished"), "Happy where we are"
  - Card line. Before: "{{done}} of {{total}} · [owner] · N following". After: "Day 17 · [owner] · N following" (or "Learned it · 31 days")
  - Empty For you. Before: "Journeys are members' stories told one step at a time: a new trick, a calmer bird, a better diet. The first ones will appear here." After: "Journeys are members' stories of teaching their birds: a new trick, a calmer vet visit, a better diet. The first ones will appear here."
  - Empty Following. Before: "Follow a member's journey and each new step they share will show up here." After: "Follow a member's journey and each update they share will show up here."
  - "Post an update for…" rows: the "3/7" ring became a "Day N" badge ("Day")
- **Where:** Pick a skill
  - Title. Before: "Start a journey". After: "Pick a skill"
  - Groups. Before: "The basics · free", "Flock journeys". After: "Handling and health", "Foundations", "Food", "Tricks"
  - Row line. Before: "{{count}} milestones · usually {{length}}". After: the skill's description
  - Before: "{{name}} knows this". After: "{{name}} already knows this"
  - Before: "Write your own journey". After: "Your own skill" (button and the custom screen's title)
  - Removed: "{{name}}, part of the Flock" (the lock's label)
- **Where:** a skill's page and setup
  - Line under the title. Before: "{{name}} new journey". After: "for {{name}}"
  - New: "Safety notes", "How others did it", "Journeys and tips from Flock members", "No one has shared a journey for this skill yet. Yours could be the first.", "Learned it in {{count}} days", "Set it up", "{{skill}} video"
  - Removed: "Where is {{name}} starting?", "Tap anything she/he/they already do(es).", "Already", "Start here", "Leave at least one step to work on, or mark the whole skill as known instead.", "Day-one clip", "Record or add a clip", "Day-one clip added", "Replace", "You'll compare it with later clips. It's worth the 30 seconds.", "This journey is only available to Flock members."
- **Where:** the "Part of the Flock" sheet (free accounts; still no price)
  - Title. Before: "Teach {{bird}} to wave" (and the other six per-skill titles). After: "See how others did it", or "Ask the Flock"
  - Before: "Tricks like this one are only available to Flock members." After: "In the Flock, members share their journeys and what helped them, so you can see how other birds learned {{skill}}." / "In the Flock, you can ask other members about your journey and hear from people who've been there."
  - Before: "The Flock is The Kya Project's community, where you'll find your local chapter, a library of guides and recordings, and every training journey, including tricks, nail trims, and stationing." After: "The Flock is The Kya Project's community, where you'll find your local chapter, a library of guides and recordings, and other members' journeys."
- **Where:** the journey page
  - Removed: "{{done}} of {{total}}", " · next: {{next}}" and the step bar
  - New: "About this skill", "{{name}} learned it!", "{{name}} is on the new diet" (Diet conversion), the confirm sheet's "This finishes the journey and adds {{skill}} to {{name}} skills." / "This finishes the journey. Keep weighing {{name}} as usual." (Diet conversion), "Finish the journey", "Not yet"
  - Clip tag. Before: "Milestone". After: "Big moment" (also the story viewer, where it was "Milestone {{n}} of {{total}}")
  - Delete. Before: "This removes the journey, its milestones and its {{count}} clips for good. It can't be undone." After: "This removes the journey and its {{count}} clips for good. It can't be undone."
  - Day one vs. now. Before: "{{days}} days, {{sessions}} sessions, {{milestones}} milestones." After: "{{days}} days, {{sessions}} sessions, {{count}} big moments." (or without the last part when there are none)
- **Where:** Post an update
  - Removed: "Working on:", "Did {{name}} {{ask}}?", "Did {{name}} get this one? “{{title}}”", "Yes!", "Not yet"
  - New: "This was a big moment", "A first, a breakthrough, or a day worth remembering. Followers see it on Today, and you can make a share card.", "Your question will show to the Flock too, so members can answer.", "Only you can see this journey, so only you will see the question.", "Ask the Flock", "What a moment for {{name}}!"
  - The vet nudge's existing cards now show here too (no new wording).
- **Where:** finished
  - Title. Before: "{{name}} learned {{skill}}". After: "{{name}} learned {{skill}}!" or "{{name}} is on the new diet"
  - Button. Before: "Share and finish" / "Finish". After: "Done"
- **Where:** Today
  - Pill. Before: "Milestone {{n}} of {{total}} · {{name}} {{skill}}". After: "Big moment · {{name}} {{skill}}", or "Learned it · {{name}} {{skill}}" with "{{name}} learned {{skill}}!" / "{{name}} is on the new diet!"
  - Rings: "Day N" or "Learned it" under the name; the label "{{name}}'s {{skill}}, {{done}} of {{total}}" became "{{name}}'s {{skill}}, {{day}}"
- **Where:** share cards
  - Before: "{{skill}} · milestone {{n}}", "[Bird] [done line]!", "Milestone reached!", "Reached {{date}}". After: "{{skill}} · big moment", "A big moment for {{name}}!", "A big moment!", the date
- **Where:** challenges (journey challenges)
  - Before: "{{n}} milestones" in the summary, "{{done}} of {{total}} milestones" on the page. After: no step count; "Learned it" / "In progress" in the progress line; on the page "Finish the journey with “learned it” by the last day to complete the challenge." or "{{name}} learned it. You finished the challenge!"

### [#552](https://github.com/the-kya-project/perch-perfect-plan/pull/552) · 1.20a Journeys redesign: data and migration
Merged Nov 24, 2026. All of it is template text in the database (`journey_templates`), still `review_status = 'draft'`, written by `20261124190000_journeys_skills_data.sql` through `admin_update_journey_template`. Every "After" is the spec's "Skill content" word for word; nothing is shown to anyone but admins (journeys are off for everyone else). No app strings changed, so no Dutch.
- **Where:** each skill's description (`purpose`, shown on the skill page and the journey page from 1.20b)
  - Scale training. Before: "So your bird steps onto the scale calmly and stays still long enough for an accurate daily weight." After: "Your bird steps onto the scale calmly and stays still long enough for an accurate weight, so daily weigh-ins become easy."
  - Target training. Before: "So your bird learns to touch the tip of a stick for a reward, a simple tool that can guide them almost anywhere." After: "Your bird touches the tip of a stick and follows it, which gives you a gentle way to guide your bird almost anywhere."
  - Step up. Before: "So your bird steps onto your hand calmly and by choice, foot first, without biting." After: "Your bird steps onto your hand calmly and by choice, without biting."
  - Recall. Before: "So your bird comes to you when you say their name, which is the most important safety skill if they ever get out." After: "Your bird comes to you when you call its name, whether that means flying across the room or walking along a perch. It's the most important safety skill if your bird ever gets out."
  - Wing touch. Before: "So your bird is comfortable having wings touched and gently extended, for vet exams and health checks. The bird gives consent at every step." After: "Your bird is comfortable having its wings touched and gently opened, the way a vet does during an exam, and it stays relaxed the whole time."
  - Carrier comfort. Before: "So vet trips and travel start calmly, without chasing your bird into a crate." After: "Your bird walks into its carrier on its own and stays relaxed inside, so vet trips and travel start calmly."
  - Diet conversion. Before: "So your bird moves gradually from a seed-heavy diet to pellets, chop, and fresh foods without losing weight." After: "Your bird moves gradually from a seed-heavy diet to pellets, chop, and fresh foods while its weight stays steady."
  - Nail trims. Before: "So nail trims become a calm, two-minute routine instead of a towel wrestle." After: "Your bird stays calm while its nails are trimmed, without being wrapped in a towel."
  - Stationing. Before: "So your bird can stay on a perch while you move around, which matters most for birds that never want to leave your side." After: "Your bird goes to a chosen perch and stays there while you move around the room. It's especially helpful for birds that never want to leave your side."
  - Wave. Before: "So your bird lifts a foot and waves on cue. It builds on step up, since the wave starts as the beginning of a step up." After: "Your bird lifts one foot and waves it on cue."
  - High five. Before: "So your bird touches its raised foot to your palm. Wave is the natural first step." After: "Your bird touches its raised foot to your open palm."
  - Spin. Before: "So your bird turns a full circle on the perch. Pick one direction and stay with it until the spin is solid." After: "Your bird turns a full circle on its perch on cue."
  - Retrieve. Before: "So your bird picks up a small ball and drops it in your hand." After: "Your bird picks up a small ball and drops it into your hand."
  - Hang upside down. Before: "So your bird hangs upside down from your finger or a perch, a natural play behavior put on cue." After: "Your bird hangs upside down from your finger or a perch on cue, which turns a natural play behavior into a trick."
- **Where:** safety notes (`safety_notes`). Every skill keeps "Keep sessions short." / "Stop at the first sign of stress." / "Never withhold food to make a bird hungrier for training." first. Nail trims' ten lines are unchanged.
  - Wing touch. Before: (the three shared lines only). After: adds "Keep touches brief, because long body contact can trigger hormonal behavior." / "Never pull a wing that resists." / "If your bird has an injury, arthritis, or a wing that doesn't open fully, ask your avian vet what's comfortable first."
  - Spin. Before: (shared only). After: adds "Skip this one, or keep it very small, for birds with balance, grip, or leg problems."
  - Retrieve. Before: (shared only). After: adds "Use objects too big to swallow, with no small parts or paint that could chip."
  - Hang upside down. Before: (shared only). After: adds "Skip this one for birds with balance, grip, or leg problems, and practice over a soft surface."
  - Diet conversion. Before: (shared only). After: adds "Watch droppings and appetite as well as weight. If your bird stops eating, put the usual food back and call your vet." / "Some birds refuse new food so firmly that they stop eating. If your bird isn't eating, go back to the usual food today and call your vet." / "Weigh in grams at the same time every day. A few grams matter on a bird." / "Take uneaten fresh food out after a few hours so it doesn't spoil." / "How much to feed varies from bird to bird, even within a species. Your vet can tell you what's right for yours."
- **Where:** Diet conversion's "How to make it work" tips (`tips`, the only template with any)
  - Before: 11 tips (the five above, plus "Offer the new food first thing in the morning, with the usual food alongside.", "Eat it in front of them. …", "Change one thing at a time, …", "Try different forms: …", "Notice how your bird likes food already: …", "If your bird picks out the old food, …")
  - After: none (the five protective lines moved to the safety notes; the other six are gone)

### [#546](https://github.com/the-kya-project/perch-perfect-plan/pull/546) · 1.13a Badges: the Flock set
All new. Nobody but admins sees them while the Flock is closed. The badge names, "New: badges", "Here's what you've already earned", "See all badges", "Not now", "Badge earned", "Flock badges", "x of y earned" and "Trick star: finish any tricks journey." are the mockup's or the spec's words. The rest is agent wording.
- **Where:** `flock.badges.name.*` (everywhere a badge shows)
  - Before: new
  - After: "First steps", "Journey finisher", "Trick star", "Good neighbor", "Voice of the Flock", "Challenge champ"
- **Where:** `flock.badges.oneJourney` / `.journeysN` (Journey finisher's level, under the tile and after its name)
  - Before: new
  - After: "1 journey" / "{{n}} journeys" (shows as "Journey finisher · 3 journeys")
- **Where:** `flock.badges.launchLabel` / `.launchTitle` / `.launchLine` (the one-time celebration on Today)
  - Before: new
  - After: "New: badges" / "Here's what you've already earned" / "You've already done a lot in the Flock. These count." (the mockup's line, "You've been caring for Juno and the flock for a long time. These count.", is about care badges, which come with 1.13b)
- **Where:** `flock.badges.seeAll` / `.notNow` / `.gotIt` (celebration buttons)
  - Before: new
  - After: "See all badges" / "Not now" / "Got it"
- **Where:** `flock.badges.earnedLabel` (the "Badge earned" card on Today)
  - Before: new
  - After: "Badge earned"
- **Where:** `flock.badges.earned.*` (the line on the "Badge earned" card)
  - Before: new
  - After: "You finished your Flock profile and joined your chapter." / "You finished your first journey." / "You've finished {{n}} journeys." / "You finished a tricks journey." / "Something you shared to help other birds was approved." / "You voted in a Do good vote." / "You completed a challenge."
- **Where:** `flock.badges.title` / `.count` / `.flockSet` / `.loading` (Badges screen, and the Badges row in Flock settings)
  - Before: new
  - After: "Badges" / "{{earned}} of {{total}} earned" / "Flock badges" / "Loading your badges"
- **Where:** `flock.badges.how.*` (Badges screen, under the grid, for the badge tapped)
  - Before: new
  - After: "First steps: finish your Flock profile and join your chapter." / "Journey finisher: finish a journey. There are levels at 3 and 10 finished journeys." / "Trick star: finish any tricks journey." / "Good neighbor: have a Do good post approved, or a place you suggested added to your chapter." / "Voice of the Flock: vote in a Do good vote." / "Challenge champ: complete a Flock challenge."
- **Where:** `flock.badges.earnedOn` / `.earnedOnLevel` / `.nextLevel` (Badges screen, for an earned badge)
  - Before: new
  - After: "Earned {{date}}." / "{{level}} reached {{date}}." (shows as "3 journeys reached November 20, 2026.") / "Next level at {{n}} journeys."
- **Where:** `flock.badges.footer` (Badges screen, bottom)
  - Before: new
  - After: "Badges show on your Flock profile. A badge from "Just me" journeys stays here, for you. You can hide your badges on Edit profile."
- **Where:** `flock.badges.toggleLabel` / `.toggleHint` / `.see` / `.toggleError` (Edit profile, the new Badges switch)
  - Before: new
  - After: "Show my badges on my profile." / "Members see the Flock badges you've earned on your profile. You can change this any time." / "See your badges" / "That didn't save. Try again."
- **Where:** `flock.privacy.see.badges` (Privacy, "Members can see")
  - Before: new
  - After: "Your Flock badges, unless you hide them. Badges from "Just me" journeys stay with you."

### [#544](https://github.com/the-kya-project/perch-perfect-plan/pull/544) · 1.7 Instagram share cards for journeys
All new, on the share card screen (`/flock/journeys/<id>/card`) and the buttons that open it. Nobody but admins sees them while the Flock is closed. "Make a share card", "Post", "Story", "Show [bird]'s name", "Add my name", "Share", the web hint and "Kya & Co. · thekyaproject.com" are the mockup's words. The rest is agent wording. The mark is drawn on the card in English, not translated.
- **Where:** `flock.journeys.shareCard.make` (milestone celebration, finished journey page, Day one vs. now)
  - Before: new
  - After: "Make a share card"
- **Where:** `flock.journeys.shareCard.title` (screen title)
  - Before: new
  - After: "Share card"
- **Where:** `flock.journeys.shareCard.post` / `.story` (size chips)
  - Before: new
  - After: "Post" / "Story"
- **Where:** `flock.journeys.shareCard.showBird` / `.addMe` (switches)
  - Before: new
  - After: "Show {{name}} name" (shows as "Show Echo's name") / "Add my name"
- **Where:** `flock.journeys.shareCard.share` / `.webHint`
  - Before: new
  - After: "Share" / "On the web, this downloads the image so you can post it." (shown only where the browser can't share files)
- **Where:** `flock.journeys.shareCard.saved` (after a download)
  - Before: new
  - After: "The card is in your downloads, ready to post."
- **Where:** `flock.journeys.shareCard.failed`
  - Before: new
  - After: "We couldn't make the card. Try again in a moment."
- **Where:** `flock.journeys.shareCard.unavailable` (someone else's journey, a milestone not reached yet)
  - Before: new
  - After: "A share card can be made only for your own birds' journeys."
- **Where:** on the card, a milestone: `.milestoneEyebrow`, the title (the celebration's existing "{{name}} {{done}}!" / "{{name}} did it!"), `.lineNoName`, `.lineCustomNoName`, `.reachedOn`
  - Before: new
  - After: "{{skill}} · milestone {{n}}"; with the bird's name off, "{{done}}!" (e.g. "Stepped on with one foot!") or, for a custom journey, "Milestone reached!"; "Reached {{date}}"
- **Where:** on the card, a finished journey: `.finishedEyebrow`, `.finishedTitle`, `.finishedTitleNoName`, `.finishedOn`
  - Before: new
  - After: "{{skill}} · Finished!"; "{{name}} learned {{skill}}" / "Learned {{skill}}"; "Finished {{date}}"
- **Where:** on the card, day one vs. now: `.compareEyebrowFinished`, `.compareTitle`, `.compareTitleNoName`
  - Before: new
  - After: "{{skill}} · finished" (just the journey name while it's going); "{{name}}, day one and now" / "Day one and now"
- **Where:** on the card, the member's name when added: `.from`
  - Before: new
  - After: "From {{name}}"

### [#533](https://github.com/the-kya-project/perch-perfect-plan/pull/533) · 1.14a Card step and checkout design
Held for Brittany. Nobody sees these while `BILLING_ENABLED` is off.
- **Where:** every billing screen and Stripe's page, Dutch (written Nov 23, 2026 at Brittany's go-ahead; all new except `flock.you.membership`, which had no Dutch before)
  - `flock.billing.accessUntil`: "Toegang tot"
  - `flock.billing.addMyCard`: "Mijn kaart toevoegen · vandaag $0"
  - `flock.billing.allSet`: "Je bent <em>helemaal klaar</em>"
  - `flock.billing.backToFlock`: "Terug naar de Flock"
  - `flock.billing.billedMonthly`: "Maandelijks betaald"
  - `flock.billing.cardEnding`: "Eindigend op {{last4}}"
  - `flock.billing.cardLabel`: "Kaart"
  - `flock.billing.chargeMonthly`: "Je eerste betaling van {{price}}, daarna elke maand. Zeg je voor deze datum op, dan betaal je niets."
  - `flock.billing.chargeYearly`: "Je eerste betaling van {{price}}, daarna eens per jaar. Zeg je voor deze datum op, dan betaal je niets."
  - `flock.billing.checkoutNote`: "Je betaalt niets tot {{date}}. Je kunt tot die tijd altijd opzeggen via Lidmaatschap en betaling."
  - `flock.billing.chooseFounder`: "Je helpt bepalen waar het naartoe gaat, <strong>via de Do good-stemmingen</strong>, ook die alleen voor oprichters."
  - `flock.billing.chooseMember`: "Je helpt bepalen waar het naartoe gaat, <strong>via de Do good-stemmingen</strong> met de rest van de Flock."
  - `flock.billing.confirmingLine`: "Dit kan een minuutje duren. Je kunt hier blijven, we gaan verder zodra het klaar is."
  - `flock.billing.confirmingSlow`: "Dit duurt langer dan normaal. Je kaart is veilig bij Stripe, dus je hoeft hem niet opnieuw toe te voegen. Kijk over een paar minuten bij Lidmaatschap en betaling."
  - `flock.billing.confirmingTitle`: "Je kaart wordt bevestigd"
  - `flock.billing.ends`: "Je lidmaatschap wordt niet verlengd."
  - `flock.billing.error`: "Dat is niet gelukt. Probeer het zo opnieuw."
  - `flock.billing.firstCharge`: "Eerste betaling"
  - `flock.billing.flockMember`: "Lid van de Flock"
  - `flock.billing.founding`: "Oprichtersprijs: {{price}} per maand, vast zolang je lid blijft."
  - `flock.billing.founding50`: "Founding 50"
  - `flock.billing.foundingLabel`: "Oprichtersprijs"
  - `flock.billing.foundingLocked`: "Vast zolang je lid blijft."
  - `flock.billing.foundingOthers`: "Alle anderen betalen {{price}}."
  - `flock.billing.foundingRelease`: "Staat er op {{date}} geen kaart, dan komt je oprichtersplek vrij en kun je die niet opnieuw claimen."
  - `flock.billing.foundingSpot`: "Founding 50 · Plek #{{spot}}"
  - `flock.billing.freeUntil`: "Gratis tot"
  - `flock.billing.givesBack`: "Elk lidmaatschap geeft iets terug"
  - `flock.billing.givesBackLine`: "van wat je betaalt gaat naar partners in papegaaienopvang en natuurbehoud"
  - `flock.billing.givesBackNote`: "<strong>Je lidmaatschap geeft iets terug.</strong> 20% gaat naar partners in papegaaienopvang en natuurbehoud."
  - `flock.billing.heroAfterLine`: "Word lid van de Flock en help papegaaien in de opvang en in het wild."
  - `flock.billing.heroFounder`: "Dankzij jou <em>begon dit</em>. Houd je {{price}}."
  - `flock.billing.heroFounderLine`: "Voeg uiterlijk {{date}} een kaart toe om je oprichtersplek en prijs te houden. Tot die tijd betaal je niets."
  - `flock.billing.heroMember`: "Jouw lidmaatschap <em>doet goed</em> voor papegaaien"
  - `flock.billing.heroSeasonLine`: "Voeg nu een kaart toe om na de gratis periode in de Flock te blijven. Je betaalt niets tot {{date}}."
  - `flock.billing.howItWorks`: "Zo werkt het"
  - `flock.billing.includes`: "Dit zit in je lidmaatschap"
  - `flock.billing.joinFlock`: "Word lid van de Flock"
  - `flock.billing.keepSpot`: "Mijn oprichtersplek houden · vandaag $0"
  - `flock.billing.keeps`: "Dit houd je met je lidmaatschap"
  - `flock.billing.manage`: "Betaling beheren"
  - `flock.billing.manageLine`: "Wijzig je kaart of abonnement, of zeg op wanneer je wilt."
  - `flock.billing.monthlyLabel`: "Maandelijks"
  - `flock.billing.monthsFree_one`: "{{count}} maand gratis"
  - `flock.billing.monthsFree_other`: "{{count}} maanden gratis"
  - `flock.billing.nextCharge`: "Volgende betaling"
  - `flock.billing.notReady`: "Je kunt een kaart toevoegen zodra het einde van de gratis periode vaststaat."
  - `flock.billing.onFile`: "Kaart opgeslagen"
  - `flock.billing.pastDueLine`: "Dat kan gebeuren, vaak door een verlopen kaart. Werk je kaart uiterlijk {{date}} bij om je plek in de Flock te houden."
  - `flock.billing.pastDueNoDate`: "Dat kan gebeuren, vaak door een verlopen kaart. Werk je kaart bij om je plek in de Flock te houden."
  - `flock.billing.pastDueTitle`: "Je laatste betaling is niet gelukt"
  - `flock.billing.perMonth`: "/mnd"
  - `flock.billing.perkBadge`: "Je oprichtersbadge en je plek bij de Founding 50"
  - `flock.billing.perkChapter`: "Je afdeling, met vogeldierenartsen, opvangcentra en winkels die andere leden aanraden"
  - `flock.billing.perkFounderAll`: "Je afdeling, trajecten en de volledige bibliotheek"
  - `flock.billing.perkFounderVote`: "Een stem in Do good, ook bij stemmingen alleen voor oprichters"
  - `flock.billing.perkJourneys`: "Stapsgewijze trajecten voor training en verzorging"
  - `flock.billing.perkLibrary`: "De volledige bibliotheek"
  - `flock.billing.perkVote`: "Een stem in Do good, over waar de donaties van de Flock naartoe gaan"
  - `flock.billing.pickHow`: "Kies hoe je betaalt"
  - `flock.billing.planFounding`: "Oprichtend lid"
  - `flock.billing.planLabel`: "Abonnement"
  - `flock.billing.renews`: "Je lidmaatschap wordt automatisch verlengd."
  - `flock.billing.renewsMonthly`: "Wordt elke maand verlengd. Opzeggen kan altijd via Betaling beheren."
  - `flock.billing.renewsYearly`: "Wordt eens per jaar verlengd. Opzeggen kan altijd via Betaling beheren."
  - `flock.billing.saveCardNoteMonthly`: "De Flock, {{price}} per maand. Je betaalt niets tot {{date}}. Je kunt tot die tijd altijd opzeggen via Lidmaatschap en betaling."
  - `flock.billing.saveCardNoteYearly`: "De Flock, {{price}} per jaar. Je betaalt niets tot {{date}}. Je kunt tot die tijd altijd opzeggen via Lidmaatschap en betaling."
  - `flock.billing.seasonSet`: "Gratis periode · alles staat klaar voor daarna"
  - `flock.billing.secure`: "Veilig betalen met Stripe"
  - `flock.billing.secureCancel`: "Veilig betalen met Stripe · Altijd opzegbaar"
  - `flock.billing.seeMembership`: "Bekijk lidmaatschap en betaling"
  - `flock.billing.spotSafe`: "Je plek is <em>veilig</em>"
  - `flock.billing.staysFree`: "Alles in de Flock blijft gratis, net als nu."
  - `flock.billing.thanks`: "<strong>Dankjewel.</strong> 20% van je lidmaatschap gaat naar partners in papegaaienopvang en natuurbehoud."
  - `flock.billing.today`: "Vandaag"
  - `flock.billing.todayFounder`: "Voeg je kaart toe. Je oprichtersplek is veilig. Vandaag betaal je $0."
  - `flock.billing.todayLine`: "Voeg je kaart toe. Vandaag betaal je $0."
  - `flock.billing.until`: "Tot {{date}}"
  - `flock.billing.updateCard`: "Mijn kaart bijwerken"
  - `flock.billing.welcomeFounderLine`: "Je oprichtersprijs staat vast. Bedankt dat je de Flock mee hebt opgericht."
  - `flock.billing.welcomeLine`: "Je plek in de Flock is bewaard voor na de gratis periode. Tot die tijd verandert er niets."
  - `flock.billing.yearlyLabel`: "Jaarlijks"
  - `flock.billing.yearlyTotal`: "{{price}} eens per jaar"
  - `flock.you.membership`: "Lidmaatschap en betaling"
- **Where:** Checkout, last 49 hours of the free season, `flock.billing.saveCardNoteYearly`
  - Before: new
  - After: "The Flock, {{price}} a year. You won't be charged until {{date}}. Cancel anytime before then from Membership and billing."
- **Where:** Checkout, last 49 hours of the free season, `flock.billing.saveCardNoteMonthly`
  - Before: new
  - After: "The Flock, {{price}} a month. You won't be charged until {{date}}. Cancel anytime before then from Membership and billing."
- **Where:** billing screens, `flock.billing.accessUntil`
  - Before: new
  - After: "Access until"
- **Where:** billing screens, `flock.billing.addMyCard`
  - Before: new
  - After: "Add my card · $0 today"
- **Where:** billing screens, `flock.billing.allSet`
  - Before: new
  - After: "You're <em>all set</em>"
- **Where:** billing screens, `flock.billing.backToFlock`
  - Before: new
  - After: "Back to the Flock"
- **Where:** billing screens, `flock.billing.billedMonthly`
  - Before: new
  - After: "Billed monthly"
- **Where:** billing screens, `flock.billing.cardEnding`
  - Before: new
  - After: "Ending in {{last4}}"
- **Where:** billing screens, `flock.billing.cardLabel`
  - Before: new
  - After: "Card"
- **Where:** billing screens, `flock.billing.chargeMonthly`
  - Before: new
  - After: "Your first charge of {{price}}, then monthly. Cancel before this date and you won't be charged."
- **Where:** billing screens, `flock.billing.chargeYearly`
  - Before: new
  - After: "Your first charge of {{price}}, then once a year. Cancel before this date and you won't be charged."
- **Where:** billing screens, `flock.billing.checkoutNote`
  - Before: new
  - After: "You won't be charged until {{date}}. Cancel anytime before then from Membership and billing."
- **Where:** billing screens, `flock.billing.chooseFounder`
  - Before: new
  - After: "You help choose where it goes, <strong>through Do good votes</strong>, including the founders-only ones."
- **Where:** billing screens, `flock.billing.chooseMember`
  - Before: new
  - After: "You help choose where it goes, <strong>through Do good votes</strong> with the rest of the Flock."
- **Where:** billing screens, `flock.billing.confirmingLine`
  - Before: new
  - After: "This can take a minute. You can stay right here, and we'll move on as soon as it's done."
- **Where:** billing screens, `flock.billing.confirmingSlow`
  - Before: new
  - After: "This is taking longer than usual. Your card is safe with Stripe, so there's no need to add it again. Check Membership and billing in a few minutes."
- **Where:** billing screens, `flock.billing.confirmingTitle`
  - Before: new
  - After: "Confirming your card"
- **Where:** billing screens, `flock.billing.firstCharge`
  - Before: new
  - After: "First charge"
- **Where:** billing screens, `flock.billing.flockMember`
  - Before: new
  - After: "Flock member"
- **Where:** billing screens, `flock.billing.founding50`
  - Before: new
  - After: "Founding 50"
- **Where:** billing screens, `flock.billing.foundingLabel`
  - Before: new
  - After: "Founding price"
- **Where:** billing screens, `flock.billing.foundingLocked`
  - Before: new
  - After: "Locked in for as long as you stay a member."
- **Where:** billing screens, `flock.billing.foundingOthers`
  - Before: new
  - After: "Everyone else pays {{price}}."
- **Where:** billing screens, `flock.billing.foundingRelease`
  - Before: new
  - After: "Without a card on file by {{date}}, your founding spot is released and can't be claimed again."
- **Where:** billing screens, `flock.billing.foundingSpot`
  - Before: new
  - After: "Founding 50 · Spot #{{spot}}"
- **Where:** billing screens, `flock.billing.freeUntil`
  - Before: new
  - After: "Free until"
- **Where:** billing screens, `flock.billing.givesBack`
  - Before: new
  - After: "Every membership gives back"
- **Where:** billing screens, `flock.billing.givesBackLine`
  - Before: new
  - After: "of what you pay goes to parrot rescue and conservation partners"
- **Where:** billing screens, `flock.billing.givesBackNote`
  - Before: new
  - After: "<strong>Your membership gives back.</strong> 20% goes to parrot rescue and conservation partners."
- **Where:** billing screens, `flock.billing.heroAfterLine`
  - Before: new
  - After: "Join the Flock, and help parrots in rescues and in the wild."
- **Where:** billing screens, `flock.billing.heroFounder`
  - Before: new
  - After: "You helped <em>start this</em>. Keep your {{price}}."
- **Where:** billing screens, `flock.billing.heroFounderLine`
  - Before: new
  - After: "Add a card by {{date}} to hold your founding spot and price. You won't pay anything until then."
- **Where:** billing screens, `flock.billing.heroMember`
  - Before: new
  - After: "Your membership <em>does good</em> for parrots"
- **Where:** billing screens, `flock.billing.heroSeasonLine`
  - Before: new
  - After: "Add a card now to stay in the Flock after the free season. You won't pay anything until {{date}}."
- **Where:** billing screens, `flock.billing.howItWorks`
  - Before: new
  - After: "How it works"
- **Where:** billing screens, `flock.billing.includes`
  - Before: new
  - After: "What your membership includes"
- **Where:** billing screens, `flock.billing.joinFlock`
  - Before: new
  - After: "Join the Flock"
- **Where:** billing screens, `flock.billing.keepSpot`
  - Before: new
  - After: "Keep my founding spot · $0 today"
- **Where:** billing screens, `flock.billing.keeps`
  - Before: new
  - After: "What your membership keeps"
- **Where:** billing screens, `flock.billing.manageLine`
  - Before: new
  - After: "Change your card or plan, or cancel, any time."
- **Where:** billing screens, `flock.billing.monthlyLabel`
  - Before: new
  - After: "Monthly"
- **Where:** billing screens, `flock.billing.monthsFree_one`
  - Before: new
  - After: "{{count}} month free"
- **Where:** billing screens, `flock.billing.monthsFree_other`
  - Before: new
  - After: "{{count}} months free"
- **Where:** billing screens, `flock.billing.nextCharge`
  - Before: new
  - After: "Next charge"
- **Where:** billing screens, `flock.billing.pastDueLine`
  - Before: new
  - After: "It happens, often with an expired card. Update your card by {{date}} to keep your place in the Flock."
- **Where:** billing screens, `flock.billing.pastDueNoDate`
  - Before: new
  - After: "It happens, often with an expired card. Update your card to keep your place in the Flock."
- **Where:** billing screens, `flock.billing.pastDueTitle`
  - Before: new
  - After: "Your last payment didn't go through"
- **Where:** billing screens, `flock.billing.perMonth`
  - Before: new
  - After: "/mo"
- **Where:** billing screens, `flock.billing.perkBadge`
  - Before: new
  - After: "Your founder badge and your place among the Founding 50"
- **Where:** billing screens, `flock.billing.perkChapter`
  - Before: new
  - After: "Your chapter, with avian vets, rescues and shops other members recommend"
- **Where:** billing screens, `flock.billing.perkFounderAll`
  - Before: new
  - After: "Your chapter, journeys and the full Library"
- **Where:** billing screens, `flock.billing.perkFounderVote`
  - Before: new
  - After: "A vote in Do good, including founders-only votes"
- **Where:** billing screens, `flock.billing.perkJourneys`
  - Before: new
  - After: "Step-by-step journeys for training and care"
- **Where:** billing screens, `flock.billing.perkLibrary`
  - Before: new
  - After: "The full Library"
- **Where:** billing screens, `flock.billing.perkVote`
  - Before: new
  - After: "A vote in Do good, on where the Flock's giving goes"
- **Where:** billing screens, `flock.billing.pickHow`
  - Before: new
  - After: "Pick how you pay"
- **Where:** billing screens, `flock.billing.planFounding`
  - Before: new
  - After: "Founding member"
- **Where:** billing screens, `flock.billing.planLabel`
  - Before: new
  - After: "Plan"
- **Where:** billing screens, `flock.billing.renewsMonthly`
  - Before: new
  - After: "Renews every month. Cancel anytime in Manage billing."
- **Where:** billing screens, `flock.billing.renewsYearly`
  - Before: new
  - After: "Renews once a year. Cancel anytime in Manage billing."
- **Where:** billing screens, `flock.billing.seasonSet`
  - Before: new
  - After: "Free season · you're all set for after"
- **Where:** billing screens, `flock.billing.secure`
  - Before: new
  - After: "Secure checkout with Stripe"
- **Where:** billing screens, `flock.billing.secureCancel`
  - Before: new
  - After: "Secure checkout with Stripe · Cancel anytime"
- **Where:** billing screens, `flock.billing.seeMembership`
  - Before: new
  - After: "See membership and billing"
- **Where:** billing screens, `flock.billing.spotSafe`
  - Before: new
  - After: "Your spot is <em>safe</em>"
- **Where:** billing screens, `flock.billing.staysFree`
  - Before: new
  - After: "Everything in the Flock stays free, just like now."
- **Where:** billing screens, `flock.billing.thanks`
  - Before: new
  - After: "<strong>Thank you.</strong> 20% of your membership will go to parrot rescue and conservation partners."
- **Where:** billing screens, `flock.billing.today`
  - Before: new
  - After: "Today"
- **Where:** billing screens, `flock.billing.todayFounder`
  - Before: new
  - After: "Add your card. Your founding spot is safe. $0 due today."
- **Where:** billing screens, `flock.billing.todayLine`
  - Before: new
  - After: "Add your card. $0 due today."
- **Where:** billing screens, `flock.billing.until`
  - Before: new
  - After: "Until {{date}}"
- **Where:** billing screens, `flock.billing.updateCard`
  - Before: new
  - After: "Update my card"
- **Where:** billing screens, `flock.billing.welcomeFounderLine`
  - Before: new
  - After: "Your founding price is locked in. Thank you for helping start the Flock."
- **Where:** billing screens, `flock.billing.welcomeLine`
  - Before: new
  - After: "Your place in the Flock is saved for after the free season. Nothing changes until then."
- **Where:** billing screens, `flock.billing.yearlyLabel`
  - Before: new
  - After: "Yearly"
- **Where:** billing screens, `flock.billing.yearlyTotal`
  - Before: new
  - After: "{{price}} once a year"
- **Where:** billing screens, `flock.billing.addCard`
  - Before: "Add a card"
  - After: removed, replaced by the mockup's wording
- **Where:** billing screens, `flock.billing.chargedToday`
  - Before: "You'll be charged today."
  - After: removed, replaced by the mockup's wording
- **Where:** billing screens, `flock.billing.choose`
  - Before: "Choose a plan"
  - After: removed, replaced by the mockup's wording
- **Where:** billing screens, `flock.billing.confirming`
  - Before: "We're confirming your card. This can take a minute."
  - After: removed, replaced by the mockup's wording
- **Where:** billing screens, `flock.billing.firstChargeOn`
  - Before: "First charge on {{date}}."
  - After: removed, replaced by the mockup's wording
- **Where:** billing screens, `flock.billing.monthly`
  - Before: "Monthly: {{price}} a month"
  - After: removed, replaced by the mockup's wording
- **Where:** billing screens, `flock.billing.pastDue`
  - Before: "Your last payment didn't go through. Update your card to keep your membership."
  - After: removed, replaced by the mockup's wording
- **Where:** billing screens, `flock.billing.yearly`
  - Before: "Yearly: {{price}} a year"
  - After: removed, replaced by the mockup's wording
- **Where:** billing screens, `flock.billing.zeroToday`
  - Before: "$0 today. Your first charge is on {{date}}."
  - After: removed, replaced by the mockup's wording
### [#529](https://github.com/the-kya-project/perch-perfect-plan/pull/529) · 1.8 Do good voting (shared donation)
Every voting line as merged, all new to the live app. Nobody but admins sees them while the Flock is closed. The member wording follows Brittany's approved mockups. The founders-only lines and "See your vote" are agent wording the mockups don't cover.
- **Where:** `flock.votes.adminCounts_one`
  - Before: new
  - After: "Counts (admins only) · {{count}} vote"
- **Where:** `flock.votes.adminCounts_other`
  - Before: new
  - After: "Counts (admins only) · {{count}} votes"
- **Where:** `flock.votes.backToGood`
  - Before: new
  - After: "Back to Do good"
- **Where:** `flock.votes.closedError`
  - Before: new
  - After: "This vote has closed, so it can't take new votes."
- **Where:** `flock.votes.closedEyebrow_one`
  - Before: new
  - After: "Do good vote · closed {{day}} · {{count}} vote"
- **Where:** `flock.votes.closedEyebrow_other`
  - Before: new
  - After: "Do good vote · closed {{day}} · {{count}} votes"
- **Where:** `flock.votes.closedTag`
  - Before: new
  - After: "Vote closed"
- **Where:** `flock.votes.draftLine`
  - Before: new
  - After: "Draft · only admins can see it"
- **Where:** `flock.votes.error`
  - Before: new
  - After: "Your vote didn't save. Try again."
- **Where:** `flock.votes.finalNote`
  - Before: new
  - After: "Your vote is final once you tap the button."
- **Where:** `flock.votes.founders`
  - Before: new
  - After: "Founders"
- **Where:** `flock.votes.foundersChose`
  - Before: new
  - After: "Founders chose {{names}}."
- **Where:** `flock.votes.foundersChoseTag`
  - Before: new
  - After: "Founders chose"
- **Where:** `flock.votes.foundersClosedEyebrow_one`
  - Before: new
  - After: "Founders vote · closed {{day}} · {{count}} vote"
- **Where:** `flock.votes.foundersClosedEyebrow_other`
  - Before: new
  - After: "Founders vote · closed {{day}} · {{count}} votes"
- **Where:** `flock.votes.foundersOpenEyebrow`
  - Before: new
  - After: "Founders vote · closes {{day}}"
- **Where:** `flock.votes.howItWorks`
  - Before: new
  - After: "Every partner gets at least 10%. Your vote decides how the rest is shared. You can vote once."
- **Where:** `flock.votes.howItWorksFounders`
  - Before: new
  - After: "You can vote once. Results show when the vote closes."
- **Where:** `flock.votes.manage`
  - Before: new
  - After: "Manage this vote"
- **Where:** `flock.votes.manageAll`
  - Before: new
  - After: "Manage votes"
- **Where:** `flock.votes.missing`
  - Before: new
  - After: "It may have been removed, or it's only for founding members."
- **Where:** `flock.votes.missingTitle`
  - Before: new
  - After: "This vote isn't here"
- **Where:** `flock.votes.noResult`
  - Before: new
  - After: "No votes were cast."
- **Where:** `flock.votes.note`
  - Before: new
  - After: "A note from Brittany"
- **Where:** `flock.votes.noteFrom`
  - Before: new
  - After: "The Kya Project"
- **Where:** `flock.votes.ofVotes`
  - Before: new
  - After: "{{percent}}% of the votes"
- **Where:** `flock.votes.openEyebrow`
  - Before: new
  - After: "Do good vote · closes {{day}}"
- **Where:** `flock.votes.openTag`
  - Before: new
  - After: "Vote open · closes {{day}}"
- **Where:** `flock.votes.partners`
  - Before: new
  - After: "partners"
- **Where:** `flock.votes.pickOne`
  - Before: new
  - After: "Pick one to vote"
- **Where:** `flock.votes.resultsTitle`
  - Before: new
  - After: "How this quarter's donation is <em>handled</em>"
- **Where:** `flock.votes.resultsWhen`
  - Before: new
  - After: "Results show when the vote closes on {{day}}."
- **Where:** `flock.votes.ringLabel`
  - Before: new
  - After: "Donation shares: {{shares}}"
- **Where:** `flock.votes.seeResults`
  - Before: new
  - After: "See the results"
- **Where:** `flock.votes.seeYourVote`
  - Before: new
  - After: "See your vote"
- **Where:** `flock.votes.sharedEvenly`
  - Before: new
  - After: "No votes were cast, so the donation is shared evenly."
- **Where:** `flock.votes.sharedOutcome`
  - Before: new
  - After: "Every partner gets at least 10%. Your votes decided the rest."
- **Where:** `flock.votes.shareSplit`
  - Before: new
  - After: "{{guaranteed}}% guaranteed + {{fromVotes}}% from votes"
- **Where:** `flock.votes.tenPercentLine`
  - Before: new
  - After: "Every partner gets at least 10%, and the votes share out the rest."
- **Where:** `flock.votes.thanks`
  - Before: new
  - After: "Thanks for voting"
- **Where:** `flock.votes.thanksLine`
  - Before: new
  - After: "You've helped decide where this quarter's donation goes."
- **Where:** `flock.votes.thanksLineFounders`
  - Before: new
  - After: "You've helped decide what the Flock does first."
- **Where:** `flock.votes.title`
  - Before: new
  - After: "Vote"
- **Where:** `flock.votes.voted_one`
  - Before: new
  - After: "{{count}} member has voted"
- **Where:** `flock.votes.voted_other`
  - Before: new
  - After: "{{count}} members have voted"
- **Where:** `flock.votes.votedSoFar_one`
  - Before: new
  - After: "{{count}} member has voted so far."
- **Where:** `flock.votes.votedSoFar_other`
  - Before: new
  - After: "{{count}} members have voted so far."
- **Where:** `flock.votes.voteFor`
  - Before: new
  - After: "Vote for {{name}}"
- **Where:** `flock.votes.voteNow`
  - Before: new
  - After: "Vote now"
- **Where:** `flock.votes.yourVote`
  - Before: new
  - After: "Your vote"
- **Where:** `flock.votes.youVoted_one`
  - Before: new
  - After: "You voted · {{count}} member has voted"
- **Where:** `flock.votes.youVoted_other`
  - Before: new
  - After: "You voted · {{count}} members have voted"
- **Where:** `flock.votesAdmin.addChoice`
  - Before: new
  - After: "Add a choice"
- **Where:** `flock.votesAdmin.addLogo`
  - Before: new
  - After: "Add logo or photo"
- **Where:** `flock.votesAdmin.allMembers`
  - Before: new
  - After: "All members"
- **Where:** `flock.votesAdmin.audienceLabel`
  - Before: new
  - After: "Who votes"
- **Where:** `flock.votesAdmin.cantOpen`
  - Before: new
  - After: "Add {{what}} before opening."
- **Where:** `flock.votesAdmin.checkError`
  - Before: new
  - After: "Something in the form isn't allowed. Check the question, the choices and the date, then try again."
- **Where:** `flock.votesAdmin.choiceBlurb`
  - Before: new
  - After: "Choice {{n}} description"
- **Where:** `flock.votesAdmin.choiceBlurbPlaceholder`
  - Before: new
  - After: "A sentence or two"
- **Where:** `flock.votesAdmin.choiceCount_one`
  - Before: new
  - After: "{{count}} choice"
- **Where:** `flock.votesAdmin.choiceCount_other`
  - Before: new
  - After: "{{count}} choices"
- **Where:** `flock.votesAdmin.choiceName`
  - Before: new
  - After: "Choice {{n}} name"
- **Where:** `flock.votesAdmin.choiceNamePlaceholder`
  - Before: new
  - After: "Name"
- **Where:** `flock.votesAdmin.choicesHint`
  - Before: new
  - After: "Two to eight. Each has a name, a sentence or two, and the partner's logo or a photo. Every choice gets at least 10% of the donation, and the votes share out the rest."
- **Where:** `flock.votesAdmin.choicesLabel`
  - Before: new
  - After: "Choices"
- **Where:** `flock.votesAdmin.closeConfirm`
  - Before: new
  - After: "Close this vote now?"
- **Where:** `flock.votesAdmin.closeConfirmLine`
  - Before: new
  - After: "Voting stops now and everyone sees the results. This can't be undone."
- **Where:** `flock.votesAdmin.closed`
  - Before: new
  - After: "Closed"
- **Where:** `flock.votesAdmin.closedLine_one`
  - Before: new
  - After: "Closed {{day}} · {{count}} vote"
- **Where:** `flock.votesAdmin.closedLine_other`
  - Before: new
  - After: "Closed {{day}} · {{count}} votes"
- **Where:** `flock.votesAdmin.closedNow`
  - Before: new
  - After: "Closed. Members now see the results."
- **Where:** `flock.votesAdmin.closedOn`
  - Before: new
  - After: "Closed {{day}}"
- **Where:** `flock.votesAdmin.closeEarly`
  - Before: new
  - After: "Close early"
- **Where:** `flock.votesAdmin.closesHint`
  - Before: new
  - After: "Your local time. You can close it early or extend it once it's open."
- **Where:** `flock.votesAdmin.closesLabel`
  - Before: new
  - After: "Closes"
- **Where:** `flock.votesAdmin.closesOn`
  - Before: new
  - After: "Closes {{day}}"
- **Where:** `flock.votesAdmin.closeYes`
  - Before: new
  - After: "Close now"
- **Where:** `flock.votesAdmin.delete`
  - Before: new
  - After: "Delete draft"
- **Where:** `flock.votesAdmin.deleteConfirm`
  - Before: new
  - After: "Delete this draft?"
- **Where:** `flock.votesAdmin.deleteConfirmLine`
  - Before: new
  - After: "Delete it for good, with its photos? This can't be undone."
- **Where:** `flock.votesAdmin.descriptionLabel`
  - Before: new
  - After: "Short description (optional)"
- **Where:** `flock.votesAdmin.draft`
  - Before: new
  - After: "Draft"
- **Where:** `flock.votesAdmin.draftLine`
  - Before: new
  - After: "A draft. Only admins can see it."
- **Where:** `flock.votesAdmin.edit`
  - Before: new
  - After: "Edit vote"
- **Where:** `flock.votesAdmin.empty`
  - Before: new
  - After: "No votes yet. Tap New vote to write one. It stays a draft, visible only to admins, until you open it."
- **Where:** `flock.votesAdmin.extend`
  - Before: new
  - After: "Extend the vote"
- **Where:** `flock.votesAdmin.extended`
  - Before: new
  - After: "Extended. Members see the new close date."
- **Where:** `flock.votesAdmin.extendError`
  - Before: new
  - After: "Pick a later close date than the current one."
- **Where:** `flock.votesAdmin.extendLabel`
  - Before: new
  - After: "Extend to"
- **Where:** `flock.votesAdmin.foundersOnly`
  - Before: new
  - After: "Founders only"
- **Where:** `flock.votesAdmin.keepOpen`
  - Before: new
  - After: "Keep it open"
- **Where:** `flock.votesAdmin.line`
  - Before: new
  - After: "Admin · drafts stay hidden until you open them"
- **Where:** `flock.votesAdmin.loadError`
  - Before: new
  - After: "We couldn't load the votes. Try again."
- **Where:** `flock.votesAdmin.memberView`
  - Before: new
  - After: "See what members see"
- **Where:** `flock.votesAdmin.missing`
  - Before: new
  - After: "Vote not found"
- **Where:** `flock.votesAdmin.missingLine`
  - Before: new
  - After: "It may have been deleted."
- **Where:** `flock.votesAdmin.moveDown`
  - Before: new
  - After: "Move choice {{n}} down"
- **Where:** `flock.votesAdmin.moveUp`
  - Before: new
  - After: "Move choice {{n}} up"
- **Where:** `flock.votesAdmin.needQuestion`
  - Before: new
  - After: "Add the question first."
- **Where:** `flock.votesAdmin.new`
  - Before: new
  - After: "New vote"
- **Where:** `flock.votesAdmin.noteHint`
  - Before: new
  - After: "Shows with the results as \"A note from Brittany\" once the vote closes."
- **Where:** `flock.votesAdmin.noteLabel`
  - Before: new
  - After: "Announcement"
- **Where:** `flock.votesAdmin.noteSaved`
  - Before: new
  - After: "Announcement saved."
- **Where:** `flock.votesAdmin.open`
  - Before: new
  - After: "Open"
- **Where:** `flock.votesAdmin.openLine_one`
  - Before: new
  - After: "Open · closes {{day}} · {{count}} vote"
- **Where:** `flock.votesAdmin.openLine_other`
  - Before: new
  - After: "Open · closes {{day}} · {{count}} votes"
- **Where:** `flock.votesAdmin.openVote`
  - Before: new
  - After: "Open the vote"
- **Where:** `flock.votesAdmin.questionLabel`
  - Before: new
  - After: "Question"
- **Where:** `flock.votesAdmin.questionPlaceholder`
  - Before: new
  - After: "Where should this quarter's donation go?"
- **Where:** `flock.votesAdmin.removeChoice`
  - Before: new
  - After: "Remove choice {{n}}"
- **Where:** `flock.votesAdmin.removeLogo`
  - Before: new
  - After: "Remove"
- **Where:** `flock.votesAdmin.replaceLogo`
  - Before: new
  - After: "Replace logo"
- **Where:** `flock.votesAdmin.savedDraft`
  - Before: new
  - After: "Draft saved. Only admins can see it."
- **Where:** `flock.votesAdmin.saveNote`
  - Before: new
  - After: "Save announcement"
- **Where:** `flock.votesAdmin.sharesHint`
  - Before: new
  - After: "10% guaranteed to each partner, the rest by votes. Use these shares when you send the donation."
- **Where:** `flock.votesAdmin.sharesTitle`
  - Before: new
  - After: "How the donation is shared"
- **Where:** `flock.votesAdmin.title`
  - Before: new
  - After: "Votes"
- **Where:** `flock.votesAdmin.toOpen`
  - Before: new
  - After: "To open it, add {{what}}."
- **Where:** `flock.votesAdmin.voteCount_one`
  - Before: new
  - After: "{{count}} vote"
- **Where:** `flock.votesAdmin.voteCount_other`
  - Before: new
  - After: "{{count}} votes"

### [#525](https://github.com/the-kya-project/perch-perfect-plan/pull/525) · 1.14 Billing foundation (switched off)
Approved and merged by Brittany (Nov 23, 2026). All 16 lines are new, as merged; nobody sees them while `BILLING_ENABLED` is off. Brittany changed the founding line before merge. `{{price}}` shows the Stripe price ($15).
- **Where:** Membership's card step, `flock.billing.addCard`
  - Before: new
  - After: "Add a card"
- **Where:** Membership's card step, `flock.billing.chargedToday`
  - Before: new
  - After: "You'll be charged today."
- **Where:** Membership's card step, `flock.billing.choose`
  - Before: new
  - After: "Choose a plan"
- **Where:** Membership's card step, `flock.billing.confirming`
  - Before: new
  - After: "We're confirming your card. This can take a minute."
- **Where:** Membership's card step, `flock.billing.ends`
  - Before: new
  - After: "Your membership won't renew."
- **Where:** Membership's card step, `flock.billing.error`
  - Before: new
  - After: "That didn't work. Try again in a moment."
- **Where:** Membership's card step, `flock.billing.firstChargeOn`
  - Before: new
  - After: "First charge on {{date}}."
- **Where:** Membership's card step, `flock.billing.founding`
  - Before: new
  - After: "Founding price: {{price}} a month, locked in for as long as you stay a member."
- **Where:** Membership's card step, `flock.billing.manage`
  - Before: new
  - After: "Manage billing"
- **Where:** Membership's card step, `flock.billing.monthly`
  - Before: new
  - After: "Monthly: {{price}} a month"
- **Where:** Membership's card step, `flock.billing.notReady`
  - Before: new
  - After: "Adding a card opens once the free season's end is set."
- **Where:** Membership's card step, `flock.billing.onFile`
  - Before: new
  - After: "Card on file"
- **Where:** Membership's card step, `flock.billing.pastDue`
  - Before: new
  - After: "Your last payment didn't go through. Update your card to keep your membership."
- **Where:** Membership's card step, `flock.billing.renews`
  - Before: new
  - After: "Your membership renews automatically."
- **Where:** Membership's card step, `flock.billing.yearly`
  - Before: new
  - After: "Yearly: {{price}} a year"
- **Where:** Membership's card step, `flock.billing.zeroToday`
  - Before: new
  - After: "$0 today. Your first charge is on {{date}}."

### [#523](https://github.com/the-kya-project/perch-perfect-plan/pull/523) · D2.1 Seasonal and holiday Today cards on Home

Approved and merged by Brittany (Nov 23, 2026), and on for everyone since that day. English is her approved wording.

**New labels (English / Dutch):** Seasonal tip / Seizoenstip · Holiday helper / Feestdagenhulp · Got it / Begrepen · Through {{date}} / T/m {{date}} · Couldn't hide this card. Try again. / Deze kaart verbergen is niet gelukt. Probeer het opnieuw. (the last one is the error if saving "Got it" fails, added by this change).

- `seasonal.winterDrafts.body`
  - Before: Check the cage isn't near a drafty window, an outside door or a heating vent. A cover at night helps hold in warmth.
  - After: Check the cage isn't near a drafty window, an outside door, or a heating vent. A cover at night helps hold in warmth.
  - Dutch before: Zet de kooi niet bij een tochtig raam, een buitendeur of een verwarmingsrooster. Een kooideken 's nachts houdt de warmte vast.
  - Dutch after: Controleer of de kooi niet bij een tochtig raam, een buitendeur of een verwarmingsrooster staat. Een kooideken 's nachts houdt de warmte vast.
- `seasonal.springCleaning.body`
  - Before: Strong cleaners, sprays and fresh paint give off fumes. Move your bird to another room with fresh air while you clean, and choose bird-safe products.
  - After: Strong cleaners, sprays, and fresh paint give off fumes. Move your bird to another room with fresh air while you clean, and choose bird-safe products.
  - Dutch: unchanged (same meaning; Dutch doesn't use the Oxford comma)
- `seasonal.summerTravel.body`
  - Before: Going away? Share the care plan with your sitter before you leave, and put your avian vet's number where they'll see it.
  - After: Going away? Share the care plan with your pet sitter before you leave, and put your avian vet's number where they'll see it.
  - Dutch: unchanged (same meaning; Dutch doesn't use the Oxford comma)
- `seasonal.thanksgiving.body`
  - Before: Keep your bird well away from the kitchen: overheated non-stick pans and the oven's self-clean setting give off fumes that are dangerous to birds.
  - After: Keep your bird well away from the kitchen. Overheated non-stick pans and the oven's self-clean setting give off fumes that are dangerous to birds.
  - Dutch before: Houd je vogel ver uit de keuken: oververhitte pannen met antiaanbaklaag en de zelfreinigingsstand van de oven geven dampen af die gevaarlijk zijn voor vogels.
  - Dutch after: Houd je vogel ver uit de keuken. Oververhitte pannen met antiaanbaklaag en de zelfreinigingsstand van de oven geven dampen af die gevaarlijk zijn voor vogels.
- `seasonal.sinterklaas.body`
  - Before: Keep chocolate letters, pepernoten and other sweets out of your bird's reach, and pick up wrapping paper and ribbon.
  - After: Keep chocolate letters, pepernoten, and other sweets out of your bird's reach, and pick up wrapping paper and ribbon.
  - Dutch: unchanged (same meaning; Dutch doesn't use the Oxford comma)
- `seasonal.holidayDecorations.body`
  - Before: Tinsel, glass ornaments and string lights are tempting to chew. Keep them out of reach, and stay close whenever your bird is near the tree.
  - After: Tinsel, glass ornaments, and string lights are tempting to chew. Keep them out of reach, and stay close whenever your bird is near the tree.
  - Dutch: unchanged (same meaning; Dutch doesn't use the Oxford comma)
- `seasonal.holidayCandles.body`
  - Before: Keep lit candles, scented sprays and plug-in air fresheners out of the room your bird is in, and never leave a flame unattended.
  - After: Keep lit candles, scented sprays, and plug-in air fresheners out of the room your bird is in, and never leave a flame unattended.
  - Dutch: unchanged (same meaning; Dutch doesn't use the Oxford comma)
- `seasonal.holidayTravel.body`
  - Before: If you're traveling, share the care plan with your sitter before you go. If your bird is coming along, pack familiar food and toys.
  - After: If you're traveling, share the care plan with your pet sitter before you go. If your bird is coming along, pack familiar food and toys.
  - Dutch: unchanged (same meaning; Dutch doesn't use the Oxford comma)
- `seasonal.holidayMeals.body`
  - Before: Keep chocolate, avocado, alcohol and salty or fatty foods away from your bird, and ask guests not to share from their plates.
  - After: Keep chocolate, avocado, alcohol, and salty or fatty foods away from your bird, and ask guests not to share from their plates.
  - Dutch: unchanged (same meaning; Dutch doesn't use the Oxford comma)

### [#528](https://github.com/the-kya-project/perch-perfect-plan/pull/528) · 1.6 Curated chapter collections
All new, behind the Flock gate (admins only today). Where the mockup has wording, it's used as is.
- **Where:** Chapter → Resources (replaces the empty state)
  - Before: "No resources yet" / "Avian vets, rescues, and shops your chapter recommends will be collected here."
  - After: "Places members in your chapter recommend. These are community picks, not endorsements." Group headings "Avian vets", "Rescues", "Shops and services". Card links "Call", "Website". An empty group: "Know a good one nearby? Suggest it, and your chapter lead will add it." The button "Suggest a place". After sending: "Thanks! Your suggestion will show once your chapter lead has looked it over."
- **Where:** Chapter → Resources, for the chapter's lead and admins
  - Before: new
  - After: "{count} suggestions waiting" (one: "1 suggestion waiting"), "Manage listings"
- **Where:** Suggest a place sheet
  - Before: new
  - After: "Suggest a place"; kinds "Avian vet", "Rescue", "Shop or service"; fields "Name", "City or area", "Why do you recommend it?"; "Your chapter lead will look it over before it shows."; "Send suggestion". Errors: "You have a few suggestions waiting already. Try again once they've been looked at." / "We couldn't send that. Try again."
- **Where:** Managing listings (`/flock/places`)
  - Before: new
  - After: title "Resources", line "{chapter} · you lead this chapter" (a lead) or the chapter's name (an admin); "Chapter" (admins' chapter picker); the waiting card "{count} suggestions waiting" / "Review them before they show to members." / "Review"; "Updated {day}"; "None listed yet."; "Edit"; "Add a listing". Not a manager: "For chapter leads" / "Chapter leads and admins look after a chapter's listings. You can suggest a place from your chapter's Resources tab."
- **Where:** Add or edit a listing sheet
  - Before: new
  - After: "Add a listing" / "Edit listing"; fields "Name", "City or area", "Phone (optional)", "Website (optional)", "Why members recommend it"; "Use a web address, like example.com."; "Add listing" / "Save changes"; "Remove listing"; the confirm "Remove this listing?" / "{name} comes off your chapter's Resources for everyone."; error "We couldn't save that. Check the details and try again."
- **Where:** Review queue (`/admin/review`)
  - Before: new
  - After: chip "Places {count}"; item label "Place suggestion · {kind} · {chapter} chapter"; link "See the chapter's listings"
- **Where:** Screen reader labels
  - Before: new
  - After: "Call {name}, {phone}", "{name}'s website", "Kind of place", "Move {name} up", "Move {name} down"

### [#516](https://github.com/the-kya-project/perch-perfect-plan/pull/516) · D3 Seasonal calendar file
Approved and merged by Brittany (Nov 22, 2026). All 22 cards are new, as merged; nobody sees them until D2.1 shows the card on Home (it has, for everyone, since Nov 23, 2026). Source files: `src/locales/seasonal.en.jsonc` and `seasonal.nl.jsonc`.
- **Where:** Home's Today card, `winterDryAir`
  - Before: new
  - After: "Dry winter air" / "Heating dries out the air indoors. A regular shower or misting, and a humidifier in the room, help keep your bird comfortable."
  - Dutch: "Droge winterlucht" / "Door de verwarming wordt de lucht binnen droog. Een vaste douche- of sproeibeurt en een luchtbevochtiger in de kamer helpen je vogel zich prettig te voelen."
- **Where:** Home's Today card, `winterDrafts`
  - Before: new
  - After: "Keep out the cold" / "Check the cage isn't near a drafty window, an outside door or a heating vent. A cover at night helps hold in warmth."
  - Dutch: "Houd de kou buiten" / "Zet de kooi niet bij een tochtig raam, een buitendeur of een verwarmingsrooster. Een kooideken 's nachts houdt de warmte vast."
- **Where:** Home's Today card, `springCleaning`
  - Before: new
  - After: "Bird-safe spring cleaning" / "Strong cleaners, sprays and fresh paint give off fumes. Move your bird to another room with fresh air while you clean, and choose bird-safe products."
  - Dutch: "Vogelveilige voorjaarsschoonmaak" / "Sterke schoonmaakmiddelen, sprays en verse verf geven dampen af. Zet je vogel in een andere kamer met frisse lucht terwijl je schoonmaakt, en kies vogelveilige middelen."
- **Where:** Home's Today card, `springWindows`
  - Before: new
  - After: "Windows and doors" / "Warmer days mean open windows and doors. Put a screen in every open window, and know where your bird is before anyone opens a door."
  - Dutch: "Ramen en deuren" / "Warmere dagen betekenen open ramen en deuren. Zorg voor een hor in elk open raam, en weet waar je vogel is voordat iemand een deur opent."
- **Where:** Home's Today card, `summerHeat`
  - Before: new
  - After: "Summer heat" / "Keep the cage out of direct sun and away from hot windows. Change the water more often, and offer a cool shower on hot days."
  - Dutch: "Zomerhitte" / "Zet de kooi uit de volle zon en weg van warme ramen. Ververs het water vaker, en bied op warme dagen een koele douche aan."
- **Where:** Home's Today card, `autumnRoutine`
  - Before: new
  - After: "Shorter days" / "As the evenings draw in, keep bedtime and wake-up at the same time each day so your bird gets a steady night's sleep."
  - Dutch: "Kortere dagen" / "Nu het eerder donker wordt: houd bedtijd en opstaan elke dag op hetzelfde tijdstip, zodat je vogel een vaste nachtrust krijgt."
- **Where:** Home's Today card, `autumnHeating`
  - Before: new
  - After: "Heating season" / "The first run of the heating can give off dust and smells. Air the room before your bird is in it, and keep space heaters well away from the cage."
  - Dutch: "Het stookseizoen" / "Als de verwarming voor het eerst weer aangaat, kunnen er stof en geurtjes vrijkomen. Lucht de kamer voordat je vogel er is, en houd elektrische kacheltjes ver van de kooi."
- **Where:** Home's Today card, `valentines`
  - Before: new
  - After: "Flowers and chocolates" / "Keep bouquets and chocolates out of your bird's reach. Many cut flowers, and all chocolate, aren't safe for birds."
  - Dutch: "Bloemen en chocolade" / "Houd boeketten en chocolade buiten bereik van je vogel. Veel snijbloemen, en alle chocolade, zijn niet veilig voor vogels."
- **Where:** Home's Today card, `clocksForward`
  - Before: new
  - After: "The clocks go forward this weekend" / "Shift mealtimes and bedtime by a few minutes a day, so your bird's routine moves gently with the clocks."
  - Dutch: "De klok gaat dit weekend een uur vooruit" / "Verschuif eet- en bedtijd elke dag een paar minuten, zodat de routine van je vogel rustig meeschuift met de klok."
- **Where:** Home's Today card, `easter`
  - Before: new
  - After: "Easter treats" / "Keep chocolate eggs out of reach, and pick up foil wrappers and plastic basket grass, which birds love to chew."
  - Dutch: "Paaslekkers" / "Houd chocolade-eitjes buiten bereik, en ruim zilverpapiertjes en plastic paasgras op: daar kauwen vogels graag op."
- **Where:** Home's Today card, `kingsDay`
  - Before: new
  - After: "King's Day" / "Street parties and music can go on all day. Keep the windows near your bird closed, and give your bird a quiet spot to retreat to."
  - Dutch: "Koningsdag" / "Straatfeesten en muziek kunnen de hele dag doorgaan. Houd de ramen bij je vogel dicht, en geef je vogel een rustig plekje om zich terug te trekken."
- **Where:** Home's Today card, `summerTravel`
  - Before: new
  - After: "Summer trips" / "Going away? Share the care plan with your sitter before you leave, and put your avian vet's number where they'll see it."
  - Dutch: "Zomervakantie" / "Ga je weg? Deel het verzorgingsplan met je oppas voordat je vertrekt, en leg het nummer van je vogeldierenarts op een plek waar de oppas het ziet."
- **Where:** Home's Today card, `julyFourth`
  - Before: new
  - After: "Fourth of July fireworks" / "Fireworks can go on for days around the Fourth. Close the curtains, keep the windows shut, and leave some music on to soften the bangs."
  - Dutch: "Vuurwerk op 4 juli" / "Rond 4 juli kan er dagenlang vuurwerk zijn. Doe de gordijnen dicht, houd de ramen gesloten, en laat wat muziek aan om de knallen te dempen."
- **Where:** Home's Today card, `clocksBack`
  - Before: new
  - After: "The clocks go back this weekend" / "Shift mealtimes and bedtime by a few minutes a day, so your bird's routine moves gently with the clocks."
  - Dutch: "De klok gaat dit weekend een uur terug" / "Verschuif eet- en bedtijd elke dag een paar minuten, zodat de routine van je vogel rustig meeschuift met de klok."
- **Where:** Home's Today card, `halloween`
  - Before: new
  - After: "Halloween" / "With the doorbell ringing, keep your bird away from the front door. Use battery lights in pumpkins instead of candles."
  - Dutch: "Halloween" / "Gaat de deurbel steeds? Houd je vogel dan uit de buurt van de voordeur. Gebruik batterijlichtjes in pompoenen in plaats van kaarsjes."
- **Where:** Home's Today card, `thanksgiving`
  - Before: new
  - After: "Cooking for a crowd" / "Keep your bird well away from the kitchen: overheated non-stick pans and the oven's self-clean setting give off fumes that are dangerous to birds."
  - Dutch: "Koken voor veel gasten" / "Houd je vogel ver uit de keuken: oververhitte pannen met antiaanbaklaag en de zelfreinigingsstand van de oven geven dampen af die gevaarlijk zijn voor vogels."
- **Where:** Home's Today card, `sinterklaas`
  - Before: new
  - After: "Sinterklaas treats" / "Keep chocolate letters, pepernoten and other sweets out of your bird's reach, and pick up wrapping paper and ribbon."
  - Dutch: "Sinterklaaslekkers" / "Houd chocoladeletters, pepernoten en ander snoepgoed buiten bereik van je vogel, en ruim cadeaupapier en lint op."
- **Where:** Home's Today card, `holidayDecorations`
  - Before: new
  - After: "Decorating safely" / "Tinsel, glass ornaments and string lights are tempting to chew. Keep them out of reach, and stay close whenever your bird is near the tree."
  - Dutch: "Veilig versieren" / "Engelenhaar, glazen kerstballen en lichtsnoeren zijn verleidelijk om op te kauwen. Hang ze buiten bereik, en blijf erbij als je vogel bij de boom is."
- **Where:** Home's Today card, `holidayCandles`
  - Before: new
  - After: "Candles and scents" / "Keep lit candles, scented sprays and plug-in air fresheners out of the room your bird is in, and never leave a flame unattended."
  - Dutch: "Kaarsen en geurtjes" / "Houd brandende kaarsen, geursprays en geurstekkers uit de kamer waar je vogel is, en laat een vlam nooit onbeheerd."
- **Where:** Home's Today card, `holidayTravel`
  - Before: new
  - After: "Holiday travel" / "If you're traveling, share the care plan with your sitter before you go. If your bird is coming along, pack familiar food and toys."
  - Dutch: "Op reis tijdens de feestdagen" / "Ga je op reis? Deel het verzorgingsplan met je oppas voordat je vertrekt. Gaat je vogel mee, neem dan het vertrouwde voer en speelgoed mee."
- **Where:** Home's Today card, `holidayMeals`
  - Before: new
  - After: "Holiday meals" / "Keep chocolate, avocado, alcohol and salty or fatty foods away from your bird, and ask guests not to share from their plates."
  - Dutch: "Feestmaaltijden" / "Houd chocolade, avocado, alcohol en zout of vet eten weg van je vogel, en vraag gasten niets van hun bord te delen."
- **Where:** Home's Today card, `newYearFireworks`
  - Before: new
  - After: "New Year's fireworks" / "Fireworks can startle birds. Close the curtains, leave a soft light and some music on, and keep your bird in the quietest room."
  - Dutch: "Vuurwerk rond oud en nieuw" / "Vuurwerk kan vogels laten schrikken. Doe de gordijnen dicht, laat een zacht lampje en wat muziek aan, en zet je vogel in de rustigste kamer."

### [#508](https://github.com/the-kya-project/perch-perfect-plan/pull/508) · 0.5 Admin review for pending posts
No new strings: every line reuses existing wording, in new places (admins only).
- **Where:** Flock settings (You), a new row for reviewers
  - Before: new
  - After: "Review queue" / "Admin · {count} waiting"
- **Where:** Review queue, an item's label
  - Before: "Report · comment"
  - After: "Report · comment · Learn together" (the post's space, "{name} chapter", or "Journeys"; events add their chapter)
- **Where:** Review queue, a report's detail line
  - Before: "Reported by 2 members"
  - After: "Reported by 2 members · 1h"

---

## Decisions agents made

### [#567](https://github.com/the-kya-project/perch-perfect-plan/pull/567) · 1.20f Co-carers read comments on their bird's journeys
- **Decision:** "Household" means anyone with access to the bird (owner or co-carer, `has_bird_access`), the same group that already sees and posts on its journeys. Leaving the household ends it at once. Admins get nothing extra through this path.
- **Decision:** Comment photos are included (a co-carer sees a member's photo on a comment), because a photo is part of the comment. Commenters' profile photos aren't: a free co-carer sees their initials instead, since showing them would mean opening the private `flock-avatars` bucket's read rule to non-members. Say if you want the photos too.
- **Decision:** On the clip viewer a free co-carer sees "N comments" only when there's at least one comment. With none, there's no link, because the screen behind it would only say "No comments yet. Say something kind." to someone who can't comment.
- **Decision:** On the comments screen a free co-carer gets no ⋯ menu or press-and-hold menu on other people's comments, because everything in it (Reply, Report, Block) is for members. Members' menus on posts and journeys are unchanged.
- **Decision:** The comment count a co-carer sees follows the members' count rule as it is today (live comments, minus anyone blocked either way). That count can include a comment moderation has hidden, which the list then leaves out. This is the same for members and wasn't changed here.

### [#566](https://github.com/the-kya-project/perch-perfect-plan/pull/566) · Badge art (final art for 1.13a, stored for 1.13b)
- **Decision:** Your art replaces the whole round tile, not just the icon inside it. The lime circle and forest ring were dropped, since each design has its own frame. Earned badges show your color file; unearned ones show your gray file. Nothing is cropped, recolored or redrawn.
- **Decision:** Journey finisher shows the design for the level reached (1, 3 or 10). An unearned Journey finisher shows the gray level-1 design. Your gray versions of levels 3 and 10 (and of Steady scale 12/52 and Daily check-in 30) are stored but nothing shows them yet.
- **Decision:** Two sizes, resized from your 512px files: 192px for the circles (sharp at 3x on a phone) and 64px for the pills. Stored in `public/badges/<flock|care>/<earned|unearned>/`. They aren't added to the app's offline download, so free users' installs don't grow.
- **Decision:** The pill icon grew from 14px to 20px so the art can be read; the pill's height stays about the same (its top and bottom padding shrank by a pixel). The "Badge earned" card keeps its 52px badge.
- **Decision:** Each image's screen-reader text is the badge's name ("Journey finisher"), as you asked. On the Badges screen and in the celebrations the name is also written under the art, so a screen reader says it twice there.
- **Decision:** Your README suggests 72px on a collection screen. The Badges screen stays at 64px, as you asked in the prompt.
- **To change it:** file names and levels are `src/lib/badgeArt.ts`; how the art is drawn is `BadgeCircle` in `src/components/flock/BadgeParts.tsx`.

### [#563](https://github.com/the-kya-project/perch-perfect-plan/pull/563) · 1.15a Kya's Crew on the payment screen
- **Brittany's decision (Nov 26, 2026):** the screens and wording are approved as written in "Copy that merged", including the lines marked "not in the mockup".
- **Brittany's decision (Nov 26, 2026):** founders whose founding price is still open keep their current screen, with no Crew option, for now.
- **Decision:** Crew shows only when both Crew prices (`STRIPE_PRICE_CREW_MONTHLY` and `_YEARLY`) are set in the deployment. Without them the card step is exactly what it was, including "Pick how you pay".
- **Decision:** Yearly (the Flock's) stays picked by default, as in the mockup's default.
- **Decision:** "Save $96" is worked out from the Stripe prices (twelve Crew months minus Crew yearly) and is left off if Crew yearly saves nothing. Crew yearly's big number is $444 ÷ 12, rounded to $37, as in the mockup.
- **Decision:** The card step after the free season gets the same Crew box (it uses the same tiles), with "Join Kya's Crew" on the button. No mockup shows that screen with Crew.
- **Decision:** Founders whose founding price is still open see their founding screen unchanged, with no Crew option, because no mockup shows Crew there. Checkout already gives a founder who picks Crew the Crew plan and leaves their claim alone. (Brittany confirmed this on Nov 26, 2026, above.)
- **Decision:** With Crew picked, the "How it works" charge line uses the existing app sentence ("…then monthly." / "…then once a year."), not the mockup's "then every month", so Flock and Crew read the same.
- **Decision:** Membership, "You're all set" and the plan row name the Crew plan ("Kya's Crew", "Crew yearly", "Crew monthly") and say 25%. Before this, a Crew member would have seen "Flock member", "Monthly" and "20%". These screens have no Crew mockup.

### [#562](https://github.com/the-kya-project/perch-perfect-plan/pull/562) · 1.20e Journeys redesign: tests and docs
- **Analytics events for the new design.** The spec says "update the Flock analytics events" without naming them. Chosen: `flock_journey_started` drops `milestone_count` and `already_count` and adds `from_member_skill` ("Start this skill"); a new `flock_journey_update_posted` with `big_moment` and `is_question`; `flock_journey_finished` now fires on both endings with `how` (`learned` or `happy_where_we_are`; it used to fire only when the last milestone finished a journey); `flock_journey_milestone_reached` is retired. No content is sent. Only admins send Flock events today. If the PostHog "Flock stickiness" dashboard uses the milestone event, that tile will go quiet.
- **One new check file** (`journeys_redesign_checks.sql`) for the three promises in the spec, instead of spreading them across the five existing files, so the guarantees read in one place. The five named files were already updated part by part (1.20a–d); this PR only refreshes their out-of-date comments.
- **The e2e skill fixture** keeps each skill's old milestones under `history_milestones` (only journeys started before the redesign use them, like the 2 in production), and a unit test fails if the fixture's text drifts from the 1.20a migration.
- **Noticed, not changed:** a free household member on someone's bird sees and posts on that bird's journeys but can't read the comments on them ("flock members only"), because comments are a Flock feature. That matches the rules as written. Say if co-carers should read them.
- **Brittany's decision (Nov 26, 2026):** free household co-carers should be able to read, but not write, comments on their own bird's journeys. Added to `docs/BACKLOG.md` as 1.20f.

### [#560](https://github.com/the-kya-project/perch-perfect-plan/pull/560) · 1.20d Diet conversion rework
- **Brittany's decision (Nov 25, 2026):** if a member logs no weigh-ins in the first week, the starting week stays unset, as it does today. No change.
- **Brittany's decision (Nov 25, 2026):** remove "For Flock members, this uses the bird's own baseline alerts." from the weight safeguard (done in the PR's migration, the e2e fixture and `journeys_flock_wording_checks.sql`). Keep "The template suggests a vet check before starting, especially for older birds or birds on an all-seed diet." as is.
- **Brittany's decision (Nov 25, 2026):** merge once every required check passes. The eclectus alert stays off (`diet_eclectus_alert`) until an avian vet approves it.
- **Decision:** The starting week is always the 7 days after the journey starts. The old "already" answer on milestone 1 (the week *before* the start) and reaching milestone 1 early no longer move it. Production has no Diet conversion journey (checked read-only), so no real journey changes. The 7 days is in `DIET_STARTING_WEEK_DAYS` (draft) rather than a new `journey_settings` column, because the item said to leave every setting unchanged.
- **Decision:** "Set" means the week is over and had at least one weigh-in at the bird's usual time, or a vet-confirmed resume re-based it. A week with no weigh-ins leaves the starting weight unset, exactly as before: no weight rules apply, the card keeps saying "Weigh [Bird] every day this first week…", and "Weigh [Bird] today" keeps showing. It doesn't start a fresh week. (Brittany answered on Nov 25, 2026, above: no change.)
- **Decision:** The vet reminder card shows once the starting weight is set. Before this, new journeys had no milestones, so the reminder ("from milestone 2") could never show at all.
- **Decision:** The eclectus alert is on the vet card's screen, directly above the card, not on a screen of its own. That way it needs no new "Continue" button or copy. It shows for any species name containing "eclectus" (`ECLECTUS_PATTERN`, draft). It sits behind a new health switch, `diet_eclectus_alert`, which starts off. The app asks for that switch only on Diet conversion for an eclectus.
- **Decision:** Two other safeguard lines are still out of date, and I left them alone for your call (Brittany answered on Nov 25, 2026, above: remove the first, keep the second): "For Flock members, this uses the bird's own baseline alerts." (the weight safeguard is the same for everyone, and doesn't use the weight baseline), and "The template suggests a vet check before starting…" (that's the vet card now).
- **Decision:** CLAUDE.md's diet lines were brought in step (starting week, reminder, eclectus switch, the finish). The full Journeys rewrite is still 1.20e's.

### [#559](https://github.com/the-kya-project/perch-perfect-plan/pull/559) · 1.20c Member skills
- **Decision:** A member skill is a custom journey shared with the community that has at least one update the reviewers haven't hidden (`private.journey_is_member_skill`). It's findable through `journey_viewable`, so blocks, a lapsed membership and "Just me" leave it out, and your own bird's journeys never show in your own search.
- **Decision:** "Member-supplied journey" shows on every custom journey seen from outside its bird's household: the journey page (with the line, at the top), Journeys tab cards, Today's big-moment and "learned it" cards, the "Skills from the Flock" list and the member skill's setup. Today's followed rings are too small for it and don't have it. Your own copy of someone's skill isn't labeled for you.
- **Decision:** The line reads "A member shared this skill. It hasn't been reviewed by The Kya Project." It's on the journey page, at the top of "Skills from the Flock" and on the member skill's setup. Cards carry only the label.
- **Decision:** "Skills from the Flock" is a button under "Your own skill" on Pick a skill (members only). It opens a list with a search box, newest activity first, up to 30. Tapping one opens the setup screen (`?from=<journey>`): the note, the skill's description and the three safety lines every skill shares, "See [bird]'s journey", "Report this skill", then how often and who sees it, and "Start this skill". It asks which bird only when the member has more than one and came from the journey page.
- **Decision:** "Start this skill" copies the name and description into a new journey of your own (through `journey_start`, so the usual rules apply) and records where it came from. Starting it again for the same bird, while the first copy is going, opens that copy. The copy keeps its own text when the source changes, disappears or is blocked; "Started from [bird]'s journey" shows only while you can still see the source.
- **Decision:** Reports on a member skill use subject type `journey` (the skill's name and description) in `flock_reports`, `flock_moderation` and `flock_notifications`. `flock_report`, `flock_resolve_report`, `flock_subject_visible`, `flock_subject_owner`, the review queue ("Report · member skill") and the notifications list were patched from their live definitions to know it. Only custom community journeys can be reported this way; template journeys can't. At the report threshold, or once removed, the whole journey leaves the community (`journey_viewable`) and stays for its household, the same rule reported posts follow. Removed member skills are kept, not purged after 180 days, the same as removed journey updates.
- **Decision:** "Your own skill": a name (60) and an optional description (500, with a counter), no steps. When the name matches one of the 14 (ignoring case, spaces and punctuation, or the slug, e.g. "step-up"), it suggests "Start [skill] instead", which opens that skill's setup. It doesn't block starting your own.
- **Decision:** Starting a member skill is counted as `flock_journey_started` with `template: "custom"`, like any custom journey. No new analytics keys; 1.20e updates the events.
- **Decision:** The CLAUDE.md Journeys section isn't rewritten here; 1.20e does it with the rest of the docs.

### [#554](https://github.com/the-kya-project/perch-perfect-plan/pull/554) · 1.20b Journeys redesign: screens
- **Decision:** "[Bird] learned it!" asks once before finishing (a small sheet: "Finish the journey" / "Not yet"), because finishing can't be undone from the app. "We're happy where we are" stays in the journey's menu, now through `journey_finish`.
- **Decision:** Today's "learned it" cards have no reactions or comments: a finish has no update to hang them on. They open the journey. Big-moment cards react and comment on the update itself (`journey_update`), like the story viewer.
- **Decision:** Today's journey cards and rings still come only from journeys you follow, as the milestone cards did.
- **Decision:** "Ask the Flock" shows only when the caption has a "?" (that's what makes it a question). On a private journey a member's "Ask the Flock" opens the existing "Who sees it?" sheet to share the journey; it doesn't share on its own.
- **Decision:** The "This was a big moment" switch sits under the caption; after a big moment the post sheet offers "Make a share card" (the 1.7 card, now made from that update: `?kind=moment&u=`).
- **Decision:** Setup no longer asks for a day-one clip (the spec: setup asks only which bird, how often and who sees it). Day one vs. now compares the first clip posted with the latest, as it already did when there was no day-one clip.
- **Decision:** The bird is picked before the skill (as before), so setup shows "for [Bird]" instead of asking again.
- **Decision:** The Journeys tab keeps its four chips (For you, Following, Tricks, Basics) inside "From the Flock". "Basics" still means the seven skills stored as free; worth renaming or dropping in 1.20e.
- **Decision:** Free accounts never call the community reads on a skill page (no tips, no other journeys): "How others did it" is one row that opens the sheet.
- **Decision:** "Your own skill" keeps today's name-and-steps screen for now (the database ignores the steps since 1.20a). 1.20c replaces it with a name and description. "Skills from the Flock" and member skills in "From the Flock" are 1.20c too.
- **Decision:** Diet conversion's screens are left as they are for 1.20d, apart from what every journey lost: the "How to make it work" list (its tips are empty since 1.20a) and the step bar. Its weight card, vet card and reminder, weigh-in reminder, pause banner and disclaimer are unchanged; the vet reminder still reads milestone 2 until 1.20d. A weight pause hides "is on the new diet".
- **Decision:** A bird that has passed: its journeys open read-only (no posting, no finishing, no menu).
- **Decision:** The milestone celebration screen (`/flock/journeys/<id>/milestone/<n>`) is gone. Old milestone comment links still open (`/flock/comments/journey_milestone/…`).
- **Decision:** A skill's video plays through a new server function (`getSkillVideo`) that reads the template as the member and signs the Cloudflare clip for an hour; there are no videos yet, so nothing shows.
- **Decision:** The vet nudge's phrases reach free accounts through a new `journey_vet_sign_tiers()` (journeys only); `flock_vet_sign_tiers()` stays Flock-only. Journey updates have no "vet nudged" column, so posting anyway isn't recorded.
- **Decision:** Journey challenges: finishing already meant "the journey ended as learned it by the end day" (`flock_challenge_done`), so only the progress counts changed (`flock_challenge_rows` returns 0 milestones for a journey challenge, patched from its live definition).
- **Decision:** Buddy pods (#548, merged during this run) still count milestones for a pod member's progress ("N of M") and as one way to count someone active. Their "Pair me with buddies" box stays on the new setup screen as it was, and the pod card stays at the top of the journey page. New journeys have no milestones, so pods would show no step progress; that isn't changed here (for 1.20e, or a pods follow-up).

### 1.15a Kya's Crew option on the payment screen · Brittany's decision, Nov 25, 2026
- **Decided:** with the mockup approved, 1.15a moves from "Needs Brittany before work starts" to "Ready to build" (after 1.20 in the list). It's still built to a held PR for her, because it's payments.

### 1.15a Kya's Crew option on the payment screen · Brittany's decisions, Nov 24, 2026
- **Approved:** the "Kya's Crew payment option" mockup from Nov 23, 2026: the card step with Kya's Crew and its benefits next to Monthly and Yearly, and the Crew yearly selected state. Saved as `docs/flock/mockups/billing/CrewCardStep.dc.html` and `CrewCardStepYearlySelected.dc.html`. 1.15a is now "Overnight alone: yes (built to a held PR)".
- **Decided (Brittany, Nov 24, 2026):** the mockup's two rescue-adopter lines ("You sponsor six free months in the Flock for a family who just adopted a rescue parrot" and "Six free months in the Flock for a new rescue adopter, from you") both become "Crew memberships help support free Flock access for rescue adopters", matching #551's legal draft. The saved mockup already shows it.

### [#548](https://github.com/the-kya-project/perch-perfect-plan/pull/548) · 1.11 Buddy pods
- **Decision:** A pod's posts are Flock posts in a new `pod` space (`flock_posts.pod_id`), so reactions, comments, replies, reports, review, blocks, photos, deletion and the 180-day hold all work as they do for posts. They show only in the pod, never on Today. This needs small changes to two existing Flock functions (post visibility and Today's feed) and the posts table's space check.
- **Decision:** Placement: a new waiter first joins an open pod on the same journey with room (under 6), their own chapter's pod first. Otherwise a new pod forms as soon as 3 compatible people are waiting: from the member's chapter when 3 there are waiting, else from everyone waiting (chapter first, then oldest). So pods start at 3 and fill toward 6. The spec doesn't say whether latecomers join an existing pod or wait for a new one.
- **Decision:** "Same journey" means the same journey template. Custom journeys ("Write your own") don't offer buddies.
- **Decision:** The 2-pod limit counts open pods and waitlist places. At the limit, the setup screen's box is grayed out with "You're in two buddy pods already, the most at once."
- **Decision:** A "Just me" journey can still join a pod. Buddies see the member's name and photo, and that they're on the journey, but no progress ("Progress kept private"). When Just me is picked with the box ticked, the setup screen says so. A bird's name shows only when the bird is shown in the Community (or to its household).
- **Decision:** Blocked members are left out of a pod's member list and count for each other, and blocks stop both automatic placement and an admin's Move.
- **Decision:** The 3-week rule: "active" means still in the pod and, in the last 21 days, joined, posted or commented in the pod, or (journey pods) posted a journey update or reached a milestone. A pod at least 3 weeks old with fewer than 2 active members is dissolved by the hourly job. Unfinished members of a journey pod see "Your buddy pod has closed" with "Find new buddies" on their journey page.
- **Decision:** "Finished" means the journey's status is Finished. "Happy where we are" counts as still on the journey, so it doesn't close the pod on its own; the 3-week rule covers a pod that goes quiet.
- **Decision:** The weekly card shows on the pod page until you post in the pod that week (Monday to Sunday, Eastern time). There's no Today card or notification for it.
- **Decision:** Ended pods (closed or dissolved) stay readable to the members who were in them but take no new posts.
- **Decision:** Admins move a member only to another open pod on the same journey, with room. Dissolving asks first. Admins don't read pod posts from the admin screen; reports reach the review queue as usual.
- **Decision:** Where pods are reached: a card at the top of your own journey (waiting, "Your buddy pod", or the new-pod offer), and a "Buddy pods" row in Flock settings listing your pods and waits. Admins get "Manage pods" on that list. The Privacy screen gains a line for pods.
- **Decision:** No analytics events for pods; the spec doesn't ask for any.
- **Brittany (Nov 24, 2026):** readings approved, except 'happy where we are' now counts as finished; no 'Keep going together?' or buddy groups, a pod just closes when everyone has finished or left; progress bar dropped for a status label; activity counts finishing instead of a milestone. Built in [#557](https://github.com/the-kya-project/perch-perfect-plan/pull/557).
- **Decision (#557):** `flock_pods.kind` stays as a column that only takes `journey`, rather than being dropped, so `flock_my_pods` and `admin_pods` keep their shape. A pod that was asking or running as a group when the migration runs is closed (a former group becomes an ended journey pod its members can still read).
- **Decision (#557):** "Working on it" pill uses the app's pale green (`K.paleGreen`); "Happy where we are" uses the pale amber (`K.amberBg`), the closest pale sunflower in the palette, both with forest text.
- **To change it:** the rules are in `20261124235900_flock_pods_no_groups.sql` (replacing those in `20261124070000_flock_buddy_pods.sql`) (placement `private.flock_pod_place`, the job `private.flock_pods_tick`); the words are in `src/components/flock/PodParts.tsx`.

### [#552](https://github.com/the-kya-project/perch-perfect-plan/pull/552) · 1.20a Journeys redesign: data and migration
- **Approved (Brittany, Nov 24, 2026):** she asked for #552 to be brought up to date and merged, which approves the migration. The template text's copy read stays open under "Copy that merged".
- **Decision:** "All 14 startable by everyone" is done in `journey_start` (it no longer checks the stored tier), not by changing any row. `journey_templates.tier` keeps its seven 'premium' values and `journey_limits` is unchanged, so `journey_my_access` still says `can_use_premium` is false for free accounts until 1.20b removes the locks from the screens.
- **Decision:** `journey_start` and `journey_post_update` keep their old arguments so today's screens keep working until 1.20b: `p_custom_milestones` and `p_already` are accepted and ignored, and the new `p_custom_description` (journey_start) and `p_big_moment` (post update) come last with defaults. The old signatures were dropped and recreated with the new argument, so there's one of each.
- **Decision:** `journey_reach_milestone` is kept but never finishes a journey any more ("replace … the milestone-based finish"). It only marks a milestone on journeys that still have milestone rows (the two production journeys). Dropping it is left for 1.20b/1.20e, once no screen calls it.
- **Decision:** `journey_finish(journey, 'learned' | 'happy_where_we_are')`: "learned" works from active or a pause the member chose; a weight pause refuses it ("confirm you've called your avian vet first", as resuming does). "We're happy where we are" works from active or any pause, as `journey_set_status` already allowed, and clears the pause. Both refuse a finished journey and a bird that has passed. Diet conversion's "learned" adds no known skill (spec "Screens" 6).
- **Decision:** The source journey column only takes a custom journey (a check), and clears when the source is deleted. Nothing fills it yet: "Start this skill" is 1.20c, so `journey_start` doesn't take a source in this part. A description is only for your own skill (refused on a template journey), up to 500 characters.
- **Decision:** Template text is rewritten only on templates still marked draft, so anything you've approved since is left as it is. Wing touch's safety paragraph is split into three lines, one per sentence, like nail trims'. `safeguards` (diet conversion's "Safeguards built into this journey"), `done_when`, `suggested_first` and `typical_length` are left in place, unused; diet conversion's safeguards still mention "every step", for 1.20d to settle.
- **Decision:** Diet conversion's second safety line uses the spec's words ("Some birds refuse new food so firmly…"); the stored tip said "Some birds will refuse…".
- **Decision:** The skill video is `journey_templates.video_ref`, a "cfstream:<uid>" reference like journey clips, set with `admin_update_journey_template('recall', '{"video_ref": "cfstream:…"}')`. Signing it for viewers comes with the skill page in 1.20b.
- **Decision:** CLAUDE.md's Journeys section isn't rewritten here; 1.20e does that when the build lands.
- **Decision:** Challenges (#547, merged during this run) count a journey challenge's progress from milestone rows. This PR doesn't change that, so a journey started after it merges shows no milestone progress in a challenge until 1.20b follows your note (finished = the journey ends with "learned it" before the end date). `journey_finish(…, 'learned')` sets status `finished`, which is what that rule reads.

### [#543](https://github.com/the-kya-project/perch-perfect-plan/pull/543) · 1.17 Promo codes · Brittany's decisions, Nov 24, 2026
- **Approved:** the worked examples match what she meant, and the webhook may remove discounts from founding memberships. Merged switched off once every required check passed.
- **Before billing opens:** two test checkouts during a test free season (one "20% off for 3 months" code, one "once" code) to see whether Stripe counts the months from the card being added or from the first charge. In the "Before billing opens" checklist in `docs/BACKLOG.md`.
- **Decision (merging `main`):** the code field stays on the subscription Checkout only. The save-the-card Checkout from #533 (the free season's last 49 hours) can't take a code, because Stripe allows none in setup mode, and the subscription the webhook starts from it has no discount. Crew plans get the field and the founding price doesn't; `npm run test:billing` pins both.

### [#533](https://github.com/the-kya-project/perch-perfect-plan/pull/533) · 1.14a Card step and checkout design · Brittany's decisions, Nov 24, 2026
- **Approved:** the screens and the Dutch. Merged switched off (`BILLING_ENABLED` off), the same way #525 did, once every required check passed.
- **Before billing opens:** the founder release job, the test-mode Customer Portal setup, two test checkouts (one normal, one in the free season's last 49 hours) and a native speaker's read of the Dutch are a checklist in `docs/BACKLOG.md` ("Before billing opens").
- **Decision (merging `main`):** the checkout now accepts #535's Crew choices (`CHECKOUT_CHOICES`) along with the locale, and keeps #533's branded Checkout and notes. The card step still offers only the Flock plans (Crew on it is 1.15a).
- **Decision:** the save-the-card note now says "a year" for `crew_annual` as well as `annual`. Before, a yearly Crew plan would have read "a month". No wording changed.

### [#547](https://github.com/the-kya-project/perch-perfect-plan/pull/547) · 1.10 Challenges · Brittany's decisions, Nov 24, 2026
- **Screens and copy:** the screens the mockup didn't show (joining, "You finished!", a closed challenge with its wrap-up, the admin list and the admin screen for a started challenge) are approved as built, and the copy is approved as written.
- **Clips:** no short clips for now. Entries stay a few sentences plus up to four photos. Clip entries later are backlog item 1.10a (under "Later").
- **Text required:** an entry still needs a few words even when it has a photo.
- **Journey challenges:** they stay. When the journeys redesign (1.20b) lands, they move to the new design with no milestone progress, and a journey challenge counts as finished when its journey ends with "learned it" before the end date. Noted in `docs/BACKLOG.md` under 1.20b.
- **Migration and merge:** migration approved; merged once every required check passed on the latest commit.

### [#547](https://github.com/the-kya-project/perch-perfect-plan/pull/547) · 1.10 Challenges
- **Decision:** Entries are Flock posts in a new `challenge` space, tied to their challenge. That way reactions, comments, reports, review, blocks, photos, deletion and the 180-day hold all work exactly as they do for posts. Entries show only in their challenge's feed, never in Today's.
- **Decision:** Start and end are days in Eastern time (the Flock's day, like Today's idea), and both days count. A challenge opens at the start of its first day and closes after its last. Members don't see a scheduled challenge until it starts, and "Move back to draft" works only before then.
- **Decision:** "One active challenge at a time Flock-wide, plus at most one per chapter": scheduling refuses a challenge whose days overlap another scheduled one for the same group. A Flock-wide and a chapter challenge can overlap. Once a challenge has started, it can't be edited, unscheduled or deleted, so members' progress never changes under them.
- **Decision:** Diet conversion, and every template in the food category, can't be a challenge's journey. The admin form doesn't list them, and the database refuses them.
- **Decision:** A journey challenge doesn't start the journey by itself. Joining picks the bird; if that bird has no journey on the template yet, the member goes to the usual journey setup (clip, rhythm, who sees it). Progress is that journey's milestones. It counts as finished when that journey finishes between joining and the end day. A journey that's already underway counts.
- **Decision:** Standalone progress is one entry per prompt, in any order. "Post today's entry" always offers the first prompt not done yet, matching the mockup's checklist. Deleting an entry un-ticks its prompt, but a Challenge champ badge already earned stays.
- **Decision:** Permission to feature is a switch, off by default, asked when joining and changeable later on the challenge page. Turning it off takes the member's entries out of the pin and the wrap-up at once. A pinned entry also needs that permission, since pinning features it.
- **Decision:** On a profile, Challenge champ shows only when it was earned in a way others may see. A journey challenge counts there only if its journey is shared with the community, as with Journey finisher and Trick star. Without that cap, a challenge badge earned only through a "Just me" journey would show on the profile.
- **Decision:** Joined members show as up to four faces (name and photo only, blocked people left out) plus a count, as in the mockup. Nobody is ranked or listed by progress.
- **Decision:** The admin list is linked from "Manage challenges" on the Journeys tab (admins only), and from "Manage this challenge" on a challenge page. Votes use the same pattern on Do good.
- **Decision:** No analytics events for challenges. The spec doesn't ask for any, and adding them means changing the shared event list.
- **To change it:** the rules are in `20261124033000_flock_challenges.sql` (`private.flock_challenge_*`); the words are in `src/components/flock/ChallengeParts.tsx` and the two `flock.challenges.$challengeId` routes; the admin form is `src/routes/_authenticated/admin.challenges.$challengeId.tsx`.

### [#549](https://github.com/the-kya-project/perch-perfect-plan/pull/549) · D1.2 Weight baseline on the weight page, in shadow mode
- **Decision:** The top tier is now called `shifted` everywhere in code, the shadow log and the replay report (it was `call_vet_today`), so "Call your vet today" isn't used as a label anywhere, as you decided. The replay report's line now reads "Weight has shifted (top level)".
- **Decision:** While a bird is still learning, only the hard alert (the fixed 10%, against the month before) and the sudden drop can fire. That's how I read "while a bird is still learning, the fixed draft values apply". The fixed 2.5% / 5% / 10% stay in the rules file for that reading. Once learned, the hard alert uses the same personal level as the top tier.
- **Decision:** Each level is worked out from the wobble rounded to two decimals (e.g. 1.48% → 2.96%), so every shadow-log row's levels follow exactly from its own `wobble_pct`.
- **Decision:** "A re-weigh counts within 10 days" also moves the hard alert's comparison window while still learning. It now uses the weigh-ins from 30 to 10 days before, where it was 30 to 3. A bird with under 10 days of history gets no hard alert yet, but the sudden drop still covers it.
- **Decision:** The sudden drop is confirmed when the weigh-in before was low against its own comparison (the median of up to 3 earlier ones from the 7 days before it), it was within 3 days, and the new one is low against that same comparison. So the comparison is always from before the drop started. It's reported "about X% lighter than a few days ago" against that comparison.
- **Decision:** The shadow log runs hourly (`weight-baseline-shadow-hourly`, at :47, production only, like the other hooks). It reads saved weigh-ins rather than hooking into each save, so it covers every way a weight is logged (the weight page, the daily check, a sitter's check, the care plan) and can't slow down or block one. It picks up weigh-ins logged in the last 14 days that it hasn't logged yet. Each row is what the baseline said as of that weigh-in's own time. An edited weigh-in keeps its first row. A deleted weigh-in's row stays. Deleting the bird removes them all. `rules_version` is a fingerprint of the rule values, so rows from before and after a change can be told apart.
- **Decision:** The ideal weight range is its own table (`bird_ideal_weights`), not new columns on `birds`, so the care plan and the sitter page never load it. The owner reads and writes it, and the household can read it (their weight page applies the same quieting). Its field sits on the weight page, owner only, behind the same switch, as "Ideal weight range (optional)" with a From / To pair. It's not in the care plan's Health step, so it can't be mistaken for the "Healthy range" sitters see. There's no mockup for it.
- **Decision:** The weight page shows at most one alert card, most serious first: a confirmed sudden drop, weight has shifted, the hard alert, a sudden drop's "weigh again", a tier's "weigh again", keep an eye on this, then worth watching. The card sits above the chart, with the usual range below it. The celebration shows once per bird per device (remembered in the browser).
- **Decision:** No Dutch for the new lines yet. Dutch readers see the English. Health wording waits for the vet review anyway.
- **Draft wording (all new, draft, pending vet review; your three lines are used word for word):**
  - "Weight dropped quickly" / "A second weigh-in shows the same change: [Bird] is about [X]% lighter than a few days ago. This is a big change in a short time. Remember, birds are excellent at hiding illness. Take note of how [Bird] is eating and acting today." (yours)
  - "Weight has shifted" / "We've noticed [Bird]'s weight has shifted. [Bird] is about [X]% below usual. Have you noticed any changes in eating or energy? It can help to notice whether [Bird] is eating less, quieter than usual, or fluffed up." (yours)
  - Hard alert while still learning, same title: "We've noticed [Bird]'s weight has shifted. [Bird] is about [X]% below the last few weeks. Have you noticed …" (yours, with "below the last few weeks", since there's no "usual" yet)
  - "Weigh again" / "[Bird]'s weight is about [X]% lower than the last few days. Weigh [Bird] again to check the reading." (yours)
  - "Weigh again" / "This weigh-in is lower than usual for [Bird]. Weigh [Bird] again to check the reading."
  - "Keep an eye on this" / "[Bird] has been about [X]% below usual for a while. Take note of how [Bird] is eating and acting over the next few days."
  - "Worth watching" / "[Bird] is about [X]% below usual. Keep weighing as you normally do."
  - "We've learned [Bird]'s usual weight" / "Thanks for weighing [Bird] so regularly. From now on, each weigh-in is compared with what's usual for [Bird]." / "Got it"
  - "Usual weight" / "[Bird] usually weighs [low]–[high] g." (also "Before a meal, …" and "After a meal, …")
  - "Still learning" / "We're still learning [Bird]'s usual weight: [n] of 7 weigh-ins so far, over at least 14 days." (also before / after a meal)
  - "Ideal weight range (optional)" / "Private to you. It isn't shown to sitters or anywhere else." / "From (g)" / "To (g)" / "Save" / "Remove" / "Cancel" / "Add" / "Saved." / "Removed." / "Couldn't save the range." / "Enter two weights between 1 and 5000 grams, the lower one first."
- **To change it:** values in `WEIGHT_BASELINE_RULES` (`src/lib/healthRules.ts`); wording under `weightBaseline.` in `src/locales/en.jsonc`; the card order in `baselineCard` (`src/lib/weightBaseline.ts`).

### D1.2 Weight baseline shadow mode · Brittany's decisions after the replay, Nov 23, 2026
- **Decision (Brittany's):** She read the D1.1 replay. The shadow log covers every bird, the typed normal weight never replaces the learned one, and alerts use each bird's own range with limits. A separate sudden-drop alert (10%, or 7% under 100 g) always applies. Owners can enter an optional ideal weight range, which quietly decides whether the two lower alerts show and is never presented as a goal. Weight alerts stay observational and never tell an owner to go to or call the vet. The full rules and draft lines are under D1.2 in `docs/BACKLOG.md`.
- **Why:** a fixed percent treats birds with very different natural swings alike, the draft timing missed sustained drops in owners who weigh every few days, a learned "usual" can be heavier than a bird's healthiest weight, and a big overnight loss from a high weight wouldn't have alerted at all. Kya & Co. is a health app, so the ideal weight informs alerts without turning into a weight-loss or weight-gain goal.
- **For the vet review:** the personal-range multiples and limits, the 3.5% "Worth watching" ceiling, the sudden-drop levels with the 100 g cutoff and 7-day comparison, which alerts the ideal range may quiet, and whether observational wording is enough for a confirmed sudden loss.
- **To change it:** the D1.2 entry in `docs/BACKLOG.md` before it's built, then `WEIGHT_BASELINE_RULES` in `src/lib/healthRules.ts`.

### [#546](https://github.com/the-kya-project/perch-perfect-plan/pull/546) · 1.13a Badges: the Flock set
- **Decision:** Badges are worked out when a member opens Today, Flock settings or the Badges screen (`flock_my_badges`), not by triggers on every table. So "the moment it's earned" means the next time they open the Flock, usually seconds later. It keeps the badge rules in one function and leaves the posts, journeys, votes and places code untouched.
- **Decision:** "Past activity counts": the first time a member's badges are worked out, everything their history earned is recorded together, and Today shows one "Here's what you've already earned" when that's two or more. With just one (a newcomer who's just finished their profile), it's the small "Badge earned" card instead, since "already earned" would read oddly.
- **Decision:** The launch celebration is a centered card over Today (a dialog), as the mockup shows it filling the screen. Each later badge is its own "Badge earned" card at the top of Today, styled like the mockup's care-app card (screen 3), with "See all badges" and "Got it". Opening the Badges screen counts as seeing them all.
- **Decision:** The Badges screen shows only the Flock set for now ("x of 6 earned"); the mockup's "Care badges" section arrives with 1.13b. Founder and Chapter lead stay as they were and aren't counted in the six. The how-to-earn line shows for the badge tapped; it starts on the first one not earned yet, as the mockup shows Trick star.
- **Decision:** On a profile, badges are small lime pills with the icon and name (and Journey finisher's level), next to the existing Founder and Chapter lead pills. The mockup doesn't show a profile.
- **Decision:** "Members can hide badges from their Flock profile in settings": a "Show my badges on my profile." switch on Edit profile, on by default, below the founding members switch and built the same way. Hidden means hidden from everyone, your own profile view included; your Badges screen always shows them.
- **Decision:** "A badge earned only through 'Just me' journeys ... never to anyone outside their household": a profile counts only community journeys for Journey finisher and Trick star, worked out fresh each time, so the level shown can be lower than your own (3 finished, 1 shared: "1 journey"). It's stricter than the spec, which would let the bird's co-carers see it: a profile shows the same thing to everyone.
- **Decision:** Journey finisher counts journeys the member started (`created_by`) and finished, templates and custom ones alike. A co-carer's finished journey on a shared bird counts for whoever started it.
- **Decision:** Good neighbor counts a Do good post that's live after review, or a place the member suggested that someone else approved. A chapter lead adding a listing directly doesn't count.
- **Decision:** Voice of the Flock counts a ballot in any vote, founders-only ones included, since they're on Do good too.
- **Decision:** Challenge champ shows in gray with "complete a Flock challenge" and nothing awards it; 1.10 adds the rule to `private.flock_badge_levels`.
- **Decision:** Once earned, a badge stays earned, even if the post is later removed or the vote deleted. A higher Journey finisher level replaces the lower one and is celebrated again.
- **Decision:** No analytics event for badges; the spec doesn't ask for one.
- **To change it:** the rules are `private.flock_badge_levels` (`20261124013000_flock_badges.sql`); the words and which celebration shows are `src/lib/flockBadges.ts`; the screens are `src/components/flock/BadgeParts.tsx` and `src/routes/_authenticated/flock.you.badges.tsx`.

### [#544](https://github.com/the-kya-project/perch-perfect-plan/pull/544) · 1.7 Instagram share cards for journeys
- **Decision:** Only the bird's household can make a card, for any journey, community ones included. The spec only rules out other people's "Just me" journeys, but a card of someone else's bird posted to Instagram felt like it needed the owner's say. The server checks this too for day one vs. now.
- **Decision:** A finished journey's "Make a share card" sits on the journey page once it's finished, not on the "Journey complete" screen. Leaving that screen would lose a half-written tip for the next person, and "Finish" lands on the journey page anyway. The mockup has no finished screen.
- **Decision:** On the milestone celebration, "Make a share card" is the sunflower button and "Share with the community" became the white one under it, as in the mockup. Its wording stays "Share with the community" rather than the mockup's "Post to the Flock", since this item doesn't cover that button.
- **Decision:** The card adds the date reached ("Reached Nov 22", "Finished Nov 22") under the title, which the spec asks for and the mockup's sample card leaves out. The member's name, when added, is "From [name]" above the Kya & Co. mark. Day one vs. now shows the date under each photo, as in the mockup.
- **Decision:** Day one vs. now uses a still from each clip (Cloudflare's thumbnail, fetched on the server), since its "photos" are clips. It opens in story size, as in the mockup; the others open as a post.
- **Decision:** The card's text is drawn in DM Sans and Newsreader, the app's fonts, rather than the Moments card's system font, to match the mockup. It's the Moments card's approach (a canvas PNG, the same share-or-download code) in the Flock's forest and lime.
- **To change it:** `src/lib/journeyCard.ts` (layout, who may make one) and `src/routes/_authenticated/flock.journeys.$journeyId.card.tsx` (wording).

### [#529](https://github.com/the-kya-project/perch-perfect-plan/pull/529) · 1.8 Do good voting: approved mockups
- **Decision (Brittany's):** Founders-only votes keep plain results: each choice's percentage and the top choice, with no donation or 10% wording. All-member votes share the donation. This replaces the earlier #529 notes below about a winner, changing a vote and the 10-vote minimum.
- **Decision:** Rounding uses largest remainder, so shares always total exactly 100%. Leftover points go to the largest remainder, then more votes, then the earlier choice. With no votes and three choices, that's 34 / 33 / 33.
- **Decision:** A member who has voted sees "See your vote" on the open card, which opens the thank-you screen. The mockups don't show this card state.
- **Decision:** Logos show whole on a white tile and are never cropped. A transparent logo is flattened onto white, because JPEG would turn it black.
- **Worth knowing:** With results showing at any size, a very small vote can reveal how someone voted. If two people vote and the result is 100% / 0%, each can work out the other's choice. Ballots themselves stay private.
- **To change it:** `private.flock_vote_guaranteed_pct()`, `private.flock_vote_shares()` and `isDonationVote` in `src/lib/flockVotes.ts`.
Judgment calls a run made on its own, even small ones: a name, an order, a default, how an unclear spec was read.

Format:

```
### <PR link> · <item ID> <item title>
- **Decision:** <what was decided>
- **Why:** <the reason, in plain language>
- **To change it:** <what would need to change>
```

### [#543](https://github.com/the-kya-project/perch-perfect-plan/pull/543) · 1.17 Promo codes for memberships
- **Decision:** Codes are entered in Stripe Checkout's own "Add promotion code" field. No code box was added to the card step, and nothing in the app creates or lists codes; they're made in the Stripe Dashboard.
- **Why:** gift Checkout already works this way, and an app field would need a new design.
- **To change it:** `allow_promotion_codes` in `startBillingCheckout` (`src/lib/billing.functions.ts`).

### [#543](https://github.com/the-kya-project/perch-perfect-plan/pull/543) · 1.17 Promo codes for memberships
- **Decision:** The rule is "every plan but founding" (`promotionCodesAllowed`), so Kya's Crew plans get codes as soon as #535 adds them, with no change here. The billing webhook also takes off any discount found on a founding subscription (from the Customer Portal or the Dashboard) and notes "discount removed" on the event. Discounts on a Stripe customer aren't checked.
- **Why:** founding and regular share one Stripe product, so Stripe can't limit a coupon to the regular prices. Hiding the field covers Checkout only.
- **To change it:** `promotionCodesAllowed` and `discountsToRemove` in `src/lib/billing.ts`.

### [#543](https://github.com/the-kya-project/perch-perfect-plan/pull/543) · 1.17 Promo codes for memberships
- **Decision:** Which codes are used isn't recorded in the app. `/admin/gifts` totals by code, but nothing like that exists for memberships yet.
- **Why:** the item asks only for codes to work on the card step.
- **Worth knowing:** #533 saves only the card (no subscription yet) in the free season's last 49 hours. Stripe's save-card Checkout has no code field, so a code can't be used in that window. Whichever of #533 and #543 merges second should keep `allow_promotion_codes` on the subscription Checkout.

### [#535](https://github.com/the-kya-project/perch-perfect-plan/pull/535) · 1.15 Kya's Crew (switched off)
- **Decision:** "No trial" means Crew never gets the 14-day trial planned for after the free season (6f, not built). During the free season a Crew card goes on at $0 until the season's end, like every membership; after it, Crew is charged the day the card goes on.
- **Why:** the Flock is "free for everyone" until the season's end, and Crew "includes everything in a Flock membership". The $0 period is the free season, not a trial. Asked in the PR in case you meant Crew to be charged at once.
- **Brittany's answer (Nov 23, 2026):** confirmed. Crew members pay nothing until the free season ends, the same as every other member.
- **To change it:** in `startBillingCheckout` (`src/lib/billing.functions.ts`), drop `trial_end` for `isCrewPlan(plan)`; `planGetsTrial` in `src/lib/billing.ts` is where 6f's trial must skip Crew.

### [#535](https://github.com/the-kya-project/perch-perfect-plan/pull/535) · 1.15 Kya's Crew (switched off)
- **Decision:** One six-month seat per Crew subscription, added the first time it's recorded as active (its first payment went through), never a second for the same subscription. Renewals add none. A seat stays when the membership ends or the account is deleted. A regular member who switches the same subscription to Crew sponsors a seat at that point.
- **Why:** the spec says "each Crew member sponsors six months"; once per membership is the narrowest reading, and a seat is only counted once it's paid for. Asked in the PR whether a yearly renewal should add another.
- **Brittany's answer (Nov 23, 2026):** a renewal does not sponsor another seat. The one-seat-per-new-Crew-member count is a number for marketing only. Rescue adopters always get in free, and the count never blocks one.
- **Brittany's decision (Nov 23, 2026):** seats aren't tracked at all. The sponsorship tables were removed from this PR before it merged.

### [#535](https://github.com/the-kya-project/perch-perfect-plan/pull/535) · 1.15 Kya's Crew (switched off)
- **Decision:** A founder who picks Crew gets Crew, not the founding price, and their founding claim is left as it is (not released or forfeited).
- **Why:** Crew is its own plan above the Flock's price. Forfeiting a founding spot is only for a founding membership that ends.
- **To change it:** `checkoutPlan` in `src/lib/billing.ts`.

### [#535](https://github.com/the-kya-project/perch-perfect-plan/pull/535) · 1.15 Kya's Crew (switched off)
- **Decision:** Giving is recorded as a rate on each Stripe row (`entitlements.giving_rate`, 0.25 for Crew and 0.20 for the other plans, like `gift_purchases.giving_rate`), not as amounts. Rows billing doesn't write keep it empty.
- **Why:** nothing records what members pay yet. The rate is what the spec asks to record, and amounts can be added when invoices are stored.
- **To change it:** `private.membership_giving_rate` (a new migration) and `givingRate` in `src/lib/billing.ts` together.

### [#535](https://github.com/the-kya-project/perch-perfect-plan/pull/535) · 1.15 Kya's Crew (switched off)
- **Decision:** The admin view is a new page, `/admin/crew` (admins only, English, like `/admin/gifts`): seats sponsored, used and available, Crew members now, a red line when more seats are used than sponsored, and each seat's date, Crew plan and whether the sponsor is still in the Crew. No names or emails. Nothing links to it yet. Seats given are a separate table, `crew_seat_uses`, which only 1.16 will write.
- **Why:** the item asks for "an admin view of seats sponsored and used" and 1.16 for a warning below zero. There's no mockup, so it follows the existing admin list pages.
- **Brittany's decision (Nov 23, 2026):** not needed. `/admin/crew` was removed from this PR before it merged.

### [#535](https://github.com/the-kya-project/perch-perfect-plan/pull/535) · 1.15 Kya's Crew (switched off)
- **Decision:** No Crew products for the App Store yet, and no Crew tile on the card step. Checkout accepts `crew_monthly` and `crew_annual`; nothing in the app sends them.
- **Why:** iPhone purchases come with the launch build (RevenueCat), and the card step has no Crew design. #533 is redesigning that screen.
- **Brittany's answer (Nov 23, 2026):** members choose Crew on the payment screen (the card step from 1.14a, #533), with its benefits listed. That waits on her approved mockup: backlog 1.15a.
- **To change it:** add Crew to the card step once there's a design (`CHECKOUT_CHOICES` is ready).
### [#533](https://github.com/the-kya-project/perch-perfect-plan/pull/533) · 1.14a Dutch
- Kept as names, in English: "the Flock", "Do good" and "Founding 50". "Free season" is "gratis periode" and "chapter" is "afdeling", as on the Dutch gift pages.
- Dates, Stripe's Checkout and the Customer Portal follow the language the member is using. Prices stay in US dollars, because that's what Stripe charges.
- The rest of the Flock has no Dutch yet, so a Dutch member sees Dutch billing screens inside a mostly English Flock.

### [#533](https://github.com/the-kya-project/perch-perfect-plan/pull/533) · 1.14a Card step and checkout design
- **Decision (Brittany, Nov 23, 2026):** A card added in the free season's last 49 hours is no longer charged right away. Checkout saves the card, and the webhook starts the subscription with its first charge at the season's end, the same as everyone else.
- **Why:** Stripe Checkout can't start a trial under 48 hours long. Saving the card first avoids that limit. Stripe shows no plan or price on a save-the-card page, so its sentence names the price. Opening a new checkout closes the member's older open one, and the webhook refuses a second membership.
- **To change it:** `firstCharge` in `src/lib/billing.ts`, `startSavedCardSubscription` in `src/lib/billingWebhook.ts`.

### [#533](https://github.com/the-kya-project/perch-perfect-plan/pull/533) · 1.14a Card step and checkout design
- **Decision:** Differences from the approved mockups:
  - **Tab bar:** the Flock's tab bar (phones) and side column (desktop) stay on these screens. The mockups don't show them.
  - **Desktop:** the content is capped at 560 px and centered on the forest background. The mockups are phone-only.
  - **Founding line:** the visible card uses the mockup's "Locked in for as long as you stay a member." Your `flock.billing.founding` sentence is what screen readers hear on that card.
  - **Founder after the free season:** no mockup. A founder whose price is still open sees the founding price card, not plan tiles, because Checkout will charge the founding price.
  - **Membership states the mockup doesn't show:** a paid member sees "Next charge"; a cancelled one sees "Your membership won't renew." and "Access until". The all-set screen shows only during the free season.
  - **Slow confirmation:** after two minutes the confirming screen says it's taking longer than usual, not to add the card again, and offers Back to the Flock.
  - **Missing values:** no Card row if Stripe can't return the digits, no tile for a price that isn't set, and the "2 months free" badge only while the two prices really work out to it.
  - **Checkout:** Stripe draws the page, so its layout differs from `BillingCheckout`. See "What Stripe won't let us change" in the PR.
- **Why:** the backlog's mockup rule asks for every difference to be listed.
- **To change it:** `src/components/flock/BillingScreens.tsx`.

### [#533](https://github.com/the-kya-project/perch-perfect-plan/pull/533) · 1.14a Card step and checkout design
- **Decision:** Billing dates use Eastern time everywhere, Checkout's sentence included. Checkout is set to English, and uses Inter because Stripe doesn't offer DM Sans.
- **Why:** one day on every screen, and the custom sentence has no Dutch yet.
- **To change it:** `billingDay` and `checkoutDesign` in `src/lib/billing.ts`.

### [#534](https://github.com/the-kya-project/perch-perfect-plan/pull/534) · 1.4 Removed content and closed reports are deleted after 180 days
- **Decision:** What counts: posts and comments a reviewer removed ("Remove it" in the review queue), timed from the removal (`flock_moderation.updated_at`), and reports closed as kept or removed, timed from `resolved_at`. Removed content goes through 1.3's hold, already due, so the same daily run deletes its photos with 1.3's rules (a photo still used elsewhere is kept, and a failed delete waits a day). The comments under a removed post, and the replies under a removed comment, go with it. Left out: removed journey updates (Brittany, Nov 23, 2026: they stay as they are and are not deleted after 180 days), Do good posts a reviewer declined (a review result, not a removal; they stay visible to their author only), content still waiting for review, and open reports.
- **Why:** D9 says "content removed by reviewers, and reports, are kept for 180 days, then deleted"; the item says "closed reports" and "180 days after they were resolved". Reusing 1.3's hold means a single path deletes Flock photos.
- **To change it:** `private.flock_moderation_purge` in `20261123193000_flock_removed_purge.sql` (a new migration); the hold is `private.flock_removed_hold()`.

### [#521](https://github.com/the-kya-project/perch-perfect-plan/pull/521) · D1.1 Weight baseline rules
- **Decision:** How the normal is worked out. It's the median (not the average) of the bird's weigh-ins of the same kind (before a meal, after a meal, not labeled) from the last 90 days, **leaving out the last 7 days**, and the range is the 10th to 90th percentile of those. "Still learning" counts only those weigh-ins, so a bird that's weighed regularly gets its normal about three weeks after its first weigh-in, not two.
- **Why:** the median ignores one odd reading (a dish left on the scale); leaving out the last week keeps a drop that's happening now from pulling the normal down with it, which would hide a slow decline.
- **To change it:** `baselineWindowDays`, `baselineSkipDays`, `rangeLowPercentile`, `rangeHighPercentile` in `WEIGHT_BASELINE_RULES` (`src/lib/healthRules.ts`).

### [#521](https://github.com/the-kya-project/perch-perfect-plan/pull/521) · D1.1 Weight baseline rules
- **Decision:** No tier fires on one weigh-in. A tier counts only when the last **two** weigh-ins of the same kind, within 3 days, are both that far below, and at least 2 g below. "Keep an eye on this" also needs the last 7 days' average 5% below. Until a re-weigh agrees, the function answers "weigh again" (`reweigh`) instead of an alert. Readings of another kind never confirm or compare: an after-meal weigh-in is never judged against the before-meal normal.
- **Why:** opening-scope B4's main risk is a false "call your vet today" from an after-meal reading, a dish on the scale or a new scale; it says to compare like with like, use the 2 g floor and ask for a re-weigh before any alert. An earlier version averaged the last 3 weigh-ins (the Diet conversion's way), but a real drop confirmed by a re-weigh was then diluted by the reading before it, so it switched to "two in a row".
- **To change it:** `confirmMinReadings`, `confirmDays`, `minDropGrams`, `keepAnEyeDays` in `WEIGHT_BASELINE_RULES`.

### [#521](https://github.com/the-kya-project/perch-perfect-plan/pull/521) · D1.1 Weight baseline rules
- **Decision:** What "the free hard weight-loss safety alert" is, since no spec defines it: a weigh-in **10% or more below** (the same rule-of-thumb value as "call your vet today"), confirmed by a re-weigh, at least 2 g. Once the normal is learned it's the same as "call your vet today". While still learning it compares with the median of the same kind's weigh-ins from the 30 days before (the last 3 days left out), so a new bird is covered from its second weigh-in and "still learning" never reads as "all fine".
- **Why:** opening-scope says the care app has no hard weight-loss alert today and that this one uses the most conservative research values; 10% is the value B4 cites with sources. The stricter "about 2% in one weighing" isn't used, because one weighing at 2% is within ordinary day-to-day and meal-time swing and would fire constantly.
- **To change it:** `hardLossPct`, `hardLossReferenceDays` in `WEIGHT_BASELINE_RULES`.

### [#521](https://github.com/the-kya-project/perch-perfect-plan/pull/521) · D1.1 Weight baseline rules
- **Decision:** Left out for now: the owner's typed normal weight (`birds.normal_weight` / min / max) doesn't override the learned one, and gains above the range get no note. The replay counts a tier as "fired" when a weigh-in reaches it and the one before didn't (reaching "call your vet today" from nothing counts once for each of the three tiers), and labels birds "Bird 1", "Bird 2"… by number of weigh-ins.
- **Why:** both were in the old weight-range spec but not in D1.1's "done means"; a typed value can be years old (a bird that has grown), so it's a decision for Brittany. "One alert per crossing" is the old spec's rule for sending alerts.
- **To change it:** say so on #521 or in D1.2; `computeWeightBaseline` would take the typed range as an extra input.

### [#531](https://github.com/the-kya-project/perch-perfect-plan/pull/531) · 2.4 Open pages fetch the new build's files after a release
- **Decision:** The pin is dropped before **every** update reload: the version check's (cache-busted address) and the service worker's (a plain reload, as before). The startup guard's reset after a missing code file, and the error screen's hard reset, are left as they are. The unpin waits at most 3 seconds; if it fails or times out (offline, or a page whose pinned build is older than this PR and has no `/api/public/unpin`), the page reloads anyway, exactly as it does today. The address is POST only, so a link or prefetch can never unpin anyone.
- **Why:** the item says "when an update is ready, the app clears its own pin and reloads", which covers both kinds of update. The resets aren't updates, and they already reload with the worker and caches cleared. The 3-second limit is the reference branch's.
- **To change it:** `unpinBuild` and `applyUpdate` in `src/lib/sw-register.ts`; `UNPIN_TIMEOUT_MS` in `src/lib/releaseCheck.ts`.

### [#525](https://github.com/the-kya-project/perch-perfect-plan/pull/525) · 1.14 Billing foundation (switched off) · approved and merged by Brittany, Nov 23, 2026
- **Decision:** Test mode is enforced in code: billing refuses any Stripe key that isn't a test key (`getBillingStripe` in `src/lib/stripe.server.ts`), in every deployment, production included. Gifts keep using the live key as before.
- **Why:** your approval was "test mode only". Putting it in code means turning `BILLING_ENABLED` on in production can't charge a real card by accident. Going live becomes a deliberate one-line code change you approve.
- **To change it:** remove the key check in `getBillingStripe` when payments go live.

### [#525](https://github.com/the-kya-project/perch-perfect-plan/pull/525) · 1.14 Billing foundation (switched off) · approved and merged by Brittany, Nov 23, 2026
- **Decision:** The switch is on only when `BILLING_ENABLED` is exactly `true`. Anything else, unset included, is off. While it's off, the webhook answers 503 before reading anything, the server functions return "off" without calling Stripe, and Membership shows exactly what it shows today.
- **Why:** the spec names the variable but not its value. A single strict value means a typo can't turn billing on.
- **To change it:** `billingEnabled()` in `src/lib/billing.ts`.

### [#525](https://github.com/the-kya-project/perch-perfect-plan/pull/525) · 1.14 Billing foundation (switched off) · approved and merged by Brittany, Nov 23, 2026
- **Decision:** Nothing about the card step shows in the iPhone or Android app, not even an "open this in your browser" line. Membership looks the same there as it does today.
- **Why:** the backlog says "never shown in the native app". The plan's "open this link in your browser" line conflicts with that, and Apple's rules on pointing people to web payments outside the US make a line like that risky.
- **To change it:** `cardStep()` in `src/lib/billing.ts` returns "hidden" for the app.

### [#525](https://github.com/the-kya-project/perch-perfect-plan/pull/525) · 1.14 Billing foundation (switched off) · approved and merged by Brittany, Nov 23, 2026
- **Decision:** A founder whose founding price is still open always gets the $15 founding price, with no monthly/yearly choice. Everyone else picks monthly or yearly, with yearly selected by default. With no free-season end stored, the card step says "Adding a card opens once the free season's end is set." and can't start a checkout. Within 49 hours of the end (Stripe's 48-hour minimum for a trial, plus an hour), or after it, the card is charged the same day, with no trial. A member with a card already on file can't start a second subscription; they see "Manage billing" (Stripe's Customer Portal) instead.
- **Why:** this follows payments-plan section d ("No yearly founding option"; `trial_end` = the free season's end). The yearly default, the not-ready line and the near-the-end rule weren't specified.
- **To change it:** `checkoutPlan`, `firstCharge` and `cardStep` in `src/lib/billing.ts`; the default `useState("annual")` in `BillingCardStep.tsx`.

### [#525](https://github.com/the-kya-project/perch-perfect-plan/pull/525) · 1.14 Billing foundation (switched off) · approved and merged by Brittany, Nov 23, 2026
- **Decision:** Left out of this PR: refunds of memberships (the plan says "a full refund ends access now"), cancelling a Stripe subscription when an account is deleted, the end-of-season job that releases founders, the admin lists, and the 14-day trial. Stripe's statuses are mapped as follows: `unpaid` → past_due (access runs out with the period), `paused` and `incomplete_expired` → canceled, `incomplete` → no row.
- **Why:** 1.14 covers the payments build's items 1–3 (schema, webhook, card step); the rest are later items. Refunds need a choice: the webhook re-reads the subscription, so marking a refunded row as ended would be undone by the next event. The simplest fix is to cancel the subscription in Stripe when refunding, and the webhook then ends access. Account deletion is a care-app flow current users rely on, so it was left alone.
- **To change it:** say which you'd like for refunds, and it becomes its own item.

### [#529](https://github.com/the-kya-project/perch-perfect-plan/pull/529) · 1.8 Do good voting
- **Decision:** Where votes show. Today shows open votes only (the spec's "on Today while it's open"). Do good shows open votes first, then a closed vote's result card ("The Flock chose …" or "Too few votes to share.") for 14 days after it closes. After that the vote is still readable from its link. A tie names every choice at the top as the winner.
- **Why:** the spec says everyone sees the results after closing but not where, or for how long, and doesn't cover a tie.
- **To change it:** `private.flock_vote_results_days()` in the migration; `votesFor` and `winnerNames` in `src/lib/flockVotes.ts`.

### [#529](https://github.com/the-kya-project/perch-perfect-plan/pull/529) · 1.8 Do good voting
- **Decision:** Once a vote is open, its question, description, audience and choices are locked. Only the close date (Extend, later only) and the announcement can change. Close early is final, and only drafts can be deleted. The announcement shows to members only after the vote closes.
- **Why:** a member's ballot points at a choice, so rewriting choices after people have voted would change what they voted for.
- **To change it:** `admin_vote_save` refuses non-drafts; allowing text-only edits while open would be a small change there.

### [#529](https://github.com/the-kya-project/perch-perfect-plan/pull/529) · 1.8 Do good voting
- **Decision:** The open vote card leaves out the mockup's row of voter avatars and shows only "31 members have voted" (or "You voted · …"). Percentages are each choice's share rounded to a whole number, so they may add up to 99 or 101.
- **Why:** faces of who voted aren't in the spec, which says members see "that they voted and how many have voted". Leaving them out keeps votes as private as possible.
- **To change it:** say if you'd like the avatars. That needs a new function returning a few voters' photos.

### [#529](https://github.com/the-kya-project/perch-perfect-plan/pull/529) · 1.8 Do good voting
- **Decision:** Deleting an account deletes that person's ballots, so a closed vote's results then count one fewer. "Founding member" means having a founding claim. The "fewer than 10" and "14 days" numbers are fixed in two small database functions, not admin settings.
- **Why:** ballots belong to the person (like every other row of theirs). The spec gives 10 as a rule, not a setting.
- **To change it:** `private.flock_vote_min_results()` and `private.flock_vote_results_days()`.

### [#523](https://github.com/the-kya-project/perch-perfect-plan/pull/523) · D2.1 Seasonal and holiday Today cards on Home · approved and merged by Brittany, Nov 23, 2026

- **Decision:** A card's end date is the last day of its unbroken run for that reader, so a season card interrupted by a holiday shows the day before the holiday (US, Nov 23: "Through Nov 23"), and "Got it" hides it through that day. It can come back after the holiday, because a different card has come up in between.
- **Why:** the brief says "until a different card comes up" and an end date "for that reader". Saving the end date with the dismissal also means a card returns normally next year.

### [#523](https://github.com/the-kya-project/perch-perfect-plan/pull/523) · D2.1 Seasonal and holiday Today cards on Home · approved and merged by Brittany, Nov 23, 2026

- **Decision:** "Pet sitter" stays "oppas" in Dutch, and "Holiday helper" is "Feestdagenhulp".
- **Why:** the locked glossary makes "sitter" "oppas" everywhere in the app. "Feestdagenhulp" is the closest short label for the pill.

### [#523](https://github.com/the-kya-project/perch-perfect-plan/pull/523) · D2.1 Seasonal and holiday Today cards on Home · approved and merged by Brittany, Nov 23, 2026
- **Decision:** The switch is a new table, `public.care_features` (`today_cards`, off / admins / everyone, starting off), built the same way as the health switches, rather than a row in `health_features`. "Brittany's account only" is `admins`: production has exactly one admin account (checked read-only, a count).
- **Why:** the calendar file says the cards are plain care reminders, never health advice, so they don't belong with the switches waiting on the avian vet. A per-account list would be new machinery for one person; `admins` already means you.
- **To change it:** move the row into `health_features` (and `HEALTH_FEATURES`) instead, or add another account to the admins.
- **Now:** on for everyone. On Nov 23, 2026, Brittany turned it on for admins at 12:08 PM Eastern, checked the card on her own account, and turned it on for everyone at 12:09 PM Eastern. She decided to skip the before-and-after Home screenshots D2.1 called for first.

### [#523](https://github.com/the-kya-project/perch-perfect-plan/pull/523) · D2.1 Seasonal and holiday Today cards on Home · approved and merged by Brittany, Nov 23, 2026
- **Decision:** The country (for the US-only and Netherlands-only cards) comes from the account's home time zone (Account → Time zone), or the phone's time zone when the account has none yet. A US time zone gets the US cards, Amsterdam gets the Dutch ones, and anywhere else (Canada, Belgium, the UK…) gets only the cards for everyone. The app's language isn't used. The day is the phone's own date, read after the page loads.
- **Why:** an English speaker in Amsterdam still hears King's Day fireworks, and a Dutch speaker in Ohio still has Thanksgiving. The home time zone is the one country-like thing the app already stores.
- **To change it:** `seasonalRegionForTimeZone` in `src/lib/todayCard.ts`; `npm run test:today-card` pins it.

### [#523](https://github.com/the-kya-project/perch-perfect-plan/pull/523) · D2.1 Seasonal and holiday Today cards on Home · approved and merged by Brittany, Nov 23, 2026
- **Decision:** The card sits right under Home's Today list (above the birds), as a white card with a small icon for its topic (sun, snowflake, sparkles, flame, plate, car, wind, house, party popper, clock), the card's title and its body. No label, no button, no way to dismiss it. It isn't shown during the onboarding tour's demo Home, and it doesn't appear on a Home with no birds yet.
- **Why:** the backlog asks for "the day's card" with no layout; this is the plainest card the Home design system already has. Dismissing wasn't asked for, so it's a question in the PR instead of a guess.
- **To change it:** `src/components/SeasonalTodayCard.tsx` and its one line in `src/routes/_authenticated/dashboard.tsx`.
### [#520](https://github.com/the-kya-project/perch-perfect-plan/pull/520) · 2.3 Open pages notice a new release · approved and merged by Brittany, Nov 23, 2026
- **Decision:** The open page reads `/api/public/version` through a hidden, zero-size frame instead of an ordinary request, as the reference branch `fix/native-release-catchup` does. Vercel's Skew Protection answers an open page's ordinary requests from the copy it started with, so they would only ever see the old build; page loads, frames included, aren't pinned (checked on that branch, Nov 2, 2026).
- **Why:** without it the check would never see a release while Skew Protection is on, which is the setting Brittany chose to keep (2.4, option B).
- **To change it:** `readLiveBuild` in `src/lib/sw-register.ts`. If Skew Protection were ever turned off, a plain uncached request would do.

### [#520](https://github.com/the-kya-project/perch-perfect-plan/pull/520) · 2.3 Open pages notice a new release · approved and merged by Brittany, Nov 23, 2026
- **Decision:** A reload the version check asks for goes to the same address with `?_r=<time>` added (the cache-busted reload the startup guard already uses), so the iPhone's web view can't answer it from its own cache. A service-worker update still reloads exactly as before. Dropping Vercel's pin before that reload is left to 2.4, and the sitter preview's own catch-up (with no worker) to 2.5. The background watcher also listens for the native app's `pause` and `resume`, which the iOS web view doesn't always report as a visibility change.
- **Why:** keeps 2.3 to its "done means" line and leaves the service-worker path that web users already have unchanged.
- **To change it:** `reloadFresh` and `applyUpdate` in `src/lib/sw-register.ts`.

### [#528](https://github.com/the-kya-project/perch-perfect-plan/pull/528) · 1.6 Curated chapter collections
- **Decision:** Place suggestions have their own functions (`flock_place_suggestions`, `flock_place_review`) and their own "Places" chip in `/admin/review`, rather than a rewrite of `flock_review_queue` and `flock_review_counts`. The queue's and Flock settings' "waiting" totals add them in.
- **Why:** It keeps the migration purely additive: no existing function changes.
- **To change it:** fold places into `flock_review_queue` in a later migration if one combined list is wanted.

### [#528](https://github.com/the-kya-project/perch-perfect-plan/pull/528) · 1.6 Curated chapter collections
- **Decision:** A suggestion is approved or declined, with no "Ask for changes". Approving lists it as sent, at the end of its group, and the lead can then add a phone or website with Edit. Declining deletes it. The member isn't notified either way.
- **Why:** The spec says "approve or decline", and the mockup's suggest form has no phone or website fields. A notification would have meant changing the existing Flock notification functions and checks.
- **To change it:** say if members should hear back. That's a "place" notification kind plus a change to `flock_notifications_list`.

### [#528](https://github.com/the-kya-project/perch-perfect-plan/pull/528) · 1.6 Curated chapter collections
- **Decision:** The suggest form has kind, name, city or area, and "Why do you recommend it?", as in the mockup. Only the name is required. Leads and admins add phone and website. Each member can have at most 10 suggestions waiting at once.
- **Why:** The spec lists name, type and note, and the mockup adds city or area. The cap stops one account flooding a lead's queue. There's no hourly limit like the one on posts.
- **To change it:** the cap is `private.flock_place_suggest_limit()`.

### [#528](https://github.com/the-kya-project/perch-perfect-plan/pull/528) · 1.6 Curated chapter collections
- **Decision:** Managing listings is its own screen, `/flock/places` (the mockup's screen 3). The Resources tab links to it through a small lime "Manage listings" card, shown only to the chapter's lead and admins. Admins get a "Chapter" dropdown there to pick any chapter, since their own chapter page shows only their own. Reordering uses up and down arrows within a group. Remove sits inside Edit and asks before removing.
- **Why:** The mockup shows the lead's screen but not how to get to it, how an admin reaches another chapter, or how reordering works. These are the smallest additions that cover the spec.
- **To change it:** tell us the entry point or reorder control you'd like.

### [#528](https://github.com/the-kya-project/perch-perfect-plan/pull/528) · 1.6 Curated chapter collections
- **Decision:** Small differences from the mockup: the tab order stays Posts, Events, Resources, Members (the backlog says so); each card's square tile carries an icon (stethoscope, heart-handshake, shop); and every group always shows, with an empty one inviting a suggestion.
- **Why:** The spec asks for an empty group to invite a suggestion, and the tiles were blank in the mockup.
- **To change it:** say which you'd prefer.

### [#522](https://github.com/the-kya-project/perch-perfect-plan/pull/522) · 1.3 Deleted posts stay hidden for 180 days, then are purged
- **Decision:** a deleted post or comment is moved into a new holding table (`flock_deleted_items`, readable only by the server), rather than marked "deleted" in place. The post and comment tables, and every rule about who sees what, are unchanged.
- **Why:** "hidden from everyone at once, the author included" is then true everywhere automatically. Marking in place would have meant rewriting about fifteen visibility functions, which already carry the blocking and moderation rules.
- **To change it:** to let an author restore a deleted post, a function would copy the held row back.
- **Decision:** reactions on a deleted post or comment are deleted at once, as today. Only the post, its comments and their photos are held.
- **Why:** D10 names the post and its comments. Reactions aren't content anyone wrote.
- **To change it:** hold them in the same table with a new `kind`.
- **Decision:** the delete confirmations keep their wording ("This can't be undone."). For the member that's still true: nothing in the app brings a deleted post back. The 180 days will be explained in the privacy policy (1.5).
- **Why:** the backlog item asks for no copy change.
- **To change it:** `flock.posts.deleteLine`, `deleteCommentLine` and `deleteReplyLine` in `src/locales/en.jsonc`.
- **Decision:** the daily job (`flock-deleted-purge-daily`, 04:23 UTC) calls a new hook, `/api/public/hooks/flock-purge`, instead of being SQL only. The migration schedules it on production only.
- **Why:** SQL can't remove the photo files. Only the Storage API can. Staging and preview branches would otherwise call production's hook.
- **To change it:** the `cron.schedule` block at the end of `20261123074500_flock_deleted_hold.sql`.
- **Decision:** when someone deletes their account, their held items go at once. Another member's reply held under their post stays held on its own until its own 180 days are up.
- **Why:** D10 says deleting an account stays immediate, and the reply is the other member's content.
- **To change it:** `held_with` would need `on delete cascade` instead of `set null`.

### [#519](https://github.com/the-kya-project/perch-perfect-plan/pull/519) · 2.2 A version endpoint and release rules
- **Decision:** Ported the endpoint and rules from the reference branch `fix/native-release-catchup`, with three changes: (1) "update now or later" is its own rule, `releaseUpdateAction`, the same rule a service-worker update follows today (a quiet moment with no form in progress → now; otherwise the banner); (2) a new `parseVersionResponse` reads the endpoint's answer and ignores anything else (an error page, a proxy); (3) the branch's `staleCodeAction` (what a missing code file does) was left out, since 2.1 already handles missing files on `main` and it isn't part of 2.2. The numbers are the branch's: check hourly, at most once a minute on return to the foreground, give up after 8 seconds, never reload for the same build twice within 10 minutes.
- **Why:** the backlog asks for the pure rules for "a new release is out, update now or later", with nothing behaving differently yet. Nothing calls them until 2.3.
- **To change it:** the constants at the top of `src/lib/releaseCheck.ts`; `npm run test:release-check` pins them.

### [#516](https://github.com/the-kya-project/perch-perfect-plan/pull/516) · D3 Seasonal calendar file · approved and merged by Brittany, Nov 22, 2026
- **Decision:** Some cards are for one country: Fourth of July, Halloween, Thanksgiving and the US clock changes are US-only; King's Day, Sinterklaas and the European clock changes are Netherlands-only. `cardForDate(date, region)` shows a country's cards only when it's asked for that country, and only the cards for everyone when no country is given. The file doesn't decide how Home knows the country: that's D2.1's call (the home time zone or the app's language would both work).
- **Why:** the scope notes warn about "holidays wrong for the region (the app ships in Dutch too)". Keeping the country out of the file leaves D2.1 free to pick the signal.
- **To change it:** change a card's `region` in `src/lib/seasonalCalendar.ts`.

### [#516](https://github.com/the-kya-project/perch-perfect-plan/pull/516) · D3 Seasonal calendar file · approved and merged by Brittany, Nov 22, 2026
- **Decision:** One card per day. Seven season cards cover the year with no gaps (northern-hemisphere seasons); holiday cards take over for a few days around their date (for example fireworks Dec 29 – Jan 1, Thanksgiving's card the Tuesday to Thursday, the clock changes Thursday to Sunday). When two holidays share a day, the shorter one wins (Halloween over the US clock change). Left out: holidays on a moving lunar date (Hanukkah, Diwali, Lunar New Year), Mother's Day and Guy Fawkes; the December candles card covers candles for every tradition.
- **Why:** the backlog asked for "a rule for which day it shows"; one card a day keeps Home simple, and a test proves no day is empty.
- **To change it:** add, remove or re-date a card in `src/lib/seasonalCalendar.ts` and its two lines in each language file; the test lists anything missing.
- **Still open after the merge:** `npm run test:seasonal-calendar` isn't in CI yet (one line in `.github/workflows/hydration.yml`; runs can't push workflow changes).

### [#516](https://github.com/the-kya-project/perch-perfect-plan/pull/516) · D3 Seasonal calendar file · approved and merged by Brittany, Nov 22, 2026
- **Decision:** Food and fume lines (chocolate, avocado, alcohol, overheated non-stick pans, the oven's self-clean setting, cleaning sprays, candles) are treated as plain care reminders, not health advice, so they don't wait for the vet. No card mentions symptoms, illness or what to do if a bird is unwell.
- **Why:** the item says "plain care reminders only, never health advice". These are common household safety steps the app already uses elsewhere, but you may want the vet to see them too.
- **To change it:** soften or remove the line in `src/locales/seasonal.en.jsonc` (and its Dutch), or add the cards to the vet packet.

### [#516](https://github.com/the-kya-project/perch-perfect-plan/pull/516) · D3 Seasonal calendar file · approved and merged by Brittany, Nov 22, 2026
- **Decision:** The words are their own language files (`seasonal.en.jsonc` and `seasonal.nl.jsonc`), listed in the translate step like the routine catalog. The app doesn't load them yet; D2.1 adds them when Home shows the card (it has, for everyone, since Nov 23, 2026). The Dutch was written by hand and stamped, because the run can't call the translate step.
- **Why:** keeps the cards out of the main word list (which only holds words the code names) and adds nothing to any page until D2.1.
- **To change it:** a native speaker can edit the Dutch directly; the next translate run keeps hand edits.

### [#515](https://github.com/the-kya-project/perch-perfect-plan/pull/515) · 1.2 Vet-content settings file and a switch for every health feature · approved and merged by Brittany, Nov 22, 2026
- **Decision:** Seven switches: `daily_health_check`, `care_weight_trend`, `emergency_guides`, `passing_guidance`, `diet_conversion`, `vet_nudge` (all start at `everyone`, so nothing changes) and `weight_baseline` (starts `off`, for D1). None is read by the app yet. "Everyone" means every signed-in person, and the server for sit links; signed-out visitors can't call the switch directly.
- **Why:** wiring a live feature to a switch means deciding what users see when it's off, which the backlog doesn't say. Starting at everyone keeps the merge invisible.
- **To change it:** add or rename rows in a new migration and in `src/lib/healthFeatures.ts`; wiring a feature is its own PR.

### [#515](https://github.com/the-kya-project/perch-perfect-plan/pull/515) · 1.2 Vet-content settings file and a switch for every health feature · approved and merged by Brittany, Nov 22, 2026
- **Decision:** Most sources say "Kya & Co. starting value; no published source", because that's what they are. Only the baseline's 10% "call your vet today" level and the poison lines cite outside sources. Wording isn't copied into the file: it lists the language keys for each area, and a test checks those keys exist. The app's code keeps its own copies of the numbers, and the test fails if they drift from the file, so this PR doesn't touch the live triage or weight code.
- **Why:** the backlog asked for a research source per value, and making one up would mislead the vet. Leaving the live code alone keeps the PR from changing anything users see.
- **To change it:** add sources as the vet review supplies them; make the code import from the file in a later PR if you'd prefer one copy.

### [#514](https://github.com/the-kya-project/perch-perfect-plan/pull/514) · 2.1 The startup guard listens before anything can fail · approved and merged by Brittany, Nov 22, 2026
- **Decision:** The guard is added to each page's HTML by the server entry (`src/server.ts`, `withStartupGuard` in `src/lib/startupGuard.ts`), not rendered by React. It goes right after `<meta charset>`, not before it.
- **Why:** React 19 moves every `<meta>`, `<link>` (including the code preloads and the font stylesheet) and `<title>` above any script in `<head>`, so a React-rendered guard can't come first. The charset has to stay in the page's first 1024 bytes. Only the app's own pages get the guard (a `<head>` that loads `/assets/` code). The unsubscribe, bereavement-review and error pages don't, because there it would show "Something's taking too long".
- **To change it:** `src/lib/startupGuard.ts`. The order is pinned by `e2e/startup-guard.spec.ts`.

### [#514](https://github.com/the-kya-project/perch-perfect-plan/pull/514) · 2.1 The startup guard listens before anything can fail · approved and merged by Brittany, Nov 22, 2026
- **Decision:** The 30 WebKit runs live inside `e2e/startup-guard.spec.ts` (30 copies of the missing-file test, WebKit only), not as a new step in `hydration.yml`. The checks of how the guard is added to the HTML are in the same file.
- **Why:** GitHub refused this run's push of a workflow change: the hourly runs' token has no Workflows permission. The iPhone hydration job already runs every spec, so the 30 runs happen in CI anyway.
- **To change it:** if you'd rather have its own step, add `npx playwright test -c e2e startup-guard.spec.ts --project 'webkit-en'` to `hydration.yml` yourself. Runs can't edit workflows.

### [#514](https://github.com/the-kya-project/perch-perfect-plan/pull/514) · 2.1 The startup guard listens before anything can fail · approved and merged by Brittany, Nov 22, 2026
- **Decision:** The "list of the page's code files" is `window.__kyaCode` (`files` and `failed`), kept by the guard. The root error screen treats any failed code file on it as a missing file (one automatic reload, then the error screen), without asking the server first.
- **Why:** it's simple and needs no network call. The one-reload limit already stops a loop. The reference branch (`fix/native-release-catchup`) also asked the server (HEAD) and waited for loading to settle. That's the sitter-preview fix and belongs with 2.5, so it isn't here.
- **To change it:** `pageCodeFailed` in `src/lib/sw-register.ts`.

### [#508](https://github.com/the-kya-project/perch-perfect-plan/pull/508) · 0.5 Admin review for pending posts
- **Decision:** The way in is a "Review queue" row in its own card at the top of Flock settings, shown to anyone `flock_can_review()` lets in (admins today, and chapter leads, who see Events only). It isn't in the care app's settings or any shared menu.
- **Why:** the item allowed "admin menu or Flock settings". There's no admin menu, and Flock settings keeps it inside Flock-only code, so free users can't be affected.
- **To change it:** move the row in `src/routes/_authenticated/flock.you.index.tsx`.

### [#508](https://github.com/the-kya-project/perch-perfect-plan/pull/508) · 0.5 Admin review for pending posts
- **Decision:** The space for reports comes from a new function (`flock_review_post_spaces`) rather than changing `flock_review_queue`. A report shows its date as the latest report's time.
- **Why:** the item says to hold the PR if an existing database function has to change. A new function only adds, so the PR could merge.
- **To change it:** fold the space into `flock_review_queue` in a later migration (that changes an existing function, so it needs Brittany's approval).

### [#507](https://github.com/the-kya-project/perch-perfect-plan/pull/507) · 1.11 Buddy pods
- **Decision:** A "keep going" group is still a pod, so the block, reporting, admin and 3-week rules apply. When the 3-week rule closes one, it ends without asking "Keep going together?" again. "You finished!" and "Keep going together?" aren't in the mockup, so they're built from the app's existing card and sheet components and listed in the PR.
- **Why:** Brittany's answer didn't cover a "keep going" group going quiet, and asking again could keep an inactive group open forever. The spec holds PRs for unmocked screens, and this keeps those two small messages from blocking 1.11.
- **To change it:** change the item in `docs/BACKLOG.md`, or ask for a mockup of the two messages.

### [#506](https://github.com/the-kya-project/perch-perfect-plan/pull/506) · 1.11 Buddy pods
- **Decision:** Progress from a "Just me" journey is never shown in a pod.
- **Why:** The spec shows journey progress on the pod page, but its first rules say nothing from a "Just me" journey reaches anyone outside the household.
- **To change it:** change the item in `docs/BACKLOG.md`.
- **Brittany:** agreed (Nov 22, 2026).

### [#506](https://github.com/the-kya-project/perch-perfect-plan/pull/506) · 1.13a Badges
- **Decision:** A badge earned only through "Just me" journeys shows on the member's own Badges screen and not to other members.
- **Why:** A public badge would reveal activity from a private journey.
- **To change it:** change the item in `docs/BACKLOG.md` if these badges should be public.
- **Brittany:** agreed (Nov 22, 2026).

### [#506](https://github.com/the-kya-project/perch-perfect-plan/pull/506) · 1.10 Challenges
- **Decision:** Diet conversion can't be used as a challenge's journey template.
- **Why:** The spec says challenges never involve food restriction, weight goals or anything health-related.
- **To change it:** change the item in `docs/BACKLOG.md`.
- **Brittany:** agreed (Nov 22, 2026).

### [#506](https://github.com/the-kya-project/perch-perfect-plan/pull/506) · 1.12 Flock insights
- **Decision:** The mockup's "Share my profile with my chapter" switch stays out, and the diet conversion duration is marked as a question for Brittany.
- **Why:** The switch isn't in the spec, and a typical diet conversion length could read as health guidance, which the spec rules out.
- **To change it:** say so when approving 1.12.
- **Brittany:** agreed that the "Share my profile with my chapter" switch won't be built (Nov 22, 2026). Diet conversion duration: no typical length (Nov 24, 2026). Diet conversion shows no number, range or "usually takes" line anywhere.

### [#506](https://github.com/the-kya-project/perch-perfect-plan/pull/506) · 1.6, 1.8, 1.7, 1.13a, 1.10, 1.11 order
- **Decision:** The six items go after the existing Ready items, in the requested order. 1.6 depends on 0.5, 1.13a on 1.6 and 1.8, and 1.10 on 1.13a. 1.6 keeps the app's tab order (Resources before Members), which differs from its mockup.
- **Why:** This leaves work already queued in place, and each dependency is something the spec's feature uses.
- **To change it:** reorder the items in `docs/BACKLOG.md`.

### [#505](https://github.com/the-kya-project/perch-perfect-plan/pull/505) · 0.4 Credit /get-page sign-ups to the link that brought them
- **Decision:** Brought over the reference commit `d974e8e` exactly as it was, including that it also covers `/get-app` (both share the same desktop page) and not `/review`. Left the two files' existing Prettier warnings alone (they're on `main` too), so the diff stays only the change.
- **Why:** The backlog item says to build from that commit; reformatting would bury the real change in a large diff.
- **To change it:** ask for the files to be reformatted in a separate PR, or for `/get-app` to be left out.

### [#504](https://github.com/the-kya-project/perch-perfect-plan/pull/504) · Backlog: Brittany's decisions
- **Decision:** 1.15 and 1.17 moved to "Ready to build" with "Depends on: 1.14 merged", and the Skew one-pager (2.4a) sits second, right under the admin review item. 1.14 and its followers go at the end of Ready, and D1.2 right after D1.1.
- **Why:** Runs never start anything under "Needs Brittany before work starts", so 1.15 and 1.17 had to move to start once 1.14 merges. Existing priorities otherwise keep their order.
- **To change it:** reorder the items in `docs/BACKLOG.md`.

### [#504](https://github.com/the-kya-project/perch-perfect-plan/pull/504) · D1.2 Weight baseline shadow mode
- **Decision:** Until you answer, the shadow log covers your birds only. The item used to say "every bird", and your approval says "on for my account only".
- **Why:** The narrower reading can't touch anyone else's data.
- **To change it:** say that it should log every bird.

### [#500](https://github.com/the-kya-project/perch-perfect-plan/pull/500) · 0.3 Translation check passes and stays passing
- **Decision:** In Dutch, "the Flock" stays "de Flock" (the product's name). The glossary's "flock" → "je vogels" is kept for "your flock" meaning your birds.
- **Why:** "Een jaar in je vogels" would make no sense; the Flock is a name, like Kya & Co.
- **To change it:** pick a Dutch name for the Flock and add it to `src/locales/glossary.nl.json`.

### [#500](https://github.com/the-kya-project/perch-perfect-plan/pull/500) · 0.3 Translation check passes and stays passing
- **Decision:** "Eastern time" in the gift send-date hint became "Amerikaanse oostkusttijd" (US East Coast time).
- **Why:** A Dutch buyer would otherwise read the time as their own.
- **To change it:** edit `gift.sendOnHint` in `src/locales/nl.jsonc`.

### [#500](https://github.com/the-kya-project/perch-perfect-plan/pull/500) · 0.3 Translation check passes and stays passing
- **Decision:** The translation check runs right after install in the iPhone hydration job, before the browsers download.
- **Why:** It takes seconds, so a drifted catalog fails fast instead of after the long browser tests.
- **To change it:** move the "Translation catalog matches the code" step in `.github/workflows/hydration.yml`.

### [#499](https://github.com/the-kya-project/perch-perfect-plan/pull/499) · Setup: rules for the continuous runs
- **Decision:** A run that opens no PR (stopped by the lock, or found nothing it's allowed to build) writes its log entry to `~/.kya-agent/pending-log.md` on the Mac, and the next run with a PR copies it into `docs/agent-log.md`.
- **Why:** Every run must be logged, but a run with no PR has no way to change `main`, and must not touch the main project folder.
- **To change it:** say where those entries should go instead.

### [#499](https://github.com/the-kya-project/perch-perfect-plan/pull/499) · Setup: rules for the continuous runs
- **Decision:** "Behind the Flock gate" counts as hidden only while the Flock is closed to members (`members_open` is false in production). Once the Flock opens, Flock changes are visible to members and must be held.
- **Why:** The gate is admins-only today, but opening the Flock turns it on for members, and from then on a Flock change is something real people notice.
- **To change it:** set a different rule for after opening day.

### [#499](https://github.com/the-kya-project/perch-perfect-plan/pull/499) · Setup: rules for the continuous runs
- **Decision:** A run waits for checks inside its own 3-hour window. If they haven't finished, it logs the PR as "waiting on checks", and a later run may merge it (if every rule passes) before picking new work.
- **Why:** The Free-user regression waits for the preview deployment and can take a while; this keeps each run short without leaving finished work stranded.
- **To change it:** say how long a run should wait, or that a later run shouldn't finish another run's PR.

### [#499](https://github.com/the-kya-project/perch-perfect-plan/pull/499) · Setup: rules for the continuous runs
- **Decision:** An item's own "Needs Brittany" line in the backlog still applies. If it asks for an approval, a decision, a read of copy or a hands-on check, the PR is held. "Merge only" doesn't stop a self-merge.
- **Why:** Many "Overnight alone: yes" items already name something you want to approve (deletions, health content, Dutch copy).
- **To change it:** rewrite the item's "Needs Brittany" line.

---

## Held for Brittany

PRs waiting on Brittany, and exactly what each one needs.

Format:

```
### <PR link> · <item ID> <item title>
- **Needs:** <the decision, approval or read, in one or two lines>
```

### [#567](https://github.com/the-kya-project/perch-perfect-plan/pull/567) · 1.20f Co-carers read comments on their bird's journeys (two PRs for one item)
- **Needs:** pick #567 or [#569](https://github.com/the-kya-project/perch-perfect-plan/pull/569). Both build 1.20f and rewrite the same three functions (`flock_comments_for`, `flock_comment_counts`, `flock_media_refs`), so only one should merge: whichever merges second would replace the first one's definitions. #569 was opened 18 minutes after #567's "In progress" draft, by another session. The main differences: #569 also requires `journey_viewable` (so the household path works only while journeys are on for that person), while #567 counts anyone with access to the bird. #567 also shows a read-only "N comments" link on the clip viewer, which is the only way into a journey's comments from a journey page. Close the one you don't want and say so in the other.

### [#566](https://github.com/the-kya-project/perch-perfect-plan/pull/566) · Badge art (final art for 1.13a, stored for 1.13b)
- **Needs:** a look at the screenshots in the PR, then your OK in the PR to merge. It changes what admins see on the Badges screen, the celebrations and profiles (nobody else sees badges yet). Also say whether the pill-size notes in the PR are fine.

### Reminder · the hourly runs' GitHub token expires Feb 20, 2027
- **Needs:** a new token before **Feb 20, 2027**. That's 90 days from Nov 22, 2026; GitHub → Settings → Developer settings → Fine-grained tokens shows the exact date. When it expires, runs can still build and test but can't push or open PRs, and each run's note in `~/.kya-agent/job.log` says so.
- **To replace it:** make a new fine-grained token for `the-kya-project/perch-perfect-plan` only, with the same permissions as the old one (Contents and Pull requests: read and write; Actions, Commit statuses and Checks: read). Then run the save command again in Terminal (it asks you to paste the token and doesn't show it). It overwrites `~/.config/kya-agent/github-token`, readable only by you. Delete the old token on GitHub after that. Clear this item and add a new one with the new date.
