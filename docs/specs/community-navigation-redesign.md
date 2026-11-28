# Community (Flock) navigation redesign

**Mockups (approved):** [`docs/specs/mockups/community-redesign-mockups.html`](mockups/community-redesign-mockups.html). Eleven screens, Final-01 to Final-11, each with build notes beside it. Open the file in a browser.
**Status:** spec, not built. Backlog items CR1–CR14 in [`docs/BACKLOG.md`](../BACKLOG.md) ("Ready to build").
**Written:** Nov 28, 2026, from Brittany's brief and mockups, after a read of the code on `main`. Brittany's answers to the planning questions are recorded under "Decisions" at the end.
**Scope:** the community side only (everything under `/flock`, plus one switch on the care side's moment sheet in section 8). The care app's Home, Sits, Health, Explore and its bottom bar with the Community button stay exactly as they are.

## How to use the mockups

- **Match them visually:** layout, hierarchy, spacing, colors. The notes beside each screen describe behavior; where this spec and a mockup disagree about how something looks, the mockup wins, and where they disagree about behavior, this spec wins (it was checked against the code).
- **Don't copy the mockup HTML.** Build with the existing components (`KyaHeading`, `FlockHeader`/`FlockBody`, `FlockAvatar`, the sheet pattern in `SpacesSheet`, `ReportSheet`, `BlockSheet`, `PostCompose`, `ResourceCard`) and the `K` tokens.
- **Sample content:** bird names (Echo, Buzz, Willow), journeys, badge counts, "Great Lakes chapter", "Brittany (you)", "Show 8 resources" and every bracketed title ("[Member name]", "[Video title]") are samples. Real data fills them.
- **Placeholder copy:** the guidelines page (Final-10) and the agreement screen (Final-11) carry placeholder words. They go in `docs/REVIEW_QUEUE.md`; Brittany supplies the final text.
- Each PR includes screenshots of the built screen next to its mockup screen.

## Ground rules (every item)

- **Behind the Flock gate.** Nothing here renders, fetches or ships code for a non-admin while `flock_enabled()` is false (CLAUDE.md, "Flock safety rules"). Section 8 is the only change outside `/flock`; it follows the shared-code rule (pixel- and behavior-identical for non-admins, Flock code lazy-loaded, "Free-user impact" in the PR).
- **Database: additive only.** New tables, columns and functions. No renames, drops, or changed policies on anything the care app uses.
- **New copy goes in `docs/REVIEW_QUEUE.md`.** Every new or changed line, before and after. English only for now: the Flock's navigation and feed strings have no Dutch yet (`nl.jsonc` falls back to the English defaults), so Dutch is one item at the end (CR14), not a step in each.
- **Tokens.** Use `K` in `src/components/kya.tsx` and the CSS variables in `src/styles.css`. Two colors in the mockups aren't tokens yet; CR1 adds them to `K` (additive, unused by care screens):
  - `gold: "#e8b44c"`: the center plus, Post, "Your journey"'s plus, the Weigh & check row, "I agree", Save moment. (`K.sunflower`, `#f2b33d`, is the care app's and stays as it is.)
  - `limeLight: "#e0eed1"`: the selected Post to tile.
  - Already tokens or variables: forest `K.forest` (`#1a3d2e`), page `K.mist` (`#f1f5f0`), lime `K.lime` (`#cdeab0`), moss `K.moss` (`#2d6a4f`), amber fill `K.amberBg` (`#f6e7c4`), teal on dark `K.teal` (`#9bcab8`), card border `--sage-100` (`#e7ece6`; `K.line` is `#e3ebe2`, so use the variable), teal on light `--teal-on-cream` (`#5a8c7a`), Newsreader `SERIF` / `KyaHeading`. The mockups' other near-greens (the menu's tile fill, muted text `#5b6b61`) map to the closest existing token; add a token only if none is close, and say so in the PR.
- **Space dots** (from the mockups, everywhere a space appears: menu, post cards, Post to tiles): Start here `K.lime`, Learn together `K.gold`, Do good `K.teal`, your chapter `#7fa36a` (add as `K.chapterDot` in the item that first needs it, or reuse the closest existing green).
- **Old links keep working.** Every URL that exists today still opens something sensible (`FLOCK_REDIRECTS` in `src/lib/flockNav.ts`).

---

## What exists today (read Nov 28, 2026)

| Area | What's built | Where |
|---|---|---|
| **Moments on the bird page** | `public.moments` (care table): `kind` gotcha_day / birthday / years_together / custom, `title`, `on_date`, `photo_path`, `recurs`, `auto_generated`. No body text, photos only (no video). A custom moment is added from the "Add a milestone" sheet on `/birds/$birdId/moments` (Title, Date, Photo (optional), Save), then a direct `insert`. **Only the bird's owner can write** (RLS "moments insert/update/delete" = owner; household members read). | `src/routes/_authenticated/birds/$birdId.moments.tsx`, `20260621120000_multi_owner_access_foundation.sql`, `20260626160000_capability_write_policies.sql` |
| **Daily idea** | Built (step 4C). `flock_ideas` + `flock_idea_tries` (loved / curious / not_for, a bird, optional photo). `flock_todays_idea()` returns today's ready idea or a favorite. `TodaysIdeaCard` on Today links to `/flock/idea`. Admin schedule at `/admin/ideas`. | `src/components/flock/IdeaParts.tsx`, `src/lib/flockIdeas.ts`, `flock.idea.tsx` |
| **Journeys** | Built (step 3, redesign 1.20): browse, following (`journey_follows`), updates (`journey_post_update`), and **a story-style viewer**, `/flock/journeys/$journeyId/story` (`?queue=following` moves to the next bird). Today shows `FollowRings` ("Journeys you follow"). Posting an update: `/flock/journeys/$journeyId/post`. | `flock.journeys.*.tsx`, `JourneyBrowse.tsx`, `JourneyToday.tsx`, `src/lib/journeyData.ts` |
| **Report and block** | Report: `flock_report` for **post, comment, journey update and journey** (`ReportSheet`); a threshold hides content until `/admin/review` resolves it. Block: `flock_block` from post and comment menus, the journey menu, chapter Members rows and member profiles; unblock in `/flock/you/blocked`. **No "report a member".** Post and comment menus (`PostMenus` in `PostFeed.tsx`) offer report, block and, on your own, edit and delete. | `ReportSheet.tsx`, `BlockSheet.tsx`, `PostFeed.tsx`, `src/lib/flockBlocks.ts` |
| **Events** | Built (step 5A), per chapter: `flock_events`, `flock_event_rsvps`, the chapter's Events tab (`/flock/chapter?tab=events`), `/flock/events/$eventId`, `/flock/events/new`. **No all-events page.** | `flock.chapter.tsx`, `EventParts.tsx` |
| **Header** | `FlockHeader`: forest band, serif title, then the **Spaces** button (opens `SpacesSheet`) and **your avatar** (opens `/flock/you`, Flock settings). No bell; Notifications is a row in `/flock/you`. | `src/components/FlockShell.tsx` |
| **Pill rows** | Today: Everything / Learn together / Do good / Start here (`?space=`). Journeys: For you / Following / Tricks / Basics. Library: two single-select rows (type, subject) plus search. Chapter: Posts / Events / Resources / Members. | `src/lib/flockNav.ts`, `FlockChips.tsx` |
| **Bottom bar** | Today, Journeys, Chapter, Library, My birds (`FLOCK_DESTS`); on Duo and wide windows the same five as a side column. | `FlockShell.tsx` |
| **New post** | `PostCompose` (`/flock/post/new`): Cancel / "New post" / Post ("Send for review" for Do good), Post to chips, Do good review note, title (optional), body, up to 4 photos, Attach a bird (shown birds only), the GPS note, vet nudge, hourly limits, edit, challenge and pod variants. | `src/components/flock/PostCompose.tsx` |
| **Guidelines and agreement** | **Built** (build C). Final words (Nov 22, 2026) in `src/lib/flockGuidelines.ts`; `/flock/guidelines`; `flock_agreements` (user, `agreed_at`, version, adult, source); `FLOCK_GUIDELINES_VERSION` = `private.flock_guidelines_version()` = "2026-12"; a version change sends everyone to `/flock/join` on their next visit. Join asks for a chapter, "I'm 18 or older" and "I agree". **Admins skip it.** | `flockGuidelines.ts`, `flock.join.tsx`, `src/lib/flockJoin.ts`, `20261122100000_flock_open_to_members.sql` |
| **Notifications** | `flock_notifications`, `flock_notifications_list`, `private.flock_notifications_unread()`; screen `/flock/you/notifications`. | `src/lib/flockModeration.ts` |
| **Weigh and check** | The care app's daily check for all birds, `/check`. | `src/routes/_authenticated/check.tsx` |

---

## 1. Community bottom bar · See Final-01-Feed (bottom)

Left to right: **Feed**, **Journeys**, **Add something** (center), **Library**, **My birds**.

- "Today" becomes **Feed** (`flock.nav.feed`). The route stays `/flock`.
- **Chapter leaves the bar** and moves into the menu (section 3). `/flock/chapter` keeps working; on chapter, event and member screens no bar tab is lit.
- **Center button:** a raised gold circle (`K.gold`, forest plus, white ring) sitting above the bar's top edge as in the mockup, no label under it ("Add something" for screen readers). It opens the Add sheet (section 5); a button, never lit.
- **My birds** goes to the care app's Home (`/dashboard`) and calls `rememberMode("care")`, as today.
- **Duo column and wide windows:** the same five, same order, in the column (`ColumnTabs`), the center item as a gold circle at tab size. Keep `useTabFit` working.
- Height, border and safe area as the care bar, so switching modes doesn't jump.

## 2. Community header · See Final-01-Feed, Final-06-Library (top)

On every screen that uses `FlockHeader`:

- **Remove** the Spaces button, the avatar button, and Feed's space chip row.
- **Left:** the menu button, a 52px rounded tile (translucent white on forest, as in the mockup) with a 26px menu icon and a small `K.lime` dot on its corner when anything in the menu has a badge (section 3). Label "Menu" ("Menu, new activity" with the dot).
- Next to it, the **Kya & Co.** wordmark in the serif, white.
- **Right:** the **Updates** bell, a round translucent button opening `/flock/you/notifications`, with a lime dot when `flock_notifications_unread()` is above zero. Label "Updates".
- **The page title sits below**, in the serif (`KyaHeading`, about 30px).
- **Feed with a space selected:** the title is the space's name ("Learn together"). A small clear chip under it ("Feed ×", or a back link to Feed) returns to everything; the URL keeps `?space=`.
- Sub-pages with a back arrow (`FlockSubPage`, e.g. the guidelines page in Final-10) keep their own header and don't get the menu.

## 3. Side menu · See Final-02-Menu

A drawer from the left, **forest background** (`K.forest`), full screen height, about 82% of the width (max 360px), the page dimmed behind it, a round Close button top right next to the Kya & Co. wordmark. A real dialog (as `SpacesSheet`): focus moves in and wraps, Escape, a backdrop tap and a swipe left close it, focus returns to the menu button. Picking anything navigates and closes it.

Exactly this order:

1. **Community guidelines:** an outlined row (1.5px light border on forest, about 14px radius), shield icon, "Community guidelines", line "How we take care of each other". Opens `/flock/guidelines`.
2. **Feed:** a row with the feed icon; filled `K.lime` with forest text when you're on Feed with no space selected.
3. **SPACES box:** a slightly lighter forest box with the eyebrow **SPACES** (`K.teal`). Three rows: **Start here** ("Introductions and first questions"), **Learn together** ("Questions and what's working"), **Do good** ("Rescue, conservation, ways to help"), each with its dot (ground rules), the one-line description, and an unread badge (lime pill, forest number) on the right. A selected space's row is highlighted. Opens `/flock?space=…`.
4. **Three full-width tiles**, one under another, each with a lime icon square, name and badge:
   - **Journeys:** badge = new updates from journeys you follow. Opens `/flock/journeys`.
   - **Your chapter by name** ("Great Lakes chapter"): badge = anything new in your chapter. Opens `/flock/chapter`. Hidden when you have no chapter.
   - **Events:** no badge. Opens your chapter's Events tab (`/flock/chapter?tab=events`); with no chapter, a simple "Events are coming soon" page at `/flock/events` (free today: only `$eventId` and `new` exist under it).
5. A divider, then **MY BIRDS** (eyebrow): **Home** (`/dashboard`) and **Sits** (`/sits`), one column, icon and name only, no descriptions; both call `rememberMode("care")`.
6. A divider, then the **account section** at the bottom: your Flock avatar, display name, and "Your profile and posts" (opens your own member profile, `/flock/members/<your id>`); under it, two side-by-side buttons, **Notifications** (`/flock/you/notifications`) and **Settings** (`/flock/you`, today's Flock settings screen, unchanged).

**Badges** hide at zero and show "9+" past nine. The mockup's numbers are samples.

**Counts (new, additive):** one RPC, `flock_menu_counts()` (SECURITY DEFINER in `private`, invoker wrapper in `public`, Flock users only, built on the existing visibility and block functions), returning `{ start, learn, good, journeys, chapter }`. "Since you last looked" comes from a new table `flock_seen` (`user_id`, `area` text: start / learn / good / journeys / chapter, `seen_at`; own rows only, written only by `flock_mark_seen(area)`), set when you open that space, Journeys, the story viewer or Chapter. Your own posts never count. Cached five minutes and refreshed when the drawer opens. The menu button's dot = any count above zero; the bell has its own dot.

**Your profile and posts:** profiles today show your profile and shown birds but no posts. Add a Posts list to member profiles through a new read function, `flock_member_posts(user, before)`, built on `flock_post_visible` (so blocks, review and chapter rules hold).

## 4. Feed · See Final-01-Feed

`/flock`, top to bottom. Today's other cards (badges, challenges, votes, the diet weigh reminder, journey moment cards) **stay** on the Feed, between Try today and From the spaces, in today's order (Brittany, Nov 28).

1. **Journeys row.** Serif heading "Journeys" with "See all" (to `/flock/journeys`), then a horizontal row of 64px story circles with a name under each:
   - First: **Your journey**, your bird's photo (or a pale circle) with a small gold plus badge. With no open journey it opens `/flock/journeys/start`; with one or more, a small sheet of your open journeys (Post an update) and "Start a new journey".
   - Then **journeys you follow first** (`journey_following_latest`), then **community journeys** to fill the row (recent ones from `journey_feed`, skills you're working on first), never "Just me" journeys (the visibility functions already guarantee that). A forest ring when there's a clip you haven't seen; a plain light ring otherwise.
   - Tap opens the **story viewer** (`/flock/journeys/$journeyId/story`, with `?queue=following` for followed ones).
2. **Try today** card, only when `flock_todays_idea()` returns an idea. Amber fill (`K.amberBg`), 18px radius, a white rounded illustration tile on the left (the idea's photo if it has one, else a category icon), eyebrow **TRY TODAY** (`K.amberText`), the idea's text, bold, clamped to 3 lines, and a forest **Tried it** pill opening `/flock/idea`. Once you've answered, it reads "See how everyone did".
3. **From the spaces.** Serif heading, then compact post cards (a new `PostCardCompact` beside `PostCard`, reusing its parts), white with `--sage-100` border, 18px radius:
   - avatar, name ("(you)" on your own), and the meta line "[Space] · [time]" (the space name is the tag);
   - a **···** button top right opening Post options (section 6b);
   - title (bold), body clamped to 3 lines;
   - photos as a **92px square thumbnail** on the right (first photo, center-cropped), with a **"+N"** badge when there are more;
   - **Great job** and **Comment** as text actions in moss (the existing reaction and comment parts).
   - Tapping the card opens `/flock/post/$postId`.
   - With a space selected, only that space's posts; the Journeys row, Try today and the other cards are hidden.
   - `ComposePrompt` goes: posting moves to the center plus.

## 5. Add something sheet · See Final-03-Add

From the center plus. A bottom sheet (white, 26px top corners, handle, serif title "Add something", round Close, swipe down). Three rows, each an icon circle, a bold name and a line:

1. **Weigh & check your flock** · "Opens your daily check for all your birds". Gold fill, forest icon circle. Opens the care app's `/check` and calls `rememberMode("care")`; it stays in the care app afterwards (Brittany, Nov 28).
2. **Post to the community** · "Share a win, ask a question, or say hello". Mist fill, lime icon circle. Opens `/flock/post/new`, preselecting the space when the Feed has one selected.
3. **Post a journey update** · its line lists your open journeys ("Buzz · Scale training or Echo · Harness training"). Tapping it with one open journey opens that journey's `/flock/journeys/$journeyId/post`; with several, the row expands to one choice per journey ("[Bird] · [skill]"), each opening its update flow (no bird picker: each journey has one bird). With none, the row reads "Start a journey" and opens `/flock/journeys/start`.

## 6. New post screen · See Final-04-Post (empty), Final-05-PostFilled (filled)

`/flock/post/new`, redesigning `PostCompose`. **Every current field and behavior stays**: which spaces you can post to, Do good review ("Send for review" and its note), title, body and its placeholder, up to four photos with progress and remove, Attach a bird (shown birds only), the GPS note, vet nudge, hourly limits, editing, challenge and pod variants, discard.

- **Header:** forest band: **Cancel** (left), **New post** (centered, serif), a gold **Post** pill (right; "Send for review" for Do good; disabled until there's a body; "Posting…" while busy).
- **POST TO:** eyebrow (teal on light), then a 2×2 grid of tiles in this order: **Learn together** ("Questions and what's working"), **Start here** ("Say hi and ask first questions"), **Do good** ("Rescue needs and causes"), **your chapter** by name ("Members near you"). Each tile: dot, bold name, line. Selected: `K.limeLight` fill, 2px `K.forest` border, a forest check circle top right. Unselected: white with `--sage-100` border. No chapter: three tiles.
- **Writing card:** white, 18px radius: your avatar and name; a large serif title field ("Title (optional)"); the body ("Ask a question, share what worked, or say hello."); photo thumbnails (about 84px, rounded, a dark × to remove); then, after a divider, two side-by-side mist buttons, **Add photos** (camera) and **Attach a bird** (feather).
- **Attached bird box** (Final-05): inside the card, above the buttons, a pale box with the bird's photo, name and a **Remove** link, and under it the **"Save to [bird]'s moments too"** checkbox, checked by default. The checkbox shows only when **you own the bird** (moments are owner-only); for a bird you co-care for, the box shows without it.
- **Location note:** a small lock icon and "Photos lose their location data when you post." under the card.

**Saving to moments:** on Post, after the post is created, a custom moment is added to that bird through the existing Moments system (a `kind = 'custom'` row in `public.moments`): title = the post's title, or the first 60 characters of the body; date = today in your time zone; photo = the post's first photo, if any (moments hold one photo and no body).
- **New, additive:** a nullable `moments.flock_post_id uuid` (a plain column on the care table, no new policy) so the post page can say "Saved to [bird]'s moments" and a second save never happens. The photo is copied server-side from `flock-posts` into the bird's moment photo storage (a server function with the service role, checking the caller owns the post and the bird), so the moment never depends on a Flock file the 180-day purge may remove.
- If the moment fails, the post stands: "Your post is up. We couldn't save it to [bird]'s moments.", and a `save_errors` row.
- Not on edit, challenge entries or pod posts.

## 6b. Post options: report and block · See Final-08-PostOptions

Every post and comment (Feed cards, the post page, comment threads, Chapter posts, pod and challenge posts) has a **···** button that opens one **Post options** sheet (white, serif title, round Close), replacing today's separate menus in `PostMenus`:

- **Someone else's post or comment:** **Report this post** (question-mark icon; "Report this comment" on a comment), **Report this member** (speech icon), **Block this member** (red text on a pale red row, `K.red`), then the line "Reports go to the Kya team. Blocking hides their posts and comments from you."
  - Report this post/comment opens the existing `ReportSheet` for that subject.
  - Report this member opens the same reasons for the author (new subject type `member`, below).
  - Block this member opens the existing `BlockSheet` confirmation.
- **Your own post or comment:** **Edit** and **Delete** instead (today's behaviors: edit opens the composer; delete confirms and moves it to the 180-day hold).
- Admin tools that `PostMenus` shows today stay, below these rows, admins only.

**Report a member (new, Apple 1.2):** `flock_report` accepts subject type `member` (additive: the check constraint and the function's allowed list are rebuilt from their live definitions, as `20261125010000_journeys_member_skills.sql` did for `journey`). Reported from Post options, member profiles and chapter Members rows (next to Block). A member report never hides anything on its own (the threshold rule is for content); it appears in `/admin/review` → Reports with the member's profile, and the reviewer can message, keep, or remove the member's content as today. Journey and journey-update menus keep their own report and block entries.

## 7. Library · See Final-06-Library, Final-07-Filters

- **Replace the two chip rows** with a white search field ("Search the library") and a forest **Filters** pill beside it, with a count badge when filters are on.
- Under them, the current sort in small quiet text ("Newest first").
- **Active filters** show as removable chips (name ×) with **Clear all**, between the search and the grid.
- **Results:** a two-column grid of cards: cover on top (the type's pale color with an icon when there's no cover), eyebrow **TYPE · SUBJECT** (teal on light, the first subject), bold title up to 2 lines. The vet-reviewed badge stays, small, on the cover.
- **Filters sheet** (Final-07): serif "Filters", round Close; **TYPE · pick as many as you like** (Guides, Checklists, Videos, Links), **SUBJECT** (Foraging, Diet, Training, Hormones, Conservation), both multi-select chips; **SORT** (Newest, Oldest, A to Z), one choice; at the bottom, **Clear all** and a gold **Show N resources** button with the live count, which applies and closes.
- **URL:** `?q=&type=guides,videos&subject=diet,training&sort=newest`; old single values still read.
- **Data:** add `flock_library_search_many(p_q text, p_types text[], p_topics text[], p_sort text)` (SECURITY INVOKER, so the table's RLS still decides); keep the old function.
- "Manage library" for admins stays.

## 8. Care side: share a moment with the community · See Final-09-Moment

The mockup shows the moment sheet redrawn ("Add a moment for Echo", "Add a photo or video", WHAT HAPPENED?, WHEN, Save moment). **Don't redraw it:** the care app stays as it is for everyone, so build against the existing "Add a milestone" sheet and **add only the switch**, styled as in the mockup (a pale box, "Also share with the community", line "Posts to the community Feed with [bird]'s photo", a forest/lime switch), above Save. (Moments hold photos only, so "or video" doesn't apply.)

- **Who sees it:** only when `flock_enabled()` is true, **and** you can use the Flock (`flock_my_access()`: member or admin), **and** you own the bird, **and** the bird is one you show in the Flock (`flock_shown_birds`; Brittany, Nov 28). Free accounts never see it, and the page makes **no new network call** for them: it reads the cached gate (`FLOCK_ENABLED_QUERY`) first and asks for access only after the gate says yes.
- **Default:** off. (The mockup draws it on to show the "on" state.)
- **What it does:** after the moment saves, it creates a Flock post in the space decided in question 6 (Learn together until then) with the moment's title as the post title, "[Bird]'s [moment title]" as the body, the moment's photo copied into `flock-posts` server-side (re-encoded, no EXIF), and the bird attached. The vet nudge runs on the text like any post.
- Not on editing a moment, and never on the automatic anchors (gotcha day, birthday, years together).
- **Shared-code rule:** the switch lives in Flock code and is lazy-loaded; the moments page imports only the gate helper from `src/lib/flock.ts`. The PR shows before/after screenshots of the sheet as the free staging account (identical) and runs the free-user regression.

## 9. Community guidelines page · See Final-10-Guidelines

`/flock/guidelines`, a sub-page: forest header with **Back**, the serif title "Community guidelines" and a short intro under it; then **expandable cards** (white, 18px radius, serif title, chevron, a one-line summary visible when closed, the full text when open): **What we believe**, **How we treat each other**, **Health questions go to your vet**, **Posting and sharing**, **How moderation works**; then an outlined **Report something** button; then the contact line (`contactLine`, unchanged).

- **Words: placeholder for now** (Brittany, Nov 28; she's writing the final guidelines separately). Use the mockup's placeholder text, all of it in the review queue. If her final text has landed in `src/lib/flockGuidelines.ts` by the time this is built, use that instead.
- `src/lib/flockGuidelines.ts` stays the one place the words live; the page, the agreement screen and the join step read from it.
- **Version:** when the words change, `FLOCK_GUIDELINES_VERSION` and `private.flock_guidelines_version()` change together (the existing test checks they match). The Flock isn't open, so no member has agreed yet; bump the version when Brittany's final text replaces the placeholder. **The placeholder must be replaced before opening** (added to the opening checklist in `docs/BACKLOG.md`).
- **Report something** opens a small sheet: "Report a post or comment" (explains the ··· on every post), "Report a member" (opens member search, then the member report), "Email the Kya team" (`FLOCK_CONTACT_EMAIL`).

## 10. Guidelines agreement screen · See Final-11-Agreement

**Mostly built:** `flock_agreements` already stores who agreed, when and to which version; the `/flock` layout already sends anyone who hasn't agreed to the current version to `/flock/join` before anything else renders; a version bump already asks everyone again. Nothing else in the community is reachable before agreeing. No new columns are needed.

The new screen (Final-11): a forest top with a lime shield tile, serif **"Welcome to the Flock"** and the line "Before you join in, take a minute to read how we take care of each other here."; a white card of four short points (Be kind · Health questions go to your vet · Share what's yours · **Zero tolerance for abuse**, each with a dot and one line); a **Read the full guidelines** link (opens `/flock/guidelines` and returns); the gold **"I agree, take me to the Flock"** button; and "You'll see this again if the guidelines change." under it.

- **Copy is placeholder** (review queue), but **the zero-tolerance line stays** in the final version (Apple 1.2). The four points live in `flockGuidelines.ts` with the rest.
- **First-time joiners:** the chapter choice and "I'm 18 or older" stay, on the join screen before this one (Brittany, Nov 28; the database refuses an agreement without the age confirmation). That screen loses its guidelines text and "I agree" checkbox; "Continue" takes you to Final-11, whose button records the agreement and joins (`agreeAndJoin`).
- **Re-agreeing** after a version bump: straight to Final-11.
- **Admins** still skip the gate. Add `/flock/join?preview=1` so Brittany can see the screens; it records nothing.

**Apple guideline 1.2 check:**

| Requirement | Status |
|---|---|
| Report posts, comments, journey updates, journeys | Built: `flock_report`, `ReportSheet`, `/admin/review`. Reached from Post options (6b). |
| Report a member | **New:** section 6b (CR13). |
| Block members | Built: `flock_block`; Post options (6b), profiles, chapter Members, `/flock/you/blocked`. |
| Agree to terms, with zero tolerance for objectionable content, before using | Built gate; the new screen (10) states zero tolerance. |
| Contact the developer | Built: the contact line in settings and on the guidelines page. |

---

## Out of scope

- Any change to the care app's bottom bar, Home, Sits, Health, Explore, or the moment sheet beyond the one switch.
- A Flock-wide events page.
- Push or email for any of this.
- Dutch strings (CR14, after the rest).
- The Journeys and Chapter screens' own chips and sub-tabs.

## Decisions (Brittany, Nov 28, 2026)

1. **Guidelines words:** placeholder for now; final text comes from her separate guidelines work.
2. **Join steps:** chapter and "I'm 18 or older" stay, before the "I agree, take me to the Flock" screen.
3. **Feed contents:** badges, challenges, votes, the weigh reminder and journey moment cards stay on the Feed.
4. **Story circles:** journeys you follow first, filled out with community journeys.
5. **Weigh & check:** goes to the care app's `/check` and stays in the care app.
7. **Shared moments:** offered only for birds you show in the Flock.
8. **Space dots:** as the mockups draw them (Start here lime, Learn together gold, Do good teal, chapter green).
9. **Mockups:** the approved file above.

## Open question

6. **Where shared moments post, and a catch-all space.** Brittany is considering turning Learn together into the catch-all space for everything (shared moments included), possibly under a new name ("The perch", "Flock talk", "Around the flock" or "General Q&A" were suggested). A rename changes only labels and the description (the slug stays `learn`, no database change), and would touch the menu, Post to tiles, card tags and the Spaces copy. Until she decides, the mockups' "Learn together" stands and shared moments post there.
