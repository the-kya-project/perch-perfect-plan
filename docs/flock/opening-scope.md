# The Flock: everything left before opening

Status: **scoping only.** Written Nov 21, 2026 from `main` at `d8ec1f8`, read-only queries on production (`koyqdyamazuuwvqbttnj`), and the open and closed PRs. Nothing in code, settings, Supabase, Vercel, Stripe, RevenueCat, App Store Connect or Brevo was changed to write it.

**Scope rule (Brittany, Nov 21):** everything below is required **before the Flock opens on Mon, Jan 4, 2027**, including anything older docs call "post-launch" or "February". **Code freeze is Mon, Dec 28.** Nothing ships after opening unless Brittany decides to cut it.

**Source of truth:** `docs/flock/payments-plan.md` (PR #474, as updated through Nov 20). Where an older doc disagrees, the plan wins (the docs to retire are listed under "Docs that disagree", below). Decisions in force:

- The care app is free forever. App premium was removed on Nov 19 (#482). The journeys it would have included come with the Flock.
- The Flock: $30 month to month or $300 a year ($25 a month billed annually). Kya's Crew: $37 a month billed annually ($444 a year) or $45 month to month.
- Free for everyone until Tue, Jul 6, 2027. **Founding claims have no closing date** (open until all 50 are claimed; confirmed by Brittany Nov 21, matching the plan and production). Payments go live Tue, Jun 1, 2027; payment builds follow the plan's dates.
- Gifts: six months or a year. **A gift redeemed during the free season starts on Jul 6, 2027; one redeemed after that starts on the day it's redeemed** (confirmed Nov 21; this is what's built: `20261120180000`, `20261120200000`).
- **Kya's Crew (with its sponsored rescue-adopter seat), rescue partner codes and promo codes are built fully before Jan 4** (decided Nov 21), even though nothing is charged until Jul 6.

**How vet-related content is handled (Brittany, Nov 21).** Vet sign-off doesn't block building. We draft everything ourselves from published research, standard avian care guidance and Brittany's knowledge, then an avian vet checks and approves it. For every health-related feature:

- All thresholds, phrase lists and safety wording live in **one clearly labeled settings file**, each marked "draft, pending vet review" with its research source, so an approved change is a quick edit, not a rebuild.
- **Each health-related feature has its own off switch.** If approval isn't in by opening, that feature stays hidden and everything else opens.
- **Nothing that tells an owner something about their bird's health reaches real users until the vet approves it.** Until then it runs in shadow mode or for Brittany's account only.
- The free hard weight-loss safety alert uses **the most conservative values from the research** until the vet weighs in.

---

## Production today (read-only, Nov 21)

- `flock_enabled()` = admin **and** the kill switch on. One admin account. `flock_opens_at` is not set; `free_season_ends_at` = Jul 6, 2027. `journeys_enabled()` audience = off. The kill switch has never been flipped (`flock_settings.updated_at` Nov 7).
- `founding_deadline()` returns infinity (no closing date). 1 founding claim; 2 entitlement rows (one founding, one manual comp).
- All 150+ migrations in `main` are applied; nothing in production is missing from the repo.
- Content: 14 journey templates and 14 Today's ideas, all `draft` (the ideas are scheduled Nov 8–21, so **nothing is scheduled for Jan 4 onward**); 0 library items; 0 chapter reviewers; 127 vet-nudge phrases, all `draft`.
- Scale: 62 accounts, 84 birds, 743 weigh-ins (172 in the last 30 days, 26 birds). The 1,000- and 10,000-user costs below are projections.

**Found during the cleanup, needs Brittany:** PR #490's migration `20261121120000_rls_policy_speedups.sql` has the **same version number** as `20261121120000_flock_founders_page.sql` (#491), which is already applied on production. If #490 merges as it is, Supabase will treat that version as already applied or refuse it, so the policy rewrite would not run. #490 needs its migration renamed to a new timestamp before it merges (PR 0.2 below). Nothing was changed on #490.

---

## B1. The payments plan's before-opening checklist

### Brittany's tasks (plan section e)

| Item | Status | What's left |
|---|---|---|
| Avian vet sign-off (diet thresholds, smoothed weight rules, vet-nudge lists) | **Not started** | Contact the vet by **Wed, Nov 25**; sign-off by **Fri, Dec 18**. Now part of the bigger packet in B7. |
| Legal text (community terms, Flock privacy, guidelines, founding terms) | **Partly done** | Draft in `docs/legal/drafts/2026-11-flock-legal-update.md` (#476), decisions D1–D16 made Nov 19. D5 (price-change notice) still open; no lawyer review yet. Final text due **Fri, Dec 4**. |
| Approve the copy (plan section i) | **Partly done** | App founding and gift copy is updated (#480, #481, #486, #487). The website (Webflow: home and `/community`, still "$20 per month billed annually" and "six months free") isn't checked or updated. |
| Approve content | **Not started** | 14 journey templates, Today's ideas for Jan 4–17 (none scheduled), the Library's opening items (0), Start here posts (0). Due Fri, Dec 18. Now also the content for the new features in B3 (challenges, chapter collections, badges). |
| Approve PR C (the launch PR) | **Not started** | PR C isn't built yet (below). |
| Dry run on production | **Not started** | Dec 21–23: join → post → journey → report → block → kill switch, on web, iPhone, iPad and Duo. |
| Name reviewers | **Not started** | `flock_reviewers` is empty (admins review today). |
| Opening emails drafted in Brevo; the email to existing claimants | **Not started** | No draft exists. Brittany writes and sends them herself; nothing is scheduled. |
| Website (Webflow) | **Not started** | Founding card and `/community`, published Jan 4. |
| Open on Jan 4 (SQL settings) | **Not started** | Set `flock_opens_at`, confirm `free_season_ends_at`, switch on PR C's setting. |

### The build (plan section f, PRs A–H)

| PR | Status | Evidence | What's left |
|---|---|---|---|
| A. Founding terms and deadline | **Done** | #478, #480, #481, #486; `founding_deadline_checks.sql` | The claimant email draft (Brittany) and Webflow copy. |
| B. Free-season grant | **Done** | #483, `20261120120000_flock_free_season_join.sql` | Nothing; `flock_join()` exists but nothing calls it until C. |
| **C. Opening the Flock to members** | **Not started** | — | The whole launch PR: Join screen, **"I'm 18 or older"** confirmation (nothing in the code yet), guidelines acceptance stored, `flock_enabled()` true for members, the one approved entry point (Community button + one dismissible Home card), and the free-user regression check updated (it still asserts no Community button at all, `e2e/free-user/free-user.spec.ts:34-45`). |
| **D. Member blocking (Apple 1.2)** | **Partly done** | #489, `20261121100000_flock_member_blocking.sql` (live), `BlockSheet.tsx`, `flock.you.blocked.tsx`, `flock_blocking_checks.sql` | **No published contact line inside the Flock.** Apple 1.2 requires one. The only "contact us" (`HelpSheet`, `src/lib/support.ts:3`) is mounted in `OwnerHeader`, which the Flock shell doesn't use; Flock settings (`flock.you.index.tsx:44-74`) has none. Yesterday's inventory called blocking "done": the blocking itself is, the contact line isn't. |
| E. Stickiness events | **Done** | #488, `src/lib/flockAnalytics.ts` | `flock_joined` fires once C exists. |
| F. Gift years and six-month gifts | **Done** | #487 | Nothing. |
| **G. Legal pages** | **Not started** | `src/routes/terms.tsx` has five care-app paragraphs; `/privacy` dated 15 Oct 2026 | Wire in Brittany's approved text. The privacy policy's post-deletion wording can't go live until 6b/6c below. |
| H. Founding members page | **Done** | #491, `20261121120000_flock_founders_page.sql` | Nothing (no founder has opted in yet). |

**Pulled in by the scope rule (plan items 6b, 6c, legal drafts D9/D10):** deleted posts kept hidden for 180 days, then purged; removed content and closed reports deleted after 180 days. **Not started.**

**"Not to cut" list:** legal pages (not started), blocking (contact line missing), free-user check updated for the entry point (not started; waits on C), kill switch tested on production (built, never flipped; test it in the dry run).

---

## B2. App premium leftovers

**Nothing a user can see still offers or mentions the $9.99 app premium.** No `$9.99`, `STRIPE_PRICE_APP_PREMIUM` or `has_app_premium` in app code, functions, scripts, tests or public files, and no "premium" in any language catalog or email catalog.

What remains is intentional:

- **Admins only:** the one refunded gift shows its stored plan name `app_premium_year` in `/admin/gifts` (`admin.gifts.tsx:44-45`).
- **Refusals:** the two database triggers that refuse any new app premium row carry a "removed on Nov 19" hint; only an attempted write reaches it.
- **Naming:** Flock-only journey templates are stored as `tier = 'premium'` (the old name): `src/lib/journeys.ts`, `e2e/journey-fixture.json`, `e2e/flock.shell.ts`, `scripts/flock-shell.test.ts`. Never shown as "Premium". Renaming it is optional housekeeping (a Flock database change, so it would need approval).
- **Guards and history:** `src/lib/flockProfile.ts:79-81` filters the old plan out; `flock.journeys.setup.tsx:278-279` maps an old refusal to Flock wording; tests assert premium is gone (`scripts/gifts.test.ts`, several `supabase/checks/*`); 13 migration files are history.
- **Docs:** CLAUDE.md, the payments plan and the legal draft mention it only as "removed".

---

## B3. Features now required before opening

None of these exist on production under any name (no badge, challenge, pod, promo, partner, crew, sponsor, insight, vote or collection tables), and **only Kya's Crew has a written spec.** The rest need a short spec from Brittany before building; that's the first dependency for each.

| Feature | Status | What exists | What has to be built |
|---|---|---|---|
| **Challenges** | Not started; **no spec** | Posts, comments, reactions, `/admin/ideas` scheduler to copy | `flock_challenges` (title, dates, rules, chapter or Flock-wide) and entries (member, bird, a post or clip as proof), visibility through the existing post and block rules, a card on Today and Journeys, an admin scheduler. |
| **Buddy pods** | Not started; **no spec** | Comments with `subject_type`, block rules | Pods of 3–6 (by chapter or journey), membership, a pod feed or check-ins, opt-in matching, admin tools to form, move and dissolve pods, all respecting blocks. |
| **Flock insights** (free users' care logs count) | Not started; **no spec** | Minimum-count tallies (`flock_idea_tries` shows under 5 answers as nothing) | Aggregate-only views over care tables (weights, health checks, diet): species groupings, a minimum count, never per bird. **Free users' data feeding a members-only feature needs a privacy-policy line and an opt-out**, and it reads care tables, so it needs Brittany's explicit approval and free-user evidence. |
| **Do good voting** | Not started; **no spec** | None. The founding page promises "a vote on the first expert Q&As and the first chapters" (`founding.tsx:214`), and nothing delivers it yet | Votes (one per member per item), a poll on Do good posts or a cause list, results under a minimum count, admin open/close/announce. One build can cover the founding vote too. |
| **Member-submitted posts approved before going live** | **Done for Do good** (#459) | Do good posts start `pending` and go through `/admin/review`; editing sends them back | If *every* space should be pre-approved (learn, chapter, start), it's a small change to an existing Flock function, which needs approval. Needs a decision: Do good only, or all spaces? |
| **Curated chapter collections** (e.g. avian vets) | Not started | The chapter Resources tab is an empty state ("Avian vets, rescues, and shops your chapter recommends will be collected here", `flock.chapter.tsx:53-55`); the Library is Flock-wide only | Chapter listings (kind: vet, rescue, shop; name, address, phone, link, note), a chapter-lead and admin editor, and a card-style list that doesn't look like posts. |
| **The full badge set** (care badges earnable by free users too) | Not started; **no spec** | Founder and Chapter lead badges only (computed, no table); skills from finished journeys; the care app's Moments milestones. `flock.journeys.$journeyId.finished.tsx` says "Badges come in February" | Badge definitions and earned badges, awarding rules on care events (weigh-in streaks, health checks, a finished care plan) and Flock events, art for each badge. **Care badges show in the care app for free users**, which changes the free-user experience: needs Brittany's approval and before-and-after evidence. |
| **Kya's Crew + sponsored rescue-adopter seat** | Not started; **spec exists** (plan item 6d) | One code comment | It sits on top of the billing foundation (plan items 1–3: billing tables, Stripe billing webhook, card step), none of which exists, so **building Crew before Jan 4 pulls those forward**. Then: Crew plans (an `entitlements` check change, which needs approval), Crew counted as a Flock membership, 25% giving, a sponsorship count that rescue-adopter comps draw from, the admin view, no trial. **Selling it in the iPhone app** needs App Store products, RevenueCat and a native build reviewed by Apple; built dark before Jan 4, and nothing is charged before Jul 6. |
| **Rescue partner codes** | Not started; partly specced (today: a 6-month comp "granted by hand", plan h6) | None | Partners and their codes (uses, expiry), a redeem step (on Join or like `/redeem`) that records the adoption and goes to approval, a six-month comp starting after Jul 6 that draws on Crew sponsorships, an admin screen. |
| **Promo codes** | **Partly done (gifts only)** | Gift Checkout accepts Stripe promotion codes; `/admin/gifts` totals by code | Codes for memberships (on the card step), rules for founding vs regular, Apple offer codes for iPhone (whole months only). Depends on the billing foundation. |
| **Instagram share cards for journeys** | Not started | The care app's Moments share card (`src/lib/momentCard.ts`) to reuse; placeholders "Make a share card comes later" in the milestone and compare screens | A card renderer (1080×1350 and 1080×1920) for milestones, finishes and day-one-vs-now, photo metadata stripped, the share sheet with a download fallback, never anything from a "Just me" journey. |

---

## B4. Care-app "delight" features (scope only; not decided)

Costs are **estimates**, projected from today's 62 accounts. "Session" = one focused Claude Code session, about one PR.

### 1. Per-bird weight baseline with tiered alerts

- **a) Builds on:**
  - `birds.normal_weight` / `normal_weight_min` / `normal_weight_max` (typed by the owner; nothing checks against them today);
  - `weight_entries.meal_relation` (before/after a meal);
  - `private.usual_weigh_meal`;
  - the Diet conversion's smoothed weight logic (`private.journey_weight_check`, `20261108160000_diet_weight_rules.sql`: 3-reading average, 2 g floor, re-weigh on one odd reading);
  - `src/lib/weightTrend.ts` (amber on any drop, never red);
  - the existing spec in `docs/BACKLOG.md`, "Each bird's normal weight range…".

  **The care app has no hard weight-loss alert today**; the only one is inside the Flock's Diet conversion.
- **b) Difficulty:** medium, **3–4 sessions**:
  1. the labeled rules file and a pure baseline/alert function with tests;
  2. a replay of real weight history (16 birds already have enough weigh-ins);
  3. the screens ("still learning", the range, the celebration, alert cards) behind their own switch;
  4. shadow logging.
- **c) Monthly cost:** about **$0 at 1,000 and 10,000 users** (estimate). It's computed from rows already stored, so the database load is trivial and there are no AI calls or emails. Push (APNs, FCM) is free if added later. Supabase stays within the current plan at this size (estimate; verify at https://supabase.com/pricing).
- **d) Risks:**
  - False "call your vet today" alerts, from after-meal readings, a new scale, a dish left on the scale, wrong units, or a sitter weighing at a different time. Mitigations: compare like with like (meal tag), the 3-reading average and 2 g floor, and ask for a re-weigh before any alert.
  - Missed alerts for birds with few weigh-ins: "still learning" must never read as "all fine".
  - **Tests:** unit tests on made-up series; a replay of real history (read-only export) to count how often each tier would have fired per bird; weeks of shadow mode; Brittany's account first.
  - **Conservative starting values:** "call your vet today" at **10% below baseline** (a common avian first-aid rule of thumb: https://parrots.org/wp-content/uploads/2024/02/AvianFirstAid.pdf; https://www.harrisonsbirdfoods.com/tracking-what-matters-body-condition-in-the-companion-parrot-2/). "Keep an eye on this" at **5% over a week** (the Diet conversion's pause level). "Worth watching" at **2.5%** (the care app's existing amber level). Some guidance is stricter (about 2% in one weighing); there's no peer-reviewed consensus, so every value is draft with its source.
- **e) Dependencies:** **avian vet review** before real users; no new accounts, no native build.
- **f) By Dec 28:** **yes in shadow mode on Brittany's account**; not for real users until the vet approves.

### 2. Today cards on Home (seasonal, holiday, weather; not vet-reviewed)

- **a) Builds on:** Home (`dashboard.tsx`) and its existing cards; the owner's home time zone; the pattern of the Flock's Today's idea.
  - **How it differs from the Flock's Today's idea:** that one is community enrichment, one per Eastern-time day, behind `flock_enabled()`. The care app may not call it for non-admins. Today cards would be a separate care-app source, keyed on the owner's local date, with seasonal and safety content (heat, fireworks, candles, non-stick pans).
  - **The overlap:** both are "a card for today". They sit on different screens (Home vs `/flock`), so an admin would see one on each. A later choice could let a member's Home card link to the Flock idea.
- **b) Difficulty:** seasonal and holiday from a file, **1–2 sessions**; weather **+1–2** (a server function, location from the stored home ZIP and never GPS, cached per area).
- **c) Monthly cost:**
  - Seasonal and holiday: **$0**.
  - Weather (one fetch per user per day, cached): about 30,000 calls at 1,000 users and 300,000 at 10,000. Both fit Apple WeatherKit's 500,000 a month included with the developer program, so **$0** (estimate; verify https://developer.apple.com/weatherkit/get-started/). Open-Meteo's free tier is non-commercial only (verify https://open-meteo.com/en/pricing).
- **d) Risks:**
  - Weather copy that reads like health advice: keep it to plain care steps.
  - The wrong location, or a privacy line needed if location is new.
  - Holidays wrong for the region (the app ships in Dutch too).
  - **Tests:** date selection across time zones, both languages, and the iPhone hydration check (read the date after the page loads).
- **e) Dependencies:** none for seasonal. A WeatherKit key for weather (the Apple account exists). No native build.
- **f) By Dec 28:** **seasonal and holiday, yes**; weather is marginal.

### 3. Seasonal content calendar

- **a) Builds on:** `/admin/ideas` (the two-week schedule, Ready/Draft, move a day), which is Flock-only, so a care-app copy would be new.
- **b) Difficulty:** a reviewed file of dated cards (translated through the normal pipeline), **1 session**. An admin calendar tool, **about 2 sessions**. Recommended: the file first.
- **c) Monthly cost:** **$0**.
- **d) Risks:** a wrong-season card; translations drifting if the copy lives in the database. **Test:** every date resolves and every card exists in English and Dutch.
- **e) Dependencies:** none. Brittany writes or approves the cards.
- **f) By Dec 28:** **yes, as a file.**

### 4. "Tell me about [bird]"

- **a) Builds on:** every care-plan field (`care_plans` food, health, behavior and home columns, `routine_tasks`, emergency contacts and owner defaults), the walkthrough steps in `src/lib/setupSteps.ts`, and the editors in `src/components/careEditors/` and `src/components/setup/`.
- **b) Difficulty:** large, **4–6 sessions**:
  1. a server call to Claude with a strict list of fields;
  2. a review screen showing each draft next to the current value, accept or edit per field;
  3. explicit confirmation for feeding amounts, medications and emergency info, never saved automatically, never overwriting a filled field;
  4. speech input;
  5. a set of sample descriptions to test against.
- **c) Monthly cost** (assumes about 0.3 uses per active user a month):
  - **AI model:** a small Claude model at roughly $1 / $5 per million input / output tokens, about **$3/month at 1,000 users and $30 at 10,000**. A larger model at roughly $3 / $15 is about **$10 and $100** (estimates; verify current models and prices at https://platform.claude.com/docs/en/about-claude/pricing).
  - **Speech to text** (about 2 minutes a use): about **$2–3/month at 1,000 and $18–26 at 10,000** (OpenAI transcription about $0.003/min, Deepgram about $0.0043/min; estimates; verify https://deepgram.com/pricing and OpenAI's pricing page). On-device speech is $0 but uneven across browsers, and good iPhone speech likely needs a native plugin.
  - **Database:** negligible.
- **d) Risks:** **the highest of the five.**
  - A made-up or misheard feeding amount, dose or vet phone number that a sitter then acts on. Mitigations: never auto-save; a tick for each safety-critical item; leave blank rather than guess; show the sentence each draft came from.
  - Care text goes to an outside service, so the privacy policy needs a change.
  - **Tests:** 20–30 sample descriptions with expected results, run on every change; Brittany's account first.
- **e) Dependencies:** an Anthropic API key in Vercel Production only (with a preview guard); a privacy-policy update; for speech on iPhone, likely a new app store build.
- **f) By Dec 28:** **no**, alongside the Flock work. At most a typed-only prototype on Brittany's account.

### 5. Weekly recap replacing the 10-day and 30-day lapse nudges

- **a) Builds on:**
  - `src/routes/api/public/hooks/engagement-nudges.ts` (job `engagement-nudges-daily`): push only, `checkin_reminder` at 10 and 30 days with no activity, plus per-user toggles and `notification_log`. Only 7 lapse nudges have ever been sent.
  - The monthly letter (`monthly-letter.ts`): its eligibility rules, passed-bird exclusion and quiet-month handling can be reused.
- **b) Difficulty:** push-only recap replacing the lapse nudges, **about 2 sessions**; an email version **+1–2**.
- **c) Monthly cost:**
  - Push: **$0** (APNs and FCM are free).
  - Email: about 4,300 emails a month at 1,000 users and 43,000 at 10,000. Depending on the Brevo plan, roughly **$9 to $70/month** more (estimate; verify https://www.brevo.com/pricing/).
  - Database: a weekly read; negligible.
- **d) Risks:**
  - A cheerful recap during a weight drop: no health judgments in it until feature 1 is vet-approved.
  - Fatigue next to the monthly letter.
  - Only about 9 people have web push, so reach is thin.
  - **Tests:** the dry-run mode the hooks already have, then Brittany's account only.
- **e) Dependencies:** **Brittany's sign-off**: it changes what every user receives, and the email half would be a new automatic send.
- **f) By Dec 28:** **push-only, yes**; email only with sign-off.

---

## B5. Other care-app work

| Item | Finding | Plan |
|---|---|---|
| **Open app notices a new release** (rebuild of closed #431; reference branch `fix/native-release-catchup`) | **Likely cause of the flaky test:** the failing runs aren't slow; the page reset never starts (passes reset in about 1 s, failures sit at exactly 20 s). The startup guard's listener is in the page *after* the stylesheet tags and about 110 KB of inlined styles, while the code preloads come first. When the test's missing file answers instantly, the browser can report the failure before the guard is listening, and the app's fallback check can't see it either. On a fast local machine the guard wins every time (160/160). **Production has the same blind spot today.** | Five PRs: **(1)** move the guard to the very top of the page and keep a list of the page's code files; repeat the test 30× on WebKit in CI; **(2)** the version endpoint and rules; **(3)** the release check on open pages (launch, hourly, return to the app); **(4)** the Vercel Skew Protection unpin, which needs Brittany's decision on that setting; **(5)** the sitter-preview catch-up, checked in the iPhone Simulator. Pieces 1–3 before the freeze; 4–5 need a decision and a Simulator pass. |
| **Credit /get-page sign-ups** (`claude/busy-mccarthy-qntx5t`) | One commit (Oct 22) and 2 files; it still applies cleanly to current main. | Cherry-pick onto a new branch, run `npm run test:get-app`, confirm the postcard link lands on `app.thekyaproject.com` (the credit only carries within one site), open the PR. About half a session. |
| **Translation check on main** | It fails with **85 missing English phrases** (not ~205; that was the Oct 14 count in the backlog), all from the Library build (22 `flock.library.*`, 63 `flock.libraryAdmin.*`), plus 2 stale keys. Nothing runs the check in CI, which is how it drifted. Separately, Dutch is missing keys that free users see today: `clipRecorder` (6), `gift` (37), `giftThanks` (17), `redeem` (21). The Flock's 846 Dutch keys can wait for a decision on a Dutch Flock. | One PR: extract (+85/−2), translate the user-facing Dutch gaps, run the parity check, and add `i18n:check` to CI so it can't drift again. |

---

## B6. Every unfinished item as PRs

**"Needs Brittany"** is always yes for anything involving payments or real money, email or push to real users, care-app database changes, vet-reviewed content, legal text, or copy she approves. **"Overnight alone"** means an agent can build it to a reviewable PR without a decision partway through (Brittany still reviews and merges). Sizes: S = under one session, M = one, L = two to three, XL = four or more.

### Track 0: housekeeping (now)

| # | PR | Done means | Size | Depends on | Overnight alone? | Needs Brittany |
|---|---|---|---|---|---|---|
| 0.1 | Re-run #377's checks | The diet labels PR passes the current required checks and merges | S | Her OK to update its branch | Yes | Merge |
| 0.2 | #490 migration rename | #490's migration has its own version, so the database speed-up actually runs when merged | S | Her OK to touch #490 | Yes | Yes: care-app RLS change |
| 0.3 | Translation check | `npm run i18n:check` passes on main and runs in CI; user-facing Dutch gaps filled | M | — | Yes | Dutch copy review |
| 0.4 | /get sign-up credit | Postcard and campaign sign-ups on the web are credited to their link | S | — | Yes | Merge |

### Track 1: the Flock opening (required)

| # | PR | Done means | Size | Depends on | Overnight alone? | Needs Brittany |
|---|---|---|---|---|---|---|
| 1.1 | Flock contact line | Every Flock screen has a published way to contact us (Apple 1.2) | S | Contact wording | Yes | Copy |
| 1.2 | Vet-content settings file and health switches | Every threshold, phrase list and safety wording is listed in one file, marked draft with its source; each health feature has its own switch; a check fails if the database and the file disagree | L | — | Yes | Yes: health content |
| 1.3 | 180-day hold on deleted posts (6b) | Deleting a post hides it at once and purges it 180 days later; account deletion stays immediate | M | — | Yes | Merge |
| 1.4 | 180-day deletion of removed content and reports (6c) | Removed content and closed reports are purged 180 days after review | S | 1.3 | Yes | Merge |
| 1.5 | Legal pages (G) | `/terms` and `/privacy` carry the approved community, billing and age text | M | Final legal text (Dec 4), 1.3 | No | Yes: legal |
| 1.6 | Chapter collections | Each chapter's Resources tab lists vets, rescues and shops as cards, edited by leads and admins | L | Short spec | After spec | Content |
| 1.7 | Instagram share cards | Members can share a milestone, finish or day-one-vs-now card; never from a "Just me" journey | L | Card design | After design | Design approval |
| 1.8 | Do good voting (+ the founding vote) | Members can vote on Do good items and on the first expert Q&As and chapters; admins open, close and announce | L | Spec | After spec | Copy |
| 1.9 | Pre-approval for all spaces (if wanted) | Posts in the chosen spaces wait for review before others see them | S | Decision | Yes | Yes: changes an existing Flock function |
| 1.10 | Challenges | Admins schedule a challenge; members enter with a post or clip; it shows on Today and Journeys | XL | Spec | After spec | Content |
| 1.11 | Buddy pods | Members can join a pod of 3–6 with its own check-ins; admins form and dissolve pods | XL | Spec | After spec | Copy |
| 1.12 | Flock insights | Members see species-level care patterns from aggregate data (minimum counts, never one bird); free users can opt out | L | Spec, privacy line | No | Yes: reads care data, privacy |
| 1.13a | Badges: Flock badges | Badge definitions and earned badges for Flock activity, shown on profiles | L | Spec, art | After spec | Content |
| 1.13b | Badges: care badges | Free users earn care badges in the care app | L | 1.13a | No | Yes: changes the free-user experience |
| 1.14 | Billing foundation (plan 1–3) | Billing tables, the Stripe billing webhook and the card step exist, switched off | XL | — | Yes, in test mode | Yes: payments |
| 1.15 | Kya's Crew + sponsored seat | Crew plans exist (dark), count as membership, record 25% giving and track sponsored adopter seats | L | 1.14 | No | Yes: payments, entitlements change |
| 1.16 | Rescue partner codes | Partners get codes; an adopter redeems one and, once approved, gets six months starting Jul 6 | L | 1.15, spec | After spec | Yes: grants access |
| 1.17 | Membership promo codes | Codes work on the card step with founding/regular rules (Apple offer codes listed for May) | M | 1.14 | No | Yes: payments |
| 1.18 | **C. The launch PR** | Members can join (18+, guidelines accepted), the one entry point is in place, the free-user check asserts exactly that; it merges dark and is switched on with SQL on Jan 4 | L | 1.1, 1.5 | No | **Yes: the launch decision** |
| 1.19 | Today's ideas and content loading | Jan 4–17 ideas `ready`, templates approved, library and Start here items in | — (her time) | Content approval | n/a | Yes |

### Track 2: care-app fixes (required)

| # | PR | Done means | Size | Depends on | Overnight alone? | Needs Brittany |
|---|---|---|---|---|---|---|
| 2.1 | Startup guard first | The missing-file reset works on WebKit 30 of 30 times in CI | M | — | Yes | Merge |
| 2.2 | Version endpoint and rules | `/api/public/version` and the release rules exist, with tests; no behavior change | M | 2.1 | Yes | Merge |
| 2.3 | Release check on open pages | An open app or page notices a new release and updates safely | M | 2.2 | Yes | Merge, Simulator check |
| 2.4 | Skew Protection unpin | An open page fetches the new build's files after a release | M | Decision on the Vercel setting | No | Yes |
| 2.5 | Sitter-preview catch-up | The sitter preview never stalls after a release (the Nov 2 bug) | M | 2.3 | No | Simulator check |

### Optional tracks (delight; each its own track)

| # | PR | Done means | Size | Depends on | Overnight alone? | Needs Brittany |
|---|---|---|---|---|---|---|
| D1.1 | Weight baseline rules and replay | Rules file (draft, sources), pure function, replay report on real history | M | 1.2 | Yes | Health content |
| D1.2 | Baseline screens, shadow mode | "Still learning", range, celebration and alert cards, on Brittany's account only, with shadow logging | L | D1.1 | Yes | Yes: health |
| D1.3 | Baseline alerts on for everyone | The vet-approved values switched on | S | Vet sign-off | No | Yes: vet content |
| D2.1 | Seasonal and holiday Today cards | Home shows a dated card from the reviewed file, in English and Dutch | M | D3 content | Yes | Copy |
| D2.2 | Weather cards | Heat and cold cards from WeatherKit by home ZIP | M | WeatherKit key | No | Copy, privacy line |
| D3 | Seasonal calendar file | A reviewed file of dated cards Jan–Dec | S | — | Yes | Copy |
| D4.1 | "Tell me about [bird]", typed | Typed description → drafted fields for review; safety fields need a tick | XL | API key, privacy policy | No | Yes |
| D4.2 | …with speech | Speak instead of type | L | D4.1, maybe a native build | No | Yes |
| D5.1 | Weekly recap (push) | A weekly push recap replaces the 10- and 30-day lapse nudges | M | Sign-off | Yes | Yes: push to real users |
| D5.2 | Weekly recap (email) | The same recap by email | M | D5.1, sign-off | No | Yes: email to real users |

---

## B7. The vet review packet

There is **no single settings file** today: values are spread across database settings tables, code constants and the language files. PR 1.2 gathers them. The packet should contain:

1. **Diet conversion weight rules** (`journey_settings`; `20261107220000_journeys_updates.sql:26-27`, `20261108160000_diet_weight_rules.sql:38-47`):
   - pause at 5% below the starting weight;
   - heads-up at 2.5%, clearing only within 1.5%;
   - the 3-reading average (2 within 3 days);
   - slow slide: 3% over 7 days with 4+ weigh-ins;
   - sudden drop: 8% (re-weigh, then pause);
   - a 2 g minimum drop;
   - 2 missed days;
   - the meal-tag rule;
   - the weight messages (`src/locales/en.jsonc:2102-2117`).
2. **Diet conversion guidance** (`20261108150000_diet_conversion_vet_guidance.sql`, `JourneyDiet.tsx`, `en.jsonc:1904-1915`):
   - the vet card and reminder;
   - the young-bird line;
   - the disclaimer;
   - the 11 "How to make it work" tips;
   - the nectar-eater block, which matches only lory, lories and lorikeet. **Ask whether other nectar or specialist feeders should be blocked** (hanging parrots, swift parrot, fig parrots).
3. **Journey templates and milestones** (`20261107200000_journeys_core.sql:716-831`) and the safety notes on every template (:211-215), especially:
   - scale training;
   - wing touch;
   - carrier comfort;
   - **nail trims, which has no safeguards and nothing about the quick or bleeding.**
4. **Tips after a hard day** (`journey_tips`, `20261107220000_journeys_updates.sql:134-139`). **Flag:** one tip says birds "care a lot more about treats when they're a little hungry", which sits close to the rule never to suggest withholding food.
5. **Vet-nudge phrase lists**, both tiers (`flock_vet_signs`: `20261108100000_flock_posts.sql:46-56`, `20261108170000_flock_vet_nudge_tiers.sql`, `20261108180000_flock_vet_nudge_tighten.sql`). About 127 phrases, plus the two card texts (`en.jsonc:2296-2302`) and the AAV Find-A-Vet link.
6. **The daily health check (triage)** (`src/lib/triage.ts`, whose header already says it must be vet-reviewed; questions at `en.jsonc:3726-3760`, messages at :3422-3429):
   - the 10 questions;
   - which answers alone mean red;
   - the yellow rules;
   - the red and yellow wording;
   - the disclaimer;
   - the sitter "Something's wrong" flow and its emails (`emails.en.jsonc:447-470, 677-684`).
7. **Care-app weight wording** (`src/lib/weightTrend.ts`, `src/lib/dailyLog.ts:82-86`):
   - steady within ±2.5% over 90 days;
   - amber on any drop of 1 g or more, **with any gain shown as good** (ask whether that's right);
   - the 10% "Save anyway?" check;
   - the proposed baseline alert tiers and their sources (B4 feature 1).
8. **Emergency guides on the sitter page** (`src/routes/sitter/$token/emergency.tsx`, `en.jsonc:4179-4282`):
   - bites, bleeding, breathing, egg binding, escape, fumes, overheating, poisoning, seizure, transport;
   - the keep-warm range of 85–90 °F (`src/lib/poisonControl.ts:93-105`);
   - the poison control numbers by region (`poisonControl.ts:23-83`).
9. **Parrots 101 guide cards** (`guide_cards`, 59 rows, `20260615135444_…sql`):
   - every row is stamped `reviewed_by = 'The Kya Project · Parrot Care Bible'`, so it **looks reviewed but no vet reviewed it**;
   - the toxic foods card (:48), metals and poisons (:61), temperature (:62).
10. **Food lists:**
    - the walkthrough's pre-filled "Never feed" list (`birds/$birdId.setup.tsx:1248-1258`);
    - fresh-food removal times;
    - the chop safe list and unsafe terms (`src/lib/chopIngredients.ts:13-56`; its comment already says to review with a vet; it includes grapes, chili, cherries, coconut, egg).
11. **Passing guidance** (`en.jsonc:1666-1676, 3436-3464`, `PassingGuidance.tsx`): necropsy, refrigerate never freeze, burial.
12. **Emails with care advice** (`emails.en.jsonc`):
    - the 12 monthly care notes (:168-226);
    - the onboarding weight emails (:323-340);
    - the weighing series (:514-536);
    - the vet-summary series (:646-667);
    - the daily health check series (:546-552).
13. **Today's ideas with safety claims** (`20261108120000_flock_todays_idea.sql:413-445`): #3 (box: tape, staples, labels), #1, #4 and #8 (paper and ink), #12 ("a bird-safe tree", with no list), #14 (water and misting).
14. **New content** drafted under the rules above:
    - care badges' health criteria;
    - any health-related Today cards;
    - the insights wording;
    - the "Tell me about" safety-field rules.

**Format:** one document per area with the value or wording, its source, our reasoning, and a box for the vet to approve, change or reject. Their answers go straight into the settings file (PR 1.2).

---

## B8. Schedule, Nov 23 – Dec 28

Assumes overnight agents build and Brittany reviews. **Her review time is the limit, not build time:** every PR needs a read, a preview check and a merge, and every Flock PR needs its free-user evidence checked. Hours are her time.

| Week | Build (parallel lanes) | Brittany's work | Her hours | Vet track |
|---|---|---|---|---|
| **Nov 23** (Thanksgiving week) | 0.3, 0.4, 1.1, 1.2, 1.3, 2.1 | Specs for chapter collections, voting, challenges, pods, insights, badges; decide 0.1/0.2, pre-approval scope, Skew Protection | 10–12 | Contact the vet by **Wed, Nov 25**; packet drafted (from 1.2) |
| **Nov 30** | 1.4, 1.6, 1.8, 1.14 (start), 2.2, D1.1 | Reviews; card design for 1.7; legal text final by **Fri, Dec 4** | 14–16 | Packet sent by **Fri, Dec 4** |
| **Dec 7** | 1.5, 1.7, 1.10, 1.13a, 1.14 (finish), 2.3 | Reviews; badge art; content writing | 16–18 | Vet questions back and forth |
| **Dec 14** | 1.11, 1.12, 1.13b, 1.15, 1.16, 1.17, 1.18 (C, merged dark by **Fri, Dec 18**) | Reviews; approve content (templates, ideas, library, collections, challenges); approve C | 18–20 | **Sign-off by Fri, Dec 18**; values into the settings file |
| **Dec 21** | Fixes only; 2.4/2.5 if decided | **Dry run on production** (1 day), name reviewers, opening emails and website drafted | 14–16 | Late items stay switched off |
| **Dec 28** | **Freeze.** No merges after Mon, Dec 28 | Buffer; emails ready by Dec 30 | 4–6 | — |

**Delight tracks** would add D3 + D2.1 (about 2 sessions and 2–3 hours of her time) and D1.1–D1.2 in shadow mode (about 4 sessions and 4–6 hours) on top of these weeks.

---

## B9. The honest answer

**It doesn't all fit by Dec 28.** The required list is about **45–50 PR-sized sessions**. That's roughly twice what the payments plan scheduled for this window. Six of the new features (challenges, pods, insights, voting, badges, rescue codes) **have no spec yet**. Crew, rescue codes and promo codes sit on top of a billing foundation the plan had for February–May.

Agents can build that many PRs. But it would take **about 75–90 hours of Brittany's review, testing, spec and content time in five weeks, including Thanksgiving and the holidays**: 15–20 hours a week, with the vet track and the legal text running alongside. That's where it breaks.

### Option 1: keep Mon, Jan 4 and cut

Open with what the plan already had (C, the contact line, legal pages, the 180-day holds, content, the dry run), plus the new pieces that are cheapest and most visible on day one:

- chapter collections;
- Instagram share cards;
- Do good voting (which also delivers the promised founding vote);
- the vet settings file and switches;
- the care fixes (2.1–2.3, the translation check, /get credit).

**Move to a spring track** that ships before payments go live:

- challenges and buddy pods: better with real members to match;
- Flock insights: needs enough member data and a privacy change;
- the full badge set;
- Kya's Crew, rescue partner codes and membership promo codes. None can be bought before Jul 6 anyway, so building them alongside the billing foundation in Feb–May costs members nothing.

That's about 20–22 sessions and 10–13 hours a week of her time.

### Option 2: keep everything and move opening day

With specs written in the first two weeks, then building and reviewing at a pace of about 12–15 hours a week, everything fits a **code freeze of Mon, Feb 22 and an opening on Mon, Mar 1, 2027**.

**Trade-offs:**
- The free season stays Jul 6, 2027 (one setting), so it becomes about four months instead of six. Moving it to keep six months would push the first charges and the Jun 7 emails into September.
- The opening-day copy that says "January 4" changes (founding page, gift pages, website), and founders and the waitlist need to hear it from Brittany.
- Opening day moves with one admin setting, and unstarted grants re-date automatically.

**Recommendation:** Option 1. Jan 4 is in the copy, the founders' expectations and the gift pages. Crew, codes and promo codes can't earn anything before Jul 6. And challenges, pods and insights get better once real members are there.

---

## Docs that disagree with the payments plan (to retire or update)

- **CLAUDE.md:**
  - "Opening day" example uses `2027-01-05 00:00 America/Chicago` (truth: Mon, Jan 4, 00:00 America/New_York);
  - the chapter Resources tab is "empty until February" (truth: required before Jan 4).
- **`src/routes/_authenticated/flock.journeys.$journeyId.finished.tsx:12-14`:** "Badges come in February" (now required before opening).
- **`docs/flock/payments-plan.md` itself, older passages:**
  - the "state today" lines say `founding_deadline()` returns Jan 1, 2027 and there's no way to block (both out of date);
  - section i still lists "→ January 31" and "claims close January 31" for the website (truth: no closing date);
  - Crew, rescue offers and promo codes are scheduled after opening (truth: before Jan 4, decided Nov 21);
  - promo codes, challenges, pods, insights, voting, collections, badges and share cards aren't in its before-opening lists.
- **The website (Webflow)**, per the plan: "Annual $20 per month, billed annually", "your first six months free", "from the waitlist" (truth: $300 a year, free until Jul 6, open to anyone with an account). Not checked from the repo.
- **`docs/legal/drafts/2026-11-flock-legal-update.md`:**
  - the founding "vote" perk has no feature behind it;
  - it doesn't cover partner codes, promo codes, challenges, voting or badges.
- **`docs/BACKLOG.md`:** the translation check note says about 205 missing phrases (truth: 85 today).
- **Test fixtures** (`scripts/flock-shell.test.ts`) use Jan 5, 2027 sample dates (harmless; mirrors the old date).

No remaining app copy, email or CLAUDE.md line mentions $9.99, a Dec 31 or Jan 31 founding deadline, "6 months from opening" or "$20 a month yearly". The Dec 31 in `GIFT_SEND_LAST_DATE` is the last date a dated gift email can be scheduled, not the founding deadline.
