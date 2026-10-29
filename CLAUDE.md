# CLAUDE.md

Project context for Claude Code. This app is "Kya & Co." (formerly "Parrot Care Co-Pilot") by The Kya Project.

## What the product is
Kya & Co. is a full-service health and wellness app for parrots. Its job is keeping a bird healthy at all times: the care plan, weight tracking, daily health scans, journal and moments, the vet summary, and household co-care all serve that mission.

It is **not** a pet-sitting app. Sharing the care plan with a sitter began as the original idea and is still a valued feature, because it keeps care consistent when the owner is away. It supports the health mission rather than defining the product. Frame copy, emails, onboarding and positioning around the bird's lifelong health and wellbeing, with sitter access as one way the app delivers on that.

## Stack
- Vite 7 + React 19 + TypeScript
- TanStack Router (file-based routes) and TanStack Query for data
- Tailwind CSS v4 (sage-toned design system)
- Supabase (Postgres, Auth, Storage, Edge Functions)
- Brevo for marketing/transactional email
- Hosted on Vercel; the repo originated in Lovable

## Local development
- Install: `npm install`
- Dev server: `npm run dev` (Vite, default http://localhost:5173)
- Build: `npm run build` · Preview built app: `npm run preview`
- Lint: `npm run lint` · Format: `npm run format`

## Project structure
- `src/routes/` — file-based routes; the authenticated app lives under `src/routes/_authenticated/`.
  - `birds/$birdId.setup.tsx` — guided care-plan walkthrough (SetupShell, 8 steps in this order: food, health, personality, clips, day, environment, emergency, review; the order lives in `src/lib/setupSteps.ts`). Basics moved to the bird main page.
  - `birds/$birdId.index.tsx` — bird main page (record home). Shows identity, weight glance, quick actions, "Create care plan" CTA for fresh birds, and the facet list.
  - `birds/$birdId.plan.tsx` — care-plan overview (front door): six section rows with Ready/Needs info status, "View as your sitter", "Walk through it again".
  - `birds/$birdId.plan.editor.tsx` — tabbed section editor. Visible strip: Food, Routine, Behavior, Home, Health, Emergency. Reached from the overview; back returns to the overview. basics/clips/sits/logs are still accepted via `?tab=…` for back-compat (notification deep-links; `sits` now shows a card pointing to the Sits tab).
  - `birds/new.tsx` — add a bird; starts the walkthrough.
  - `sitter/$token/` — the public, token-based sitter view.
- `src/components/` — shared UI (e.g. `BrandLogo`, `ClipRecorder`, `ClipPlayer`).
- `src/lib/` — helpers (e.g. `captureLead.ts`, analytics, setup completeness).
- `src/integrations/supabase/` — Supabase client and generated types.
- `supabase/functions/` — Edge Functions (currently `capture-lead`).

## Backend (Supabase)
- Project ref: `koyqdyamazuuwvqbttnj`. The browser client uses the publishable key (safe for client use).
- Storage: bird photos and care clips live in the `bird-photos` bucket; sitters get access through time-limited signed URLs.
- Edge Functions: `capture-lead` adds signup leads to Brevo (first name, last name, source, consent) and, when the person opts in, to the marketing list. Secrets (Brevo API key, list id) live in Supabase function secrets, never in the repo.
- Edge Functions deploy through Supabase, separately from the Vercel app deploy.
- Onboarding email runs on two cron hooks, each logging `cron_hook_run` under its own name. `onboarding-welcome` (job `onboarding-welcome-15min`, at :07/:22/:37/:52 every hour) sends only the welcome, about an hour after confirmation, holding it to 8 AM local if that hour lands 10 PM–7 AM. `onboarding-emails` (job `onboarding-emails-daily`, 15:00 UTC) sends the rest of the series and never sends the welcome. Rules: `src/lib/welcomeTiming.ts` and `src/lib/onboardingPlan.ts`; tests: `npm run test:onboarding-welcome`, `npm run test:onboarding-plan`.
- `CARE_PLAN_REMINDER_SECRET` is **Production-only** in Vercel. It does two jobs: the bearer token the pg_cron jobs send to `/api/public/hooks/*` (the same value is in the Vault secret `cron_function_token`), and the HMAC key that signs links inside emails (unsubscribe, chart images, `/r/` click tracking, bereavement review). It was **intentionally not rotated** as of Oct 21, 2026, after its earlier exposure to preview builds. Changing it invalidates every signed link in email already sent, and the Vercel value and the Vault secret must change together or the cron jobs get 401s. The split into a separate link key (#384) was closed unmerged.

## Database migrations (migration-first — never the dashboard)
Schema changes are migration-first. **Do NOT edit the schema in the Supabase dashboard SQL editor.**

- Every schema change is a new timestamped file in `supabase/migrations/` (`<YYYYMMDDHHMMSS>_<name>.sql`). Keep them forward-only and idempotent where practical (`if not exists`, `drop policy if exists`, `NOT EXISTS` guards on backfills).
- **Merging a migration to `main` applies it to production automatically.** The Supabase GitHub integration is connected to this repo, and the production branch deploys migrations on merge — verified 2026-09-23, when `20260923220000_bereavement_email_log.sql` appeared in `supabase_migrations.schema_migrations` on merge with no `db push` run. So a PR containing a migration is a production schema change the moment it merges, not when someone next runs the CLI. Review it accordingly, and merge it when you're ready for it to be live.
- `supabase db push` is for applying a migration BEFORE merging (local-first development, or getting production and the file in step). It is not required after a merge, and running it then is a no-op — never by pasting into the dashboard either way.
- The CLI links to project ref `koyqdyamazuuwvqbttnj`. `supabase link --project-ref koyqdyamazuuwvqbttnj` is a one-time setup that prompts for the **database password** and sets up the IPv4/pooler connection (`migration list`/`db pull`/`db push` all need it).
- The repo's pre-existing migrations were originally applied via the dashboard, so they're registered with the CLI as **already-applied** via a one-time `supabase migration repair --status applied <version>` (so `db push` runs only NEW files). These files ARE the baseline — do not `db pull` a fresh baseline on top of them.
- Workflow for a change: write the migration file → `supabase db push` → commit the file. Verify against `supabase migration list` (Local and Remote columns should match). Skipping the push and letting the merge apply it works too, but then the merge is the deploy — and the PR's "Supabase Preview" check is the only validation you get before production.
- **The "Supabase Preview" check silently does nothing when the preview-branch quota is full.** It reports failure with "Maximum number of concurrent branches reached", which looks like any other red check. Two branches from PRs merged in June 2026 held the quota for three months, so every migration PR in that window went unvalidated while still auto-applying on merge. If that check goes red, read the reason before assuming it's your SQL — and prune merged branches with `list_branches` / `delete_branch`.
- Never commit an access token or the service-role key. `supabase login` (CLI auth) is separate from the per-project DB password; neither belongs in the repo.
- **One channel per migration — don't mix MCP apply with a CLI-created file.** Applying via the Supabase MCP `apply_migration` stamps the tracking table (`supabase_migrations.schema_migrations`) with the MCP's *apply-time* version, which will NOT match a file created separately by `supabase migration new` (stamped at file-creation time). That mismatch is what breaks the "Supabase Preview" check ("Remote migration versions not found in local migrations directory") even when the SQL is byte-identical. So: if you apply via MCP, name the committed repo file with the **exact** version the MCP recorded; if you use the CLI, create the file first and apply it with `supabase db push`. Never do both for the same change.

## Preview deployments never touch production Supabase
Every Vercel preview runs against the persistent Supabase **`staging`** branch (ref `upygspynanvuxthgnaph`), never project `koyqdyamazuuwvqbttnj`:
- Vercel's general **Preview** scope holds staging's `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_SECRET_KEY`. The seven production Supabase variables (`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_PROJECT_ID`, and the three `VITE_` copies) are **Production-only**. Never re-add Preview to them.
- The Supabase–Vercel integration is deliberately **not** connected to `pet-sitter`: its connect screen has no Preview-only option and would write 13 variables, including the production DB password and JWT secret. Don't connect it.
- A PR with migrations still gets its own Supabase preview branch (the "Supabase Preview" check). Test that PR's SQL on that branch directly (MCP or dashboard); its Vercel preview stays on staging, which won't have the new migration until it merges.
- Staging isn't linked to a git branch. `.github/workflows/staging-migrations.yml` runs `supabase db push` against it on every push to `main` that touches `supabase/migrations/` (repository secret `STAGING_DB_URL`, the staging *session pooler* string). The job refuses to run unless the string's project ref is staging's. It can also be run by hand from the Actions tab.
- Guards (`src/lib/supabaseEnv.ts`): a preview build fails if its Supabase settings are missing, disagree, or name production, and the server clients refuse production when `VERCEL_ENV=preview`. Production builds skip both and read their variables exactly as before. `npm run test:supabase-env` pins this.
- Test accounts on staging come from `supabase/staging/seed.sql` (password passed in with `psql -v`, never committed): `staging-owner@example.com` (owns Kiwi and Mango) and `staging-household@example.com` (household on Kiwi). Previews use **email/password** sign-in: Google and Apple are configured on production only, and a branch has its own auth callback URL.
- Staging's Auth settings are set apart from production's by hand (Oct 22, 2026): the **Send Email hook is off** and **Confirm email is off**, so a sign-up in a preview creates the account and signs straight in with no email. A new branch copies production's hook URL (`app.thekyaproject.com/api/public/hooks/send-email`) without its secret, and every email sign-up then fails with a 500, "Hook requires authorization token". Don't re-point the hook at a preview: previews refuse to send through Brevo, so confirmation links would never arrive. When changing Auth settings in the dashboard, check the URL shows `upygspynanvuxthgnaph`, not `koyqdyamazuuwvqbttnj`, before saving.

## Previews never touch production's outside services
Vercel's Preview scope holds **no** third-party production credentials: no Brevo, PostHog CLI, Cloudflare Stream, VAPID, Webflow, APNs IDs, Apple provider token or `CARE_PLAN_REMINDER_SECRET`. Those are Production-only; don't re-add Preview to them. In a preview:
- **PostHog is off in code**, not just by env: the project key is a literal, and `src/lib/deployEnv.ts` gives it to production builds only (`__KYA_DEPLOY_ENV__`, injected from `VERCEL_ENV` in `vite.config.ts`), so preview bundles don't contain it. Analytics, server error reports, cron telemetry, the source-map upload and the `sourcemap_build` event all skip previews.
- **Brevo refuses to send** (`brevoEmail.server.ts`) even if a key reappears, and every sender treats that as "not emailed".
- **Clips** say "Clips aren't available in preview links" before recording (`__KYA_CLIPS_AVAILABLE__`). Adding a test Cloudflare Stream token to Preview turns them back on with the next build.
- **Push** reports "not available" instead of failing.
- The build prints one `[preview] third-party services: …` line saying what it saw. `npm run test:preview-services` pins the runtime guards.

## iPhone hydration check (every PR)
- `.github/workflows/hydration.yml` runs `e2e/` on every pull request: the production build, served the way Vercel serves it, with a mock Supabase (`e2e/mock-supabase.mjs`, no secrets). It loads `/`, `/auth` (sign-in and sign-up), `/confirm-email` and `/link-expired` as iPhone Safari and as the iOS app, on WebKit and Chromium, in every language in `SUPPORTED_LOCALES`. It fails on any React hydration error (#418/#421/#422/#423/#425/#520) or uncaught error. It also covers the duplicate-email sign-up, an old confirmation link, opening a signed-in page while signed out, and the new-sitter tour (every step on screen, with a long care sheet; sitter data in `e2e/sitter-fixture.mjs`). Background: PRs #393–#396.
- A new language is picked up automatically, and the check fails until the app really shows pages in it.
- Run it locally with `npm run test:hydration`. `npm run test:hydration:dev` shows React's exact server-vs-browser difference. `e2e/README.md` explains how to read a failure.
- The fix for a hydration error is never to suppress it: read the browser-only value after mount (`useEffect`), so the first render matches the server.

## Payments (Stripe, web only)
- Gift memberships (`/gift`, `/gift/thanks`, `/redeem`, `/admin/gifts`) are the first Stripe code. One-time Checkout payments; RevenueCat and in-app purchases come with the launch build.
- Env (Vercel, server only): `STRIPE_SECRET_KEY`, `STRIPE_PRICE_FLOCK_YEAR_GIFT`, `STRIPE_PRICE_APP_PREMIUM_YEAR_GIFT`, `STRIPE_WEBHOOK_SECRET`. Preview holds test-mode values; `src/lib/stripe.server.ts` refuses a live key in a preview. Prices are read from Stripe, never hard-coded.
- `gift_purchases` rows are created **only** by the verified webhook at `/api/public/stripe/webhook` (`checkout.session.completed`, `charge.refunded`), idempotent on the Checkout session id. Stripe can't reach a preview unless its webhook URL carries Vercel's Protection Bypass for Automation secret.
- Double-giving days (40% instead of 20%) live in one place: `private.double_giving_days()`.

## Deploy
- Pushing to `main` auto-deploys the web app to Vercel at https://app.thekyaproject.com.
- Changing an Edge Function requires a separate Supabase deploy; it does not ship with the Vercel build.

## Conventions and gotchas
- **Never `git add -A` or `git add .` in this repo. Stage files explicitly by path.**
  Several directories are deliberately untracked and must stay that way:
  `appstore-screenshots/` (~15 MB — committing it would put that in every clone
  forever, and the assets already live in App Store Connect and Play Console),
  `_to_delete/`, and the scratch build scripts under `docs/email-redesign/`. They are
  gitignored now, but the rule stands regardless: a blanket add also sweeps in whatever
  someone has half-finished in their working tree. More generally, before any
  `git checkout`, `reset`, `stash` or rebase, run `git status` and stop if there are
  modified or untracked files you did not create — an uncommitted binary asset that
  reverts is invisible in a diff summary.
- **One new, uniquely named branch per piece of work.** Start each change on a fresh
  branch from the latest `main`. Never reuse a branch name that has already been
  merged, even when it still exists on GitHub (cloud sessions often can't delete a
  merged branch). Reusing one drags the old, already-squashed commits back in and
  would need a force-push to clean up.
- Static assets must live in `public/` and be referenced by root path, e.g. `/kya_parrot_icon_teal.png`. Do not use Lovable `__l5e/...asset.json` pointers — they resolve only on Lovable's host and 404 in production. Some dead `src/assets/*.png.asset.json` files remain from the Lovable origin and can be ignored or removed.
- Product copy uses sentence case for titles, headings, and subheadings (only the first letter capitalized). Avoid the phrasing "it's not about X, it's about Y."
- **A new release never reloads an open page on its own.** The service worker (`src/sw.ts`) waits until the page sends `SKIP_WAITING`. `src/lib/sw-register.ts` sends it only at a quiet moment with no form in progress (a fresh open, with no reload, or a return after 30+ minutes away, with a reload). Otherwise `UpdateBanner` shows "A new version is ready", and its Update saves drafts first. A form registers itself with `useFormInProgress` (`src/lib/formsInProgress.ts`). The full health check and the weight entry keep local drafts (`src/lib/drafts.ts`), scoped to account + bird and expiring after 24 hours. A sitter's check keeps one scoped to the sit link + bird instead (the key holds a hash of the token, never the token). It ends when the sit does (`token_expires_at`) or after 24 hours, whichever comes first, and is removed when the link shows as expired, revoked or invalid. `npm run test:drafts` pins the storage rules.
- The guided walkthrough reads its starting step from the `?step=` URL param, and writes the current step back to it (replace, not push) so a reload returns to the same step. The plan editor does the same with `?tab=`. Apply that value only when it actually changes, not on every data refetch, or the wizard bounces back to the linked step.
- `ClipRecorder` supports recording in-browser (live preview → review/playback → use or re-record) or uploading an existing video. Clips are capped at **60 seconds** everywhere; raw upload limit is **250 MB**. Both paths upload the **raw** clip straight to **Cloudflare Stream** via a resumable (tus) direct-creator upload — no client-side compression. Cloudflare transcodes server-side to H.264 that plays everywhere (incl. iPhone HEVC/.mov). Flow: `createClipUpload` (server fn, `src/lib/clips.functions.ts`) mints the tus upload URL + video uid via `src/lib/cloudflareStream.server.ts`, the browser tus-uploads the bytes, then the `"cfstream:<uid>"` reference is persisted on the clip column. The progress UI (`UploadProgress`: Uploading% → Processing) lives in `ClipRecorder`; `onBusy` lets the wizard steps block Next during upload. Requires env `CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_STREAM_TOKEN` (set in Vercel). Playback uses a short-lived **signed Cloudflare Stream iframe** (`ClipPlayer` detects `cfstream:`/Stream URLs); legacy Supabase-Storage clips (older `bird-photos` paths) still play via a signed `<video>` URL. Clip refs are now Cloudflare uids, not Storage objects, so the `bird-photos` bucket `file_size_limit` only matters for legacy clips + bird photos.
- `ClipRecorder` survives camera interruptions (a fold or unfold, a call, switching apps). It notices the track ending or muting, frozen frames, a hidden page, or a long timer gap. Mid-recording, it stops cleanly and offers "Keep this clip" (only with 2+ seconds) or "Record again". In the preview, it restarts the camera once, quietly. A recorded clip is saved to IndexedDB (`kya-drafts` → `clips`, `src/lib/draftStore.ts`) the moment recording stops, when the caller passes `draftSlot`. It's keyed like the form drafts (account or sit link + bird + `clip:<slot>`), expires after 24 hours (or the sit's end), and is deleted on upload or discard; nothing ever uploads on its own. The rules live in `src/lib/clipCapture.ts`, pinned by `npm run test:drafts`. The preview and review player take the video's real shape, capped at 45% of the screen height.
- **`npx cap sync android` must run before `./gradlew bundleRelease` — always after any `npm install`.** Kya signs in with Google and Apple only; the Facebook provider is disabled in `capacitor.config.ts` (`plugins.SocialLogin.providers.facebook: false`) so the Facebook SDK and its five advertising permissions (`AD_ID` + four `ACCESS_ADSERVICES_*`) stay out of the app. That switch is not applied by anything in the repo: `cap sync` runs the plugin's hook, which writes `socialLogin.facebook.include=false` into **`node_modules/@capgo/capacitor-social-login/android/gradle.properties`** — the plugin subproject's own file. The app's `android/gradle.properties` does **not** override it, so there is no in-repo copy of the setting and `npm install` wipes it. The failure mode is silent: skip the sync and the build still succeeds, but the Facebook SDK is linked back in and the ad permissions reappear in the merged manifest with no warning — you only find out from the AAB (`unzip -l app-release.aab | grep -ci facebook` should be `0`, and the compiled manifest should have no `AD_ID`/`ADSERVICES` entries). iOS works the same way since plugin 8.7: the hook comments the Facebook SDK out of the plugin's own `Package.swift` and podspec in `node_modules`, so run `npx cap sync ios` after any `npm install` and before archiving too. Skip it and FBSDK is linked back in (unused: nothing initializes it and `Info.plist` carries no `FacebookAppID`/`FacebookClientToken`).

## iOS native shell (scene lifecycle)
- Since app version 1.1.0 (build 12) the iOS app uses Apple's scene-based lifecycle (UIScene), on Capacitor 8.5.3. Apps built with the iOS 27 SDK (Xcode 27) don't launch without it, the App Store requires that SDK from April 2027, and it's what lets the app resize on iPhone Duo. **Never release a build made with Xcode 27 from code that predates this change** (no `ios/App/App/SceneDelegate.swift`).
- One window only (`UIApplicationSupportsMultipleScenes` false). `SceneDelegate.swift` builds the window and `CAPBridgeViewController` in code and passes link opens to Capacitor's `SceneDelegateProxy`. `Info.plist` names no storyboard (`UISceneStoryboardFile`, `UIMainStoryboardFile`) on purpose: naming one would have UIKit build a second window and web view from `Main.storyboard`. `AppDelegate.swift` keeps only the APNs token callbacks, the scene configuration and the relay install below. iOS no longer calls the app-level open-URL, continue-activity or foreground/background methods, so new code of that kind goes in `SceneDelegate`.
- **Closed-app push taps:** `LaunchNotificationRelay.swift` is the notification delegate from `didFinishLaunching`, because Apple wants one set before launch ends and Capacitor's bridge only exists once the scene connects. It holds a tap that arrives early, also reads the scene's `connectionOptions.notificationResponse`, and hands each tap once to the bridge's `NotificationRouter`. The push plugin keeps the event until `attachNativePushHandlers` (`src/lib/pushNative.ts`) listens. The relay takes the delegate back after the bridge claims it and stays it, so a tap arriving both ways is passed on once. Don't set `UNUserNotificationCenter.current().delegate` anywhere else.
- **Launch screen** matches the web `StartupSplash`: the `LaunchBackground` color (#1a3d2e, the same in light and dark mode) and `SplashLogo` (the stacked lockup from `public/brand/lockups/stacked-ink.png` with its box made transparent) at 180 points wide, centered across the width and 22 points above the safe area's middle, where the web logo sits above its spinner. `capacitor.config.ts` sets `ios.backgroundColor` to the same green, so there's no white flash before the page paints. Change both if the web splash changes.
- **Web code reaches every installed build at once** (remote-URL mode), long before a new store build does. Before upgrading a Capacitor or plugin package, check that its JavaScript still works with the native versions already in the App Store (diff the old and new package's `dist/`).
- The Apple Sign-In fix is `patches/@capgo+capacitor-social-login+<version>.patch` (patch-package, keyed to the exact plugin version). After upgrading the plugin, carry the change over and regenerate it with `npx patch-package @capgo/capacitor-social-login --exclude 'package\.json$|Package\.swift$|\.podspec$'`; the exclude keeps out the plugin files the `cap sync` hook rewrites.
- Building on the Mac: `npm ci`, `npx cap sync ios`, open `ios/App/App.xcodeproj`, then Product → Archive. Bump `CURRENT_PROJECT_VERSION` for every upload.

## Preview server (Claude Code desktop)
- Dev command is `npm run dev` (Vite). If the embedded preview needs an explicit config, `.claude/launch.json` should run `vite dev`.
