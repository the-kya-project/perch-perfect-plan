# The Flock: everything left before opening

> **Updated Nov 21, 2026 (later): there is no opening date.** Brittany opens the Flock when the waitlist is full and everything in `docs/BACKLOG.md` is done, and sets the free season's end and the payments timeline then. Everything in Tracks 0, 1 and 2 below is required before opening (nothing is cut). The in-scope delight items are D1.1–D1.3, D2.1, D2.2, D3 and D5.1; D4 and D5.2 are out of scope for now. **The build order now lives in `docs/BACKLOG.md`**, and this document keeps the findings behind it. The schedule and the "does it fit" answer that were here have been removed, since both rested on dates that no longer exist.

Status: **scoping only.** Written Nov 21, 2026 from `main` at `d8ec1f8`, read-only queries on production (`koyqdyamazuuwvqbttnj`), and the open and closed PRs. Nothing in code, settings, Supabase, Vercel, Stripe, RevenueCat, App Store Connect or Brevo was changed to write it.

**Scope rule (Brittany, Nov 21):** everything below is required **before the Flock opens**, including anything older docs call "post-launch". Nothing ships after opening unless Brittany decides to cut it.

**Source of truth:** `docs/flock/payments-plan.md` (PR #474, as updated through Nov 20). Where an older doc disagrees, the plan wins (the docs to retire are listed under "Docs that disagree", below). Decisions in force:

- The care app is free forever. App premium was removed on Nov 19 (#482). The journeys it would have included come with the Flock.
- The Flock: $30 month to month or $300 a year ($25 a month billed annually). Kya's Crew: $37 a month billed annually ($444 a year) or $45 month to month.
- Free for everyone until the free season ends (a setting Brittany fills in when she opens). **Founding claims have no closing date** (open until all 50 are claimed). The payments timeline is set when she opens.
- Gifts: six months or a year. **A gift redeemed during the free season starts when the free season ends; one redeemed after that starts on the day it's redeemed** (what's built: `20261120180000`, `20261120200000`).
- **Kya's Crew (with its sponsored rescue-adopter seat), rescue partner codes and promo codes are built fully before opening** (decided Nov 21), switched off until billing starts.

**How vet-related content is handled (Brittany, Nov 21).** Vet sign-off doesn't block building. We draft everything ourselves from published research, standard avian care guidance and Brittany's knowledge, then an avian vet checks and approves it. For every health-related feature:

- All thresholds, phrase lists and safety wording live in **one clearly labeled settings file**, each marked "draft, pending vet review" with its research source, so an approved change is a quick edit, not a rebuild.
- **Each health-related feature has its own off switch.** If approval isn't in by opening, that feature stays hidden and everything else opens.
- **Nothing that tells an owner something about their bird's health reaches real users until the vet approves it.** Until then it runs in shadow mode or for Brittany's account only.
- The free hard weight-loss safety alert uses **the most conservative values from the research** until the vet weighs in.

---

## Production today (read-only, Nov 21)

- `flock_enabled()` = admin **and** the kill switch on. One admin account. `flock_opens_at` is not set; `free_season_ends_at` still holds the Nov 19 value (unused until opening day is set; clearing it is a proposal). `journeys_enabled()` audience = off. The kill switch has never been flipped (`flock_settings.updated_at` Nov 7).
- `founding_deadline()` returns infinity (no closing date). 1 founding claim; 2 entitlement rows (one founding, one manual comp).
- All 150+ migrations in `main` are applied; nothing in production is missing from the repo.
- Content: 14 journey templates and 14 Today's ideas, all `draft` (the ideas are scheduled Nov 8–21, so **nothing is scheduled after that**); 0 library items; 0 chapter reviewers; 127 vet-nudge phrases, all `draft`.
- Scale: 62 accounts, 84 birds, 743 weigh-ins (172 in the last 30 days, 26 birds). The 1,000- and 10,000-user costs below are projections.

**Found during the cleanup, needs Brittany:** PR #490's migration `20261121120000_rls_policy_speedups.sql` has the **same version number** as `20261121120000_flock_founders_page.sql` (#491), which is already applied on production. If #490 merges as it is, Supabase will treat that version as already applied or refuse it, so the policy rewrite would not run. #490 needs its migration renamed to a new timestamp before it merges (PR 0.2 below). Nothing was changed on #490.

---

## B1. The payments plan's before-opening checklist

### Brittany's tasks (plan section e)

| Item | Status | What's left |
|---|---|---|
| Avian vet sign-off (diet thresholds, smoothed weight rules, vet-nudge lists) | **Not started** | Runs in parallel and never blocks building; part of the packet in B7. |
| Legal text (community terms, Flock privacy, guidelines, founding terms) | **Partly done** | Draft in `docs/legal/drafts/2026-11-flock-legal-update.md` (#476), decisions D1–D16 made Nov 19. D5 (price-change notice) still open; no lawyer review yet. Final text before 1.5 (legal pages). |
| Approve the copy (plan section i) | **Partly done** | App founding and gift copy is updated (#480, #481, #486, #487). The website (Webflow: home and `/community`, still "$20 per month billed annually" and "six months free") isn't checked or updated. |
| Approve content | **Not started** | 14 journey templates, Today's ideas for the first two weeks after opening (none scheduled), the Library's opening items (0), Start here posts (0). Now also the content for the new features in B3 (challenges, chapter collections, badges). |
| Approve PR C (the launch PR) | **Not started** | PR C isn't built yet (below). |
| Dry run on production | **Not started** | When Brittany decides to open: join → post → journey → report → block → kill switch, on web, iPhone, iPad and Duo. |
| Name reviewers | **Not started** | `flock_reviewers` is empty (admins review today). |
| Opening emails drafted in Brevo; the email to existing claimants | **Not started** | No draft exists. Brittany writes and sends them herself; nothing is scheduled. |
| Website (Webflow) | **Not started** | Founding card and `/community`, published at opening (list in the dates PR). |
| Open (SQL settings) | **Not started** | Set `flock_opens_at`, confirm `free_season_ends_at`, switch on PR C's setting. |

### The build (plan section f, PRs A–H)

| PR | Status | Evidence | What's left |
|---|---|---|---|
| A. Founding terms and deadline | **Done** | #478, #480, #481, #486; `founding_deadline_checks.sql` | The claimant email draft (Brittany) and Webflow copy. |
| B. Free-season grant | **Done** | #483, `20261120120000_flock_free_season_join.sql` | Nothing; `flock_join()` exists but nothing calls it until C. |
| **C. Opening the Flock to members** | **Built, merged dark** | #493, `20261122100000_flock_open_to_members.sql`, `flock_open_checks.sql`, `e2e/free-user/switch-on.spec.ts` | Switched on at opening with `admin_set_flock_members_open(true)`. The Community button is the only entry point: no Home invite card (Brittany, Nov 19, 2026). |
| **D. Member blocking (Apple 1.2)** | **Done** | #489, `20261121100000_flock_member_blocking.sql` (live), `BlockSheet.tsx`, `flock.you.blocked.tsx`, `flock_blocking_checks.sql` | The contact line inside the Flock came with #493 (Flock settings and the community guidelines). |
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
| **The full badge set** (care badges earnable by free users too) | Not started; **no spec** | Founder and Chapter lead badges only (computed, no table); skills from finished journeys; the care app's Moments milestones. `flock.journeys.$journeyId.finished.tsx` said badges would come later (fixed Nov 21) | Badge definitions and earned badges, awarding rules on care events (weigh-in streaks, health checks, a finished care plan) and Flock events, art for each badge. **Care badges show in the care app for free users**, which changes the free-user experience: needs Brittany's approval and before-and-after evidence. |
| **Kya's Crew + sponsored rescue-adopter seat** | Not started; **spec exists** (plan item 6d) | One code comment | It sits on top of the billing foundation (plan items 1–3: billing tables, Stripe billing webhook, card step), none of which exists, so **building Crew before opening pulls those forward**. Then: Crew plans (an `entitlements` check change, which needs approval), Crew counted as a Flock membership, 25% giving, no trial (sponsored seats aren't tracked: Brittany, Nov 23, 2026). **Selling it in the iPhone app** needs App Store products, RevenueCat and a native build reviewed by Apple; built dark before opening, and nothing is charged before the free season ends. |
| **Rescue partner codes** | Not started; partly specced (today: a 6-month comp "granted by hand", plan h6) | None | Partners and their codes (uses, expiry), a redeem step (on Join or like `/redeem`) that records the adoption and goes to approval, a six-month comp starting when the free season ends, an admin screen. |
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
- **f) Before opening:** **yes in shadow mode on Brittany's account**; not for real users until the vet approves.

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
- **f) Before opening:** **seasonal and holiday, yes**; weather is marginal.

### 3. Seasonal content calendar

- **a) Builds on:** `/admin/ideas` (the two-week schedule, Ready/Draft, move a day), which is Flock-only, so a care-app copy would be new.
- **b) Difficulty:** a reviewed file of dated cards (translated through the normal pipeline), **1 session**. An admin calendar tool, **about 2 sessions**. Recommended: the file first.
- **c) Monthly cost:** **$0**.
- **d) Risks:** a wrong-season card; translations drifting if the copy lives in the database. **Test:** every date resolves and every card exists in English and Dutch.
- **e) Dependencies:** none. Brittany writes or approves the cards.
- **f) Before opening:** **yes, as a file.**

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
- **f) Before opening:** **no**, alongside the Flock work. At most a typed-only prototype on Brittany's account.

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
- **f) Before opening:** **push-only, yes**; email only with sign-off.

---

## B5. Other care-app work

| Item | Finding | Plan |
|---|---|---|
| **Open app notices a new release** (rebuild of closed #431; reference branch `fix/native-release-catchup`) | **Likely cause of the flaky test:** the failing runs aren't slow; the page reset never starts (passes reset in about 1 s, failures sit at exactly 20 s). The startup guard's listener is in the page *after* the stylesheet tags and about 110 KB of inlined styles, while the code preloads come first. When the test's missing file answers instantly, the browser can report the failure before the guard is listening, and the app's fallback check can't see it either. On a fast local machine the guard wins every time (160/160). **Production has the same blind spot today.** | Five PRs: **(1)** move the guard to the very top of the page and keep a list of the page's code files; repeat the test 30× on WebKit in CI; **(2)** the version endpoint and rules; **(3)** the release check on open pages (launch, hourly, return to the app); **(4)** the Vercel Skew Protection unpin, which needs Brittany's decision on that setting; **(5)** the sitter-preview catch-up, checked in the iPhone Simulator. Pieces 1–3 before the freeze; 4–5 need a decision and a Simulator pass. |
| **Credit /get-page sign-ups** (`claude/busy-mccarthy-qntx5t`) | One commit (Oct 22) and 2 files; it still applies cleanly to current main. | Cherry-pick onto a new branch, run `npm run test:get-app`, confirm the postcard link lands on `app.thekyaproject.com` (the credit only carries within one site), open the PR. About half a session. |
| **Translation check on main** | It fails with **85 missing English phrases** (not ~205; that was the Oct 14 count in the backlog), all from the Library build (22 `flock.library.*`, 63 `flock.libraryAdmin.*`), plus 2 stale keys. Nothing runs the check in CI, which is how it drifted. Separately, Dutch is missing keys that free users see today: `clipRecorder` (6), `gift` (37), `giftThanks` (17), `redeem` (21). The Flock's 846 Dutch keys can wait for a decision on a Dutch Flock. | One PR: extract (+85/−2), translate the user-facing Dutch gaps, run the parity check, and add `i18n:check` to CI so it can't drift again. |

---

## B6. Every unfinished item as PRs

**"Needs Brittany"** is always yes for anything involving payments or real money, email or push to real users, care-app database changes, vet-reviewed content, legal text, or copy she approves. **"Overnight alone"** means an agent can build it to a reviewable PR without a decision partway through (the agent merges it itself only when CLAUDE.md's merge rules all pass; otherwise it holds it for Brittany). Sizes: S = under one session, M = one, L = two to three, XL = four or more.

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
| 1.5 | Legal pages (G) | `/terms` and `/privacy` carry the approved community, billing and age text | M | Final legal text, 1.3 | No | Yes: legal |
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
| 1.15 | Kya's Crew + sponsored seat | Crew plans exist (dark), count as membership and record 25% giving | L | 1.14 | No | Yes: payments, entitlements change |
| 1.16 | Rescue partner codes | Partners get codes; an adopter redeems one and, once approved, gets six months starting when the free season ends | L | 1.15, spec | After spec | Yes: grants access |
| 1.17 | Membership promo codes | Codes work on the card step with founding/regular rules (Apple offer codes listed for May) | M | 1.14 | No | Yes: payments |
| 1.18 | **C. The launch PR** | Members can join (18+, guidelines accepted), the one entry point is in place, the free-user check asserts exactly that; it merges dark and is switched on with SQL on opening day | L | 1.1, 1.5 (switching on) | No | **Yes: the launch decision** (built and merged dark, #493) |
| 1.19 | Today's ideas and content loading | Ideas `ready` for the first two weeks after opening, templates approved, library and Start here items in | — (her time) | Content approval | n/a | Yes |

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

**The settings file is [`src/lib/healthRules.ts`](../../src/lib/healthRules.ts)** (PR 1.2, #515). It lists every threshold and phrase list below, each marked "draft, pending vet review" with its source and where the app uses it, plus the language-file keys for each area's wording. `npm run test:health-rules` checks the app's code against it, and `supabase/checks/health_rules_checks.sql` checks the database (`journey_settings`, `flock_vet_signs`, the nectar-eater block). Each health feature has its own switch in `public.health_features` (`src/lib/healthFeatures.ts`). Start the packet from that file; areas 2–4 and 9–13 below are wording and content, which still live where listed. The packet should contain:

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

## B8–B9. Schedule and fit (removed Nov 21)

The week-by-week schedule and the "does it fit" answer were removed when Brittany decided there is no opening date. The order of work is `docs/BACKLOG.md`. Brittany's review time is still the limit, so one item at a time per area, with her approvals batched, keeps it moving.

## Docs that disagreed (fixed Nov 21)

The stale lines found here (CLAUDE.md's opening-day example and the chapter Resources tab note, the payments plan's fixed dates and old deadline rows, the backlog's translation count, the old badges comment) were fixed in the PR that removed fixed dates. The legal draft and the website are left for Brittany; that PR's description lists what each needs.
