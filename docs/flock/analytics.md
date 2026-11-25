# Flock analytics: what's tracked

Payments plan, build E ("What we're learning in the free season"). This is the tracking plan for the Flock; the care app's events are listed in `src/lib/analytics.ts`.

## The rules

- **Only people in the Flock send anything.** Every Flock event goes through `trackFlock()` in `src/lib/flockAnalytics.ts`. It sends only when the person is a Flock member (`is_flock_member()`, which counts a membership once it has started) or an admin. A free account, a signed-out visitor, or anyone whose status can't be read sends nothing.
- **Flock code only.** The helper is imported only by Flock screens, Flock components and the Flock data modules (posts, journeys, ideas, events), which load only when someone opens `/flock`. The care app never loads it. `npm run test:flock-analytics` fails if anything else imports it.
- **Behavior, never content.** Events never carry post or comment text, titles, captions, photos, bird names or ids, display names, or anything else a member wrote. Each event has an allowlist of keys (`FLOCK_EVENT_PROPS`); anything else is dropped, and so is any value with a space in it or longer than 64 characters.
- **Admin and test accounts are marked.** `internal: true` on the event, and the person property `flock_internal`, for admins and for test addresses (`example.com/org/net`, `.test`, `.invalid`, `+test`). Until opening day only admins can open the Flock, so every event is internal.
- **Production only.** Analytics are off in previews and local development (`src/lib/analytics.ts`, `src/lib/deployEnv.ts`).

## What every event carries

| Property | Values |
|---|---|
| `chapter` | the member's region slug, or `none` |
| `membership` | one label: `founding`, `paid`, `gift`, `chapter_lead`, `free_season`, `comp`, or `admin` (in that order of precedence) |
| `founder`, `gift_holder`, `free_season`, `chapter_lead` | true / false, so a person can be several |
| `is_admin`, `internal` | true / false |
| `platform` | `web`, `ios` or `android` |

The same facts are set once as person properties: `flock_member`, `flock_membership`, `flock_founding`, `flock_gift_holder`, `flock_free_season`, `flock_chapter`, `flock_internal`.

## The events

| Event | When | Extra properties |
|---|---|---|
| `flock_active` | the first Flock screen of the Flock's day (Eastern), once per account per day on a device | — |
| `flock_joined` | the join step succeeds (`trackFlockJoined(source)`; **build C wires it** into the join screen) | `source`: `care_app`, `email`, `website`, `founding`, `gift` |
| `flock_post_created` | a post is created | `space`, `status` (`live` / `pending`), `has_photo`, `photo_count`, `has_bird` |
| `flock_comment_created` | a comment or reply is created | `subject_type` (post, journey update, milestone), `is_reply`, `has_photo` |
| `flock_reaction_added` | a reaction is added (not when one is taken back) | `subject_type`, `kind` |
| `flock_library_resource_opened` | a library resource is opened | `resource_id`, `resource_type`, `vet_reviewed` |
| `flock_journey_started` | a journey starts (a skill, your own skill, or "Start this skill" on a member skill) | `template` (slug, or `custom`), `is_custom`, `visibility`, `from_member_skill` |
| `flock_journey_update_posted` | an update is posted on a journey | `big_moment` ("This was a big moment"), `is_question` (the caption has a "?") |
| `flock_journey_finished` | the owner ends a journey | `how`: `learned` ("[Bird] learned it!") or `happy_where_we_are` |
| `flock_idea_tried` | "We tried it" on Today's idea | `outcome` (loved / curious / not_for), `has_photo`, `has_bird` |
| `flock_event_rsvped` | going or maybe on a chapter event (not when an RSVP is cleared) | `answer` |

Library resources are written by admins, so their id is not member content. A custom journey's name and description are member writing, so a custom journey sends only `custom`.

**Journeys redesign (backlog 1.20, Nov 2026).** Journeys have no milestones any more, so `flock_journey_milestone_reached` is retired (nothing sends it) and `flock_journey_started` no longer carries `milestone_count` or `already_count`. Events sent before the change still have those properties in PostHog. `flock_journey_finished` used to fire only when the last milestone finished a journey, with `total`; it now fires on either ending, with `how`.

## Not tracked (deliberately)

- Anything a member wrote: posts, comments, captions, titles, custom journey names and descriptions, profile bios, display names, event suggestions.
- Photos, bird names, bird ids, member ids of other people, who reacted to whom, who follows whom.
- Edits, deletes, reports and the review queue (moderation isn't engagement).
- Where a return visit came from (push, email or direct). The plan's item 6 needs a tag on push links in the service worker and native push code, which is shared code; it's a separate change.
- Anything for free users or the care app.

## The dashboard

PostHog → Dashboards → **Flock stickiness** (`https://us.posthog.com/project/516103/dashboard/2387278`). Every tile leaves out `internal = true`, so it stays empty until real members arrive. To see admin test activity before then, remove the `internal` filter on a tile without saving.

| Tile | Reads as |
|---|---|
| Weekly active members | how many different members opened the Flock each week (`flock_active`, unique people per week) |
| Active in each of the first four weeks | one row per join week (the week of a member's first `flock_active`); columns Week 1–4 are the share of that week's members who came back that week. The plan's target number is the share active in 3+ of their first 4 weeks; this grid is the week-by-week view of it |
| Most-used features | how many different members did each thing in the last 30 days |
| Joins per week | `flock_joined` per week, split by `source` (empty until build C) |

Check it monthly, and once more before the card emails go out (about a month before the free season ends).
