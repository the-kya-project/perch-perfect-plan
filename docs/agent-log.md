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

### 2026-11-28 14:10 EST · Chapter names in Dutch (started by Brittany in a session)
- **Built:** the ten chapter names now show in the reader's language wherever the Flock names a chapter, with Dutch for all ten ("Grote Meren", "Andere regio", …). The names are looked up in the app, so the database is unchanged.
- **PR:** [#579](https://github.com/the-kya-project/perch-perfect-plan/pull/579)
- **Outcome:** Held: for Brittany's read of the names.
- **Problems:** the known join test still fails on this Mac only (it fails on a clean `main` too).

### 2026-11-28 12:40 EST · Join the Flock screen in Dutch (started by Brittany in a session)
- **Built:** Dutch for the 50 remaining lines on the Join screen: the "Part of the Flock" sheet, the chapter picker, the community guidelines word for word, "I'm 18 or older" and "I agree", the error messages and the "You're in" screen.
- **PR:** [#575](https://github.com/the-kya-project/perch-perfect-plan/pull/575)
- **Outcome:** Merged on Brittany's OK once checks passed (Nov 28, 2026). A native speaker's read of the guidelines is still welcome.
- **Problems:** none. The chapter names come from the regions table and stay English.

### 2026-11-28 11:45 EST · 1.16 Rescue partner codes, Dutch (started by Brittany in a session)
- **Built:** Dutch for all 79 rescue-code lines (the adopter's screens, the Join and redeem card, the admin page and the review chip), hand-written and passed through the repo's translation script for its placeholder checks. Partner lines on the admin page now wrap instead of cutting off, since the Dutch is longer.
- **PR:** [#574](https://github.com/the-kya-project/perch-perfect-plan/pull/574)
- **Outcome:** Merged on Brittany's OK once checks passed (Nov 28, 2026). A native speaker's read is still welcome.
- **Problems:** the rest of the Flock isn't in Dutch yet (about 1,480 lines), so the Join sheet and the admin card show Dutch rescue lines next to English ones until those are translated.

### 2026-11-28 10:25 EST · 1.13b Badges: care badges free users can earn
- **Built:** four care badges for every bird, earned in the free care app and switched off until Brittany turns them on: Steady scale (weighing the bird at least once a week, 4, 12 or 52 weeks in a row), Daily check-in (a health check 7 or 30 days in a row), Plan ready (the whole care plan done) and Sitter ready (a pet sitter link sent). Past care counts, shown once as "Here's what you've already earned"; a new badge later gets a "Badge earned" card on the bird page, the bird's record list gets a "Badges" row, and a new Badges screen shows earned and unearned badges with how to earn each. Badges reward the habit, never a weight or a health result. With the switch off, the bird page looks and behaves exactly as before and asks nothing about badges.
- **PR:** [#572](https://github.com/the-kya-project/perch-perfect-plan/pull/572)
- **Outcome:** Held: it changes what free users see once switched on, so Brittany approves it with before-and-after screenshots, reads the wording, answers four questions in the PR, and adds one CI line. Never merged by an agent.
- **Problems:** the screenshots couldn't be taken here: Chromium won't start inside the job's sandbox (it can't read its own files under ~/Library). The PR adds `npm run test:care-badges:screens` for Brittany to run on her Mac. The new unit test (`npm run test:care-badges`) isn't in CI yet because the runs' token can't push a `.github/workflows` change; the PR asks her to add the line. No local database here, so the SQL checks ran in CI ("Database checks"): they failed twice and were fixed in the PR (the bird-access function now lives in `private`, and `profiles` refuses an unknown time zone, so that part of the check was dropped). `main` moved (#570), and the review queue conflict was resolved by keeping both entries. All required checks pass, Free-user regression included; "Supabase Preview" reported "skipping", so the migration was checked only by "Database checks". Open PR check at the start: [#570](https://github.com/the-kya-project/perch-perfect-plan/pull/570) (Brittany's session, 1.20f follow-up) passes its checks and was left alone; #567 is now closed (by Brittany's session, as superseded by #569), so the 14:53 note about it below wasn't added to the review queue. The 43 entries below, from runs with no PR, were moved here from `~/.kya-agent/pending-log.md`.

### 2026-11-28 09:24 EST · none (nothing to build)
- **Built:** nothing. "Ready to build" in docs/BACKLOG.md (main at 2257a7b) is still empty; 2.5, 1.13b and 1.12 need Brittany before work starts, and no item is marked "Overnight alone: yes".
- **PR:** none
- **Outcome:** Stopped: nothing an unattended run may build.
- **Problems:** none new. The only open PR, [#567](https://github.com/the-kya-project/perch-perfect-plan/pull/567), is unchanged (held, still conflicting with `main` outside the record files, last updated 19:54 UTC). Its review-queue note is already in the 14:53 entry below. No PRs were closed. The clone at `~/.kya-agent/work/agent-run-20261128-0924` has no changes.

### 2026-11-28 08:24 EST · none (nothing to build)
- **Built:** nothing. "Ready to build" in docs/BACKLOG.md (main at 2257a7b) is still empty; 2.5, 1.13b and 1.12 need Brittany before work starts, and no item is marked "Overnight alone: yes".
- **PR:** none
- **Outcome:** Stopped: nothing an unattended run may build.
- **Problems:** none new. The only open PR, [#567](https://github.com/the-kya-project/perch-perfect-plan/pull/567), is unchanged (held, still conflicting with `main` outside the record files, last updated 19:54 UTC). Its review-queue note is already in the 14:53 entry below. No PRs were closed. The clone at `~/.kya-agent/work/agent-run-20261128-0824` has no changes.

### 2026-11-28 07:23 EST · none (nothing to build)
- **Built:** nothing. "Ready to build" in docs/BACKLOG.md (main at 2257a7b) is still empty; 2.5, 1.13b and 1.12 need Brittany before work starts, and no item is marked "Overnight alone: yes".
- **PR:** none
- **Outcome:** Stopped: nothing an unattended run may build.
- **Problems:** none new. The only open PR, [#567](https://github.com/the-kya-project/perch-perfect-plan/pull/567), is unchanged (held, still conflicting with `main` outside the record files, last updated 19:54 UTC). Its review-queue note is already in the 14:53 entry below. No PRs were closed. The clone at `~/.kya-agent/work/agent-run-20261128-0723` has no changes.

### 2026-11-28 06:22 EST · none (nothing to build)
- **Built:** nothing. "Ready to build" in docs/BACKLOG.md (main at 2257a7b) is still empty; 2.5, 1.13b and 1.12 need Brittany before work starts, and no item is marked "Overnight alone: yes".
- **PR:** none
- **Outcome:** Stopped: nothing an unattended run may build.
- **Problems:** none new. The only open PR, [#567](https://github.com/the-kya-project/perch-perfect-plan/pull/567), is unchanged (held, still conflicting with `main` outside the record files, last updated 19:54 UTC). Its review-queue note is already in the 14:53 entry below. No PRs were closed. The clone at `~/.kya-agent/work/agent-run-20261128-0622` has no changes.

### 2026-11-28 05:21 EST · none (nothing to build)
- **Built:** nothing. "Ready to build" in docs/BACKLOG.md (main at 2257a7b) is still empty; 2.5, 1.13b and 1.12 need Brittany before work starts, and no item is marked "Overnight alone: yes".
- **PR:** none
- **Outcome:** Stopped: nothing an unattended run may build.
- **Problems:** none new. The only open PR, [#567](https://github.com/the-kya-project/perch-perfect-plan/pull/567), is unchanged (held, still conflicting with `main` outside the record files, last updated 19:54 UTC). Its review-queue note is already in the 14:53 entry below. No PRs were closed. The clone at `~/.kya-agent/work/agent-run-20261128-0521` has no changes.

### 2026-11-28 04:20 EST · none (nothing to build)
- **Built:** nothing. "Ready to build" in docs/BACKLOG.md (main at 2257a7b) is still empty; 2.5, 1.13b and 1.12 need Brittany before work starts, and no item is marked "Overnight alone: yes".
- **PR:** none
- **Outcome:** Stopped: nothing an unattended run may build.
- **Problems:** none new. The only open PR, [#567](https://github.com/the-kya-project/perch-perfect-plan/pull/567), is unchanged (held, still conflicting with `main` outside the record files, last updated 19:54 UTC). Its review-queue note is already in the 14:53 entry below. No PRs were closed. The clone at `~/.kya-agent/work/agent-run-20261128-0420` has no changes.

### 2026-11-28 03:20 EST · none (nothing to build)
- **Built:** nothing. "Ready to build" in docs/BACKLOG.md (main at 2257a7b) is still empty; 2.5, 1.13b and 1.12 need Brittany before work starts, and no item is marked "Overnight alone: yes".
- **PR:** none
- **Outcome:** Stopped: nothing an unattended run may build.
- **Problems:** none new. The only open PR, [#567](https://github.com/the-kya-project/perch-perfect-plan/pull/567), is unchanged (held, still conflicting with `main` outside the record files, last updated 19:54 UTC). Its review-queue note is already in the 14:53 entry below. No PRs were closed. The clone at `~/.kya-agent/work/agent-run-20261128-0320` has no changes.

### 2026-11-28 02:19 EST · none (nothing to build)
- **Built:** nothing. "Ready to build" in docs/BACKLOG.md (main at 2257a7b) is still empty; 2.5, 1.13b and 1.12 need Brittany before work starts, and no item is marked "Overnight alone: yes".
- **PR:** none
- **Outcome:** Stopped: nothing an unattended run may build.
- **Problems:** none new. The only open PR, [#567](https://github.com/the-kya-project/perch-perfect-plan/pull/567), is unchanged (held, still conflicting with `main` outside the record files, last updated 19:54 UTC). Its review-queue note is already in the 14:53 entry below. No PRs were closed. The clone at `~/.kya-agent/work/agent-run-20261128-0219` has no changes.

### 2026-11-28 01:18 EST · none (nothing to build)
- **Built:** nothing. "Ready to build" in docs/BACKLOG.md (main at 2257a7b) is still empty; 2.5, 1.13b and 1.12 need Brittany before work starts, and no item is marked "Overnight alone: yes".
- **PR:** none
- **Outcome:** Stopped: nothing an unattended run may build.
- **Problems:** none new. The only open PR, [#567](https://github.com/the-kya-project/perch-perfect-plan/pull/567), is unchanged (held, still conflicting with `main` outside the record files, last updated 19:54 UTC). Its review-queue note is already in the 14:53 entry below. No PRs were closed. The clone at `~/.kya-agent/work/agent-run-20261128-0118` has no changes.

### 2026-11-28 00:17 EST · none (nothing to build)
- **Built:** nothing. "Ready to build" in docs/BACKLOG.md (main at 2257a7b) is still empty; 2.5, 1.13b and 1.12 need Brittany before work starts, and no item is marked "Overnight alone: yes".
- **PR:** none
- **Outcome:** Stopped: nothing an unattended run may build.
- **Problems:** none new. The only open PR, [#567](https://github.com/the-kya-project/perch-perfect-plan/pull/567), is unchanged (held, still conflicting with `main` outside the record files, last updated 19:54 UTC). Its review-queue note is already in the 14:53 entry below. No PRs were closed. The clone at `~/.kya-agent/work/agent-run-20261128-0017` has no changes.

### 2026-11-27 23:17 EST · none (nothing to build)
- **Built:** nothing. "Ready to build" in docs/BACKLOG.md (main at 2257a7b) is still empty; 2.5, 1.13b and 1.12 need Brittany before work starts, and no item is marked "Overnight alone: yes".
- **PR:** none
- **Outcome:** Stopped: nothing an unattended run may build.
- **Problems:** none new. The only open PR, [#567](https://github.com/the-kya-project/perch-perfect-plan/pull/567), is unchanged (held, still conflicting with `main` outside the record files, last updated 19:54 UTC). Its review-queue note is already in the 14:53 entry below. No PRs were closed. The clone at `~/.kya-agent/work/agent-run-20261127-2317` has no changes.

### 2026-11-27 22:16 EST · none (nothing to build)
- **Built:** nothing. "Ready to build" in docs/BACKLOG.md (main at 2257a7b) is still empty; 2.5, 1.13b and 1.12 need Brittany before work starts, and no item is marked "Overnight alone: yes".
- **PR:** none
- **Outcome:** Stopped: nothing an unattended run may build.
- **Problems:** none new. The only open PR, [#567](https://github.com/the-kya-project/perch-perfect-plan/pull/567), is unchanged (held, still conflicting with `main` outside the record files, last updated 19:54 UTC). Its review-queue note is already in the 14:53 entry below. No PRs were closed. The clone at `~/.kya-agent/work/agent-run-20261127-2216` has no changes.

### 2026-11-27 21:15 EST · none (nothing to build)
- **Built:** nothing. "Ready to build" in docs/BACKLOG.md (main at 2257a7b) is still empty; 2.5, 1.13b and 1.12 need Brittany before work starts, and no item is marked "Overnight alone: yes".
- **PR:** none
- **Outcome:** Stopped: nothing an unattended run may build.
- **Problems:** none new. The only open PR, [#567](https://github.com/the-kya-project/perch-perfect-plan/pull/567), is unchanged (held, still conflicting with `main` outside the record files, last updated 19:54 UTC). Its review-queue note is already in the 14:53 entry below. No PRs were closed. The clone at `~/.kya-agent/work/agent-run-20261127-2115` has no changes.

### 2026-11-27 20:15 EST · none (nothing to build)
- **Built:** nothing. "Ready to build" in docs/BACKLOG.md (main at 2257a7b) is still empty; 2.5, 1.13b and 1.12 need Brittany before work starts, and no item is marked "Overnight alone: yes".
- **PR:** none
- **Outcome:** Stopped: nothing an unattended run may build.
- **Problems:** none new. The only open PR, [#567](https://github.com/the-kya-project/perch-perfect-plan/pull/567), is unchanged (held, still conflicting with `main` outside the record files, last updated 19:54 UTC). Its review-queue note is already in the 14:53 entry below. No PRs were closed. The clone at `~/.kya-agent/work/agent-run-20261127-2015` has no changes.

### 2026-11-27 19:14 EST · none (nothing to build)
- **Built:** nothing. "Ready to build" in docs/BACKLOG.md (main at 2257a7b) is still empty; 2.5, 1.13b and 1.12 need Brittany before work starts, and no item is marked "Overnight alone: yes".
- **PR:** none
- **Outcome:** Stopped: nothing an unattended run may build.
- **Problems:** none new. The only open PR, [#567](https://github.com/the-kya-project/perch-perfect-plan/pull/567), is unchanged (held, still conflicting with `main` outside the record files, last updated 19:54 UTC). Its review-queue note is already in the 14:53 entry below. No PRs were closed. The clone at `~/.kya-agent/work/agent-run-20261127-1914` has no changes.

### 2026-11-27 18:13 EST · none (nothing to build)
- **Built:** nothing. "Ready to build" in docs/BACKLOG.md (main at 2257a7b) is still empty; 2.5, 1.13b and 1.12 need Brittany before work starts, and no item is marked "Overnight alone: yes".
- **PR:** none
- **Outcome:** Stopped: nothing an unattended run may build.
- **Problems:** none new. The only open PR, [#567](https://github.com/the-kya-project/perch-perfect-plan/pull/567), is unchanged (held, still conflicting with `main` outside the record files, last updated 19:54 UTC). Its review-queue note is already in the 14:53 entry below. No PRs were closed. The clone at `~/.kya-agent/work/agent-run-20261127-1813` has no changes.

### 2026-11-27 17:13 EST · none (nothing to build)
- **Built:** nothing. "Ready to build" in docs/BACKLOG.md (main at 2257a7b) is still empty; 2.5, 1.13b and 1.12 need Brittany before work starts, and no item is marked "Overnight alone: yes".
- **PR:** none
- **Outcome:** Stopped: nothing an unattended run may build.
- **Problems:** none new. The only open PR, [#567](https://github.com/the-kya-project/perch-perfect-plan/pull/567), is unchanged (held, still conflicting with `main` outside the record files, last updated 19:54 UTC). Its review-queue note is already in the 14:53 entry below. No PRs were closed. The clone at `~/.kya-agent/work/agent-run-20261127-1713` has no changes.

### 2026-11-27 16:12 EST · none (nothing to build)
- **Built:** nothing. "Ready to build" in docs/BACKLOG.md (main at 2257a7b) is still empty; 2.5, 1.13b and 1.12 need Brittany before work starts, and no item is marked "Overnight alone: yes".
- **PR:** none
- **Outcome:** Stopped: nothing an unattended run may build.
- **Problems:** none new. The only open PR, [#567](https://github.com/the-kya-project/perch-perfect-plan/pull/567), is unchanged (held, still conflicting with `main` outside the record files, last updated 19:54 UTC). Its review-queue note is already in the 14:53 entry below. No PRs were closed. The clone at `~/.kya-agent/work/agent-run-20261127-1612` has no changes.

### 2026-11-27 15:11 EST · none (nothing to build)
- **Built:** nothing. "Ready to build" in docs/BACKLOG.md (main at 2257a7b) is still empty; 2.5, 1.13b and 1.12 need Brittany before work starts, and no item is marked "Overnight alone: yes".
- **PR:** none
- **Outcome:** Stopped: nothing an unattended run may build.
- **Problems:** none new. The only open PR, [#567](https://github.com/the-kya-project/perch-perfect-plan/pull/567), is unchanged (held, still conflicting with `main` outside the record files, last updated 19:54 UTC). Its review-queue note is already in the 14:53 entry below. No PRs were closed. The clone at `~/.kya-agent/work/agent-run-20261127-1511` has no changes.

### 2026-11-27 14:10 EST · none (nothing to build)
- **Built:** nothing. "Ready to build" in docs/BACKLOG.md (main at 2257a7b) is still empty; 2.5, 1.13b and 1.12 need Brittany before work starts, and no item is marked "Overnight alone: yes".
- **PR:** none
- **Outcome:** Stopped: nothing an unattended run may build.
- **Problems:** none new. The only open PR, [#567](https://github.com/the-kya-project/perch-perfect-plan/pull/567), is unchanged (held, still conflicting with `main` outside the record files, last updated 19:54 UTC). Its review-queue note is already in the 14:53 entry below. No PRs were closed. The clone at `~/.kya-agent/work/agent-run-20261127-1410` has no changes.

### 2026-11-27 13:10 EST · none (nothing to build)
- **Built:** nothing. "Ready to build" in docs/BACKLOG.md (main at 2257a7b) is still empty; 2.5, 1.13b and 1.12 need Brittany before work starts, and no item is marked "Overnight alone: yes".
- **PR:** none
- **Outcome:** Stopped: nothing an unattended run may build.
- **Problems:** none new. The only open PR, [#567](https://github.com/the-kya-project/perch-perfect-plan/pull/567), is unchanged (held, still conflicting with `main` outside the record files, last updated 19:54 UTC). Its review-queue note is already in the 14:53 entry below. No PRs were closed. The clone at `~/.kya-agent/work/agent-run-20261127-1310` has no changes.

### 2026-11-27 12:09 EST · none (nothing to build)
- **Built:** nothing. "Ready to build" in docs/BACKLOG.md (main at 2257a7b) is still empty; 2.5, 1.13b and 1.12 need Brittany before work starts, and no item is marked "Overnight alone: yes".
- **PR:** none
- **Outcome:** Stopped: nothing an unattended run may build.
- **Problems:** none new. The only open PR, [#567](https://github.com/the-kya-project/perch-perfect-plan/pull/567), is unchanged (held, still conflicting with `main` outside the record files, last updated 19:54 UTC). Its review-queue note is already in the 14:53 entry below. No PRs were closed. The clone at `~/.kya-agent/work/agent-run-20261127-1209` has no changes.

### 2026-11-27 11:08 EST · none (nothing to build)
- **Built:** nothing. "Ready to build" in docs/BACKLOG.md (main at 2257a7b) is still empty; 2.5, 1.13b and 1.12 need Brittany before work starts, and no item is marked "Overnight alone: yes".
- **PR:** none
- **Outcome:** Stopped: nothing an unattended run may build.
- **Problems:** none new. The only open PR, [#567](https://github.com/the-kya-project/perch-perfect-plan/pull/567), is unchanged (held, still conflicting with `main` outside the record files, last updated 19:54 UTC). Its review-queue note is already in the 14:53 entry below. No PRs were closed. The clone at `~/.kya-agent/work/agent-run-20261127-1108` has no changes.

### 2026-11-27 10:07 EST · none (nothing to build)
- **Built:** nothing. "Ready to build" in docs/BACKLOG.md (main at 2257a7b) is still empty; 2.5, 1.13b and 1.12 need Brittany before work starts, and no item is marked "Overnight alone: yes".
- **PR:** none
- **Outcome:** Stopped: nothing an unattended run may build.
- **Problems:** none new. The only open PR, [#567](https://github.com/the-kya-project/perch-perfect-plan/pull/567), is unchanged (held, still conflicting with `main` outside the record files, last updated 19:54 UTC). Its review-queue note is already in the 14:53 entry below. No PRs were closed. The clone at `~/.kya-agent/work/agent-run-20261127-1007` has no changes.

### 2026-11-27 09:07 EST · none (nothing to build)
- **Built:** nothing. "Ready to build" in docs/BACKLOG.md (main at 2257a7b) is still empty; 2.5, 1.13b and 1.12 need Brittany before work starts, and no item is marked "Overnight alone: yes".
- **PR:** none
- **Outcome:** Stopped: nothing an unattended run may build.
- **Problems:** none new. The only open PR, [#567](https://github.com/the-kya-project/perch-perfect-plan/pull/567), is unchanged (held, still conflicting with `main` outside the record files, last updated 19:54 UTC). Its review-queue note is already in the 14:53 entry below. No PRs were closed. The clone at `~/.kya-agent/work/agent-run-20261127-0907` has no changes.

### 2026-11-27 08:06 EST · none (nothing to build)
- **Built:** nothing. "Ready to build" in docs/BACKLOG.md (main at 2257a7b) is still empty; 2.5, 1.13b and 1.12 need Brittany before work starts, and no item is marked "Overnight alone: yes".
- **PR:** none
- **Outcome:** Stopped: nothing an unattended run may build.
- **Problems:** none new. The only open PR, [#567](https://github.com/the-kya-project/perch-perfect-plan/pull/567), is unchanged (held, still conflicting with `main` outside the record files, last updated 19:54 UTC). Its review-queue note is already in the 14:53 entry below. No PRs were closed. The clone at `~/.kya-agent/work/agent-run-20261127-0806` has no changes.

### 2026-11-27 07:05 EST · none (nothing to build)
- **Built:** nothing. "Ready to build" in docs/BACKLOG.md (main at 2257a7b) is still empty; 2.5, 1.13b and 1.12 need Brittany before work starts, and no item is marked "Overnight alone: yes".
- **PR:** none
- **Outcome:** Stopped: nothing an unattended run may build.
- **Problems:** none new. The only open PR, [#567](https://github.com/the-kya-project/perch-perfect-plan/pull/567), is unchanged (held, still conflicting with `main` outside the record files, last updated 19:54 UTC). Its review-queue note is already in the 14:53 entry below. No PRs were closed. The clone at `~/.kya-agent/work/agent-run-20261127-0705` has no changes.

### 2026-11-27 06:04 EST · none (nothing to build)
- **Built:** nothing. "Ready to build" in docs/BACKLOG.md (main at 2257a7b) is still empty; 2.5, 1.13b and 1.12 need Brittany before work starts, and no item is marked "Overnight alone: yes".
- **PR:** none
- **Outcome:** Stopped: nothing an unattended run may build.
- **Problems:** none new. The only open PR, [#567](https://github.com/the-kya-project/perch-perfect-plan/pull/567), is unchanged (held, still conflicting with `main` outside the record files, last updated 19:54 UTC). Its review-queue note is already in the 14:53 entry below. No PRs were closed. The clone at `~/.kya-agent/work/agent-run-20261127-0604` has no changes.

### 2026-11-27 05:04 EST · none (nothing to build)
- **Built:** nothing. "Ready to build" in docs/BACKLOG.md (main at 2257a7b) is still empty; 2.5, 1.13b and 1.12 need Brittany before work starts, and no item is marked "Overnight alone: yes".
- **PR:** none
- **Outcome:** Stopped: nothing an unattended run may build.
- **Problems:** none new. The only open PR, [#567](https://github.com/the-kya-project/perch-perfect-plan/pull/567), is unchanged (held, still conflicting with `main` outside the record files, last updated 19:54 UTC). Its review-queue note is already in the 14:53 entry below. No PRs were closed. The clone at `~/.kya-agent/work/agent-run-20261127-0504` has no changes.

### 2026-11-27 04:03 EST · none (nothing to build)
- **Built:** nothing. "Ready to build" in docs/BACKLOG.md (main at 2257a7b) is still empty; 2.5, 1.13b and 1.12 need Brittany before work starts, and no item is marked "Overnight alone: yes".
- **PR:** none
- **Outcome:** Stopped: nothing an unattended run may build.
- **Problems:** none new. The only open PR, [#567](https://github.com/the-kya-project/perch-perfect-plan/pull/567), is unchanged (held, still conflicting with `main` outside the record files, last updated 19:54 UTC). Its review-queue note is already in the 14:53 entry below. No PRs were closed. The clone at `~/.kya-agent/work/agent-run-20261127-0403` has no changes.

### 2026-11-27 03:02 EST · none (nothing to build)
- **Built:** nothing. "Ready to build" in docs/BACKLOG.md (main at 2257a7b) is still empty; 2.5, 1.13b and 1.12 need Brittany before work starts, and no item is marked "Overnight alone: yes".
- **PR:** none
- **Outcome:** Stopped: nothing an unattended run may build.
- **Problems:** none new. The only open PR, [#567](https://github.com/the-kya-project/perch-perfect-plan/pull/567), is unchanged (held, still conflicting with `main` outside the record files, last updated 19:54 UTC). Its review-queue note is already in the 14:53 entry below. No PRs were closed. The clone at `~/.kya-agent/work/agent-run-20261127-0302` has no changes.

### 2026-11-27 02:02 EST · none (nothing to build)
- **Built:** nothing. "Ready to build" in docs/BACKLOG.md (main at 2257a7b) is still empty; 2.5, 1.13b and 1.12 need Brittany before work starts, and no item is marked "Overnight alone: yes".
- **PR:** none
- **Outcome:** Stopped: nothing an unattended run may build.
- **Problems:** none new. The only open PR, [#567](https://github.com/the-kya-project/perch-perfect-plan/pull/567), is unchanged (held, still conflicting with `main` outside the record files, last updated 19:54 UTC). Its review-queue note is already in the 14:53 entry below. No PRs were closed. The clone at `~/.kya-agent/work/agent-run-20261127-0202` has no changes.

### 2026-11-27 01:01 EST · none (nothing to build)
- **Built:** nothing. "Ready to build" in docs/BACKLOG.md (main at 2257a7b) is still empty; 2.5, 1.13b and 1.12 need Brittany before work starts, and no item is marked "Overnight alone: yes".
- **PR:** none
- **Outcome:** Stopped: nothing an unattended run may build.
- **Problems:** none new. The only open PR, [#567](https://github.com/the-kya-project/perch-perfect-plan/pull/567), is unchanged (held, still conflicting with `main` outside the record files, last updated 19:54 UTC). Its review-queue note is already in the 14:53 entry below. No PRs were closed. The clone at `~/.kya-agent/work/agent-run-20261127-0101` has no changes.

### 2026-11-27 00:00 EST · none (nothing to build)
- **Built:** nothing. "Ready to build" in docs/BACKLOG.md (main at 2257a7b) is still empty; 2.5, 1.13b and 1.12 need Brittany before work starts, and no item is marked "Overnight alone: yes".
- **PR:** none
- **Outcome:** Stopped: nothing an unattended run may build.
- **Problems:** none new. The only open PR, [#567](https://github.com/the-kya-project/perch-perfect-plan/pull/567), is unchanged (held, still conflicting with `main` outside the record files, last updated 19:54 UTC). Its review-queue note is already in the 14:53 entry below. No PRs were closed. The clone at `~/.kya-agent/work/agent-run-20261127-0000` has no changes.

### 2026-11-26 22:59 EST · none (nothing to build)
- **Built:** nothing. "Ready to build" in docs/BACKLOG.md (main at 2257a7b) is still empty; 2.5, 1.13b and 1.12 need Brittany before work starts, and no item is marked "Overnight alone: yes".
- **PR:** none
- **Outcome:** Stopped: nothing an unattended run may build.
- **Problems:** none new. The only open PR, [#567](https://github.com/the-kya-project/perch-perfect-plan/pull/567), is unchanged (held, still conflicting with `main` outside the record files, last updated 19:54 UTC). Its review-queue note is already in the 14:53 entry below. No PRs were closed. The clone at `~/.kya-agent/work/agent-run-20261126-2259` has no changes.

### 2026-11-26 21:59 EST · none (nothing to build)
- **Built:** nothing. "Ready to build" in docs/BACKLOG.md (main at 2257a7b) is still empty; 2.5, 1.13b and 1.12 need Brittany before work starts, and no item is marked "Overnight alone: yes".
- **PR:** none
- **Outcome:** Stopped: nothing an unattended run may build.
- **Problems:** none new. The only open PR, [#567](https://github.com/the-kya-project/perch-perfect-plan/pull/567), is unchanged (held, still conflicting with `main` outside the record files, last updated 19:54 UTC). Its review-queue note is already in the 14:53 entry below. No PRs were closed. The clone at `~/.kya-agent/work/agent-run-20261126-2159` has no changes.

### 2026-11-26 20:58 EST · none (nothing to build)
- **Built:** nothing. "Ready to build" in docs/BACKLOG.md (main at 2257a7b) is still empty; 2.5, 1.13b and 1.12 need Brittany before work starts, and no item is marked "Overnight alone: yes".
- **PR:** none
- **Outcome:** Stopped: nothing an unattended run may build.
- **Problems:** none new. The only open PR, [#567](https://github.com/the-kya-project/perch-perfect-plan/pull/567), is unchanged (held, still conflicting with `main` outside the record files, last updated 19:54 UTC). Its review-queue note is already in the 14:53 entry below. No PRs were closed. The clone at `~/.kya-agent/work/agent-run-20261126-2058` has no changes.

### 2026-11-26 19:57 EST · none (nothing to build)
- **Built:** nothing. "Ready to build" in docs/BACKLOG.md (main at 2257a7b) is still empty; 2.5, 1.13b and 1.12 need Brittany before work starts, and no item is marked "Overnight alone: yes".
- **PR:** none
- **Outcome:** Stopped: nothing an unattended run may build.
- **Problems:** none new. The only open PR, [#567](https://github.com/the-kya-project/perch-perfect-plan/pull/567), is unchanged (held, still conflicting with `main` outside the record files, last updated 19:54 UTC). Its review-queue note is already in the 14:53 entry below. No PRs were closed. The clone at `~/.kya-agent/work/agent-run-20261126-1957` has no changes.

### 2026-11-26 18:57 EST · none (nothing to build)
- **Built:** nothing. "Ready to build" in docs/BACKLOG.md (main at 2257a7b) is still empty; 2.5, 1.13b and 1.12 need Brittany before work starts, and no item is marked "Overnight alone: yes".
- **PR:** none
- **Outcome:** Stopped: nothing an unattended run may build.
- **Problems:** none new. The only open PR, [#567](https://github.com/the-kya-project/perch-perfect-plan/pull/567), is unchanged (held, still conflicting with `main` outside the record files, last updated 19:54 UTC). Its review-queue note is already in the 14:53 entry below. No PRs were closed. The clone at `~/.kya-agent/work/agent-run-20261126-1857` has no changes.

### 2026-11-26 17:56 EST · none (nothing to build)
- **Built:** nothing. "Ready to build" in docs/BACKLOG.md (main at 2257a7b) is still empty; 2.5, 1.13b and 1.12 need Brittany before work starts, and no item is marked "Overnight alone: yes".
- **PR:** none
- **Outcome:** Stopped: nothing an unattended run may build.
- **Problems:** none new. The only open PR, [#567](https://github.com/the-kya-project/perch-perfect-plan/pull/567), is unchanged (held, still conflicting with `main` outside the record files, last updated 19:54 UTC). Its review-queue note is already in the 14:53 entry below. No PRs were closed. The clone at `~/.kya-agent/work/agent-run-20261126-1756` has no changes.

### 2026-11-26 16:55 EST · none (nothing to build)
- **Built:** nothing. "Ready to build" in docs/BACKLOG.md (main at 2257a7b) is still empty; 2.5, 1.13b and 1.12 need Brittany before work starts, and no other item is marked "Overnight alone: yes".
- **PR:** none
- **Outcome:** Stopped: nothing an unattended run may build.
- **Problems:** none new. The only open PR, [#567](https://github.com/the-kya-project/perch-perfect-plan/pull/567), is unchanged (held, still conflicting with `main` outside the record files, latest commit 18:36 UTC). Its review-queue note is already in the 14:53 entry below. No PRs were closed. The clone at `~/.kya-agent/work/agent-run-20261126-1655` has no changes.

### 2026-11-26 15:54 EST · none (nothing to build)
- **Built:** nothing. "Ready to build" in docs/BACKLOG.md is still empty; 2.5, 1.13b and 1.12 need Brittany before work starts, and everything else waits on her.
- **PR:** none
- **Outcome:** Stopped: nothing an unattended run may build.
- **Problems:** none new. The only open PR, [#567](https://github.com/the-kya-project/perch-perfect-plan/pull/567), is unchanged since the 14:53 run (held, still conflicting with `main` outside the record files, no new commits). Its review-queue note is already in the 14:53 entry below, so no new comment was left. No PRs were closed. The clone at `~/.kya-agent/work/agent-run-20261126-1554` has no changes.

### 2026-11-26 14:53 EST · none (nothing to build)
- **Built:** nothing. "Ready to build" in docs/BACKLOG.md is empty; every other item needs Brittany before work starts or waits on her.
- **PR:** none
- **Outcome:** Stopped: nothing an unattended run may build.
- **Problems:** open PR check: [#567](https://github.com/the-kya-project/perch-perfect-plan/pull/567) (1.20f, held) now conflicts with `main` outside the record files (`src/components/flock/CommentThread.tsx`, `supabase/checks/flock_posts_checks.sql`, also `CLAUDE.md`), because [#569](https://github.com/the-kya-project/perch-perfect-plan/pull/569) built the same item and merged at 14:17 EST. Left as it is and not closed: #569 doesn't fully replace it (#567 also has the clip viewer's read-only "N comments" link and counts anyone with bird access). Comment left on #567. **For the review queue's "Held for Brittany"** (next run with a PR, add it there): "#567 · 1.20f Co-carers read comments (the second build) · **Needs:** #569 merged the same item, so this conflicts with main. Close it if #569 is what you wanted, or say which parts (the clip viewer's comment link) should go in a new PR."

### 2026-11-26 13:20 EST · 1.16 Rescue partner codes (started by Brittany in a session, not an hourly run)
- **Built:** partner rescues each get one reusable code, with an optional limit. "Have a rescue code?" on the Join screen and the redeem page leads to the code, then the bird's name, species and adoption date, then "being confirmed". An admin approves or declines it on the new Rescue partners page or in the review queue; an approved adopter sees a welcome and gets six months in the Flock, free, from the free season's end (or right away once it has ended). One per account, never with a founding spot, never a payment, no seat counting. Admins add and edit partners and pause codes. All behind the Flock gate (admins only).
- **PR:** [#565](https://github.com/the-kya-project/perch-perfect-plan/pull/565)
- **Outcome:** Held, then merged on Brittany's OK in the session (Nov 26, 2026). Her answer: founding claims stay as they are.
- **Problems:** one existing Flock browser test ("a free account: Community opens the Part of the Flock sheet…") fails on this Mac on a clean `main` too (Today's calls get recorded after joining). This change doesn't cause it; CI is the judge. Docker isn't installed here, so the SQL checks ran in CI ("Database checks").
### 2026-11-26 13:29 EST · 1.20f Co-carers read comments on their bird's journeys (Brittany asked, in a session)
- **Built:** a bird's household (owner or co-carer) can now read the comments on that bird's journeys without being in the Flock, and still can't write, react to or report them. The database change lets them read the comment list, the counts and comment photos; the comment screen shows no box, reaction button, Reply or menu for them. Nobody outside the household gains anything.
- **PR:** [#569](https://github.com/the-kya-project/perch-perfect-plan/pull/569)
- **Outcome:** see the PR.
- **Problems:** none. No local Postgres, so the new SQL check runs only in CI. Free accounts can't reach journey screens in the app yet (noted in the review queue).

### 2026-11-26 13:05 EST · Badge art: final art in place of the stroke icons
- **Built:** Brittany's final badge art now shows wherever Flock badges appear: the Badges screen (color when earned, her gray versions when not), the "Here's what you've already earned" and "Badge earned" cards on Today, and the small pills on member profiles. Journey finisher shows the design for the level reached. The care badges' art (1.13b) is stored in the app, ready for when 1.13b is built; 1.13b itself wasn't started. Badge names, rules, wording and who sees them are unchanged. Interactive session at Brittany's request, in a separate copy (`~/.kya-agent/work/badge-art`), with the lock held for the session.
- **PR:** [#566](https://github.com/the-kya-project/perch-perfect-plan/pull/566); screenshots on the unmerged branch `badge-art-screenshots`
- **Outcome:** Held: Brittany asked to see it before it merges.
- **Problems:** none. All 30 files matched their badges by name and picture. Moved one pending entry (Nov 26, 06:34) in from `~/.kya-agent/pending-log.md`.

### 2026-11-26 06:34 EST · none (nothing to build)
- **Built:** nothing. The only item in "Ready to build" (1.15a Kya's Crew option on the payment screen) already has its held PR, #563; every other item is "Overnight alone: no", waiting on Brittany's spec, or for opening.
- **PR:** none
- **Outcome:** Stopped: nothing this run is allowed to build. Open agent PR check: #563 (held for Brittany, payments) merges cleanly with main and every check passes, so it needed no update; it stays held. No abandoned "In progress" drafts.
- **Problems:** GitHub was unreliable at the start: the first clone and `gh pr list` timed out after 10 minutes, and a second full clone failed partway ("RPC failed; curl 18"). A shallow clone (`--depth 50`) worked. The first, failed clone left an empty copy at `~/.kya-agent/work/agent-run-20261126-0634` (only a `.git` folder, no work in it). The working copy is `~/.kya-agent/work/agent-run-20261126-0705`, unchanged. Neither one holds any work.

### 2026-11-25 09:42 EST · Housekeeping: #563 brought up to date with `main`
- **Built:** nothing new. The only item in "Ready to build", 1.15a, already has its held PR (#563), so there was nothing else this run may build. #563 conflicted with `main` only in the three record files (after #562 merged), so this run merged `main` into its branch and kept both sides: 1.15a and 1.20e both stay in "Done" (and "Ready to build" is now empty), both runs' log entries, and both PRs' decisions in the review queue. No code changed.
- **PR:** [#563](https://github.com/the-kya-project/perch-perfect-plan/pull/563) (pushed to its branch; still held)
- **Outcome:** Held, unchanged: #563 still needs Brittany (payments). Its checks run again on the push.
- **Problems:** none. No lock at start, pending log empty, no abandoned drafts.

### 2026-11-25 08:23 EST · 1.20e Journeys redesign: tests and docs
- **Built:** the last part of the Journeys redesign, and nothing anyone can see changes. A new database check proves the redesign's three promises end to end: a free account can start every one of the 14 skills (privately) but never sees anything from the community, through any screen's data; Diet conversion pauses exactly the same whether or not a journey has the old milestones; and a "Just me" journey never reaches anyone outside the bird's household, admins included. The test copy of the skills now uses the new draft descriptions and safety notes, the app tests no longer pretend milestones exist for new journeys, and the Flock's analytics events describe the new design (a journey started from a member's skill, an update and whether it was a big moment, and which way a journey ended; the milestone event is retired). CLAUDE.md's Journeys section is rewritten for skills, not milestones. Interactive cloud session run the hourly way, at Brittany's request.
- **PR:** [#562](https://github.com/the-kya-project/perch-perfect-plan/pull/562)
- **Outcome:** Merged once every required check passed (database checks, iPhone hydration, Free-user regression, clip playback, no Google Fonts). Merge rules: tests, docs and analytics properties only; nothing current users see changes.
- **Problems:** This ran in a cloud container, not on the Mac, so `~/.kya-agent/lock` and `~/.kya-agent/pending-log.md` couldn't be seen; there was no lock here and no open PR on GitHub, so nothing else was running that this could collide with. `prod-read` isn't available here either, so production wasn't read; nothing in this PR depends on production state (it changes tests, docs and analytics properties only). `npm ci` needed `--ignore-scripts` (the PostHog CLI download is blocked here). The database checks were run locally against a throwaway Supabase database (all 49 files pass), and the new check was mutation-tested: leaking a private journey, opening community content to free accounts and changing the pause threshold each make it fail. No open agent PRs at the start.

### 2026-11-25 08:08 EST · 1.15a Kya's Crew option on the payment screen
- **Built:** Kya's Crew on the Membership card step, from the approved mockups. Under "Pick your membership", the Flock's Yearly and Monthly tiles come first, then a Kya's Crew box with its benefits and two tiles, Crew yearly ($37/mo, $444 once a year, "Save $96") and Crew monthly ($45/mo). Picking Crew changes the giving panel to 25%, adds the rescue-adopter line under "What your membership keeps", and the button says "Join Kya's Crew · $0 today". When the last 48 hours of the free season mean Checkout only saves the card, its sentence now says "Kya's Crew, $444 a year…" instead of "The Flock…". Membership and "You're all set" name the Crew plan and say 25%. Crew only shows when both Crew prices are set, so nothing changes in a deployment without them. All of it is behind `BILLING_ENABLED` (off) and Stripe test mode, web only. English only; Dutch waits for Brittany's read.
- **PR:** [#563](https://github.com/the-kya-project/perch-perfect-plan/pull/563)
- **Outcome:** Held: payments. Needs Brittany's approval of the screens and copy, and one question: should founders whose founding price is open also be offered Crew (no mockup shows it, so their screen is unchanged)?
- **Problems:** none. No lock at start. The only open PR was #562 (1.20e draft, opened 5 minutes before this run on a `claude/` branch), which isn't abandoned, so 1.20e was left alone and this run took 1.15a. `npx tsc` reports an error in `e2e/helpers.ts` and Prettier flags `BillingScreens.tsx` and `billing.ts`; both are the same on `main` without this change. Moved the pending log's entries (Nov 24 23:01 to Nov 25 07:07) in here.

### 2026-11-25 07:10 EST · 1.15a Kya's Crew option on the payment screen (backlog move)
- **Built:** moved 1.15a from "Needs Brittany before work starts" to "Ready to build", below 1.20, at Brittany's request now that the mockup is approved. Docs only; the item is still built to a held PR because it's payments. Interactive session, not an hourly run.
- **PR:** [#561](https://github.com/the-kya-project/perch-perfect-plan/pull/561)
- **Outcome:** Merged once its checks passed (Brittany approved it in the session).
- **Problems:** none.

### 2026-11-25 07:07 EST · none (nothing to build)
- **Built:** nothing. On `main` (now at #557), the only "Ready to build" items are 1.20d (open PR #560, held for Brittany) and 1.20e (depends on 1.20d being merged). 1.15a is still under "Needs Brittany before work starts" on `main`; Brittany's PR #561 moves it to "Ready to build" but isn't merged yet, so a later run can pick it up once it is.
- **PR:** none
- **Outcome:** Stopped: nothing in the backlog this run is allowed to build.
- **Problems:** none. No lock at start. #557 (1.11 follow-up) has merged. Open PRs checked: #560 (1.20d) is held; Brittany's own session pushed "Merge main into 1.20d; apply Brittany's answers" at 12:06 UTC and its checks are re-running, so it's left alone. #561 is Brittany's docs PR, not an agent PR, so it's left alone. No drafts to close. The copy `agent-run-20261125-0707` has no changes.

### 2026-11-25 07:06 EST · 1.20d Journeys redesign: Diet conversion rework (Brittany's answers)
- **Built:** Brittany's answers to #560's two questions. A first week with no weigh-ins still leaves the starting weight unset (no change). The safeguard sentence "For Flock members, this uses the bird's own baseline alerts." is removed; "The template suggests a vet check before starting…" stays. Her decisions are in the review queue. Brought the branch up to date with `main` (only the review queue conflicted: both held entries, #557 and #560, are cleared by her approval). Interactive session, not an hourly run.
- **PR:** [#560](https://github.com/the-kya-project/perch-perfect-plan/pull/560)
- **Outcome:** Merged once every required check passed (Brittany approved it in the session). The eclectus alert stays off.
- **Problems:** none.

### 2026-11-25 06:07 EST · none (nothing to build)
- **Built:** nothing. Unchanged since the 05:06 run: the only "Ready to build" items are 1.20d (open PR #560, held for Brittany) and 1.20e (depends on 1.20d being merged). 1.15a sits under "Needs Brittany before work starts".
- **PR:** none
- **Outcome:** Stopped: nothing in the backlog this run is allowed to build.
- **Problems:** none. No lock at start. `main` is still at #559. Open agent PRs checked: #560 (1.20d) and #557 (1.11 follow-up), both held, every required check passing, merge state clean, no comments or reviews from Brittany, so both left as they are. No drafts to close. The copy `agent-run-20261125-0607` has no changes.

### 2026-11-25 05:06 EST · none (nothing to build)
- **Built:** nothing. Unchanged since the 04:05 run: the only "Ready to build" items are 1.20d (open PR #560, held for Brittany) and 1.20e (depends on 1.20d being merged). 1.15a sits under "Needs Brittany before work starts".
- **PR:** none
- **Outcome:** Stopped: nothing in the backlog this run is allowed to build.
- **Problems:** none. No lock at start. `main` is still at #559. Open agent PRs checked: #560 (1.20d) and #557 (1.11 follow-up), both held, every required check passing, merge state clean, no comments or reviews from Brittany, so both left as they are. No drafts to close. The copy `agent-run-20261125-0506` has no changes.

### 2026-11-25 04:05 EST · none (nothing to build)
- **Built:** nothing. Unchanged since the 03:04 run: the only "Ready to build" items are 1.20d (open PR #560, held for Brittany) and 1.20e (depends on 1.20d being merged). 1.15a sits under "Needs Brittany before work starts".
- **PR:** none
- **Outcome:** Stopped: nothing in the backlog this run is allowed to build.
- **Problems:** none. No lock at start. `main` is still at #559. Open agent PRs checked: #560 (1.20d) and #557 (1.11 follow-up), both held, every required check passing, merge state clean, no comments or reviews from Brittany, so both left as they are. No drafts to close. The copy `agent-run-20261125-0405` has no changes.

### 2026-11-25 03:04 EST · none (nothing to build)
- **Built:** nothing. Unchanged since the 02:03 run: the only "Ready to build" items are 1.20d (open PR #560, held for Brittany) and 1.20e (depends on 1.20d being merged). 1.15a sits under "Needs Brittany before work starts".
- **PR:** none
- **Outcome:** Stopped: nothing in the backlog this run is allowed to build.
- **Problems:** none. No lock at start. `main` is still at #559. Open agent PRs checked: #560 (1.20d) and #557 (1.11 follow-up), both held, every required check passing, merge state clean, no comments or reviews from Brittany, so both left as they are. No drafts to close. The copy `agent-run-20261125-0304` has no changes.

### 2026-11-25 02:03 EST · none (nothing to build)
- **Built:** nothing. Unchanged since the 01:03 run: the only "Ready to build" items are 1.20d (open PR #560, held for Brittany) and 1.20e (depends on 1.20d being merged). 1.15a sits under "Needs Brittany before work starts".
- **PR:** none
- **Outcome:** Stopped: nothing in the backlog this run is allowed to build.
- **Problems:** none. No lock at start. `main` is still at #559. Open agent PRs checked: #560 (1.20d) and #557 (1.11 follow-up), both held, every required check passing, merge state clean, no new comments from Brittany, so both left as they are. No drafts to close. The copy `agent-run-20261125-0203` has no changes.

### 2026-11-25 01:03 EST · none (nothing to build)
- **Built:** nothing. Unchanged since the 00:02 run: the only "Ready to build" items are 1.20d (open PR #560, held for Brittany) and 1.20e (depends on 1.20d being merged). 1.15a sits under "Needs Brittany before work starts".
- **PR:** none
- **Outcome:** Stopped: nothing in the backlog this run is allowed to build.
- **Problems:** none. No lock at start. `main` is at #559. Open agent PRs checked: #560 (1.20d) and #557 (1.11 follow-up), both held, every required check passing, merge state clean, so both left as they are. No drafts to close. The copy `agent-run-20261125-0103` has no changes.

### 2026-11-25 00:02 EST · none (nothing to build)
- **Built:** nothing. Same as the 23:01 run: the only "Ready to build" items are 1.20d, which has an open PR (#560, held for Brittany), and 1.20e, which depends on 1.20d being merged. 1.15a sits under "Needs Brittany before work starts", which runs never start.
- **PR:** none
- **Outcome:** Stopped: nothing in the backlog this run is allowed to build.
- **Problems:** none. No lock at start. `main` now includes #559 (1.20c). Open agent PRs checked: #560 (1.20d) and #557 (1.11 follow-up), both held, every required check passing, merge state clean against `main`, so both left as they are. No drafts to close. The copy `agent-run-20261125-0002` has no changes.

### 2026-11-24 23:01 EST · none (nothing to build)
- **Built:** nothing. The only "Ready to build" items are 1.20d, which already has an open PR (#560, held for Brittany), and 1.20e, which depends on 1.20d being merged. 1.15a is marked "Overnight alone: yes" but sits under "Needs Brittany before work starts", which runs never start; moving it to "Ready to build" would let a run build it to a held PR.
- **PR:** none
- **Outcome:** Stopped: nothing in the backlog this run is allowed to build.
- **Problems:** none. No lock at start; the pending log was empty. Open agent PRs checked: #560 (1.20d) and #557 (1.11 follow-up), both held, every required check passing, no conflicts with `main`, so both left as they are. No drafts to close. The copy `agent-run-20261124-2301` has no changes.

### 2026-11-24 21:29 EST · 1.20d Journeys redesign: Diet conversion rework
- **Built:** Diet conversion no longer depends on milestones, and it's still switched off with the rest of journeys (production has journeys off, and the Flock is closed to members). The starting weight is now worked out from the journey itself: the average of the weigh-ins in the first week after it starts, the same week milestone 1 used to measure. The weight rules use it with every number and rule unchanged, and the "Weigh [Bird] today" reminder counts from the same start. The "Have you had a chance to check in with your avian vet?" reminder now shows once that starting weight is set. Before this, new journeys had no milestones, so it could never show. The eclectus alert is built and sits above the vet card for an eclectus. It's behind a new health switch that starts off, and stays off until a vet approves the wording. Birds with no species never see it. Lories and lorikeets are still blocked, and the journey still finishes as "[Bird] is on the new diet" with no known skill added. One safeguard line that said "every step" now says "the whole journey".
- **PR:** [#560](https://github.com/the-kya-project/perch-perfect-plan/pull/560)
- **Outcome:** Held: health content and the vet packet, as the item says. The PR asks two questions: what to do when there are no weigh-ins in the first week, and whether to reword two other safeguard lines that are out of date. See "Held for Brittany".
- **Problems:** A scripted edit (Python) was refused by the job and was made in the editor instead. `npm run i18n:extract` isn't allowed, so the English catalog was edited by hand until `npm run i18n:check` passed. `npx tsc` reports the same `e2e/helpers.ts` error that `main` has. One `prod-read` call chained after another command was refused ("connection file is missing"); run on its own, it worked. At the start: no lock; one pending-log entry (moved below); one open agent PR, #557, held with every check passing and no conflicts, so it was left as it is. Production read-only: 0 Diet conversion journeys, 2 journeys in all.

### 2026-11-24 20:28 EST · 1.20c Journeys redesign: member skills (after the merge)
- **Built:** nothing more. This follows up on the 19:46 EST entry for 1.20c (#559).
- **PR:** [#559](https://github.com/the-kya-project/perch-perfect-plan/pull/559)
- **Outcome:** Merged (squash, 01:27 UTC) once every required check passed. "Supabase Preview" was skipped, as it was on #554. Production read-only check: `20261125010000_journeys_member_skills.sql` was applied on merge (`journey_member_skills` exists).
- **Problems:** **Staging doesn't have the migration yet.** The "Staging migrations" run for #559 (run 45525943672) failed before touching the database: setting up the Supabase CLI hit "Failed to resolve latest Supabase CLI release: rate limit exceeded". This run's `gh run rerun` was refused by the job, so it needs a re-run by hand (Actions → Staging migrations → Re-run, or Run workflow on `main`). Until then, previews on staging lack the 1.20c functions, and a preview's "Skills from the Flock" screen errors. The copy `agent-run-20261124-1946` has nothing uncommitted or unpushed.

### 2026-11-24 19:46 EST · 1.20c Journeys redesign: member skills
- **Built:** member skills, switched off with the rest of journeys (production has journeys off, and the Flock is closed to members). "Your own skill" now asks only for a name and, if you like, a few lines on what it looks like. There are no steps. If the name is one of the 14 skills, it offers that skill instead. Flock members get "Skills from the Flock" on Pick a skill: other members' own skills that are shared with the community and have at least one update, with a search box. Each one is labeled "Member-supplied journey", with a line saying a member shared it and The Kya Project hasn't reviewed it. The label shows wherever someone else's own skill appears. "Start this skill" copies it for your bird, and the copy says "Started from [bird]'s journey" while the original is still visible. Members can report a member skill. Reports reach the review queue like posts: at the report threshold it's hidden from everyone but its household, and reviewers can keep it, message the member or remove it. Blocked people and lapsed members' skills never show. A migration adds the new reads and the start function, and teaches the existing report, review and notification functions about member skills. It also hides a hidden member skill from the community. Every change is Flock-only and patched from the live definitions.
- **PR:** [#559](https://github.com/the-kya-project/perch-perfect-plan/pull/559)
- **Outcome:** see the PR. Merged once every required check passed, or waiting on checks if they're still running when the run ends. The copy is in the review queue for your read, English only, "Member-supplied journey" especially.
- **Problems:** The first database check run caught a variable in the new check file that shared a column's name (the migration itself applied cleanly, and every other check passed); fixed. `npm run i18n:extract` isn't one of the commands the job allows, so the English catalog was edited by hand until `npm run i18n:check` passed. `npx tsc` reports one error in `e2e/helpers.ts`, and `main` has the same error. At the start: no lock, nothing in the pending log, and one open agent PR, #557, held with every check passing and no conflicts, so it was left as it is. Production read-only: `members_open` off, no opening day, journeys `off`.

### 2026-11-24 17:52 EST · 1.11 Buddy pods follow-up: no buddy groups, stage pills (Brittany asked, in a session)
- **Built:** applied Brittany's Nov 24 decisions to buddy pods, and brought them in line with the Journeys redesign (1.20a). A pod now just closes once everyone has finished or left, with no "Keep going together?" and no buddy groups. The members card shows a pill (Working on it / Learned it / Happy where we are, or "Journey kept private") instead of a progress bar. "Happy where we are" counts as finished. Finishing counts as activity for the 3-week rule. The closed-pod card links back to the old pod. #548 had already merged (its migration ran on production), so this is a new migration that changes the live tables and functions, not an edit of the old file.
- **PR:** [#557](https://github.com/the-kya-project/perch-perfect-plan/pull/557)
- **Outcome:** Held: Brittany's copy read and merge.
- **Problems:** the request was to update #548 in place, but #548 merged at 5:22 PM EST before work started; Brittany confirmed a new PR. No local Postgres, so the database checks run only in CI. #554 then merged a migration with the same timestamp (`20261124230000_journeys_screens.sql`), so this PR's migration was renamed to `20261124235900_flock_pods_no_groups.sql`; the two don't touch the same functions.

### 2026-11-24 17:03 EST · 1.20b Journeys redesign: screens
- **Built:** the new journey screens, switched off with the rest of journeys (production has journeys off for everyone, and the Flock is closed to members). The Journeys tab shows your journeys first (going, then finished), "Start something new", and other members' journeys under "From the Flock". Pick a skill lists all 14 in four groups with no Flock-only locks, and says when the bird already knows one. A skill's page has its description, safety notes and "How others did it" (tips and other members' journeys; a free account gets the "Part of the Flock" sheet instead), then only how often and who sees it. The journey page counts days instead of steps, folds the skill's notes under the header and has "[Bird] learned it!". Posting has "This was a big moment" and "Ask the Flock", runs the vet nudge on every caption, and no longer asks a milestone question. Today's journey cards are big moments and finishes, and the rings show the latest clip and the day. Share cards come from a big moment. Journey challenges no longer count milestones. A small migration adds the reads these screens need (new functions only, plus the challenge count).
- **PR:** [#554](https://github.com/the-kya-project/perch-perfect-plan/pull/554)
- **Outcome:** Merged once every required check passed (hidden behind `journeys_enabled()` and the Flock gate; the copy is in the review queue for your read, English only).
- **Problems:** At the start, #548 (held) was mergeable with checks running and #553 was a session's docs PR, so neither was touched; both merged during the run, which left this PR conflicting. Merged `main` in: the journey page and setup screen keep both the new design and buddy pods' cards, and the record files keep both sides. Buddy pods still count milestones for a member's progress (in the review queue). After that merge, "Database checks" failed in `flock_pods_checks.sql` (a pods check that failed the same way on other branches built on `main`); `main`'s #555 fixed it, so `main` was merged in again. The first database check run caught a missing alias in the new check file (the migration itself applied cleanly); fixed. Two scripted edits (Python) were refused by the job and were made in the editor instead. Production read-only: `members_open` off, no opening day, journeys `off`, 2 journeys. No lock at start; nothing in the pending log. The copy `agent-run-20261124-1703` has nothing uncommitted or unpushed once this PR is pushed.

### 2026-11-24 · 1.12 Flock insights: Brittany's diet conversion decision recorded (Brittany asked, in a session)
- **Built:** nothing in code. Recorded Brittany's decision in `docs/BACKLOG.md` (item 1.12) and `docs/REVIEW_QUEUE.md` (the #506 "1.12 Flock insights" entry): diet conversion shows no typical length anywhere (no number, range or "usually takes" line), because it could read as health guidance. No code, migrations or existing `typical_length` data changed.
- **PR:** [#553](https://github.com/the-kya-project/perch-perfect-plan/pull/553)
- **Outcome:** Merged once every required check passed.
- **Problems:** `main` moved while checks ran; merged it into the branch (only `docs/agent-log.md` conflicted, both entries kept) and waited for the checks again.

### 2026-11-24 16:41 EST · 1.20a Journeys redesign: data and migration: brought up to date and merged (Brittany asked, in a session)
- **Built:** merged `main` (with #533, #543, #547 and #551) into #552. Only the three record files conflicted, and both sides' entries were kept. Recorded Brittany's approval of the migration. Removed #552's item from "Held for Brittany", since she has answered it, and #533's, which `main` had already cleared when it merged. None of `main`'s new migrations redefine a journey function. Challenge progress still counts milestones; that's already noted for 1.20b.
- **PR:** [#552](https://github.com/the-kya-project/perch-perfect-plan/pull/552)
- **Outcome:** merged once every required check passed on the latest commit.
- **Problems:** none.

### 2026-11-24 15:00 EST · 1.11 Buddy pods: brought up to date with `main` (Brittany asked, in a session)
- **Built:** merged `main` into #548. Kept both #547's challenges and #548's pods everywhere they meet: the post composer (a pod check-in or a challenge entry), the space labels and types (`pod` in `PostSpace`, `challenge` in `PostRowSpace`), the new-post redirect, and both sets of tests. The two migrations stack: both patch post visibility and Today's feed from their live definitions with different anchors, and #548 rebuilds the space check from its live definition, so `challenge` stays.
- **PR:** [#548](https://github.com/the-kya-project/perch-perfect-plan/pull/548)
- **Outcome:** held for Brittany, as before. Not merged.
- **Problems:** none.

### 2026-11-24 14:30 EST · 1.17 Promo codes: brought up to date and merged (Brittany asked, in a session)
- **Built:** merged `main` (with 1.14a, #533, and Kya's Crew, #535) into #543. Took `main`'s billing code and put #543's promotion-code rule back on top: the code field on the subscription Checkout only (not the save-the-card one), for the Flock plans and Crew, never the founding price, and the webhook's founding-discount removal. Added tests that Crew gets the field. Recorded Brittany's approval and added the promo-code test checkouts to "Before billing opens".
- **PR:** [#543](https://github.com/the-kya-project/perch-perfect-plan/pull/543)
- **Outcome:** merged switched off once every required check passed.
- **Problems:** none.

### 2026-11-24 13:40 EST · 1.14a Card step and checkout design: brought up to date and merged (Brittany asked, in a session)
- **Built:** merged `main` into #533. Kept both sides: #535's Kya's Crew plans and giving rate with #533's screens, branded Checkout and Dutch. The yearly save-the-card note now covers Crew annual too. Recorded Brittany's approval and added the "Before billing opens" checklist to the backlog. Cleared the merged #535, #549, #547 and #533 entries from "Held for Brittany".
- **PR:** [#533](https://github.com/the-kya-project/perch-perfect-plan/pull/533)
- **Outcome:** merged switched off once every required check passed.
- **Problems:** none.

### 2026-11-24 13:12 EST · 1.20a Journeys redesign: data and migration
- **Built:** the database side of the journeys redesign, switched off with the rest of journeys (admins only). The 14 skills' text is rewritten as drafts from the spec: a short description of the behavior, the safety notes (nail trims' unchanged), no tips, and diet conversion's five protective lines moved into its safety notes. Every skill can now be started by any account, including the seven that were Flock-only. New journeys get no milestones; your own skill needs only a name, with an optional description. A new finish step ends a journey as "learned it" (adds the skill, except diet conversion) or "we're happy where we are". Updates can be marked as a big moment. There's room for a short video per skill and for "started from another member's journey" (1.20c). The two journeys in production keep everything and carry on. Diet conversion's weight pause works exactly as before.
- **PR:** [#552](https://github.com/the-kya-project/perch-perfect-plan/pull/552)
- **Outcome:** Held: it changes existing journey functions and the template rows (your approval, Flock safety rule), and the template text needs your copy read. Best merged just before 1.20b and 1.20d (see the review queue).
- **Problems:** At the start, #549 had merged, so #548 (1.11) conflicted with `main` in the three record files only. Merged `main` into it in a separate copy (`update-548-1312`), kept both sides (1.11 stays in Done, the new 1.20 items and every review-queue and log entry kept, log entries in time order) and pushed; GitHub accepted it and #548 is mergeable again, with its checks re-running. #543 still conflicts in code (already noted in the review queue). #547 and #533 are mergeable. During the run, Brittany merged #547 (1.10). That left #552 conflicting in the record files: merged `main` in, kept both sides, and the checks ran again. It also left #548 conflicting in code (posts code, tests, the Flock shell test), so the merge was cancelled before any commit and #548 is in the review queue under "Held for Brittany". #551 isn't an agent PR. No drafts to close and nothing waiting on checks. Production read-only: `members_open` off, no opening day; 14 templates, all draft. The database checks can't run on this machine, so CI ran them. The first push (migration only) applied cleanly, and only the old journey checks failed. With those updated, every database check passed, as did the Free-user regression. Two shell commands (a `sed`/`awk` pipeline and a file rewrite through `$TMPDIR`) were refused; those edits were made in the editor. No lock at start. Moved two pending-log entries (07:27 and 12:10 EST) below. The copies `agent-run-20261124-1312` and `update-548-1312` have nothing uncommitted or unpushed, so the job can remove them.
### 2026-11-24 · 1.10 Challenges: Brittany's decisions recorded, branch updated, merged (Brittany asked, in a session)
- **Built:** nothing new in code. Recorded Brittany's decisions on #547 in `docs/REVIEW_QUEUE.md` and `docs/BACKLOG.md`: the unmocked screens and copy approved, no clips for now (new item 1.10a under "Later"), an entry still needs a few words with a photo, and journey challenges stay (a note for 1.20b: no milestone progress in the new design; finished when the journey ends with "learned it" before the end date). Merged `main` into the branch (no force-push); only the three record files conflicted, and both sides' entries were kept. #547's "Held for Brittany" item was removed, since she has answered it.
- **PR:** [#547](https://github.com/the-kya-project/perch-perfect-plan/pull/547)
- **Outcome:** Merged once every required check passed on the latest commit (Brittany approved the migration).
- **Problems:** Item 1.20b exists only in open PR #550, not on `main`, so the note sits next to 1.11 in "Ready to build" until #550 merges and it can move into 1.20b. #548 was left as it is.

### 2026-11-24 12:35 EST · D1.2 update: brought #549 up to date with `main` (Brittany asked, in a session)
- **Built:** nothing new. Merged `main` into the branch (a merge, no force-push) after Brittany merged #540. Two conflicts, resolved by keeping both sides. In `CLAUDE.md`, #540's "Health rules and switches" line was kept word for word, with #549's "Weight baseline" line after it. In `src/lib/healthRules.ts`, #540's `emergencyGuides: approved(` was kept along with #549's new `weightBaseline: draft(` wording entry. Checked after the merge: compared with `main`, `healthRules.ts` and `healthFeatures.ts` differ only by #549's weight baseline additions. Every one of them is `draft(...)`, and `weight_baseline` still starts `off`. #540's "approved by Brittany" labels and the narrowed vet review are unchanged. The record files merged with no conflict and both sides' entries are kept. `src/routeTree.gen.ts` didn't conflict.
- **PR:** [#549](https://github.com/the-kya-project/perch-perfect-plan/pull/549)
- **Outcome:** Still held for Brittany. Locally, `test:weight-baseline`, `test:health-rules`, `test:today-card`, `i18n:check` and `build` all pass. All required CI checks pass. "Database checks" applied `20261124110000_weight_baseline_shadow.sql` and ran `weight_baseline_shadow_checks.sql` for the first time: 16 passed, 0 failed.
- **Problems:** "Supabase Preview" skipped ("This git branch is not associated with any Supabase Branch"), on the original commit too. It's not the quota: production has only `main` and `staging`. Supabase never made a preview branch for this PR, and #535 had the same problem, so the migration hasn't been run on a preview branch. Raised with Brittany.

### 2026-11-24 12:10 EST · none: nothing free to build; #548's Free-user regression failed after the main merge
- **Built:** nothing. All four "Ready to build" items still have open PRs: D1.2 (#549), 1.17 (#543), 1.10 (#547) and 1.11 (#548). Every other item needs Brittany first or comes later. No drafts, so nothing was closed. None of the open agent PRs was "waiting on checks", and all of them are held, so none was merged. #548's "Free-user regression" failed on bd2fc2a, the 07:27 run's merge of `main`. Its first step timed out signing in to staging (`e2e/free-user/helpers.ts:107`), so the other 11 steps didn't run. Every other check passed. #547 passed the same check after the same `main` merge, so it looks like a flaky staging sign-in. This run left a comment on #548 asking for the failed job (run 45394089632) to be re-run.
- **PR:** none
- **Outcome:** Stopped: nothing in the backlog this run may build.
- **Problems:** `gh run rerun` was refused, so the failed check couldn't be re-run. The first `gh pr comment` failed with a certificate error, probably because of backticks in the body; it worked on the second try without them. The saved output of `gh run view --log-failed` is in a folder this run can't read, and `gh` with `>` redirection fails with a certificate error, so the failure was read from `gh run view --job`. No lock at start. The copy `agent-run-20261124-1210` has nothing uncommitted or unpushed, so the job can remove it.

### 2026-11-24 07:27 EST · none: nothing free to build; record merges for #547 and #548
- **Built:** nothing new. All four "Ready to build" items already have open PRs: D1.2 (#549), 1.17 (#543), 1.10 (#547) and 1.11 (#548). Every other item needs Brittany first or comes later. This run went through the open agent PRs first. #547 (1.10) and #548 (1.11) conflicted with `main` only in `docs/BACKLOG.md` and `docs/REVIEW_QUEUE.md`. In a separate copy, this run merged `main` into each, kept both sides' entries (the Done lines for 1.10/1.11 and 1.15, the D1.2 decisions, and every "Held for Brittany" note), and pushed so their checks run again. Those merges brought in `main`'s `.github/workflows` changes (`free-user-regression.yml`, `hydration.yml`), and GitHub accepted both pushes. So the 05:46 run's review-queue note on #549, which says the runs' token can't push these and asks for "Update branch" on each, no longer applies. #533 (1.14a) and #543 (1.17) still conflict in code (`src/lib/billing*.ts`, `scripts/billing.test.ts`, `src/locales/en.jsonc`). They were left as they are, since the review queue on #547 and #549 already notes the reason. #540 is on a `docs/` branch, not an agent's, so it was left alone. #549 is held and mergeable. No drafts, so nothing was closed; nothing was waiting on checks.
- **PR:** none
- **Outcome:** Stopped: nothing in the backlog this run may build.
- **Problems:** Shell loops and chained `git` commands were refused, so commands ran one at a time. A first conflict check read the wrong branch (`FETCH_HEAD`), so this run briefly started merging `main` into #533 in a separate copy (`~/.kya-agent/work/update-533`). It cancelled that merge before committing or pushing anything, and that copy is clean. No lock at start. The copies `agent-run-20261124-0727`, `update-533`, `update-547` and `update-548` have nothing uncommitted or unpushed, so the job can remove them.

### 2026-11-24 05:46 EST · D1.2 Weight baseline on the weight page, in shadow mode
- **Built:** the weight baseline, switched off. With the `weight_baseline` health switch set to `admins` (your account only), the weight page shows the bird's usual range for the latest kind of weigh-in, or how far along "still learning" is. It shows a one-time "We've learned [Bird]'s usual weight" card and at most one alert card, all observational, with no "call your vet". Your Nov 23 decisions are in the rules file as drafts. Each bird gets its own levels from its usual wobble, with your limits. A re-weigh counts within 10 days, and "keep an eye on this" looks back 14 days. There's a separate sudden-drop alert (10%, or 7% under 100 g). Owners get an optional "Ideal weight range" field on the weight page, which only quiets the two lower alerts and their "weigh again", and appears nowhere else. Separately, for every bird whatever the switch says, an hourly job writes what the baseline would have said about each new weigh-in, with and without the ideal range, to a table only the service role can read. Nothing is shown or sent to anyone else.
- **PR:** [#549](https://github.com/the-kya-project/perch-perfect-plan/pull/549)
- **Outcome:** Held: health wording for your read and the vet packet, your approval of the migration (two new tables, one function, one hourly job; merging applies it to production and starts the shadow log), and your merge.
- **Problems:** At the start, #537 (your replay read) had merged, so D1.2 was the highest item it could take. All four open agent PRs conflict with `main` now. #547 and #548 conflict only in the record files, but merging `main` into them would bring in two workflow changes (#538, #545) that the runs' token can't push, so both were left as they are and noted in the review queue. #543 and #533 conflict in the billing code since 1.15 merged, also noted. No drafts to close, no PR waiting on checks. `npm run i18n:extract` isn't allowed, so the English lines were added by hand. `i18n:check` first failed on key order (it sorts like `localeCompare`), then passed once fixed. `npx tsc` reports only the known `e2e/helpers.ts` error. The database check can't run on this machine, so CI runs it first. Two commands with a Python edit and a chained `npm run` were refused; those steps were redone one at a time. Production checked read-only: 1 admin, `members_open` off. No lock at the start. Moved two pending-log entries (03:44 and 04:45 EST) below.

### 2026-11-24 04:45 EST · none: nothing this run could build
- **Built:** nothing. Same as the 03:44 run. D1.2 still waits for Brittany's replay read: #537 is unmerged, with no new comments or reviews since Nov 23 21:55 UTC. 1.15, 1.17, 1.10 and 1.11 already have open PRs (#535, #543, #547, #548). Every other item needs Brittany or comes later.
- **PR:** none
- **Outcome:** Stopped: nothing it was allowed to build.
- **Problems:** No open PRs are drafts, so none were eligible to close. No agent PR was waiting on checks. #535 and #543 are held and still have red or cancelled required checks. #533, #537 and #539 conflict with main. Nothing was merged or closed. No lock at the start. The run's copy (`~/.kya-agent/work/agent-20261124-0445`) has no changes, so the job can remove it.

### 2026-11-24 03:44 EST · none: nothing this run could build
- **Built:** nothing. Every item in "Ready to build" was blocked. D1.2 still waits for Brittany to merge #537 (her replay read). 1.15, 1.17, 1.10 and 1.11 already have open PRs (#535, #543, #547, #548).
- **PR:** none
- **Outcome:** Stopped: nothing it was allowed to build.
- **Problems:** The start-of-run check of open agent PRs found nothing new. #547 and #548 are held, green and conflict-free. #533 (1.14a) still conflicts outside the record files. #543 (1.17) and #535 (1.15) still have red or cancelled Free-user regression / iPhone hydration runs. #548's branch already notes all three in its review queue, so no new note was added. No PR had been waiting on checks and no "In progress" drafts were open, so nothing was merged or closed. No lock at the start. The run's copy (`~/.kya-agent/work/agent-20261124-0344`) has no changes, so the job can remove it.

### 2026-11-24 01:52 EST · 1.11 Buddy pods
- **Built:** Buddy pods: small groups of 3 to 6 members working on the same journey. When a member starts a journey, a new box offers "Pair me with buddies working on this too." Their journey then shows "We're finding your buddies" with how many are waiting and "Leave the waitlist". As soon as they can be matched, they join an open pod on the same journey with room (their own chapter's first), or a new pod forms once 3 people are waiting (from their chapter when 3 there are). People who've blocked each other are never put together, and nobody is in more than 2 pods at once. The pod page follows the mockup: everyone's name, photo, bird and a progress bar (never progress from a "Just me" journey outside the household), a weekly "How did step up go?" card with Check in, the pod's own feed of posts only its members see (reactions, comments, reports, blocks and photos work as they do for posts, and pod posts never show on Today), and a quiet Leave pod. A member who finishes sees "You finished!" and can stay to cheer or leave. When everyone has finished or left, those still there are asked "Keep going together?"; with 2 or more yeses it carries on as a buddy group with the same weekly card. Every hour a database job closes finished pods, settles that question after 7 days, closes pods that have been quiet for 3 weeks (members who haven't finished are offered a new pod), and matches anyone still waiting. Admins have a Buddy pods screen (Flock settings → Buddy pods → Manage pods): who's waiting on each journey, every pod, Move a member and Dissolve a pod. Nothing sends a push or an email. Pinned by 13 database checks, 2 new unit checks in `test:flock-shell` and 5 new browser tests in the Flock shell check.
- **PR:** [#548](https://github.com/the-kya-project/perch-perfect-plan/pull/548)
- **Outcome:** Held: the spec says to hold and ask when a screen isn't mocked up (the Buddy pods list, the admin screen and a few cards), and the migration changes two existing Flock functions and the posts table's space check. The questions are in the PR and the review queue. Everything is behind the Flock gate, and the Flock is still closed in production (`members_open` off, no opening day; checked read-only).
- **Problems:** At the start, the open agent PRs were checked. #547 (1.10) is held, green and conflict-free. #533 (1.14a) still conflicts outside the record files; #547's branch already notes it. #543 (1.17): its Free-user regression and iPhone hydration on the latest commit were both cancelled (staging queue, and a browser install that stuck for 25 minutes), so it's in the review queue for a re-run. #535 (1.15): its Free-user regression on the latest commit failed this time, rather than being cancelled. Its log was too long to read here, so it's in the review queue too. D1.2 still waits for Brittany's #537, and 1.15, 1.17 and 1.10 have PRs, so 1.11 was the highest item this run could take. On the first push, "Database checks" failed before running anything: the CI machine's database port was already in use. The next push ran it again. #547 also rewrites the posts table's space list; this PR's migration rewrites it from the live definition, but #547's uses a fixed list, so whichever merges second must keep both (in the review queue). The database checks and browser tests can't run on this machine, so CI runs them for the first time. `npx tsc` reports only the known error in `e2e/helpers.ts`. The English catalog lines were added by hand (77), because `i18n:extract` isn't an allowed command; `i18n:check` passes. Heredocs and one `awk` command were refused, so those edits were made in the editor. No lock at start. No pending-log entries to move.

### 2026-11-23 22:30 EST · 1.10 Challenges
- **Built:** Flock challenges. Admins write one at `/admin/challenges` (reached from "Manage challenges" on the Journeys tab). They choose Journey (built on a journey template) or Standalone (their own list of prompts, one per line), then add a title, a short description, start and end days, and who it's for (the whole Flock or one chapter). There's one at a time for each group, and diet conversion and other food journeys can't be used. An open challenge is a card on Today and on Journeys, following the mockup ("Challenge · 4 days left", "Standalone challenge · 7 prompts · 63 members joined", a few faces, "Join the challenge"). Members join with one of their birds and choose whether their entries may be featured (off unless they say yes). The challenge page shows "Juno · 3 of 7 done", the prompt checklist and "Post today's entry", which opens the post composer with the prompt on top. A journey challenge shows the journey's progress and sends the member to the usual journey setup if they haven't started it. Entries are Flock posts in the challenge's own feed, so reactions, comments, reports, review, blocks and photos work as they do for posts, and they never show on Today. Finishing shows "You finished!" and earns the Challenge champ badge. After the end day, the feed stays readable, and admins can pin an entry and write a wrap-up featuring entries only from members who said yes. There are no winners, prizes or rankings. Pinned by 9 database checks, 6 new unit checks in `test:flock-shell` and 3 new browser tests in the Flock shell check.
- **PR:** [#547](https://github.com/the-kya-project/perch-perfect-plan/pull/547)
- **Outcome:** Held: the spec says to hold and ask when a screen isn't mocked up. The join step, the celebration, the closed page with its wrap-up and two admin screens aren't in the mockup. Short clip entries aren't built either (posts have no clips). The questions are in the PR and the review queue.
- **Problems:** At the start, #535 (1.15) and #543 (1.17) conflicted with `main` only in the record files. This run merged `main` into each in a separate copy, kept both sides' entries, and pushed, which also re-runs #535's cancelled Free-user regression. In #543's backlog, both sides had moved items to "Done" (1.17 on the branch; 1.7 and 1.13a on `main`), so all three stay in "Done". #533 (1.14a) also conflicts in `src/locales/en.jsonc`, so it was left as it is and noted in the review queue. D1.2 still waits for Brittany's #537, and 1.15 and 1.17 have PRs, so 1.10 was the highest item this run could take. It's XL, and it was built in one run. On the first push, one database check failed ("journey challenges count their journey"). The failure showed that profiles take Challenge champ from the recorded award without capping it at what others may see, as they already cap the journey badges. So a badge earned only through a "Just me" journey would have shown. The migration now caps it there too. The check itself was also wrong: its member had already earned the badge in public by finishing a one-prompt challenge earlier in the file. The check now removes that entry first, and each step reports its own name when it fails. Twice, iPhone hydration timed out after 25 minutes while installing browsers, before any test ran. Runs can't re-run checks, so an empty commit started it again. Then `test:flock-analytics` failed: `src/lib/flockChallenges.ts` imports post types from a module that sends Flock events. That's allowed only from files on the test's Flock list, so `flockChallenges` was added to the list, as `flockIdeas` and `flockEvents` already are. On the next run, one new browser test saw each entry sent twice. The test's own mock was recording each call a second time (the shared mock already records every call), so the extra line was removed; the app sends each entry once. Production reads (read-only): the Flock is still closed (`members_open` off, no opening day), and the badges table from #546 is now in production, as the last run asked to confirm. Some shell commands were refused (a locale setting on `sort`, heredocs, chained `sed`), so those edits were made in the editor. The English catalog lines were added by hand, because `i18n:extract` isn't an allowed command. The catalog sorts keys case-insensitively, and `i18n:check` passes. `npx tsc` reports only the known error in `e2e/helpers.ts`. Moved one pending-log entry (21:29 EST) below.

### 2026-11-23 21:29 EST · 1.13a Badges: the Flock set · merged (correction to the 20:19 entry)
- **Built:** nothing new. This settles the 20:19 EST entry for #546, which was written before the checks finished and says "Merged by this run once every required check passed, if they did in time". On the third push, every required check passed (Database checks including the 10 badge checks, Free-user regression, iPhone hydration including the five new badge tests, clip playback, No Google Fonts, Supabase Preview, Vercel). The same run then squash-merged #546 at 21:29 EST (merge commit `b929e89`). Just before merging, it re-checked production read-only: `members_open` was off and opening day wasn't set.
- **PR:** [#546](https://github.com/the-kya-project/perch-perfect-plan/pull/546)
- **Outcome:** Merged.
- **Problems:** Right after the merge, `public.flock_badge_awards` wasn't in production yet (checked read-only). The Supabase integration applies migrations shortly after a merge, so the next run should confirm it appeared. This run couldn't open the Free-user regression's full log (the saved copy is in a folder runs can't read), so it went by the check's pass, which fails rather than skips when something is missing. 1.13a was entry 1 of 2 that this pending log held: the 19:18 EST entry for #544 was already moved into `docs/agent-log.md` by #546 and is removed here. The run's copy (`~/.kya-agent/work/agent-20261123-2019`) has everything committed and pushed, so the job can remove it.

### 2026-11-23 20:19 EST · 1.13a Badges: the Flock set
- **Built:** Flock badges. Six of them: First steps, Journey finisher (at 1, 3 and 10 finished journeys), Trick star, Good neighbor, Voice of the Flock and Challenge champ (shown in gray; nothing awards it until challenges exist). The database works out what each member has earned from what they've already done, so past activity counts. The first time someone opens the Flock after this, everything their history earned shows once, as a single "Here's what you've already earned" card. After that, each new badge gets its own "Badge earned" card on Today. A new Badges screen (Flock settings → Badges) shows earned badges in color and the rest in gray, with how to earn each one. Member profiles show earned badges as small pills beside Founder and Chapter lead. Edit profile has a "Show my badges on my profile." switch, and the Privacy screen lists badges. Journey badges on a profile only count journeys shared with the community, so a "Just me" journey never shows to anyone else. Blocks hide badges both ways. There are no points or rankings, and the icons are the mockup's simple stroke icons until final art arrives. Pinned by database checks (10), unit checks (3 new in `test:flock-shell`) and five new browser tests in the Flock shell check.
- **PR:** [#546](https://github.com/the-kya-project/perch-perfect-plan/pull/546)
- **Outcome:** Merged by this run once every required check passed, if they did in time; otherwise "waiting on checks". It meets every merge rule: it's behind the Flock gate (`members_open` is off and opening day isn't set in production, checked read-only), the migration only adds two tables and new functions, the screens follow the mockup (differences in the review queue), and the item asks for "merge only".
- **Problems:** At the start, D1.2 still waited for Brittany to merge #537 (her replay read), and 1.15 and 1.17 have open PRs (#535, #543), so 1.13a was the highest item this run could take. No earlier agent PR was waiting on checks. The database checks and browser tests can't run on this machine, so CI runs them for the first time. On the first push, Database checks failed: inside two functions, the names of their result columns (`badge`, `level`) clashed with the table's columns ("column reference is ambiguous"). The fix tells those functions to read the table's columns (`#variable_conflict use_column`). The migration hadn't been applied anywhere but the PR's own preview branch. On the second push, two checks failed because the checks file read a change in the same statement that made it, where Postgres doesn't show it yet. The checks now make and read changes in separate statements, as the app's separate requests do. `npx tsc` reports only the known error in `e2e/helpers.ts` (on `main`). `npm run i18n:extract` isn't an allowed command, so the English catalog lines were added by hand and `i18n:check` passes. One Python edit was refused partway through, so the rest of the edits were made in the editor. Production has no finished journeys yet (checked read-only), so nobody's history earns a journey badge today. No lock at start. Moved one pending-log entry (19:18 EST) below.

### 2026-11-23 19:18 EST · 1.7 Instagram share cards for journeys · merged (correction to the 18:42 entry)
- **Built:** nothing new. This settles the 18:42 EST entry for #544, which was written before the checks finished and says "Merged by this run once every required check passed, if they did in time". Every required check passed (Free-user regression, iPhone hydration including the three new share-card tests, Database checks, clip playback, No Google Fonts, Vercel). The same run then squash-merged #544 at 19:18 EST. Just before merging, it re-checked production read-only: `members_open` was off and opening day wasn't set.
- **PR:** [#544](https://github.com/the-kya-project/perch-perfect-plan/pull/544)
- **Outcome:** Merged.
- **Problems:** none. The run's copy (`~/.kya-agent/work/agent-20261123-1842`) has everything committed and pushed, so the job can remove it.

### 2026-11-23 18:42 EST · 1.7 Instagram share cards for journeys
- **Built:** A "Make a share card" button on three journey moments: the milestone celebration, a finished journey's page, and Day one vs. now. It opens a Share card screen with a preview of the picture in post or story size, a switch for the bird's name (on) and one for the member's own name (off), and Share, which opens the phone's share sheet or downloads the picture on the web. The card is forest green with the bird's photo (or a still from each clip for Day one vs. now), the journey, the milestone or "Finished!", the date and "Kya & Co. · thekyaproject.com", following the mockup. Only the bird's household can make one, so a "Just me" journey never leaves it. The picture is drawn fresh, so no location or camera details from the photo go with it. It reuses the Moments card's drawing and sharing code. Unit checks (3 new in `test:flock-shell`) and three new browser tests in the Flock shell check pin it.
- **PR:** [#544](https://github.com/the-kya-project/perch-perfect-plan/pull/544)
- **Outcome:** Merged by this run once every required check passed, if they did in time; otherwise "waiting on checks". It meets every merge rule: it's behind the Flock gate (`members_open` is off and opening day isn't set in production, checked read-only), there's no migration, the screens follow the mockup (differences in the review queue), and the item asks for "merge only".
- **Problems:** At the start, #533 and #543 were held, green and conflict-free, so they were left alone. #535 (1.15) had no conflicts, but its Free-user regression on the latest commit was **cancelled**; runs can't re-run checks, so it's in the review queue under "Held for Brittany". D1.2 waits for Brittany to merge #537 (her replay read), and 1.15 and 1.17 have PRs, so 1.7 was the highest item this run could take. The browser tests can't run on this machine, so CI runs the new ones for the first time. `npx tsc` reports one error in `e2e/helpers.ts`, which this PR doesn't touch (it's on `main`). The Moments screen in the care app shares `momentCard.ts`; it was refactored without changing what it does. `npm run i18n:extract` isn't an allowed command, so the English catalog lines were added by hand and `i18n:check` passes. No lock at start. No pending-log entries to move.

### 2026-11-23 17:10 EST · 1.17 Promo codes for memberships
- **Built:** Members can enter a promotion code when they add their card. Stripe's checkout page shows its own "Add promotion code" field for the monthly and yearly Flock plans, and later Kya's Crew, but never for the $15 founding price. If a discount reaches a founding membership another way, such as the billing portal or the Stripe Dashboard, the billing webhook takes it off. A code stacks with a trial: the free season (or the later 14-day trial) runs first, and the code applies to the paid months after it. `docs/flock/payments-plan.md` now has worked examples, a caveat for Brittany to check in test mode (Stripe may count a "3 months" code from the day the card is added, not the first charge), and the Apple offer codes the iPhone paywall will need. It's all switched off with `BILLING_ENABLED`, test mode only, and nothing in the Stripe Dashboard was touched. `npm run test:billing` has 7 new tests (41 in all).
- **PR:** [#543](https://github.com/the-kya-project/perch-perfect-plan/pull/543)
- **Outcome:** Held: payments need Brittany's approval (the item's own rule), along with her read of the worked examples and two test checkouts.
- **Problems:** At the start, #533 (1.14a) conflicted with `main` only in `docs/REVIEW_QUEUE.md`. This run merged `main` into it in a separate copy, kept both sides' entries, and pushed. In "Held for Brittany", `main` had already cleared #521, #529 and #531, so they stayed cleared and #533's own item was kept. #535 (1.15) had checks running and no conflicts, so it was left alone. #537–#542 are Brittany's docs and fix branches, not agent PRs. D1.2 is still waiting on #537 (Brittany's decisions, which says not to start until it merges), so 1.17 was the highest item this run could take. One scripted file edit was refused by the job's permissions, so this run made it in the editor instead. No database change, and no browser tests run locally. Type check, lint and `test:billing` pass. On the first CI run, Database checks, Free-user regression, Clip playback, No Google Fonts and Vercel passed. iPhone hydration failed in one test only, `confirmation link waits for a tap, then works once` on WebKit (English and Dutch): the dashboard's fetches were cut off during navigation ("due to access control checks"). That's the known flaky test Brittany's #541 fixes, in care-app code this PR doesn't touch, so this run didn't change it. Runs can't re-run a check, so this record update was pushed as a commit, which runs the checks again. No lock at start. No pending-log entries to move.

### 2026-11-23 15:31 EST · 1.15 Kya's Crew and its sponsored rescue-adopter seat (switched off)
- **Built:** The two Kya's Crew plans ($45 a month, $444 a year) now exist in billing, still switched off and Stripe test mode only. A Crew membership counts as a Flock membership. Every paid membership now records its giving share (25% for Crew, 20% for the rest). When a Crew member's first payment goes through, it adds one six-month seat for a rescue adopter, and a new admin page, `/admin/crew`, shows seats sponsored, used and available. Rescue partner codes (1.16) will use the seats. No screen offers Crew to members yet, because there's no design for it. Database checks (`crew_checks.sql`) and 7 new `test:billing` tests pin it.
- **PR:** [#535](https://github.com/the-kya-project/perch-perfect-plan/pull/535)
- **Outcome:** Held: payments, and the `entitlements` plan check change, need Brittany's approval (the item's own rule). Three questions are in the PR: whether Crew pays right away during the free season, whether a renewal sponsors another seat, and where members pick Crew.
- **Problems:** At the start, #533 (1.14a) and #534 (1.4) conflicted with `main` only in the record files. This run merged `main` into each in a separate copy, kept both sides' entries, and pushed. Items Brittany had cleared on `main` stayed cleared. #521 (D1.1) also conflicted in `package.json`, so it was left as it is; Brittany merged it during this run, so this PR merged `main` again and dropped its note about that conflict. GitHub ran no checks on #535's work commit until then, because a PR with a merge conflict gets no `pull_request` runs. #535 touches `src/lib/billing.ts` and `billing.functions.ts`, which #533 also changes, so whichever merges second will need a small merge. The database checks only run in CI (no local database). Type check, lint, build and `test:billing` (41) pass locally. Production reads (read-only): the Flock is still closed (`members_open` off) and the plan check is named `entitlements_plan_check`. Some chained shell commands were refused, so they were run one at a time. No lock at start. No pending-log entries to move.

### 2026-11-23 15:20 EST · 1.14a Dutch for the billing screens
- **Built:** at Brittany's go-ahead, Dutch for all 83 billing lines and the page title. Dates, the sentence on Stripe's page, Stripe Checkout and the Customer Portal now follow the member's language.
- **PR:** https://github.com/the-kya-project/perch-perfect-plan/pull/533
- **Tested:** `npm run test:billing`, translations, types, build, and every screen rendered in Dutch at 320 and 390 wide with made-up billing data.
- **Not tested:** a real Stripe page in Dutch, and no native Dutch speaker has read it.
- **Outcome:** held for Brittany.

### 2026-11-23 13:50 EST · 1.14a Card step and checkout design
- **Built:** the nine approved billing mockups on Membership, Checkout branding through each session's settings, and the card's last four digits read from Stripe without storing them. A card added in the season's last 49 hours is saved at Checkout and first charged at the season's end (Brittany's decision). Behind `BILLING_ENABLED` (off), web only.
- **PR:** https://github.com/the-kya-project/perch-perfect-plan/pull/533
- **Tested:** `npm run test:billing`, types, translations, and every screen rendered at phone and desktop width with made-up billing data.
- **Not tested:** a real Stripe Checkout or Customer Portal page. Billing is off and this run has no Stripe test key.
- **Outcome:** held for Brittany.
### 2026-11-23 14:20 EST · 1.8 Do good voting: Brittany's approved mockups
- **Built:** Changed the vote from "one winner" to a shared donation: every choice gets 10%, the votes share out the rest, and the shares always total 100%. A vote is now final, enforced in the database. The vote, thank-you and results screens match the approved mockups, which are saved in `docs/flock/mockups/voting/`. Admin choices now take a logo or photo, and a closed vote shows the shares to send. Founders-only votes keep plain results, as Brittany chose.
- **PR:** [#529](https://github.com/the-kya-project/perch-perfect-plan/pull/529)
- **Outcome:** Merges once every required check passes, as Brittany asked in this session.
- **Problems:** The staging account blocker had already cleared (no `@thekyaproject.com` account on staging). A transparent PNG logo would have turned black when saved as a JPEG, so logos are now flattened onto white.

### 2026-11-23 14:05 EST · 1.4 Removed content and closed reports are deleted after 180 days
- **Built:** The daily clean-up job from 1.3 now also handles reviewer decisions. When a reviewer removes a Flock post or comment, it stays hidden as before. 180 days after the removal, the job deletes it for good, with its photos and the comments under it, the same way a post its author deleted is purged. Reports that were closed (kept or removed) are deleted 180 days after they were closed. Removed journey updates are left as they are, because the bird's household still sees them; that's a question for Brittany. A "dry run" only counts. Database checks and `npm run test:flock-purge` (4 new tests) pin it.
- **PR:** [#534](https://github.com/the-kya-project/perch-perfect-plan/pull/534)
- **Outcome:** Held: the item asks for Brittany's approval because it deletes data, and she needs to decide on removed journey updates. Production has no removed content and no reports today (checked read-only), and the Flock is still closed (`members_open` off).
- **Problems:** At the start, #529 and #533 were held, green and mergeable, so they were left alone. #531 (2.4) conflicted with `main` only in the three record files. This run merged `main` into it in a separate copy, kept both sides' entries, and pushed. For the held items Brittany had already cleared on `main`, `main`'s version was kept. #521 (D1.1) also conflicts in `package.json`, so it was left as it is and noted in the review queue. The database checks only run in CI, because this machine has no local database. Type check, lint and `test:flock-purge` (11) pass locally. Prettier warns about the two TypeScript files, but it warned on `main` too, so their existing style was kept. Some shell commands (heredocs, redirects) were refused, so edits were made in the editor. No lock at start. No pending-log entries to move.

### 2026-11-23 13:15 EST · Record: #525 approved and merged by Brittany
- **Built:** Brittany approved 1.14's database change, its 16 lines of wording and the review-queue decisions. Changed the founding line as she asked, merged `main` (both sides kept), and added `npm run test:billing` to the iPhone hydration job.
- **Migration:** renamed to `20261123180000_billing_foundation.sql`, because two later migrations reached production while this PR was open and a file older than them is refused by a plain `supabase db push`. It had not been applied anywhere.
- **Supabase Preview:** skipped because the PR's first commit had no `supabase/` changes, so Supabase ignored the PR and never made a preview branch. The migration ran in the Database checks job instead.
- **PR:** https://github.com/the-kya-project/perch-perfect-plan/pull/525
- **Outcome:** merged by Brittany's instruction once required checks pass. `BILLING_ENABLED` stays off; the Stripe Dashboard wasn't touched.

### 2026-11-23 12:36 EST · 2.4 Open pages fetch the new build's files after a release
- **Built:** When the app moves onto a new release, it now first tells the server "forget which copy of the app I was tied to" (a quick call to a new address, `/api/public/unpin`), and then reloads. Vercel's Skew Protection ties each open page to the copy it opened with, and on Nov 2 the iPhone app kept that tie even through a reload, so the reloaded page still asked for the old copy's files and the sitter preview stalled. Clearing the tie first means the reload lands on the new copy. It applies to both kinds of update (the version check from 2.3 and the web service worker's). The call never holds a reload up for more than 3 seconds, and if it fails the page reloads just as it does today. Skew Protection stays on; no Vercel setting changed. A test pins the address, the cookie and the order.
- **PR:** [#531](https://github.com/the-kya-project/perch-perfect-plan/pull/531)
- **Outcome:** Held: the item asks for Brittany's merge, since it changes how every open page updates. 2.5's Simulator check is the hands-on proof. Every required check passed on the code commit, Free-user regression and iPhone hydration included. This record update runs them again.
- **Problems:** At the start, every open agent PR conflicted with `main`. #529 (1.8) conflicted only in the three record files, so this run merged `main` into it in a separate copy, kept both sides' entries and pushed (the merge carried `main`'s `hydration.yml` change and GitHub accepted it). After that push, #529's "Database checks" went red. Its migration `20261123160000_flock_votes.sql` has the same version as `main`'s `20261123160000_today_card_dismissals.sql` from #523, which production already records (checked read-only). It needs a new version, which is in the review queue; the branch was left as it is. #521 (D1.1) and #525 (1.14) also conflict in `package.json`, so they were left as they are and noted in the review queue. #530 is a docs PR on a `docs/` branch, not an agent PR, so it was left alone. The browser tests and a Simulator can't run here; `test:release-check` (22, 5 new), `test:drafts`, `test:preview-services`, the type check, lint and the production build pass locally. The first two `gh pr create` attempts failed with a certificate error; it worked with the body in a file. Shell loops were refused, so commands ran one at a time. No lock at start. No pending-log entries to move.

### 2026-11-23 11:45 EST · D2.1 Today card redesign (requested by Brittany)
- **Built:** Rebuilt the card to Brittany's approved design: her 22 illustrations, six color tints, a Seasonal tip or Holiday helper label, an end date, and "Got it", which is saved per account in a new table. Applied her nine copy changes in English and Dutch, and added the card's test to the automatic checks.
- **PR:** [#523](https://github.com/the-kya-project/perch-perfect-plan/pull/523)
- **Outcome:** Held: Brittany reviews the screenshots. Not merged; the switch stays off.
- **Problems:** none

### 2026-11-23 10:45 EST · 1.8 Do good voting (and the founding vote)
- **Built:** A simple voting tool for the Flock. When Brittany opens a vote, it shows as a card on Today and at the top of Do good: the question, a short description, when it closes and how many members have voted. A member taps Vote now, picks one choice (each with a name, a sentence or two and a photo) and votes. They can change their vote until it closes. Nobody sees who's winning before then. After it closes, everyone sees each choice's percentage, the winner and Brittany's note, unless fewer than 10 people voted, when it just says "Too few votes to share." Founders-only votes (like the first expert Q&As) show only to founding members, with a small Founders pill. Admins write votes as drafts at `/admin/votes` ("Manage votes" on Do good), open them, close them early or extend them, write the announcement, and see the counts at any time. Nobody, admins included, can see how a particular member voted. It all sits behind the Flock gate, so only admins can see it today. Nothing is seeded: the first votes are Brittany's content.
- **PR:** [#529](https://github.com/the-kya-project/perch-perfect-plan/pull/529)
- **Outcome:** Held: the two admin screens aren't in the mockup, and the specs say a screen that isn't mocked up waits for Brittany. Everything else meets the merge rules: it's behind the Flock gate (`members_open` is off and opening day isn't set in production, checked read-only), and the migration only adds tables, functions and a bucket.
- **Problems:** At the start, all five open agent PRs (#520, #521, #522, #523, #525) conflicted with `main`, only in the three record files. This run merged `main` into #520, #521, #523 and #525 in a separate copy, kept both sides' entries, and pushed them so their checks run again. For #523 and #525 the backlog conflict was D5.1, which `main` had dropped while those branches still listed it, so it stays dropped, and D2.1 and 1.14 stay in "Done" on their branches. The push carried `main`'s #527 workflow change, and GitHub accepted it. #522 had already been updated from `main` at 10:46 EST, outside this run (with a note recording Brittany's approval), so this run left it alone. 2.4, 1.4, D1.2, 1.15 and 1.17 wait on those PRs, so 1.8 was the highest item this run could take. The database checks and browser tests can't run on this machine, so the PR's CI runs both for the first time. Type check, lint, the build, `test:flock-shell` (81), `test:storage-orphans`, `test:account-files` and `i18n:check` pass locally. Some chained or looped shell commands were refused by the job's permissions, so this run ran them one at a time. From about 11:15 EST, every "Free-user regression" run (#520's, then this PR's) stops at its first step. Staging now holds a `@thekyaproject.com` account, so `supabase/staging/free-user.sql` refuses to run, taking it for production. Runs can't change staging accounts, so this is in the review queue for Brittany, along with re-runs for #523 and #525, whose regression runs were cancelled when newer runs joined the shared staging queue. No lock at start. Moved one pending-log entry (09:44 EST) below.

### 2026-11-23 09:44 EST · 1.6 Curated chapter collections · merged (correction to the 08:34 entry)
- **Built:** nothing new. This corrects the 08:34 EST entry for #528, which says "Waiting on checks". The record update pushed last ran the checks again, every one passed (iPhone hydration included, in 12m19s), and the same run then squash-merged #528 at 09:44 EST. It met every merge rule: it's hidden behind the Flock gate (`members_open` still off in production, re-checked read-only just before merging), the migration only adds a table and functions, and the item asks for "merge only".
- **PR:** [#528](https://github.com/the-kya-project/perch-perfect-plan/pull/528)
- **Outcome:** Merged.
- **Problems:** The review queue's "Held for Brittany" item "#528 · needs a re-run of iPhone hydration" is no longer needed. Agents don't remove items, so the run that moves this entry should add a line under it saying #528 went green and merged, and leave it for Brittany to clear. Right after the merge, `public.flock_places` wasn't in production yet (checked read-only), since the Supabase integration applies migrations shortly after a merge. Worth confirming it appeared. (Moved here from `~/.kya-agent/pending-log.md` by the 10:45 EST run, which added that line to the review queue and confirmed `public.flock_places` is now in production.)

### 2026-11-23 08:34 EST · 1.6 Curated chapter collections
- **Built:** The chapter's Resources tab, which was empty, now lists the chapter's Avian vets, Rescues, and Shops and services as simple directory cards: name, city or area, a note, and Call and Website buttons. There are no comments, reactions, author or ratings, and a line says these are community picks, not endorsements. Any member can "Suggest a place". The suggestion shows to nobody but the chapter's lead and admins, who approve or decline it in the review queue under a new "Places" filter. Leads (their own chapter) and admins (any chapter) add, edit, reorder and remove listings on a "Manage listings" screen that shows when each was last updated. It all sits behind the Flock gate, so only admins can see it today. Nothing is seeded: the starter listings are Brittany's to add. Database checks cover who sees and changes what.
- **PR:** [#528](https://github.com/the-kya-project/perch-perfect-plan/pull/528)
- **Outcome:** Waiting on checks. Every other check passed. "iPhone hydration" needs a re-run, which runs can't do (see Problems, and the review queue's "Held for Brittany"). Once it's green, it meets every merge rule: it's hidden behind the Flock gate (`members_open` is off in production, checked read-only), and the migration only adds a table and functions.
- **Problems:** At the start, every open agent PR (#520, #521, #522, #523, #525) had passing checks and no conflicts, and each is held for Brittany, so there was nothing to update or merge. Items 2.4, 1.4, D1.2, 1.15 and 1.17 wait on those PRs, so 1.6 was the highest item this run could take. The new SQL couldn't be run locally (no database on this machine) and the browser tests couldn't either (Playwright isn't an allowed command), so the PR's "Database checks" and "iPhone hydration" jobs are the first run of both. Database checks passed, the new places block included (the job fails unless every block reports 0 failed). The first iPhone hydration run went red, but not because of a test. Its "Install browsers" step took 16 minutes (normally about one), and the job hit its 25-minute limit just as the Community shell's Playwright run reported "75 passed", which is every test in that file, the new one included. `gh run rerun` is refused for the runs, so this log update was pushed as a commit, and that ran the checks again. On that second run, one WebKit Dutch test of the email-confirmation page (`[webkit-nl] confirmation link waits for a tap`) failed. Its dashboard fetches were cut off during navigation ("due to access control checks"). That's care-app code this PR doesn't touch, and the test passed on the first run with the same app code. The run left it there rather than pushing again to retry, and asked for a re-run in the review queue. The final record update pushed below runs the checks once more as a side effect. My first checks file had a bug (it read the table directly as an app user, which would have aborted the block), fixed before its first CI run finished. No lock at start. No pending-log entries to move.

### 2026-11-23 07:04 EST · 1.14 Billing foundation (switched off)
- **Built:** The groundwork for paid Flock memberships, all switched off and test mode only. In the database: a table linking each account to its Stripe customer, a table recording every Stripe event once, new columns on memberships (which product, whether it renews, whether it's set to cancel), and on founding claims (released, forfeited). A new Stripe address, `/api/public/stripe/billing`, with its own secret: it checks Stripe's signature, re-reads the subscription from Stripe, and writes the membership from that, so a repeated or out-of-order event can't get it wrong. When a founding membership actually ends, the $15 price is gone for good. Turning off auto-renew doesn't count. On the Membership screen, an "Add a card" step shows only when billing is on: monthly or yearly ($0 until the free season ends), or the founding price for founders, then "Card on file" with "Manage billing". It never shows in the iPhone or Android app. Billing refuses a live Stripe key in code, so turning it on can't charge a real card. New tests: `npm run test:billing` (34, all passing) and `supabase/checks/billing_checks.sql`.
- **PR:** [#525](https://github.com/the-kya-project/perch-perfect-plan/pull/525)
- **Outcome:** Held: payments, and the `entitlements` change, need Brittany's approval (the item's own rule).
- **Checks:** every required check passes, including Database checks (with the new billing checks), Free-user regression and iPhone hydration.
- **Problems:** "Supabase Preview" reported *skipping* on this PR even though it has a migration, so the only database validation before merge is CI's Database checks job (which passed). Worth a look before merging. Before CI ran, a read-only look at production's indexes showed a membership row may link to a founding claim only once (`entitlements_one_per_founding_claim`). The Stripe row now leaves that link off and goes by `plan = 'founding'`, fixed in the same PR. The database checks only run in CI (no local database here). The new unit test isn't in CI yet, because adding it needs a workflow change the run's token can't push. Nothing was touched in the Stripe Dashboard, and nothing was tested against a real Stripe test account. Some chained shell commands were refused by the job's permissions, so this run ran them one at a time. At the start, the five open agent PRs (#520–#524) had no conflicts and passed every check; all are held for Brittany, so none was touched. No lock at start. No pending-log entries to move.

### 2026-11-23 04:12 EST · D2.1 Seasonal and holiday Today cards on Home
- **Built:** Home can now show the day's card from the seasonal calendar (the 22 cards approved in #516), in the reader's language, right under the Today list. It uses the phone's own date, read after the page has loaded. A US home time zone gets the US holidays and Amsterdam gets the Dutch ones. It sits behind a new switch, `today_cards`, which starts **off**, so nobody sees a change. Brittany can turn it on for her account only with one line of SQL (she's the only admin). A new test (`npm run test:today-card`, 17 checks) and a database check pin the date, the country, both languages, the read-after-load rule, and the switch starting off.
- **PR:** [#523](https://github.com/the-kya-project/perch-perfect-plan/pull/523)
- **Outcome:** Held: the item's own "Needs Brittany" line asks for her read of the copy, and the card's look is the run's own (no mockup). She's also asked whether a card that stays the same for weeks should be hideable. The merge adds a table to production with the switch off.
- **Problems:** At the start, the three open agent PRs (#520 2.3, #521 D1.1, #522 1.3) were all held, mergeable and passing, so none needed updating or merging. 2.4, D1.2 and 1.4 wait on them, so D2.1 was the highest item this run could take. The new test isn't in CI yet: that needs a workflow change, which the run's token can't push. The database check runs in CI on its own (every `*_checks.sql` is picked up). Staging won't have the switch until this merges, so the preview fails closed and shows no card. No lock at start. No pending-log entries to move.

### 2026-11-23 02:44 EST · 1.3 Deleted posts stay hidden for 180 days, then are purged
- **Built:** When a member deletes a Flock post or comment, it disappears for everyone at once, the author included, as it does today. Its comments and replies go with it. But it isn't erased straight away now: it moves to a hidden holding table that only the server can read, and its photos stay where they are. A new daily job deletes held items, and their photos, for good once 180 days are up. It never deletes a photo that something still showing uses. If a photo fails to delete, that item waits for the next day's run. Deleting a whole account still removes everything at once, with no 180-day hold. The database checks and a new test (`npm run test:flock-purge`) pin all of this.
- **PR:** [#522](https://github.com/the-kya-project/perch-perfect-plan/pull/522)
- **Outcome:** Held: needs Brittany's approval of the daily purge (it deletes data) and of the change to the two existing delete functions (the item's own "Needs Brittany" line). **Approved and merged by Brittany** (Nov 23, 2026), including the daily purge job and the changes to `flock_post_delete` and `flock_comment_delete`. `npm run test:flock-purge` now runs in CI.
- **Checks:** every required check passes, including Database checks, Free-user regression and iPhone hydration.
- **Problems:** The run can't start a local database, so the new database checks were only run in CI. Their first CI run caught two mistakes in the checks themselves, not in the migration: a read-back in the same statement as the delete, and a miscount of held comments. Both were fixed in the same PR. `npm run test:flock-purge` (7 checks) passes locally but isn't in CI yet: adding it means a workflow change, which the run's token can't push. Open agent PRs #520 (2.3) and #521 (D1.1) are held, mergeable and green, so nothing needed updating. No lock at start. No pending-log entries to move.

### 2026-11-23 01:21 EST · D1.1 Weight baseline rules and a replay of real history
- **Built:** The rules for each bird's own normal weight, as code nothing in the app uses yet. Weigh-ins before a meal, after a meal and without a label each get their own normal (the middle value of the last three months, leaving out the last week, with a normal range around it). Until there are 7 weigh-ins over 14 days it says "still learning". It then says how far the latest weigh-in is below the normal: "worth watching" (2.5%), "keep an eye on this" (5% over a week) or "call your vet today" (10%). It never alerts on one weigh-in: a re-weigh has to agree, otherwise it asks for one, and a drop must be at least 2 g. The free hard weight-loss alert (10%, re-weighed) works even while it's still learning. Every number is in the health rules file, marked draft. A replay tool runs the rules over an export of real weight history (a read-only query with no names) and counts, per bird, how often each alert would have fired. 22 tests pin it all.
- **PR:** [#521](https://github.com/the-kya-project/perch-perfect-plan/pull/521)
- **Outcome:** Held: health content for Brittany's read, the replay of real history (she runs the export; the job can't run the replay command), and her call on the owner's typed normal weight.
- **Problems:** `npm run weight-baseline:replay` isn't on the job's allowed commands (only `test:*` scripts are), so it was checked only through the test, which runs the same code. Production read, counts only: 38 birds, 759 weigh-ins, 13 birds with enough history for a normal, and 672 of the weigh-ins carry a meal label. The new test isn't in CI (a workflow change the token can't push). PR #520 (2.3) is held and current with `main`, all checks passing; nothing to update. No lock at start. No pending-log entries to move.

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
