# Bird-view + sitter-view copy review

Fill the **New heading** / **New subheading** columns. `{name}`, `{species · age}`, etc.
are runtime values. Eyebrow = the small label above the heading. This file is a
scratch doc (not committed / not part of the app).

## Bird view

| Screen (file) | Current heading | Current subheading | New heading | New subheading |
|---|---|---|---|---|
| Bird record (`birds/$birdId.index.tsx`) | `{name}.` | identity line `{species · age}` — foster eyebrow: "In your care" |  |  |
| Care plan — overview (`birds/$birdId.plan.index.tsx`) | Everything a caregiver needs. | What you've taught yourself about how they're cared for. |  |  |
| Care plan — read view (`birds/$birdId.care-plan.tsx`) | `{name}` | `{species · age}` — footer (no edit): "Read-only. Only {name}'s owner can edit the care plan." |  |  |
| Weight (`birds/$birdId.weight.tsx`) | `{grams} g.` / "Weight." | "Up/Down/Steady … over {span}." / "No weights yet — pop {name} on a scale and log the first one." |  |  |
| Health check — run (`birds/$birdId.scan.tsx`) | Health check — {name} | (none) |  |  |
| Health check — result (same file) | `{result.message}` | eyebrow: "Call your vet now" / "Keep a close eye" / "All clear logged" |  |  |
| Health check — detail (`birds/$birdId.scans.$scanId.tsx`) | Concern flagged. / Something to check. / All clear. | {name} · {runBy} · {when} |  |  |
| Journal (`birds/$birdId.journal.tsx`) | What's been happening. | Small things noted now become signals later. |  |  |
| Moments (`birds/$birdId.moments.tsx`) | Days worth marking. | Worth coming back to. |  |  |
| Identity (`birds/$birdId.identity.tsx`) | Who {they} {are} on paper. | The part of the record that never changes. |  |  |
| Vet summary (`birds/$birdId.vet-summary.tsx`) | One sheet for the vet. | (none) |  |  |
| Who can see (`birds/$birdId.access.tsx`) | Who can see {name}'s record | (none) |  |  |
| Export (`birds/$birdId.export.tsx`) | Export {name}'s record | (none) |  |  |
| Hand off (`birds/$birdId.handoff.tsx`) | Hand off {name} | (none) |  |  |
| Care-plan editor (`birds/$birdId.plan.editor.tsx`) | `{name}` | `{species}` (uppercase) |  |  |
| Add a bird (`birds/new.tsx`) | Add a bird. / (foster) Take in a bird. | Start with the basics — a sitter-ready care plan comes next. |  |  |

### Setup wizard steps (`birds/$birdId.setup.tsx`) — heading = step title, subheading = step-instruction banner

| Step | Current heading | Current subheading | New heading | New subheading |
|---|---|---|---|---|
| 1 | Food & water | What does {name} eat, and how much? Structured answers help the sitter know exactly what to serve and when. |  |  |
| 2 | Personality & handling | How does {name} like to be treated? What should a sitter expect? |  |  |
| 3 | Environment & safety | What does a sitter need to know about your home? |  |  |
| 4 | Health baseline | Help your sitter know what's normal for {name}, so they can spot what isn't. |  |  |
| 5 | A day in the life | Build the daily rhythm. Feedings, water, cleaning, and medication come in automatically from the Food and Health steps — add anything else here, like uncovering the cage or playtime. Auto-added items are tagged and edited in their own step. |  |  |
| 6 | Tips from the owner | Record a few short clips so your sitter can see how things are done. All clips are private — only your assigned sitter can play them. |  |  |
| 7 | Emergency info | (none) |  |  |
| 8 | Review & finish | Here's exactly what your sitter will see for {name}. Scroll inside the preview to explore the sitter's Today screen. |  |  |

Care-plan section card titles (not full screens, no subheadings): Food "What {name} eats" · Behavior "Handling {name}" · Home "{name}'s home & safety" · Health "What's normal for {name}" · Routine "Daily rhythm" · Emergency "Emergency".

## Sitter view (token screens)

| Screen (file) | Current heading | Current subheading | New heading | New subheading |
|---|---|---|---|---|
| Sitter home (`components/SitterDashboard.tsx`) | Welcome | You're caring for {names}. Tap any bird to see their day and check in on how they're doing. (loading: "Loading the birds in your care…") |  |  |
| Per-bird Today (`sitter/$token/index.tsx`) | `{bird.name}` | `{species · age}` — eyebrow: "Welcome — here's who you're caring for" |  |  |
| Care sheet (`sitter/$token/care-sheet.tsx`) | {name}'s care sheet | Owner-entered reference |  |  |
| Parrots 101 (`sitter/$token/guide.tsx`) | Parrots 101 | General parrot care basics — not specific to {name}. For {their} actual needs, follow {their} care plan. |  |  |
| Emergency mode (`sitter/$token/emergency.tsx`) | Emergency mode | (none) — first section: "The four emergency rules" |  |  |
| Health check — run (`sitter/$token/scan.tsx`) | Daily health check — {name} | (none) |  |  |
| Health check — result (same) | `{result.message}` | (status label above) |  |  |
| Past health checks (`sitter/$token/scan.tsx`) | Past health checks — {name} | (none) |  |  |
| Link error (`sitter/$token/route.tsx`) | This sitter link has expired / was turned off / isn't valid / can't be opened | (matching body line per case) |  |  |

## Notes / inconsistencies
- No subheading: Vet summary, Emergency setup step, Emergency mode (sitter), the run/result screens, and the access/export/handoff utility screens.
- Two "care plan" identities: overview ("Everything a caregiver needs.") vs read view (`{name}` only) — candidate to unify.
- Pattern split: content screens use eyebrow + headline + body; utility screens use a plain heading with no subheading.
