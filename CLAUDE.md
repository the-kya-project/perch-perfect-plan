# CLAUDE.md

Project context for Claude Code. This app is "Parrot Care Co-Pilot" by The Kya Project: a bird owner builds a care plan for their bird and shares a private, read-only view with a sitter.

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
  - `birds/$birdId.setup.tsx` — guided care-plan walkthrough (SetupShell, 8 steps: food, day, personality, environment, health, clips, emergency, review). Basics moved to the bird main page.
  - `birds/$birdId.index.tsx` — bird main page (record home). Shows identity, weight glance, quick actions, "Create care plan" CTA for fresh birds, and the facet list.
  - `birds/$birdId.plan.tsx` — care-plan overview (front door): six section rows with Ready/Needs info status, "View as your sitter", "Walk through it again".
  - `birds/$birdId.plan.editor.tsx` — tabbed section editor. Visible strip: Food, Routine, Behavior, Home, Health, Emergency. Reached from the overview; back returns to the overview. basics/clips/sits/logs are still accepted via `?tab=…` for back-compat (delete-bird card, notification deep-links, sit panel).
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

## Deploy
- Pushing to `main` auto-deploys the web app to Vercel at https://app.thekyaproject.com.
- Changing an Edge Function requires a separate Supabase deploy; it does not ship with the Vercel build.

## Conventions and gotchas
- Static assets must live in `public/` and be referenced by root path, e.g. `/kya_parrot_icon_teal.png`. Do not use Lovable `__l5e/...asset.json` pointers — they resolve only on Lovable's host and 404 in production. Some dead `src/assets/*.png.asset.json` files remain from the Lovable origin and can be ignored or removed.
- Product copy uses sentence case for titles, headings, and subheadings (only the first letter capitalized). Avoid the phrasing "it's not about X, it's about Y."
- The guided walkthrough reads its starting step from the `?step=` URL param. Apply that value only when it actually changes, not on every data refetch, or the wizard bounces back to the linked step.
- `ClipRecorder` supports recording in-browser (live preview → review/playback → use or re-record) or uploading an existing video. Clips are capped at **60 seconds** everywhere; raw upload limit is **250 MB**. Both paths upload the **raw** clip straight to **Cloudflare Stream** via a resumable (tus) direct-creator upload — no client-side compression. Cloudflare transcodes server-side to H.264 that plays everywhere (incl. iPhone HEVC/.mov). Flow: `createClipUpload` (server fn, `src/lib/clips.functions.ts`) mints the tus upload URL + video uid via `src/lib/cloudflareStream.server.ts`, the browser tus-uploads the bytes, then the `"cfstream:<uid>"` reference is persisted on the clip column. The progress UI (`UploadProgress`: Uploading% → Processing) lives in `ClipRecorder`; `onBusy` lets the wizard steps block Next during upload. Requires env `CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_STREAM_TOKEN` (set in Vercel). Playback uses a short-lived **signed Cloudflare Stream iframe** (`ClipPlayer` detects `cfstream:`/Stream URLs); legacy Supabase-Storage clips (older `bird-photos` paths) still play via a signed `<video>` URL. Clip refs are now Cloudflare uids, not Storage objects, so the `bird-photos` bucket `file_size_limit` only matters for legacy clips + bird photos.

## Preview server (Claude Code desktop)
- Dev command is `npm run dev` (Vite). If the embedded preview needs an explicit config, `.claude/launch.json` should run `vite dev`.
