# Agent log

A running record of every unattended agent run, **newest first**. Every run adds one entry, even one that stops at once because another run holds the lock. The rules are in CLAUDE.md, "Working the backlog unattended"; things for Brittany to read or decide are in [`REVIEW_QUEUE.md`](REVIEW_QUEUE.md).

Runs that open no PR (stopped by the lock, or nothing to build) write their entry to `~/.kya-agent/pending-log.md` on the Mac; the next run with a PR moves those entries here.

## Entry format

Copy this, fill it in, and put it at the top of "Runs", above the latest entry.

```
### <YYYY-MM-DD HH:MM time zone> · <item ID> <item title>
- **Built:** <what changed, in plain language, for someone who isn't a developer>
- **PR:** <link, or "none">
- **Outcome:** Merged | Held: <what it needs from Brittany> | Waiting on checks | Stopped: <why>
- **Problems:** <anything that went wrong or looked odd, or "none">
```

---

## Runs

### 2026-11-22 17:07 EST · 2.4a Plain-language one-pager on Vercel's Skew Protection
- **Built:** A one-page explainer, `docs/skew-protection.md`, on the Vercel setting that keeps an open page on the copy of the app it started with. It covers how that played into the Nov 2 sitter-preview stall, four options and what current users would notice with each, so Brittany can decide 2.4. No setting or code changed.
- **PR:** [#509](https://github.com/the-kya-project/perch-perfect-plan/pull/509)
- **Outcome:** Merged if every check passes (docs only, nothing users see). Otherwise waiting on checks.
- **Problems:** This run has no Vercel access, so the page says the setting was on as of Nov 2 (from the reference branch's notes) and doesn't give today's time limit. PR #500 (0.3) was held for Brittany's read of the Dutch when this run picked, so it took the next item. #500 merged while this run was working, so the branch was updated from `main` with both sides' entries kept. No pending-log entries to move.

### 2026-11-22 15:38 EST · 0.5 Admin review for pending posts
- **Built:** The review screen already worked but nothing linked to it. Flock settings now has a "Review queue" row (reviewers only, with how many items are waiting). Each item in the queue now says which space it's in, and reports show when they came in. One new database function looks up a queued post's space, for reviewers only. Nothing existing was changed.
- **PR:** [#508](https://github.com/the-kya-project/perch-perfect-plan/pull/508)
- **Outcome:** Merged if every check passes (admin-only, Flock closed to members, additive migration). Otherwise waiting on checks.
- **Problems:** The job doesn't allow Python or piped `git show`, so edits were made with the editor, and I couldn't confirm Prettier's warnings on these three files against `main`. They match the files' existing long-line style. No pending-log entries to move.

### 2026-11-22 14:25 EST · 1.11 Buddy pods: how a pod ends
- **Built:** Added Brittany's answer on how a pod ends to the spec and unblocked 1.11. Removed her question from the review queue and recorded her agreement with the three stricter calls. Nothing was built.
- **PR:** [#507](https://github.com/the-kya-project/perch-perfect-plan/pull/507) (supervised session at Brittany's request)
- **Outcome:** Squash-merged by this session once every check passed, as she asked.
- **Problems:** none

### 2026-11-22 14:12 EST · Backlog: approved Flock specs and mockups
- **Built:** Added the approved Flock specs and eight mockups. Moved nine backlog items out of waiting: six to Ready to build, and three (1.13b, 1.12, 1.16) held for Brittany. Nothing was built.
- **PR:** [#506](https://github.com/the-kya-project/perch-perfect-plan/pull/506) (supervised session at Brittany's request)
- **Outcome:** Squash-merged by this session once every check passed, as she asked.
- **Problems:** The mockups reference a `support.js` file that wasn't in the zip. Their screens are written out in the files themselves. Open questions are in the review queue.

### 2026-11-22 13:59 EST · 0.4 Credit /get-page sign-ups to the link that brought them
- **Built:** When someone on a computer opens the download page (`/get` or `/get-app`) from the postcard or a campaign link and later signs up on the web in the same browser, the sign-up is now credited to that link instead of "direct". The page remembers where the visitor first came from, the same way the rest of the app already does, and never overwrites an earlier record. Nothing on the page looks or works differently. Brought over from the reference commit `d974e8e`, which applied cleanly. `/get` is served by this app at app.thekyaproject.com (it's a route in `src/routes/get.tsx`, and the postcard's QR points at `app.thekyaproject.com/get-app`), so the credit carries through to sign-up there.
- **PR:** [#505](https://github.com/the-kya-project/perch-perfect-plan/pull/505)
- **Outcome:** Merged (squash) by this run once every required check passed, including the Free-user regression and iPhone hydration. Nothing current users see changes, there's no migration, and the item asked for merge only.
- **Problems:** none. PR #500 (0.3) is held for Brittany's read of the Dutch, so it wasn't this run's to merge; this run took the next item. #504 merged while this run was working and put 0.5 above 0.4; 0.4 was already the highest item on `main` when this run picked it. That merge also made the docs conflict, so the branch was updated from `main` with both sides' entries kept. #506 then merged too, so it was updated from `main` a second time the same way.

### 2026-11-22 13:55 EST · Backlog: Brittany's decisions and the admin review item
- **Built:** Recorded Brittany's decisions in the backlog. Billing (1.14), Kya's Crew (1.15), promo codes (1.17) and the weight shadow log (D1.2) are now cleared to build, each to a PR held for her. Pre-approval (1.9) moved to Later. Added the admin review item (0.5) at the top and a Skew Protection one-pager (2.4a). Nothing was built.
- **PR:** [#504](https://github.com/the-kya-project/perch-perfect-plan/pull/504) (supervised session at Brittany's request)
- **Outcome:** Merged once every check passed, as she asked for this docs-only PR.
- **Problems:** none.

### 2026-11-22 12:36 EST · 0.3 Translation check passes and stays passing
- **Built:** The app's English word list had fallen behind the code (85 phrases from the Library were missing, 2 old ones were left over), so the check that catches this was failing. It's fixed, and the check now runs on every PR. Dutch readers of the gift, gift thank-you and redeem pages and the clip recorder now get Dutch instead of English (85 new Dutch lines).
- **PR:** [#500](https://github.com/the-kya-project/perch-perfect-plan/pull/500)
- **Outcome:** Held: needs Brittany's read of the new Dutch lines (the item's own "Needs Brittany" line), and Dutch readers would see a change.
- **Problems:** No lock at start; this run made its own and removed it at the end. `gh` worked this time (run on its own). `npm ci` failed because the PostHog CLI's install step downloads from releases.posthog.com, which the sandbox blocks, so this run used `npm ci --ignore-scripts`, the same way CI installs. `npm run i18n:translate` isn't allowed in the job, so the Dutch was written and stamped by hand. `npm run test:gifts` couldn't start (`npx --yes` hit an npm cache permission error); CI runs it. The four entries below were moved here from `~/.kya-agent/pending-log.md`.

### 2026-11-22 12:35 EST · no item
- **Built:** nothing
- **PR:** none
- **Outcome:** Stopped: blocked, new error. `gh` now gets past its config file but can't reach GitHub: `gh pr list` fails with `Post "https://api.github.com/graphql": tls: failed to verify certificate: x509: OSStatus -26276` (failed twice). `git clone` over HTTPS works, so it's likely `gh` (Go's TLS on macOS) not trusting the sandbox's network proxy certificate. Without `gh` a run can't check for open PRs before picking, open a PR, or read checks. Fix needed in the job setup (e.g. make the proxy's CA trusted for `gh`, or let `api.github.com` through without TLS interception) before runs can build anything.
- **Problems:** No lock at start; this run made its own lock and removed it. Removing its clone was refused by the job's permissions (`rm -rf` of `~/.kya-agent/work/agent-20261122-1235`, possibly because it was the shell's working directory), so the clone is still there. Nothing in it was changed, so it's safe to delete.

### 2026-11-22 12:31 EST · no item
- **Built:** nothing
- **PR:** none
- **Outcome:** Stopped: still blocked, same as the 12:29 run. `gh pr list` fails with "open /Users/brittanyking/.config/gh/config.yml: operation not permitted": `~/.config/gh` is still on the job sandbox's read-deny list and no `GH_TOKEN` is set. Without `gh` a run can't check for open PRs before picking, open a PR, or read checks. Fix needed in the job setup (allow reading `~/.config/gh`, or provide a `GH_TOKEN`) before runs can build anything. Cloning `main` worked.
- **Problems:** No lock at start; this run made its own lock and removed it, and removed its unchanged clone (`~/.kya-agent/work/agent-20261122-1231`).

### 2026-11-22 12:29 EST · no item
- **Built:** nothing
- **PR:** none
- **Outcome:** Stopped: blocked. `gh` can't start because the sandbox denies reading `~/.config/gh/config.yml` ("operation not permitted"; `~/.config/gh` is on the job's read-deny list). Without `gh` the run can't check for open PRs before picking an item, open a PR, or read check results. Cloning `main` worked. The job's sandbox needs to let `gh` authenticate, e.g. by allowing read access to `~/.config/gh` or providing a `GH_TOKEN`.
- **Problems:** No lock was found at start. This run made its own lock and removed it, and removed its clone (`~/.kya-agent/work/agent-20261122-1229`, nothing changed in it).

### 2026-11-22 12:19 EST · no item
- **Built:** nothing
- **PR:** none
- **Outcome:** Stopped: Claude Code isn't signed in on this Mac (run claude setup-token)
- **Problems:** see ~/.kya-agent/runs/2026-11-22_1218.log

### 2026-11-22 · Setup: rules for the continuous runs
- **Built:** New rules for the hourly agent runs: one run at a time (a lock file on the Mac), each run in its own copy of the project, when a run may merge its own work and when it must hold it for Brittany, and these two record files (this log and the review queue).
- **PR:** [#499](https://github.com/the-kya-project/perch-perfect-plan/pull/499) (opened in a supervised session at Brittany's request)
- **Outcome:** Held: it changes the rules themselves, so Brittany reviews and merges it.
- **Problems:** none.
