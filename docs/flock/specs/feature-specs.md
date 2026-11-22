# Flock feature specs

Approved by Brittany on Nov 22, 2026. Mockups for every feature are in `docs/flock/mockups/` (one file per feature, `Spec*.dc.html`, several phone screens each). The same mockups live in Brittany's design canvas, "The Flock mockup", on the page "New features (Nov 22)". Build the UI to match them.

## Rules that apply to every feature below

- Everything stays hidden behind the Flock gate until Brittany opens the Flock, so current users see nothing.
- Block rules always apply. A member never sees content from someone they've blocked, or who has blocked them.
- Nothing is ever shown from a "Just me" journey to anyone outside that member's household.
- No fixed dates go in any copy. Seasons, deadlines, and windows are settings Brittany fills in.
- Copy follows the Flock tone: warm and plain, the way a kind person would say it, in complete sentences.
- Medical questions stay out of the Flock. Anything that reads like health advice points members to their avian vet.
- New screens follow the approved mockups. Where a screen isn't mocked up, the agent holds the PR and asks.
- Brittany said "we can refine as we go": small layout details may differ from the mockups when the real app's components call for it, but list any difference in the PR.

## Chapter collections (1.6)

Each chapter's Resources tab becomes a short, trusted list of local avian vets, rescues, and bird shops. It answers "who's near me," which Brittany called one of the most important things the Flock does, and it's the easiest way for a new member to get value on day one. Mockup: `SpecCollections.dc.html`.

**What members see**

- The chapter's Resources tab shows listings grouped as Avian vets, Rescues, and Shops and services, in that order.
- Each listing is a simple card with the name, city or area, phone, website, and a short note on why it's recommended (for example, "Sees macaws, open Saturdays").
- Cards look like a directory, not posts. They have no comments, reactions, or author.
- Tapping the phone number calls it, and tapping the website opens it.
- A member can tap "Suggest a place" to send a name, type, and note. Suggestions go to the chapter lead and Brittany for approval and never appear until approved.
- An empty group shows a warm line inviting members to suggest a place.

**What chapter leads and admins do**

- Add, edit, reorder, and remove listings for their own chapter. Admins can do this for every chapter.
- Approve or decline member suggestions from the same review screen used for Do good posts.
- See when each listing was last updated, so stale ones are easy to spot.

**Rules**

- Listings are recommendations from the community, not endorsements. A small line at the top of the tab says so.
- No ratings or reviews, to keep it friendly and avoid disputes with businesses.
- A listing belongs to one chapter. The same vet can be added to two chapters separately.

**Out of scope**

- Maps, distance search, and opening hours.
- Importing vets from an outside directory. Members can still use the AAV Find-A-Vet link the app already shows.

**Content Brittany provides before opening**

- A few starter listings per founding chapter, or at least for the chapters that have members.

## Do good voting and the founding vote (1.8)

One simple voting tool covers two promises already made. Members choose which rescue and conservation partners receive each quarter's donation, and the Founding 50 vote on the first expert Q&As and the first chapters, which the founding page promises today. Mockup: `SpecVoting.dc.html`.

**What members see**

- An open vote appears as a card at the top of the Do good space, and on Today while it's open.
- The card shows the question, a short description, the choices (each with a name, photo, and a sentence or two), and when the vote closes.
- A member picks one choice and taps Vote. They can change their vote until it closes.
- Before the vote closes, members see only that they voted and how many people have voted, not who's winning.
- After it closes, everyone sees the results as percentages and the winner, plus Brittany's announcement note.
- Founders-only votes show only to founding members, with a small founder badge on the card.

**What admins do**

- Create a vote with a question, description, two to eight choices, an audience (all members or founders only), and a close date.
- Open, close early, or extend a vote.
- Write a short announcement that shows with the results.
- See the full counts at any time, even before closing.

**Rules**

- One vote per member per question.
- If fewer than 10 people have voted when it closes, results show as "too few votes to share" and only admins see the counts.
- Votes are private. Nobody, including other admins, sees how a specific member voted.
- The vote decides who receives the donation. The amount still comes from the 20% of every membership, which Brittany announces separately.

**Out of scope**

- Ranked or multi-choice voting.
- Members proposing their own choices (they can still suggest causes through Do good posts).

**Content Brittany provides**

- The first quarterly donation vote's choices, and the founders' Q&A and chapter choices.

## Instagram share cards for journeys (1.7)

Members can turn a journey moment into a branded image to post on Instagram or anywhere else. Every shared card carries the Kya & Co. name. Mockup: `SpecShareCards.dc.html`.

**What members see**

- A "Make a share card" button on three moments: reaching a milestone, finishing a journey, and the "day one vs. now" comparison. These buttons replace today's "comes later" placeholders.
- A preview of the card before sharing, with a choice of two sizes: a post (1080×1350) and a story (1080×1920).
- The card shows the bird's photo, the bird's name, the journey name, the milestone or "Finished!", and the date reached. Day one vs. now shows two photos side by side.
- A small "Kya & Co. · thekyaproject.com" mark at the bottom.
- Tapping Share opens the phone's share sheet. On the web, it downloads the image so the member can post it themselves.

**Rules**

- The member's name never appears on the card unless they choose to add it. The bird's name is on by default and can be turned off.
- Photo location data and other hidden details are removed before the image is made.
- No card can be made from a "Just me" journey's content unless the member owns that journey.
- Cards reuse the look of the care app's existing Moments card (`src/lib/momentCard.ts`), adapted to the Flock's colors.

**Out of scope**

- Posting directly to Instagram through its API.
- Video cards.
- Choosing between card designs (one design at launch).

## Badges (1.13a and 1.13b)

Badges reward the habits that make birds' lives better. There are two sets. Flock badges show on member profiles, and care badges are earnable by everyone in the free app. Mockup: `SpecBadges.dc.html`. Each badge has its own icon that represents it (the mockup shows the intended icon for each).

**Flock badges (1.13a)**

- **First steps:** completing your Flock profile and joining your chapter.
- **Journey finisher:** finishing your first journey, with levels at 3 and 10 finished journeys.
- **Trick star:** finishing any tricks journey.
- **Good neighbor:** a Do good post approved, or a chapter listing suggestion approved.
- **Voice of the Flock:** voting in a Do good vote.
- **Challenge champ:** completing a challenge (once challenges exist).
- The existing Founder and Chapter lead badges stay as they are.

**Care badges (1.13b)**

- **Steady scale:** weighing a bird on 4 separate weeks in a row, with levels at 12 and 52 weeks.
- **Daily check-in:** completing the daily health check 7 days in a row, with a level at 30 days.
- **Plan ready:** finishing a bird's full care plan.
- **Sitter ready:** sending a first pet sitter link.

**What members see**

- A small celebration the moment a badge is earned, then the badge on their profile (Flock) or their bird's page (care).
- A Badges screen showing earned badges in color and unearned ones in gray, each with a sentence on how to earn it.
- Members can hide badges from their Flock profile in settings.

**Rules**

- Past activity counts, so long-time users are rewarded for the care they've already done (decided Nov 22). On launch, everyone gets the badges their history has earned, shown once as a single "Here's what you've already earned" celebration instead of a string of separate pop-ups.
- Badges never imply health outcomes. Steady scale rewards weighing, never a weight or a trend.
- Care badges change what free users see, so they ship behind their own off switch, with before-and-after screenshots for Brittany's approval.
- No points, leaderboards, or rankings.

**Out of scope**

- Badges members can give each other.
- Paid or purchasable badges.

**Art**

- Use simple stroke icons in the app's style (as in the mockup) until Brittany supplies final badge art.

## Challenges (1.10)

A challenge is a short, shared goal the Flock works on together, like "7 days of a new foraging idea" or "Get your bird comfortable with the carrier in 2 weeks." Mockup: `SpecChallenges.dc.html`.

**How it works**

- Each challenge is built on a journey template or is standalone (decided Nov 22). A journey challenge starts that journey for the member's bird and counts progress the same way journeys do. A standalone challenge, like a photo-a-day week, has its own short list of daily or step-by-step prompts, and a member finishes by posting an entry for each one.
- A challenge has a title, a short description, a start and end date set by an admin, and an audience (the whole Flock or one chapter).
- Members join from a card on Today and on the Journeys tab while the challenge is open.
- Members post updates as challenge entries: a photo, a short clip, or a few sentences. Entries appear in a challenge feed that other members can react to and comment on.
- When a member finishes, they get a small celebration and, once badges exist, the Challenge champ badge.
- After the end date, the challenge closes, its feed stays readable, and an admin can post a wrap-up.

**What admins do**

- Create and schedule challenges from a screen like the existing Today's ideas scheduler, choosing Journey or Standalone first.
- Pin a favorite entry or feature members' entries in the wrap-up, only with their permission.
- Remove entries through the normal reporting and review flow.

**Rules**

- One active challenge at a time Flock-wide, plus at most one per chapter.
- No winners, prizes, or rankings. Finishing is the goal.
- Challenge entries follow the same visibility and block rules as posts.
- Challenges never involve food restriction, weight goals, or anything health-related.

**Out of scope**

- Member-created challenges.
- Prizes or sponsored challenges.

## Buddy pods (1.11)

A buddy pod is a small group of 3 to 6 members working on the same journey, who cheer each other on. Mockup: `SpecPods.dc.html`.

**How members join**

- When a member starts a journey, they can tick "Pair me with buddies working on this too."
- The app forms pods automatically from people who opted in on the same journey, preferring members in the same chapter when there are enough.
- A pod forms once at least 3 people are waiting. Until then, the member sees "We're finding your buddies," and can leave the waitlist anytime.

**What members see**

- A pod page with the members' names, profile photos, birds, and journey progress.
- A pod feed for short check-ins and photos, visible only to the pod.
- A weekly gentle in-app card asking how the week went. Not a push or email.
- A Leave pod button. Leaving is quiet, and the others see only that the pod has one fewer member.

**What admins do**

- See all pods, move a member to another pod, and dissolve a pod.
- Pods with fewer than 2 active members for 3 weeks are dissolved automatically, and the remaining member is offered a new pod.

**Rules**

- A member can be in up to 2 pods at once.
- Members who have blocked each other are never placed in the same pod.
- Pod posts are private to the pod, and reporting works the same as anywhere in the Flock.
- Pods end when the journey ends, with an option to stay together in a "keep going" pod.

**Out of scope**

- Choosing your own pod members or inviting friends.
- Live chat, video calls, or push notifications for pod activity.

## Flock insights (1.12)

Flock insights show members what's typical across the community, built from everyone's care logs added together. Mockup: `SpecInsights.dc.html`.

**What members see**

- An Insights card in the Flock, refreshed monthly, showing a few patterns by species. For example, how often owners of their species weigh, the most popular foraging ideas tried this month, and how long diet conversion journeys usually take.
- Each insight shows how many birds it's based on.
- Members can filter by species.

**Rules**

- Insights only use totals and averages, never one bird or one person. Any group with fewer than 20 birds is not shown.
- No weight ranges, health statistics, comparisons between birds, or anything a member could read as medical advice. Insights stick to habits and activity: how often, how long, and how many.
- Free users' care logs count toward insights. They can opt out with one switch, "Include my birds in Flock insights," in the care app's account settings under Privacy. The Insights card links to that setting in its footnote, and the privacy policy gets a line explaining it (Brittany supplies the policy text).
- Data is processed inside the app's own database. Nothing is sent to an outside service.
- Because this reads care-app data and adds a setting free users can see, the PR needs Brittany's approval and evidence of exactly what free users see.

**Out of scope**

- Comparing your bird to others.
- Insights for individual chapters at launch.

## Rescue partner codes (1.16)

Partner rescues get a code they hand to new adopters, and each adopter gets six months in the Flock, paid for by Kya's Crew sponsorships. Depends on 1.15 (Kya's Crew). Mockup: `SpecRescueCodes.dc.html`.

**What a rescue gets**

- One reusable code per rescue (for example, BIRDSANDBEAKS), with an optional limit on uses.
- No rescue login at launch.

**What an adopter sees**

- A "Have a rescue code?" link on the Join screen and the redeem page.
- After entering the code, a short form asking for the bird's name, species, and adoption date.
- A message that their adoption is being confirmed, then a welcome message once an admin approves it.
- Their six months start when the free season ends, or right away if it has already ended.

**What admins do**

- Add and edit partner rescues and their codes, and pause a code anytime.
- Approve or decline each redemption from the review screen.
- See how many sponsored seats are available, used, and waiting, drawn from the Kya's Crew sponsorship count.

**Rules**

- One redemption per adopter account.
- If no sponsored seats are available, the adopter still gets in, and the seat counts against future sponsorships. Admins see a warning when the count goes negative.
- A rescue code can't be combined with a founding spot.
- No payment is ever collected through a rescue code.

**Out of scope**

- A rescue dashboard or rescue logins.
- Codes from vet clinics, breeders, or retailers.
