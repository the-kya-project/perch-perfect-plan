# Backlog: the build list

This is the **single ordered build list** for everything before the Flock opens, and the list overnight agents work from. The rules for working it unattended are in CLAUDE.md, "Working the backlog unattended".

> **How the continuous runs work.** An agent session starts every hour on Brittany's Mac, builds the highest item below it's allowed to build, and finishes; only one runs at a time. It merges its own PR only when current users would see nothing different, and holds everything else for Brittany. Every run is recorded in [`docs/agent-log.md`](agent-log.md) (what happened, newest first), and anything for Brittany to read, decide or approve is in [`docs/REVIEW_QUEUE.md`](REVIEW_QUEUE.md). The full rules: CLAUDE.md, "Working the backlog unattended".
>
> UI for the Flock features in [`docs/flock/specs/feature-specs.md`](flock/specs/feature-specs.md) must match the mockups in [`docs/flock/mockups/`](flock/mockups/). Small differences are OK when the real app's components call for them, but list them in the PR and the review queue.

- **There is no opening date.** Brittany opens the Flock when the waitlist is full and everything below is done, and she'll say when. Nothing here, or in code, copy or docs, names an opening date, a code-freeze date, a free-season end or a payments date.
- **Order is priority, then dependencies.** An agent takes the highest item marked **Overnight alone: yes** that has no open PR and whose dependencies are all merged.
- **"Overnight alone"**:
  - **yes**: an agent can build it to a reviewable PR without asking anything partway through. The agent merges it itself only when CLAUDE.md's merge rules all pass (current users see nothing different); otherwise it holds the PR for Brittany. Anything under "Needs Brittany" still needs her explicit approval in that PR.
  - **no**: it needs her before work starts.
  - **after spec**: it waits for her written spec (see "Waiting on Brittany's spec").
- **Sizes:** S = less than one session, M = about one session (one PR), L = two to three, XL = four or more.
- **Health features** always ship behind their own off switch, with every value in the vet-content settings file (item 1.2) marked "draft, pending vet review". Nothing new that tells an owner something about their bird's health reaches real users until an avian vet approves it. The live daily health check, care weight trend, emergency guides and passing guidance are approved by Brittany and stay as they are (Nov 23, 2026).
- **Mark an item done in this file in the same PR that finishes it** (move it to "Done" at the bottom with the PR number).

Where these items came from, with the detail behind each: `docs/flock/opening-scope.md`.

---

## Ready to build

### 1.20 Journeys redesign: skills, not milestones
- **Spec:** [Journeys redesign](flock/journeys-redesign.md) (approved direction, content draft). Build it in the five parts below, in order. Each part is its own branch and PR.
- **Copy and content, every part:** every new or changed string is flagged for Brittany's copy review (listed in the PR and in the review queue's "Copy that merged", before and after), English first and Dutch only after she approves the English. All template text stays `review_status = 'draft'` until she approves it. Nothing in the spec's "Needs avian vet review before opening" list goes live without a vet.
- **Ground rules, every part:** the spec's "Ground rules" and "Edge cases" sections. Database changes are additive only; no production row is deleted or overwritten outside the admin functions the spec names; `journey_template_milestones` and `journey_milestones` stay as history; the 2 production journeys and all their posts, clips, comments and reactions are kept.
- **Size:** XL in all (parts below)
- **Overnight alone:** yes, part by part, as marked.

#### 1.20a Data and migration
- **Done means:** the spec's "Data" and "Existing templates and started journeys" sections are true: template text rewritten as draft through the admin functions (purpose = description, safety_notes = the spec's "Skill content", tips cleared, diet conversion's five safety lines moved into safety_notes), the nullable video reference column, all 14 templates startable by everyone, no milestone rows for new journeys, a finish function taking 'learned' or 'happy_where_we_are' in place of `journey_reach_milestone`'s finish, the custom journey description and source journey columns, the big-moment flag on updates. The 2 existing journeys carry on as ordinary journeys.
- **Size:** L
- **Depends on:** nothing
- **Overnight alone:** yes (built to a held PR)
- **Needs Brittany:** hold the PR. It changes existing journey functions and template rows (Flock safety rule: her explicit approval), and the template text needs her copy review.

#### 1.20b Screens
- **Done means:** the spec's "Screens" 1 to 6 work as written (Journeys tab, Pick a skill, skill page and setup, journey page, Post an update with "This was a big moment" and "Ask the Flock", finished), with the gating moved from starting a skill to the community features, the vet nudge on every caption and question, and the iPhone Duo layout rules followed. Diet conversion's screens are left as they are for 1.20d.
- **Size:** L
- **Journey challenges (Brittany, Nov 24, 2026, on #547):** journey challenges (1.10) stay and move to the new design. A journey challenge shows no milestone progress, and it counts as finished when its journey ends with "learned it" before the challenge's end date. Change the challenge page and the `private.flock_challenge_*` rules from `20261124033000_flock_challenges.sql` along with the journey screens.
- **Depends on:** 1.20a
- **Overnight alone:** yes
- **Needs Brittany:** copy review of every new or changed string. Merge only under the normal rules (hidden behind `journeys_enabled()` and `flock_enabled()`); otherwise hold.

#### 1.20c Member skills
- **Done means:** the spec's "Screens" 7 and 8 and the member-skill edge cases: "Your own skill" with a name (up to 60) and description (about 500), no step rules (`CUSTOM_MIN`, `CUSTOM_MAX` and `customProblem`'s step rules gone), a suggestion when the name matches one of the 14; "Skills from the Flock" with search, the "Member-supplied journey" label everywhere, "Start this skill" and "Started from [bird]'s journey", reporting through `flock_report`, and `flock_blocked` applied everywhere.
- **Size:** M
- **Depends on:** 1.20a, 1.20b
- **Overnight alone:** yes
- **Needs Brittany:** copy review, especially the "Member-supplied journey" line. Merge only under the normal rules; otherwise hold.

#### 1.20d Diet conversion rework
- **Done means:** the spec's diet conversion lines in "Data", "Screens" and "Edge cases": a starting-weight state that doesn't depend on milestone 1 (the first week of daily weigh-ins), the weight rules, the vet reminder ("once the starting weight is set") and `journey_weigh_reminders` reading from it, every number unchanged in `journey_settings`, the lory/lorikeet block kept, the eclectus alert built but hidden until a vet approves it, and the finish as "[Bird] is on the new diet" with no known skill added. It pauses exactly as before.
- **Size:** M
- **Depends on:** 1.20a
- **Overnight alone:** yes (built to a held PR)
- **Needs Brittany:** hold the PR (health content). The diet lines and the eclectus alert go in the review queue and the vet packet.

#### 1.20e Tests and docs
- **Done means:** the spec's "Tests and docs" section: the named checks, tests, fixture and analytics events updated; new checks that a free account can start every skill but never sees community content, that diet conversion pauses exactly as before without milestones, and that a private journey never reaches anyone outside its household; CLAUDE.md's Journeys section rewritten for the new design. Each part above keeps its own tests green; this part closes the gaps and lands the docs.
- **Size:** M
- **Depends on:** 1.20a to 1.20d
- **Overnight alone:** yes
- **Needs Brittany:** merge only, under the normal rules.

---

## Needs Brittany before work starts

### 1.15a Kya's Crew option on the payment screen
- **Done means:** members can choose Kya's Crew on the Membership card step from 1.14a (#533), with its benefits listed, next to Monthly and Yearly. The save-the-card sentence (`saveCardNote`) has its own Crew line. It stays behind `BILLING_ENABLED`, in Stripe test mode.
- **Decided (Brittany, Nov 23, 2026):** Crew is chosen on the payment screen. Crew members pay nothing until the free season ends.
- **Size:** S
- **Depends on:** 1.14a (#533), 1.15 (#535), and Brittany's approved mockup
- **Overnight alone:** no. Don't start until the updated card step mockup is approved.
- **Needs Brittany:** an approved mockup of the card step with Crew and its benefits, then the PR (payments).

### 2.5 The sitter preview never stalls after a release
- **Done means:** the Nov 2 bug can't happen. The sitter preview catches up to a new release before it opens, and recovers a stalled frame. Checked in the iPhone Simulator with the app left open across a release (see the "Sitter preview stale-session test" memory).
- **Size:** M
- **Depends on:** 2.3 (and 2.4 if that's approved)
- **Overnight alone:** no (needs a hands-on Simulator check)
- **Needs Brittany:** the Simulator test with her, and merge.

### 1.13b Badges: care badges free users can earn
- **Spec:** [Badges](flock/specs/feature-specs.md#badges-113a-and-113b) · **Mockup:** [`SpecBadges.dc.html`](flock/mockups/SpecBadges.dc.html)
- **Done means:**
  - Behind its own off switch, care badges are earned in the care app: Steady scale (4, 12 and 52 weeks in a row), Daily check-in (7 and 30 days), Plan ready and Sitter ready.
  - A small celebration, then the badge on the bird's page, and a Badges screen with earned and unearned badges. Free users see no Flock badges or Flock navigation while the Flock is closed to them.
  - Past activity counts, shown once as a single "Here's what you've already earned" celebration.
  - Badges reward the habit, never a weight, trend or health outcome. No points, leaderboards or rankings.
- **Size:** L
- **Depends on:** 1.13a
- **Overnight alone:** no. It changes what free users see, so before-and-after screenshots are required.
- **Needs Brittany:** approval before work starts and of the PR. Any health-related badge rule also goes in the vet packet.

### 1.12 Flock insights
- **Spec:** [Flock insights](flock/specs/feature-specs.md#flock-insights-112) · **Mockup:** [`SpecInsights.dc.html`](flock/mockups/SpecInsights.dc.html)
- **Done means:**
  - A monthly Insights card shows habit patterns by species (how often, how long, how many), each with how many birds it's based on, with a species filter.
  - Totals and averages only, computed inside the app's database. Groups under 20 birds aren't shown. No weight ranges, health statistics, comparisons between birds, or anything that reads as medical advice.
  - Free users' care logs count unless they turn off "Include my birds in Flock insights" under Privacy in account settings. The card's footnote links there, and the privacy policy has a line about it.
  - The mockup's "Share my profile with my chapter" switch isn't in the spec, so it isn't built unless Brittany asks for it.
- **Size:** L
- **Depends on:** the privacy-policy line from Brittany
- **Overnight alone:** no. It reads care-app data and adds a Privacy setting free users can see.
- **Needs Brittany:** approval before work starts, evidence of exactly what free users see, and a decision on whether the mockup's diet conversion duration counts as health information.

### 1.16 Rescue partner codes
- **Spec:** [Rescue partner codes](flock/specs/feature-specs.md#rescue-partner-codes-116) · **Mockup:** [`SpecRescueCodes.dc.html`](flock/mockups/SpecRescueCodes.dc.html)
- **Done means:**
  - Each partner rescue has one reusable code with an optional use limit, and no rescue login.
  - "Have a rescue code?" on the Join screen and redeem page leads to a short form (bird's name, species, adoption date), then a "being confirmed" message and a welcome once an admin approves.
  - An approved adopter gets six months in the Flock, from the end of the free season or right away if it has ended. One redemption per account, never combined with a founding spot, and no payment collected.
  - Admins manage partners and codes, pause a code, approve or decline redemptions, Rescue adopters always get in free. There's no seat count (Brittany, Nov 23, 2026), so leave out the "Sponsored seats" card in the mockup.
- **Size:** L
- **Depends on:** 1.15
- **Overnight alone:** no. It depends on 1.15 Kya's Crew, and it grants access.
- **Needs Brittany:** approval before work starts and of the PR.

---

## Waiting on Brittany's spec

**Agents never start items here early.** Each would wait for a short written spec from Brittany: what a member sees, what an admin does, and what's out of scope. Nothing is waiting right now: the approved specs are in [`docs/flock/specs/feature-specs.md`](flock/specs/feature-specs.md).

---

## Lowest priority (after everything else)

### D2.2 Weather cards
- **Done means:** Home shows a heat or cold card from Apple WeatherKit, by the owner's stored home ZIP (never device location), cached per area, behind its own switch.
- **Size:** M
- **Depends on:** D2.1, a WeatherKit key, a privacy-policy line
- **Overnight alone:** no
- **Needs Brittany:** the WeatherKit key, the privacy line and the copy.

---

## Before billing opens

Billing merged switched off (`BILLING_ENABLED` off, Stripe test mode only). Before it's turned on for anyone:

- [ ] Build the founder release job.
- [ ] Save the test-mode Customer Portal setup in Stripe.
- [ ] Run two test checkouts: one normal, one in the free season's last 49 hours.
- [ ] Have a native speaker read the Dutch.
- [ ] Run two test checkouts during a test free season, one with a "20% off for 3 months" promotion code and one with a "once" code, to see whether Stripe counts the months from when the card is added or from the first charge (1.17, #543).

---

## Last: when Brittany decides to open

The launch PR itself (1.18) is already merged dark. What's left before opening is the items below, then switching it on.

### 1.18 The launch PR (PR C): built, merged dark, switched on at opening
- **Status:** built and merged dark in #493. The switch (`flock_settings.members_open`) is off and opening day isn't set, so only admins can open the Flock. Nothing more to build or merge for it: at opening it's switched on with SQL (step 8 below), after opening day is set and 1.5 is live.
- **What #493 did:** the "Join the Flock" screen with a required "I'm 18 or older" confirmation and the community guidelines, both stored (`flock_agreements`); `flock_enabled()` true for members once the switch is on; the Community button as the entry point; the free-user regression check asserting nothing changes while it's off, plus a switch-on part that checks what a free account sees and that joining gives exactly one free-season membership.
- **The Community button is the only entry point.** No promotional Community invite card on Home or anywhere else for free users: Brittany decided this on Nov 19, 2026, because it feels too salesy. Don't add one back.
- **Size:** L (done)
- **Overnight alone:** no
- **Needs Brittany:** switching it on is the launch decision.

### 1.5 Legal pages
- **Done means:** `/terms` and `/privacy` carry Brittany's approved community, billing and age text (from `docs/legal/drafts/2026-11-flock-legal-update.md`). The post-deletion wording goes live only once 1.3 has.
- **Size:** M
- **Depends on:** the final legal text, 1.3
- **Overnight alone:** no
- **Needs Brittany:** the legal text.

### 1.19 Content loading
- **Done means:**
  - Today's ideas are `ready` for the first two weeks after opening.
  - The 14 journey skills (descriptions and safety notes) are approved.
  - The Library's opening items, the chapter collections' listings and the Start here posts are in.
- **Size:** Brittany's time
- **Depends on:** content approval
- **Overnight alone:** no
- **Needs Brittany:** all of it.

### D1.3 Weight baseline alerts on for everyone
- **Done means:** the vet-approved values are in the settings file and the switch is on for everyone.
- **Size:** S
- **Depends on:** D1.2 (#549), the vet's sign-off
- **Overnight alone:** no
- **Needs Brittany:** the vet's approval and her go-ahead.

---

## When Brittany says we're opening

1. Brittany picks **opening day** and the **free season's end**, and sets the **payments timeline** (when cards are asked for, when billing starts, when the iPhone paywall appears). Then update `docs/flock/payments-plan.md` to match.
2. Fill in both settings on production in one step (Brittany, in the Supabase SQL editor):
   - `select public.admin_set_flock_dates('<opening> America/New_York', '<end> America/New_York');`

   The database refuses an opening day without an end, so the two always go in together. Unstarted founding and gift grants re-date themselves.
3. Check that the founding, gift and redeem pages now say "The Flock is free for everyone until {date}.", that the membership screen shows the end date, and that the founding page's "all 50 claimed" box follows opening day. Emails don't read the settings: check their wording by hand.
4. **Dry run on production** with admin accounts: join → post → journey → report → block → kill switch, on web, iPhone, iPad and Duo.
5. **Name reviewers** for `/admin/review`.
6. **Code freeze:** no merges for the days around opening, apart from fixes Brittany approves.
7. Brittany drafts the opening emails in Brevo and updates the website (Webflow). Nothing is scheduled to send on its own.
8. **Open:** switch on 1.18 with `select public.admin_set_flock_members_open(true);` (opening day from step 2 must be set first; `false` turns it off again and members keep their memberships). Then check the free-user regression check and save-error alerts that morning.
9. Health features without vet approval stay switched off. Everything else opens.

---

## Later (deferred, still applies)

### Push
- **Foreground notifications show nothing on iOS.**
  - Handle `pushNotificationReceived` in `src/lib/pushNative.ts` and show it in-app (a toast or an inbox badge).
  - Needs a native build on both platforms.
- **Android push has never been tested on a real device.** Install from Play internal testing (create a tester list first), enable push, confirm a notification arrives.
- **Duplicate notifications with both the PWA and the store app installed.** Simplest fix: remove the PWA. Only write code if real users hit it.

### Native app
- **Deep links for email links.** The code is built. Still to do, in order:
  1. Android app-signing SHA-256 into `ANDROID_APP_SIGNING_SHA256`.
  2. Associated Domains on the Apple identifier, then regenerate the profiles.
  3. `links.thekyaproject.com` on Vercel.
  4. New store builds.
  5. `EMAIL_CLICK_ORIGIN`.
  6. Turn off Brevo click tracking for transactional sends.
  7. Test in Apple Mail and Gmail.

  (Vercel, Apple and Brevo steps are Brittany's.)
- **`appendUserAgent: 'KyaApp'`** takes effect with the same store build.
- **"Open settings" button when push is denied.** Needs a plugin such as `capacitor-native-settings` and a store build. The UI is ready (`canOpenSettings` in `scans.settings.tsx`).
- **Duo cover screen side column.** The native app needs to report which screen it's on (`useDuoMode()`), and it needs a native build. Approved design: the "Proposed: Home folded (cover screen)" artboard.
- **Sign in with Apple, overlapping requests.**
  - Extend `patches/@capgo+capacitor-social-login+<version>.patch`, so the Apple provider keeps a handler per request.
  - Test on a real iPhone.
  - Needs a native build.

### iPhone Duo: half-folded ideas (not now)
- **Weigh station:** with the phone half-folded, the bird's photo shows on top and a number pad on the bottom, weighing the whole flock hands-free.
- **Tripod mode:** filming hands-free. Needs native camera work and a store build.

### Security / infrastructure
- **CSP is still report-only.** Read the `[csp-report]` lines in Vercel runtime logs, add any hosts that are really needed, then switch to enforcing. Never flip it blind.

### Product
- **1.10a Short clips as challenge entries.** Decided (Brittany, Nov 24, 2026, on #547): not now. Challenge entries are a few sentences plus up to four photos. Clips would need clip support on Flock posts first (Cloudflare Stream uploads, the clip limits, playback and the "never the player's own error" handling, as journey clips have). Not to be built until she asks for it; then it needs her before work starts.
- **1.9 Pre-approval for more spaces.** Decided (Brittany, Nov 22, 2026): pre-approval stays on Do good only, as it works today. No other space waits for review, and nothing here is to be built unless she reopens it.
- **iPad landscape polish:**
  - the weight log card stretches too wide;
  - there's empty space beside the Home list;
  - the side column has a long empty middle on tall screens;
  - text stays phone-sized.

  Done when the `screens:duo` pages look intentional at both iPad sizes.
- **The vet summary PDF export was never merged.** `window.print()` does nothing inside the native apps, so the button is hidden there. A working react-pdf version is commit `43fd077`, inside the deleted branch `today-wip-backup`. To bring the branch back, use its last commit in `docs/branch-cleanup-2026-11-20.md`: `git push origin 638ac057448b3ba0901ec8ee00d7a59e4ea526e3:refs/heads/today-wip-backup`.
- **The onboarding quickstart is shelved.** Finished work is parked on `origin/redesign/onboarding-quickstart`. Don't resume it without asking.
- **Dead session on an open screen.** When the session dies on an open screen, the dashboard empties its bird cards but stays put. Send the reader to `/auth` with the path kept.

### Release / store
- **Android still shows "Kya" on the launcher.** The fix is committed in `strings.xml` and rides along with the next Android build. Bump `versionName` to match iOS then.
- **App Store Connect rejection emails go somewhere unread.** Point App Review notifications at a mailbox that's read (Brittany, in App Store Connect).

### Housekeeping
- **Run `test:no-home-screen` in CI** once QA credentials can be stored as a secret.
- **`appstore-screenshots/` is untracked.** Decide: commit, Git LFS, or keep out. It's left undecided on purpose.
- **`_to_delete/` holds one 0-byte stray file.** Delete the folder.

---

## Dropped (do not build)

- **D5.1 Weekly recap by push** (dropped by Brittany, Nov 23, 2026; PR #524 closed without merging). Push notifications are only for things the owner needs to act on, and a recap only reports what happened. The existing 10- and 30-day check-in nudges stay exactly as they are.

---

## Done

- **1.11** Buddy pods: starting a template journey offers "Pair me with buddies working on this too"; the journey waits ("We're finding your buddies", Leave the waitlist) and is placed at once into an open pod on the same journey with room, own chapter first, or a new pod forms once 3 compatible members wait (from the chapter when 3 there are). Members who've blocked each other are never placed together; up to 2 pods at once, waitlist places and "keep going" groups included. The pod page shows names, photos, shown birds and progress (never from a "Just me" journey outside the household), the weekly in-app "How did … go?" check-in, the pod's own feed (Flock posts in the `pod` space, so reactions, comments, reports, blocks and photos work as for posts, never on Today) and a quiet Leave pod. "You finished!" and "Keep going together?" (7 days; 2+ yeses → a general buddy group). The hourly `flock-pods-hourly` job closes finished pods, settles the question, dissolves pods with fewer than 2 active members over 3 weeks (unfinished members are offered a new pod) and places waiters. Admins: `/admin/pods` (from "Manage pods" on Flock settings → Buddy pods): the waitlist, every pod, Move and Dissolve (`20261124070000_flock_buddy_pods.sql`, `src/lib/flockPods.ts`). Pinned by `supabase/checks/flock_pods_checks.sql`, `npm run test:flock-shell` and `e2e/flock.shell.ts`. Held for Brittany (unmocked screens, and the migration changes Flock post functions): #548.
- **1.17** Promotion codes: the subscription Checkout offers Stripe's code field for the regular Flock plans and Kya's Crew, never the founding price (`promotionCodesAllowed`), and the billing webhook takes off any discount that reaches a founding subscription another way (`discountsToRemove`). A code stacks with a trial (the trial first, then the code on the paid invoices). Worked examples and the Apple offer codes for the iPhone paywall are in `docs/flock/payments-plan.md` section d. Brittany approved it (Nov 24, 2026): the worked examples match what she meant, and the webhook may remove discounts from founding memberships. Switched off with `BILLING_ENABLED`, test mode only, nothing in the Stripe Dashboard touched; pinned by `npm run test:billing`. The test checkout that shows how Stripe counts a code's months is under "Before billing opens": #543.
- **1.14a** Card step and checkout design, switched off with billing (`BILLING_ENABLED` off, web only, never in the iPhone or Android app): the screens from the nine approved mockups in [`docs/flock/mockups/billing/`](flock/mockups/billing/), namely the card step during and after the free season (member and founder), branded Stripe Checkout with the "You won't be charged until" line, the confirming screen, "You're all set" for members and founders, Membership with plan, first charge date and the card's last four, and the past-due alert that opens the Customer Portal; English and Dutch. Giving is only ever shown as "20%". Brittany approved the screens and the Dutch (Nov 24, 2026); what's left before billing opens is under "Before billing opens": #533.
- **1.10** Challenges: admins write a Journey or Standalone challenge (title, description, a journey template or a list of prompts, start and end days, the whole Flock or one chapter) at `/admin/challenges`; one at a time per audience, and no food or diet templates. An open one is a card on Today and Journeys; members join with a bird and choose whether their entries may be featured. Entries (a few sentences and up to four photos) are Flock posts in their challenge's own feed, under the post rules for visibility, blocks, reactions, comments and reports. Finishing (every prompt, or the journey finished by the end day) shows "You finished!" and awards Challenge champ. After the end day the feed stays readable; admins pin an entry and write a wrap-up featuring entries only with permission. No winners, prizes or rankings (`20261124033000_flock_challenges.sql`, `src/lib/flockChallenges.ts`). Brittany's decisions (Nov 24, 2026): the unmocked screens and the copy approved as built; no clips for now (1.10a, under "Later"); an entry needs a few words even with a photo; journey challenges stay (noted in 1.20b): #547.
- **D1.2** The weight baseline on the weight page, behind the `weight_baseline` health switch (off; set it to `admins` for Brittany's account): the usual range for the latest weigh-in's kind or "still learning", a one-time "We've learned [Bird]'s usual weight" card, and one alert card at most (sudden drop confirmed, weight has shifted, hard loss, weigh again, keep an eye on this, worth watching), all observational, with no "call your vet". Brittany's Nov 23 decisions are in `WEIGHT_BASELINE_RULES` (draft): personal levels from each bird's wobble with their limits, 10-day re-weighs, the 14-day "keep an eye" window, the sudden drop (10%, 7% under 100 g, at least 2 g, confirmed within 3 days). The owner's optional ideal weight range (`bird_ideal_weights`, its own field on the weight page, never shown to sitters) only quiets the two lower alerts and their "weigh again". The hourly job `weight-baseline-shadow-hourly` logs what the baseline would have said about every weigh-in, for every bird, with and without the ideal range, to `weight_baseline_shadow` (service role only), after the fact so it never blocks a weigh-in (`20261124110000_weight_baseline_shadow.sql`, `src/lib/weightBaselineShadow.ts`). Pinned by `npm run test:weight-baseline`, `npm run test:health-rules` and `supabase/checks/weight_baseline_shadow_checks.sql`. Held for Brittany (health wording, the vet packet, a production migration and cron job): #549.
- **1.15** Kya's Crew, switched off with billing and test mode only: plans `crew_monthly` / `crew_annual` (the `entitlements` plan check widened), prices from Stripe (`STRIPE_PRICE_CREW_MONTHLY` / `_YEARLY`), counted by `is_flock_member()`, 25% giving recorded on the row (`entitlements.giving_rate`, 20% for other paid rows), and no trial (`20261123203000_kyas_crew.sql`, `supabase/checks/crew_checks.sql`, `npm run test:billing`). No card step offers Crew yet (1.15a). Brittany's decisions (Nov 23, 2026): Crew pays nothing until the free season ends, like every member; sponsored seats aren't tracked at all, because that's marketing language, and rescue adopters always get in free. Held for Brittany (payments, the plan check): #535.
- **1.13a** Flock badges: First steps, Journey finisher (1, 3 and 10), Trick star, Good neighbor, Voice of the Flock and Challenge champ (shown, not yet awarded: 1.10 adds its rule to `private.flock_badge_levels`). `flock_my_badges` works out and records what a member has earned when they open the Flock; the first time, their history is recorded together and Today shows one "Here's what you've already earned" (two or more), then a "Badge earned" card for each new badge or level. The Badges screen (`/flock/you/badges`, from Flock settings) shows earned ones in color and the rest in gray with how to earn each. Profiles show them as pills beside Founder and Chapter lead through `flock_member_badges`, which counts only community journeys and leaves everything out when hidden ("Show my badges on my profile." on Edit profile) or blocked either way. No points or rankings; the mockup's stroke icons until final art (`20261124013000_flock_badges.sql`, `src/lib/flockBadges.ts`). Pinned by `supabase/checks/flock_badges_checks.sql`, `npm run test:flock-shell` and `e2e/flock.shell.ts`: #546.
- **1.7** "Make a share card" on a big moment (built on a reached milestone's celebration; 1.20 moves it to the "This was a big moment" update), a finished journey (its page) and Day one vs. now opens `/flock/journeys/<id>/card`: a post (1080×1350) or story (1080×1920) PNG in the Flock's forest and lime with the bird's photo (two clip stills for Day one vs. now), the bird's name (on, can be turned off), the journey, the milestone or "Finished!", the date, the member's name only if added, and "Kya & Co. · thekyaproject.com". Share opens the share sheet, or downloads on the web. Photos are redrawn into a fresh PNG, so no metadata. Only the bird's household can make one (`canMakeJourneyCard`, and `getJourneyCardPhotos` checks `is_mine`). Reuses the Moments card's canvas and share code (`src/lib/journeyCard.ts`, `src/lib/momentCard.ts`). Pinned by `npm run test:flock-shell` and `e2e/flock.shell.ts`: #544.
- **1.4** The daily `flock-purge` hook first runs `flock_moderation_purge` (`20261123193000_flock_removed_purge.sql`, service role only): posts and comments a reviewer removed 180+ days ago move, with the comments under them, into 1.3's `flock_deleted_items` already due, so the same run deletes them and their photos; reports closed 180+ days ago are deleted. Removed journey updates stay as they are and are not deleted after 180 days (Brittany, Nov 23, 2026). Pinned in `supabase/checks/flock_moderation_checks.sql` and `npm run test:flock-purge`. Approved and merged by Brittany (Nov 23, 2026): #534.
- **2.4** Every update reload (the version check's and the service worker's alike) first expires Vercel's Skew Protection pin (`__vdpl`) with a POST to the new `/api/public/unpin`, waiting at most 3 seconds, then reloads, so the reloaded page gets the new build's files; Skew Protection stays on and no Vercel setting changed (option B). Pinned by `npm run test:release-check`: #531 (held for Brittany's merge; 2.5's Simulator check covers it hands-on).
- **1.14** Billing foundation, switched off (`BILLING_ENABLED` must be exactly `true`) and Stripe test mode only, enforced in code: `billing_customers`, `billing_events`, `entitlements.product_id` / `will_renew` / `cancel_at_period_end`, `founding_claims.released_at` / `forfeited_at`, and the service-role functions the webhook writes through (`20261123180000_billing_foundation.sql`, `supabase/checks/billing_checks.sql`); the webhook `/api/public/stripe/billing` (`STRIPE_BILLING_WEBHOOK_SECRET`, re-reads each subscription, idempotent on the event id); the card step on Membership (`/flock/you/membership`, $0 until the free season's end, founders get $15, never in the native app); `npm run test:billing`. Held for Brittany (payments): #525. Approved and merged by Brittany (Nov 23, 2026), PR #525.
- **1.8** Do good voting and the founding vote: an open vote is a card on Today and at the top of Do good (founders-only ones only for founders, with a Founders pill). Members vote once, and it's final (enforced in the database), seeing only how many have voted. The vote shares the donation: every choice gets a guaranteed 10%, the rest is split by share of the votes, always totalling 100%, evenly if no one votes, and results always show. Founders-only votes (Q&As, chapters) have no donation and show plain percentages and the top choice. Admins write drafts (question, description, 2–8 choices with a logo or photo, audience, close date), open, close early, extend, announce and see counts at any time at `/admin/votes`; nobody can see how a member voted. Matches Brittany's approved mockups in `docs/flock/mockups/voting/`. Behind the Flock gate; nothing seeded (the first votes are Brittany's content): #529.
- **1.3** Deleting a post or comment moves it, with the comments under it, into `flock_deleted_items`, so it's hidden from everyone at once, the author included. The daily job `flock-deleted-purge-daily` (`/api/public/hooks/flock-purge`) deletes it and its photos for good 180 days later. Deleting an account removes its held items at once. Pinned in `supabase/checks/flock_posts_checks.sql` and `npm run test:flock-purge`. Approved and merged by Brittany (Nov 23, 2026): #522.
- **D2.1** Home shows the day's card from the seasonal calendar (D3) under the Today list: the reader's own date, read after the page loads; their language; US or Dutch holidays from the account's home time zone. Behind its own switch, `today_cards` in `public.care_features` (off / admins / everyone). Redesigned Nov 23 with illustrations, tints, labels, an end date and a per-account "Got it" (`public.today_card_dismissals`). Pinned by `npm run test:today-card`, `supabase/checks/care_features_checks.sql` and `supabase/checks/today_card_dismissals_checks.sql`. Approved and merged by Brittany: #523. Switched on for everyone on Nov 23, 2026: for admins at 12:08 PM Eastern, where Brittany checked the card on her own account, then for everyone at 12:09 PM Eastern. Brittany decided to skip the before-and-after Home screenshots this item called for before going to everyone.
- **2.3** Every open production page (not a frame) asks `/api/public/version` which build is live, on launch, hourly and on each return to the foreground (including the native app's `resume`), through a hidden frame so Skew Protection's pin can't hide a release; a newer build reloads quietly at a safe moment or waits behind "A new version is ready", once per build: #520 (approved and merged by Brittany, Nov 23, 2026).
- **D1.1** `computeWeightBaseline` (`src/lib/weightBaseline.ts`): each bird's normal by meal state (the median of the last 90 days' weigh-ins of that kind, leaving out the last week; range 10th–90th percentile), "still learning" until 7 weigh-ins over 14 days, the three tiers and the free hard weight-loss alert (which also works while still learning), never on one weigh-in (a re-weigh must agree) and never under 2 g. Every number is in `WEIGHT_BASELINE_RULES`, draft. The replay (`npm run weight-baseline:replay -- <export>`, export query `docs/reports/weight-history-export.sql`) counts how often each tier would have fired per bird. Pinned by `npm run test:weight-baseline`. Nothing in the app calls it yet (D1.2). Held for Brittany (health content, and the replay of real history, which she runs): #521.
- **1.6** Chapter collections: the Resources tab lists Avian vets, Rescues, and Shops and services as directory cards (tappable phone and website, the "community picks, not endorsements" line, an invitation in empty groups); members suggest a place, which shows to nobody but the chapter's lead and admins until approved in `/admin/review` → Places; leads (own chapter) and admins (any chapter) add, edit, reorder and remove listings at `/flock/places`, with when each was last updated. Behind the Flock gate; nothing seeded (the starter listings are Brittany's content): #528.
- **2.2** `/api/public/version` returns `{ "build": "<commit>" }` with `no-store`; `src/lib/releaseCheck.ts` holds the pure rules (which pages check, when, what counts as a newer build, update now or later behind the banner, one reload per build), pinned by `npm run test:release-check`. Nothing calls them yet (2.3): #519.
- **D3** `src/lib/seasonalCalendar.ts`: 22 dated cards covering every day of the year (7 seasons, 15 holidays and moments, including heat, cold, fireworks, candles, holiday foods and travel; some US-only or Netherlands-only), each with a rule for its days and an English and Dutch title and body in `src/locales/seasonal.*.jsonc`; `npm run test:seasonal-calendar` checks every rule resolves in every year through 2075, every day has a card, and every card exists in both languages. Approved and merged by Brittany: #516.
- **1.2** `src/lib/healthRules.ts` lists every health threshold and phrase list, each "draft, pending vet review" with its source, plus the language keys for each area's wording; `npm run test:health-rules` checks the code against it and `supabase/checks/health_rules_checks.sql` checks the database; every health feature has its own switch in `public.health_features` (the live ones start at everyone and aren't wired to it yet); the vet packet (opening-scope B7) points at the file: #515.
- **2.1** The startup guard is the first script in every app page's `<head>` (added by the server entry, right after the charset) and keeps a list of the page's code files for the error screen. The missing-file reset runs 30 times on WebKit in CI: #514 (approved and merged by Brittany).
- **2.4a** `docs/skew-protection.md`: what Vercel's Skew Protection does, the four options and what each means for current users and for 2.4 and 2.5: #509.
- **0.5** The review queue is reached from Flock settings (reviewers only, with the waiting count), and every item shows its author, space and date: #508.
- **0.4** Sign-ups that start on the /get or /get-app desktop page are credited to the link that brought them: #505.
- **0.3** The translation check passes and runs in the iPhone hydration job; the 85 Library phrases are in the English catalog, the 2 stale keys are gone, and the Dutch gaps on the clip recorder, gift, gift thank-you and redeem pages are filled: #500 (Brittany approved the Dutch, Nov 22, 2026). The Flock's missing Dutch keys still wait for her decision on a Dutch Flock.
- **P1** The stored free-season end is cleared, and opening day can't be set without it (`admin_set_flock_dates`): #497.
- **P2** The founding, gift and redeem pages read opening day and the free season's end (`getFlockPublicDates`): #497.
- **P3** The founding page's "all 50 claimed" box follows opening day: #497.
- **P4** Gift emails can be scheduled any day from today through 90 days ahead: #496.
- **0.1** #377 (diet type labels): already done on main by #378, Oct 21. #377 itself duplicates it and breaks the build. Close it (Brittany).
- **0.2** #490's migration given its own version (`20261121150000`) and merged (Nov 21).
- **1.1** #493: the contact line ("Questions or a problem? Email the Kya team at brittany@thekyaproject.com.") in Flock settings and at the bottom of the community guidelines.
- **1.18** #493: built and merged dark; switched on at opening (see 1.18 above).
- The dead `kya://` URL scheme was removed from `ios/App/App/Info.plist` (#331).
- The weight-range item ("Each bird's normal weight range…") became D1.1–D1.3 above.
