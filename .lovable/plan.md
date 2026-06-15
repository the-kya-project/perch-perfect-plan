## Goal

Create sits from the **owner dashboard**, picking any combination of your birds in one go. One sit = one secure invite link that covers all selected birds. Each bird's profile shows the sits it's part of (read-only list with the same link/revoke controls).

## Data model change

Today `sits.bird_id` is a single bird. We need many birds per sit, so:

- Drop `sits.bird_id` (single).
- Add a join table **`sit_birds`** linking a sit to one or more birds.
- Keep `sits.owner_id`, `invite_token`, `token_expires_at`, `revoked`, dates, sitter info, notes.
- Migrate any existing `sits` rows into `sit_birds` so nothing is lost.
- Update foreign keys on `daily_logs`, `photo_logs`, `task_completions`, `weight_logs`: they keep `sit_id` (unchanged) **plus** their existing `bird_id` so a sitter's log is still attached to the right bird inside a multi-bird sit.

## Dashboard changes (`/dashboard`)

- New **"Sits"** section above (or alongside) the bird list.
- Primary CTA: **"Create a sit"** (replaces the per-bird CTA).
- The create-sit form lets you:
  - Pick **one or more birds** via checkboxes (with "select all").
  - Sitter name, sitter email, start date, end date, notes.
- Below the form: list of upcoming + recent sits showing date range, sitter, included birds, status badge (Active / Upcoming / Expired / Revoked), copy-link, and revoke controls.

## Bird profile changes (`/birds/$birdId`)

- **Sits tab** stops being the entry point for creating sits.
- It now shows a read-only list of sits this bird is included in, with the same copy-link / revoke / status badge.
- A short helper line: "Sits are managed from the dashboard," with a link there.

## Sitter side (`/sitter/$token/*`)

- Sitter context server function returns the **list of birds** for the sit instead of a single bird.
- New sitter landing (`/sitter/$token/`) shows a bird picker if there are 2+ birds, then routes into existing per-bird views (scan, emergency, guide, etc.) scoped to the chosen bird.
- For a single-bird sit, it goes straight into the current flow with no extra tap.

## Files touched

- New migration: drop `sits.bird_id`, create `sit_birds` (bird_id, sit_id, PK both; RLS via parent sit's owner), backfill.
- `src/routes/_authenticated/dashboard.tsx` — add sits section + create form.
- New `src/components/SitForm.tsx` and `src/components/SitCard.tsx` (extracted, reused).
- `src/routes/_authenticated/birds/$birdId.tsx` — Sits tab becomes read-only list.
- Delete `src/routes/_authenticated/birds/$birdId/sits/new.tsx` (and any in-bird "Create sit" link).
- `src/lib/sitter.functions.ts` — return `birds: Bird[]` instead of single `bird`.
- `src/routes/sitter/$token/route.tsx` + `index.tsx` — handle bird selection; existing scan/guide/emergency routes consume the selected bird from context (search param `?birdId=...`).

## Out of scope (ask if you want it)

- Per-bird overrides inside one sit (e.g. different sitter notes per bird).
- Sharing a sit with multiple sitters / multiple links per sit.
