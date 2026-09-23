# Email plan: onboarding, lifecycle and delight

Working doc from the 2026-09-23 email audit with Brittany. Written to be picked up cold by
a new session: what exists today, what was decided, what to build, and the approved copy.

Product framing (see `CLAUDE.md`): Kya & Co. is a health and wellness app for parrots.
Sitter access is one way it keeps a bird healthy. Every email should serve the promise
**"we help you keep your bird healthy, and we notice the small things with you."**

---

## 1. Audit: what exists today

Numbers from the live database on 2026-09-23: 34 accounts (11 created since the drip
launched on 2026-07-21), 28 living birds, 64 sits.

### Where the code lives
- Templates: `src/lib/emailTemplates.ts` (the shared `shell()` layout plus one builder per email)
- Copy: `src/locales/emails.en.jsonc` and `emails.nl.jsonc` (English and Dutch)
- Sender: `src/lib/brevoEmail.server.ts` (Brevo transactional API; env `BREVO_API_KEY`,
  `BREVO_SENDER_EMAIL`, `BREVO_SENDER_NAME`)
- Cron routes: `src/routes/api/public/hooks/` (`onboarding-emails.ts`,
  `care-plan-reminders.ts`, `engagement-nudges.ts`), scheduled by pg_cron:
  - `care-plan-reminders-daily` at 09:00 UTC
  - `onboarding-emails-daily` at 15:00 UTC
  - `engagement-nudges-daily` at 16:00 UTC
- Signup lead capture to Brevo: `supabase/functions/capture-lead`

### Onboarding drip (new signups only, one email per day at most, each email once)
| Stage | Trigger | Sent so far |
|---|---|---|
| `add_first_bird` | day 2+, no bird | 4 |
| `log_first_weight` | bird 3+ days old, no weight | 2 |
| `run_first_scan` | bird 5+ days old, no health scan | 3 |
| `start_care_plan` | bird 7+ days old, empty care plan | 0 |
| `weight_trend` | first weight in the last 7 days | 3 |

### Reminders
- Care-plan check-in (email and push): a sit starts within 3 days and the plan is 14+ days
  stale. Never sent.
- Weigh-in reminders and lapse check-ins at 10 and 30 days: **push only**. 15 weigh-in
  reminders sent, 0 check-ins.

### Transactional
- Household sits: assigned, updated, cancelled (localized)
- Sitters without an account: invite, updated, cancelled (English only)
- Household invite, handoff invite, handoff accepted, handoff declined
- During a sit: all-clear daily log (owner can turn it off) and flagged-scan alert (always sent)
- "Sitter flagged something serious": `notifyOwnerSomethingWrong` in
  `src/lib/sitter.functions.ts`. This is a plain unbranded `<p>` with no button, English only.
- Signup confirmation, password reset and email change are Supabase Auth templates, set in
  the Supabase dashboard rather than the repo. **Check that they're branded.**

### Gaps found
1. No welcome email. A new owner hears nothing until day 2.
2. None of the emails celebrate the health record the owner is building, and there are no milestones.
3. The drip ends after about a week. Owners without push then get nothing.
4. The `notify_sitter_opened` and `push_sitter_opened` settings exist, but nothing sends them.
5. The serious-concern email is the least polished email in the app.
6. Drip emails link to `/dashboard` instead of the page they talk about.
7. Typo: "on Kya & Co.." (double period) in the household and handoff invite copy.
8. `BREVO_SENDER_NAME` defaults to "The Kya Project" while the brand is "Kya & Co.". Check the Vercel env.
9. Onboarding emails have no opt-out. Add a lifecycle toggle in notification settings.
10. The first-weight email says "a kitchen scale and ten seconds". Change it to "a couple of minutes" (see decisions).

---

## 2. Decisions (2026-09-23)

- **Welcome email** comes from Brittany. **Reply-to: brittany@thekyaproject.com.**
- **Origin story:** name Kya ("It started with my rescue macaw, Kya"). Don't mention being
  a mom or a partner. Use "whether I'm home or someone else is filling in".
- **No specific durations.** Weighing takes longer than the health scan, so say "a couple of
  minutes" rather than "ten seconds" or "two minutes".
- **Weight alerts: yes.** This needs the normal-range and baseline feature first. See the
  `docs/BACKLOG.md` entry "Each bird's normal weight range, and alerts when a weigh-in falls
  outside it".
- **Sitter thank-you: approved.** Send it once after a sit, and never add sitters to the
  marketing list.
- **Community:** a membership waitlist exists (it includes AMAs and local chapters; the
  `WaitlistCard` is on `/explore`). The podcast is coming but not live.
- **When a bird dies:** draft a personal note from Brittany (below). This is sensitive and
  still under review.
- **Brevo automations: unknown.** Brittany is to check Brevo, Automations. Or, with her
  explicit OK, read the API key from Vercel and list the automations read-only.

---

## 3. The journey

Ground rules:
- Name the bird in every email.
- Show the owner what their record has built.
- Send at most one lifecycle email a day and three a week. Transactional emails and
  health alerts don't count toward the cap.
- Keep three kinds of email separate: transactional (always sent), lifecycle (with an
  opt-out toggle), and community (Brevo, opted-in contacts only).
- When a bird dies, pause everything about that bird. This already works.

### Welcome (day 0)
- **Welcome from Brittany.** Sent about an hour after signup, and it changes depending on
  whether a bird exists yet. *New, needed before launch.*
- **"[Bird]'s record is open".** Sent when the first bird is added, merged into the welcome
  on day 0. *New.*

### Build the baseline (days 1–10)
- The existing drip stays, with deep links to the right pages.
- **Reframe `start_care_plan`** as "Write down what normal looks like for [bird]": the care
  plan is the bird's health baseline, with the sitter view as a benefit. Link to
  `/birds/:id/plan`.
- **New: "[Bird]'s first week on the record"** on day 10: weights logged, health checks
  done, care-plan sections finished.

### Everyday health (ongoing)
- **New: "[Bird]'s month"** on the 1st of each month, for active owners. It shows the
  weight trend, health-check count, journal moments and a field-notes article. This is the
  main thing that keeps people coming back.
- **Revise:** add email versions of the weigh-in and check-in nudges for owners without push.
- **New: "Bring [bird]'s record to the vet"** around day 21. This needs the vet-summary PDF
  in the native apps (see the backlog).
- **New: weight alerts** once the normal range exists (see the backlog).

### Milestones
Care plan complete (all six sections Ready) · 30 health checks on the record · hatch day
(`birds.birth_date`) · adoption anniversary (`birds.acquired_on`) · one year with Kya, with a
year in review.

### Circle of care
- **New: "Who else helps care for [bird]?"** around day 14, when there are no household members.
- **New: "Your sitter opened [bird]'s care plan".** This also fixes the setting that does nothing.
- **New: "While you were away".** A summary for the owner when a sit ends: health checks,
  anything flagged, the sitter's notes.
- **New: sitter thank-you.** Sent once, with an invitation to start a record for their own bird.

### Moments that need care
- **Redesign the serious-concern email** into the shared `shell()`, with a button and
  localized copy. *Before launch.*
- **New: personal note when a bird dies** (draft below).

### Community bridge (days 21–30, marketing opt-in only)
Invite engaged owners to join the membership waitlist (AMAs and local chapters). The podcast
gets a "coming soon" line or waits for launch. **Brittany to decide which.**

---

## 4. Priorities

**Before launch**
1. Welcome email
2. Serious-concern email redesign
3. Small fixes: double period, sender name, the sitter-opened setting, "ten seconds" copy
4. Check the Supabase Auth templates are branded
5. Reframe the care-plan email and deep-link every drip email

**First month after launch**
6. First-week recap
7. Monthly "[Bird]'s month"
8. Email fallbacks for push nudges
9. "While you were away"
10. Household nudge
11. Lifecycle opt-out toggle

**Later**
12. Milestones and anniversaries
13. Vet summary email
14. Weight alerts (after the normal-range feature)
15. Sitter thank-you
16. Community bridge
17. Year in review

Implementation notes:
- New emails follow the existing pattern: a builder in `emailTemplates.ts`, English and
  Dutch keys in `emails.*.jsonc`, and a send logged after confirmation.
- The welcome email goes out through the onboarding cron as a new stage.
- `sendTransactionalEmail` has no reply-to option. Add a `replyTo` field (Brevo's
  `replyTo: { email, name }`) for the welcome email and the bereavement note.

---

## 5. Approved and draft copy

### Welcome email (final draft, pending Brittany's last read)

> **Subject:** Welcome to Kya & Co.!
> **Preview text:** A health record for your bird, built a few minutes at a time.
> **Reply-to:** brittany@thekyaproject.com
>
> Hi [first name]!
>
> I'm Brittany, founder of The Kya Project. It started with my rescue macaw, Kya, which is where the name comes from. I love my birds more than anything. Parrots are still wild animals, and caring for them well takes more than it does for a dog or a cat: the right diet, real enrichment, and a close eye for anything that seems off. I built Kya & Co. so my birds get that care every single day, whether I'm home or someone else is filling in.
>
> Here's where to start this week:
>
> - **Add your bird.** A name and a species is enough for now. *(If a bird already exists: "[Bird]'s record is ready.")*
> - **Log a first weight.** All you need is a kitchen scale that reads in grams. Weight is often the first sign that something has changed.
> - **Run a daily health scan.** It only takes a couple of minutes. The normal days count too, because they're what make a change stand out.
>
> Both habits only take a couple of minutes a day, and together they build a record you can bring to your vet.
>
> When you're ready, the care plan puts everything you know about your bird in one place, and you can share it with a sitter or family member whenever someone else is helping out.
>
> If you have a question, or just want to tell me about your bird, reply to this email. It comes straight to me!
>
> Warmly,
> Brittany
>
> **[Open Kya & Co.]**

### Personal note when a bird dies (draft, under review)

Sending rules:
- Send the day after the owner marks the bird as passed.
- Send once per bird. Two birds marked on the same day get one note.
- Use a plain personal-email layout: no logo banner and no button.
- Never send it for a handoff.
- Use the bird's name only, with no gendered wording for the owner (see BUG-6 in
  `docs/qa-bugs-2026-09-16.md`).

> **Subject:** Thinking of you and [Bird]
>
> Hi [first name],
>
> I saw that [Bird] passed away, and I'm so sorry.
>
> Losing a bird is its own kind of grief. They're with us for years, sometimes decades, and they fill a home with a personality that people who haven't lived with a parrot don't always understand. Please be gentle with yourself.
>
> [Bird]'s record, journal and moments are safe in Kya & Co. whenever you want to look back. There's nothing you need to do, and you won't get any reminders about [Bird].
>
> If you ever want to share a favorite story about [Bird], you can reply to this email. I'd be honored to read it.
>
> Warmly,
> Brittany

Open question: "years, sometimes decades" may not fit a very young bird or a short foster
placement. Drop it if Brittany wants the note more general.

---

## 6. Open items for Brittany
- [ ] Final read of the welcome email
- [ ] Final read of the bereavement note, and whether to send it at all
- [ ] Check Brevo, Automations, or approve a read-only API check
- [ ] Podcast: a "coming soon" line in the community email, or wait for launch?
- [ ] An avian vet to review the weight-alert thresholds (see the backlog)
- [ ] The blog post title "the ten-second morning habit" conflicts with the new "couple of minutes" wording
