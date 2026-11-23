# Review queue

Things for Brittany to look over from the unattended agent runs, with PR links. Agents add new items at the **top** of their section, in the same PR as the work.

**Brittany clears items as she reviews them. Agents never remove or rewrite an item she hasn't cleared,** including items another run added. The rules are in CLAUDE.md, "Working the backlog unattended"; the run-by-run record is [`agent-log.md`](agent-log.md).

---

## Copy that merged

Every new or changed line of wording that merged, so it can be read after the fact. One item per PR.

Format:

```
### <PR link> · <item ID> <item title>
- **Where:** <screen, email or file the line appears in>
  - Before: "<old wording>" (or "new")
  - After: "<new wording>"
```

### [#516](https://github.com/the-kya-project/perch-perfect-plan/pull/516) · D3 Seasonal calendar file
Approved and merged by Brittany (Nov 22, 2026). All 22 cards are new, as merged; nobody sees them until D2.1 shows the card on Home. Source files: `src/locales/seasonal.en.jsonc` and `seasonal.nl.jsonc`.
- **Where:** Home's Today card, `winterDryAir`
  - Before: new
  - After: "Dry winter air" / "Heating dries out the air indoors. A regular shower or misting, and a humidifier in the room, help keep your bird comfortable."
  - Dutch: "Droge winterlucht" / "Door de verwarming wordt de lucht binnen droog. Een vaste douche- of sproeibeurt en een luchtbevochtiger in de kamer helpen je vogel zich prettig te voelen."
- **Where:** Home's Today card, `winterDrafts`
  - Before: new
  - After: "Keep out the cold" / "Check the cage isn't near a drafty window, an outside door or a heating vent. A cover at night helps hold in warmth."
  - Dutch: "Houd de kou buiten" / "Zet de kooi niet bij een tochtig raam, een buitendeur of een verwarmingsrooster. Een kooideken 's nachts houdt de warmte vast."
- **Where:** Home's Today card, `springCleaning`
  - Before: new
  - After: "Bird-safe spring cleaning" / "Strong cleaners, sprays and fresh paint give off fumes. Move your bird to another room with fresh air while you clean, and choose bird-safe products."
  - Dutch: "Vogelveilige voorjaarsschoonmaak" / "Sterke schoonmaakmiddelen, sprays en verse verf geven dampen af. Zet je vogel in een andere kamer met frisse lucht terwijl je schoonmaakt, en kies vogelveilige middelen."
- **Where:** Home's Today card, `springWindows`
  - Before: new
  - After: "Windows and doors" / "Warmer days mean open windows and doors. Put a screen in every open window, and know where your bird is before anyone opens a door."
  - Dutch: "Ramen en deuren" / "Warmere dagen betekenen open ramen en deuren. Zorg voor een hor in elk open raam, en weet waar je vogel is voordat iemand een deur opent."
- **Where:** Home's Today card, `summerHeat`
  - Before: new
  - After: "Summer heat" / "Keep the cage out of direct sun and away from hot windows. Change the water more often, and offer a cool shower on hot days."
  - Dutch: "Zomerhitte" / "Zet de kooi uit de volle zon en weg van warme ramen. Ververs het water vaker, en bied op warme dagen een koele douche aan."
- **Where:** Home's Today card, `autumnRoutine`
  - Before: new
  - After: "Shorter days" / "As the evenings draw in, keep bedtime and wake-up at the same time each day so your bird gets a steady night's sleep."
  - Dutch: "Kortere dagen" / "Nu het eerder donker wordt: houd bedtijd en opstaan elke dag op hetzelfde tijdstip, zodat je vogel een vaste nachtrust krijgt."
- **Where:** Home's Today card, `autumnHeating`
  - Before: new
  - After: "Heating season" / "The first run of the heating can give off dust and smells. Air the room before your bird is in it, and keep space heaters well away from the cage."
  - Dutch: "Het stookseizoen" / "Als de verwarming voor het eerst weer aangaat, kunnen er stof en geurtjes vrijkomen. Lucht de kamer voordat je vogel er is, en houd elektrische kacheltjes ver van de kooi."
- **Where:** Home's Today card, `valentines`
  - Before: new
  - After: "Flowers and chocolates" / "Keep bouquets and chocolates out of your bird's reach. Many cut flowers, and all chocolate, aren't safe for birds."
  - Dutch: "Bloemen en chocolade" / "Houd boeketten en chocolade buiten bereik van je vogel. Veel snijbloemen, en alle chocolade, zijn niet veilig voor vogels."
- **Where:** Home's Today card, `clocksForward`
  - Before: new
  - After: "The clocks go forward this weekend" / "Shift mealtimes and bedtime by a few minutes a day, so your bird's routine moves gently with the clocks."
  - Dutch: "De klok gaat dit weekend een uur vooruit" / "Verschuif eet- en bedtijd elke dag een paar minuten, zodat de routine van je vogel rustig meeschuift met de klok."
- **Where:** Home's Today card, `easter`
  - Before: new
  - After: "Easter treats" / "Keep chocolate eggs out of reach, and pick up foil wrappers and plastic basket grass, which birds love to chew."
  - Dutch: "Paaslekkers" / "Houd chocolade-eitjes buiten bereik, en ruim zilverpapiertjes en plastic paasgras op: daar kauwen vogels graag op."
- **Where:** Home's Today card, `kingsDay`
  - Before: new
  - After: "King's Day" / "Street parties and music can go on all day. Keep the windows near your bird closed, and give your bird a quiet spot to retreat to."
  - Dutch: "Koningsdag" / "Straatfeesten en muziek kunnen de hele dag doorgaan. Houd de ramen bij je vogel dicht, en geef je vogel een rustig plekje om zich terug te trekken."
- **Where:** Home's Today card, `summerTravel`
  - Before: new
  - After: "Summer trips" / "Going away? Share the care plan with your sitter before you leave, and put your avian vet's number where they'll see it."
  - Dutch: "Zomervakantie" / "Ga je weg? Deel het verzorgingsplan met je oppas voordat je vertrekt, en leg het nummer van je vogeldierenarts op een plek waar de oppas het ziet."
- **Where:** Home's Today card, `julyFourth`
  - Before: new
  - After: "Fourth of July fireworks" / "Fireworks can go on for days around the Fourth. Close the curtains, keep the windows shut, and leave some music on to soften the bangs."
  - Dutch: "Vuurwerk op 4 juli" / "Rond 4 juli kan er dagenlang vuurwerk zijn. Doe de gordijnen dicht, houd de ramen gesloten, en laat wat muziek aan om de knallen te dempen."
- **Where:** Home's Today card, `clocksBack`
  - Before: new
  - After: "The clocks go back this weekend" / "Shift mealtimes and bedtime by a few minutes a day, so your bird's routine moves gently with the clocks."
  - Dutch: "De klok gaat dit weekend een uur terug" / "Verschuif eet- en bedtijd elke dag een paar minuten, zodat de routine van je vogel rustig meeschuift met de klok."
- **Where:** Home's Today card, `halloween`
  - Before: new
  - After: "Halloween" / "With the doorbell ringing, keep your bird away from the front door. Use battery lights in pumpkins instead of candles."
  - Dutch: "Halloween" / "Gaat de deurbel steeds? Houd je vogel dan uit de buurt van de voordeur. Gebruik batterijlichtjes in pompoenen in plaats van kaarsjes."
- **Where:** Home's Today card, `thanksgiving`
  - Before: new
  - After: "Cooking for a crowd" / "Keep your bird well away from the kitchen: overheated non-stick pans and the oven's self-clean setting give off fumes that are dangerous to birds."
  - Dutch: "Koken voor veel gasten" / "Houd je vogel ver uit de keuken: oververhitte pannen met antiaanbaklaag en de zelfreinigingsstand van de oven geven dampen af die gevaarlijk zijn voor vogels."
- **Where:** Home's Today card, `sinterklaas`
  - Before: new
  - After: "Sinterklaas treats" / "Keep chocolate letters, pepernoten and other sweets out of your bird's reach, and pick up wrapping paper and ribbon."
  - Dutch: "Sinterklaaslekkers" / "Houd chocoladeletters, pepernoten en ander snoepgoed buiten bereik van je vogel, en ruim cadeaupapier en lint op."
- **Where:** Home's Today card, `holidayDecorations`
  - Before: new
  - After: "Decorating safely" / "Tinsel, glass ornaments and string lights are tempting to chew. Keep them out of reach, and stay close whenever your bird is near the tree."
  - Dutch: "Veilig versieren" / "Engelenhaar, glazen kerstballen en lichtsnoeren zijn verleidelijk om op te kauwen. Hang ze buiten bereik, en blijf erbij als je vogel bij de boom is."
- **Where:** Home's Today card, `holidayCandles`
  - Before: new
  - After: "Candles and scents" / "Keep lit candles, scented sprays and plug-in air fresheners out of the room your bird is in, and never leave a flame unattended."
  - Dutch: "Kaarsen en geurtjes" / "Houd brandende kaarsen, geursprays en geurstekkers uit de kamer waar je vogel is, en laat een vlam nooit onbeheerd."
- **Where:** Home's Today card, `holidayTravel`
  - Before: new
  - After: "Holiday travel" / "If you're traveling, share the care plan with your sitter before you go. If your bird is coming along, pack familiar food and toys."
  - Dutch: "Op reis tijdens de feestdagen" / "Ga je op reis? Deel het verzorgingsplan met je oppas voordat je vertrekt. Gaat je vogel mee, neem dan het vertrouwde voer en speelgoed mee."
- **Where:** Home's Today card, `holidayMeals`
  - Before: new
  - After: "Holiday meals" / "Keep chocolate, avocado, alcohol and salty or fatty foods away from your bird, and ask guests not to share from their plates."
  - Dutch: "Feestmaaltijden" / "Houd chocolade, avocado, alcohol en zout of vet eten weg van je vogel, en vraag gasten niets van hun bord te delen."
- **Where:** Home's Today card, `newYearFireworks`
  - Before: new
  - After: "New Year's fireworks" / "Fireworks can startle birds. Close the curtains, leave a soft light and some music on, and keep your bird in the quietest room."
  - Dutch: "Vuurwerk rond oud en nieuw" / "Vuurwerk kan vogels laten schrikken. Doe de gordijnen dicht, laat een zacht lampje en wat muziek aan, en zet je vogel in de rustigste kamer."

### [#508](https://github.com/the-kya-project/perch-perfect-plan/pull/508) · 0.5 Admin review for pending posts
No new strings: every line reuses existing wording, in new places (admins only).
- **Where:** Flock settings (You), a new row for reviewers
  - Before: new
  - After: "Review queue" / "Admin · {count} waiting"
- **Where:** Review queue, an item's label
  - Before: "Report · comment"
  - After: "Report · comment · Learn together" (the post's space, "{name} chapter", or "Journeys"; events add their chapter)
- **Where:** Review queue, a report's detail line
  - Before: "Reported by 2 members"
  - After: "Reported by 2 members · 1h"

---

## Decisions agents made

Judgment calls a run made on its own, even small ones: a name, an order, a default, how an unclear spec was read.

Format:

```
### <PR link> · <item ID> <item title>
- **Decision:** <what was decided>
- **Why:** <the reason, in plain language>
- **To change it:** <what would need to change>
```

### [#525](https://github.com/the-kya-project/perch-perfect-plan/pull/525) · 1.14 Billing foundation (switched off)
- **Decision:** Test mode is enforced in code: billing refuses any Stripe key that isn't a test key (`getBillingStripe` in `src/lib/stripe.server.ts`), in every deployment, production included. Gifts keep using the live key as before.
- **Why:** your approval was "test mode only". Putting it in code means turning `BILLING_ENABLED` on in production can't charge a real card by accident. Going live becomes a deliberate one-line code change you approve.
- **To change it:** remove the key check in `getBillingStripe` when payments go live.

### [#525](https://github.com/the-kya-project/perch-perfect-plan/pull/525) · 1.14 Billing foundation (switched off)
- **Decision:** The switch is on only when `BILLING_ENABLED` is exactly `true`. Anything else, unset included, is off. While it's off, the webhook answers 503 before reading anything, the server functions return "off" without calling Stripe, and Membership shows exactly what it shows today.
- **Why:** the spec names the variable but not its value. A single strict value means a typo can't turn billing on.
- **To change it:** `billingEnabled()` in `src/lib/billing.ts`.

### [#525](https://github.com/the-kya-project/perch-perfect-plan/pull/525) · 1.14 Billing foundation (switched off)
- **Decision:** Nothing about the card step shows in the iPhone or Android app, not even an "open this in your browser" line. Membership looks the same there as it does today.
- **Why:** the backlog says "never shown in the native app". The plan's "open this link in your browser" line conflicts with that, and Apple's rules on pointing people to web payments outside the US make a line like that risky.
- **To change it:** `cardStep()` in `src/lib/billing.ts` returns "hidden" for the app.

### [#525](https://github.com/the-kya-project/perch-perfect-plan/pull/525) · 1.14 Billing foundation (switched off)
- **Decision:** A founder whose founding price is still open always gets the $15 founding price, with no monthly/yearly choice. Everyone else picks monthly or yearly, with yearly selected by default. With no free-season end stored, the card step says "Adding a card opens once the free season's end is set." and can't start a checkout. Within 49 hours of the end (Stripe's 48-hour minimum for a trial, plus an hour), or after it, the card is charged the same day, with no trial. A member with a card already on file can't start a second subscription; they see "Manage billing" (Stripe's Customer Portal) instead.
- **Why:** this follows payments-plan section d ("No yearly founding option"; `trial_end` = the free season's end). The yearly default, the not-ready line and the near-the-end rule weren't specified.
- **To change it:** `checkoutPlan`, `firstCharge` and `cardStep` in `src/lib/billing.ts`; the default `useState("annual")` in `BillingCardStep.tsx`.

### [#525](https://github.com/the-kya-project/perch-perfect-plan/pull/525) · 1.14 Billing foundation (switched off)
- **Decision:** Left out of this PR: refunds of memberships (the plan says "a full refund ends access now"), cancelling a Stripe subscription when an account is deleted, the end-of-season job that releases founders, the admin lists, and the 14-day trial. Stripe's statuses are mapped as follows: `unpaid` → past_due (access runs out with the period), `paused` and `incomplete_expired` → canceled, `incomplete` → no row.
- **Why:** 1.14 covers the payments build's items 1–3 (schema, webhook, card step); the rest are later items. Refunds need a choice: the webhook re-reads the subscription, so marking a refunded row as ended would be undone by the next event. The simplest fix is to cancel the subscription in Stripe when refunding, and the webhook then ends access. Account deletion is a care-app flow current users rely on, so it was left alone.
- **To change it:** say which you'd like for refunds, and it becomes its own item.

### [#519](https://github.com/the-kya-project/perch-perfect-plan/pull/519) · 2.2 A version endpoint and release rules
- **Decision:** Ported the endpoint and rules from the reference branch `fix/native-release-catchup`, with three changes: (1) "update now or later" is its own rule, `releaseUpdateAction`, the same rule a service-worker update follows today (a quiet moment with no form in progress → now; otherwise the banner); (2) a new `parseVersionResponse` reads the endpoint's answer and ignores anything else (an error page, a proxy); (3) the branch's `staleCodeAction` (what a missing code file does) was left out, since 2.1 already handles missing files on `main` and it isn't part of 2.2. The numbers are the branch's: check hourly, at most once a minute on return to the foreground, give up after 8 seconds, never reload for the same build twice within 10 minutes.
- **Why:** the backlog asks for the pure rules for "a new release is out, update now or later", with nothing behaving differently yet. Nothing calls them until 2.3.
- **To change it:** the constants at the top of `src/lib/releaseCheck.ts`; `npm run test:release-check` pins them.

### [#516](https://github.com/the-kya-project/perch-perfect-plan/pull/516) · D3 Seasonal calendar file · approved and merged by Brittany, Nov 22, 2026
- **Decision:** Some cards are for one country: Fourth of July, Halloween, Thanksgiving and the US clock changes are US-only; King's Day, Sinterklaas and the European clock changes are Netherlands-only. `cardForDate(date, region)` shows a country's cards only when it's asked for that country, and only the cards for everyone when no country is given. The file doesn't decide how Home knows the country: that's D2.1's call (the home time zone or the app's language would both work).
- **Why:** the scope notes warn about "holidays wrong for the region (the app ships in Dutch too)". Keeping the country out of the file leaves D2.1 free to pick the signal.
- **To change it:** change a card's `region` in `src/lib/seasonalCalendar.ts`.

### [#516](https://github.com/the-kya-project/perch-perfect-plan/pull/516) · D3 Seasonal calendar file · approved and merged by Brittany, Nov 22, 2026
- **Decision:** One card per day. Seven season cards cover the year with no gaps (northern-hemisphere seasons); holiday cards take over for a few days around their date (for example fireworks Dec 29 – Jan 1, Thanksgiving's card the Tuesday to Thursday, the clock changes Thursday to Sunday). When two holidays share a day, the shorter one wins (Halloween over the US clock change). Left out: holidays on a moving lunar date (Hanukkah, Diwali, Lunar New Year), Mother's Day and Guy Fawkes; the December candles card covers candles for every tradition.
- **Why:** the backlog asked for "a rule for which day it shows"; one card a day keeps Home simple, and a test proves no day is empty.
- **To change it:** add, remove or re-date a card in `src/lib/seasonalCalendar.ts` and its two lines in each language file; the test lists anything missing.
- **Still open after the merge:** `npm run test:seasonal-calendar` isn't in CI yet (one line in `.github/workflows/hydration.yml`; runs can't push workflow changes).

### [#516](https://github.com/the-kya-project/perch-perfect-plan/pull/516) · D3 Seasonal calendar file · approved and merged by Brittany, Nov 22, 2026
- **Decision:** Food and fume lines (chocolate, avocado, alcohol, overheated non-stick pans, the oven's self-clean setting, cleaning sprays, candles) are treated as plain care reminders, not health advice, so they don't wait for the vet. No card mentions symptoms, illness or what to do if a bird is unwell.
- **Why:** the item says "plain care reminders only, never health advice". These are common household safety steps the app already uses elsewhere, but you may want the vet to see them too.
- **To change it:** soften or remove the line in `src/locales/seasonal.en.jsonc` (and its Dutch), or add the cards to the vet packet.

### [#516](https://github.com/the-kya-project/perch-perfect-plan/pull/516) · D3 Seasonal calendar file · approved and merged by Brittany, Nov 22, 2026
- **Decision:** The words are their own language files (`seasonal.en.jsonc` and `seasonal.nl.jsonc`), listed in the translate step like the routine catalog. The app doesn't load them yet; D2.1 adds them when Home shows the card. The Dutch was written by hand and stamped, because the run can't call the translate step.
- **Why:** keeps the cards out of the main word list (which only holds words the code names) and adds nothing to any page until D2.1.
- **To change it:** a native speaker can edit the Dutch directly; the next translate run keeps hand edits.

### [#515](https://github.com/the-kya-project/perch-perfect-plan/pull/515) · 1.2 Vet-content settings file and a switch for every health feature · approved and merged by Brittany, Nov 22, 2026
- **Decision:** Seven switches: `daily_health_check`, `care_weight_trend`, `emergency_guides`, `passing_guidance`, `diet_conversion`, `vet_nudge` (all start at `everyone`, so nothing changes) and `weight_baseline` (starts `off`, for D1). None is read by the app yet. "Everyone" means every signed-in person, and the server for sit links; signed-out visitors can't call the switch directly.
- **Why:** wiring a live feature to a switch means deciding what users see when it's off, which the backlog doesn't say. Starting at everyone keeps the merge invisible.
- **To change it:** add or rename rows in a new migration and in `src/lib/healthFeatures.ts`; wiring a feature is its own PR.
- **Still open after the merge:** whether to wire the live features (daily health check, weight trend, emergency guides, passing guidance) to their switches, and what a switched-off one looks like. `npm run test:health-rules` isn't in CI yet (one line in `.github/workflows/hydration.yml`; runs can't push workflow changes).

### [#515](https://github.com/the-kya-project/perch-perfect-plan/pull/515) · 1.2 Vet-content settings file and a switch for every health feature · approved and merged by Brittany, Nov 22, 2026
- **Decision:** Most sources say "Kya & Co. starting value; no published source", because that's what they are. Only the baseline's 10% "call your vet today" level and the poison lines cite outside sources. Wording isn't copied into the file: it lists the language keys for each area, and a test checks those keys exist. The app's code keeps its own copies of the numbers, and the test fails if they drift from the file, so this PR doesn't touch the live triage or weight code.
- **Why:** the backlog asked for a research source per value, and making one up would mislead the vet. Leaving the live code alone keeps the PR from changing anything users see.
- **To change it:** add sources as the vet review supplies them; make the code import from the file in a later PR if you'd prefer one copy.

### [#514](https://github.com/the-kya-project/perch-perfect-plan/pull/514) · 2.1 The startup guard listens before anything can fail · approved and merged by Brittany, Nov 22, 2026
- **Decision:** The guard is added to each page's HTML by the server entry (`src/server.ts`, `withStartupGuard` in `src/lib/startupGuard.ts`), not rendered by React. It goes right after `<meta charset>`, not before it.
- **Why:** React 19 moves every `<meta>`, `<link>` (including the code preloads and the font stylesheet) and `<title>` above any script in `<head>`, so a React-rendered guard can't come first. The charset has to stay in the page's first 1024 bytes. Only the app's own pages get the guard (a `<head>` that loads `/assets/` code). The unsubscribe, bereavement-review and error pages don't, because there it would show "Something's taking too long".
- **To change it:** `src/lib/startupGuard.ts`. The order is pinned by `e2e/startup-guard.spec.ts`.

### [#514](https://github.com/the-kya-project/perch-perfect-plan/pull/514) · 2.1 The startup guard listens before anything can fail · approved and merged by Brittany, Nov 22, 2026
- **Decision:** The 30 WebKit runs live inside `e2e/startup-guard.spec.ts` (30 copies of the missing-file test, WebKit only), not as a new step in `hydration.yml`. The checks of how the guard is added to the HTML are in the same file.
- **Why:** GitHub refused this run's push of a workflow change: the hourly runs' token has no Workflows permission. The iPhone hydration job already runs every spec, so the 30 runs happen in CI anyway.
- **To change it:** if you'd rather have its own step, add `npx playwright test -c e2e startup-guard.spec.ts --project 'webkit-en'` to `hydration.yml` yourself. Runs can't edit workflows.

### [#514](https://github.com/the-kya-project/perch-perfect-plan/pull/514) · 2.1 The startup guard listens before anything can fail · approved and merged by Brittany, Nov 22, 2026
- **Decision:** The "list of the page's code files" is `window.__kyaCode` (`files` and `failed`), kept by the guard. The root error screen treats any failed code file on it as a missing file (one automatic reload, then the error screen), without asking the server first.
- **Why:** it's simple and needs no network call. The one-reload limit already stops a loop. The reference branch (`fix/native-release-catchup`) also asked the server (HEAD) and waited for loading to settle. That's the sitter-preview fix and belongs with 2.5, so it isn't here.
- **To change it:** `pageCodeFailed` in `src/lib/sw-register.ts`.

### [#508](https://github.com/the-kya-project/perch-perfect-plan/pull/508) · 0.5 Admin review for pending posts
- **Decision:** The way in is a "Review queue" row in its own card at the top of Flock settings, shown to anyone `flock_can_review()` lets in (admins today, and chapter leads, who see Events only). It isn't in the care app's settings or any shared menu.
- **Why:** the item allowed "admin menu or Flock settings". There's no admin menu, and Flock settings keeps it inside Flock-only code, so free users can't be affected.
- **To change it:** move the row in `src/routes/_authenticated/flock.you.index.tsx`.

### [#508](https://github.com/the-kya-project/perch-perfect-plan/pull/508) · 0.5 Admin review for pending posts
- **Decision:** The space for reports comes from a new function (`flock_review_post_spaces`) rather than changing `flock_review_queue`. A report shows its date as the latest report's time.
- **Why:** the item says to hold the PR if an existing database function has to change. A new function only adds, so the PR could merge.
- **To change it:** fold the space into `flock_review_queue` in a later migration (that changes an existing function, so it needs Brittany's approval).

### [#507](https://github.com/the-kya-project/perch-perfect-plan/pull/507) · 1.11 Buddy pods
- **Decision:** A "keep going" group is still a pod, so the block, reporting, admin and 3-week rules apply. When the 3-week rule closes one, it ends without asking "Keep going together?" again. "You finished!" and "Keep going together?" aren't in the mockup, so they're built from the app's existing card and sheet components and listed in the PR.
- **Why:** Brittany's answer didn't cover a "keep going" group going quiet, and asking again could keep an inactive group open forever. The spec holds PRs for unmocked screens, and this keeps those two small messages from blocking 1.11.
- **To change it:** change the item in `docs/BACKLOG.md`, or ask for a mockup of the two messages.

### [#506](https://github.com/the-kya-project/perch-perfect-plan/pull/506) · 1.11 Buddy pods
- **Decision:** Progress from a "Just me" journey is never shown in a pod.
- **Why:** The spec shows journey progress on the pod page, but its first rules say nothing from a "Just me" journey reaches anyone outside the household.
- **To change it:** change the item in `docs/BACKLOG.md`.
- **Brittany:** agreed (Nov 22, 2026).

### [#506](https://github.com/the-kya-project/perch-perfect-plan/pull/506) · 1.13a Badges
- **Decision:** A badge earned only through "Just me" journeys shows on the member's own Badges screen and not to other members.
- **Why:** A public badge would reveal activity from a private journey.
- **To change it:** change the item in `docs/BACKLOG.md` if these badges should be public.
- **Brittany:** agreed (Nov 22, 2026).

### [#506](https://github.com/the-kya-project/perch-perfect-plan/pull/506) · 1.10 Challenges
- **Decision:** Diet conversion can't be used as a challenge's journey template.
- **Why:** The spec says challenges never involve food restriction, weight goals or anything health-related.
- **To change it:** change the item in `docs/BACKLOG.md`.
- **Brittany:** agreed (Nov 22, 2026).

### [#506](https://github.com/the-kya-project/perch-perfect-plan/pull/506) · 1.12 Flock insights
- **Decision:** The mockup's "Share my profile with my chapter" switch stays out, and the diet conversion duration is marked as a question for Brittany.
- **Why:** The switch isn't in the spec, and a typical diet conversion length could read as health guidance, which the spec rules out.
- **To change it:** say so when approving 1.12.
- **Brittany:** agreed that the "Share my profile with my chapter" switch won't be built (Nov 22, 2026). The diet conversion duration question is still open.

### [#506](https://github.com/the-kya-project/perch-perfect-plan/pull/506) · 1.6, 1.8, 1.7, 1.13a, 1.10, 1.11 order
- **Decision:** The six items go after the existing Ready items, in the requested order. 1.6 depends on 0.5, 1.13a on 1.6 and 1.8, and 1.10 on 1.13a. 1.6 keeps the app's tab order (Resources before Members), which differs from its mockup.
- **Why:** This leaves work already queued in place, and each dependency is something the spec's feature uses.
- **To change it:** reorder the items in `docs/BACKLOG.md`.

### [#505](https://github.com/the-kya-project/perch-perfect-plan/pull/505) · 0.4 Credit /get-page sign-ups to the link that brought them
- **Decision:** Brought over the reference commit `d974e8e` exactly as it was, including that it also covers `/get-app` (both share the same desktop page) and not `/review`. Left the two files' existing Prettier warnings alone (they're on `main` too), so the diff stays only the change.
- **Why:** The backlog item says to build from that commit; reformatting would bury the real change in a large diff.
- **To change it:** ask for the files to be reformatted in a separate PR, or for `/get-app` to be left out.

### [#504](https://github.com/the-kya-project/perch-perfect-plan/pull/504) · Backlog: Brittany's decisions
- **Decision:** 1.15 and 1.17 moved to "Ready to build" with "Depends on: 1.14 merged", and the Skew one-pager (2.4a) sits second, right under the admin review item. 1.14 and its followers go at the end of Ready, and D1.2 right after D1.1.
- **Why:** Runs never start anything under "Needs Brittany before work starts", so 1.15 and 1.17 had to move to start once 1.14 merges. Existing priorities otherwise keep their order.
- **To change it:** reorder the items in `docs/BACKLOG.md`.

### [#504](https://github.com/the-kya-project/perch-perfect-plan/pull/504) · D1.2 Weight baseline shadow mode
- **Decision:** Until you answer, the shadow log covers your birds only. The item used to say "every bird", and your approval says "on for my account only".
- **Why:** The narrower reading can't touch anyone else's data.
- **To change it:** say that it should log every bird.

### [#500](https://github.com/the-kya-project/perch-perfect-plan/pull/500) · 0.3 Translation check passes and stays passing
- **Decision:** In Dutch, "the Flock" stays "de Flock" (the product's name). The glossary's "flock" → "je vogels" is kept for "your flock" meaning your birds.
- **Why:** "Een jaar in je vogels" would make no sense; the Flock is a name, like Kya & Co.
- **To change it:** pick a Dutch name for the Flock and add it to `src/locales/glossary.nl.json`.

### [#500](https://github.com/the-kya-project/perch-perfect-plan/pull/500) · 0.3 Translation check passes and stays passing
- **Decision:** "Eastern time" in the gift send-date hint became "Amerikaanse oostkusttijd" (US East Coast time).
- **Why:** A Dutch buyer would otherwise read the time as their own.
- **To change it:** edit `gift.sendOnHint` in `src/locales/nl.jsonc`.

### [#500](https://github.com/the-kya-project/perch-perfect-plan/pull/500) · 0.3 Translation check passes and stays passing
- **Decision:** The translation check runs right after install in the iPhone hydration job, before the browsers download.
- **Why:** It takes seconds, so a drifted catalog fails fast instead of after the long browser tests.
- **To change it:** move the "Translation catalog matches the code" step in `.github/workflows/hydration.yml`.

### [#499](https://github.com/the-kya-project/perch-perfect-plan/pull/499) · Setup: rules for the continuous runs
- **Decision:** A run that opens no PR (stopped by the lock, or found nothing it's allowed to build) writes its log entry to `~/.kya-agent/pending-log.md` on the Mac, and the next run with a PR copies it into `docs/agent-log.md`.
- **Why:** Every run must be logged, but a run with no PR has no way to change `main`, and must not touch the main project folder.
- **To change it:** say where those entries should go instead.

### [#499](https://github.com/the-kya-project/perch-perfect-plan/pull/499) · Setup: rules for the continuous runs
- **Decision:** "Behind the Flock gate" counts as hidden only while the Flock is closed to members (`members_open` is false in production). Once the Flock opens, Flock changes are visible to members and must be held.
- **Why:** The gate is admins-only today, but opening the Flock turns it on for members, and from then on a Flock change is something real people notice.
- **To change it:** set a different rule for after opening day.

### [#499](https://github.com/the-kya-project/perch-perfect-plan/pull/499) · Setup: rules for the continuous runs
- **Decision:** A run waits for checks inside its own 3-hour window. If they haven't finished, it logs the PR as "waiting on checks", and a later run may merge it (if every rule passes) before picking new work.
- **Why:** The Free-user regression waits for the preview deployment and can take a while; this keeps each run short without leaving finished work stranded.
- **To change it:** say how long a run should wait, or that a later run shouldn't finish another run's PR.

### [#499](https://github.com/the-kya-project/perch-perfect-plan/pull/499) · Setup: rules for the continuous runs
- **Decision:** An item's own "Needs Brittany" line in the backlog still applies. If it asks for an approval, a decision, a read of copy or a hands-on check, the PR is held. "Merge only" doesn't stop a self-merge.
- **Why:** Many "Overnight alone: yes" items already name something you want to approve (deletions, health content, Dutch copy).
- **To change it:** rewrite the item's "Needs Brittany" line.

---

## Held for Brittany

PRs waiting on Brittany, and exactly what each one needs.

Format:

```
### <PR link> · <item ID> <item title>
- **Needs:** <the decision, approval or read, in one or two lines>
```

### [#525](https://github.com/the-kya-project/perch-perfect-plan/pull/525) · 1.14 Billing foundation (switched off)
- **Needs:** your approval, because it's payments (the item's own rule). Specifically: (1) the database change, which merging applies to production: two new tables, three new `entitlements` columns (including the change to `entitlements` the backlog asks you to approve), two new `founding_claims` columns, and four service-role functions; (2) the 16 new lines of card-step wording, listed in the PR; (3) the decisions below (test mode enforced in code, `BILLING_ENABLED=true` as the only "on" value, nothing shown in the iPhone/Android app, refunds left for later). Also optional: one workflow line to run `npm run test:billing` in CI, which the runs' token can't add. Every required check passes. "Supabase Preview" reported *skipping* although the PR has a migration, so check why before merging.

### Reminder · the hourly runs' GitHub token expires Feb 20, 2027
- **Needs:** a new token before **Feb 20, 2027**. That's 90 days from Nov 22, 2026; GitHub → Settings → Developer settings → Fine-grained tokens shows the exact date. When it expires, runs can still build and test but can't push or open PRs, and each run's note in `~/.kya-agent/job.log` says so.
- **To replace it:** make a new fine-grained token for `the-kya-project/perch-perfect-plan` only, with the same permissions as the old one (Contents and Pull requests: read and write; Actions, Commit statuses and Checks: read). Then run the save command again in Terminal (it asks you to paste the token and doesn't show it). It overwrites `~/.config/kya-agent/github-token`, readable only by you. Delete the old token on GitHub after that. Clear this item and add a new one with the new date.
