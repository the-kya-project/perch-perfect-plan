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

### [#533](https://github.com/the-kya-project/perch-perfect-plan/pull/533) · 1.14a Card step and checkout design
Held for Brittany. Nobody sees these while `BILLING_ENABLED` is off.
- **Where:** every billing screen and Stripe's page, Dutch (written Nov 23, 2026 at Brittany's go-ahead; all new except `flock.you.membership`, which had no Dutch before)
  - `flock.billing.accessUntil`: "Toegang tot"
  - `flock.billing.addMyCard`: "Mijn kaart toevoegen · vandaag $0"
  - `flock.billing.allSet`: "Je bent <em>helemaal klaar</em>"
  - `flock.billing.backToFlock`: "Terug naar de Flock"
  - `flock.billing.billedMonthly`: "Maandelijks betaald"
  - `flock.billing.cardEnding`: "Eindigend op {{last4}}"
  - `flock.billing.cardLabel`: "Kaart"
  - `flock.billing.chargeMonthly`: "Je eerste betaling van {{price}}, daarna elke maand. Zeg je voor deze datum op, dan betaal je niets."
  - `flock.billing.chargeYearly`: "Je eerste betaling van {{price}}, daarna eens per jaar. Zeg je voor deze datum op, dan betaal je niets."
  - `flock.billing.checkoutNote`: "Je betaalt niets tot {{date}}. Je kunt tot die tijd altijd opzeggen via Lidmaatschap en betaling."
  - `flock.billing.chooseFounder`: "Je helpt bepalen waar het naartoe gaat, <strong>via de Do good-stemmingen</strong>, ook die alleen voor oprichters."
  - `flock.billing.chooseMember`: "Je helpt bepalen waar het naartoe gaat, <strong>via de Do good-stemmingen</strong> met de rest van de Flock."
  - `flock.billing.confirmingLine`: "Dit kan een minuutje duren. Je kunt hier blijven, we gaan verder zodra het klaar is."
  - `flock.billing.confirmingSlow`: "Dit duurt langer dan normaal. Je kaart is veilig bij Stripe, dus je hoeft hem niet opnieuw toe te voegen. Kijk over een paar minuten bij Lidmaatschap en betaling."
  - `flock.billing.confirmingTitle`: "Je kaart wordt bevestigd"
  - `flock.billing.ends`: "Je lidmaatschap wordt niet verlengd."
  - `flock.billing.error`: "Dat is niet gelukt. Probeer het zo opnieuw."
  - `flock.billing.firstCharge`: "Eerste betaling"
  - `flock.billing.flockMember`: "Lid van de Flock"
  - `flock.billing.founding`: "Oprichtersprijs: {{price}} per maand, vast zolang je lid blijft."
  - `flock.billing.founding50`: "Founding 50"
  - `flock.billing.foundingLabel`: "Oprichtersprijs"
  - `flock.billing.foundingLocked`: "Vast zolang je lid blijft."
  - `flock.billing.foundingOthers`: "Alle anderen betalen {{price}}."
  - `flock.billing.foundingRelease`: "Staat er op {{date}} geen kaart, dan komt je oprichtersplek vrij en kun je die niet opnieuw claimen."
  - `flock.billing.foundingSpot`: "Founding 50 · Plek #{{spot}}"
  - `flock.billing.freeUntil`: "Gratis tot"
  - `flock.billing.givesBack`: "Elk lidmaatschap geeft iets terug"
  - `flock.billing.givesBackLine`: "van wat je betaalt gaat naar partners in papegaaienopvang en natuurbehoud"
  - `flock.billing.givesBackNote`: "<strong>Je lidmaatschap geeft iets terug.</strong> 20% gaat naar partners in papegaaienopvang en natuurbehoud."
  - `flock.billing.heroAfterLine`: "Word lid van de Flock en help papegaaien in de opvang en in het wild."
  - `flock.billing.heroFounder`: "Dankzij jou <em>begon dit</em>. Houd je {{price}}."
  - `flock.billing.heroFounderLine`: "Voeg uiterlijk {{date}} een kaart toe om je oprichtersplek en prijs te houden. Tot die tijd betaal je niets."
  - `flock.billing.heroMember`: "Jouw lidmaatschap <em>doet goed</em> voor papegaaien"
  - `flock.billing.heroSeasonLine`: "Voeg nu een kaart toe om na de gratis periode in de Flock te blijven. Je betaalt niets tot {{date}}."
  - `flock.billing.howItWorks`: "Zo werkt het"
  - `flock.billing.includes`: "Dit zit in je lidmaatschap"
  - `flock.billing.joinFlock`: "Word lid van de Flock"
  - `flock.billing.keepSpot`: "Mijn oprichtersplek houden · vandaag $0"
  - `flock.billing.keeps`: "Dit houd je met je lidmaatschap"
  - `flock.billing.manage`: "Betaling beheren"
  - `flock.billing.manageLine`: "Wijzig je kaart of abonnement, of zeg op wanneer je wilt."
  - `flock.billing.monthlyLabel`: "Maandelijks"
  - `flock.billing.monthsFree_one`: "{{count}} maand gratis"
  - `flock.billing.monthsFree_other`: "{{count}} maanden gratis"
  - `flock.billing.nextCharge`: "Volgende betaling"
  - `flock.billing.notReady`: "Je kunt een kaart toevoegen zodra het einde van de gratis periode vaststaat."
  - `flock.billing.onFile`: "Kaart opgeslagen"
  - `flock.billing.pastDueLine`: "Dat kan gebeuren, vaak door een verlopen kaart. Werk je kaart uiterlijk {{date}} bij om je plek in de Flock te houden."
  - `flock.billing.pastDueNoDate`: "Dat kan gebeuren, vaak door een verlopen kaart. Werk je kaart bij om je plek in de Flock te houden."
  - `flock.billing.pastDueTitle`: "Je laatste betaling is niet gelukt"
  - `flock.billing.perMonth`: "/mnd"
  - `flock.billing.perkBadge`: "Je oprichtersbadge en je plek bij de Founding 50"
  - `flock.billing.perkChapter`: "Je afdeling, met vogeldierenartsen, opvangcentra en winkels die andere leden aanraden"
  - `flock.billing.perkFounderAll`: "Je afdeling, trajecten en de volledige bibliotheek"
  - `flock.billing.perkFounderVote`: "Een stem in Do good, ook bij stemmingen alleen voor oprichters"
  - `flock.billing.perkJourneys`: "Stapsgewijze trajecten voor training en verzorging"
  - `flock.billing.perkLibrary`: "De volledige bibliotheek"
  - `flock.billing.perkVote`: "Een stem in Do good, over waar de donaties van de Flock naartoe gaan"
  - `flock.billing.pickHow`: "Kies hoe je betaalt"
  - `flock.billing.planFounding`: "Oprichtend lid"
  - `flock.billing.planLabel`: "Abonnement"
  - `flock.billing.renews`: "Je lidmaatschap wordt automatisch verlengd."
  - `flock.billing.renewsMonthly`: "Wordt elke maand verlengd. Opzeggen kan altijd via Betaling beheren."
  - `flock.billing.renewsYearly`: "Wordt eens per jaar verlengd. Opzeggen kan altijd via Betaling beheren."
  - `flock.billing.saveCardNoteMonthly`: "De Flock, {{price}} per maand. Je betaalt niets tot {{date}}. Je kunt tot die tijd altijd opzeggen via Lidmaatschap en betaling."
  - `flock.billing.saveCardNoteYearly`: "De Flock, {{price}} per jaar. Je betaalt niets tot {{date}}. Je kunt tot die tijd altijd opzeggen via Lidmaatschap en betaling."
  - `flock.billing.seasonSet`: "Gratis periode · alles staat klaar voor daarna"
  - `flock.billing.secure`: "Veilig betalen met Stripe"
  - `flock.billing.secureCancel`: "Veilig betalen met Stripe · Altijd opzegbaar"
  - `flock.billing.seeMembership`: "Bekijk lidmaatschap en betaling"
  - `flock.billing.spotSafe`: "Je plek is <em>veilig</em>"
  - `flock.billing.staysFree`: "Alles in de Flock blijft gratis, net als nu."
  - `flock.billing.thanks`: "<strong>Dankjewel.</strong> 20% van je lidmaatschap gaat naar partners in papegaaienopvang en natuurbehoud."
  - `flock.billing.today`: "Vandaag"
  - `flock.billing.todayFounder`: "Voeg je kaart toe. Je oprichtersplek is veilig. Vandaag betaal je $0."
  - `flock.billing.todayLine`: "Voeg je kaart toe. Vandaag betaal je $0."
  - `flock.billing.until`: "Tot {{date}}"
  - `flock.billing.updateCard`: "Mijn kaart bijwerken"
  - `flock.billing.welcomeFounderLine`: "Je oprichtersprijs staat vast. Bedankt dat je de Flock mee hebt opgericht."
  - `flock.billing.welcomeLine`: "Je plek in de Flock is bewaard voor na de gratis periode. Tot die tijd verandert er niets."
  - `flock.billing.yearlyLabel`: "Jaarlijks"
  - `flock.billing.yearlyTotal`: "{{price}} eens per jaar"
  - `flock.you.membership`: "Lidmaatschap en betaling"
- **Where:** Checkout, last 49 hours of the free season, `flock.billing.saveCardNoteYearly`
  - Before: new
  - After: "The Flock, {{price}} a year. You won't be charged until {{date}}. Cancel anytime before then from Membership and billing."
- **Where:** Checkout, last 49 hours of the free season, `flock.billing.saveCardNoteMonthly`
  - Before: new
  - After: "The Flock, {{price}} a month. You won't be charged until {{date}}. Cancel anytime before then from Membership and billing."
- **Where:** billing screens, `flock.billing.accessUntil`
  - Before: new
  - After: "Access until"
- **Where:** billing screens, `flock.billing.addMyCard`
  - Before: new
  - After: "Add my card · $0 today"
- **Where:** billing screens, `flock.billing.allSet`
  - Before: new
  - After: "You're <em>all set</em>"
- **Where:** billing screens, `flock.billing.backToFlock`
  - Before: new
  - After: "Back to the Flock"
- **Where:** billing screens, `flock.billing.billedMonthly`
  - Before: new
  - After: "Billed monthly"
- **Where:** billing screens, `flock.billing.cardEnding`
  - Before: new
  - After: "Ending in {{last4}}"
- **Where:** billing screens, `flock.billing.cardLabel`
  - Before: new
  - After: "Card"
- **Where:** billing screens, `flock.billing.chargeMonthly`
  - Before: new
  - After: "Your first charge of {{price}}, then monthly. Cancel before this date and you won't be charged."
- **Where:** billing screens, `flock.billing.chargeYearly`
  - Before: new
  - After: "Your first charge of {{price}}, then once a year. Cancel before this date and you won't be charged."
- **Where:** billing screens, `flock.billing.checkoutNote`
  - Before: new
  - After: "You won't be charged until {{date}}. Cancel anytime before then from Membership and billing."
- **Where:** billing screens, `flock.billing.chooseFounder`
  - Before: new
  - After: "You help choose where it goes, <strong>through Do good votes</strong>, including the founders-only ones."
- **Where:** billing screens, `flock.billing.chooseMember`
  - Before: new
  - After: "You help choose where it goes, <strong>through Do good votes</strong> with the rest of the Flock."
- **Where:** billing screens, `flock.billing.confirmingLine`
  - Before: new
  - After: "This can take a minute. You can stay right here, and we'll move on as soon as it's done."
- **Where:** billing screens, `flock.billing.confirmingSlow`
  - Before: new
  - After: "This is taking longer than usual. Your card is safe with Stripe, so there's no need to add it again. Check Membership and billing in a few minutes."
- **Where:** billing screens, `flock.billing.confirmingTitle`
  - Before: new
  - After: "Confirming your card"
- **Where:** billing screens, `flock.billing.firstCharge`
  - Before: new
  - After: "First charge"
- **Where:** billing screens, `flock.billing.flockMember`
  - Before: new
  - After: "Flock member"
- **Where:** billing screens, `flock.billing.founding50`
  - Before: new
  - After: "Founding 50"
- **Where:** billing screens, `flock.billing.foundingLabel`
  - Before: new
  - After: "Founding price"
- **Where:** billing screens, `flock.billing.foundingLocked`
  - Before: new
  - After: "Locked in for as long as you stay a member."
- **Where:** billing screens, `flock.billing.foundingOthers`
  - Before: new
  - After: "Everyone else pays {{price}}."
- **Where:** billing screens, `flock.billing.foundingRelease`
  - Before: new
  - After: "Without a card on file by {{date}}, your founding spot is released and can't be claimed again."
- **Where:** billing screens, `flock.billing.foundingSpot`
  - Before: new
  - After: "Founding 50 · Spot #{{spot}}"
- **Where:** billing screens, `flock.billing.freeUntil`
  - Before: new
  - After: "Free until"
- **Where:** billing screens, `flock.billing.givesBack`
  - Before: new
  - After: "Every membership gives back"
- **Where:** billing screens, `flock.billing.givesBackLine`
  - Before: new
  - After: "of what you pay goes to parrot rescue and conservation partners"
- **Where:** billing screens, `flock.billing.givesBackNote`
  - Before: new
  - After: "<strong>Your membership gives back.</strong> 20% goes to parrot rescue and conservation partners."
- **Where:** billing screens, `flock.billing.heroAfterLine`
  - Before: new
  - After: "Join the Flock, and help parrots in rescues and in the wild."
- **Where:** billing screens, `flock.billing.heroFounder`
  - Before: new
  - After: "You helped <em>start this</em>. Keep your {{price}}."
- **Where:** billing screens, `flock.billing.heroFounderLine`
  - Before: new
  - After: "Add a card by {{date}} to hold your founding spot and price. You won't pay anything until then."
- **Where:** billing screens, `flock.billing.heroMember`
  - Before: new
  - After: "Your membership <em>does good</em> for parrots"
- **Where:** billing screens, `flock.billing.heroSeasonLine`
  - Before: new
  - After: "Add a card now to stay in the Flock after the free season. You won't pay anything until {{date}}."
- **Where:** billing screens, `flock.billing.howItWorks`
  - Before: new
  - After: "How it works"
- **Where:** billing screens, `flock.billing.includes`
  - Before: new
  - After: "What your membership includes"
- **Where:** billing screens, `flock.billing.joinFlock`
  - Before: new
  - After: "Join the Flock"
- **Where:** billing screens, `flock.billing.keepSpot`
  - Before: new
  - After: "Keep my founding spot · $0 today"
- **Where:** billing screens, `flock.billing.keeps`
  - Before: new
  - After: "What your membership keeps"
- **Where:** billing screens, `flock.billing.manageLine`
  - Before: new
  - After: "Change your card or plan, or cancel, any time."
- **Where:** billing screens, `flock.billing.monthlyLabel`
  - Before: new
  - After: "Monthly"
- **Where:** billing screens, `flock.billing.monthsFree_one`
  - Before: new
  - After: "{{count}} month free"
- **Where:** billing screens, `flock.billing.monthsFree_other`
  - Before: new
  - After: "{{count}} months free"
- **Where:** billing screens, `flock.billing.nextCharge`
  - Before: new
  - After: "Next charge"
- **Where:** billing screens, `flock.billing.pastDueLine`
  - Before: new
  - After: "It happens, often with an expired card. Update your card by {{date}} to keep your place in the Flock."
- **Where:** billing screens, `flock.billing.pastDueNoDate`
  - Before: new
  - After: "It happens, often with an expired card. Update your card to keep your place in the Flock."
- **Where:** billing screens, `flock.billing.pastDueTitle`
  - Before: new
  - After: "Your last payment didn't go through"
- **Where:** billing screens, `flock.billing.perMonth`
  - Before: new
  - After: "/mo"
- **Where:** billing screens, `flock.billing.perkBadge`
  - Before: new
  - After: "Your founder badge and your place among the Founding 50"
- **Where:** billing screens, `flock.billing.perkChapter`
  - Before: new
  - After: "Your chapter, with avian vets, rescues and shops other members recommend"
- **Where:** billing screens, `flock.billing.perkFounderAll`
  - Before: new
  - After: "Your chapter, journeys and the full Library"
- **Where:** billing screens, `flock.billing.perkFounderVote`
  - Before: new
  - After: "A vote in Do good, including founders-only votes"
- **Where:** billing screens, `flock.billing.perkJourneys`
  - Before: new
  - After: "Step-by-step journeys for training and care"
- **Where:** billing screens, `flock.billing.perkLibrary`
  - Before: new
  - After: "The full Library"
- **Where:** billing screens, `flock.billing.perkVote`
  - Before: new
  - After: "A vote in Do good, on where the Flock's giving goes"
- **Where:** billing screens, `flock.billing.pickHow`
  - Before: new
  - After: "Pick how you pay"
- **Where:** billing screens, `flock.billing.planFounding`
  - Before: new
  - After: "Founding member"
- **Where:** billing screens, `flock.billing.planLabel`
  - Before: new
  - After: "Plan"
- **Where:** billing screens, `flock.billing.renewsMonthly`
  - Before: new
  - After: "Renews every month. Cancel anytime in Manage billing."
- **Where:** billing screens, `flock.billing.renewsYearly`
  - Before: new
  - After: "Renews once a year. Cancel anytime in Manage billing."
- **Where:** billing screens, `flock.billing.seasonSet`
  - Before: new
  - After: "Free season · you're all set for after"
- **Where:** billing screens, `flock.billing.secure`
  - Before: new
  - After: "Secure checkout with Stripe"
- **Where:** billing screens, `flock.billing.secureCancel`
  - Before: new
  - After: "Secure checkout with Stripe · Cancel anytime"
- **Where:** billing screens, `flock.billing.seeMembership`
  - Before: new
  - After: "See membership and billing"
- **Where:** billing screens, `flock.billing.spotSafe`
  - Before: new
  - After: "Your spot is <em>safe</em>"
- **Where:** billing screens, `flock.billing.staysFree`
  - Before: new
  - After: "Everything in the Flock stays free, just like now."
- **Where:** billing screens, `flock.billing.thanks`
  - Before: new
  - After: "<strong>Thank you.</strong> 20% of your membership will go to parrot rescue and conservation partners."
- **Where:** billing screens, `flock.billing.today`
  - Before: new
  - After: "Today"
- **Where:** billing screens, `flock.billing.todayFounder`
  - Before: new
  - After: "Add your card. Your founding spot is safe. $0 due today."
- **Where:** billing screens, `flock.billing.todayLine`
  - Before: new
  - After: "Add your card. $0 due today."
- **Where:** billing screens, `flock.billing.until`
  - Before: new
  - After: "Until {{date}}"
- **Where:** billing screens, `flock.billing.updateCard`
  - Before: new
  - After: "Update my card"
- **Where:** billing screens, `flock.billing.welcomeFounderLine`
  - Before: new
  - After: "Your founding price is locked in. Thank you for helping start the Flock."
- **Where:** billing screens, `flock.billing.welcomeLine`
  - Before: new
  - After: "Your place in the Flock is saved for after the free season. Nothing changes until then."
- **Where:** billing screens, `flock.billing.yearlyLabel`
  - Before: new
  - After: "Yearly"
- **Where:** billing screens, `flock.billing.yearlyTotal`
  - Before: new
  - After: "{{price}} once a year"
- **Where:** billing screens, `flock.billing.addCard`
  - Before: "Add a card"
  - After: removed, replaced by the mockup's wording
- **Where:** billing screens, `flock.billing.chargedToday`
  - Before: "You'll be charged today."
  - After: removed, replaced by the mockup's wording
- **Where:** billing screens, `flock.billing.choose`
  - Before: "Choose a plan"
  - After: removed, replaced by the mockup's wording
- **Where:** billing screens, `flock.billing.confirming`
  - Before: "We're confirming your card. This can take a minute."
  - After: removed, replaced by the mockup's wording
- **Where:** billing screens, `flock.billing.firstChargeOn`
  - Before: "First charge on {{date}}."
  - After: removed, replaced by the mockup's wording
- **Where:** billing screens, `flock.billing.monthly`
  - Before: "Monthly: {{price}} a month"
  - After: removed, replaced by the mockup's wording
- **Where:** billing screens, `flock.billing.pastDue`
  - Before: "Your last payment didn't go through. Update your card to keep your membership."
  - After: removed, replaced by the mockup's wording
- **Where:** billing screens, `flock.billing.yearly`
  - Before: "Yearly: {{price}} a year"
  - After: removed, replaced by the mockup's wording
- **Where:** billing screens, `flock.billing.zeroToday`
  - Before: "$0 today. Your first charge is on {{date}}."
  - After: removed, replaced by the mockup's wording
### [#529](https://github.com/the-kya-project/perch-perfect-plan/pull/529) · 1.8 Do good voting (shared donation)
Every voting line as merged, all new to the live app. Nobody but admins sees them while the Flock is closed. The member wording follows Brittany's approved mockups. The founders-only lines and "See your vote" are agent wording the mockups don't cover.
- **Where:** `flock.votes.adminCounts_one`
  - Before: new
  - After: "Counts (admins only) · {{count}} vote"
- **Where:** `flock.votes.adminCounts_other`
  - Before: new
  - After: "Counts (admins only) · {{count}} votes"
- **Where:** `flock.votes.backToGood`
  - Before: new
  - After: "Back to Do good"
- **Where:** `flock.votes.closedError`
  - Before: new
  - After: "This vote has closed, so it can't take new votes."
- **Where:** `flock.votes.closedEyebrow_one`
  - Before: new
  - After: "Do good vote · closed {{day}} · {{count}} vote"
- **Where:** `flock.votes.closedEyebrow_other`
  - Before: new
  - After: "Do good vote · closed {{day}} · {{count}} votes"
- **Where:** `flock.votes.closedTag`
  - Before: new
  - After: "Vote closed"
- **Where:** `flock.votes.draftLine`
  - Before: new
  - After: "Draft · only admins can see it"
- **Where:** `flock.votes.error`
  - Before: new
  - After: "Your vote didn't save. Try again."
- **Where:** `flock.votes.finalNote`
  - Before: new
  - After: "Your vote is final once you tap the button."
- **Where:** `flock.votes.founders`
  - Before: new
  - After: "Founders"
- **Where:** `flock.votes.foundersChose`
  - Before: new
  - After: "Founders chose {{names}}."
- **Where:** `flock.votes.foundersChoseTag`
  - Before: new
  - After: "Founders chose"
- **Where:** `flock.votes.foundersClosedEyebrow_one`
  - Before: new
  - After: "Founders vote · closed {{day}} · {{count}} vote"
- **Where:** `flock.votes.foundersClosedEyebrow_other`
  - Before: new
  - After: "Founders vote · closed {{day}} · {{count}} votes"
- **Where:** `flock.votes.foundersOpenEyebrow`
  - Before: new
  - After: "Founders vote · closes {{day}}"
- **Where:** `flock.votes.howItWorks`
  - Before: new
  - After: "Every partner gets at least 10%. Your vote decides how the rest is shared. You can vote once."
- **Where:** `flock.votes.howItWorksFounders`
  - Before: new
  - After: "You can vote once. Results show when the vote closes."
- **Where:** `flock.votes.manage`
  - Before: new
  - After: "Manage this vote"
- **Where:** `flock.votes.manageAll`
  - Before: new
  - After: "Manage votes"
- **Where:** `flock.votes.missing`
  - Before: new
  - After: "It may have been removed, or it's only for founding members."
- **Where:** `flock.votes.missingTitle`
  - Before: new
  - After: "This vote isn't here"
- **Where:** `flock.votes.noResult`
  - Before: new
  - After: "No votes were cast."
- **Where:** `flock.votes.note`
  - Before: new
  - After: "A note from Brittany"
- **Where:** `flock.votes.noteFrom`
  - Before: new
  - After: "The Kya Project"
- **Where:** `flock.votes.ofVotes`
  - Before: new
  - After: "{{percent}}% of the votes"
- **Where:** `flock.votes.openEyebrow`
  - Before: new
  - After: "Do good vote · closes {{day}}"
- **Where:** `flock.votes.openTag`
  - Before: new
  - After: "Vote open · closes {{day}}"
- **Where:** `flock.votes.partners`
  - Before: new
  - After: "partners"
- **Where:** `flock.votes.pickOne`
  - Before: new
  - After: "Pick one to vote"
- **Where:** `flock.votes.resultsTitle`
  - Before: new
  - After: "How this quarter's donation is <em>handled</em>"
- **Where:** `flock.votes.resultsWhen`
  - Before: new
  - After: "Results show when the vote closes on {{day}}."
- **Where:** `flock.votes.ringLabel`
  - Before: new
  - After: "Donation shares: {{shares}}"
- **Where:** `flock.votes.seeResults`
  - Before: new
  - After: "See the results"
- **Where:** `flock.votes.seeYourVote`
  - Before: new
  - After: "See your vote"
- **Where:** `flock.votes.sharedEvenly`
  - Before: new
  - After: "No votes were cast, so the donation is shared evenly."
- **Where:** `flock.votes.sharedOutcome`
  - Before: new
  - After: "Every partner gets at least 10%. Your votes decided the rest."
- **Where:** `flock.votes.shareSplit`
  - Before: new
  - After: "{{guaranteed}}% guaranteed + {{fromVotes}}% from votes"
- **Where:** `flock.votes.tenPercentLine`
  - Before: new
  - After: "Every partner gets at least 10%, and the votes share out the rest."
- **Where:** `flock.votes.thanks`
  - Before: new
  - After: "Thanks for voting"
- **Where:** `flock.votes.thanksLine`
  - Before: new
  - After: "You've helped decide where this quarter's donation goes."
- **Where:** `flock.votes.thanksLineFounders`
  - Before: new
  - After: "You've helped decide what the Flock does first."
- **Where:** `flock.votes.title`
  - Before: new
  - After: "Vote"
- **Where:** `flock.votes.voted_one`
  - Before: new
  - After: "{{count}} member has voted"
- **Where:** `flock.votes.voted_other`
  - Before: new
  - After: "{{count}} members have voted"
- **Where:** `flock.votes.votedSoFar_one`
  - Before: new
  - After: "{{count}} member has voted so far."
- **Where:** `flock.votes.votedSoFar_other`
  - Before: new
  - After: "{{count}} members have voted so far."
- **Where:** `flock.votes.voteFor`
  - Before: new
  - After: "Vote for {{name}}"
- **Where:** `flock.votes.voteNow`
  - Before: new
  - After: "Vote now"
- **Where:** `flock.votes.yourVote`
  - Before: new
  - After: "Your vote"
- **Where:** `flock.votes.youVoted_one`
  - Before: new
  - After: "You voted · {{count}} member has voted"
- **Where:** `flock.votes.youVoted_other`
  - Before: new
  - After: "You voted · {{count}} members have voted"
- **Where:** `flock.votesAdmin.addChoice`
  - Before: new
  - After: "Add a choice"
- **Where:** `flock.votesAdmin.addLogo`
  - Before: new
  - After: "Add logo or photo"
- **Where:** `flock.votesAdmin.allMembers`
  - Before: new
  - After: "All members"
- **Where:** `flock.votesAdmin.audienceLabel`
  - Before: new
  - After: "Who votes"
- **Where:** `flock.votesAdmin.cantOpen`
  - Before: new
  - After: "Add {{what}} before opening."
- **Where:** `flock.votesAdmin.checkError`
  - Before: new
  - After: "Something in the form isn't allowed. Check the question, the choices and the date, then try again."
- **Where:** `flock.votesAdmin.choiceBlurb`
  - Before: new
  - After: "Choice {{n}} description"
- **Where:** `flock.votesAdmin.choiceBlurbPlaceholder`
  - Before: new
  - After: "A sentence or two"
- **Where:** `flock.votesAdmin.choiceCount_one`
  - Before: new
  - After: "{{count}} choice"
- **Where:** `flock.votesAdmin.choiceCount_other`
  - Before: new
  - After: "{{count}} choices"
- **Where:** `flock.votesAdmin.choiceName`
  - Before: new
  - After: "Choice {{n}} name"
- **Where:** `flock.votesAdmin.choiceNamePlaceholder`
  - Before: new
  - After: "Name"
- **Where:** `flock.votesAdmin.choicesHint`
  - Before: new
  - After: "Two to eight. Each has a name, a sentence or two, and the partner's logo or a photo. Every choice gets at least 10% of the donation, and the votes share out the rest."
- **Where:** `flock.votesAdmin.choicesLabel`
  - Before: new
  - After: "Choices"
- **Where:** `flock.votesAdmin.closeConfirm`
  - Before: new
  - After: "Close this vote now?"
- **Where:** `flock.votesAdmin.closeConfirmLine`
  - Before: new
  - After: "Voting stops now and everyone sees the results. This can't be undone."
- **Where:** `flock.votesAdmin.closed`
  - Before: new
  - After: "Closed"
- **Where:** `flock.votesAdmin.closedLine_one`
  - Before: new
  - After: "Closed {{day}} · {{count}} vote"
- **Where:** `flock.votesAdmin.closedLine_other`
  - Before: new
  - After: "Closed {{day}} · {{count}} votes"
- **Where:** `flock.votesAdmin.closedNow`
  - Before: new
  - After: "Closed. Members now see the results."
- **Where:** `flock.votesAdmin.closedOn`
  - Before: new
  - After: "Closed {{day}}"
- **Where:** `flock.votesAdmin.closeEarly`
  - Before: new
  - After: "Close early"
- **Where:** `flock.votesAdmin.closesHint`
  - Before: new
  - After: "Your local time. You can close it early or extend it once it's open."
- **Where:** `flock.votesAdmin.closesLabel`
  - Before: new
  - After: "Closes"
- **Where:** `flock.votesAdmin.closesOn`
  - Before: new
  - After: "Closes {{day}}"
- **Where:** `flock.votesAdmin.closeYes`
  - Before: new
  - After: "Close now"
- **Where:** `flock.votesAdmin.delete`
  - Before: new
  - After: "Delete draft"
- **Where:** `flock.votesAdmin.deleteConfirm`
  - Before: new
  - After: "Delete this draft?"
- **Where:** `flock.votesAdmin.deleteConfirmLine`
  - Before: new
  - After: "Delete it for good, with its photos? This can't be undone."
- **Where:** `flock.votesAdmin.descriptionLabel`
  - Before: new
  - After: "Short description (optional)"
- **Where:** `flock.votesAdmin.draft`
  - Before: new
  - After: "Draft"
- **Where:** `flock.votesAdmin.draftLine`
  - Before: new
  - After: "A draft. Only admins can see it."
- **Where:** `flock.votesAdmin.edit`
  - Before: new
  - After: "Edit vote"
- **Where:** `flock.votesAdmin.empty`
  - Before: new
  - After: "No votes yet. Tap New vote to write one. It stays a draft, visible only to admins, until you open it."
- **Where:** `flock.votesAdmin.extend`
  - Before: new
  - After: "Extend the vote"
- **Where:** `flock.votesAdmin.extended`
  - Before: new
  - After: "Extended. Members see the new close date."
- **Where:** `flock.votesAdmin.extendError`
  - Before: new
  - After: "Pick a later close date than the current one."
- **Where:** `flock.votesAdmin.extendLabel`
  - Before: new
  - After: "Extend to"
- **Where:** `flock.votesAdmin.foundersOnly`
  - Before: new
  - After: "Founders only"
- **Where:** `flock.votesAdmin.keepOpen`
  - Before: new
  - After: "Keep it open"
- **Where:** `flock.votesAdmin.line`
  - Before: new
  - After: "Admin · drafts stay hidden until you open them"
- **Where:** `flock.votesAdmin.loadError`
  - Before: new
  - After: "We couldn't load the votes. Try again."
- **Where:** `flock.votesAdmin.memberView`
  - Before: new
  - After: "See what members see"
- **Where:** `flock.votesAdmin.missing`
  - Before: new
  - After: "Vote not found"
- **Where:** `flock.votesAdmin.missingLine`
  - Before: new
  - After: "It may have been deleted."
- **Where:** `flock.votesAdmin.moveDown`
  - Before: new
  - After: "Move choice {{n}} down"
- **Where:** `flock.votesAdmin.moveUp`
  - Before: new
  - After: "Move choice {{n}} up"
- **Where:** `flock.votesAdmin.needQuestion`
  - Before: new
  - After: "Add the question first."
- **Where:** `flock.votesAdmin.new`
  - Before: new
  - After: "New vote"
- **Where:** `flock.votesAdmin.noteHint`
  - Before: new
  - After: "Shows with the results as \"A note from Brittany\" once the vote closes."
- **Where:** `flock.votesAdmin.noteLabel`
  - Before: new
  - After: "Announcement"
- **Where:** `flock.votesAdmin.noteSaved`
  - Before: new
  - After: "Announcement saved."
- **Where:** `flock.votesAdmin.open`
  - Before: new
  - After: "Open"
- **Where:** `flock.votesAdmin.openLine_one`
  - Before: new
  - After: "Open · closes {{day}} · {{count}} vote"
- **Where:** `flock.votesAdmin.openLine_other`
  - Before: new
  - After: "Open · closes {{day}} · {{count}} votes"
- **Where:** `flock.votesAdmin.openVote`
  - Before: new
  - After: "Open the vote"
- **Where:** `flock.votesAdmin.questionLabel`
  - Before: new
  - After: "Question"
- **Where:** `flock.votesAdmin.questionPlaceholder`
  - Before: new
  - After: "Where should this quarter's donation go?"
- **Where:** `flock.votesAdmin.removeChoice`
  - Before: new
  - After: "Remove choice {{n}}"
- **Where:** `flock.votesAdmin.removeLogo`
  - Before: new
  - After: "Remove"
- **Where:** `flock.votesAdmin.replaceLogo`
  - Before: new
  - After: "Replace logo"
- **Where:** `flock.votesAdmin.savedDraft`
  - Before: new
  - After: "Draft saved. Only admins can see it."
- **Where:** `flock.votesAdmin.saveNote`
  - Before: new
  - After: "Save announcement"
- **Where:** `flock.votesAdmin.sharesHint`
  - Before: new
  - After: "10% guaranteed to each partner, the rest by votes. Use these shares when you send the donation."
- **Where:** `flock.votesAdmin.sharesTitle`
  - Before: new
  - After: "How the donation is shared"
- **Where:** `flock.votesAdmin.title`
  - Before: new
  - After: "Votes"
- **Where:** `flock.votesAdmin.toOpen`
  - Before: new
  - After: "To open it, add {{what}}."
- **Where:** `flock.votesAdmin.voteCount_one`
  - Before: new
  - After: "{{count}} vote"
- **Where:** `flock.votesAdmin.voteCount_other`
  - Before: new
  - After: "{{count}} votes"

### [#525](https://github.com/the-kya-project/perch-perfect-plan/pull/525) · 1.14 Billing foundation (switched off)
Approved and merged by Brittany (Nov 23, 2026). All 16 lines are new, as merged; nobody sees them while `BILLING_ENABLED` is off. Brittany changed the founding line before merge. `{{price}}` shows the Stripe price ($15).
- **Where:** Membership's card step, `flock.billing.addCard`
  - Before: new
  - After: "Add a card"
- **Where:** Membership's card step, `flock.billing.chargedToday`
  - Before: new
  - After: "You'll be charged today."
- **Where:** Membership's card step, `flock.billing.choose`
  - Before: new
  - After: "Choose a plan"
- **Where:** Membership's card step, `flock.billing.confirming`
  - Before: new
  - After: "We're confirming your card. This can take a minute."
- **Where:** Membership's card step, `flock.billing.ends`
  - Before: new
  - After: "Your membership won't renew."
- **Where:** Membership's card step, `flock.billing.error`
  - Before: new
  - After: "That didn't work. Try again in a moment."
- **Where:** Membership's card step, `flock.billing.firstChargeOn`
  - Before: new
  - After: "First charge on {{date}}."
- **Where:** Membership's card step, `flock.billing.founding`
  - Before: new
  - After: "Founding price: {{price}} a month, locked in for as long as you stay a member."
- **Where:** Membership's card step, `flock.billing.manage`
  - Before: new
  - After: "Manage billing"
- **Where:** Membership's card step, `flock.billing.monthly`
  - Before: new
  - After: "Monthly: {{price}} a month"
- **Where:** Membership's card step, `flock.billing.notReady`
  - Before: new
  - After: "Adding a card opens once the free season's end is set."
- **Where:** Membership's card step, `flock.billing.onFile`
  - Before: new
  - After: "Card on file"
- **Where:** Membership's card step, `flock.billing.pastDue`
  - Before: new
  - After: "Your last payment didn't go through. Update your card to keep your membership."
- **Where:** Membership's card step, `flock.billing.renews`
  - Before: new
  - After: "Your membership renews automatically."
- **Where:** Membership's card step, `flock.billing.yearly`
  - Before: new
  - After: "Yearly: {{price}} a year"
- **Where:** Membership's card step, `flock.billing.zeroToday`
  - Before: new
  - After: "$0 today. Your first charge is on {{date}}."

### [#523](https://github.com/the-kya-project/perch-perfect-plan/pull/523) · D2.1 Seasonal and holiday Today cards on Home

Approved and merged by Brittany (Nov 23, 2026), and on for everyone since that day. English is her approved wording.

**New labels (English / Dutch):** Seasonal tip / Seizoenstip · Holiday helper / Feestdagenhulp · Got it / Begrepen · Through {{date}} / T/m {{date}} · Couldn't hide this card. Try again. / Deze kaart verbergen is niet gelukt. Probeer het opnieuw. (the last one is the error if saving "Got it" fails, added by this change).

- `seasonal.winterDrafts.body`
  - Before: Check the cage isn't near a drafty window, an outside door or a heating vent. A cover at night helps hold in warmth.
  - After: Check the cage isn't near a drafty window, an outside door, or a heating vent. A cover at night helps hold in warmth.
  - Dutch before: Zet de kooi niet bij een tochtig raam, een buitendeur of een verwarmingsrooster. Een kooideken 's nachts houdt de warmte vast.
  - Dutch after: Controleer of de kooi niet bij een tochtig raam, een buitendeur of een verwarmingsrooster staat. Een kooideken 's nachts houdt de warmte vast.
- `seasonal.springCleaning.body`
  - Before: Strong cleaners, sprays and fresh paint give off fumes. Move your bird to another room with fresh air while you clean, and choose bird-safe products.
  - After: Strong cleaners, sprays, and fresh paint give off fumes. Move your bird to another room with fresh air while you clean, and choose bird-safe products.
  - Dutch: unchanged (same meaning; Dutch doesn't use the Oxford comma)
- `seasonal.summerTravel.body`
  - Before: Going away? Share the care plan with your sitter before you leave, and put your avian vet's number where they'll see it.
  - After: Going away? Share the care plan with your pet sitter before you leave, and put your avian vet's number where they'll see it.
  - Dutch: unchanged (same meaning; Dutch doesn't use the Oxford comma)
- `seasonal.thanksgiving.body`
  - Before: Keep your bird well away from the kitchen: overheated non-stick pans and the oven's self-clean setting give off fumes that are dangerous to birds.
  - After: Keep your bird well away from the kitchen. Overheated non-stick pans and the oven's self-clean setting give off fumes that are dangerous to birds.
  - Dutch before: Houd je vogel ver uit de keuken: oververhitte pannen met antiaanbaklaag en de zelfreinigingsstand van de oven geven dampen af die gevaarlijk zijn voor vogels.
  - Dutch after: Houd je vogel ver uit de keuken. Oververhitte pannen met antiaanbaklaag en de zelfreinigingsstand van de oven geven dampen af die gevaarlijk zijn voor vogels.
- `seasonal.sinterklaas.body`
  - Before: Keep chocolate letters, pepernoten and other sweets out of your bird's reach, and pick up wrapping paper and ribbon.
  - After: Keep chocolate letters, pepernoten, and other sweets out of your bird's reach, and pick up wrapping paper and ribbon.
  - Dutch: unchanged (same meaning; Dutch doesn't use the Oxford comma)
- `seasonal.holidayDecorations.body`
  - Before: Tinsel, glass ornaments and string lights are tempting to chew. Keep them out of reach, and stay close whenever your bird is near the tree.
  - After: Tinsel, glass ornaments, and string lights are tempting to chew. Keep them out of reach, and stay close whenever your bird is near the tree.
  - Dutch: unchanged (same meaning; Dutch doesn't use the Oxford comma)
- `seasonal.holidayCandles.body`
  - Before: Keep lit candles, scented sprays and plug-in air fresheners out of the room your bird is in, and never leave a flame unattended.
  - After: Keep lit candles, scented sprays, and plug-in air fresheners out of the room your bird is in, and never leave a flame unattended.
  - Dutch: unchanged (same meaning; Dutch doesn't use the Oxford comma)
- `seasonal.holidayTravel.body`
  - Before: If you're traveling, share the care plan with your sitter before you go. If your bird is coming along, pack familiar food and toys.
  - After: If you're traveling, share the care plan with your pet sitter before you go. If your bird is coming along, pack familiar food and toys.
  - Dutch: unchanged (same meaning; Dutch doesn't use the Oxford comma)
- `seasonal.holidayMeals.body`
  - Before: Keep chocolate, avocado, alcohol and salty or fatty foods away from your bird, and ask guests not to share from their plates.
  - After: Keep chocolate, avocado, alcohol, and salty or fatty foods away from your bird, and ask guests not to share from their plates.
  - Dutch: unchanged (same meaning; Dutch doesn't use the Oxford comma)

### [#528](https://github.com/the-kya-project/perch-perfect-plan/pull/528) · 1.6 Curated chapter collections
All new, behind the Flock gate (admins only today). Where the mockup has wording, it's used as is.
- **Where:** Chapter → Resources (replaces the empty state)
  - Before: "No resources yet" / "Avian vets, rescues, and shops your chapter recommends will be collected here."
  - After: "Places members in your chapter recommend. These are community picks, not endorsements." Group headings "Avian vets", "Rescues", "Shops and services". Card links "Call", "Website". An empty group: "Know a good one nearby? Suggest it, and your chapter lead will add it." The button "Suggest a place". After sending: "Thanks! Your suggestion will show once your chapter lead has looked it over."
- **Where:** Chapter → Resources, for the chapter's lead and admins
  - Before: new
  - After: "{count} suggestions waiting" (one: "1 suggestion waiting"), "Manage listings"
- **Where:** Suggest a place sheet
  - Before: new
  - After: "Suggest a place"; kinds "Avian vet", "Rescue", "Shop or service"; fields "Name", "City or area", "Why do you recommend it?"; "Your chapter lead will look it over before it shows."; "Send suggestion". Errors: "You have a few suggestions waiting already. Try again once they've been looked at." / "We couldn't send that. Try again."
- **Where:** Managing listings (`/flock/places`)
  - Before: new
  - After: title "Resources", line "{chapter} · you lead this chapter" (a lead) or the chapter's name (an admin); "Chapter" (admins' chapter picker); the waiting card "{count} suggestions waiting" / "Review them before they show to members." / "Review"; "Updated {day}"; "None listed yet."; "Edit"; "Add a listing". Not a manager: "For chapter leads" / "Chapter leads and admins look after a chapter's listings. You can suggest a place from your chapter's Resources tab."
- **Where:** Add or edit a listing sheet
  - Before: new
  - After: "Add a listing" / "Edit listing"; fields "Name", "City or area", "Phone (optional)", "Website (optional)", "Why members recommend it"; "Use a web address, like example.com."; "Add listing" / "Save changes"; "Remove listing"; the confirm "Remove this listing?" / "{name} comes off your chapter's Resources for everyone."; error "We couldn't save that. Check the details and try again."
- **Where:** Review queue (`/admin/review`)
  - Before: new
  - After: chip "Places {count}"; item label "Place suggestion · {kind} · {chapter} chapter"; link "See the chapter's listings"
- **Where:** Screen reader labels
  - Before: new
  - After: "Call {name}, {phone}", "{name}'s website", "Kind of place", "Move {name} up", "Move {name} down"

### [#516](https://github.com/the-kya-project/perch-perfect-plan/pull/516) · D3 Seasonal calendar file
Approved and merged by Brittany (Nov 22, 2026). All 22 cards are new, as merged; nobody sees them until D2.1 shows the card on Home (it has, for everyone, since Nov 23, 2026). Source files: `src/locales/seasonal.en.jsonc` and `seasonal.nl.jsonc`.
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

### [#529](https://github.com/the-kya-project/perch-perfect-plan/pull/529) · 1.8 Do good voting: approved mockups
- **Decision (Brittany's):** Founders-only votes keep plain results: each choice's percentage and the top choice, with no donation or 10% wording. All-member votes share the donation. This replaces the earlier #529 notes below about a winner, changing a vote and the 10-vote minimum.
- **Decision:** Rounding uses largest remainder, so shares always total exactly 100%. Leftover points go to the largest remainder, then more votes, then the earlier choice. With no votes and three choices, that's 34 / 33 / 33.
- **Decision:** A member who has voted sees "See your vote" on the open card, which opens the thank-you screen. The mockups don't show this card state.
- **Decision:** Logos show whole on a white tile and are never cropped. A transparent logo is flattened onto white, because JPEG would turn it black.
- **Worth knowing:** With results showing at any size, a very small vote can reveal how someone voted. If two people vote and the result is 100% / 0%, each can work out the other's choice. Ballots themselves stay private.
- **To change it:** `private.flock_vote_guaranteed_pct()`, `private.flock_vote_shares()` and `isDonationVote` in `src/lib/flockVotes.ts`.
Judgment calls a run made on its own, even small ones: a name, an order, a default, how an unclear spec was read.

Format:

```
### <PR link> · <item ID> <item title>
- **Decision:** <what was decided>
- **Why:** <the reason, in plain language>
- **To change it:** <what would need to change>
```

### [#533](https://github.com/the-kya-project/perch-perfect-plan/pull/533) · 1.14a Dutch
- Kept as names, in English: "the Flock", "Do good" and "Founding 50". "Free season" is "gratis periode" and "chapter" is "afdeling", as on the Dutch gift pages.
- Dates, Stripe's Checkout and the Customer Portal follow the language the member is using. Prices stay in US dollars, because that's what Stripe charges.
- The rest of the Flock has no Dutch yet, so a Dutch member sees Dutch billing screens inside a mostly English Flock.

### [#533](https://github.com/the-kya-project/perch-perfect-plan/pull/533) · 1.14a Card step and checkout design
- **Decision (Brittany, Nov 23, 2026):** A card added in the free season's last 49 hours is no longer charged right away. Checkout saves the card, and the webhook starts the subscription with its first charge at the season's end, the same as everyone else.
- **Why:** Stripe Checkout can't start a trial under 48 hours long. Saving the card first avoids that limit. Stripe shows no plan or price on a save-the-card page, so its sentence names the price. Opening a new checkout closes the member's older open one, and the webhook refuses a second membership.
- **To change it:** `firstCharge` in `src/lib/billing.ts`, `startSavedCardSubscription` in `src/lib/billingWebhook.ts`.

### [#533](https://github.com/the-kya-project/perch-perfect-plan/pull/533) · 1.14a Card step and checkout design
- **Decision:** Differences from the approved mockups:
  - **Tab bar:** the Flock's tab bar (phones) and side column (desktop) stay on these screens. The mockups don't show them.
  - **Desktop:** the content is capped at 560 px and centered on the forest background. The mockups are phone-only.
  - **Founding line:** the visible card uses the mockup's "Locked in for as long as you stay a member." Your `flock.billing.founding` sentence is what screen readers hear on that card.
  - **Founder after the free season:** no mockup. A founder whose price is still open sees the founding price card, not plan tiles, because Checkout will charge the founding price.
  - **Membership states the mockup doesn't show:** a paid member sees "Next charge"; a cancelled one sees "Your membership won't renew." and "Access until". The all-set screen shows only during the free season.
  - **Slow confirmation:** after two minutes the confirming screen says it's taking longer than usual, not to add the card again, and offers Back to the Flock.
  - **Missing values:** no Card row if Stripe can't return the digits, no tile for a price that isn't set, and the "2 months free" badge only while the two prices really work out to it.
  - **Checkout:** Stripe draws the page, so its layout differs from `BillingCheckout`. See "What Stripe won't let us change" in the PR.
- **Why:** the backlog's mockup rule asks for every difference to be listed.
- **To change it:** `src/components/flock/BillingScreens.tsx`.

### [#533](https://github.com/the-kya-project/perch-perfect-plan/pull/533) · 1.14a Card step and checkout design
- **Decision:** Billing dates use Eastern time everywhere, Checkout's sentence included. Checkout is set to English, and uses Inter because Stripe doesn't offer DM Sans.
- **Why:** one day on every screen, and the custom sentence has no Dutch yet.
- **To change it:** `billingDay` and `checkoutDesign` in `src/lib/billing.ts`.

### [#531](https://github.com/the-kya-project/perch-perfect-plan/pull/531) · 2.4 Open pages fetch the new build's files after a release
- **Decision:** The pin is dropped before **every** update reload: the version check's (cache-busted address) and the service worker's (a plain reload, as before). The startup guard's reset after a missing code file, and the error screen's hard reset, are left as they are. The unpin waits at most 3 seconds; if it fails or times out (offline, or a page whose pinned build is older than this PR and has no `/api/public/unpin`), the page reloads anyway, exactly as it does today. The address is POST only, so a link or prefetch can never unpin anyone.
- **Why:** the item says "when an update is ready, the app clears its own pin and reloads", which covers both kinds of update. The resets aren't updates, and they already reload with the worker and caches cleared. The 3-second limit is the reference branch's.
- **To change it:** `unpinBuild` and `applyUpdate` in `src/lib/sw-register.ts`; `UNPIN_TIMEOUT_MS` in `src/lib/releaseCheck.ts`.

### [#525](https://github.com/the-kya-project/perch-perfect-plan/pull/525) · 1.14 Billing foundation (switched off) · approved and merged by Brittany, Nov 23, 2026
- **Decision:** Test mode is enforced in code: billing refuses any Stripe key that isn't a test key (`getBillingStripe` in `src/lib/stripe.server.ts`), in every deployment, production included. Gifts keep using the live key as before.
- **Why:** your approval was "test mode only". Putting it in code means turning `BILLING_ENABLED` on in production can't charge a real card by accident. Going live becomes a deliberate one-line code change you approve.
- **To change it:** remove the key check in `getBillingStripe` when payments go live.

### [#525](https://github.com/the-kya-project/perch-perfect-plan/pull/525) · 1.14 Billing foundation (switched off) · approved and merged by Brittany, Nov 23, 2026
- **Decision:** The switch is on only when `BILLING_ENABLED` is exactly `true`. Anything else, unset included, is off. While it's off, the webhook answers 503 before reading anything, the server functions return "off" without calling Stripe, and Membership shows exactly what it shows today.
- **Why:** the spec names the variable but not its value. A single strict value means a typo can't turn billing on.
- **To change it:** `billingEnabled()` in `src/lib/billing.ts`.

### [#525](https://github.com/the-kya-project/perch-perfect-plan/pull/525) · 1.14 Billing foundation (switched off) · approved and merged by Brittany, Nov 23, 2026
- **Decision:** Nothing about the card step shows in the iPhone or Android app, not even an "open this in your browser" line. Membership looks the same there as it does today.
- **Why:** the backlog says "never shown in the native app". The plan's "open this link in your browser" line conflicts with that, and Apple's rules on pointing people to web payments outside the US make a line like that risky.
- **To change it:** `cardStep()` in `src/lib/billing.ts` returns "hidden" for the app.

### [#525](https://github.com/the-kya-project/perch-perfect-plan/pull/525) · 1.14 Billing foundation (switched off) · approved and merged by Brittany, Nov 23, 2026
- **Decision:** A founder whose founding price is still open always gets the $15 founding price, with no monthly/yearly choice. Everyone else picks monthly or yearly, with yearly selected by default. With no free-season end stored, the card step says "Adding a card opens once the free season's end is set." and can't start a checkout. Within 49 hours of the end (Stripe's 48-hour minimum for a trial, plus an hour), or after it, the card is charged the same day, with no trial. A member with a card already on file can't start a second subscription; they see "Manage billing" (Stripe's Customer Portal) instead.
- **Why:** this follows payments-plan section d ("No yearly founding option"; `trial_end` = the free season's end). The yearly default, the not-ready line and the near-the-end rule weren't specified.
- **To change it:** `checkoutPlan`, `firstCharge` and `cardStep` in `src/lib/billing.ts`; the default `useState("annual")` in `BillingCardStep.tsx`.

### [#525](https://github.com/the-kya-project/perch-perfect-plan/pull/525) · 1.14 Billing foundation (switched off) · approved and merged by Brittany, Nov 23, 2026
- **Decision:** Left out of this PR: refunds of memberships (the plan says "a full refund ends access now"), cancelling a Stripe subscription when an account is deleted, the end-of-season job that releases founders, the admin lists, and the 14-day trial. Stripe's statuses are mapped as follows: `unpaid` → past_due (access runs out with the period), `paused` and `incomplete_expired` → canceled, `incomplete` → no row.
- **Why:** 1.14 covers the payments build's items 1–3 (schema, webhook, card step); the rest are later items. Refunds need a choice: the webhook re-reads the subscription, so marking a refunded row as ended would be undone by the next event. The simplest fix is to cancel the subscription in Stripe when refunding, and the webhook then ends access. Account deletion is a care-app flow current users rely on, so it was left alone.
- **To change it:** say which you'd like for refunds, and it becomes its own item.

### [#529](https://github.com/the-kya-project/perch-perfect-plan/pull/529) · 1.8 Do good voting
- **Decision:** Where votes show. Today shows open votes only (the spec's "on Today while it's open"). Do good shows open votes first, then a closed vote's result card ("The Flock chose …" or "Too few votes to share.") for 14 days after it closes. After that the vote is still readable from its link. A tie names every choice at the top as the winner.
- **Why:** the spec says everyone sees the results after closing but not where, or for how long, and doesn't cover a tie.
- **To change it:** `private.flock_vote_results_days()` in the migration; `votesFor` and `winnerNames` in `src/lib/flockVotes.ts`.

### [#529](https://github.com/the-kya-project/perch-perfect-plan/pull/529) · 1.8 Do good voting
- **Decision:** Once a vote is open, its question, description, audience and choices are locked. Only the close date (Extend, later only) and the announcement can change. Close early is final, and only drafts can be deleted. The announcement shows to members only after the vote closes.
- **Why:** a member's ballot points at a choice, so rewriting choices after people have voted would change what they voted for.
- **To change it:** `admin_vote_save` refuses non-drafts; allowing text-only edits while open would be a small change there.

### [#529](https://github.com/the-kya-project/perch-perfect-plan/pull/529) · 1.8 Do good voting
- **Decision:** The open vote card leaves out the mockup's row of voter avatars and shows only "31 members have voted" (or "You voted · …"). Percentages are each choice's share rounded to a whole number, so they may add up to 99 or 101.
- **Why:** faces of who voted aren't in the spec, which says members see "that they voted and how many have voted". Leaving them out keeps votes as private as possible.
- **To change it:** say if you'd like the avatars. That needs a new function returning a few voters' photos.

### [#529](https://github.com/the-kya-project/perch-perfect-plan/pull/529) · 1.8 Do good voting
- **Decision:** Deleting an account deletes that person's ballots, so a closed vote's results then count one fewer. "Founding member" means having a founding claim. The "fewer than 10" and "14 days" numbers are fixed in two small database functions, not admin settings.
- **Why:** ballots belong to the person (like every other row of theirs). The spec gives 10 as a rule, not a setting.
- **To change it:** `private.flock_vote_min_results()` and `private.flock_vote_results_days()`.

### [#523](https://github.com/the-kya-project/perch-perfect-plan/pull/523) · D2.1 Seasonal and holiday Today cards on Home · approved and merged by Brittany, Nov 23, 2026

- **Decision:** A card's end date is the last day of its unbroken run for that reader, so a season card interrupted by a holiday shows the day before the holiday (US, Nov 23: "Through Nov 23"), and "Got it" hides it through that day. It can come back after the holiday, because a different card has come up in between.
- **Why:** the brief says "until a different card comes up" and an end date "for that reader". Saving the end date with the dismissal also means a card returns normally next year.

### [#523](https://github.com/the-kya-project/perch-perfect-plan/pull/523) · D2.1 Seasonal and holiday Today cards on Home · approved and merged by Brittany, Nov 23, 2026

- **Decision:** "Pet sitter" stays "oppas" in Dutch, and "Holiday helper" is "Feestdagenhulp".
- **Why:** the locked glossary makes "sitter" "oppas" everywhere in the app. "Feestdagenhulp" is the closest short label for the pill.

### [#523](https://github.com/the-kya-project/perch-perfect-plan/pull/523) · D2.1 Seasonal and holiday Today cards on Home · approved and merged by Brittany, Nov 23, 2026
- **Decision:** The switch is a new table, `public.care_features` (`today_cards`, off / admins / everyone, starting off), built the same way as the health switches, rather than a row in `health_features`. "Brittany's account only" is `admins`: production has exactly one admin account (checked read-only, a count).
- **Why:** the calendar file says the cards are plain care reminders, never health advice, so they don't belong with the switches waiting on the avian vet. A per-account list would be new machinery for one person; `admins` already means you.
- **To change it:** move the row into `health_features` (and `HEALTH_FEATURES`) instead, or add another account to the admins.
- **Now:** on for everyone. On Nov 23, 2026, Brittany turned it on for admins at 12:08 PM Eastern, checked the card on her own account, and turned it on for everyone at 12:09 PM Eastern. She decided to skip the before-and-after Home screenshots D2.1 called for first.

### [#523](https://github.com/the-kya-project/perch-perfect-plan/pull/523) · D2.1 Seasonal and holiday Today cards on Home · approved and merged by Brittany, Nov 23, 2026
- **Decision:** The country (for the US-only and Netherlands-only cards) comes from the account's home time zone (Account → Time zone), or the phone's time zone when the account has none yet. A US time zone gets the US cards, Amsterdam gets the Dutch ones, and anywhere else (Canada, Belgium, the UK…) gets only the cards for everyone. The app's language isn't used. The day is the phone's own date, read after the page loads.
- **Why:** an English speaker in Amsterdam still hears King's Day fireworks, and a Dutch speaker in Ohio still has Thanksgiving. The home time zone is the one country-like thing the app already stores.
- **To change it:** `seasonalRegionForTimeZone` in `src/lib/todayCard.ts`; `npm run test:today-card` pins it.

### [#523](https://github.com/the-kya-project/perch-perfect-plan/pull/523) · D2.1 Seasonal and holiday Today cards on Home · approved and merged by Brittany, Nov 23, 2026
- **Decision:** The card sits right under Home's Today list (above the birds), as a white card with a small icon for its topic (sun, snowflake, sparkles, flame, plate, car, wind, house, party popper, clock), the card's title and its body. No label, no button, no way to dismiss it. It isn't shown during the onboarding tour's demo Home, and it doesn't appear on a Home with no birds yet.
- **Why:** the backlog asks for "the day's card" with no layout; this is the plainest card the Home design system already has. Dismissing wasn't asked for, so it's a question in the PR instead of a guess.
- **To change it:** `src/components/SeasonalTodayCard.tsx` and its one line in `src/routes/_authenticated/dashboard.tsx`.
### [#520](https://github.com/the-kya-project/perch-perfect-plan/pull/520) · 2.3 Open pages notice a new release · approved and merged by Brittany, Nov 23, 2026
- **Decision:** The open page reads `/api/public/version` through a hidden, zero-size frame instead of an ordinary request, as the reference branch `fix/native-release-catchup` does. Vercel's Skew Protection answers an open page's ordinary requests from the copy it started with, so they would only ever see the old build; page loads, frames included, aren't pinned (checked on that branch, Nov 2, 2026).
- **Why:** without it the check would never see a release while Skew Protection is on, which is the setting Brittany chose to keep (2.4, option B).
- **To change it:** `readLiveBuild` in `src/lib/sw-register.ts`. If Skew Protection were ever turned off, a plain uncached request would do.

### [#520](https://github.com/the-kya-project/perch-perfect-plan/pull/520) · 2.3 Open pages notice a new release · approved and merged by Brittany, Nov 23, 2026
- **Decision:** A reload the version check asks for goes to the same address with `?_r=<time>` added (the cache-busted reload the startup guard already uses), so the iPhone's web view can't answer it from its own cache. A service-worker update still reloads exactly as before. Dropping Vercel's pin before that reload is left to 2.4, and the sitter preview's own catch-up (with no worker) to 2.5. The background watcher also listens for the native app's `pause` and `resume`, which the iOS web view doesn't always report as a visibility change.
- **Why:** keeps 2.3 to its "done means" line and leaves the service-worker path that web users already have unchanged.
- **To change it:** `reloadFresh` and `applyUpdate` in `src/lib/sw-register.ts`.

### [#528](https://github.com/the-kya-project/perch-perfect-plan/pull/528) · 1.6 Curated chapter collections
- **Decision:** Place suggestions have their own functions (`flock_place_suggestions`, `flock_place_review`) and their own "Places" chip in `/admin/review`, rather than a rewrite of `flock_review_queue` and `flock_review_counts`. The queue's and Flock settings' "waiting" totals add them in.
- **Why:** It keeps the migration purely additive: no existing function changes.
- **To change it:** fold places into `flock_review_queue` in a later migration if one combined list is wanted.

### [#528](https://github.com/the-kya-project/perch-perfect-plan/pull/528) · 1.6 Curated chapter collections
- **Decision:** A suggestion is approved or declined, with no "Ask for changes". Approving lists it as sent, at the end of its group, and the lead can then add a phone or website with Edit. Declining deletes it. The member isn't notified either way.
- **Why:** The spec says "approve or decline", and the mockup's suggest form has no phone or website fields. A notification would have meant changing the existing Flock notification functions and checks.
- **To change it:** say if members should hear back. That's a "place" notification kind plus a change to `flock_notifications_list`.

### [#528](https://github.com/the-kya-project/perch-perfect-plan/pull/528) · 1.6 Curated chapter collections
- **Decision:** The suggest form has kind, name, city or area, and "Why do you recommend it?", as in the mockup. Only the name is required. Leads and admins add phone and website. Each member can have at most 10 suggestions waiting at once.
- **Why:** The spec lists name, type and note, and the mockup adds city or area. The cap stops one account flooding a lead's queue. There's no hourly limit like the one on posts.
- **To change it:** the cap is `private.flock_place_suggest_limit()`.

### [#528](https://github.com/the-kya-project/perch-perfect-plan/pull/528) · 1.6 Curated chapter collections
- **Decision:** Managing listings is its own screen, `/flock/places` (the mockup's screen 3). The Resources tab links to it through a small lime "Manage listings" card, shown only to the chapter's lead and admins. Admins get a "Chapter" dropdown there to pick any chapter, since their own chapter page shows only their own. Reordering uses up and down arrows within a group. Remove sits inside Edit and asks before removing.
- **Why:** The mockup shows the lead's screen but not how to get to it, how an admin reaches another chapter, or how reordering works. These are the smallest additions that cover the spec.
- **To change it:** tell us the entry point or reorder control you'd like.

### [#528](https://github.com/the-kya-project/perch-perfect-plan/pull/528) · 1.6 Curated chapter collections
- **Decision:** Small differences from the mockup: the tab order stays Posts, Events, Resources, Members (the backlog says so); each card's square tile carries an icon (stethoscope, heart-handshake, shop); and every group always shows, with an empty one inviting a suggestion.
- **Why:** The spec asks for an empty group to invite a suggestion, and the tiles were blank in the mockup.
- **To change it:** say which you'd prefer.

### [#522](https://github.com/the-kya-project/perch-perfect-plan/pull/522) · 1.3 Deleted posts stay hidden for 180 days, then are purged
- **Decision:** a deleted post or comment is moved into a new holding table (`flock_deleted_items`, readable only by the server), rather than marked "deleted" in place. The post and comment tables, and every rule about who sees what, are unchanged.
- **Why:** "hidden from everyone at once, the author included" is then true everywhere automatically. Marking in place would have meant rewriting about fifteen visibility functions, which already carry the blocking and moderation rules.
- **To change it:** to let an author restore a deleted post, a function would copy the held row back.
- **Decision:** reactions on a deleted post or comment are deleted at once, as today. Only the post, its comments and their photos are held.
- **Why:** D10 names the post and its comments. Reactions aren't content anyone wrote.
- **To change it:** hold them in the same table with a new `kind`.
- **Decision:** the delete confirmations keep their wording ("This can't be undone."). For the member that's still true: nothing in the app brings a deleted post back. The 180 days will be explained in the privacy policy (1.5).
- **Why:** the backlog item asks for no copy change.
- **To change it:** `flock.posts.deleteLine`, `deleteCommentLine` and `deleteReplyLine` in `src/locales/en.jsonc`.
- **Decision:** the daily job (`flock-deleted-purge-daily`, 04:23 UTC) calls a new hook, `/api/public/hooks/flock-purge`, instead of being SQL only. The migration schedules it on production only.
- **Why:** SQL can't remove the photo files. Only the Storage API can. Staging and preview branches would otherwise call production's hook.
- **To change it:** the `cron.schedule` block at the end of `20261123074500_flock_deleted_hold.sql`.
- **Decision:** when someone deletes their account, their held items go at once. Another member's reply held under their post stays held on its own until its own 180 days are up.
- **Why:** D10 says deleting an account stays immediate, and the reply is the other member's content.
- **To change it:** `held_with` would need `on delete cascade` instead of `set null`.

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
- **Decision:** The words are their own language files (`seasonal.en.jsonc` and `seasonal.nl.jsonc`), listed in the translate step like the routine catalog. The app doesn't load them yet; D2.1 adds them when Home shows the card (it has, for everyone, since Nov 23, 2026). The Dutch was written by hand and stamped, because the run can't call the translate step.
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

### [#529](https://github.com/the-kya-project/perch-perfect-plan/pull/529) · 1.8 Do good voting: no longer held
- **Status:** Brittany approved the mockups and asked for this to merge once every required check passes (Nov 23, 2026). The earlier #529 item below can be cleared.
PRs waiting on Brittany, and exactly what each one needs.

Format:

```
### <PR link> · <item ID> <item title>
- **Needs:** <the decision, approval or read, in one or two lines>
```

### [#533](https://github.com/the-kya-project/perch-perfect-plan/pull/533) · 1.14a Card step and checkout design
- **Needs:** (1) your read of the screens and wording; (2) the founder release job built before billing opens, because the founder screen promises it and it doesn't exist yet; (3) a saved test-mode Customer Portal setup in Stripe, then two real test checkouts, one normal and one inside the season's last 49 hours, neither of which has been run; (4) your go-ahead on Dutch.

### [#531](https://github.com/the-kya-project/perch-perfect-plan/pull/531) · 2.4 Open pages fetch the new build's files after a release
- **Needs:** your merge. It changes how every open page moves onto a new release (a short POST to `/api/public/unpin` before the reload), so a run can't merge it. No Vercel setting changes. The hands-on proof is 2.5's Simulator check (leave the app open across a release, then open the sitter preview).

### [#529](https://github.com/the-kya-project/perch-perfect-plan/pull/529) · 1.8 Do good voting (and the founding vote)
- **Needs:** your look at the two admin screens, `/admin/votes` (the list) and `/admin/votes/<id>` (write a draft, open it, close early, extend, the announcement). They aren't in SpecVoting, and the specs say a screen that isn't mocked up is held for you. They follow the Library's admin screens. The member screens follow the mockup, apart from the voter avatars (see "Decisions agents made"). Say "merge" on the PR if they're fine, or what to change. It's behind the Flock gate, and the migration only adds tables, functions and a bucket.

### Reminder · the hourly runs' GitHub token expires Feb 20, 2027
- **Needs:** a new token before **Feb 20, 2027**. That's 90 days from Nov 22, 2026; GitHub → Settings → Developer settings → Fine-grained tokens shows the exact date. When it expires, runs can still build and test but can't push or open PRs, and each run's note in `~/.kya-agent/job.log` says so.
- **To replace it:** make a new fine-grained token for `the-kya-project/perch-perfect-plan` only, with the same permissions as the old one (Contents and Pull requests: read and write; Actions, Commit statuses and Checks: read). Then run the save command again in Terminal (it asks you to paste the token and doesn't show it). It overwrites `~/.config/kya-agent/github-token`, readable only by you. Delete the old token on GitHub after that. Clear this item and add a new one with the new date.
