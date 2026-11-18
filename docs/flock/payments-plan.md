# The Flock: payments plan

Status: **plan only, for Brittany's review.** Nothing in code, settings, App Store Connect, Stripe or the database was changed to write it.

- **Nov 17, 2026:** first written.
- **Nov 18, 2026:** rewritten for the **free-season decisions** below. They replace the earlier "Decision 1" (founders add a card within 14 days of opening day), which is withdrawn.
- **Nov 18, 2026 (later):** opening day set to **Mon, Jan 4, 2027** and the free season's end to **Tue, Jul 6, 2027**; every remaining decision and pricing question decided (section h). Merged as the plan of record.

What was read:

- the repo (`main` at `6d64a11`), including the Flock migrations, the `/founding` and `/gift` code and copy, and the Stripe gift code;
- the production database (read-only counts and function bodies);
- the Vercel environment variable *names and comments* (no values);
- App Store Connect, through its API (read-only);
- PostHog (read-only event counts);
- the public pages of thekyaproject.com (home and `/community`).

**State today, as observed:**

- **App Store Connect:** app `6795267221` has **no subscription groups, no in-app purchases and no promoted purchases**. The API can't show whether the Paid Apps agreement, banking and tax forms are done, so check those under *Business*.
- **Stripe:** live in production for gifts only. There are two one-time prices: Flock year $300 and app premium year $79. The webhook is at `/api/public/stripe/webhook`.
- **Database:**
  - `flock_settings.flock_opens_at` is **not set**, and `ui_enabled` is on.
  - `private.founding_deadline()` returns `2027-01-01 05:00 UTC`, which is the end of Dec 31 in Indianapolis.
  - There's **1 founding claim** (Oct 22, locked at 1500 cents) and **23 waitlist sign-ups**.
  - The entitlements are one `founding/trialing` and one manual `comp`. No gift has been redeemed, and no Stripe, Apple or Google entitlement rows exist.
- **Native app:** none of the installed builds contains a purchases plugin. Web code reaches every build at once (remote-URL mode), but **a new App Store build is required before any in-app purchase can happen.**
- **Legal pages:** `/terms` (last changed Oct 21) covers only the care app (bird profiles, plans, clips, sit links). It says nothing about posts or photos other members see, community conduct, moderation, memberships or billing. `/privacy` mentions "community" twice and isn't written for the Flock.
- **Member safety:** the Flock has reporting and a review queue (step 4B) but **no way to block another member**. Apple's guideline 1.2 asks apps with user-generated content to have both.

---

## The decisions (made Nov 18, 2026)

1. **Opening day is Monday, January 4, 2027** (00:00 Eastern). An earlier draft said Friday, Jan 1; "What depends on the date" below shows what that choice moves.
2. **Free season.** Everyone who joins the Flock during the first 6 months after opening day is free. **The free season ends Tuesday, July 6, 2027**, one stored date for everyone (`flock_settings.free_season_ends_at`). Nobody is charged before then.
3. **Prices.** The founding members (the first 50) keep **$15 a month, locked for life once billing starts**, and lose it if they cancel. The **regular price after the free season is $30 a month.**
4. **Founding claims close Jan 31, 2027, not Dec 31, 2026,** so people can try the Flock before claiming. The cap stays at 50.
5. **No card before or at opening.**
   - **About 30 days before the free season ends,** everyone gets an email asking them to add a card on the web ($0 due, first charge when the free season ends).
   - **Founders who haven't added a card by the end of the free season lose their founding spot.**

### How the plan applies them

All of these are decided (section h).

- **The free season ends on one date for everyone: Tue, Jul 6, 2027.** It's stored as its own setting, `flock_settings.free_season_ends_at`, set together with opening day rather than worked out from it. Someone who joins in May is free until July 6, not for 6 months from joining.
- **Founders get the same free season.** Their `free_until` is the free season's end. Today it's `flock_opens_at + 6 months` (`place_grant`), which with a Jan 4 opening would be Sun, Jul 4; PR B makes it Jul 6.
- **Who can join:** anyone with a Kya & Co. account, on the web, iPhone or Android, by a "Join the Flock" step. That step grants a free-season membership until `free_season_ends_at`. This is new. Today only founders, gift recipients, comps and admins can use the Flock (`private.can_use_flock`).
- **At the end of the free season, a member with no card on file** loses Flock access. Their posts, journeys and profile are kept, and they can rejoin at $30 by adding a card. A founder with no card on file also loses the founding spot and the $15 price, for good.
- **Released founding spots aren't refilled.** Claims are closed by July, and refilling would need an invitation flow nobody else uses.
- **Billing is simple:** every subscription starts with `trial_end` = `free_season_ends_at`, known from opening day. There's no per-person trial length and no resync.
- **The earlier 14-day card window is gone.** So are `card_due_at`, the day-7 and day-12 reminders, the waitlist invitation for released spots, and the 14-day release job.

### What depends on the date (Jan 4 chosen)

| What | Jan 1 (Fri), not chosen | **Jan 4 (Mon), chosen** | Notes |
|---|---|---|---|
| Opening moment | 00:00 Eastern, Jan 1 | 00:00 Eastern, Jan 4 | `flock_today()` uses New York time and the founding deadline uses Indianapolis time. Both are Eastern, so they agree. |
| Day of the week | New Year's Day, a holiday; you may not want to be on support duty | A working Monday | |
| Free season ends | Thu, Jul 1, 2027 | **Tue, Jul 6, 2027** | Six months from Jan 4 would be Sun, Jul 4, a holiday, so the stored date is Jul 6: first charges and "your free season ends today" emails don't land on the Fourth. |
| "Add your card" email (about 30 days before) | about Tue, Jun 1 | **Mon, Jun 7** | Reminders on **Tue, Jun 29** and **Mon, Jul 5**. |
| Founders' `free_until` | Jul 1 | **Jul 6** | Comes from `free_season_ends_at` once PR B lands. |
| Founding claims close | Jan 31 (30 days after opening) | Jan 31 (27 days after opening) | The same either way. |
| Gift years (start at the free season's end, h5) | start Jul 1 | **start Jul 6** | |
| Pre-opening work (section e) | due Dec 31 | **due Sun, Jan 3**: one extra weekend, no extra working days | Jan 4 mainly buys a calmer opening day, not build time. |
| Opening-day emails | go out on New Year's Day | go out on a Monday | Monday email usually does better. |

---

## a) Pricing as it's defined right now (and what changes)

| Plan | Today, in code and copy | After these decisions | Where it's defined |
|---|---|---|---|
| **Founding** (Flock) | $15 a month | **$15 a month, locked for life once billing starts; lost on cancel** | `founding.price`; `founding_claims.locked_price_cents default 1500` (`20261022172114_founding_claims.sql`) |
| Founding: free months | first 6 months free, from opening day | **the free season, ending Tue, Jul 6, 2027** | `founding.locked`, `founding.next`; `place_grant` (`free_until = flock_opens_at + 6 months`, `20261107120000_flock_entitlement_grants.sql`) |
| Founding: cap | 50 | 50 | `private.founding_cap()`; `spot_number between 1 and 50` |
| Founding: close | end of **Dec 31, 2026**, Indianapolis | end of **Jan 31, 2027**, Indianapolis (`2027-02-01 00:00 America/Indiana/Indianapolis`) | `private.founding_deadline()`; copy `founding.deadline` |
| Founding: card | none at claim | **none at claim or opening; add one (from about 30 days before the end) by the end of the free season, or lose the spot** | `founding.noPayment`, `founding.noCard` |
| Flock, regular | "$30", period not stated | **$30 a month after the free season** | `founding.regular` "Regular price $30"; the website already says "Monthly $30 per month" |
| Flock, free season | doesn't exist | **free for everyone who joins in the first 6 months, until Tue, Jul 6, 2027** | new: `flock_settings.free_season_ends_at` and a free-season grant |
| Flock, annual | not defined; the schema has plan `annual` | **monthly only at launch; $300 a year later, once retention is known** | `entitlements.plan` check |
| Flock, one year (gift) | $300 one-off; the year starts at the later of redemption and opening day | **the year starts when the free season ends (Jul 6, 2027)** | Vercel `STRIPE_PRICE_FLOCK_YEAR_GIFT` comment; `place_grant` |
| App premium | $9.99 a month, "Coming soon" | **not in this build** | `flock.journeys.premium.*` |
| App premium, one year (gift) | $79 one-off | unchanged | Vercel `STRIPE_PRICE_APP_PREMIUM_YEAR_GIFT` comment |
| Rescue adopters (website) | "six months of free membership for anyone who adopts a parrot and applies within 60 days" (thekyaproject.com/community) | **kept; after the free season, a 6-month comp granted by hand from approval** | Website only; nothing in the app grants it |
| Chapter lead, comp | free, granted by admins | unchanged | plans `chapter_lead`, `comp` |

### Pricing questions (all answered Nov 18, 2026)

1. **Pay before Dec 31?** No card before or at opening; the card goes on from Jun 7, by the free season's end.
2. **Opening day:** Mon, Jan 4, 2027. The free season ends Tue, Jul 6, 2027.
3. **Regular price:** $30 a month after the free season.
4. **Annual plan:** monthly only at launch; $300 a year later, once retention is known. No annual founding option.
5. **App premium:** not in this build. A Flock membership includes it.
6. **Apple prices:** $14.99 / $29.99 if App Store Connect doesn't offer exactly $15.00 / $30.00. The web stays $15 / $30.
7. **What "cancelled" means:** the membership actually ends. Turning off auto-renew doesn't count, and neither does a failed payment that recovers within the grace period.
8. **Giving on subscriptions:** 20% after fees, like gifts, designed before the first charges on Jul 6.
9. **Currency:** USD only. Founders anywhere can pay by card on the web; Apple converts in-app prices itself.
10. **Android:** web-only payment for now, with a check of Google Play's rules before anything paid appears in the Android app (h14).
11. **One end date:** yes, Tue, Jul 6, 2027 for everyone.
12. **Gift years:** they start when the free season ends.
13. **Rescue-adopter offer:** kept; after the free season it's a 6-month comp granted by hand from approval.

---

## b) Recommended setup

**Recommendation: Stripe for web (including all founding billing), plus RevenueCat for in-app purchase in the iOS app (and later Android), with one source of truth in Supabase.** The free season doesn't change this; it changes *when* each piece must exist (section g).

Why this split:

- **Founding billing on Stripe.**
  - Stripe can start billing on an **exact date** (`trial_end` = `free_season_ends_at`). Apple's free trials come only in fixed lengths counted from the purchase date, so they can't end on July 6 for someone who buys in June.
  - Stripe can enforce "cancel and the price is gone". On Apple, a lapsed subscriber can resubscribe to the same product outside the app at the old price.
  - It's 50 people, at about 3% instead of 15–30%.
- **RevenueCat for iOS in-app purchase.** It wraps StoreKit 2 (receipts, server notifications, renewals, billing retry, restore) and sends one webhook to us. It's free until $2.5k a month in tracked revenue, then 1%.
- **Don't route Stripe through RevenueCat.** The existing gift webhook pattern writes straight to Supabase; keep it. RevenueCat's webhook writes the Apple and Google rows.

**Apple's rules that shape this** (check the current text before submitting):

- **3.1.1:** digital subscriptions sold *inside* the iOS app must use in-app purchase.
- **3.1.3(b) multiplatform:** someone who subscribed on the web may use the membership in the app, *provided the same items are also available as in-app purchases*.
  - **During the free season nothing is sold anywhere, so free access in the app is fine with no in-app purchase.**
  - In-app purchase has to be live by the time paid memberships exist, which means before the card emails go out in June.
- **US storefront only:** since the May 2025 *Epic v. Apple* order, US apps may link to web purchase. Apple appealed. Confirm it's still in force before relying on it; outside the US it isn't allowed without Apple's entitlement.
- **Emailing customers** about web prices is allowed, so the "add your card" email can link to the web.
- **3.1.2:** the paywall must show the price, period, auto-renewal, how to cancel, and links to the EULA and Privacy Policy, plus **Restore purchases**.
- **5.1.1(v):** account deletion must say an Apple subscription is cancelled in Apple's settings.
- **1.2 (user-generated content):** the app needs a way to filter, report and **block** abusive users, and published contact information. Reporting exists; **blocking doesn't** (pre-opening list).
- **Commission:** 30%, or **15% in the Small Business Program** (enroll), and 15% after a subscriber's first year.

**Inside the iOS app:** the card step is a web page reached from the June email. Opened inside the app, it hides the Stripe button when `isNativeApp()` and says "open this link in your browser". From June the app shows only the in-app purchase paywall.

---

## c) How paid status reaches the app

**One source of truth:** `public.entitlements`, read through `is_flock_member()` / `has_app_premium()`. Their rule already fits payments: `active`/`trialing` = access; `past_due`/`canceled` = access until `current_period_end`.

**Writers (all server-side; app users still have no write access):**

| Source | Writes | Keyed on |
|---|---|---|
| Founding claim, gifts, comp | existing triggers and admin functions | `founding_claim_id`, `gift_purchase_id`, manual |
| **Free-season join** (new, PR B) | one row per member, `status = 'trialing'`, ending at `free_season_ends_at` | user id (one per person) |
| **Stripe billing webhook** (new route, own secret) | `source = 'stripe'` rows | `external_ref` = Stripe subscription id |
| **RevenueCat webhook** (new route) | `source = 'apple'` / `'google'` rows | `external_ref` = original transaction id |

**The free-season row needs a value the `entitlements` checks don't allow today:**

- `plan` allows `founding, monthly, annual, app_premium, chapter_lead, comp`;
- `source` began as `stripe, apple, google, manual`, and later migrations added the grant sources.

Either reuse `plan = 'comp'` with a new `source = 'free_season'`, or add a plan value. Both change an existing table's check constraint. **Under the Flock rules that needs your explicit approval in that PR**, plus a check that care flows are unaffected. `entitlements` is Flock-only, so the care-app risk is low.

**Additive schema for billing (one migration, after opening):**

- `billing_customers` (user ↔ Stripe customer);
- `billing_events` (provider, event id, unique; idempotency and audit; never content);
- `entitlements` gains `product_id`, `will_renew` and `cancel_at_period_end`;
- `founding_claims` gains `released_at` (no card by the end of the free season) and `forfeited_at` (a paid founding membership that ended).

**Webhooks never trust event order:** on any event, re-read the subscription from Stripe or RevenueCat and write the row from that, as `record_gift_purchase` does. A database error returns 500 so the provider retries.

**Identity:** the RevenueCat `app_user_id` and the Stripe customer metadata hold the Supabase user id. RevenueCat is configured only after sign-in.

**Events:**

| Case | Stripe (web) | Apple via RevenueCat | Entitlement row |
|---|---|---|---|
| Add card in June | `checkout.session.completed`, `customer.subscription.created` (trial to `free_season_ends_at`) | n/a | `trialing`, `current_period_end` = season end |
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

- **Products:** one product, "The Flock", with a **Founding $15/month** price that is never edited (that's the lock) and a **Regular $30/month** price. A price change later is a new price object; founding subscriptions keep theirs.
- **The card step (opens about 30 days before the end):** Checkout `mode=subscription`, `subscription_data.trial_end = free_season_ends_at`, card collected, **$0 due**.
  - A founder with a claim that isn't released or forfeited gets the founding price.
  - Everyone else gets the regular price.
  - The server function checks this; the native app never shows it.
- **Emails:**
  - "Add your card" on **Mon, Jun 7** (about 30 days before the end), to every member with a free-season or founding row and no subscription;
  - reminders on **Tue, Jun 29** and **Mon, Jul 5**;
  - a "card on file, first charge on {date}" confirmation;
  - after the end, "your free season ended" (regular) or "your founding spot was released" (founder).
- **End of the free season:** a cron hook (through `call_cron_hook`) runs once, just after `free_season_ends_at`. For every founder without a subscription, it sets `released_at` and sends the email. Free-season rows end on their own date, with no job needed. The job never releases a founder who has a subscription, even a `past_due` one.
- **Founders who add a card and then cancel before July:** the subscription ends at the trial end, and the price is forfeited then.
- **Cancelling:** through the Stripe Customer Portal. **Turning off auto-renew is reversible until the period ends; the founding price is forfeited only when the subscription actually ends.**

**iOS (Apple):**

- **Introductory offers** are once per subscription group per Apple ID, in fixed lengths only, so they can't end on July 6.
- **Offer codes** are whole months only.
- **Keeping old subscribers on an old price** is possible, but a separate never-changing product is cleaner.

**Recommendation for iOS:**

- **Don't sell founding in the app.**
- **Show no in-app paywall during the free season** (the app says "Free until July 6").
- From the June card emails, the paywall offers only the regular plan, with **no free trial**. Someone who buys in June is charged in June, so the paywall should say "You're free until July 6; subscribing now starts billing today. Or add a card on the web at no charge until July 6."
  - The web half of that sentence is allowed only in the US storefront, if the court order still stands. Otherwise drop it and start the iOS paywall **on** the season's end.
- When the account has a claim, it says "Founding members: check your email".

---

## e) What you do by hand, in order

Dates assume opening at 00:00 Eastern on **Mon, Jan 4, 2027**. Durations are typical, not promised.

### Before opening day

| Due | Task | Effort |
|---|---|---|
| ~~Nov 18~~ | ~~Decide the entry point, the free season's end, gift years, released spots and the rest~~ | **Done** (section h) |
| **Wed, Nov 25** (sign-off by **Fri, Dec 18**) | **Avian vet sign-off:** the diet conversion weight thresholds (pause and notice), the smoothed weight rules, and the vet-nudge phrase lists (all `review_status = 'draft'`). CLAUDE.md: "An avian vet must confirm both thresholds before launch". **This is the opening-day blocker most likely to slip:** it depends on someone else's calendar in December. Contact the vet by Nov 25. If the sign-off isn't in by Dec 18, open on Jan 4 with `journeys_enabled()` limited to admins (or diet conversion held back) rather than move opening day. | your time: 1 hour; the vet's: days to weeks |
| **Fri, Dec 4** | **Legal text:** community terms (your posts and photos, the licence to show them to members, conduct, moderation and removal, age, memberships and billing to come), privacy for the Flock, community guidelines, and updated founding terms (claims close Jan 31; free until Jul 6; add a card by Jul 6 or the spot is released) | 2–4 hours plus optional legal review |
| **Fri, Dec 4** | **Approve the copy** in the wording list (section i) | 1 hour |
| **Fri, Dec 18** | **Approve content:** the 14 journey templates and milestones, Today's ideas through Jan 17 (`ready`), the Library's opening items, the Start here posts | 4–6 hours |
| **Fri, Dec 18** | **Approve the opening PR (C):** the entry point and `flock_enabled()` for members. This is the launch decision the Flock rules reserve for you. | 30 minutes |
| **Mon, Dec 21 – Wed, Dec 23** | **Dry run on production** with admin accounts: join → post → journey → report → block → kill switch, on the web, iPhone, iPad and Duo | 1 day |
| **Wed, Dec 23** | **Name reviewers** for `/admin/review` from Jan 4 (you, plus any chapter leads) | 15 minutes |
| **Wed, Dec 30** | **Opening emails** drafted and scheduled in Brevo for Mon, Jan 4 morning: founders (list 9), the waitlist (23), and optionally all app users | 1–2 hours |
| **Wed, Dec 30** | **Website (Webflow):** the founding card and `/community` (section i), published on Jan 4 | 1 hour |
| **Mon, Jan 4, 00:00 Eastern** | **Open:** `select public.admin_set_flock_opens_at('2027-01-04 00:00 America/New_York');`, set the free season's end to `2027-07-06 00:00 America/New_York` (PR B's admin function), and switch on PR C's setting. Check the free-user regression check and save-error alerts that morning. | 30 minutes |
| Sun, Jan 31 | Founding claims close (automatic, end of day Indianapolis time) | none |

### Before June 1 (payments)

| Due | Task | Effort |
|---|---|---|
| **Fri, Jan 15** | **App Store Connect:** the Paid Apps agreement, banking and tax forms (1–3 business days to verify the bank); Small Business Program enrollment (about 2 weeks) | 30 minutes of forms |
| **Sat, May 1** | **Sales tax:** confirm with your accountant how each state treats a digital membership (taxable or not, and where you must register), before Stripe Tax is registered and live prices go on. Stripe Tax is on either way (h11). | 1 meeting |
| **Sat, May 1** | **Android:** confirm Google Play's current billing rules for digital subscriptions in the US, including the exceptions after *Epic v. Google* (whether an app may link to or mention web purchase, and on what terms). Payment stays web-only, and **nothing paid appears in the Android app until this check is done**: no price, paywall or "subscribe" link (h14). | 1–2 hours of reading |
| **Fri, May 7** | **Stripe:** Stripe Tax registration per the accountant; products and prices in test, then live (The Flock: Founding $15/mo, Regular $30/mo); Customer Portal; the billing webhook endpoint and secret into Vercel (Production live, Preview test) | about 2 hours |
| **Fri, May 7** | **App Store Connect:** subscription group "The Flock" with Regular at $29.99 (or $30.00 if offered); Billing Grace Period (16 days); the Server Notifications V2 URL pointing to RevenueCat; an In-App Purchase key | 2 hours |
| **Fri, May 7** | **RevenueCat:** project, iOS app, key, product, entitlement `flock`, offering, webhook and secret, transfer "keep with original" | 1–2 hours |
| **Fri, May 7** | **EULA link** on the paywall (Apple's standard one) and the privacy policy line about payment processors | 30 minutes |
| **Mon, May 10** | **Submit the iOS build with the in-app purchase product,** allowing a week for a first-subscription rejection and resubmit. The Flock is open by then, so the reviewer can reach it; no review allowlist is needed. | 1 hour plus review time |
| **Tue, Jun 1** | **Payments live:** Stripe and in-app purchase; a dry run with your own founding claim | 1 hour |
| Mon, Jun 7 | "Add your card" emails go out (automatic) | none |

---

## f) The build as small PRs, in order

Every PR follows the Flock safety rules:

- database changes are additive only (anything else needs your approval in that PR);
- a "Free-user impact" section;
- the free-user regression check green.

The opening PR (C) is the one that deliberately makes the Flock visible to members. It must still leave the care app identical for people who don't join, apart from the entry point you approve.

### Before opening day (Nov 18 – Jan 3)

- **A. Founding terms and deadline.**
  - A migration moves `private.founding_deadline()` to `2027-02-01 00:00 America/Indiana/Indianapolis` (end of Jan 31). This changes an existing Flock function, not a care-app one; pin it in `supabase/checks`.
  - New copy for `/founding`, the founder screens and the website (section i): the free season, "close January 31", and "add a card by the end of the free season or the spot is released".
  - An email to existing claimants.
  - *Free users: none (`/founding` is public; care app untouched).*
- **B. Free-season grant.**
  - `flock_settings.free_season_ends_at` and `admin_set_free_season_ends_at()`.
  - `place_grant` uses it for founders' `free_until` instead of `opens + 6 months`, rescheduling grants that haven't started (as setting opening day does today).
  - `flock_join()`, which grants the free-season row (needs the entitlements check value, section c), and pins in `flock_entitlement_grants_checks.sql`.
  - *Free users: none until C (only callable by signed-in users, and nothing calls it yet).*
- **C. Opening the Flock to members (the launch PR).**
  - A "Join the Flock" screen: region, profile basics, and the community guidelines to accept.
  - `can_use_flock` counts free-season members.
  - `flock_enabled()` becomes true for members, and for everyone wherever you approve the entry point.
  - Merge dark behind the existing settings, and switch it on with the SQL setting on opening day, not with a deploy.
  - *Free users: this is the one deliberate change: the approved entry point only. Before-and-after screenshots, and an updated free-user regression check that asserts exactly that.*
- **D. Member blocking (Apple 1.2).** `flock_blocks`, a "Block" action on profiles, posts and comments, and blocked members' posts, comments, reactions and notifications filtered out by the existing visibility functions. Plus a contact line in the Flock. *Free users: none.*
- **E. Stickiness events** (section "What we're learning in the free season"). Fired only from Flock code (lazy-loaded), never from the care app. *Free users: none.*
- **F. Gift years start at the free season's end** (decided, h5). Changes `place_grant` for gifts, plus the gift and redeem copy. Gifts are already for sale, so do it before opening.
- **G. Legal pages.** `/terms` gains community sections (your posts and photos, the licence to show them to members, conduct, moderation and removal, age, memberships and billing to come); `/privacy` gains what Flock members see (matching `flock.you.privacy.tsx`), chapters, photos and payment processors. Your text, wired in. *Free users: shared pages; the wording changes, the layout doesn't.*

### After opening, web payments (Feb – May; live by about June 1)

1. **Billing schema** (section c), with `supabase/checks/billing_checks.sql`.
2. **Stripe billing webhook**, `/api/public/stripe/billing`, with its own secret and fixture tests (`npm run test:billing`). It returns 503 without the env var.
3. **Card step**, `/flock/membership` (and the founder view of it): add a card ($0 due until the season's end), or "card on file, first charge on {date}", with a Customer Portal link. The founding price applies to unreleased claims. It's never shown in the native app, and sits behind `BILLING_ENABLED`.
4. **Card emails:** about 30 days, 7 days and 1 day before, the confirmation, and the end-of-season notices. A cron hook through `call_cron_hook`, idempotent per member and email.
5. **End-of-season job:** release founders without a subscription, and send the emails.
6. **Admin view**, `/admin/founding` and `/admin/members`: free season, card on file, past due, released, forfeited.

### After opening, iOS (spring; in-app purchase live by June 1)

7. **Native plugin build (1.3):** `@revenuecat/purchases-capacitor`, guarded by `nativePluginAvailable("Purchases")`, and configured only after `flock_enabled()`. Check its JavaScript against the installed builds. **Ship by about March 15**, so most people have it by June.
8. **RevenueCat webhook and `syncMyPurchases`.**
9. **iOS paywall inside `/flock`**, shown from the card emails on (section d).
10. **Account deletion and settings text** for subscriptions. This touches shared code, so it needs before-and-after evidence.

**Dropped from the earlier plan:**

- the 14-day card window, `card_due_at`, the day-7 and day-12 reminders, and the waitlist invitation for released spots;
- the review allowlist (old PR 11).

**Later:** the annual plan ($300 a year, once retention is known), app premium subscriptions, Android Play billing (only after the Google Play check, h14), and the giving ledger for subscriptions (before Jul 6).

---

## g) Timeline

| When | Web / Flock | iOS |
|---|---|---|
| Nov 18–30 | **PR A** (founding deadline and copy, claimant email) by **Nov 30**; PR G drafted; you: vet contacted by Nov 25 | |
| Dec 1–11 | PR B by **Dec 4**; PRs D, E, F and G by **Dec 11**; you: legal text and copy by Dec 4 | nothing to ship: the Flock works in installed builds (remote-URL mode) |
| Dec 14–18 | **PR C** merged dark by **Dec 18**; you: content approved, vet sign-off in, PR C approved | |
| Dec 21–23 | dry run on production; reviewers named | the Flock checked on iPhone, iPad and Duo |
| Dec 24 – Jan 3 | buffer; **no merges after Mon, Dec 28**; emails and website scheduled by Dec 30 | |
| **Mon, Jan 4** | **opening** at 00:00 Eastern: set the dates, switch on, emails that morning | |
| Sun, Jan 31 | founding claims close | |
| Feb – Mar | billing PRs 1–3 on preview with test cards | Paid Apps agreement by Jan 15; PR 7 shipped by **Mon, Mar 15** |
| Apr – May | PRs 4–6; accountant and Google Play checks by **May 1**; live Stripe by **May 7** | App Store Connect, RevenueCat, PRs 8–10; submit by **Mon, May 10** |
| **Tue, Jun 1** | **payments live**; dry run with your own claim | in-app purchase live |
| **Mon, Jun 7** | "add your card" emails | iOS paywall appears |
| Tue, Jun 29 and Mon, Jul 5 | reminders | |
| **Tue, Jul 6** | **free season ends; first charges**; founders without a card released; free-season access ends for members without a card | |

**What to cut if it gets tight:**

- **Before opening:** PR F (gifts) can ship in the first week of January if no gift has been redeemed by then (none has, as of Nov 18).
- **Before opening:** stickiness events beyond weekly active members and joins can follow in the first week.
- **Before opening:** if the vet sign-off is late, hold journeys (or diet conversion) behind `journeys_enabled()` for admins; don't move opening day.
- **For payments:** push the Jun 1 date rather than skipping the webhook's idempotency or the end-of-season job's safety check. Jun 7 emails need Jun 1 payments.

**Not to cut before opening:**

- the legal pages;
- member blocking;
- the free-user regression check updated for the entry point;
- the kill switch tested on production.

---

## h) Decisions (all made Nov 18, 2026)

Numbers 1–16 match the list in the Nov 18 review; 17–21 are the earlier decisions and pricing answers.

| # | Decision | Decided |
|---|---|---|
| 1 | How non-members find the Flock in the care app | **One entry point only:** a "Community" button where admins see it today, plus a single dismissible Home card in the first two weeks. Everything else in the care app stays identical. PR C still needs your approval as the launch PR. |
| 2 | One end date for the free season | **Yes: Tue, Jul 6, 2027 for everyone,** stored in `flock_settings.free_season_ends_at`. |
| 3 | Who can join | **Anyone with a Kya & Co. account, on any platform.** |
| 4 | Released founding spots | **Not refilled.** Show the real count. |
| 5 | Gift years | **They start at the free season's end (Jul 6)** (PR F), and `/gift` and `/redeem` say so. |
| 6 | The rescue-adopter offer | **Kept on the website;** after the free season, a 6-month comp granted by hand from approval. |
| 7 | Where founders are billed | **Web/Stripe only;** no founding product in the App Store. |
| 8 | When the founding price is lost | **When the membership ends,** not when auto-renew is turned off; a payment that recovers within grace doesn't count. A founder released at the free season's end loses it too. |
| 9 | iOS in-app purchase timing | **Live by Tue, Jun 1:** plugin build by Mon, Mar 15; submit by Mon, May 10. |
| 10 | Paywall during the free season | **None.** The iOS paywall appears with the Jun 7 emails, and in-app purchases bill from the purchase day. |
| 11 | Sales tax on web | **Stripe Tax on** (about 0.5%). **Task:** confirm state sales-tax treatment of a digital membership with your accountant **by Sat, May 1, 2027** (before Jun 1), before registering and going live. |
| 12 | Refunds | **A full refund ends access; a partial one keeps it;** no refunds for unused time. |
| 13 | Giving share on subscriptions | **20% after fees, like gifts,** designed before the first charges on Jul 6. |
| 14 | Android | **Web-only payment for now.** **Task:** before anything paid appears in the Android app, confirm Google Play's current billing rules for digital subscriptions in the US, including the exceptions after *Epic v. Google*, **by Sat, May 1, 2027** (before Jun 1). Until then the Android app shows no price, paywall or subscribe link. |
| 15 | App premium | **Not in this build.** |
| 16 | Missed card deadline (founders) | **No automatic grace;** you can restore a released founder by hand within 14 days of Jul 6 (a support action). |
| 17 | Opening day | **Mon, Jan 4, 2027,** 00:00 Eastern. |
| 18 | Founders' card flow | **No card before or at opening;** add a card from Jun 7, by Jul 6, or the spot is released. Claims close Jan 31, 2027. |
| 19 | Annual plan | **Monthly only at launch;** add $300 a year later, once retention is known. |
| 20 | Apple prices | **$14.99 / $29.99** if exact $15.00 / $30.00 aren't offered; the web stays $15 / $30. |
| 21 | Currency | **USD only.** |

---

## i) Every place the Dec 31 deadline or "6 months from opening" appears

Found on Nov 18, 2026. **Nothing here has been changed yet.** Line numbers are on `main` at `6d64a11`. Copy fallbacks in `.tsx` files repeat the `en.jsonc` strings and change with them.

### App copy (`src/locales/en.jsonc` and the matching fallbacks)

| Where | Text today | Change |
|---|---|---|
| `en.jsonc:2620` `founding.deadline`; `src/routes/founding.tsx:230` | "Founding spots close December 31" | → January 31 |
| `en.jsonc:2629` `founding.locked`; `founding.tsx:205` | "Locked for as long as you're a member. Your first six months are free." | → free season wording ("Free until July 6, like everyone who joins in the first six months") |
| `en.jsonc:2630` `founding.metaDescription`; `founding.tsx:34` | "…with your first six months free." | → the same |
| `en.jsonc:2631` `founding.next`; `founding.tsx:365` | "We'll email you before the Flock opens in January. Your six free months start when it opens." | → "opens January 4… free until July 6; we'll ask for a card in June" |
| `en.jsonc:2632` `founding.nextPrice` | "After that, it's $15 a month for as long as you're a member." | add "once you've added a card by July 6" |
| `en.jsonc:2634`, `2635` `founding.noCard`, `founding.noPayment` | "No card needed today." / "No card and no payment today." | still true; add when a card is asked for |
| `en.jsonc:2627` `founding.line`; `founding.tsx:137` | "…opening in January." | → "opening January 4" |
| `en.jsonc:2622` `founding.fullBody`; `founding.tsx:243` | "The Flock opens in January…" | → the date, or "is open; join free" after opening |
| `en.jsonc:2624` `founding.justClosed` | "Founding spots have closed." | no change (the database decides when) |
| `en.jsonc:2648` `founding.regular` | "Regular price $30" | → "$30 a month after the free season" |
| `src/lib/flockProfile.ts:66` | "Founding · $15/mo · first 6 months free once the Flock opens" | → "free until {end}" |
| `src/routes/_authenticated/admin.founding.tsx:203–205` | "Six months after opening" (fallback when `free_until` is unset) | → "When the free season ends" |
| `src/lib/flockAccess.ts:20, 29` | "When the Flock opens" / "Active (free months)" | → "Active (free season)" |
| `en.jsonc:2742` `gift.timingFlock`; `src/lib/giftCopy.ts:11` | "The year starts when the Flock opens in January, or on the day it's redeemed if that's later." | → "The year starts when the free season ends, July 6, 2027" (h5) |
| `en.jsonc:2743` `gift.timingPremium`; `giftCopy.ts:12` | "…when app premium launches in January…" | → app premium isn't launching in January (h15): drop the month |
| `en.jsonc:3538` `redeem.doneFlock`; `src/routes/redeem.tsx:100` | "Your year in the Flock starts when it opens in January." | → "The year starts when the free season ends, July 6, 2027" (h5) |
| `en.jsonc:3540` `redeem.donePremium`; `redeem.tsx:101` | "…starts when it launches in January." | → drop "in January" (h15) |
| `en.jsonc:2378` `flock.today.empty.start` | "…once the Flock opens." | fine after opening; optional |

Only English has `founding.*`, `gift.*` and `redeem.*` strings today, so there are no translations to redo.

### Emails (`src/locales/emails.en.jsonc` and Brevo)

| Where | Text today | Change |
|---|---|---|
| `emails.en.jsonc:760` `email.gift.timingFlock` | "The year starts when the Flock opens in January…" | → "The year starts when the free season ends, July 6, 2027" (h5) |
| `emails.en.jsonc:761` `email.gift.timingPremium`, `:787` `email.gift.recipient.aboutPremium` | "…app premium launches in January…" | → drop "in January" (h15) |
| **Brevo** (not in the repo): any founding, waitlist or "Founding 50" list 9 emails or automations | not readable from here | check for "December 31", "six free months" or "opens in January" in Brevo's templates and automations |
| `src/lib/founding.functions.ts:84` (comment) | list 9 consent: "We'll email you before the Flock opens" | still true |

### Database (`supabase/`)

| Where | Today | Change |
|---|---|---|
| `migrations/20261022172114_founding_claims.sql:33–42` `private.founding_deadline()` | `timestamp '2027-01-01 00:00:00' at time zone 'America/Indiana/Indianapolis'` | new migration → `2027-02-01 00:00:00` (PR A). `claim_founding_spot` and `founding_status` (lines 116, 191) read it and need no change. |
| `migrations/20261107120000_flock_entitlement_grants.sql:26–27, 227, 265–266` `place_grant` | `free_until = current_period_end = v_opens + interval '6 months'` | new migration → `free_season_ends_at` (PR B) |
| same file, `:76` comment on `entitlements.free_until` | "end of the six free months (flock_opens_at + 6 months)" | update the comment in PR B |
| `checks/flock_entitlement_grants_checks.sql:90, 103–105, 130–135` | expects `opens + interval '6 months'` | update with PR B |
| Production functions containing "6 months" | only `place_grant` (checked Nov 18) | |
| Production functions using the deadline | `founding_deadline`, `claim_founding_spot`, `founding_status` | |

### Tests

| Where | Text |
|---|---|
| `scripts/flock-shell.test.ts:172–175, 219` | "Jan 5, 2027" to "Jul 5, 2027" sample dates; "first 6 months free once the Flock opens" |
| `e2e/flock.shell.ts:1974` | "Founding · $15/mo · first 6 months free once the Flock opens" |

### Docs and comments

| Where | Text |
|---|---|
| `CLAUDE.md`, Flock "Access (entitlements)" and "Opening day" | "six free months from opening day"; a gift year "from the later of redemption and opening day"; example date `2027-01-05` |
| `src/lib/founding.functions.ts:11–13` | "six free months from the day the Flock opens" |
| `src/routes/_authenticated/admin.founding.tsx:55` | "free months from opening day" |
| `src/lib/gifts.ts:18–19` | "like the Founding 50 deadline" (a time-zone note only) |

### Website (thekyaproject.com, Webflow)

| Page | Text today | Change |
|---|---|---|
| Home and `/community`, the "Join the Founding 50" card | "Your first six months free"; "$15 a month, locked in for as long as you're a member" | → free season and "claims close January 31"; "locked in" → "locked in once billing starts in July" |
| `/community` | "The first 50 members from the waitlist lock in founding perks for life… Regular pricing below applies after that." and "Monthly $30 per month" | says "from the waitlist" (claims are open to anyone with an account); add "after the free season" |
| `/community` | "A kind, judgment-free space for parrot people, opening soon" | → "opening January 4" |
| `/community` | "six months of free membership for anyone who adopts a parrot and applies within 60 days of their rescue" | keep (h6); add that it starts after the free season |

Only the home page and `/community` were read; other Webflow pages, blog posts and CMS items weren't checked for these phrases.

### A different Dec 31 (gift send dates, not the founding deadline)

`GIFT_SEND_LAST_DATE = "2026-12-31"` (`src/lib/gifts.ts:15`), `gift.errDate` (`en.jsonc:2720`), `gift.sendOnHint` (`en.jsonc:2741`), `src/routes/gift.index.tsx:67, 234`, `scripts/gifts.test.ts:62–67`. This limits when a *dated gift email* can be scheduled. It doesn't need to change for these decisions. Extend it only if you want to keep selling dated gifts into January.

---

## What we're learning in the free season

Six months free is the best chance to learn whether the Flock is worth $30 a month before anyone pays it. **Today PostHog records nothing Flock-specific.** In the last 30 days the only events on `/flock` pages were admin `$pageview`s, clip uploads and web vitals. `flock_check_completed` is the care app's daily check for several birds, not the community. Sign-ins are identified (`$identify`), so per-person counts work once events exist.

These events are worth having from day one. All of them fire only from Flock code (lazy-loaded, never the care app) and carry **no content**: no post text, names or photos.

| # | Measures | Event(s) | Tracked today? | To add |
|---|---|---|---|---|
| 1 | **Weekly active members**: the main stickiness number | `flock_active` once per member per day (properties: `founding`, `chapter`, `platform`), plus person properties `flock_member`, `flock_founding`, `flock_joined_at` | **Partly.** `$pageview` on `/flock/*` exists, but it can't tell members from admins or visitors | send `flock_active` from FlockShell on the first Flock screen of the day; set the person properties at join; exclude admins |
| 2 | **Joins and where they come from** | `flock_joined` (`source`: care-app entry point, email, website, founding page; `founding`; `region`) | **No** (only `founding_spot_claimed` for the 50) | send from the join screen after `flock_join()` succeeds |
| 3 | **Journey starts and completions** | `journey_started` (template slug or custom, private or community), `journey_milestone_reached` (number), `journey_finished`, `journey_paused` (diet weight safeguard, kind only) | **No** (clip upload events only) | send after each RPC succeeds (`journey_start`, `journey_reach_milestone`, `journey_set_status`) |
| 4 | **Library reads** | `library_item_opened` (item id, type, `read_seconds` bucket on leave) | **Partly** (pageviews of `/flock/library/*`, no item id or time) | send from the Library item screen |
| 5 | **Contribution, not only reading** | `flock_contributed` (`kind`: post, comment, reaction, idea_tried, event_rsvp; `space`) | **No** | one event from each create function's success path |
| 6 | **Coming back without being reminded** | a session flag `opened_from` = `push`, `email` or `direct` on `flock_active` | **Partly.** Email links already carry `utm_source=email` (`src/lib/emailTracking.ts`); push taps carry **no** source tag | add `utm_source=push` (or `?from=push`) to push deep links in `src/lib/pushNative.ts` and the service worker; then `opened_from` = `direct` when neither is present and the referrer isn't an email |

**The numbers to watch in a PostHog dashboard:**

- weekly active members ÷ members, by join week;
- the share of members active in 3 or more of their first 4 weeks;
- journey completion within 30 days;
- the share of weekly actives who contributed;
- the share of active days that started `direct`.

Check the dashboard monthly, and once more by Tue, Jun 1, before the Jun 7 card emails, so pricing decisions (annual plan, reminders) rest on real retention.
