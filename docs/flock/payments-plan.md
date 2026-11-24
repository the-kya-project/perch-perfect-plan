# The Flock: payments plan

Status: **plan of record, for Brittany's review.** Nothing in code, settings, App Store Connect, Stripe or the database was changed to write it.

**There is no opening date (decided Nov 21, 2026).** Brittany opens the Flock when the waitlist is full and everything in `docs/BACKLOG.md` is done, and she'll say when. When she decides, she also sets **the free season's length** and **the payments timeline**. Until then, nothing in code, copy, docs or the backlog names an opening date, a code-freeze date, a free-season end or a payments date. This plan describes the order of things relative to those three moments:

- **opening day**: `flock_settings.flock_opens_at`, set by Brittany when she opens;
- **the free season's end**: `flock_settings.free_season_ends_at`, set by Brittany at the same time;
- **payments going live**: chosen by Brittany at the same time, comfortably before the free season ends.

History, short: written Nov 17, 2026. Rewritten Nov 18 for the free-season decisions. Changed Nov 19: no founding deadline; the yearly plan offered from opening day; no automatic emails to members; app premium removed (#482); Kya's Crew priced. Changed Nov 21: the fixed opening, free-season and payments dates were removed. Earlier versions with those dates are in git history.

---

## The decisions

1. **Opening day** is chosen by Brittany when the waitlist is full and the build list is done. It's stored in `flock_settings.flock_opens_at`, set with one SQL call.
2. **The free season.** Everyone who joins the Flock during the free season is free until it ends. The end is **one stored date for everyone** (`flock_settings.free_season_ends_at`), set when Brittany opens. Someone who joins late in the free season is free until that same date, not for a fixed length from joining. Nobody is charged before it.
3. **Prices.** The founding members (the first 50) keep **$15 a month, locked for life once billing starts**, and lose it if they cancel. The **regular price after the free season is $30 month to month, or $25 a month billed annually ($300 a year)**, both offered from opening day, and nobody is charged before the free season ends.
4. **Founding claims have no closing date.** They stay open until all 50 spots are claimed (`private.founding_deadline()` returns infinity, `20261119160000_founding_no_deadline.sql`). Pages don't mention a date or say "until all 50 are claimed".
5. **No card before or at opening.**
   - About 30 days before the free season ends, Brittany emails everyone asking them to add a card on the web ($0 due, first charge when the free season ends). She sends it herself from Brevo; the app doesn't send it.
   - **Founders who haven't added a card by the end of the free season lose their founding spot.**

### How the plan applies them

- **The free season ends on one stored date for everyone.** It's its own setting, `flock_settings.free_season_ends_at`, set together with opening day rather than worked out from it.
- **Founders get the same free season.** Their `free_until` is the free season's end (`place_grant`, `20261119150000_founding_free_season_end.sql`).
- **Who can join:** anyone with a Kya & Co. account, on the web, iPhone or Android, by a "Join the Flock" step. It grants a free-season membership until `free_season_ends_at` (`flock_join()`, built in PR B).
- **At the end of the free season, a member with no card on file** loses Flock access.
  - Their posts, journeys and profile are kept, and they can rejoin at $30 month to month or $300 a year by adding a card.
  - A founder with no card on file also loses the founding spot and the $15 price, for good.
- **Released founding spots aren't refilled.** A released claim still counts toward the 50.
- **Billing is simple:** every subscription started during the free season has `trial_end` = `free_season_ends_at`. There's no per-person trial length and no resync.
- **Until opening day is set, grants have no dates.** `place_grant` leaves founding, gift and free-season rows undated while `flock_opens_at` is empty. Setting opening day (and the free season's end) dates every unstarted grant at once.

---

## a) Pricing

| Plan | Decided | Where it's defined |
|---|---|---|
| **Founding** (Flock) | **$15 a month, locked for life once billing starts; lost on cancel** | `founding.price`; `founding_claims.locked_price_cents default 1500` (`20261022172114_founding_claims.sql`) |
| Founding: free time | **the free season, until `free_season_ends_at`** | `place_grant` |
| Founding: cap | 50 | `private.founding_cap()`; `spot_number between 1 and 50` |
| Founding: close | **no date: open until all 50 are claimed** | `private.founding_deadline()` returns infinity |
| Founding: card | **none at claim or opening; add one in the month before the free season ends, or lose the spot** | `founding.noCard`, `founding.noPayment` |
| Flock, regular | **$30 month to month after the free season** | `founding.regular` ("Regular price $25 a month billed annually, or $30 month to month."); the website's monthly plan |
| Flock, free season | **free for everyone who joins during the free season, until `free_season_ends_at`** | `flock_settings.free_season_ends_at`; the free-season grant |
| Flock, yearly | **$25 a month billed annually ($300 a year), offered from opening day, first charge when the free season ends** | `entitlements.plan = 'annual'`; the website's yearly plan |
| Flock, one year (gift) | **$300 one-off. The year starts on redemption, or when the free season ends if it's redeemed during the free season** | Vercel `STRIPE_PRICE_FLOCK_YEAR_GIFT`; `place_grant` |
| Flock, six months (gift) | **$150 one-off (PR #487), with the same start rule, running six months** | Vercel `STRIPE_PRICE_FLOCK_HALF_YEAR_GIFT`; `gift_purchases.plan = 'flock_half_year'`; `place_grant` |
| App premium | **Removed (Nov 19, PR #482).** No plan, trial or gift; the care app is free and its journeys come with Flock membership | removed in #482 |
| Kya's Crew | **$37 a month billed annually ($444 a year) or $45 month to month**, on sale when billing starts; includes everything in a Flock membership; 25% to rescue and conservation partners; each Crew member sponsors six free months for a new rescue adopter; no trial. **Built before opening** (Nov 21), switched off until billing starts | build item 1.15 in `docs/BACKLOG.md` |
| Rescue adopters | six months of free membership for anyone who adopts a parrot and applies within 60 days. **Built before opening as rescue partner codes** (Nov 21), starting when the free season ends | build item 1.16 |
| Chapter lead, comp | free, granted by admins | plans `chapter_lead`, `comp` |

### Pricing answers

1. **Pay before opening?** No card before or at opening; the card goes on in the month before the free season ends.
2. **Opening day and the free season's end:** set by Brittany when she opens.
3. **Regular price:** $30 month to month after the free season, or $25 a month billed annually ($300 a year).
4. **Yearly plan:** offered from opening day alongside monthly; both start billing when the free season ends. No yearly founding option.
5. **App premium: removed (PR #482).**
6. **Kya's Crew:** priced above; on sale when billing starts.
7. **Free trial:** once billing has started, new Flock members get 14 days free. Founders, rescue adopters and Kya's Crew get no trial.
8. **Apple prices:** $14.99 / $29.99 / $299.99 if App Store Connect doesn't offer exactly $15.00 / $30.00 / $300.00. The web stays $15 / $30 / $300. Kya's Crew follows the same rule.
9. **What "cancelled" means:** the membership actually ends. Turning off auto-renew doesn't count, and neither does a failed payment that recovers within the grace period.
10. **Giving:** 20% of every membership and gift (of what members pay, less refunds), 25% for Kya's Crew, and 40% of gifts on double-giving days.
11. **Currency:** USD only.
12. **Android:** web-only payment for now, with a check of Google Play's rules before anything paid appears in the Android app (h14).
13. **One end date:** yes, one free-season end for everyone.
14. **Gift time:** starts on redemption, or when the free season ends if redeemed during it.
15. **Rescue-adopter offer:** kept; built as rescue partner codes.

---

## b) Recommended setup

**Recommendation: Stripe for web (including all founding billing), plus RevenueCat for in-app purchase in the iOS app (and later Android), with one source of truth in Supabase.**

Why this split:

- **Founding billing on Stripe.**
  - Stripe can start billing on an **exact date** (`trial_end` = `free_season_ends_at`). Apple's free trials come only in fixed lengths counted from the purchase date, so they can't end on a chosen date.
  - Stripe can enforce "cancel and the price is gone". On Apple, a lapsed subscriber can resubscribe to the same product outside the app at the old price.
  - It's 50 people, at about 3% instead of 15–30%.
- **RevenueCat for iOS in-app purchase.** It wraps StoreKit 2 (receipts, server notifications, renewals, billing retry, restore) and sends one webhook to us. Free until $2.5k a month in tracked revenue, then 1%.
- **Don't route Stripe through RevenueCat.** The existing gift webhook pattern writes straight to Supabase; keep it. RevenueCat's webhook writes the Apple and Google rows.

**Apple's rules that shape this** (check the current text before submitting):

- **3.1.1:** digital subscriptions sold *inside* the iOS app must use in-app purchase.
- **3.1.3(b) multiplatform:** someone who subscribed on the web may use the membership in the app, *provided the same items are also available as in-app purchases*.
  - **During the free season nothing is sold anywhere, so free access in the app is fine with no in-app purchase.**
  - In-app purchase has to be live by the time paid memberships exist, which means before the card emails go out.
- **US storefront only:** since the May 2025 *Epic v. Apple* order, US apps may link to web purchase. Apple appealed. Confirm it's still in force before relying on it; outside the US it isn't allowed without Apple's entitlement.
- **Emailing customers** about web prices is allowed, so the "add your card" email can link to the web.
- **3.1.2:** the paywall must show the price, period, auto-renewal, how to cancel, and links to the EULA and Privacy Policy, plus **Restore purchases**.
- **5.1.1(v):** account deletion must say an Apple subscription is cancelled in Apple's settings.
- **1.2 (user-generated content):** the app needs a way to filter, report and **block** abusive users, and **published contact information**. Reporting and blocking are built (#459, #489); the contact line inside the Flock is build item 1.1.
- **Commission:** 30%, or **15% in the Small Business Program** (enroll), and 15% after a subscriber's first year.

**Inside the iOS app:** the card step is a web page reached from the card email. Opened inside the app, it hides the Stripe button when `isNativeApp()` and says "open this link in your browser". From the card emails on, the app shows only the in-app purchase paywall.

---

## c) How paid status reaches the app

**One source of truth:** `public.entitlements`, read through `is_flock_member()`. Its rule already fits payments: `active`/`trialing` = access; `past_due`/`canceled` = access until `current_period_end`.

**Writers (all server-side; app users still have no write access):**

| Source | Writes | Keyed on |
|---|---|---|
| Founding claim, gifts, comp | existing triggers and admin functions | `founding_claim_id`, `gift_purchase_id`, manual |
| **Free-season join** (PR B, built) | one row per member: `plan = 'comp'`, `source = 'free_season'`, **`status = 'active'`** (never `trialing`), ending at `free_season_ends_at` | user id (one per person) |
| **Stripe billing webhook** (build item 1.14) | `source = 'stripe'` rows | `external_ref` = Stripe subscription id |
| **RevenueCat webhook** (iOS track) | `source = 'apple'` / `'google'` rows | `external_ref` = original transaction id |

**The free-season row** (decided and built, PR B): `plan = 'comp'` with `source = 'free_season'`, status `active`. Why not `trialing`: Stripe rows use `trialing` for a real trial that converts to a charge, so a free-season row must never look like one. A check constraint (`entitlements_free_season_shape`) holds every free-season row to comp + active, with no `external_ref`, `free_until`, founding claim or gift. **Billing rule:** billing code never reads, converts, charges or counts down a `source = 'free_season'` row. A member who adds a card gets a separate Stripe row; the free-season row just ends on its date. Free-season rows also never queue or stretch a gift.

**Additive schema for billing (build item 1.14):**

- `billing_customers` (user ↔ Stripe customer);
- `billing_events` (provider, event id, unique; idempotency and audit; never content);
- `entitlements` gains `product_id`, `will_renew` and `cancel_at_period_end`;
- a paid row's `plan` comes from the price: Regular $30/month → `monthly`, Regular $300/year → `annual`, Founding $15/month → `founding`;
- `founding_claims` gains `released_at` (no card by the end of the free season) and `forfeited_at` (a paid founding membership that ended).

**Webhooks never trust event order:** on any event, re-read the subscription from Stripe or RevenueCat and write the row from that, as `record_gift_purchase` does. A database error returns 500 so the provider retries.

**Identity:** the RevenueCat `app_user_id` and the Stripe customer metadata hold the Supabase user id. RevenueCat is configured only after sign-in.

**Events:**

| Case | Stripe (web) | Apple via RevenueCat | Entitlement row |
|---|---|---|---|
| Add card before the free season ends | `checkout.session.completed`, `customer.subscription.created` (trial to `free_season_ends_at`) | n/a | `trialing`, `current_period_end` = season end |
| Subscribe after the season | the same, no trial | `INITIAL_PURCHASE` | `active` |
| Renew | `invoice.paid` | `RENEWAL` | `active`, new period end |
| Turn off auto-renew | `subscription.updated` (`cancel_at_period_end`) | `CANCELLATION` | access to period end, `will_renew = false` |
| Turn it back on | `subscription.updated` | `UNCANCELLATION` | `will_renew = true` |
| Ends | `customer.subscription.deleted` | `EXPIRATION` | `canceled`; **founding: `forfeited_at`** |
| Failed payment | `invoice.payment_failed` (Smart Retries) | `BILLING_ISSUE` (16-day grace) | `past_due`, access through the grace period |
| Refund | `charge.refunded` | `CANCELLATION` (`CUSTOMER_SUPPORT`) | a full refund ends access now; a partial one keeps it |
| Restore (iOS) | n/a | `restorePurchases()`, then `syncMyPurchases` | row reappears; transfer setting "keep with original" |
| Free season ends, no card | n/a | n/a | the free-season row simply ends; a founder's claim gets `released_at` (end-of-season job) |
| New device | access follows the Supabase account | | |
| Account deletion | cancel the Stripe subscription in `deleteMyAccount`; tell iOS users to cancel in Apple | | rows cascade, as today |

---

## d) Billing founding pricing correctly after the free season

**Web (Stripe), for all 50 and for regular members who pay on the web:**

- **Products:** one product, "The Flock", with a **Founding $15/month** price that is never edited (that's the lock), a **Regular $30/month** price and a **Regular $300/year** price. A price change later is a new price object; founding subscriptions keep theirs.
- **The card step (opens about 30 days before the free season ends):** Checkout `mode=subscription`, `subscription_data.trial_end = free_season_ends_at`, card collected, **$0 due**.
  - A founder with a claim that isn't released or forfeited gets the founding price.
  - Everyone else picks monthly ($30) or yearly ($300). Both use the same `trial_end`, so a yearly member's first $300 charge is on the free season's end and renews on that date each year.
  - The server function checks this; the native app never shows it.
- **Emails (Brittany sends all of them from Brevo; the app sends none):**
  - "Add your card" about 30 days before the free season ends, to every member with a free-season or founding row and no subscription;
  - suggested reminders about a week before and the day before the end;
  - after the end, "your free season ended" (regular) or "your founding spot was released" (founder).
  - The app's part is the lists: `/admin/members` and `/admin/founding` export, as CSV, who has a card on file and who doesn't (founders and everyone else separately), with first names and emails, so she can upload a list to Brevo and send. The card step's own screen shows "card on file, first charge on {date}" instead of a confirmation email.
  - **Stripe's own customer emails are turned off** (Stripe Dashboard → Settings → Customer emails), so Stripe doesn't email members either. Apple and Google send their own purchase receipts for app-store subscriptions; those can't be turned off.
- **End of the free season:** a database job runs once, just after `free_season_ends_at`. For every founder without a subscription, it sets `released_at`. **It sends no email**; the "founding spot released" list appears in `/admin/founding` for Brittany to email. Free-season rows end on their own date. The job never releases a founder who has a subscription, even a `past_due` one.
- **Founders who add a card and then cancel before the season ends:** the subscription ends at the trial end, and the price is forfeited then.
- **Cancelling:** through the Stripe Customer Portal. **Turning off auto-renew is reversible until the period ends; the founding price is forfeited only when the subscription actually ends.**

**iOS (Apple):**

- **Introductory offers** are once per subscription group per Apple ID, in fixed lengths only, so they can't end on the free season's end.
- **Offer codes** are whole months only.
- **Recommendation:**
  - Don't sell founding in the app.
  - **Show no in-app paywall during the free season** (the app says "Free until {free season end}" once that's set).
  - From the card emails on, the paywall offers the regular plans (monthly and yearly). Free-season members who subscribe in the app before the season ends are charged on the purchase day, so the paywall should say so, and (in the US storefront, if the court order still stands) mention adding a card on the web at no charge until the season ends.
  - After the free season, new Flock members get a 14-day free trial (an Apple introductory offer); founders, rescue adopters and Kya's Crew get none.
  - When the account has a claim, it says "Founding members: check your email".

**Promotion codes for memberships (backlog 1.17, built switched off):**

- **The rule (Brittany, Nov 22, 2026):** codes apply to the regular Flock plans (monthly, yearly) and Kya's Crew, never to the $15 founding price. A code stacks with a trial.
- **Web (Stripe):** the card step's Checkout shows Stripe's own "Add promotion code" field for every plan except founding (`promotionCodesAllowed` in `src/lib/billing.ts`). A founder never sees it. If a discount reaches a founding subscription another way (the Customer Portal, the Dashboard), the billing webhook takes it off (`discountsToRemove`) and records "discount removed" on the event. It doesn't look at discounts on the Stripe customer itself, so never put a coupon on a founder's customer.
- **Codes are made in the Stripe Dashboard** (coupon, then promotion code), in test mode until billing starts. Nothing in the app creates or lists them. Founding and regular share one product, so a coupon can't be limited to the regular prices in Stripe; the app's rule is what keeps founding out.
- **How a code stacks with a trial:** the trial runs first (the free season, or the 14-day trial once 6f is built), and the code applies to the paid invoices after it. Worked examples, with the free season ending on "the season's end":

  | Member | Code | Today | After the season's end |
  |---|---|---|---|
  | Monthly ($30), card added during the free season | 20% off for 3 months | $0 | $24 for 3 months, then $30 (see the caveat below) |
  | Yearly ($300), card added during the free season | $50 off once | $0 | $250 for the first year, then $300 |
  | Monthly, card added during the free season | 100% off for 1 month | $0 | first paid month free, then $30: the free season and the free month both count |
  | Monthly, after the season, with the 14-day trial (6f) | 20% off for 3 months | $0 for 14 days | then $24 for 3 months, then $30 |
  | Founder ($15) | any | no code field | $15 |

  **Caveat to confirm in test mode:** Stripe counts a "for N months" code from when the subscription starts, trial included. A member who adds a card two months before the season's end with "20% off for 3 months" may get only one discounted month, not three. A "once" code during a long trial needs the same check. If Stripe does count that way, "whichever is best for the member" points to making free-season codes "forever" or "once", or to a later build that applies the code at the season's end.
- **iPhone (Apple offer codes), for when the iPhone paywall is built:** offer codes are set up per subscription in App Store Connect and come in whole months only. Founding isn't sold in the app, so no founding code is needed. The ones to create, mirroring the Stripe codes in use:

  | Stripe code | Apple offer code | Plans |
  |---|---|---|
  | N months free (100% off for N months) | Free, N months | Flock monthly, Flock yearly, Crew monthly, Crew yearly |
  | X% off for N months | Pay as you go, N months at the reduced monthly price | Flock monthly, Crew monthly |
  | Amount off the first year | Pay up front, 12 months at the reduced price | Flock yearly, Crew yearly |
  | Forever discounts, or days rather than months | No match: don't offer it in the app | none |

  Apple sets its own rules on whether an offer code combines with an introductory offer (the 14-day trial); check them in App Store Connect when the paywall is built.

---

## e) What Brittany does by hand, in order

### Before opening (any time)

| Task | Effort |
|---|---|
| **Avian vet review** of everything in the vet packet (`docs/flock/opening-scope.md` B7): the diet conversion weight rules, the vet-nudge phrase lists, the health check, the weight baseline values, and the safety content. The review runs in parallel and never blocks building. A health feature without approval stays switched off at opening; everything else opens. | your time: 1–2 hours; the vet's: days to weeks |
| **Legal text:** community terms, Flock privacy, community guidelines, updated founding terms. Draft in `docs/legal/drafts/2026-11-flock-legal-update.md`. | 2–4 hours plus optional legal review |
| **Specs** for the items under "Waiting on Brittany's spec" in `docs/BACKLOG.md` | 1–2 hours each |
| **Approve copy and content:** journey templates and milestones, Today's ideas for the first two weeks after opening, the Library's opening items, the Start here posts, chapter collections | 4–6 hours |

### When you decide to open

The checklist is at the end of `docs/BACKLOG.md` ("When Brittany says we're opening"): set opening day and the free season's end, set the payments timeline, dry run, name reviewers, code freeze, opening emails and website, then open. The SQL:

```sql
select public.admin_set_flock_dates('<opening> America/New_York', '<end> America/New_York');
```

### Before payments go live (once the timeline is set)

| When, relative to payments going live | Task | Effort |
|---|---|---|
| well before | **App Store Connect:** the Paid Apps agreement, banking and tax forms (1–3 business days to verify the bank); Small Business Program enrollment (about 2 weeks) | 30 minutes of forms |
| a month before | **Sales tax:** confirm with your accountant how each state treats a digital membership, before Stripe Tax is registered and live prices go on | 1 meeting |
| a month before | **Android:** confirm Google Play's current billing rules for digital subscriptions in the US. **Nothing paid appears in the Android app until this check is done** (h14) | 1–2 hours of reading |
| three weeks before | **Stripe:** Stripe Tax registration; products and prices in test, then live; Customer Portal; the billing webhook secret into Vercel; **turn off Stripe's customer emails** | about 2 hours |
| three weeks before | **App Store Connect:** subscription group "The Flock" (monthly and yearly, plus Kya's Crew); Billing Grace Period (16 days); Server Notifications V2 to RevenueCat; an In-App Purchase key | 2 hours |
| three weeks before | **RevenueCat:** project, iOS app, products, entitlement `flock`, offering, webhook and secret | 1–2 hours |
| three weeks before | **EULA link** on the paywall and the privacy policy line about payment processors | 30 minutes |
| three weeks before | **Submit the iOS build with the in-app purchase products**, allowing a week for a first-subscription rejection and resubmit | 1 hour plus review time |
| the day | **Payments live:** Stripe and in-app purchase; a dry run with your own founding claim | 1 hour |
| about 30 days before the free season ends | **You send the "Add your card" emails** from Brevo, to the no-card lists (then the reminders) | 1–2 hours each |

---

## f) The build as small PRs

Every PR follows the Flock safety rules: database changes are additive only (anything else needs Brittany's approval in that PR), a "Free-user impact" section, and the free-user regression check green.

**The build order, sizes, dependencies and what needs Brittany are in `docs/BACKLOG.md`**, the single build list. Status of the original plan PRs:

- **A. Founding terms and deadline:** done (#478, #480, #481, #486).
- **B. Free-season grant:** done (#483).
- **C. Opening the Flock to members (the launch PR):** backlog 1.18; **built (#493), merged dark**, switched on at opening when Brittany decides (`select public.admin_set_flock_members_open(true);` once opening day is set; CLAUDE.md, "Opening to members"). A "Join the Flock" screen with a required "I'm 18 or older" confirmation, `flock_enabled()` true for members, the one approved entry point (decision h1), and an updated free-user regression check. Merged dark and switched on with a setting.
- **D. Member blocking (Apple 1.2):** built (#489); the contact line is backlog 1.1.
- **E. Stickiness events:** done (#488).
- **F. Gift time starts at the free season's end when redeemed during it:** done (#487).
- **G. Legal pages:** backlog 1.5.
- **H. Founding members page:** done (#491).

**Payments build** (spec for backlog items 1.14, 1.15, 1.17; ready well before payments go live):

1. **Billing schema** (section c), with `supabase/checks/billing_checks.sql`.
2. **Stripe billing webhook**, `/api/public/stripe/billing`, with its own secret and fixture tests (`npm run test:billing`). It returns 503 without the env var.
3. **Card step**, `/flock/membership`: choose monthly ($30) or yearly ($300) and add a card ($0 due until the season's end), or "card on file, first charge on {date}", with a Customer Portal link. The founding price applies to unreleased claims. Never shown in the native app; behind `BILLING_ENABLED`.
4. **Email lists, not emails.** CSV exports from `/admin/members` and `/admin/founding`. **No cron hook and no email is sent by the app.**
5. **End-of-season job:** release founders without a subscription. It sends no email.
6. **Admin view**, `/admin/founding` and `/admin/members`: free season, card on file, past due, released, forfeited.
   - 6a. **Failed founding payment alert** to Brittany only (like the save-error alerts); nothing changes automatically.
   - 6b. **Deleting a post keeps it hidden for 180 days** (legal draft D10): backlog 1.3.
   - 6c. **Removed content and reports deleted after 180 days** (legal draft D9): backlog 1.4.
   - 6d. **Kya's Crew** (backlog 1.15): `crew_monthly` / `crew_annual` (an `entitlements` check change, which needs Brittany's approval), counted by `is_flock_member()`, 25% giving, no trial (sponsored seats aren't tracked: Brittany, Nov 23, 2026); Stripe and App Store products.
   - 6f. **14-day free trial** after the free season, for new subscribers only.
   - 6g. **Cancel online** in Membership and billing.
   - 6h. **Yearly renewal reminder** list for Brittany to send (ask the lawyer whether a reminder sent by hand meets California's automatic renewal law).
7. **iOS:** native plugin build (`@revenuecat/purchases-capacitor`, guarded by `nativePluginAvailable("Purchases")`), RevenueCat webhook and `syncMyPurchases`, the iOS paywall inside `/flock`, and account deletion and settings text for subscriptions. Ship the plugin build early enough that most people have it before payments go live.

**Later:** Android Play billing (only after the Google Play check, h14).

---

## g) Order of events (no dates)

1. **Now, until Brittany decides to open:** work the build list (`docs/BACKLOG.md`); the vet review, legal text, specs and content run alongside.
2. **Brittany decides to open:** she sets opening day, the free season's end and the payments timeline; dry run; code freeze; she sends the opening emails.
3. **Opening day:** the settings switch the Flock on for members. Health features without vet approval stay off.
4. **During the free season:** the payments build finishes in test mode; App Store, RevenueCat and Stripe set up (section e); the iOS plugin build ships.
5. **Payments go live**, comfortably before the free season ends.
6. **About 30 days before the free season ends:** Brittany sends the "add your card" emails; the iOS paywall appears.
7. **The free season ends:** first charges; founders without a card released; free-season access ends for members without a card.

**If it gets tight before payments:** move the payments date (and, before opening, the free season's end) rather than skipping the webhook's idempotency or the end-of-season job's safety check.

---

## h) Decisions

| # | Decision | Decided |
|---|---|---|
| 1 | How non-members find the Flock in the care app | **One entry point only:** a "Community" button where admins see it today. No Home invite card (Brittany, Nov 19, 2026: a promotional card for free users feels too salesy). Everything else in the care app stays identical. |
| 2 | One end date for the free season | **Yes, one stored date for everyone** (`flock_settings.free_season_ends_at`), set when Brittany opens. |
| 3 | Who can join | **Anyone with a Kya & Co. account, on any platform.** |
| 4 | Released founding spots | **Not refilled.** Show the real count. |
| 5 | Gift time | **Starts on redemption, or when the free season ends if redeemed during it** (PR F); `/gift` and `/redeem` say so without naming a date. |
| 6 | The rescue-adopter offer | **Kept;** built before opening as rescue partner codes (backlog 1.16). |
| 7 | Where founders are billed | **Web/Stripe only;** no founding product in the App Store. |
| 8 | When the founding price is lost | **When the membership ends,** not when auto-renew is turned off; a payment that recovers within grace doesn't count. A founder released at the free season's end loses it too. |
| 9 | iOS in-app purchase timing | **Live when payments go live.** The plugin build ships during the free season. |
| 10 | Paywall during the free season | **None.** The iOS paywall appears with the card emails, and in-app purchases bill from the purchase day. |
| 11 | Sales tax on web | **Stripe Tax on** (about 0.5%). Confirm state treatment with your accountant before going live. |
| 12 | Refunds | Cancel any time; a full refund on request within 14 days of a first payment on a plan or of a yearly renewal, otherwise none; a member removed for breaking the rules gets the unused time refunded. A full refund ends access. Apple and Google purchases follow the store's process. |
| 13 | Giving share | **20% of every membership and gift, 25% for Kya's Crew, 40% of gifts on double-giving days.** |
| 14 | Android | **Web-only payment for now.** Confirm Google Play's current US billing rules before anything paid appears in the Android app. |
| 15 | App premium | **Removed (PR #482).** |
| 16 | Missed card deadline (founders) | **No automatic grace;** you can restore a released founder by hand within 14 days of the free season's end. |
| 17 | Opening day | **Chosen by Brittany when the waitlist is full and the build list is done** (Nov 21). |
| 18 | Founders' card flow | **No card before or at opening;** add a card in the month before the free season ends, or the spot is released. No closing date for claims. |
| 19 | Yearly plan | **$25 a month billed annually ($300 a year) from opening day, alongside $30 month to month;** both billed from the free season's end. |
| 20 | Apple prices | **$14.99 / $29.99 / $299.99** if exact prices aren't offered. |
| 21 | Currency | **USD only.** |
| 22 | Founding members page | **Opt-in**, built in PR H (#491). |
| 23 | Fixed dates | **None** (Nov 21): no opening, free-season, payments or freeze date in code, copy, docs or the backlog until Brittany sets them. |

---

## i) Where dates appear, now that none are fixed

Removed from member-facing copy on Nov 21 (the founding page, gift and redeem copy, gift emails, the Flock-only sheet, the membership line); every line is listed with its before-and-after in the PR that removed them. Once Brittany sets opening day and the free season's end, the copy can show those dates read from the settings (a proposal in that PR, since the public pages can't read the settings yet).

The database still holds one value that names a date: `flock_settings.free_season_ends_at` (and its column default) from Nov 19. **It isn't used until opening day is set**, because grants stay undated until then. Clearing it is a proposal waiting for Brittany (it changes production data).

`GIFT_SEND_LAST_DATE` (`src/lib/gifts.ts`) limits how far ahead a *dated gift email* can be scheduled. It isn't an opening or free-season date. Making it a rolling window is a separate proposal (it changes the gift checkout).

The website (Webflow) is edited by hand; the list of pages and lines is in the PR description.

---

## What we're learning in the free season

The free season is the best chance to learn whether the Flock is worth $30 a month before anyone pays it. The events are built (PR E, #488; `docs/flock/analytics.md`): weekly active members, joins and where they come from, journey starts and completions, Library reads, contributions, and coming back without being reminded. All fire only from Flock code and carry **no content**.

**The numbers to watch in the PostHog dashboard "Flock stickiness":**

- weekly active members ÷ members, by join week;
- the share of members active in 3 or more of their first 4 weeks;
- journey completion within 30 days;
- the share of weekly actives who contributed;
- the share of active days that started `direct`.

Check the dashboard monthly, and once more before the card emails, so pricing decisions (monthly vs. yearly mix, reminders) rest on real retention.
