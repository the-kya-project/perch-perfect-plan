# The Flock: payments plan

Status: **plan only, for Brittany's review.** Nothing in code, settings, App Store Connect, Stripe or the database was changed to write it. Written Nov 17, 2026.

What was read: the repo (`main` at `6d64a11`), the Flock migrations, the `/founding` and `/gift` code and copy, the Stripe gift code, the production database (read-only counts), the Vercel environment variable *names and comments* (no values), and App Store Connect through its API (read-only).

**State today, as observed:**

- **App Store Connect:** app `6795267221` has **no subscription groups, no in-app purchases and no promoted purchases**. The API can't show whether the Paid Apps agreement, banking and tax forms are done, so check those under *Business* in App Store Connect.
- **Stripe:** live in production for gifts only. Two one-time prices: Flock year $300 and app premium year $79. The webhook lives at `/api/public/stripe/webhook`.
- **Database:** `flock_settings.flock_opens_at` is **not set**, and the kill switch is on. There's **1 founding claim** (Oct 22, locked at 1500 cents), one `founding/trialing` entitlement and one manual comp. No Stripe, Apple or Google entitlement rows exist yet.
- **Native app:** none of the installed builds contains a purchases plugin. Web code reaches every build at once (remote-URL mode), but **a new App Store build is required before any in-app purchase can happen.**

---

## a) Pricing as it's defined right now

| Plan | Price | Billing period | Where it's defined |
|---|---|---|---|
| **Founding** (Flock) | **$15** | **a month** | `src/locales/en.jsonc` `founding.price` "$15 a month"; `founding_claims.locked_price_cents integer not null default 1500` (`20261022172114_founding_claims.sql`) |
| Founding: free months | **first 6 months free, counted from opening day** | n/a | `founding.locked`: "Locked for as long as you're a member. Your first six months are free."; `founding.next`: "Your six free months start when it opens."; `20261107120000_flock_entitlement_grants.sql`: "Founding starts at flock_opens_at; six free months (free_until = current_period_end = flock_opens_at + 6 months), status 'trialing'." |
| Founding: price lock | **$15 for as long as the membership lasts; lost for good on cancelling** | n/a | `founding.nextPrice`: "After that, it's $15 a month for as long as you're a member."; `entitlements.free_until` comment: "if a founding membership is cancelled, the founding price does not come back (a later return pays the regular price)." |
| Founding: cap | **50 spots** | n/a | `private.founding_cap()` returns `50`; `founding_claims.spot_number check (spot_number between 1 and 50)` |
| Founding: close | **the end of Dec 31, 2026, Indianapolis time** (midnight Jan 1, 2027 `America/Indiana/Indianapolis` = 05:00 UTC) | n/a | `private.founding_deadline()`: `timestamp '2027-01-01 00:00:00' at time zone 'America/Indiana/Indianapolis'`; copy `founding.deadline`: "Founding spots close December 31" |
| Founding: payment at claim | **none** | n/a | `founding.noPayment`: "No card and no payment today."; `founding.noCard`: "No card needed today." |
| Flock, regular | **$30**, period not stated (it sits under "$15 a month", which implies monthly) | ? | `founding.regular`: "Regular price $30" |
| Flock, annual | not defined as a subscription; the schema has a plan `annual` | ? | `entitlements.plan` check includes `'annual'` (`20261020180000_flock_foundation.sql`); a gifted year grants plan `annual` |
| Flock, one year (gift) | **$300** one-off | 1 year, not renewing | Vercel `STRIPE_PRICE_FLOCK_YEAR_GIFT` comment: "Stripe LIVE price: The Flock, one year (gift), $300 one-off." The live amount is read from Stripe (`src/lib/gifts.functions.ts`). |
| App premium | **$9.99** a month, marked "Coming soon" | monthly | `flock.journeys.premium.price` "$9.99", `.priceLine` "a month · or join the Flock to share journeys too", `.soon` "Coming soon" |
| App premium, one year (gift) | **$79** one-off | 1 year, not renewing | Vercel `STRIPE_PRICE_APP_PREMIUM_YEAR_GIFT` comment: "$79 one-off". The one production purchase (refunded) was 7900 cents. |
| Chapter lead, comp | free (granted by admins) | n/a | plans `chapter_lead`, `comp` in the entitlements check |

**So "$15/month after 6 months" means:** the first **6 months are free, starting on opening day** (not on the day someone claims or pays). After that it's **$15 a month, locked for as long as the membership continues**. Both apply together: 6 free months plus a permanent price lock, not a 6-month lock. If they cancel, the founding price is gone for good.

### Questions for you (undefined or contradictory)

1. **"Pay before Dec 31" vs. the promise on the page.** The page says "No card and no payment today", and under the current terms a founder owes nothing until opening day + 6 months (around July 2027 if the Flock opens in early January). What should a founder be able to do before Dec 31: (a) nothing more than claim, as today; (b) optionally add a card now, charged $0 until the free months end; or (c) be *required* to add a card to keep the spot? (b) and (c) contradict "No card needed today" for people who already claimed.
2. **Opening day.** It isn't set. The copy says "January", and CLAUDE.md's example is `2027-01-05`. Every founder's first charge date depends on it.
3. **Regular price period.** Is "$30" a month?
4. **Annual Flock plan.** Is there one for regular members, and at what price? Is it $300, the same as the gift (that's less than 12 × $30 = $360)? Is there an annual founding option?
5. **App premium.** Is it in scope for this build, at $9.99 a month (and $79 a year)? Flock already includes premium.
6. **Apple prices.** Should the Apple price be exactly $15.00 and $30.00, or $14.99 and $29.99? Check which price points App Store Connect offers in USD. Outside the US, Apple prices include VAT.
7. **What counts as "cancelled"** for losing the founding price: turning off auto-renew, or the membership actually ending? (Recommendation below.)
8. **Giving.** The gift copy says "a share of every membership going to rescue and conservation", and gifts use 20%, or 40% on double-giving days (`private.double_giving_days()`). Does that apply to subscriptions, and is it measured on the gross price or on what's left after Apple and Stripe fees?
9. **Countries and currency.** USD only? Can founders be outside the US?
10. **Android.** The Play app gets the same web code. Do you want Play billing in this build, or Android hidden from purchase for now?

---

## b) Recommended setup

**Recommendation: Stripe for web (including all founding billing), plus RevenueCat for in-app purchase in the iOS app (and later Android). One source of truth in Supabase.**

Why this split:

- **Founding billing on Stripe, for everyone.**
  - Stripe can start billing on an **exact date** (`trial_end` = the founder's `free_until`). Apple free trials only come in fixed lengths counted from the purchase date (3 days, 1 or 2 weeks, 1, 2, 3 or 6 months, 1 year), so an Apple trial can't end on "opening day + 6 months" for someone who subscribes in December or March.
  - Stripe can enforce "cancel and the price is gone". On Apple, a lapsed subscriber can resubscribe to the same product from their Apple account settings, outside the app, at the old price.
  - It's 50 people, and Stripe takes about 3% instead of Apple's 15–30%.
- **RevenueCat for iOS in-app purchase.** It wraps StoreKit 2: receipt checks, App Store Server Notifications, renewals, billing retry, restore and family sharing. It sends one webhook to us. It's free until $2.5k a month in tracked revenue, then 1%. Building StoreKit server handling ourselves is several weeks of work and easy to get wrong.
- **Don't route Stripe through RevenueCat.** Our Stripe webhook pattern already works for gifts and writes straight to Supabase. Keep that, and have RevenueCat's webhook write the Apple and Google rows. RevenueCat's Stripe integration can be connected later for dashboards only.

**Apple's rules that shape this** (App Review Guidelines; check the current text before submitting, since this area changed in 2025):

- **3.1.1:** digital subscriptions sold *inside* the iOS app must use in-app purchase. A Flock membership is a digital service, so the app can't show Stripe Checkout or a "pay on the web" button, except under the US rule below.
- **3.1.3(b) Multiplatform services:** someone who subscribed on the web may use that membership in the iOS app, *provided the same items are also available as in-app purchases.* So once regular sign-ups exist in the app, the iOS app needs in-app purchase. Founders using free, already-granted access before then is fine.
- **US storefront only:** since the May 2025 court order in *Epic v. Apple*, apps on the **US** App Store may include buttons and links to buy on the web, with no Apple commission. Apple appealed. **Confirm it's still in force before relying on it**, and don't build the plan around it. Outside the US you'd need Apple's External Purchase Link entitlement (commission, extra screens) or nothing.
- **Talking to customers outside the app** (email) about web prices is allowed, so founders can get "set up your founding membership" emails that link to the web.
- **3.1.2:** the in-app paywall must show the price, period, that it auto-renews, how to cancel, and links to the Terms of Use (EULA) and Privacy Policy. It needs a **Restore purchases** button.
- **5.1.1(v):** account deletion must explain that an Apple subscription has to be cancelled in Apple's settings. Our deletion flow will need that line once in-app purchase exists.
- **Commission:** 30%, or **15% in the Small Business Program** (under $1M a year; you have to enroll). Subscriptions also drop to 15% after a subscriber's first year.

**Can web sign-ups be offered inside the iOS app?** Outside the US, no: no button, link or price for the web checkout. In the US storefront, currently yes (see above). The safe design is that the iOS app never shows Stripe. `/founding` already loads in the app, so its payment step must be hidden when `isNativeApp()`, and the app should show only "check your email" or the in-app purchase paywall.

---

## c) How paid status reaches the app

**One source of truth:** `public.entitlements`, read through `is_flock_member()` / `has_app_premium()`, which already exist. Their rule is already right for payments: `active`/`trialing` = access; `past_due`/`canceled` = access until `current_period_end`.

**Writers (all server-side, as today; app users still have no write access):**

| Source | Writes | Keyed on |
|---|---|---|
| Founding claim, gifts, comp | existing triggers and admin functions (unchanged) | `founding_claim_id`, `gift_purchase_id`, one manual row |
| **Stripe billing webhook** (new route, own secret) | `source = 'stripe'` rows | `external_ref` = Stripe subscription id (unique index `entitlements_source_external_ref_key` already exists) |
| **RevenueCat webhook** (new route, Authorization header) | `source = 'apple'` / `'google'` rows | `external_ref` = the store's original transaction id |

**Additive schema (one migration):**

- `billing_customers` (user_id ↔ Stripe customer id)
- `billing_events` (provider, event id, unique, received_at, payload hash): idempotency plus an audit trail; never content
- `entitlements` gains `product_id`, `will_renew`, `cancel_at_period_end`
- `founding_claims` gains `forfeited_at`

**Webhooks never trust event order.** On any event, fetch the current subscription (Stripe API, or RevenueCat `GET /subscribers/{app_user_id}`) and write the row from that. This is the same idempotent pattern as `record_gift_purchase`. A database error returns 500 so the provider retries.

**Identity:** the RevenueCat `app_user_id` and the Stripe customer metadata both hold the **Supabase user id**. RevenueCat is configured only after sign-in, with that id, so purchases never land on anonymous ids.

**Events:**

| Case | Stripe (web) | Apple via RevenueCat | Entitlement row |
|---|---|---|---|
| Subscribe | `checkout.session.completed`, `customer.subscription.created` | `INITIAL_PURCHASE` | `trialing` or `active`, `current_period_end` = trial end or period end |
| Renew | `invoice.paid`, `customer.subscription.updated` | `RENEWAL` | `active`, new `current_period_end` |
| Turn off auto-renew | `subscription.updated` (`cancel_at_period_end`) | `CANCELLATION` (`unsubscribe`) | stays `active`/`trialing`; `will_renew = false`; access to period end |
| Turn it back on | `subscription.updated` | `UNCANCELLATION` | `will_renew = true` |
| Ends | `customer.subscription.deleted` | `EXPIRATION` | `canceled`, `current_period_end` = end; **founding: set `founding_claims.forfeited_at`** |
| Failed payment | `invoice.payment_failed` (Smart Retries) | `BILLING_ISSUE` (Apple billing retry; turn on a **16-day grace period**) | `past_due`, `current_period_end` = end of grace period, so access continues meanwhile |
| Refund | `charge.refunded` | `CANCELLATION` with reason `CUSTOMER_SUPPORT` (Apple refund) | ends access now (`current_period_end = now()`) for a full refund; a partial refund keeps access (same idea as gifts) |
| Restore purchases (iOS) | n/a | the app calls RevenueCat `restorePurchases()`, then our `syncMyPurchases` server function re-reads RevenueCat and upserts | row reappears; RevenueCat's "transfer" setting: **keep with original user** (stops one Apple ID unlocking several accounts) |
| New device or platform | nothing to do: access follows the **Supabase account**, so signing in anywhere (web, iPhone, Android) reads the same entitlements | | |
| Account deletion | cancel the Stripe subscription in `deleteMyAccount`; tell iOS users to cancel in Apple settings | | rows cascade away, as today |

---

## d) Billing founding pricing correctly after the 6 months

**Web (Stripe), the recommended path for all 50:**

- **Products:** one Stripe product "The Flock", with a **Founding $15/month** price that is never edited (that's the lock) and a **Regular $30/month** price. A later price change means a new price object; founding subscriptions keep theirs.
- **Founder sign-up:** Checkout `mode=subscription` with the founding price, `subscription_data.trial_end = free_until`, card collected, $0 today. Only for people with a claim that hasn't been forfeited; the server function checks this.
- **If opening day isn't set yet:** Stripe needs a trial end between 48 hours and 730 days out. Set a provisional `trial_end` (e.g. Jul 5, 2027). When `admin_set_flock_opens_at` runs, a server job updates `trial_end` on every founding subscription still in its trial. Stripe allows that.
- **Founders who never add a card:** keep access through their free months (the existing `founding` grant), get reminder emails at about month 5 and two weeks before, and lose access at `free_until`, as the grant already does.
- **Cancelling:** through the Stripe Customer Portal. Recommendation: **turning off auto-renew is reversible until the period ends; the price is forfeited only when the subscription actually ends** (`customer.subscription.deleted` sets `forfeited_at`). After that, Checkout offers only the regular price.

**iOS (Apple):** what Apple allows:

- **Introductory offers:** a free trial, pay-as-you-go or pay-up-front, **once per subscription group per Apple ID**, in fixed lengths only (including 6 months). They can't end on a set date.
- **Offer codes:** one-time or custom codes giving free or discounted months (**whole months**, for new, existing or lapsed subscribers), redeemed in the app or through an App Store link. They could approximate "free until July 5" by issuing a code for the months left, but only to the nearest month, and it's a lot of manual work.
- **Promotional offers / win-back offers:** for current or lapsed subscribers, signed by our server. Not suitable for a first purchase.
- **Price changes:** when you change a product's price, Apple lets you **keep current subscribers on their old price**. A separate "Founding" product at $15 that never changes is cleaner.

**Recommendation for iOS:** **don't sell founding in the app at all.** Founders set up billing on the web (by email link). In the app they're already members through the entitlement. The iOS subscription group has only the regular products (monthly, plus annual if you want one), with no founding product and no free trial. That avoids the date mismatch, the forfeiture hole, and double free months. If a founder buys the regular plan in the app anyway, that's their choice, but the paywall should say "Founding members: check your email" when the account has a claim.

---

## e) What you do by hand, in order

Durations are typical, not promised. Apple and Stripe can be slower in December.

1. **App Store Connect: Paid Apps agreement, banking, tax forms (W-9)** under Business. 15 minutes of forms; **1–3 business days** (sometimes about a week) for Apple to verify the bank. Nothing in-app can be tested until it's active.
2. **App Store Small Business Program enrollment** (15% instead of 30%). 10 minutes; Apple says **about 2 weeks**.
3. **Stripe: confirm the account is ready for subscriptions.** Turn on **Stripe Tax** (decision below) and register where you must collect. 30–60 minutes.
4. **Stripe products and prices** (test mode first, then live): The Flock, Founding $15/mo and Regular $30/mo (plus annual if chosen). Customer Portal settings (cancel at period end, update card, invoices). 30 minutes per mode.
5. **Stripe webhook endpoint for billing** (new URL, its own signing secret), with the events from section c. Add the secret and price ids to Vercel: Production gets live values, Preview gets test values. 15 minutes.
6. **App Store Connect: subscription group "The Flock"** and products (regular monthly; annual if chosen), with prices, display names, descriptions, a review screenshot and review notes. Optionally app premium products. 1–2 hours.
7. **App Store Connect: turn on Billing Grace Period (16 days)** and set the **App Store Server Notifications V2** URL to RevenueCat's. 10 minutes.
8. **App Store Connect: create an In-App Purchase key** (a separate .p8 from the API key you used today) for RevenueCat. 5 minutes.
9. **RevenueCat account:** project, iOS app (bundle `com.thekyaproject.app`), upload the in-app purchase key, import products, an entitlement `flock`, an offering, webhook URL plus Authorization secret, transfer behavior "keep with original". 1–2 hours.
10. **Terms of Use / EULA link** for subscriptions (Apple's standard EULA is fine), plus Privacy Policy updates to mention payment processors. 1 hour, plus legal review if you want it.
11. **Apple review account:** a dedicated account that can reach the paywall while the Flock is hidden (decision below), with credentials in the review notes. 15 minutes.
12. **Submit the iOS build with the in-app purchase products attached.** A first in-app purchase must go in with an app version. Review is **usually 24–48 hours**; first subscriptions are often rejected once on metadata (price wording, missing EULA link), so allow **about a week** including a resubmit. Apple has slowed or paused submissions around **Dec 23–27** in past years; plan around that.

---

## f) The build as small PRs, in order

Every PR follows the Flock safety rules: additive database changes only; no Flock UI, route or network call for non-admins; a "Free-user impact" section; and the free-user regression check green. Nothing below opens the Flock.

**Web and founding (needed for Dec 31):**

1. **Billing schema.** The migration from section c (`billing_customers`, `billing_events`, the new `entitlements` and `founding_claims` columns, the upsert functions in `private`), plus `supabase/checks/billing_checks.sql`. No callers yet. *Free users: none (new tables and columns only).*
2. **Stripe billing webhook.** New route `/api/public/stripe/billing` with its own secret (the gift route stays untouched). It handles the section c events, writes `source='stripe'` rows, and includes fixture tests (`npm run test:billing`). Without the env var it returns 503. *Free users: none.*
3. **Founding checkout (web only).** A server function `createFoundingCheckout`: signed in, has a claim, not forfeited, never in the native app. Plus the "Set up your founding membership" step on the `/founding` done state and a `/founding/thanks` page. `/founding` is already public. Behind a server setting `FOUNDING_BILLING_ENABLED` so it can merge dark. *Free users: none; the page change only shows for claim holders.*
4. **Manage and emails.** A Customer Portal link from the founder's page; Brevo confirmation and "card on file, first charge on {date}" emails; reminders before `free_until` for founders without a card. *Free users: none.*
5. **Opening-day resync.** When `flock_opens_at` is set or changed, update `trial_end` on founding subscriptions still in their trial (a cron hook through `call_cron_hook`, idempotent). *Free users: none.*
6. **Admin view.** `/admin/founding` shows each claim's billing state (no card, card on file, first charge date, past due, forfeited). *Admins only.*

**iOS (needed before regular sign-ups open in the app):**

7. **Native plugin build (1.3).** Add `@revenuecat/purchases-capacitor`, `cap sync ios`, bump the build. JavaScript calls are guarded with `nativePluginAvailable("Purchases")` and **configure RevenueCat only after `flock_enabled()` is true**, so non-admins make no RevenueCat network calls. Check the plugin's JavaScript against the installed builds, per CLAUDE.md. Ship this build early; it does nothing visible.
8. **RevenueCat webhook and sync.** `/api/public/hooks/revenuecat` (Authorization check), plus a `syncMyPurchases` server function (re-reads RevenueCat), writing `apple`/`google` rows. Tests with RevenueCat sample payloads. *Free users: none.*
9. **iOS paywall inside `/flock`** (behind `flock_enabled()`): price, period, auto-renew text, EULA and privacy links, **Restore purchases**, "Founding members: check your email". *Admins only until launch.*
10. **Account deletion and settings text.** The Apple-subscription line in deletion, and the membership line in settings, both behind `flock_enabled()` / entitlement. Touches shared code, so this needs before-and-after evidence that free users see no change.
11. **Review access.** Let the Apple review account pass `flock_enabled()` (an allowlist row, admin-set), only if you choose that over submitting with the launch build.

**Later / optional:** annual plans, app premium subscriptions, Android Play billing through RevenueCat, the giving ledger for subscriptions.

---

## g) Timeline

Assuming work starts Nov 18 and you do the manual steps in parallel.

| Week | Web / founding | iOS |
|---|---|---|
| Nov 18–24 | PR 1, PR 2; you: Stripe products (test), Stripe Tax decision, Paid Apps agreement, Small Business Program | |
| Nov 25 – Dec 1 (Thanksgiving) | PR 3, PR 4 on preview with test cards | you: subscription group and products, in-app purchase key, RevenueCat set up |
| Dec 2–8 | PR 5, PR 6; live Stripe prices and webhook; **first founding card on file around Dec 3–8** | PR 7 (plugin build), submit by about Dec 8 |
| Dec 9–15 | buffer; founder emails | PR 8, PR 9 on TestFlight with sandbox accounts |
| Dec 16–31 | founding close Dec 31 | holiday slowdown; avoid submitting in-app purchase review Dec 20–28 |
| Early–mid Jan | opening day; resync founding trial ends | submit build plus in-app purchase products; in-app purchase live about 1–2 weeks after submission |

- **Dec 31 is doable for the web founding path:** a founder adding a card and committing at $15/month, $0 today, first charge on `free_until`. **First paying founding member: realistically Dec 3–10.** "Paying" here means subscribed with a card on file. The first *charge* happens in about July 2027 under the current terms, unless you change them.
- **iOS in-app purchase before Dec 31 is tight and isn't needed for founders.** Moving it to January is the main cut.

**What to cut or move if it gets tight:**

- iOS in-app purchase moves to January, to go live with opening day or just after.
- Annual plans, app premium subscriptions and Android billing all move after launch.
- The founder reminder emails (PR 4) can follow the first sign-ups by a week.
- The admin billing view (PR 6) can be SQL until January.

**Not to cut:** the webhook's idempotency and the forfeiture rule, the opening-day resync (without it every founder's first charge date is wrong), and the native-app guard on the Stripe step.

---

## h) Decisions only you can make

| # | Decision | Recommendation |
|---|---|---|
| 1 | What "pay before Dec 31" means for founders | **Optional card now, $0 until `free_until`; claims stay card-free.** Keeps the "No card needed today" promise to people who already claimed, and still lets founders commit before Dec 31. Require a card only at the end of the free months. |
| 2 | Opening day | Set it once in-app purchase timing is known. If you want **Jan 5, 2027**, open with founders, gifts and comps first, with regular web sign-ups; iOS regular sign-ups follow as soon as in-app purchase is approved. |
| 3 | Where founders are billed | **Web/Stripe only**; no founding product in the App Store. |
| 4 | When the founding price is lost | **When the subscription ends**, not when auto-renew is turned off; a failed payment that recovers within the grace period doesn't count. |
| 5 | Regular price and plans | **$30/month confirmed**; annual **$300** (the same as the gift, about 2 months free) if you want one, otherwise monthly only at launch. |
| 6 | Apple prices | **$14.99 / $29.99** if App Store Connect doesn't offer $15.00 / $30.00 exactly. Same on web for consistency, or $15 / $30 on web if you prefer round numbers (it's allowed to differ). |
| 7 | iOS in-app purchase timing | **January, with or just after opening.** Ship the plugin build (PR 7) in early December so it's widely installed by then. |
| 8 | How Apple's reviewer sees the paywall while the Flock is hidden | **Submit the in-app purchase products with the opening build**, so no exception to the gate is needed. If you need approval before opening, add a single admin-set allowlist for the review account (PR 11). This widens `flock_enabled()`, which is your launch decision. |
| 9 | Sales tax on web | **Turn on Stripe Tax** (about 0.5% per transaction) and register where required. Apple handles tax for in-app purchase. |
| 10 | Refund policy | **A full refund ends access immediately; a partial one keeps it.** No automatic refunds for unused time on cancel. |
| 11 | Giving share on subscriptions | **The same rate as gifts (20%), on what's left after fees,** recorded per payment; design it after launch. |
| 12 | Android | **No purchase in the Android app at launch.** Android members subscribe on the web; add Play billing through RevenueCat later. Check Google's current user-choice and external-offer rules before linking out from the Android app. |
| 13 | App premium | **Leave it out of this build.** Flock includes premium; add premium subscriptions once Flock billing is stable. |
