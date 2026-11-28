# Community (Flock) navigation redesign

**Status:** spec, not built. Backlog items CR1–CR14 in [`docs/BACKLOG.md`](../BACKLOG.md) ("Ready to build").
**Written:** Nov 28, 2026, from Brittany's brief, after a read of the code on `main`.
**Scope:** the community side only (everything under `/flock`, plus one switch on the care side's moment form in section 8). The care app's Home, Sits, Health, Explore and its bottom bar with the Community button stay exactly as they are.

## Ground rules (every item)

- **Behind the Flock gate.** Nothing here renders, fetches or ships code for a non-admin while `flock_enabled()` is false (CLAUDE.md, "Flock safety rules"). Section 8 is the only change outside `/flock`; it follows the shared-code rule (pixel- and behavior-identical for non-admins, Flock code lazy-loaded, "Free-user impact" in the PR).
- **Database: additive only.** New tables, columns and functions. No renames, drops, or changed policies on anything the care app uses.
- **New copy goes in `docs/REVIEW_QUEUE.md`.** Every new or changed line, before and after. English only for now: the Flock's navigation and feed strings have no Dutch yet (`nl.jsonc` falls back to the English defaults), so Dutch is one item at the end (CR14), not a step in each.
- **Reuse.** Existing components, routes and the `K` tokens in `src/components/kya.tsx`. Two colors in the brief aren't tokens yet; CR1 adds them to `K` (additive, unused by care screens):
  - `gold: "#e8b44c"` (primary actions: the center plus, Post, "Your journey"'s plus). `K.sunflower` (`#f2b33d`) is close but is the care app's; the brief's gold is its own value.
  - `limeLight: "#e0eed1"` (selected tiles).
  - Already tokens or CSS variables: forest `K.forest`, page `K.mist`, lime `K.lime`, amber fill `K.amberBg`, teal on dark `K.teal`, card border `--sage-100` (`#e7ece6`; `K.line` is `#e3ebe2`, use the variable), teal on light `--teal-on-cream` (`#5a8c7a`), Newsreader `SERIF` / `KyaHeading`.
- **Old links keep working.** Every URL that exists today still opens something sensible (`FLOCK_REDIRECTS` in `src/lib/flockNav.ts`).

---

## What exists today (read Nov 28, 2026)

| Area | What's built | Where |
|---|---|---|
| **Moments on the bird page** | `public.moments` (care table): `kind` gotcha_day / birthday / years_together / custom, `title`, `on_date`, `photo_path`, `recurs`, `auto_generated`. No body text. A custom moment is added from the "Add" sheet on `/birds/$birdId/moments`: a title, a date and one photo (re-encoded, uploaded with `uploadJournalPhoto`), then a direct `insert`. **Only the bird's owner can write** (RLS "moments insert/update/delete" = owner; household members read). Anchor photos per year live in `anchor_photos`. | `src/routes/_authenticated/birds/$birdId.moments.tsx`, `20260621120000_multi_owner_access_foundation.sql`, `20260626160000_capability_write_policies.sql` |
| **Daily idea** | Built (step 4C). `flock_ideas` + `flock_idea_tries` (loved / curious / not_for, a bird, optional photo). `flock_todays_idea()` returns today's ready idea or a favorite. `TodaysIdeaCard` on Today links to `/flock/idea` ("We tried it", or "You tried it · See how everyone did"). Admin schedule at `/admin/ideas`. | `src/components/flock/IdeaParts.tsx`, `src/lib/flockIdeas.ts`, `flock.idea.tsx` |
| **Journeys** | Built (step 3, redesign 1.20). Journeys tab with For you / Following / Tricks / Basics chips; following (`journey_follows`); updates (`journey_post_update`, clip + engagement + caption, "big moment"); **a story-style viewer exists**: `/flock/journeys/$journeyId/story` (tap sides, "Go [bird]", `?queue=following` moves to the next bird). Today shows `FollowRings` ("Journeys you follow", rings from `journey_following_latest`) and moment cards. Posting an update: `/flock/journeys/$journeyId/post`. | `flock.journeys.*.tsx`, `JourneyBrowse.tsx`, `JourneyToday.tsx`, `src/lib/journeyData.ts` |
| **Report and block** | Report: `flock_report` for **post, comment, journey update and journey** (`ReportSheet`); threshold hides, `/admin/review` resolves. Block: `flock_block` everywhere (post and comment menus, journey menu, chapter Members rows, member profiles), unblock in `/flock/you/blocked`. **There's no "report a member"** (a profile): see section 10. | `ReportSheet.tsx`, `BlockSheet.tsx`, `src/lib/flockBlocks.ts` |
| **Events** | Built (step 5A), per chapter only: `flock_events`, `flock_event_rsvps`; the chapter's Events tab (`/flock/chapter?tab=events`), `/flock/events/$eventId`, `/flock/events/new`. **No all-events page.** | `flock.chapter.tsx`, `EventParts.tsx`, `flock.events.*.tsx` |
| **Header** | `FlockHeader`: forest band, serif title on the left, then the **Spaces** button (opens `SpacesSheet`) and **your avatar** (opens `/flock/you`, which is Flock settings). No bell: Notifications is a row in `/flock/you`. | `src/components/FlockShell.tsx` |
| **Pill rows** | Today: Everything / Learn together / Do good / Start here (`TODAY_FILTERS`, `?space=`). Journeys: For you / Following / Tricks / Basics. Library: two rows, type (All / Guides / Checklists / Videos / Links) and subject (five topics), single-select, plus search (`?type=&subject=&q=`). Chapter: sub-tabs Posts / Events / Resources / Members. | `src/lib/flockNav.ts`, `FlockChips.tsx` |
| **Bottom bar** | Today, Journeys, Chapter, Library, My birds (`FLOCK_DESTS`), same height as the care bar; on Duo and wide windows the same five as a side column. | `FlockShell.tsx` (`FlockTabBar`, `ColumnTabs`, `DesktopColumn`) |
| **New post** | `PostCompose` (`/flock/post/new`): Cancel / "New post" / Post (or "Send for review" for Do good), Post to chips (Learn together, Do good, your chapter, Start here), Do good review note, title (optional), body ("Ask a question, share what worked, or say hello."), up to 4 photos, Attach a bird (shown birds, "name and photo only"), "Photos lose their location data when you post.", vet nudge, hourly limits. | `src/components/flock/PostCompose.tsx` |
| **Guidelines and the agreement** | **Already built** (build C). Final words (Brittany, Nov 22, 2026) in `src/lib/flockGuidelines.ts`: an intro, six sections (Be kind, Put the birds first, The Flock isn't your vet, No selling or spam, Share only what's yours, Meet up safely), a closing and a contact line. `/flock/guidelines` shows them. Agreement: `flock_agreements` (who, when, version), `FLOCK_GUIDELINES_VERSION` = `private.flock_guidelines_version()` = "2026-12"; a version change sends everyone back to `/flock/join` on their next visit. The join step asks for a chapter, "I'm 18 or older" and "I agree". **Admins skip it**, so Brittany has never been asked. | `flockGuidelines.ts`, `flock.join.tsx`, `src/lib/flockJoin.ts`, `20261122100000_flock_open_to_members.sql` |
| **Notifications** | `flock_notifications`, `flock_notifications_list`, `private.flock_notifications_unread()` (an unread count already exists); screen `/flock/you/notifications`. | `src/lib/flockModeration.ts` |
| **Weigh and check** | The care app's daily health check list, `/check` (all birds, up next / done today; `?bird=` opens one). | `src/routes/_authenticated/check.tsx` |

---

## 1. Community bottom bar

Left to right: **Feed**, **Journeys**, **Add something** (center), **Library**, **My birds**.

- "Today" becomes **Feed** (label, `flock.nav.feed`). The route stays `/flock`; `FlockTab` `"today"` may be renamed in code, but the URL doesn't change.
- **Chapter leaves the bar** and moves into the menu (section 3). `/flock/chapter` and its sub-tabs keep working; on those screens no bar tab is lit (`destForPath` returns null for chapter, events and members).
- **Center button:** a raised gold circle (`K.gold`, about 56px, sitting about 14px above the bar's top edge, forest plus icon, label "Add something" for screen readers only, or shown small under it to match the other tabs; follow the mockup once there is one). It opens the Add sheet (section 5); it is a button, not a link, and never lit.
- **My birds** goes to the care app's Home (`/dashboard`) and calls `rememberMode("care")`, as today.
- **Duo column and wide windows:** the same five, in the same order, in the column (`ColumnTabs`); the center item is the same gold circle at column-tab size. Keep `useTabFit` working with five items.
- Height, border and safe-area padding stay the same as the care bar, so switching modes doesn't jump.

## 2. Community header

On every screen that uses `FlockHeader` (Feed, Journeys, Library, Chapter, Events, the guidelines page, You):

- **Remove** the Spaces button, the avatar button, and Feed's space chip row.
- **Left:** a menu button (a 52px rounded tile, about 16px radius, `K.forestDeep` fill with a `K.teal` 2px ring as the Spaces button has now, white 26px `Menu` icon). A small `K.lime` dot on its top-right corner when anything in the menu has a badge (section 3). Label "Menu" ("Menu, new activity" when the dot shows).
- Next to it, the **Kya & Co. logo** (`BrandLogo`, the white-on-dark variant used in care headers).
- **Right:** an **Updates** bell (44px tap target, white `Bell` icon) that opens `/flock/you/notifications`, with a lime dot when `flock_notifications_unread()` is above zero. Label "Updates".
- **The page title sits below** that row, in the serif (`KyaHeading`, 30px), with the optional line under it as today.
- **Feed with a space selected:** the title is the space's name ("Learn together"), with a small "Feed" crumb or a clear-filter "×" chip under it to return to everything (pick one in CR5; the URL keeps `?space=`).
- Sub-pages that use `FlockSubPage` (back arrow screens) keep their own header; they don't get the menu.

## 3. Side menu

A drawer from the left: full screen height, about 86% of the width (max 360px), white, dimmed backdrop (`bg-black/50`), a round Close button top right. A real dialog, built like `SpacesSheet`: focus moves in and wraps, Escape, a backdrop tap and a swipe left close it, focus returns to the menu button. Picking anything navigates and closes it. Lazy-loaded with the rest of the Flock.

Top to bottom:

1. **Community guidelines:** an outlined row (1.5px `--sage-100` border, 18px radius), shield icon, "Community guidelines", line "How we take care of each other". Opens `/flock/guidelines`.
2. **Feed:** a row; lime-filled (`K.lime`) when you're on Feed with no space selected. Opens `/flock`.
3. **Spaces box:** a grouped box (mist fill, 18px radius) with the eyebrow **SPACES** (teal on light). Three rows: **Start here**, **Learn together**, **Do good**, each with a small colored dot, its one-line description (the current `spaceLine` text, unchanged), and an unread count badge. A row is lime when that space is selected. Opens `/flock?space=…`. Dots (proposed): Start here `K.teal`, Learn together `K.moss`, Do good `K.gold`; the same dot is used on post cards (section 4) and the post screen (section 6).
4. **Tiles** (a two-column grid of white bordered tiles, icon, name, badge):
   - **Journeys:** badge = new updates from journeys you follow since you last opened Journeys or the story viewer. Opens `/flock/journeys`.
   - **Your chapter, by name** ("Great Lakes chapter", from `useChapterName`): badge = anything new in your chapter (posts, events, places approved) since you last opened Chapter. Opens `/flock/chapter`. Hidden when you have no chapter.
   - **Events:** no badge. Opens your chapter's events (`/flock/chapter?tab=events`). If you have no chapter, a simple "Events are coming soon" page (`/flock/events`, which is free today: only `$eventId` and `new` exist). A Flock-wide events list is out of scope here.
5. **MY BIRDS** (eyebrow): **Home** (`/dashboard`) and **Sits** (`/sits`), one column, no descriptions; both call `rememberMode("care")`.
6. **Account** (pinned to the bottom, above the safe area): your Flock avatar, display name, and "Your profile and posts", opening your own member profile (`/flock/members/<your id>`). Under it, two side-by-side buttons: **Notifications** (`/flock/you/notifications`) and **Settings** (`/flock/you`, today's Flock settings screen, unchanged).

**Badges** hide at zero and show "9+" past nine.

**Counts (new, additive):** one RPC, `flock_menu_counts()` (SECURITY DEFINER in `private`, invoker wrapper in `public`, Flock users only, respects blocks and visibility through the existing functions), returning `{ start, learn, good, journeys, chapter }`. "Since you last looked" comes from a new table `flock_seen` (`user_id`, `area` text: start / learn / good / journeys / chapter, `seen_at`; own rows only, written only by `flock_mark_seen(area)`), set when you open that space, Journeys, the story viewer or Chapter. Your own posts never count. Cached like the gate (five minutes) and refreshed when the drawer opens. The header's lime dot = any count above zero (notifications have their own dot on the bell).

**Your own profile today** shows your profile and shown birds but not a list of your posts. "Your profile and posts" needs a **Posts** list on your own profile (and on others', through `flock_feed`-style visibility). That is CR2's job if `flock_member_profile` has nothing to list them; it's a new read function, `flock_member_posts(user, before)`, built on `flock_post_visible`.

## 4. Feed

`/flock`, top to bottom. The current cards that aren't mentioned here (badges, challenges, votes, the diet weigh reminder, moment cards) **stay**, in today's order, between the idea card and "From the spaces"; the redesign changes the top of the screen and the post cards, not what the Feed carries. (Question 3.)

1. **Journeys row.** Heading "Journeys" with "See all" (to `/flock/journeys`). A horizontal row of story circles (64px photo circles, name under, bird's photo or initial, as `FollowRing` draws them):
   - First: **Your journey**, your bird's photo (or a lime circle) with a small gold plus. With no open journey it opens the start flow (`/flock/journeys/start`); with one or more it opens a small sheet: your open journeys (Post an update) and "Start a new journey".
   - Then journeys from members: **journeys you follow** (`journey_following_latest`), with a lime ring when there's a clip you haven't seen and a plain ring when there isn't. If you follow fewer than about four, fill with recent community journeys for skills you're working on (`journey_feed`), never "Just me" journeys (the existing visibility functions already guarantee that).
   - Tapping a circle opens the **story viewer** (`/flock/journeys/$journeyId/story?queue=following`). It exists, so no journey-detail fallback is needed.
   - With nothing at all to show, the row is just "Your journey".
2. **Try today** card. Only when `flock_todays_idea()` returns an idea (built; drafts never reach members). Amber fill (`K.amberBg`), no border, 18px radius; a 52px illustration tile on the left (the idea's photo if it has one, else a category icon on lime); eyebrow **TRY TODAY** (`K.amberText`); the idea's title and its few lines (clamped to 3); a **Tried it** button (white, forest text) opening `/flock/idea`, where the outcome is picked as today. Once you've answered, the button reads "See how everyone did".
3. **From the spaces.** Heading "From the spaces", then compact post cards (a new `PostCardCompact` next to `PostCard`, reusing its parts):
   - avatar, name, the space as a small tag (dot + name) and time ("2h");
   - title (serif, bold, if there is one), body clamped to 3 lines;
   - photos as a **92px square thumbnail** on the right of the text (the first photo, center-cropped; the "own shape" rule applies only to the full post), with a **"+N"** badge when there are more;
   - **Great job** and **Comment** actions (the existing reaction and comment parts, counts as today), and the "…" menu (report, block, edit, delete) unchanged.
   - Tapping the card opens the post (`/flock/post/$postId`) as now.
   - With a space selected, only that space's posts, and the Journeys row and Try today card are hidden (as Today hides journeys today).
   - The compose prompt (`ComposePrompt`) goes: posting moves to the center plus.

## 5. "Add something" sheet

From the center plus. A bottom sheet in the app's look (as `SpacesSheet`: white, 26px top corners, handle, Close, swipe down). Title "Add something". Three rows:

1. **Weigh & check your flock**: gold fill (`K.gold`), the primary row. Opens the care app's daily health check, `/check` (all birds, weigh-in included). It leaves the community, so it calls `rememberMode("care")`; the check's own Back returns to the care app's Home, not the Feed (question 5).
2. **Post to the community**: opens `/flock/post/new` (section 6). If the Feed has a space selected, that space is preselected (`?space=`, as `ComposePrompt` does now).
3. **Post a journey update**: expands in place to a list of **your open journeys** (each already tied to one bird, so no bird picker), "[Bird] · [skill]", with the bird's photo. Picking one opens the existing `/flock/journeys/$journeyId/post`. With none, the row reads "Start a journey" and opens `/flock/journeys/start`.

## 6. New post screen

`/flock/post/new`, redesigning `PostCompose`. **Every current field and behavior stays**: which spaces you can post to, Do good review ("Send for review" and its note), title (optional), body and its placeholder, up to four photos with upload progress and remove, Attach a bird (shown birds only, "name and photo only"), the GPS note, the vet nudge, hourly limits, editing, challenge and pod variants, drafts and discard.

- **Header:** forest band with **Cancel** (left, white text), **New post** (centered, serif), and a gold **Post** button (right; `K.gold`, forest text; disabled until there's a body; "Send for review" for Do good; "Posting…" while busy).
- **POST TO:** eyebrow, then a 2×2 grid of tiles: Start here, Learn together, Do good, and **your chapter** by name. Each tile: the space dot, the name, its one-line description (the menu's lines, and "Posts for your chapter's members" for the chapter, flagged as new copy). Selected: `K.limeLight` fill, a 2px `K.forest` border and a check mark top right. Unselected: white, `--sage-100` border. With no chapter, the chapter tile is left out and the grid has three tiles (2 + 1).
- **Writing card:** one white card (18px radius, `--sage-100` border): your avatar and name at the top; a large serif title field (no visible box, "Title (optional)" as placeholder and label); the body field below it; then two side-by-side buttons, **Add photos** and **Attach a bird** (the chosen bird replaces its button's label with the bird's name and photo and a Change link, as now). Photo thumbnails sit between the body and the buttons.
- **Location note:** "Photos lose their location data when you post." with a small lock icon, under the card.
- **"Save to [bird]'s moments too":** shown only when a bird is attached **and you own that bird** (moments are owner-only; household members never see it). A checkbox, **on by default**. On Post, after the post is created, it adds a custom moment to that bird: title = the post's title, or the first 60 characters of the body if there's no title; date = today in your time zone; photo = the post's first photo, if any (moments hold one photo). The moment is written through the existing Moments system (a `kind = 'custom'` row in `public.moments`), so it shows on the bird's Moments page like any other.
  - **New, additive:** `moments` has no link to a post and no body. Add a nullable `moments.flock_post_id uuid` (no foreign key to Flock tables from a care table is required; a plain column is enough) so the post page can say "Saved to [bird]'s moments" and a second save is never made. The photo is copied server-side from `flock-posts` into the bird's moment photo storage (a server function using the service role, checking that the caller owns both the post and the bird), so the moment never depends on a Flock file that the 180-day purge might remove.
  - If the moment fails, the post still stands; show "Your post is up. We couldn't save it to [bird]'s moments." and record a `save_errors` row.
  - Not on edit, challenge entries or pod posts.

## 7. Library

`/flock/library`.

- **Replace the two chip rows** with the search field and a **Filters** button beside it (with a count badge for the number of filters chosen).
- **Filters sheet:** multi-select chips for **Type** (Guides, Checklists, Videos, Links) and **Subject** (Foraging, Diet, Training, Hormones, Conservation), single-choice **Sort** (Newest, Oldest, A to Z), and a gold **Show N resources** button with the live count. "Clear" in the sheet resets it.
- **Active filters** show under the search as removable chips (name ×) with **Clear all**.
- **Results:** a two-column grid of cards: cover photo on top (4:3, the type icon on mist when there's no cover), an eyebrow **TYPE · SUBJECT** (the first subject; teal on light), and the title up to 2 lines. The vet-reviewed badge stays, as a small mark on the photo.
- **URL:** `?q=&type=guides,videos&subject=diet,training&sort=newest`; old single values (`?type=guides`, `?subject=diet`) still read.
- **Data:** `flock_library_search(p_q, p_type, p_topic)` takes one type and one topic. Add `flock_library_search_many(p_q text, p_types text[], p_topics text[], p_sort text)` (SECURITY INVOKER, so the table's RLS still decides, exactly as the current one). Keep the old one.
- "Manage library" for admins stays.

## 8. Care side: share a moment with the community

On the bird's Moments page, the add-moment sheet (`$birdId.moments.tsx`) gets an **"Also share with the community"** switch, off by default, under the photo.

- **Who sees it:** only when `flock_enabled()` is true **and** you can use the Flock (`flock_my_access()`: member or admin) **and** you own the bird (only owners add moments). Free accounts never see it, and the page makes **no new network call** for them: the switch reads the cached gate (`FLOCK_ENABLED_QUERY`) first and asks for access only after the gate says yes, as `/flock` does.
- **What it does:** after the moment saves, it creates a Flock post in **Learn together** (question 6) with the moment's title as the post title, no body (or "[Bird]'s [moment]" if that's needed for the body requirement), the photo copied into `flock-posts` (re-encoded, no EXIF, server-side copy as in section 6), and the bird attached (if it's a shown bird; if not, the switch's line says "[Bird] will be shown to members on this post" and asks first; question 7). The vet nudge runs on the text like any post.
- Not on editing an existing moment, and never on the automatic anchors (gotcha day, birthday, years together).
- **Shared-code rule:** the switch component lives in Flock code and is lazy-loaded; the moments page imports only the gate helper from `src/lib/flock.ts`. The PR shows before/after screenshots of the sheet as the free staging account (identical) and runs the free-user regression.

## 9. Community guidelines page

`/flock/guidelines` (exists). Redesign it as: a short intro, then **expandable cards** (white, 18px radius, chevron, one open at a time is fine) for **What we believe**, **How we treat each other**, **Health questions go to your vet**, **Posting and sharing**, **How moderation works**, then a **Report something** button, then the contact line.

- **The words:** final guidelines already exist (Nov 22, 2026). Until Brittany sends new text, the cards use **her current words, grouped**, not placeholder: What we believe = intro + "Put the birds first."; How we treat each other = "Be kind." + "Meet up safely."; Health questions go to your vet = "The Flock isn't your vet."; Posting and sharing = "No selling or spam." + "Share only what's yours."; How moderation works = the closing paragraph. The five card titles are new copy and go in the review queue. If she'd rather see placeholder text until her new words arrive, the same layout takes it (question 1).
- **Report something** opens a small sheet: "Report a post or comment" explains the "…" menu on every post; "Report a member" opens the member search; "Email the Kya team" uses `FLOCK_CONTACT_EMAIL`. (Report a member is new, section 10.)
- **Version:** regrouping the same words under new headings doesn't change what members agreed to, so the version stays "2026-12". When Brittany's new text lands, `FLOCK_GUIDELINES_VERSION` and `private.flock_guidelines_version()` change together (the existing test checks they match), and everyone agrees again.
- `src/lib/flockGuidelines.ts` stays the one place the words live; the cards read their grouping from it.

## 10. Guidelines agreement gate

**Mostly built.** What exists: `flock_agreements` (user, `agreed_at`, version, adult confirmation, source), a version check that sends anyone who hasn't agreed to the current version to `/flock/join` before anything else in `/flock` renders (`joinRedirect` in the layout's `beforeLoad`), and re-agreement on a version bump. Nothing else in the community is reachable before agreeing.

Changes:

- **The screen:** for someone who has already joined (chapter chosen) and is only re-agreeing, and for the first-visit guidelines step, show the guidelines full screen (the cards from section 9, all open, or as a scroll) with one gold button, **"I agree, take me to the Flock"**. For a first-time joiner, the chapter and "I'm 18 or older" steps stay before it (the database refuses an agreement without the adult confirmation, `flock_agree(…, adult, …)`), so the one button replaces the "I agree to the community guidelines" checkbox and the Join button, not the age step (question 2).
- **Admins:** admins skip the gate today. Add a preview so Brittany can see it: `/flock/join?preview=1` shows the screen to admins and records nothing. Admins still never get blocked by it.
- **Storage:** no new columns needed; `flock_agreements` already keeps when and which version.

**Apple guideline 1.2 check:**

| Requirement | Status |
|---|---|
| Report posts (and comments, journey updates, journeys) | Built: `flock_report`, `ReportSheet`, `/admin/review`. |
| Block members | Built: `flock_block`, everywhere, `/flock/you/blocked`. |
| Report a member | **Missing.** Add it (CR13): a "Report [name]" action on member profiles and in the chapter Members row menu, next to Block; `flock_report` accepts a new subject type `member` (additive: the check constraint and the function's allowed list are rebuilt from their live definitions, as `20261125010000_journeys_member_skills.sql` did for `journey`); reasons as for posts; the report goes to `/admin/review` → Reports showing the member's profile, never hides the profile automatically (the threshold rule applies to content, not people), and "Block and report" offers both. |
| Agree to terms before using | Built (section 10 above). |
| A way to contact the developer | Built: the contact line in Flock settings and under the guidelines. |

---

## Out of scope

- Any change to the care app's bottom bar, Home, Sits, Health or Explore.
- A Flock-wide events page (the Events tile goes to your chapter's events).
- Push or email for any of this.
- Dutch strings (CR14, after the rest).
- Changing the Journeys and Chapter screens' own chips and sub-tabs (only Feed's chips and Library's rows are replaced here).

## Questions for Brittany (also in the PR)

1. **Guidelines words:** use your current final words grouped into the five cards (as proposed), or placeholder text until you send new words?
2. **The agreement button:** a first-time joiner still has to pick a chapter and confirm "I'm 18 or older". OK to keep those two before the one "I agree, take me to the Flock" button?
3. **Feed contents:** keep badges, challenges, votes, the weigh reminder and journey moment cards on the Feed between Try today and From the spaces, or move some of them (votes to Do good only, moment cards into the Journeys row)?
4. **Story circles:** journeys you follow only, or fill out with community journeys when you follow few?
5. **Weigh & check from the community:** it goes to the care app's `/check` and stays in care mode afterwards. OK, or should it come back to the Feed when you finish?
6. **Shared moments:** which space does a moment shared from the bird page go to: Learn together, Start here, or a choice in the switch?
7. **Shared moments and shown birds:** if the bird isn't one you show in the Flock, should sharing a moment show it on that post (with a line saying so), or should the switch only appear for shown birds?
8. **Space dot colors:** teal for Start here, moss for Learn together, gold for Do good. Any preference?
9. **Mockups:** should agents wait for mockups in `docs/flock/mockups/` for the menu, Feed and new post screen, or build from this spec and send screenshots for review in each PR?
