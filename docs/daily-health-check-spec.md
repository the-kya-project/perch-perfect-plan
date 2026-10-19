# Daily health check: build spec

Status: ready to build · Owner: Brittany King · Mock-ups: the "Daily health check" design canvas (Claude artifact)

## Why we're building this

Weighing a bird at breakfast and taking a quick look at them is standard parrot care. Today the app makes that slow. A health check asks ten questions, and weight is logged somewhere else. Signup data shows people drop off after setup, and the ten-question check is a likely cause.

The goal is a daily habit that takes about 30 seconds. An owner who cares for their bird well should be able to open the app, type a weight, confirm the bird looks normal, and be done. Anyone who wants more detail can still get to it.

## What changes, in one paragraph

Owners get a combined **weight & health check** box. With one bird, the box sits on Home. With two or more birds, Home shows a prompt that opens one page for checking the whole flock. Each bird's page has the same box too. The health check is pre-set to "Yes, looks normal," so a normal day takes one tap. "Something's different" opens a short list inside the same box, and the owner marks only what they noticed. After saving, the box changes to show today's result and an "Add a weight" link. Sitters keep the full ten-question check.

## Decisions (locked)

1. **Weight and health check live together** in one box with one save button. Extra weigh-ins are separate and only appear once today's check is done.
2. **"Yes, looks normal" is pre-selected.** Most birds are fine most days, so a normal day should take as little effort as possible.
3. **The faded last weight is only a hint.** The weight box starts empty, with the most recent weight shown faded inside it. If the box is empty on save, **no weight is saved**. Yesterday's weight is never copied into today.
4. **Checks count at any time of day.** The morning wording is a suggestion. A check belongs to the owner's local "today," using `localDateISO()` (shipped in PR #321).
5. **All weights are equal.** Each weight is a timestamped entry with an optional before or after meal tag. None is treated as the "official" weight for the day.
6. **"When" fills in automatically** and is not editable here. It shows "Today, 7:42 am" as plain text. Back-dating stays on the full weight page.
7. **Keep the "Relative to a meal (optional)" buttons.** Before meal / After meal, with neither selected by default. Tapping the selected one again clears it.
8. **No database change.** Everything maps onto existing columns (see Data).
9. **Sitters keep the full ten-question check.** The quick version is for owners and household members only.
10. **Copy uses "&"**: "Weigh & check your flock," "Save weight & health check."

## Screens

### Home with one bird (`/dashboard`)

The check box is the first card under the header. It is the same component as on the bird page (see "The check box" below). It does not overlap the green header; it sits in normal page flow with standard spacing.

- **Not done today:** the full box.
- **Done today:** the box shrinks to its done state, as in the HomeOneDone mock-up.

No "flock" wording appears for a single bird.

### Home with two or more birds (`/dashboard`)

A prompt card at the top (Home B in the mock-ups):

- Title: **Daily health check**
- Body: **Grab a weight and a quick once-over of your birds.**
- Button: **Weigh & check your flock** opens the flock check.

Once every bird is checked today, the card changes to its done state ("All birds checked today" plus a list of the times). If only some are checked, the button reads "Finish your flock check (2 of 4 done)."

### Flock check (new route, e.g. `/check`)

An accordion with one section per bird (FlockE mock-up, lime card).

- The first bird not yet checked is open. The others are collapsed rows showing name, photo and status ("Checked 7:42 am" or "Not checked yet").
- Each open section holds the check box for that bird.
- The save button reads **Save · next: {name}**. Saving collapses that bird, marks it done and opens the next unchecked bird. The last bird's button reads "Save weight & health check," and after it a summary shows each bird's result.
- Birds can be done in any order. Tapping a collapsed row opens it.
- Leaving partway is fine; what's saved stays saved.

### Bird page (`birds/$birdId.index.tsx`)

The check box sits under "Lately" (weight trend and recent checks) and above the list of sections. Below it:

- "Health checks" opens the existing history list.
- "Weight" opens the weight page with its chart. The chart stays on the weight page; do not build a separate chart screen.

### The check box (shared component)

Layout follows the app's existing Log weight form, top to bottom:

| Element | Detail |
| --- | --- |
| Heading | "Today" / "Weight and health check" / status line ("Not done yet") |
| Label | **Weight (grams)**, 12px, weight 500 |
| Input | 44px tall, white, 18px text, numeric keyboard (`inputMode="decimal"`). Placeholder = most recent weight, faded. Empty by default. |
| Label | **When** |
| Value | Plain text, "Today, 7:42 am", set when the box opens and refreshed on save. Not an input. |
| Label | **Relative to a meal (optional)** |
| Buttons | Before meal / After meal, 44px. Selected = ink `#1a3d2e` with white text; unselected = white with an inset `#e0d8c4` ring. |
| Label | **Health check**, with the question "Does {name} look like usual?" |
| Radio | **Yes, looks normal** (pre-selected) · **Something's different** |
| Button | Save (label rules below) |

**Save button label**

- When the weight box has a number: **Save weight & health check**
- When it's empty: **Save health check**
- In the flock check: **Save · next: {name}**. If the box is empty, it saves the health check only, as above.

**"Something's different" (inline, BirdSuggest mock-up)**

Choosing it opens a panel inside the same box. Nothing navigates away.

- "What's different with {name}?" / "Tap everything you noticed."
- Ten chips, one per question in `SCAN_FIELDS`: Alertness, Eating, Droppings, Breathing, Perching, Vocalizing, Fluffed up, Face or vomiting, Injury, Fumes or toxins.
- Each chip that's tapped gets a row with **Not sure** / **Concerning** (default Not sure).
- Note (optional), a text field.
- **Back** returns to "Yes, looks normal" and clears the chips.
- The save button reads **Save health check** (or "Save weight & health check" when a weight is typed).
- After saving, show the triage result in the box (green/yellow/red message from `computeTriage`) with the existing "what to do" lines for yellow and red.

**Done state**

After saving, the box changes to:

- Today's weight and time ("109 g · 7:42 am · before meal"). If no weight was saved: "Health check ✓" plus an **Add today's weight** link.
- The health result ("All normal," or the triage summary).
- **Add a weight** opens the Extra sheet ("Add a weight for {name}": weight, When = now, Before/After meal, Save). It saves a new `weight_entries` row and touches nothing else.
- Tapping the health result opens that check's detail page (`birds/$birdId.scans.$scanId`).

A second health check on the same day is allowed (from the Health tab or the full scan). The box always shows the latest one.

## Data (no migration)

**On save:**

1. **Health check** inserts one `daily_logs` row, the same as `birds/$birdId.scan.tsx` does today:
   - `log_date: localDateISO()`, `source: "owner"` or `"household"`, `run_by`, `sit_id` when a sit is active (same rule as the scan page).
   - "Yes, looks normal" sets all ten status fields to `"normal"`.
   - "Something's different" sets the tapped fields to `"not_sure"` or `"concerning"` and the rest to `"normal"`. Field mapping matches the scan page (`noise → behavior_status`, `fluffed → energy_status`, `vomiting → vomiting_status`, and so on). Reuse that mapping rather than copying it.
   - `triage_status`, `triage_reasons` and `triage_reason_codes` come from `computeTriage(answers)`.
   - The note goes in `notes`.
2. **Weight**, only if the box has a valid number, inserts one `weight_entries` row:
   - `grams`, `measured_at: now()`, `meal_relation: "before_meal" | "after_meal" | null`, `source`, `logged_by`, `sit_id` when active.
3. Save the health check first, then the weight. If the weight insert fails, keep the health check, show "Weight didn't save. Try again," and leave the number in the box.

**Reading "done today":** a bird counts as checked when it has a `daily_logs` row with `log_date = localDateISO()`. Weight is not required.

**Placeholder:** the bird's most recent `weight_entries.grams` (any source). If there's no weight yet, the placeholder reads "e.g. 95."

**Refactor suggestion:** pull the scan page's answers-to-row mapping into one shared helper in `src/lib/` (for example `buildDailyLogRow(answers, ctx)`). Then the scan page, the check box and the flock check all write the same shape.

## Validation

- Weight must be between 1 and 5000 g (the same range as the Weight page), with one decimal place allowed. Out-of-range values show an inline error; don't block the health check if the weight is cleared.
- If the new weight differs from the most recent one by more than 10%, ask "That's 18% lower than last time. Save anyway?" (Save / Fix). This catches typos like 1090 for 109.
- The check box can't be saved twice by double-tapping. Disable the button while saving.

## Analytics (PostHog)

| Event | Properties |
| --- | --- |
| `daily_check_viewed` | `surface: home_one \| flock \| bird_page`, `bird_count` |
| `daily_check_saved` | `surface`, `result: normal \| different`, `had_weight`, `meal_relation`, `triage`, `local_hour` |
| `daily_check_different_opened` | `surface` |
| `flock_check_completed` | `bird_count`, `duration_s` |
| `extra_weight_added` | `surface` |

Keep firing `health_scan_run` from the full scan only, so the two can be compared. The question to answer after launch: what share of active owners save a check on 3 or more days a week, compared with before launch.

## Out of scope for this build

- Changing the sitter check (it stays at ten questions).
- Reminders or push notifications for the daily check (a natural next step).
- Moving the remaining server-side UTC dates to local time: `handoff.functions.ts`, the care-plan-reminders cron, `findCoveringSit`, and the vet-summary cutoff.
- Editing or back-dating from the check box (the full weight page still does this).

## Test plan

Automated:

- A unit test for the shared row builder: "normal" sets all ten fields to normal; one "concerning" on a `redOnConcerning` field gives red.
- An empty weight box inserts no `weight_entries` row. This is the hint-only rule; make it an explicit test.

By hand, on staging or a Vercel preview, on an iPhone and an Android phone:

- One bird: Home shows the box, saving switches it to done, and the bird page shows the same state.
- Three birds: the Home prompt opens the flock check, the "next" flow works, leaving partway keeps progress, and the Home card shows "2 of 3 done."
- An empty weight saves the health check only. The done state shows "Add today's weight."
- "Something's different": tap two chips, mark one Concerning, save, and the triage message and detail page are correct.
- A check after 5pm Pacific is dated today (the PR #321 fix).
- The household member role saves with `source: household`. A sitter still sees the full check.
- An active sit sets `sit_id` the same way the scan page does.

## Rollout

The app doesn't use feature flags yet. The simplest safe path is to ship to a Vercel preview, have Brittany use it on her own birds for a few days, then merge. The Health tab, full scan and weight page don't change, so reverting the merge is a clean rollback. If a gradual rollout is wanted later, a PostHog flag (`daily-check-v1`) would be the first one in the codebase.
