# Retiring the email-link key (plan, not built)

`CARE_PLAN_REMINDER_SECRET` signs the links inside emails we have already sent. Since Nov 2026 it is **only** the link key: the cron jobs have their own token (`cron_hook_token` in the Vault, see `src/lib/cronAuth.ts`). Changing the key in one step breaks every link in every inbox. The safe way is to accept both keys for a while.

## What it signs today

| Link | Where | Lives |
| --- | --- | --- |
| Unsubscribe `/api/public/unsubscribe/<category>/<userId>/<sig>` | `src/lib/unsubscribe.ts` | as long as the email is kept |
| Weight-chart image `/api/public/chart/<birdId>/<month>/<sig>` | `src/lib/chartLink.ts` | as long as the email is kept |
| Click tracking `/r/<token>` | `src/lib/emailClicks.server.ts` | as long as the email is kept |
| Bereavement review | `src/lib/bereavementReview.server.ts` | until the note is reviewed |

## Plan

1. **Two keys.** Add `EMAIL_LINK_KEY` (new, random) next to `CARE_PLAN_REMINDER_SECRET` in Vercel Production. One helper, say `src/lib/linkKeys.server.ts`, returns `{ sign: newKey ?? oldKey, verify: [newKey, oldKey].filter(Boolean) }`.
2. **Sign with the new key, accept either.** The four modules above sign with `sign` and check a signature against each key in `verify` (constant-time). Tests cover: an old link still verifies, a new link verifies, a link signed with neither fails.
3. **Ship and wait.** Every email sent from then on carries new-key links. Keep the old key for a transition period long enough that old emails are rarely opened: 6 to 12 months for unsubscribe links (the law expects them to keep working), less for chart images and clicks.
4. **Soft landing for stale links.** Before removing the old key, make an unsubscribe link that fails verification show "This link has expired. Sign in to manage your email settings" instead of an error, and let a stale chart image fall back to a placeholder. Old links then degrade, not break.
5. **Remove the old key.** Delete `CARE_PLAN_REMINDER_SECRET` from Vercel and the code paths that read it. Rename `EMAIL_LINK_KEY` in the docs as the one link key.

Rotating it again later is the same steps with the two keys swapped. Never rotate it in one step.
