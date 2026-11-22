# Vercel's Skew Protection, in plain language

One page to help Brittany decide backlog item 2.4. It changes no setting and makes no decision. The setting is hers (Vercel → pet-sitter → Settings → Advanced → Skew Protection).

## What it does

Every release builds a new copy of the app, with new code files under new names. A page that was already open when the release went out was built from the old copy. As someone moves around the app, the page keeps asking for more of the old copy's code files, and it keeps saving through the old copy's server code.

**With Skew Protection on**, Vercel remembers which copy each open page started with (a cookie called `__vdpl`) and keeps answering that page from the old copy, for a set time after the release. The open page keeps working exactly as it did. Opening or reloading a page always gets the newest copy.

**With it off**, every request goes to the newest copy. An open page that asks for one of the old copy's code files gets "not found", because that name no longer exists.

## Where things stand

- **It's on for this project.** That was confirmed on Nov 2, 2026 while chasing the sitter-preview bug (notes on reference branch `fix/native-release-catchup`). This run has no Vercel access, so it couldn't check the setting or how long pins last today.
- **The Nov 2 bug.** The owner's sitter preview shows the sitter page in a frame. The frame always loads the newest copy, but the iPhone app around it was still pinned to the old one. After a release the frame sometimes never started, showing "Something's taking too long" until the app was closed and reopened. The iPhone app's web view also kept the old pin through a reload, so even reloading didn't move it onto the new copy.
- **What already protects an open page on `main`:** if a code file fails to load, the app reloads once onto the newest copy and keeps typed drafts (the full health check, weight entry and clips). If it fails again, it shows the error screen. Item 2.1 makes that more dependable.
- **What's being built anyway (2.2, 2.3):** open pages check for a new release on launch, hourly and on coming back to the app, then reload at a quiet moment or show "A new version is ready".

## The options

| Option | What current users would notice | Trade-offs |
|---|---|---|
| **A. Leave it on, change nothing** | Nothing new. | Open pages keep working until they're reloaded. The sitter-preview stall can still happen, and the iPhone app can stay on an old copy after a reload. 2.3's release check has to work around the pin, because a pinned page can't see that a new release is out through ordinary requests. |
| **B. Leave it on, and the app drops its own pin when it updates** (what 2.4 was written for; already tried on the reference branch) | Nothing, apart from 2.3's update banner or quiet reload. | Keeps the protection for someone in the middle of a form. Moving onto a new release is done by the app: it clears the `__vdpl` cookie through a small new address (`/api/public/unpin`), then reloads. That fixed the stuck iPhone reload in the Simulator on Nov 2. No Vercel setting changes. 2.5 still needs the hands-on Simulator check. |
| **C. Leave it on, with a shorter time limit** | Nothing most days. Someone who keeps a page open past the limit may see a short reload when they next move around. | Fewer pages stay on old copies for long, so the sitter preview mismatch has a shorter window. It doesn't fix the iPhone reload keeping its pin within that window, so it doesn't replace B. |
| **D. Turn it off** | After a release, someone moving around an open page may see a short reload. Rarely, a save made from a page opened before the release could fail if that release renamed or moved the server code behind it. | Simplest: every request gets the newest copy, so the sitter-preview mismatch and the stuck pin can't happen. The cost lands on people mid-task during a release. Drafts cover the health check, weight entry and clips, but not every form. It relies fully on the reload safety net (2.1) and the release check (2.3), so it would only make sense after both are merged. |

## Worth knowing whichever you pick

- **Opening or reloading a page is never pinned.** Only the requests an open page makes after that are.
- **The pin only lasts so long.** Vercel keeps old copies for a maximum time you set, up to a limit that depends on the plan. After that, an open page is treated as if the setting were off.
- **The web app's service worker keeps its own copy of the code files** for people using the website, so on the web an open page is partly protected either way. The iPhone app has no service worker, so the setting matters most there.
- **Nothing here touches the database, email, push or payments.** It only changes which copy of the app's code answers an open page.
- **Changing it is instant and reversible** from the Vercel dashboard, with no deploy. It's a Vercel setting, so changing it is Brittany's job, never an agent's.

## What each choice means for the backlog

- **A:** 2.4 is dropped. 2.5 has to cope with the pin some other way.
- **B:** 2.4 is built as written (the unpin address and the reload that uses it), after 2.3.
- **C:** Brittany sets the time limit; 2.4 is probably still B.
- **D:** Brittany turns it off after 2.1 and 2.3 are merged; 2.4 becomes "remove the workarounds for the pin".
