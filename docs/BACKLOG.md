# Backlog: the build list

This is the **single ordered build list** for everything before the Flock opens, and the list overnight agents work from. The rules for working it unattended are in CLAUDE.md, "Working the backlog unattended".

- **There is no opening date.** Brittany opens the Flock when the waitlist is full and everything below is done, and she'll say when. Nothing here, or in code, copy or docs, names an opening date, a code-freeze date, a free-season end or a payments date.
- **Order is priority, then dependencies.** An agent takes the highest item marked **Overnight alone: yes** that has no open PR and whose dependencies are all merged.
- **"Overnight alone"**:
  - **yes**: an agent can build it to a reviewable PR without asking anything partway through. Brittany still reviews and merges every PR, and anything under "Needs Brittany" still needs her explicit approval in that PR.
  - **no**: it needs her before work starts.
  - **after spec**: it waits for her written spec (see "Waiting on Brittany's spec").
- **Sizes:** S = less than one session, M = about one session (one PR), L = two to three, XL = four or more.
- **Health features** always ship behind their own off switch, with every value in the vet-content settings file (item 1.2) marked "draft, pending vet review". Nothing that tells an owner something about their bird's health reaches real users until an avian vet approves it.
- **Mark an item done in this file in the same PR that finishes it** (move it to "Done" at the bottom with the PR number).

Where these items came from, with the detail behind each: `docs/flock/opening-scope.md`.

---

## Ready to build

### 0.3 Translation check passes and stays passing
- **Done means:** `npm run i18n:check` passes on main and runs in the iPhone hydration job, so the catalog can't drift again. The 85 missing English phrases (all from the Library build: 22 `flock.library.*`, 63 `flock.libraryAdmin.*`) are added, the 2 stale keys dropped, and the Dutch gaps free users see today are filled (`clipRecorder`, `gift`, `giftThanks`, `redeem`).
- **Size:** M
- **Depends on:** nothing
- **Overnight alone:** yes
- **Needs Brittany:** a read of the new Dutch lines before merge. The Flock's 846 missing Dutch keys wait for her decision on a Dutch Flock.

### 0.4 Credit /get-page sign-ups to the link that brought them
- **Done means:** someone who scans the postcard or taps a campaign link, lands on /get and later signs up on the web is credited to that link, not "direct". Built from `origin/claude/busy-mccarthy-qntx5t` (one commit, `d974e8e`, still applies cleanly) on a new branch, with `npm run test:get-app` passing, and a note confirming /get is served from app.thekyaproject.com (the credit only carries within one site).
- **Size:** S
- **Depends on:** nothing
- **Overnight alone:** yes
- **Needs Brittany:** merge only.

### 2.1 The startup guard listens before anything can fail
- **Done means:** the page reset for a missing code file works on WebKit 30 times out of 30 in CI.
  - The startup guard script is the first thing in the page's `<head>`, before the code preloads and the inlined styles.
  - It keeps a list of the page's code files, so the error screen can tell a missing file from a real error.
  - A test checks the order in the served HTML.
  - Rebuilt from closed PR #431 (reference branch `fix/native-release-catchup`). The likely cause of its flaky test is in `docs/flock/opening-scope.md` B5.
- **Size:** M
- **Depends on:** nothing
- **Overnight alone:** yes
- **Needs Brittany:** merge only. It touches the app shell (`__root.tsx`), so the PR shows the free-user regression check and before-and-after screenshots.

### 1.1 A contact line inside the Flock
- **Done means:** every Flock screen has a published way to contact us, which Apple's guideline 1.2 requires for apps with member posts. For example, a "Contact us" row in Flock settings and a line in the community guidelines, using `SUPPORT_EMAIL` (`src/lib/support.ts`).
- **Size:** S
- **Depends on:** nothing
- **Overnight alone:** yes
- **Needs Brittany:** the wording (before-and-after in the PR).

### 1.2 Vet-content settings file and a switch for every health feature
- **Done means:**
  - **One labeled file** (e.g. `src/lib/healthRules.ts`) lists every health threshold, phrase list and safety wording: the diet weight rules, the vet-nudge phrases, the health-check triage rules, the weight-trend levels, the emergency guidance numbers, and the weight baseline values for D1. Each value is marked "draft, pending vet review" with its research source.
  - **Values in the database must match the file.** Where a value lives in a database settings table (`journey_settings`, `flock_vet_signs`), a check fails if the table and the file disagree.
  - **Every health feature has its own off switch** (off / admins / everyone), so a feature without vet approval stays hidden while everything else works.
  - The vet review packet (`docs/flock/opening-scope.md` B7) points at this file.
- **Size:** L
- **Depends on:** nothing
- **Overnight alone:** yes
- **Needs Brittany:** approval of the health content and of any new switch table (a database change).

### 2.2 A version endpoint and release rules
- **Done means:** `/api/public/version` returns the build id, uncached, and the pure rules for "a new release is out, update now or later" live in `src/lib/releaseCheck.ts` with tests. Nothing behaves differently yet.
- **Size:** M
- **Depends on:** 2.1
- **Overnight alone:** yes
- **Needs Brittany:** merge only.

### 2.3 Open pages notice a new release
- **Done means:** an open app or web page checks for a new release on launch, hourly and when it comes back to the foreground, and updates safely: a quiet reload with no form in progress, otherwise the existing "A new version is ready" banner.
- **Size:** M
- **Depends on:** 2.2
- **Overnight alone:** yes
- **Needs Brittany:** merge, and a check in the iPhone Simulator with the app left open across a preview release.

### D3 Seasonal calendar file
- **Done means:** a reviewed file of dated cards for the whole year (seasons and holidays, including heat, cold, fireworks, candles, holiday foods and travel), each with English and Dutch copy and a rule for which day it shows, plus a test that every date resolves and every card exists in both languages. Not vet-reviewed content: plain care reminders only, never health advice.
- **Size:** S
- **Depends on:** nothing
- **Overnight alone:** yes
- **Needs Brittany:** the card copy (before-and-after in the PR).

### D1.1 Weight baseline rules and a replay of real history
- **Done means:**
  - A pure function works out each bird's own normal weight by meal state (before a meal, after a meal, or not labeled). It shows "still learning" until there are at least 7 weigh-ins over at least 14 days, and returns the alert tier: "worth watching", "keep an eye on this" or "call your vet today".
  - It also covers the free hard weight-loss safety alert. Every number comes from the settings file (1.2), marked draft, using the most conservative research values (`docs/flock/opening-scope.md` B4).
  - A replay script runs the function over an exported copy of real weight history and reports how often each tier would have fired, per bird.
- **Size:** M
- **Depends on:** 1.2
- **Overnight alone:** yes (the export of real history is a one-time read-only query Brittany runs or approves)
- **Needs Brittany:** health content; the replay results before D1.2.

### 1.3 Deleted posts stay hidden for 180 days, then are purged
- **Done means:** deleting a post or comment hides it, and its comments, from everyone at once, the author included. A daily database job permanently deletes it and its photos 180 days later. Deleting a whole account stays immediate. Pinned in `supabase/checks/flock_posts_checks.sql` (legal draft D10).
- **Size:** M
- **Depends on:** nothing
- **Overnight alone:** yes
- **Needs Brittany:** approval of the deletion job (it deletes data) and of the change to the existing delete functions.

### 1.4 Removed content and closed reports are deleted after 180 days
- **Done means:** the same daily job deletes reviewer-removed content and closed reports 180 days after they were resolved. Pinned in `supabase/checks/flock_moderation_checks.sql` (legal draft D9).
- **Size:** S
- **Depends on:** 1.3
- **Overnight alone:** yes
- **Needs Brittany:** approval of the deletion (it deletes data).

### D2.1 Seasonal and holiday Today cards on Home
- **Done means:** Home shows the day's card from the calendar file (D3), keyed on the owner's own local date and in their language, behind its own switch, which starts off and then goes to Brittany's account only. It never calls the Flock's Today's idea. It passes the iPhone hydration check: the date is read after the page loads.
- **Size:** M
- **Depends on:** D3
- **Overnight alone:** yes
- **Needs Brittany:** the copy; turning the switch on for everyone changes Home for free users, so that needs her approval and before-and-after screenshots.

### D5.1 Weekly recap by push, replacing the 10- and 30-day lapse nudges
- **Done means:** a weekly push recap (weigh-ins, health checks, journal entries, no health judgments) replaces the `checkin_reminder` branch of `src/routes/api/public/hooks/engagement-nudges.ts`. It keeps the existing toggles, cooldown and dry-run mode, and is built behind a switch that starts off. Push only, no email.
- **Size:** M
- **Depends on:** nothing
- **Overnight alone:** yes (built and merged switched off)
- **Needs Brittany:** the wording, and her approval before it's switched on, since that sends push to real users.

---

## Needs Brittany before work starts

### 2.4 Open pages fetch the new build's files after a release
- **Done means:** after a release, an open page's next request reaches the new build, not the old one Vercel's Skew Protection pinned it to, so the sitter preview can't load a page whose code files are missing.
- **Size:** M
- **Depends on:** 2.3, and Brittany's decision on Vercel's Skew Protection setting
- **Overnight alone:** no
- **Needs Brittany:** the Skew Protection decision. Any change to Vercel settings is hers.

### 2.5 The sitter preview never stalls after a release
- **Done means:** the Nov 2 bug can't happen. The sitter preview catches up to a new release before it opens, and recovers a stalled frame. Checked in the iPhone Simulator with the app left open across a release (see the "Sitter preview stale-session test" memory).
- **Size:** M
- **Depends on:** 2.3 (and 2.4 if that's approved)
- **Overnight alone:** no (needs a hands-on Simulator check)
- **Needs Brittany:** the Simulator test with her, and merge.

### D1.2 Weight baseline on the weight page, in shadow mode
- **Done means:** the weight page shows the range and "still learning", a small celebration when the baseline is learned, and the alert cards. Everything is behind its own switch, on for Brittany's account only. Would-be alerts for every bird are logged to a table nobody else sees, so they can be checked against what actually happened.
- **Size:** L
- **Depends on:** D1.1
- **Overnight alone:** no (adds a care-app table for the shadow log)
- **Needs Brittany:** approval of the care-app database change, and of the health wording.

### 1.14 Billing foundation (switched off)
- **Done means:** the billing tables (`billing_customers`, `billing_events`, the new `entitlements` columns), the Stripe billing webhook (`/api/public/stripe/billing`, its own secret, fixture tests in `npm run test:billing`) and the card step (`/flock/membership`, $0 due, never shown in the native app) all exist behind `BILLING_ENABLED`, which stays off. Test mode only. Spec: `docs/flock/payments-plan.md` sections c and d, items 1–3.
- **Size:** XL
- **Depends on:** nothing
- **Overnight alone:** no
- **Needs Brittany:** approval to start (payments), and approval of the `entitlements` change in the PR. Nothing in the Stripe Dashboard is touched.

### 1.15 Kya's Crew and its sponsored rescue-adopter seat (switched off)
- **Done means:**
  - Crew plans exist: $37 a month billed annually ($444 a year) or $45 month to month.
  - They count as a Flock membership and record 25% giving.
  - Each Crew member sponsors six months for a new rescue adopter, tracked in a sponsorship count, with an admin view of seats sponsored and used.
  - No trial.
  - Nothing is on sale until billing starts. Spec: `docs/flock/payments-plan.md` item 6d.
- **Size:** L
- **Depends on:** 1.14
- **Overnight alone:** no
- **Needs Brittany:** payments, and the `entitlements` plan change.

### 1.17 Promo codes for memberships
- **Done means:** promotion codes work on the card step, with rules for founding vs regular prices. The Apple offer codes iPhone needs (whole months only) are listed for when the iPhone paywall is built.
- **Size:** M
- **Depends on:** 1.14
- **Overnight alone:** no
- **Needs Brittany:** payments, and the rules for which codes apply to which plans.

### 1.9 Pre-approval for more spaces (only if wanted)
- **Done means:** posts in the spaces Brittany picks wait for review before other members see them, the way Do good posts already do.
- **Size:** S
- **Depends on:** her decision: Do good only (as today), or more spaces
- **Overnight alone:** no
- **Needs Brittany:** the decision, and approval of the change to an existing Flock function.

---

## Waiting on Brittany's spec

**Agents never start these early.** Each waits for a short written spec from Brittany: what a member sees, what an admin does, and what's out of scope. Listed in the order they're most useful to write: the first ones unblock the most visible work, and rescue partner codes come last because they can't be built until Kya's Crew (1.15) exists.

### 1.6 Curated chapter collections
- **Done means:** each chapter's Resources tab lists recommended avian vets, rescues and shops as simple cards that don't look like posts (name, area, phone, link, a short note). Chapter leads and admins add and edit them.
- **Size:** L
- **Depends on:** spec
- **Overnight alone:** after spec
- **Needs Brittany:** the spec, and the opening listings (content).

### 1.8 Do good voting (and the founding vote)
- **Done means:**
  - Members vote on Do good items.
  - Founders vote on the first expert Q&As and the first chapters, which the founding page promises (`founding.tsx`).
  - Admins open, close and announce each vote.
  - Results show only above a minimum count.
- **Size:** L
- **Depends on:** spec
- **Overnight alone:** after spec
- **Needs Brittany:** the spec and the copy.

### 1.7 Instagram share cards for journeys
- **Done means:** a member can share a milestone, a finished journey or a day-one-vs-now card, sized for posts and stories, with photo metadata removed. Never anything from a "Just me" journey outside its household. Reuses the care app's Moments card (`src/lib/momentCard.ts`).
- **Size:** L
- **Depends on:** spec and card design
- **Overnight alone:** after spec
- **Needs Brittany:** the design.

### 1.13a Badges: the Flock set
- **Done means:** badge definitions and earned badges, awarded for Flock activity and shown on profiles, alongside the existing founder and Chapter lead badges.
- **Size:** L
- **Depends on:** spec and badge art
- **Overnight alone:** after spec
- **Needs Brittany:** the spec, art and copy.

### 1.13b Badges: care badges free users can earn
- **Done means:** free users earn care badges in the care app (for example weigh-in streaks, regular health checks, a finished care plan), behind a switch that starts off.
- **Size:** L
- **Depends on:** 1.13a
- **Overnight alone:** after spec
- **Needs Brittany:** approval. It changes the free-user experience, so the PR needs before-and-after screenshots. Any health-related badge rule also goes in the vet packet.

### 1.10 Challenges
- **Done means:** admins schedule a challenge (Flock-wide or one chapter). Members enter with a post or clip, and the challenge shows on Today and Journeys, following the existing visibility and block rules.
- **Size:** XL
- **Depends on:** spec
- **Overnight alone:** after spec
- **Needs Brittany:** the spec and the first challenges (content).

### 1.11 Buddy pods
- **Done means:** members can join a pod of 3–6 (by chapter or journey), with its own check-ins. Admins form, move and dissolve pods. Blocks are respected.
- **Size:** XL
- **Depends on:** spec
- **Overnight alone:** after spec
- **Needs Brittany:** the spec.

### 1.12 Flock insights
- **Done means:** members see species-level care patterns built only from totals (a minimum count, never one bird), and free users can opt out of their care logs counting. Covered by a privacy-policy line.
- **Size:** L
- **Depends on:** spec, and the privacy-policy line
- **Overnight alone:** after spec
- **Needs Brittany:** the spec, the opt-out wording, and approval. It reads care-app data for a members-only feature.

### 1.16 Rescue partner codes
- **Done means:** a partner rescue gets a code. An adopter redeems it (on Join or a redeem page), the adoption details go to Brittany for approval, and an approved adopter gets six months in the Flock, starting when the free season ends, drawn from the Crew sponsorship count. Admin screens cover partners and codes.
- **Size:** L
- **Depends on:** 1.15, spec
- **Overnight alone:** after spec
- **Needs Brittany:** the spec. It grants access, so approval is needed in the PR.

---

## Lowest priority (after everything else)

### D2.2 Weather cards
- **Done means:** Home shows a heat or cold card from Apple WeatherKit, by the owner's stored home ZIP (never device location), cached per area, behind its own switch.
- **Size:** M
- **Depends on:** D2.1, a WeatherKit key, a privacy-policy line
- **Overnight alone:** no
- **Needs Brittany:** the WeatherKit key, the privacy line and the copy.

---

## Last: when Brittany decides to open

### 1.18 The launch PR (PR C)
- **Done means:**
  - A "Join the Flock" screen, with a required "I'm 18 or older" confirmation and acceptance of the community guidelines, both stored.
  - `flock_enabled()` is true for members.
  - The one approved entry point is in place: the Community button and one dismissible Home card.
  - The free-user regression check asserts exactly that.
  - Merged dark, and switched on with a database setting, not a deploy.
- **Size:** L
- **Depends on:** everything above that's required, plus the legal pages (1.5)
- **Overnight alone:** no
- **Needs Brittany:** this is the launch decision.

### 1.5 Legal pages
- **Done means:** `/terms` and `/privacy` carry Brittany's approved community, billing and age text (from `docs/legal/drafts/2026-11-flock-legal-update.md`). The post-deletion wording goes live only once 1.3 has.
- **Size:** M
- **Depends on:** the final legal text, 1.3
- **Overnight alone:** no
- **Needs Brittany:** the legal text.

### 1.19 Content loading
- **Done means:**
  - Today's ideas are `ready` for the first two weeks after opening.
  - The 14 journey templates are approved.
  - The Library's opening items, the chapter collections' listings and the Start here posts are in.
- **Size:** Brittany's time
- **Depends on:** content approval
- **Overnight alone:** no
- **Needs Brittany:** all of it.

### D1.3 Weight baseline alerts on for everyone
- **Done means:** the vet-approved values are in the settings file and the switch is on for everyone.
- **Size:** S
- **Depends on:** D1.2, the vet's sign-off
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
8. **Open:** merge or switch on 1.18, then check the free-user regression check and save-error alerts that morning.
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

## Done

- **P1** The stored free-season end is cleared, and opening day can't be set without it (`admin_set_flock_dates`): #497.
- **P2** The founding, gift and redeem pages read opening day and the free season's end (`getFlockPublicDates`): #497.
- **P3** The founding page's "all 50 claimed" box follows opening day: #497.
- **P4** Gift emails can be scheduled any day from today through 90 days ahead: #496.
- **0.1** #377 (diet type labels): already done on main by #378, Oct 21. #377 itself duplicates it and breaks the build. Close it (Brittany).
- **0.2** #490's migration given its own version (`20261121150000`) and merged (Nov 21).
- The dead `kya://` URL scheme was removed from `ios/App/App/Info.plist` (#331).
- The weight-range item ("Each bird's normal weight range…") became D1.1–D1.3 above.
