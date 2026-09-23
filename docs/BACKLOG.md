# Backlog — known, deferred, not urgent

Things we know about and chose not to do yet. Each entry is written to be picked up
cold: what the problem is, where the code lives, and what "done" looks like.

Nothing here is blocking a release. Last updated 2026-09-23.

---

## Push

### Foreground notifications show nothing
**Status:** known gap, shipped this way deliberately in 1.0.1 / versionCode 4.

iOS suppresses notification banners while the app is in the foreground, and Capacitor's
push plugin does not override that. If a sitter posts a log while the owner has the app
open, they see nothing at all.

- Fix: handle `pushNotificationReceived` (the plugin fires it for foreground pushes) and
  present it in-app — a toast or an inbox badge rather than a system banner.
- Where: `src/lib/pushNative.ts` already attaches `pushNotificationActionPerformed`
  (tap handling); this is the sibling event.
- **Needs a new native build on both platforms**, so batch it with other native work.

### Android push has never been tested on a real device
Verified as far as: FCM credential exchanges for an access token, the AAB contains the
plugin, permissions are correct. **Not** verified: a notification arriving on an Android
phone. iOS was confirmed end to end on 2026-09-22; Android was shipped on the strength of
the shared code path.

- Fix: borrow an Android device, install from internal testing, enable push, confirm.
- Play internal testing currently has **no tester email list** — create one first
  (Play Console → Testing → Internal testing → Testers).

### Duplicate notifications while both apps are installed
A phone with BOTH the PWA (home screen) and the store app gets each notification twice —
one web-push row, one APNs row. The server can't tell they're the same device.

- Simplest resolution: delete the PWA once the store app is live. Applies mainly to the
  founder's own phone.
- Only worth code if real users hit it. A "suppress web-push rows for a user who has a
  native token on the same platform" rule guesses at intent and could silence someone who
  legitimately uses both a desktop PWA and a phone.

---

## Security / infrastructure

### CSP is still report-only
`vite.config.ts` ships `Content-Security-Policy-Report-Only` with a `report-uri` pointing
at `src/routes/api/public/csp-report.ts`. It was always meant to be flipped to enforcing
once real traffic proved the policy doesn't break anything.

- Blocked on: reading `[csp-report]` lines from Vercel runtime logs. The token available
  in the working session 403s on runtime logs.
- Fix: read the reports, add any legitimately-needed hosts, then rename the header to
  `Content-Security-Policy`.
- Do NOT flip it blind — a missing host silently breaks a third-party integration.

### iOS Info.plist still registers the dead `kya://` URL scheme
The `kya://` deep-link auth flow was abandoned (it hit intermittent
`flow_state_not_found`). The Android intent filter was removed 2026-09-17; the iOS scheme
was deliberately left so build 6 wouldn't need rebuilding.

- Fix: remove the `CFBundleURLTypes` entry for `kya` from `ios/App/App/Info.plist` on the
  next iOS build.

---

## Product

### Vet summary PDF export was never merged
`main` uses `window.print()`, which is a **no-op inside both native shells** — the button
does nothing for app users. A working react-pdf implementation exists on the branch
`today-wip-backup` (commit `43fd077`) and was never merged.

- Fix: port it from that branch, or hide the button in the native shell (it's already
  hidden — see `$birdId.vet-summary.tsx` — so the current state is honest, just
  feature-less on mobile).

### Onboarding quickstart is shelved
Finished and QA'd work parked on `origin/redesign/onboarding-quickstart`. Shelved by the
owner as "too big". Don't resume without asking.

### Each bird's normal weight range, and alerts when a weigh-in falls outside it
**Status:** requested by the owner 2026-09-23. Wanted before weight alerts can ship.

Today the "normal range" is whatever the owner types into the health step of the
walkthrough (`birds.normal_weight`, `normal_weight_min`, `normal_weight_max`, set in
`$birdId.setup.tsx`). It's shown on the care plan and the sitter view, but nothing checks
new weigh-ins against it. `src/lib/weightTrend.ts` only labels trends (steady within
±2.5% over the window, or up/down) and deliberately never shows red.

What to build:
- **Baseline.** Decide how the app establishes a bird's normal range from its own
  weigh-ins, and when it has enough data to trust one. Starting proposal: at least 7
  weigh-ins over at least 14 days. Prefer `before_meal` entries (`weight_entries.meal_relation`)
  when there are enough of them, because weight swings around meals. A range the owner
  entered by hand overrides the computed one. Show the range on the weight page, with a
  "still learning [bird]'s normal" state until the baseline exists.
- **Alert thresholds.** Starting proposal, to be checked with an avian vet before shipping:
  - "worth a look": 5% or more below the baseline, or three weigh-ins in a row going down
  - "call your vet": 10% or more below the baseline
  - gains above the range get a gentler note
- **Delivery.** Show the alert in the app on the weight page and in the bird's record.
  Also send push and email, because the owner wants email alerts too. Send one alert per
  crossing, not one per weigh-in. When a sitter or household member logs the weight, alert
  the owner. Wording is the same kind as the flagged-scan alert: specific, calm, never a
  diagnosis, and always with the line "This app doesn't diagnose illness… contact an
  avian veterinarian."
- **Emails.** Add a new builder in `src/lib/emailTemplates.ts` with Dutch copy in
  `src/locales/emails.*.jsonc`, plus a notification-settings toggle that is on by default.

Open questions: species reference ranges as a starting point before a bird has its own
baseline (nothing in the repo holds them yet), and whether a vet should review the
thresholds before launch.

---

## Release / store

### Android still shows "Kya" on the launcher
iOS ships "Kya & Co." from 1.0.1 / build 9; Android versionCode 4 was mid-review when the
name was fixed and was deliberately not disturbed, so it ships "Kya".

- The fix is **already committed** in `android/app/src/main/res/values/strings.xml`
  (`app_name` and `title_activity_main`) — it rides along with the next Android build.
- While there, bump `versionName` from `1.0` to match iOS. Play only requires `versionCode`
  to increase, so the mismatch is cosmetic, but the two stores reading differently is
  confusing.

### App Store Connect rejection emails go somewhere unread
Apple's ITMS-90062 rejection on 2026-09-22 never arrived at brittany@thekyaproject.com — a
mailbox search found nothing from Apple since July. The rejection was only noticed by
looking at the console.

- Fix: App Store Connect → Users and Access → the user → notification settings, and point
  App Review notifications at a mailbox that's actually read.
- Worth doing before the next submission; a missed rejection can sit for days.

---

## Housekeeping

### `appstore-screenshots/` is untracked — decide what to do with it
36 PNGs, ~15 MB, currently untracked. Git history is permanent, so committing adds 15 MB
to every clone forever, and these assets already live in App Store Connect and Play
Console.

- Options: commit as-is, use Git LFS, or keep them out of the repo entirely.
- Deliberately left undecided rather than committed by default.

### `_to_delete/` contains a stray 0-byte file
`_to_delete/index.lock.stale` — almost certainly debris from an interrupted git
operation. Delete the directory.
