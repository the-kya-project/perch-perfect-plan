# Parrot Care Co-Pilot — design system

The standing visual and interaction reference for the app. Every future UI
change should inherit these rules. Values here are exact; use them verbatim.

---

## 1. Design philosophy

The app is a **calm, well-made field guide**, not "consumer app of the month."
Restraint is the brand.

Two emotional modes:

- **Owner-facing screens** (dashboard, bird pages, welcome card, onboarding) are
  **warm, aspirational, and photo-forward**.
- **Sitter-facing screens** (Today, Scan, Guide, Emergency) keep the same warmth
  in their chrome but **prioritize clarity and legibility** — they're used under
  stress.

The rule: **warmth in the chrome, clarity in the function.**

No gradients-as-decoration, no glassmorphism, no carousels-as-storefront, no
always-be-promoting energy. **One accent moment per screen**; everything else
stays calm.

---

## 2. Color

Three signal colors, each with **one fixed meaning**, used consistently and
**never decoratively**.

### Green — normal, safe, on track, done
| Token | Hex |
|-------|-----|
| Accent | `#2d6a4f` |
| Dark / brand | `#1a3d2e` |
| Pale fills | `#e8f0ec`, `#d6e8dc` |
| Lime accent | `#cdeab0` |

### Amber — needs attention, not urgent
| Token | Hex |
|-------|-----|
| Line / border | `#BA7517` |
| Text | `#854F0B` |
| Fills | `#f6e7c4`, `#f4ead2` |

### Red — act now, emergency only
| Token | Hex |
|-------|-----|
| Primary | `#993C1D` |
| Border | `#E24B4A` |
| Fills | `#FCEBEB`, `#f7d6d4` |
| Text | `#A32D2D`, `#791F1F` |

> **Hard rule:** red is reserved for **emergencies** and the **"concerning"
> health-scan state** only. Never use it for delete buttons, decorative accents,
> or anything else. The emergency button's trustworthiness depends on red
> meaning exactly one thing.

### Surfaces
| Surface | Hex | Notes |
|---------|-----|-------|
| Page background | `#f4f1e8` (or `#f3f2ec`) | Warm off-white — **never pure white**. |
| Cards | `#efe9da` | Warm cream — **never stark white**. Cards read as distinct cozy surfaces against the page. |
| Dark brand surfaces | `#1a3d2e` | Welcome card, scan header band, primary buttons. White text; `#cdeab0` / `#9FE1CB` for light-green accents on dark. |

---

## 3. Typography

- **Font:** the existing system stack (`ui-sans-serif, system-ui, …`). No custom
  web font is loaded; do not introduce one unless explicitly directed.
- **Weights — two only:** `400` regular for body, `500` for headings and
  emphasis. **Do not use `700`** for headings — it reads as a meal-kit /
  HelloFresh aesthetic, which is off-brand. Warmth comes from color, shape, and
  photography, not heavy type.

### Type tiers
| Tier | Size / weight | Color |
|------|---------------|-------|
| Screen titles / bird names | ~22px / 500 | near-black or `#1a3d2e` |
| Section headers / task names | ~14–16px / 500 | primary |
| Body | ~14px / 400 | primary |
| Detail / metadata | ~12px | secondary `#5f5e5a` |
| Eyebrow labels | ~11px / 500, uppercase | tertiary |

**Sentence case everywhere** — headings, labels, buttons. Never Title Case or
ALL CAPS. (Uppercase eyebrow labels via letter-spacing styling are the one
allowed exception.)

---

## 4. Shape and spacing

- **Corner radius is generous and friendly:** cards ~18–22px, buttons/pills
  ~12–14px, small chips fully rounded (pill). Rounded-everything is core to the
  warm feel — apply it as a **global token**, not per-screen.
- **No rounded corners on single-sided borders** (a left-edge accent stays
  square).
- Generous, consistent whitespace and vertical rhythm.

---

## 5. Contrast (accessibility)

- Every text element must meet **WCAG AA (4.5:1 for body)** against its **actual
  background** — verify inside cards and on the page, not against an assumed
  white.
- **"Muted" means a readable secondary/tertiary gray**, never a pale tint that
  washes into the background.
- **Upcoming / pending tasks render at full primary text strength.** Only
  completed items are muted with strikethrough. **Never fade out pending work.**

---

## 6. Iconography

- **One icon family**, consistent stroke weight, across the entire app.
- **No raw bullet characters (`•`) anywhere** — use styled list markup
  (`<ul>/<li>`).

---

## 7. Component patterns

**Status pills** — soft, rounded, tinted backgrounds with matching darker text
from the same color family. E.g. green pill `#d6e8dc` bg / `#1a5e3f` text; amber
pill `#f4e4c4` bg / `#84600f` text. Used for care-plan completeness, "sit
active," day-part, etc.

**Welcome card (sitter)** — dark green, photo as hero (edge-to-edge with a bottom
gradient and the bird name overlaid), permanent at the top of the Today tab,
never collapses. Below the photo: the assembled intro paragraph, then the
handling and noise must-know lines rendered **directly from structured fields**
(never from the intro prose).

**Bird card (owner dashboard)** — cream card, large bird photo as the hero with a
soft completeness pill overlaid; name / species below; a readiness pill (green
"ready to share" / amber "needs N things").

**"Due now" task card** — white/cream card with a **2px dark-green border**; the
**only** heavily bordered element on a screen, marking it as the entry point.

**Health-scan answer states** — Normal selected = green fill; Not sure = amber
fill (triggers an in-the-moment helper surfacing the relevant clip and
care-guide entry); Concerning = red fill (triggers "watch for" guidance).
Not-sure routes to "ask the owner," **never** to emergency.

**Bottom nav** — four items; Today / Scan / Guide are icon-above-label (active =
dark green `#1a3d2e`, inactive = muted readable gray `#8a897f`); **Emergency is
always a solid red pill (`#993C1D`), never muted, always the loudest item**, its
appearance independent of the active tab.

---

## 8. Accent discipline

**One accent moment per screen** (e.g. the lime sit-prompt on the dashboard).
Everything else stays calm so the accent reads.

---

**When in doubt:** favor restraint, protect the meaning of red, and keep owner
screens warm and sitter screens clear.
