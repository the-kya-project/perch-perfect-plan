# The iPhone hydration check

This check makes sure the front-door pages load cleanly on an iPhone. It runs automatically on every pull request, as the **iPhone hydration** check, and it should pass before anything merges.

## Why it exists
When a page opens, the server sends a finished version of it. The phone then builds the same page itself and checks that the two match; that check is called **hydration**. If any wording differs, React throws the server's version away and rebuilds the page. People see a flicker, and anything they had started typing can be lost.

That happened on iPhones in October 2026. On Dutch phones, the app switched to Dutch a moment too early, and `/confirm-email` filled in the saved email address too early. PRs #393–#395 fixed it, and this check keeps it fixed.

## What it covers
- **Pages:** `/`, `/auth` (sign-in and sign-up), `/confirm-email` and `/link-expired`.
- **Every language:** the list comes from `SUPPORTED_LOCALES` in `src/lib/i18n/config.ts`.
- **As Safari and as the iOS app:** "iOS app" means the page is loaded the way the installed app loads it.
- **On two engines:** WebKit (Safari's engine) and Chromium, both using the iPhone 13 screen, user agent and touch.
- **Two sign-up journeys:**
  - signing up with an email that already has an account, then tapping **Resend confirmation**;
  - tapping an old confirmation link after a newer one was sent, then **Send a new link**, then an old link again after confirming;
  - opening a signed-in page, and an old confirmation link, while signed out. The app has to leave for sign-in (or `/link-expired`) on the page's first load, which used to crash on slow phones. Chromium runs this one with its processor slowed 8x, five times over, to recreate a slow phone.

A test fails on any React hydration error (#418, #421, #422, #423, #425, #520) or any uncaught error. Each page test also checks that the page shows its own heading, in that language.

### Adding a language
There's nothing to do here. Add the language to `SUPPORTED_LOCALES`, and every test runs in it on the next pull request. The expected headings and buttons are read from that language's catalog, falling back to English for anything not translated yet.

The check also confirms the page really appears in the new language. So if the language is on the list but the app doesn't show it yet (for example, the catalog isn't loaded in `src/lib/i18n/catalogs.ts`, or `pickLocale` in `config.ts` doesn't recognise it), the check fails until it does.

## Reading a failure
On the pull request, open **Details** next to **iPhone hydration**. Each failed test starts with a line like this:

```
[webkit-nl] › hydration.spec.ts › Safari › / hydrates cleanly
```

Read it as: **engine-language › file › Safari or iOS app › page**. This one is the home page (`/`), in Dutch, on Safari's engine, as a browser visit.

Under it, every problem is numbered, with a plain-language label. **On** is the address the page was on. When React recovered from a deeper error, **Caused by** shows that original error, which is usually the one to fix:

```
Error: old confirmation link (en): 1 problem(s)
  1. HYDRATION ERROR: React hit an error while checking part of the page and rebuilt that part.
     On: http://127.0.0.1:4173/link-expired?reason=otp_expired
     Error: Minified React error #422; …
     Caused by: undefined is not an object (evaluating 't.routeId')
```

(That one was real. Its first run caught a redirect that crashed when it landed on a slow phone while React was still checking the page. See `leave()` in `src/routes/_authenticated/route.tsx`.)

| Label | What it means | Usual cause |
|---|---|---|
| **HYDRATION ERROR #418 / #425** | The server's page and the phone's page show different text or elements. | Something read during the first render that only the phone knows: the language, saved data (`localStorage` / `sessionStorage`), the time, the device (`window`, `navigator`, the iOS app). |
| **HYDRATION ERROR #422 / #423** | React hit an error while checking the page and rebuilt part of it (#422) or all of it (#423). | Usually follows a #418 on the same page. Fix that one first. |
| **HYDRATION ERROR #421** | Part of the page changed before React finished checking it. | A state change pushed in right after load, such as a language switch or a session check. |
| **HYDRATION ERROR #520** | React hit an error while updating the page and re-rendered all of it. | Usually alongside #422. Read the **Caused by** line. |
| **UNCAUGHT ERROR** | The page threw an error that nothing caught. | An ordinary bug. The lines under it show where. |

A journey test that stops at a step instead, for example "expected the text … to be visible", means that step of the flow is broken, not hydration. The failure names the step, and the report has a screenshot of the screen at that moment.

### Finding exactly what differs
In CI the build is minified, so React only gives a number. Every hydration failure ends with a command that reruns just that test against the dev server, where React prints the exact difference:

```
npm run test:hydration:dev -- --project chromium-nl --grep "Safari / hydrates cleanly"
```

The output marks the mismatch line by line:

```
+  Alles wat de zorg voor je papegaaien vraagt, …     ← what the phone built
-  Everything it takes to care for your parrots, …    ← what the server sent
```

The fix is to make the first render match the server. Read the browser-only value after the page loads, in a `useEffect`, and leave the first render as the server had it. Don't hide the warning.

### Screenshots and traces
When the check fails, the run uploads a **hydration-report** file, linked at the bottom of the run's summary page. It holds a screenshot of each failing page and a Playwright trace: a step-by-step replay you can open at https://trace.playwright.dev.

## Running it yourself
```
npm run test:hydration          # build for the check, then run everything (WebKit + Chromium)
npm run test:hydration:run      # run again without rebuilding
npm run test:hydration:dev      # against the dev server, with full React messages
E2E_BROWSERS=chromium npm run test:hydration:run   # one engine only
```

The check uses its own build, pointed at a local stand-in for Supabase (`mock-supabase.mjs`). That build is never deployed, needs no secrets, and touches no real accounts. `serve-build.mjs` serves it the same way Vercel serves production.
