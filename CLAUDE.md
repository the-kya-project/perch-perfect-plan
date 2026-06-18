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
  - `birds/$birdId.setup.tsx` — guided care-plan walkthrough (SetupShell, 9 steps).
  - `birds/$birdId.index.tsx` — tabbed bird editor (basics, routine, food, behavior, home, health, clips, emergency, sits, logs).
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
- `ClipRecorder` supports recording in-browser or uploading an existing video (capped at 1 minute; raw upload limit 200 MB to accept a 1-minute iPhone HEVC original); both paths store to the `bird-photos` bucket. NOTE: there is no server-side transcoding yet — the raw original is stored as-is, so HEVC/.mov clips won't play in non-Safari browsers until a transcoding step is added. The clip-upload UI (progress bar, disable-during-upload, collapse-after-save) lives in `ClipRecorder` (`UploadProgress`) and the wizard clip steps.

## Preview server (Claude Code desktop)
- Dev command is `npm run dev` (Vite). If the embedded preview needs an explicit config, `.claude/launch.json` should run `vite dev`.
