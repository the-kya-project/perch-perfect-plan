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
