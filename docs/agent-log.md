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

### 2026-11-22 · Setup: rules for the continuous runs
- **Built:** New rules for the hourly agent runs: one run at a time (a lock file on the Mac), each run in its own copy of the project, when a run may merge its own work and when it must hold it for Brittany, and these two record files (this log and the review queue).
- **PR:** [#499](https://github.com/the-kya-project/perch-perfect-plan/pull/499) (opened in a supervised session at Brittany's request)
- **Outcome:** Held: it changes the rules themselves, so Brittany reviews and merges it.
- **Problems:** none.
