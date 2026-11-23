# Review queue

Things for Brittany to look over from the unattended agent runs, with PR links. Agents add new items at the **top** of their section, in the same PR as the work.

**Brittany clears items as she reviews them. Agents never remove or rewrite an item she hasn't cleared,** including items another run added. The rules are in CLAUDE.md, "Working the backlog unattended"; the run-by-run record is [`agent-log.md`](agent-log.md).

---

## Copy that merged

Every new or changed line of wording that merged, so it can be read after the fact. One item per PR.

Format:

```
### <PR link> · <item ID> <item title>
- **Where:** <screen, email or file the line appears in>
  - Before: "<old wording>" (or "new")
  - After: "<new wording>"
```

### [#508](https://github.com/the-kya-project/perch-perfect-plan/pull/508) · 0.5 Admin review for pending posts
No new strings: every line reuses existing wording, in new places (admins only).
- **Where:** Flock settings (You), a new row for reviewers
  - Before: new
  - After: "Review queue" / "Admin · {count} waiting"
- **Where:** Review queue, an item's label
  - Before: "Report · comment"
  - After: "Report · comment · Learn together" (the post's space, "{name} chapter", or "Journeys"; events add their chapter)
- **Where:** Review queue, a report's detail line
  - Before: "Reported by 2 members"
  - After: "Reported by 2 members · 1h"

---

## Decisions agents made

Judgment calls a run made on its own, even small ones: a name, an order, a default, how an unclear spec was read.

Format:

```
### <PR link> · <item ID> <item title>
- **Decision:** <what was decided>
- **Why:** <the reason, in plain language>
- **To change it:** <what would need to change>
```

### [#514](https://github.com/the-kya-project/perch-perfect-plan/pull/514) · 2.1 The startup guard listens before anything can fail
- **Decision:** The guard is added to each page's HTML by the server entry (`src/server.ts`, `withStartupGuard` in `src/lib/startupGuard.ts`), not rendered by React. It goes right after `<meta charset>`, not before it.
- **Why:** React 19 moves every `<meta>`, `<link>` (including the code preloads and the font stylesheet) and `<title>` above any script in `<head>`, so a React-rendered guard can't come first. The charset has to stay in the page's first 1024 bytes. Only the app's own pages get the guard (a `<head>` that loads `/assets/` code). The unsubscribe, bereavement-review and error pages don't, because there it would show "Something's taking too long".
- **To change it:** `src/lib/startupGuard.ts`. The order is pinned by `e2e/startup-guard.spec.ts`.

### [#514](https://github.com/the-kya-project/perch-perfect-plan/pull/514) · 2.1 The startup guard listens before anything can fail
- **Decision:** The 30 WebKit runs live inside `e2e/startup-guard.spec.ts` (30 copies of the missing-file test, WebKit only), not as a new step in `hydration.yml`. The checks of how the guard is added to the HTML are in the same file.
- **Why:** GitHub refused this run's push of a workflow change: the hourly runs' token has no Workflows permission. The iPhone hydration job already runs every spec, so the 30 runs happen in CI anyway.
- **To change it:** if you'd rather have its own step, add `npx playwright test -c e2e startup-guard.spec.ts --project 'webkit-en'` to `hydration.yml` yourself. Runs can't edit workflows.

### [#514](https://github.com/the-kya-project/perch-perfect-plan/pull/514) · 2.1 The startup guard listens before anything can fail
- **Decision:** The "list of the page's code files" is `window.__kyaCode` (`files` and `failed`), kept by the guard. The root error screen treats any failed code file on it as a missing file (one automatic reload, then the error screen), without asking the server first.
- **Why:** it's simple and needs no network call. The one-reload limit already stops a loop. The reference branch (`fix/native-release-catchup`) also asked the server (HEAD) and waited for loading to settle. That's the sitter-preview fix and belongs with 2.5, so it isn't here.
- **To change it:** `pageCodeFailed` in `src/lib/sw-register.ts`.

### [#508](https://github.com/the-kya-project/perch-perfect-plan/pull/508) · 0.5 Admin review for pending posts
- **Decision:** The way in is a "Review queue" row in its own card at the top of Flock settings, shown to anyone `flock_can_review()` lets in (admins today, and chapter leads, who see Events only). It isn't in the care app's settings or any shared menu.
- **Why:** the item allowed "admin menu or Flock settings". There's no admin menu, and Flock settings keeps it inside Flock-only code, so free users can't be affected.
- **To change it:** move the row in `src/routes/_authenticated/flock.you.index.tsx`.

### [#508](https://github.com/the-kya-project/perch-perfect-plan/pull/508) · 0.5 Admin review for pending posts
- **Decision:** The space for reports comes from a new function (`flock_review_post_spaces`) rather than changing `flock_review_queue`. A report shows its date as the latest report's time.
- **Why:** the item says to hold the PR if an existing database function has to change. A new function only adds, so the PR could merge.
- **To change it:** fold the space into `flock_review_queue` in a later migration (that changes an existing function, so it needs Brittany's approval).

### [#507](https://github.com/the-kya-project/perch-perfect-plan/pull/507) · 1.11 Buddy pods
- **Decision:** A "keep going" group is still a pod, so the block, reporting, admin and 3-week rules apply. When the 3-week rule closes one, it ends without asking "Keep going together?" again. "You finished!" and "Keep going together?" aren't in the mockup, so they're built from the app's existing card and sheet components and listed in the PR.
- **Why:** Brittany's answer didn't cover a "keep going" group going quiet, and asking again could keep an inactive group open forever. The spec holds PRs for unmocked screens, and this keeps those two small messages from blocking 1.11.
- **To change it:** change the item in `docs/BACKLOG.md`, or ask for a mockup of the two messages.

### [#506](https://github.com/the-kya-project/perch-perfect-plan/pull/506) · 1.11 Buddy pods
- **Decision:** Progress from a "Just me" journey is never shown in a pod.
- **Why:** The spec shows journey progress on the pod page, but its first rules say nothing from a "Just me" journey reaches anyone outside the household.
- **To change it:** change the item in `docs/BACKLOG.md`.
- **Brittany:** agreed (Nov 22, 2026).

### [#506](https://github.com/the-kya-project/perch-perfect-plan/pull/506) · 1.13a Badges
- **Decision:** A badge earned only through "Just me" journeys shows on the member's own Badges screen and not to other members.
- **Why:** A public badge would reveal activity from a private journey.
- **To change it:** change the item in `docs/BACKLOG.md` if these badges should be public.
- **Brittany:** agreed (Nov 22, 2026).

### [#506](https://github.com/the-kya-project/perch-perfect-plan/pull/506) · 1.10 Challenges
- **Decision:** Diet conversion can't be used as a challenge's journey template.
- **Why:** The spec says challenges never involve food restriction, weight goals or anything health-related.
- **To change it:** change the item in `docs/BACKLOG.md`.
- **Brittany:** agreed (Nov 22, 2026).

### [#506](https://github.com/the-kya-project/perch-perfect-plan/pull/506) · 1.12 Flock insights
- **Decision:** The mockup's "Share my profile with my chapter" switch stays out, and the diet conversion duration is marked as a question for Brittany.
- **Why:** The switch isn't in the spec, and a typical diet conversion length could read as health guidance, which the spec rules out.
- **To change it:** say so when approving 1.12.
- **Brittany:** agreed that the "Share my profile with my chapter" switch won't be built (Nov 22, 2026). The diet conversion duration question is still open.

### [#506](https://github.com/the-kya-project/perch-perfect-plan/pull/506) · 1.6, 1.8, 1.7, 1.13a, 1.10, 1.11 order
- **Decision:** The six items go after the existing Ready items, in the requested order. 1.6 depends on 0.5, 1.13a on 1.6 and 1.8, and 1.10 on 1.13a. 1.6 keeps the app's tab order (Resources before Members), which differs from its mockup.
- **Why:** This leaves work already queued in place, and each dependency is something the spec's feature uses.
- **To change it:** reorder the items in `docs/BACKLOG.md`.

### [#505](https://github.com/the-kya-project/perch-perfect-plan/pull/505) · 0.4 Credit /get-page sign-ups to the link that brought them
- **Decision:** Brought over the reference commit `d974e8e` exactly as it was, including that it also covers `/get-app` (both share the same desktop page) and not `/review`. Left the two files' existing Prettier warnings alone (they're on `main` too), so the diff stays only the change.
- **Why:** The backlog item says to build from that commit; reformatting would bury the real change in a large diff.
- **To change it:** ask for the files to be reformatted in a separate PR, or for `/get-app` to be left out.

### [#504](https://github.com/the-kya-project/perch-perfect-plan/pull/504) · Backlog: Brittany's decisions
- **Decision:** 1.15 and 1.17 moved to "Ready to build" with "Depends on: 1.14 merged", and the Skew one-pager (2.4a) sits second, right under the admin review item. 1.14 and its followers go at the end of Ready, and D1.2 right after D1.1.
- **Why:** Runs never start anything under "Needs Brittany before work starts", so 1.15 and 1.17 had to move to start once 1.14 merges. Existing priorities otherwise keep their order.
- **To change it:** reorder the items in `docs/BACKLOG.md`.

### [#504](https://github.com/the-kya-project/perch-perfect-plan/pull/504) · D1.2 Weight baseline shadow mode
- **Decision:** Until you answer, the shadow log covers your birds only. The item used to say "every bird", and your approval says "on for my account only".
- **Why:** The narrower reading can't touch anyone else's data.
- **To change it:** say that it should log every bird.

### [#500](https://github.com/the-kya-project/perch-perfect-plan/pull/500) · 0.3 Translation check passes and stays passing
- **Decision:** In Dutch, "the Flock" stays "de Flock" (the product's name). The glossary's "flock" → "je vogels" is kept for "your flock" meaning your birds.
- **Why:** "Een jaar in je vogels" would make no sense; the Flock is a name, like Kya & Co.
- **To change it:** pick a Dutch name for the Flock and add it to `src/locales/glossary.nl.json`.

### [#500](https://github.com/the-kya-project/perch-perfect-plan/pull/500) · 0.3 Translation check passes and stays passing
- **Decision:** "Eastern time" in the gift send-date hint became "Amerikaanse oostkusttijd" (US East Coast time).
- **Why:** A Dutch buyer would otherwise read the time as their own.
- **To change it:** edit `gift.sendOnHint` in `src/locales/nl.jsonc`.

### [#500](https://github.com/the-kya-project/perch-perfect-plan/pull/500) · 0.3 Translation check passes and stays passing
- **Decision:** The translation check runs right after install in the iPhone hydration job, before the browsers download.
- **Why:** It takes seconds, so a drifted catalog fails fast instead of after the long browser tests.
- **To change it:** move the "Translation catalog matches the code" step in `.github/workflows/hydration.yml`.

### [#499](https://github.com/the-kya-project/perch-perfect-plan/pull/499) · Setup: rules for the continuous runs
- **Decision:** A run that opens no PR (stopped by the lock, or found nothing it's allowed to build) writes its log entry to `~/.kya-agent/pending-log.md` on the Mac, and the next run with a PR copies it into `docs/agent-log.md`.
- **Why:** Every run must be logged, but a run with no PR has no way to change `main`, and must not touch the main project folder.
- **To change it:** say where those entries should go instead.

### [#499](https://github.com/the-kya-project/perch-perfect-plan/pull/499) · Setup: rules for the continuous runs
- **Decision:** "Behind the Flock gate" counts as hidden only while the Flock is closed to members (`members_open` is false in production). Once the Flock opens, Flock changes are visible to members and must be held.
- **Why:** The gate is admins-only today, but opening the Flock turns it on for members, and from then on a Flock change is something real people notice.
- **To change it:** set a different rule for after opening day.

### [#499](https://github.com/the-kya-project/perch-perfect-plan/pull/499) · Setup: rules for the continuous runs
- **Decision:** A run waits for checks inside its own 3-hour window. If they haven't finished, it logs the PR as "waiting on checks", and a later run may merge it (if every rule passes) before picking new work.
- **Why:** The Free-user regression waits for the preview deployment and can take a while; this keeps each run short without leaving finished work stranded.
- **To change it:** say how long a run should wait, or that a later run shouldn't finish another run's PR.

### [#499](https://github.com/the-kya-project/perch-perfect-plan/pull/499) · Setup: rules for the continuous runs
- **Decision:** An item's own "Needs Brittany" line in the backlog still applies. If it asks for an approval, a decision, a read of copy or a hands-on check, the PR is held. "Merge only" doesn't stop a self-merge.
- **Why:** Many "Overnight alone: yes" items already name something you want to approve (deletions, health content, Dutch copy).
- **To change it:** rewrite the item's "Needs Brittany" line.

---

## Held for Brittany

PRs waiting on Brittany, and exactly what each one needs.

Format:

```
### <PR link> · <item ID> <item title>
- **Needs:** <the decision, approval or read, in one or two lines>
```

### [#514](https://github.com/the-kya-project/perch-perfect-plan/pull/514) · 2.1 The startup guard listens before anything can fail
- **Needs:** your merge, after a look at the before-and-after screenshots the item asks for. This run couldn't take them: the sandbox can't open a browser. Every app page's HTML now passes through a new step in `src/server.ts`, so this goes to every visitor. Nobody should see anything different. A missing code file now resets every time instead of sometimes, and the error screen reloads once, instead of showing "Something went wrong", when one of the page's code files failed. Free-user regression and iPhone hydration results are on the PR.

### Reminder · the hourly runs' GitHub token expires Feb 20, 2027
- **Needs:** a new token before **Feb 20, 2027**. That's 90 days from Nov 22, 2026; GitHub → Settings → Developer settings → Fine-grained tokens shows the exact date. When it expires, runs can still build and test but can't push or open PRs, and each run's note in `~/.kya-agent/job.log` says so.
- **To replace it:** make a new fine-grained token for `the-kya-project/perch-perfect-plan` only, with the same permissions as the old one (Contents and Pull requests: read and write; Actions, Commit statuses and Checks: read). Then run the save command again in Terminal (it asks you to paste the token and doesn't show it). It overwrites `~/.config/kya-agent/github-token`, readable only by you. Delete the old token on GitHub after that. Clear this item and add a new one with the new date.
