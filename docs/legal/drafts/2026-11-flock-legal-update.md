# Privacy policy and terms: the Flock and paid plans (draft, November 2026)

**Status: draft for review. Nothing here is live.** The live pages are `src/routes/privacy.tsx` (/privacy) and `src/routes/terms.tsx` (/terms). This file changes neither, and neither "last updated" date has been touched.

**Updated Nov 19, 2026** with Brittany's decisions on every open item (section 5) and the pricing and plan changes made since the first draft: the Flock opens Mon, Jan 4, 2027 and is free for everyone until Tue, Jul 6, 2027; $25 a month billed annually ($300 a year) or $30 month to month; Kya's Crew at $37 a month billed annually ($444 a year) or $45 month to month; app Premium removed (the care app is free, and the journeys it would have included come with Flock membership); founding with no closing date; giving of 20% of every membership (25% for Kya's Crew).

What's still open is marked `[DECISION NEEDED LATER: …]`, `[NOTE FOR BRITTANY: …]`, `[NOTE FOR THE LAWYER: …]` or `[ADD WHEN …]`. Have a lawyer review both pages before they go live, especially the paid-plan, refund, age and governing-law sections.

Contents:

1. The pages as they are today
2. What the Flock collects, and who can see it
3. Every outside service that receives user data
4. What's already out of date
5. Decisions needed
6. Draft: privacy policy
7. Draft: terms of service
8. When the drafts are approved: what changes in the code

---

## 1. The pages as they are today

### Privacy policy (/privacy)

- **Last updated:** "15 October 2026". This is the `LAST_UPDATED` constant in `src/routes/privacy.tsx`, shown at the top of the page.
- **Sections:** Who we are · What we collect · How we use it · Analytics · When something goes wrong · Why we're allowed to use your data · Services that help us run Kya & Co. · Where your data is stored · Sharing with sitters · Marketing · Deleting your account · How long we keep your data · Your rights · Contact.
- **Services listed:** Supabase, Vercel, Cloudflare Stream, Brevo, PostHog, Google Sign-In and Sign in with Apple, Apple Push Notification service and Firebase Cloud Messaging, and the browser's push service.
- **Scope:** the care app and sitters only. There is nothing about the Flock, payments or gifts.

### Terms of service (/terms)

- **Last updated:** the page shows **no date**. In this repository's history (a shallow clone, so older commits aren't visible), the file was last changed on 28 October 2026 in #419. I can't tell from here whether that commit changed the wording.
- **Sections:** Using the service · Your account · Your content · Acceptable use · Changes. That's five short paragraphs.
- **Scope:** the care app and sitters only. There is nothing about the Flock, community rules, paid plans, gifts, refunds, cancellation, app-store purchases, age, liability or governing law.

---

## 2. What the Flock collects, and who can see it

Read from the code on `main` as of #475. Everything below is stored in Supabase (database or private storage) unless noted.

| Area | What's stored | Who can see it |
|---|---|---|
| **Flock profile** (`flock_profiles`) | Display name, region (which sets your chapter), bio, profile photo (private `flock-avatars` bucket, re-encoded in the browser so location and camera data are removed), when you finished setup | Other members see display name, region, bio, photo, and the founder and chapter-lead badges. Never your email, address, care records, sits or health notes (the in-app Privacy screen says the same). |
| **Shown birds** (`flock_shown_birds`) | Which of your birds members may meet | Members see a shown bird's name, species and photo only. Unshown birds are never visible. |
| **Membership** (`entitlements`, `founding_claims`, `gift_purchases`) | Plan, status, start and end dates, founding spot number and locked price, gift codes | You, and admins. The founder badge is public to members. |
| **Posts** (`flock_posts`) | Space, title, text, up to several photos (private `flock-posts` bucket, re-encoded as above), an optional bird, whether the vet nudge showed | Learn together, Start here and approved Do good posts: every member. Chapter posts: that chapter's members. Do good posts wait for review before anyone else sees them. Your own posts are always visible to you. |
| **Comments and replies** (`flock_comments`) | Text, optional photo, who you replied to | Anyone who can see what was commented on. A comment on a "Just me" journey stays inside the household. |
| **Reactions** (`flock_reactions`) | Which of four reactions, on what | Members who can see the thing. The "who reacted" list shows each person's name and region. |
| **Reports** (`flock_reports`) | Reporter, reason, optional note | Reviewers see the reason and note, not who reported. The reported member isn't told who reported them. |
| **Review queue and moderation** (`flock_moderation`, review notes) | Hidden or removed status, reviewer, review notes, notices sent to authors | Reviewers (the Kya team). Content stays up until 3 open reports, then it's hidden until reviewed. Removed content is hidden from everyone but its author. Today it stays in the database with no end date; decision 9 sets 180 days (a build item). |
| **Chapters** | Your chapter is your region | Chapter members see each other in the Members tab: name, photo, badges, shown birds' names and species. |
| **Events and RSVPs** (`flock_events`, `flock_event_rsvps`) | Suggested events (title, time, place or online link), going or maybe, day-before reminders | The chapter's members, once approved. The online link goes only to people going, the host and managers. "Who's going" names are shown to the chapter. If a host deletes their account, the event stays without a host. |
| **Journeys** (`journeys`, `journey_updates`, milestones, follows, finisher tips) | Journey, milestones, captions, video clips (Cloudflare Stream), engagement, weigh-ins used by Diet conversion | "Just me": the bird's household only. "Community": Flock members. Clips play through one-hour signed links. Finisher tips show with no names, and never to the person who wrote them. |
| **Today's idea / We tried it** (`flock_idea_tries`) | Your answer, which bird, an optional photo | Others see the photo with the bird's name and how it went, with no member name. The tally appears only after 5 answers. |
| **Library** (`library_resources`) | Written by admins; holds no member data | Published resources, for members. |
| **In-app notifications** (`flock_notifications`) | Replies, reactions ("cheers"), review results, new clips, chapter posts, notices | You only. A notification is written only when you can see the thing it's about, and checked again when you read it. No push or email yet. |
| **Waitlist** (`waitlist_signups`) | Email, name, chapter, chapter-lead interest; for the original Google Form list, also birds and location | Admins. Also sent to Brevo (see section 3). |
| **Save errors** (`save_errors`) | Anonymous failure category, table, screen, app version, a hashed person ID. Never content. | Admins (it powers the error alerts). |

**What account deletion removes today** (`src/lib/account.functions.ts`, plus database cascades):

- All authored Flock rows: profile, shown birds, posts, comments, reactions, reports you made, RSVPs, journeys, follows, tries and notifications.
- Care data, care photos (`bird-photos`, `journal-photos`, `scan-photos`, `journal-attachments`), Cloudflare clips for your birds and clips you posted to journeys on other people's birds, and your PostHog person.
- Flock photos too, since #477 (Nov 2026): profile photos (`flock-avatars`) and post, comment and "We tried it" photos (`flock-posts`). Today's idea photos an admin uploaded are kept.
- **Planned change (decision 10):** deleting a single post will hide it and its comments at once and keep them for 180 days before they're deleted for good. Deleting a whole account stays immediate.

---

## 3. Every outside service that receives user data

| Service | What it does for us | What it receives | Why |
|---|---|---|---|
| **Supabase** (US East) | Database, sign-in, private file storage | Everything in section 2, plus care data, sits, photos, gift and membership records | To run the app |
| **Vercel** (US) | Hosts the app and its server functions | The requests your device makes, including IP address and browser details | To serve the app |
| **Cloudflare Stream** (US) | Stores and plays videos | Care clips and journey clips | Video upload, conversion and playback |
| **Stripe** (US) | Payments for gift memberships today; web subscriptions later | Buyer's email and name, billing address where asked, card details (Stripe holds these; we never see them), and for a gift: the recipient's name, email if emailed, the gift message and the send date | To take payment and send receipts |
| **Brevo** (France, data in the EU) | Account, sit, onboarding, gift and alert emails; marketing and community emails for people who opt in; the waitlist list | Email, name, language, email preferences, how you found us; for the waitlist, chapter and chapter-lead interest; for gifts, the recipient's email | To send email |
| **PostHog** (US) | Product analytics and error reports, without cookies | A coded account ID, screens used (Flock screens included), events such as founding-page and gift-checkout steps, device type, app version, error reports | To see what's used and fix what breaks |
| **Google Sign-In** and **Sign in with Apple** | Optional sign-in | The name and email they share with us | Sign-in |
| **Apple Push Notification service** and **Firebase Cloud Messaging** (Google) | Notifications in the iPhone and Android apps | A device token and the notification text | Care reminders and alerts you turn on |
| **Your browser's push service** | Notifications on the website | A push address and the notification text | The same |
| **Google Forms** (historical) | The original Flock waitlist, Dec 2025 to Sep 2026 | The 22 people's answers, since imported into our database and Brevo | Collecting the first waitlist |
| **Apple App Store / Google Play** (planned) | In-app purchases in the launch build | Handled by the store under its own terms; we receive purchase status, not card details | Paid plans in the apps |
| **RevenueCat** (planned) | Keeps app-store purchases and the account in step | An app user ID and purchase receipts | Subscription status across iPhone, Android and web |

**Seen in the code, but no user data is sent:**

- **Webflow:** the app reads public blog posts from thekyaproject.com.
- **AAV Find-A-Vet:** a link only.
- **YouTube or Vimeo:** library videos open on their sites, under their own policies.
- **Email-app links** (Gmail, Outlook and others): open your inbox only.
- **Plausible:** an alternative analytics option in `src/lib/analytics.ts`. It isn't used; PostHog is.

---

## 4. What's already out of date

1. **Stripe isn't in the privacy policy.** Gift memberships have taken payments through Stripe since late October 2026, and the policy never mentions it, payments or gift recipients' details.
2. **Gifts aren't in the terms.** Gifts are live (and one has already been refunded), but the terms say nothing about what a gift includes, when it starts, redemption or refunds. The gift pages make promises ("Gifts can be redeemed anytime", "The year starts when the Flock opens in January, or on the day it's redeemed if that's later") that the terms should back up.
3. **Founding claims aren't in the terms.** Claims are open now. (`/founding` first promised "$15 a month for as long as you're a member, with your first six months free"; PR #480 changes it to the free season and "$15 a month for life once billing starts".)
4. **The terms have no "last updated" date** and no age, liability, termination or governing-law sections.
5. ~~**Account deletion doesn't delete Flock photos.**~~ **Fixed in #477** (Nov 2026): account deletion now removes profile photos and post, comment and "We tried it" photos too.
6. **"What we collect" and "How we use it" describe care only.** There's nothing on community content, who sees it, moderation, events or notifications.
7. **The Google Form waitlist isn't mentioned.** It was 22 people, now imported into our database and Brevo.
8. **The policy says marketing email is only for people who opt in "at signup".** The waitlist forms and the founding page are also places people opt in.

---

## 5. Decisions (made by Brittany, Nov 19, 2026)

| # | Decision | What was decided |
|---|---|---|
| D1 | **Refunds** | Anyone can cancel any time. A full refund if asked within 14 days of the first payment on a plan, or of a yearly renewal. Otherwise no refunds, including partial refunds. This applies to everyone, which also covers the EU and UK 14-day rules. Apple and Google purchases follow that store's refund process. |
| D2 | **Gift refunds** | Refundable within 30 days of purchase if the gift hasn't been redeemed. After that, no refunds. |
| D3 | **Gift expiry** | Gifts never expire. |
| D4 | **App Premium** | Removed (Nov 19, 2026). There's no Premium plan and no Premium gift. The care app is free, and the journeys Premium would have included come with Flock membership. |
| D5 | **Price-change notice** | **Still open:** `[DECISION NEEDED LATER: notice period for price changes]`. The founding price never changes. |
| D6 | **Taxes** | Prices don't include taxes; taxes are added at checkout where required. `[NOTE FOR BRITTANY: confirm with your accountant.]` |
| D7 | **Failed founding payments** | We contact the founding member personally to sort it out before anything changes. Brittany is emailed every time a founding member's payment fails (a build item in the payments plan). |
| D8 | **Minimum age** | 13 and older for the Kya & Co. app; 18 and older for the Flock. |
| D9 | **Removed content and reports** | Content removed by reviewers, and reports, are kept for 180 days, then deleted. |
| D10 | **Deleting a post** | The post and the comments on it are hidden right away and kept for 180 days, then permanently deleted. Deleting a whole account still removes your content right away, without the 180-day hold. **The app deletes posts immediately today, so this part of the policy can't go live until the code matches** (a build item). |
| D11 | **Featuring member content** | Never outside the Flock (newsletter, social media or anywhere else) without asking that member first. |
| D12 | **Giving** | 20% of every membership and gift, 25% for Kya's Crew, and 40% of gifts on double-giving days. |
| D13 | **Governing law** | Indiana law, courts in Allen County, Indiana. No arbitration clause. |
| D14 | **Removing a paying member** | If we remove a paying member for breaking the community rules, we refund the unused time. |
| D15 | **Free trials** | Once billing starts after Jul 6, 2027, new Flock members get a 14-day free trial. Founding members, rescue adopters and Kya's Crew don't. |
| D16 | **Who reviews content** | "The Kya team" is the only wording for who reviews content and approves event suggestions, defined once in each page as The Kya Project's staff and the people who help run the Flock on our behalf. |

**Pricing and plans (as of Nov 19, 2026):**

- The Flock opens Mon, Jan 4, 2027. It's free for everyone until Tue, Jul 6, 2027; billing starts after that.
- The Flock: $25 a month billed annually ($300 a year), or $30 month to month.
- Kya's Crew: $37 a month billed annually ($444 a year), or $45 month to month, and it includes everything in a Flock membership. 25% of each Crew membership goes to rescue and conservation partners, and each Crew member sponsors six free months for a new rescue adopter.
- No app Premium. The care app is free, and the journeys Premium would have included come with Flock membership.
- Founding: $15 a month for life, the first 50 people, no closing date. Founders add a card by Jul 6, 2027 to keep the spot and price. If a founding membership ends, the founding price ends with it.
- Rescue adopters: six free months for people who apply through a partner rescue within 60 days of adopting, starting after Jul 6, 2027.
- Kya's Crew goes on sale when billing starts after Jul 6, 2027.
- Gifts are Flock gifts only: a year in the Flock.
- Yearly renewal reminders go out 30 days before a yearly plan renews.
- Payment records are kept for 7 years.

---

## 6. Draft: privacy policy

> Last updated: [DATE OF PUBLISHING]

### Who we are

Kya & Co. and the Flock are run by The Kya Project, LLC, 3420 S Washington Rd, Fort Wayne, IN 46802, United States. We're the controller of your personal data, which means we decide how it's used and we're responsible for looking after it. You can reach us at brittany@thekyaproject.com.

This policy covers the Kya & Co. app (on the web, iPhone and Android), the Flock (our community inside the app), gift memberships, and our emails.

### What we collect

**When you use the care app:** your account details (email and display name), the bird profiles and care plans you create, weights, health checks, journal entries, sits and sitter activity, the photos and clips you upload, and how you use the app, including error reports if something goes wrong (see below).

**When you join the Flock:**

- **Your Flock profile:** display name, region (which sets your chapter), bio and profile photo.
- **The birds you choose to show** other members: their name, species and photo.
- **What you share:** posts, comments and replies, photos, reactions, journey updates and video clips, "We tried it" answers, and event suggestions and RSVPs.
- **Reports you send** about content, and the reason and note you give.
- **Your membership:** your plan, when it started and when it renews, and for founding members your spot, your locked price, and whether you chose to appear on the founding members page.

**When you buy or receive a gift:** the buyer's name and email, and the recipient's name, email (if we're emailing the gift) and message. Payment details go to Stripe, never to us.

**When you join the waitlist:** your name, email, the chapter you'd like, and whether you're interested in leading one.

We remove location and camera details from every Flock photo before it leaves your device: the app redraws each one as a new image.

### How we use it

- To run the service: keep your birds' care and health in one place, share it with your household and the sitters you invite, and show your data back to you.
- To run the Flock: show your profile and posts to the members allowed to see them, keep chapters and events working, and send you in-app notifications about replies, reactions and events.
- To keep the community safe: review reported content and Do good posts.
- To take payment and manage your membership.

We do not sell your personal data.

### Who can see what in the Flock

**Other members can see:**

- your display name, region (your chapter), bio and profile photo
- any Flock badge you have, such as the founder badge
- the birds you choose to show: their name, species and photo

**Members never see** your email, your address, your birds' care records or care plans, your sits and sitters, or your health checks and health notes.

**Posts:**

- Learn together, Start here and Do good posts are seen by every member. Do good posts are read by a reviewer before anyone else sees them.
- Chapter posts are seen only by members of that chapter.

**Comments and reactions** are seen by anyone who can see what they're on. The list of who reacted shows each person's display name and region.

**Journeys:**

- "Just me" journeys stay inside your bird's household. Nobody else sees them, their clips or their comments.
- Community journeys are seen by Flock members.

**Finisher tips** are shown without names.

**We tried it:** others see your photo with your bird's name and how it went, but not your name. Totals appear only after five answers.

**Events** are seen by the chapter's members. The names of people going are shown to the chapter. An online event's link goes only to the people going.

**Reports:** when you report something, the person you reported isn't told who you are, and reviewers see your reason and note, not your name.

**Reviewers.** Reported content, Do good posts and event suggestions are reviewed by the Kya team (The Kya Project's staff and the people who help run the Flock on our behalf).

**Your household.** People you've added to a bird's household can see that bird's journeys, as they can see its care.

### Analytics

We use a service called PostHog to understand how the app is used, such as which screens people open and which features they rely on, including the Flock. This shows us what's working and what needs fixing.

PostHog doesn't use cookies, record your screen or see what you type. Before anything is sent, we remove links that give access to a care plan, sign-in details and private photo links. PostHog knows you by a one-way coded version of your account ID, never your name or email address. People using a sitter link aren't tied to any account.

### When something goes wrong

If the app runs into an error, it sends us a report so we can find and fix the problem, often before you've had to tell us.

A report includes the error message, the technical trail showing where in our code it happened, the page you were on, the app version, your device type and operating system, whether you were using the website or the iPhone or Android app, and the same coded account ID we use for analytics.

It never includes your birds' names, health notes, weights, care plan details, photos, posts or comments, your email address or sitter links. Reports go to PostHog and are kept for up to a year.

When saving something fails, we also keep a short anonymous record (what kind of error, on which screen, never what you typed) so we're alerted to problems quickly.

### Why we're allowed to use your data

Data protection law asks us to have a reason for everything we do with your data. Ours are:

- **To provide the service you asked for.** Running your account, care plans and sits; showing your Flock profile and posts to the members allowed to see them; your membership and payments; and account, sit, gift and membership emails and the notifications you turn on.
- **With your consent.** Marketing and community emails. You can withdraw your consent any time.
- **Our legitimate interest** in keeping the app and the community working, safe and getting better. That covers product analytics, security, fixing bugs and reviewing reported content. You can object to this (see your rights below).
- **To meet legal obligations,** such as keeping payment records for tax.

### Services that help us run Kya & Co.

These companies handle data for us, only to provide their service. We don't let them use it for their own purposes.

- **Supabase:** our database, sign-in and file storage. Handles your account details, birds, care plans, sits, logs and photos, and your Flock profile, posts, comments, reactions, reports, events, journeys and membership records.
- **Vercel:** hosts the app. Handles the requests your device makes, including your IP address.
- **Cloudflare Stream:** stores and plays videos. Handles the care clips and journey clips you upload.
- **Stripe:** takes payments. Handles the buyer's name, email, billing address and card details, and for a gift, the recipient's name, email and message. We never see or store card numbers.
- **Brevo:** sends our emails (based in France, data stored in the EU). Handles your email address, name, language, email preferences and how you found us; for the waitlist, the chapter you chose and whether you'd like to lead one; and for a gift, the recipient's email address.
- **PostHog:** product analytics and error reports, without cookies. Handles a coded account ID, the screens you use, your device type and error reports.
- **Google Sign-In and Sign in with Apple:** let you sign in, if you choose to. Handles the name and email address they share with us.
- **Apple Push Notification service and Firebase Cloud Messaging:** deliver notifications in the iPhone and Android apps. Handles a device token and the notification text.
- **Your browser's push service:** delivers notifications on the website, if you turn them on. Handles a push address for your browser and the notification text.
- [ADD WHEN IN-APP PURCHASES LAUNCH] **Apple App Store and Google Play:** handle purchases made in the iPhone and Android apps, under their own privacy policies. We receive whether your purchase is active, not your payment details. **RevenueCat:** keeps your app-store purchase and your account in step. Handles an app user ID and purchase records.

Our first Flock waitlist used Google Forms. Those answers have been moved into our own systems.

Links in the app to other sites, such as a vet finder or a video in the library, open those sites under their own policies.

### Where your data is stored

Our servers and most of our providers are in the United States. Our database and files are stored in the eastern US, so when you use Kya & Co. from the EU or UK, your data is transferred to the US. Brevo, our email provider, keeps your email details in the EU. We protect those transfers with the European Commission's Standard Contractual Clauses, or the EU-US Data Privacy Framework where a provider is certified under it.

### Sharing with sitters

When you create a sit, the invited sitter can access the care plan, contacts and media for the assigned birds while their link is active. Sitter access expires when the sit ends, or immediately if you revoke the link. Sitters never see anything from the Flock.

### Editing and deleting what you share

- **Profile:** change your display name, region, bio, photo and which birds members meet at any time, in the Flock under You.
- **Posts and comments:** edit or delete your own at any time. When you delete a post, it and the comments on it are hidden from everyone right away. We keep them for 180 days, then delete them permanently.
- **Journeys:** delete a journey you started, or one on a bird you own, and its videos are deleted with it.
- **Events:** change your RSVP at any time.

Content a reviewer has removed is hidden from everyone but you. We keep removed content, and the reports about it, for 180 days, then delete them.

### Marketing

We only send marketing or community updates if you opt in, when you sign up, join the waitlist or claim a founding spot. You can opt out at any time using the unsubscribe link in any of our emails, or by emailing brittany@thekyaproject.com. Emails about your account, sits, gifts and membership aren't marketing, and you'll get them while you have an account or a gift.

### Deleting your account

You can permanently delete your account from account settings. This removes:

- your birds, care plans, sits, logs, photos and clips
- your Flock profile and photo, posts, comments and their photos, reactions, reports, journeys and their clips, RSVPs and notifications, right away (the 180-day hold for a deleted post doesn't apply when you delete your whole account)
- the analytics and error data PostHog holds about your account

Events you hosted stay for the chapter, without your name.

Payment records Stripe keeps for tax and fraud rules aren't removed by deleting your account. If you bought through Apple or Google, cancel your subscription in the store too, because deleting your account doesn't stop the store billing you.

Your contact record with our email provider is managed separately and isn't removed by deleting your account. Every email we send includes an unsubscribe link, or you can ask us to delete it using the address below. How to delete your account (/delete-account) explains the steps and exactly what is removed.

### How long we keep your data

We keep your data while you have an account. When you delete it, we remove it as described above. Our database provider keeps daily backups for 7 days, so deleted data is gone from backups within a week. Error reports are kept for up to a year, or until you delete your account. We keep payment records for 7 years, as tax law requires. [NOTE FOR BRITTANY: confirm the 7 years with your accountant.] Posts you delete, content removed by a reviewer, and reports are kept for 180 days, then deleted.

### Children

Kya & Co. is for people aged 13 and over, and the Flock for people aged 18 and over. We don't knowingly collect data from children under 13. If you think a child has given us their details, email us and we'll delete them.

### Your rights

You can ask us to show you the data we hold about you, correct it, delete it, or send you a copy in a format you can take elsewhere. You can also ask us to limit how we use it, or object to us using it for analytics. Where we rely on your consent, you can withdraw it any time. Email brittany@thekyaproject.com and we'll reply within a month.

If you're not happy with how we've handled your data, you can complain to the data protection authority in your country. We'd be grateful if you told us first so we can try to put it right.

### Changes to this policy

When we change this policy in a way that matters, we'll tell you in the app or by email before the change applies, and update the date at the top.

### Contact

Questions about your data? Email us at brittany@thekyaproject.com.

---

## 7. Draft: terms of service

> Last updated: [DATE OF PUBLISHING]

### Using the service

Kya & Co. is a health and wellness app for parrots, run by The Kya Project, LLC. It helps you keep your bird's care and health in one place and share it with your household and the sitters who help. The Flock is The Kya Project's community for parrot people, inside the app.

Nothing in Kya & Co. or the Flock is veterinary advice. In an emergency, contact an avian vet.

By using Kya & Co. you agree to these terms. If you buy a plan or a gift, the sections on paid plans apply too.

### Who can use it

You need to be at least 13 to use Kya & Co. and at least 18 to join the Flock or buy a plan. If you're under 18, a parent or guardian must agree to these terms for you.

### Your account

You're responsible for keeping your sign-in details safe and for any sit links you share. Revoke a link if you no longer want the sitter to have access.

### Your content

You own what you add: bird profiles, care plans, clips, logs, and your Flock posts, comments, photos and journeys. You give us permission to store it and show it to you, your household, the sitters you invite, and the Flock members allowed to see it (the privacy policy explains who). That permission ends when you delete the content or your account. A post you delete is hidden from everyone at once and kept for 180 days before it's deleted for good; deleting your account removes your content right away. Backups keep copies for up to 7 days.

We never feature your Flock posts, photos or journeys outside the Flock, in our newsletter, on social media or anywhere else, without asking you first.

### The Flock

**Membership.** The Flock opens on Monday, January 4, 2027. Everyone who joins is free until Tuesday, July 6, 2027, and billing starts after that. The Kya & Co. care app stays free for everyone. A Flock membership adds the community and every training journey.

**Rescue adopters.** If you adopt a parrot from one of our partner rescues and apply through that rescue within 60 days of adopting, you can get six months of Flock membership free. Those six months start after July 6, 2027.

**What we offer.**

- Today's idea, posts, journeys, the library, chapters, and chapter events.
- Expert Q&As and other features as they're built.
- We may add, change or retire features. If we retire something central to what you paid for, we'll tell you first.

**Chapters and events.**

- Your chapter comes from the region on your profile.
- Chapter events are organized by members, not by The Kya Project, unless we say otherwise. Event suggestions are approved by the Kya team (The Kya Project's staff and the people who help run the Flock on our behalf) before they appear. Go at your own judgment.
- Please meet in public places, and leave birds at home unless the host says they're welcome.
- The Kya Project isn't responsible for what happens at or travelling to an event.

**Community rules.** The Flock works because people are kind and careful. When you post, comment, react or share a journey:

- **Be kind.** No harassment, insults, threats or hate.
- **Keep birds safe.** Don't share advice that could hurt a bird, such as withholding food, unsafe foods, or delaying vet care.
- **Posts aren't veterinary advice.** Members share their own experience, and none of it replaces an avian vet. When a post sounds like a bird may be unwell, the app suggests calling a vet. It never diagnoses and never stops you posting.
- **No selling or spam.** No advertising, selling birds or supplies, or fundraising, unless we've said a space allows it.
- **Share only what's yours.** Post only photos and videos you took or have permission to share, and don't share other people's private information.
- **Nothing unlawful,** and nothing that breaks Apple's or Google's rules for apps.

**Reporting and removal.**

- Any member can report a post, comment or journey update: unkind or harassing, unsafe advice for birds, spam or selling, or something else, with a note.
- Reports are private. The person you report isn't told who you are.
- When enough members report the same thing (three today), it's hidden until a reviewer looks at it.
- A reviewer may remove it, keep it and close the reports, or send its author a note.
- Do good posts and event suggestions are reviewed by the Kya team before they appear.
- We may remove content, limit what someone can do, or suspend or close an account that breaks these rules. If we remove a paying member for breaking the rules, we refund the time they've paid for but not used.
- Removed content and reports are kept for 180 days, then deleted.
- If you think we got something wrong, email brittany@thekyaproject.com.

### Paid plans

**The plans.**

| Plan | Price |
|---|---|
| Flock membership | $25 a month billed annually ($300 a year), or $30 month to month |
| Kya's Crew | $37 a month billed annually ($444 a year), or $45 month to month. 25% of each Crew membership goes to rescue and conservation partners, and each Crew member sponsors six free months for a new rescue adopter. It includes everything in a Flock membership. |

Nobody is charged before July 6, 2027. Kya's Crew goes on sale when billing starts after that date. The care app itself is free.

Prices are in US dollars and don't include taxes. Where taxes apply, they're added at checkout. [NOTE FOR BRITTANY: confirm with your accountant which states require sales tax on memberships before this goes live.]

**Founding membership.**

- Founding membership is limited to the first 50 people to claim a founding spot. Claiming needs no payment.
- Founding members pay $15 a month for life once billing starts after July 6, 2027. The founding price never changes.
- To keep your founding spot and price, add a card by July 6, 2027. We'll remind you before then.
- If your founding membership ends, the founding price ends with it. Rejoining later is at the regular price.
- If a founding member's payment fails, we'll contact you personally to sort it out before anything changes.
- Founding perks: a founding badge on your Flock profile; an invitation to the founders' kickoff call, then a monthly founders' call; a vote on the first expert Q&As and local chapters; early access to new features, journeys and library guides; and, if you choose, a place on the founding members page.

**Free trials.** Once billing starts after July 6, 2027, new Flock members get a 14-day free trial. If you don't cancel before the trial ends, your plan starts and you're charged. Founding members, rescue adopters and Kya's Crew members don't get a trial.

**Auto-renewal.**

- Monthly and yearly plans renew automatically at the end of each period, at the then-current price, until you cancel.
- We'll email you 30 days before a yearly plan renews. [NOTE FOR THE LAWYER: confirm this reminder, and the cancel and trial wording, meet California's automatic renewal law.]
- If a price changes, we'll tell you at least [DECISION NEEDED LATER: notice period for price changes] before it applies to your next renewal. The founding price never changes.

**How to cancel.**

- **Bought on the website:** cancel online in a few taps, any time, in the app under You, then Membership and billing.
- **Bought in the iPhone app:** cancel in your iPhone's Settings, under your name, then Subscriptions.
- **Bought in the Android app:** cancel in Google Play, under Payments and subscriptions.

When you cancel, you keep access until the end of the period you've paid for, and you won't be charged again. Deleting your account doesn't cancel a subscription bought through Apple or Google, so cancel it there too.

**Refunds.** You can cancel any time. If you ask within 14 days of your first payment on a plan, or within 14 days of a yearly renewal, we'll refund that payment in full. Otherwise payments aren't refunded, including partial refunds for unused time. This applies to everyone, wherever you live. If something went wrong with a charge, email us and we'll put it right.

**Purchases through Apple or Google.** If you buy a plan in the iPhone or Android app, Apple or Google takes the payment, and their terms and refund process apply alongside these terms. We can't issue refunds for those purchases. Request them from Apple or Google.

**Gift memberships.**

- A gift is a year in the Flock, paid for once, through Stripe. It doesn't renew.
- A gift year starts on the later of the day the gift is redeemed and July 6, 2027, the end of the free season.
- Gift codes never expire.
- A gift code can be redeemed once, on one account.
- The buyer can get a full refund within 30 days of purchase if the gift hasn't been redeemed. After that, gifts aren't refunded. A refunded gift's code stops working.
- If the recipient already has a membership, the gift's time is added after it, so no time is lost.

**Giving back.** 20% of every membership and gift goes to rescue and conservation partners. For Kya's Crew, it's 25% of each membership. On double-giving days, it's 40% of every gift.

### Acceptable use

Don't use the service to upload unlawful content, infringe others' rights, try to access another account's data, or interfere with how the service runs.

### Our responsibility to you

We work hard to keep Kya & Co. running and your data safe, but we can't promise it will always be available or free of errors. Kya & Co. and the Flock help you look after your bird; they don't replace your own judgment or your vet's.

To the extent the law allows, The Kya Project isn't liable for indirect or consequential losses, and our total liability to you is limited to what you paid us in the 12 months before the claim. Nothing in these terms limits rights you have under consumer law that can't be limited.

[NOTE FOR BRITTANY: have a lawyer review this section.]

### Ending your account

You can delete your account at any time from account settings (see the privacy policy for what's removed). We may suspend or close an account that breaks these terms. Where we can, we'll tell you why first.

### Governing law

These terms are governed by the laws of the State of Indiana, and disputes go to the courts of Allen County, Indiana. If you're a consumer living elsewhere, you keep the protections of your local law.

### Changes

We may update these terms. When a change matters, we'll tell you in the app or by email before it applies, and update the date at the top. If you keep using Kya & Co. after a change applies, the new terms apply to you.

### Contact

Questions about these terms? Email brittany@thekyaproject.com.

---

## 8. When the drafts are approved: what changes in the code

These steps are for later. This PR changes none of them.

1. **`src/routes/privacy.tsx`**
   - Replace the text with the approved policy.
   - Add Stripe (and later Apple, Google and RevenueCat) to `PROCESSORS`.
   - Bump `LAST_UPDATED`.
2. **`src/routes/terms.tsx`**
   - Replace the text.
   - Add a `LAST_UPDATED` and `<LegalUpdated>`, as the privacy page has.
3. ~~**Account deletion** sweeps Flock photos~~: **done in #477.**
4. **Link the terms where people pay:** the gift checkout note, the founding claim, and (later) the payment screens, for example "By continuing you agree to the terms."
5. **Tell existing account holders** about the update by email, as the "Changes" sections promise. Do this before the Flock opens.
6. **Keep the in-app Privacy screen** (`flock.you.privacy.tsx`) in step with "Who can see what".
7. **Before this policy can go live, the code must match these decisions** (each is a build item in `docs/flock/payments-plan.md`, section f):
   - **Deleting a post (D10):** today a deleted post and its comments are deleted at once. Change it to hide them right away and delete them for good after 180 days; deleting a whole account stays immediate.
   - **Removed content and reports (D9):** a daily job deletes reviewer-removed content and reports after 180 days. Today they're kept with no end date.
   - **Failed founding payments (D7):** email Brittany every time a founding member's payment fails, and change nothing automatically.
   - **Free trials (D15):** a 14-day trial for new Flock members once billing starts; none for founders, rescue adopters or Kya's Crew.
   - **Refunds (D1, D2):** the 14-day refund window for first payments and yearly renewals, and the 30-day window for unredeemed gifts, in the admin tools and support steps.
   - **Ages (D8):** the Flock's join step asks people to confirm they're 18 or older.
   - **Kya's Crew:** on sale when billing starts, with the Crew's 25% giving share and sponsored rescue-adopter months.
   - **Cancel online:** a cancel option in Membership and billing, ready when billing starts.
   - **Yearly renewal reminder:** an email 30 days before each yearly renewal.
   - **Founding members page:** opt-in, one unchecked checkbox in the claim flow (the plan's PR H).
