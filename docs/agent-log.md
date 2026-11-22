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

### 2026-11-22 13:59 EST · 0.4 Credit /get-page sign-ups to the link that brought them
- **Built:** When someone on a computer opens the download page (`/get` or `/get-app`) from the postcard or a campaign link and later signs up on the web in the same browser, the sign-up is now credited to that link instead of "direct". The page remembers where the visitor first came from, the same way the rest of the app already does, and never overwrites an earlier record. Nothing on the page looks or works differently. Brought over from the reference commit `d974e8e`, which applied cleanly. `/get` is served by this app at app.thekyaproject.com (it's a route in `src/routes/get.tsx`, and the postcard's QR points at `app.thekyaproject.com/get-app`), so the credit carries through to sign-up there.
- **PR:** [#505](https://github.com/the-kya-project/perch-perfect-plan/pull/505)
- **Outcome:** see the PR (merged by this run if every check passed, otherwise waiting on checks).
- **Problems:** none. PR #500 (0.3) is held for Brittany's read of the Dutch, so it wasn't this run's to merge; this run took the next item.

### 2026-11-22 · Setup: rules for the continuous runs
- **Built:** New rules for the hourly agent runs: one run at a time (a lock file on the Mac), each run in its own copy of the project, when a run may merge its own work and when it must hold it for Brittany, and these two record files (this log and the review queue).
- **PR:** [#499](https://github.com/the-kya-project/perch-perfect-plan/pull/499) (opened in a supervised session at Brittany's request)
- **Outcome:** Held: it changes the rules themselves, so Brittany reviews and merges it.
- **Problems:** none.
