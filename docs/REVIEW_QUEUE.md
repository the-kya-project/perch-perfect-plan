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
- **Still open after the merge:** whether to wire the live features (daily health check, weight trend, emergency guides, passing guidance) to their switches, and what a switched-off one looks like. `npm run test:health-rules` isn't in CI yet (one line in `.github/workflows/hydration.yml`; runs can't push workflow changes).

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
- **Brittany:** agreed that the "Share my profile with my chapter" switch won't be built (Nov 22, 2026). The diet conversion duration question is still open.

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

### [#535](https://github.com/the-kya-project/perch-perfect-plan/pull/535) · 1.15 Kya's Crew and its sponsored rescue-adopter seat (switched off)
- **Needs:** (1) your approval of the database change: the `entitlements` plan check adds `crew_monthly` and `crew_annual`, plus the new `giving_rate` column and the replaced billing function. Merging applies it to production. (2) Your merge. Your Crew questions are answered (Nov 23, 2026), and seat counting is out. The Crew option on the payment screen is 1.15a and doesn't hold this PR. The Stripe test prices can wait until you want to try Crew checkout.

### [#535](https://github.com/the-kya-project/perch-perfect-plan/pull/535) · 1.15 Kya's Crew: Free-user regression needs a re-run
- **Needs:** a re-run of "Free-user regression" on #535 (Actions → the cancelled run → Re-run jobs). On its latest commit (`ebaa867`, "Crew: remove sponsored seat counting") that check was cancelled, not failed, most likely because a newer run joined the shared staging queue. It passed on the commit before. Runs can't re-run checks. The PR is otherwise held for your approval, as its description says.

### Reminder · the hourly runs' GitHub token expires Feb 20, 2027
- **Needs:** a new token before **Feb 20, 2027**. That's 90 days from Nov 22, 2026; GitHub → Settings → Developer settings → Fine-grained tokens shows the exact date. When it expires, runs can still build and test but can't push or open PRs, and each run's note in `~/.kya-agent/job.log` says so.
- **To replace it:** make a new fine-grained token for `the-kya-project/perch-perfect-plan` only, with the same permissions as the old one (Contents and Pull requests: read and write; Actions, Commit statuses and Checks: read). Then run the save command again in Terminal (it asks you to paste the token and doesn't show it). It overwrites `~/.config/kya-agent/github-token`, readable only by you. Delete the old token on GitHub after that. Clear this item and add a new one with the new date.
