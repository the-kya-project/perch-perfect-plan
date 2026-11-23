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

### 2026-11-22 23:58 EST · 2.3 Open pages notice a new release
- **Built:** An open app or web page now asks "which copy of the app is live?" when it opens, once an hour, and each time it comes back to the front (including the iPhone app's own "back from the background" signal, which its web view doesn't always pass on). If a newer copy is out, it's handled exactly like today's service-worker update: a quiet reload at a safe moment (just opened, or back after 30+ minutes) with no form in progress, otherwise "A new version is ready" while a form is open. It never reloads twice for the same release within 10 minutes. The iPhone app has no service worker, so until now it never noticed a release while open. The question is asked through a tiny hidden page load, because Vercel's Skew Protection would answer an ordinary request from the old copy. Web users' existing worker updates behave exactly as before.
- **PR:** [#520](https://github.com/the-kya-project/perch-perfect-plan/pull/520)
- **Outcome:** Held: needs Brittany's merge and the iPhone Simulator check across a preview release (the item's own "Needs Brittany" line), since it changes how open pages update for everyone.
- **Problems:** The run couldn't run the browser tests or a Simulator here (no browser in the sandbox); `npm run test:release-check` (17 checks), `test:drafts`, `test:preview-services`, type check, lint and the production build all pass locally, and CI runs the rest. `test:release-check` still isn't in CI (a workflow change the token can't push). No lock at start. No open PRs to update. No pending-log entries to move.

### 2026-11-22 22:24 EST · 2.2 A version endpoint and release rules
- **Built:** A small public address, `/api/public/version`, that answers with which copy of the app is live, and is never cached, so an open app can later ask "has a new release gone out?". Also the rules for what to do when one has: which pages ask, how often (on launch, hourly, and when the app comes back to the front, at most once a minute), what counts as a new release, whether to update now or wait behind the "A new version is ready" banner (a form in progress always waits), and never reloading twice for the same release. A test pins all of it. Nothing in the app calls these yet (that's 2.3), so nobody sees a change.
- **PR:** [#519](https://github.com/the-kya-project/perch-perfect-plan/pull/519)
- **Outcome:** Merged if every check passes (internal code, nothing users see). Otherwise waiting on checks.
- **Problems:** The new test (`npm run test:release-check`, 11 checks, all passing locally) isn't in CI yet: adding it means a workflow change, which the run's token can't push. The first `gh pr create` failed with a certificate error and worked on retry. PR #518 (Brittany's record update) merged while this run was working, so the branch was updated from `main` with both sides' entries kept, and the backlog's Done lines for 2.1 and D3 now say Brittany merged them. No lock at start. No pending-log entries to move.

### 2026-11-23 · Record: #514, #515 and #516 approved and merged by Brittany
- **Built:** Marked the three held PRs as approved and merged by Brittany in this log and in the review queue. Moved them out of "Held for Brittany". Kept #515's switch decisions and #516's decisions where they were, and added #516's 22 cards (English and Dutch) to "Copy that merged". Nothing in the app changed.
- **PR:** [#518](https://github.com/the-kya-project/perch-perfect-plan/pull/518) (supervised session at Brittany's request)
- **Outcome:** Squash-merged by this session once every check passed, as she asked.
- **Problems:** none. `docs/BACKLOG.md` still calls #514 and #516 held in its Done lines; left alone because this PR was asked to touch only these two files.

### 2026-11-22 21:45 EST · D3 Seasonal calendar file
- **Built:** The list of dated cards for Home's future "Today" card: 22 cards that between them cover every day of the year. Seven season cards (dry winter air, drafts, bird-safe spring cleaning, open windows, summer heat, shorter days, heating season) and fifteen for holidays and moments (fireworks at New Year and the Fourth of July, Valentine's, Easter, King's Day, Halloween, Thanksgiving, Sinterklaas, the clock changes, December decorations, candles, travel and holiday meals). Each card has a rule for the days it shows, including holidays that move (Easter, Thanksgiving, the clock changes, King's Day), and a short title and body in English and Dutch. Some cards are US-only or Netherlands-only. A test checks every rule lands on real dates every year through 2075, every day has a card, the moving holidays land on the right days, and every card has its words in both languages. Nothing in the app reads the file yet, so nobody sees a change.
- **PR:** [#516](https://github.com/the-kya-project/perch-perfect-plan/pull/516)
- **Outcome:** Held: needs Brittany's read of the card copy (the item's own "Needs Brittany" line). **Approved and merged by Brittany** (squash-merged Nov 22, 2026, 22:13 EST; not merged by an agent).
- **Problems:** none. 2.1 still has its open PR (#514, held), and 2.2–2.4 wait on it, so D3 was the highest item this run could take. The Dutch was written by hand and stamped, since the translate step isn't allowed in the job. The new test isn't in CI yet: adding it means a workflow change, which the run's token can't push. No pending-log entries to move.

### 2026-11-22 20:20 EST · 1.2 Vet-content settings file and a switch for every health feature
- **Built:** One file, `src/lib/healthRules.ts`, now lists every health number and phrase list the app uses: the Diet conversion's weight rules, the 127 vet-nudge phrases, the health check's red and yellow rules, the care app's weight levels, the keep-warm range and poison lines, and the starting values for the weight baseline (D1). Each one is marked "draft, pending vet review" with where it came from and where it's used. A test fails if the app's code drifts from the file, and a database check fails if the database does. A new table gives each health feature its own off / admins / everyone switch. The live ones start at "everyone" and nothing reads them yet, so nobody sees a change. The vet packet now points at the file.
- **PR:** [#515](https://github.com/the-kya-project/perch-perfect-plan/pull/515)
- **Outcome:** Held: needs Brittany's approval of the switch table (a database change) and the health content, her call on wiring the live features to their switches, and one workflow line to run the new test in CI. **Approved and merged by Brittany** (squash-merged Nov 22, 2026, 21:27 EST; not merged by an agent). The wiring decision and the CI line are still open.
- **Problems:** This run opened its draft PR after building instead of before, so the draft step was late. Production's `journey_settings` and `flock_vet_signs` match the file (checked read-only: yes). PR #514 (2.1, held for Brittany) has a red "iPhone hydration" check on its latest commit. This run couldn't read why: `gh run download` and `gh api` are refused, and the log was too large to show. 2.1 still has that open PR, so this run took 1.2. No pending-log entries to move.

### 2026-11-22 18:33 EST · 2.1 The startup guard listens before anything can fail
- **Built:** The small safety script that resets the page when one of its code files is missing now starts before anything else on the page. Before, it came after the page's other files and styles, so a file that failed at once could slip past it and the page never recovered. That's what made the WebKit test flaky. The server now adds it to the top of each app page. It also keeps a list of the page's code files and which failed, so the error screen can tell a missing file from a real error. New tests check the order on four pages, how it's added to the HTML, and the missing-file reset 30 times on WebKit.
- **PR:** [#514](https://github.com/the-kya-project/perch-perfect-plan/pull/514)
- **Outcome:** Held: the item asks for before-and-after screenshots, which this run couldn't take (the sandbox can't launch a browser). The change also reaches every page through the server entry, so Brittany merges it. **Approved and merged by Brittany** (squash-merged Nov 22, 2026, 22:16 EST; not merged by an agent).
- **Checks:** every required check passes, including Free-user regression and iPhone hydration. All 30 WebKit runs of the missing-file reset passed in CI.
- **Problems:** GitHub refused the push of a `hydration.yml` change (the token has no Workflows permission), so the 30 WebKit runs are inside the spec instead. Locally, only the browserless tests could run (order on 4 pages and the HTML insertion; all passed). The browser tests run in CI. CI's first run caught one bug in the new list: a file's load event never reaches `window`, so the guard now listens on `document`. Fixed in the same PR. No lock at start. No pending-log entries to move.

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
