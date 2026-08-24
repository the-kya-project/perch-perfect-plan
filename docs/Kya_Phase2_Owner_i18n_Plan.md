# Kya Phase 2 — Owner-app i18n: inventory & architecture plan

Status: inventory only. No application code changed by this document (the one temporary `lng` flip used for observation was reverted). `main` was at `4c0f643` when this was written; branch `i18n/phase2-inventory`.

Recommendations are marked **Recommend** with the rejected option stated. Every claim is cited with `path:line`.

---

## Premises re-verified (escape hatch)

All confirmed against code/DB before proceeding; nothing else contradicted:

- **Two-instance i18n exactly as described.** `src/lib/i18n/i18n.ts`: `initReactI18next` applied only to the default instance (`:57-60`), pinned `lng: DEFAULT_LOCALE` (`:58`); `sitterI18n = i18next.createInstance()` (`:65`) not wired to react-i18next. `src/lib/i18n/config.ts:12` `DEFAULT_LOCALE="en"`; `pickLocale` collapses every non-`nl` tag to `en` (`:16-20`). `__root.tsx:238` wraps the whole app in `<I18nextProvider i18n={globalI18n}>`; the sitter route nests its own `<I18nextProvider i18n={sitterI18n}>` (`sitter/$token/route.tsx:82`).
- **360 keys** en/nl, namespace `translation`; prefix histogram matches (note: the 7-key prefix is `careCards`, not "carePlanCards"). `routine` = 41 keys. `emails.*` server-only.
- **5 `ssr:false` routes**: `_authenticated/route.tsx:11`, `handoff.$token.tsx:16`, `reset-password.tsx:8`, `sitter/$token/route.tsx:20`, `invite.$token.tsx:18`.
- **Phase 2 not started**: zero `useTranslation`/react-i18next imports in any `src/routes/_authenticated/**` route file.
- **No owner language control** exists (`grep changeLanguage|SUPPORTED_LOCALES|LanguagePicker` in `_authenticated`+`components` = empty). Account-settings area exists: `_authenticated/account.tsx`, `account.index.tsx`, `account.security.tsx`.
- **`profiles.locale`**: 8/25 populated, all `en`; 17 null (query below).

---

## Item 1 — Blast radius (measured) and the rework count

**Owner-context blast radius = 70 keys**, across five shared components rendered under `globalI18n` (the root provider). Corrected from the original ~160: `CareSheetView` (59) and `SitterOnboarding` (34) have **no owner render path** — `<CareSheetView>` renders only at `sitter/$token/care-sheet.tsx:34`, `<SitterOnboarding>` only at `sitter/$token/route.tsx:216`, both inside the sitter provider; the owner "view as sitter"/sit-preview surfaces render the real sitter route via `<iframe>` (`birds/$birdId.view-as-sitter.tsx:66`, `sit-preview.$sitId.tsx:79-80`) → `sitterI18n`, not owner context.

| Prefix | Keys | Owner route(s) / render path |
|---|---|---|
| `scanForm` | 25 | `_authenticated/birds/$birdId.scan.tsx:152` → `<ScanForm>` |
| `passingGuidance` | 26 | `_authenticated/birds/$birdId.farewell.tsx:179` → `<PathDetail audience="owner">` |
| `concernFlow` | 9 | `_authenticated/birds/$birdId.concern.tsx:68` → `<ConcernFlow>` |
| `careCards` | 7 | `_authenticated/birds/$birdId.care-plan.tsx` → `CarePlanView` → `carePlanCards` helpers |
| `disclaimer` | 3 | `index.tsx:112`, `_authenticated/dashboard.tsx:347`, `_authenticated/birds/$birdId.plan.editor.tsx:452` |
| **Total** | **70** | |

**Executed verification.** I set `globalI18n` `lng:"nl"` (temporary, reverted), ran `npm run dev`, loaded `/` (public, owner-context, renders `<Disclaimer compact/>`). The Disclaimer rendered **Dutch** — *"Let op: Geen vervanging voor diergeneeskundige zorg. Bel een dierenarts bij elk medisch probleem."* — while surrounding marketing copy stayed **English** (un-extracted literals). This proves globalI18n drives owner-context components and only already-extracted keys flip. Auth-gated owner surfaces (scan/concern/farewell/care-plan) could not be reached headlessly (sign-in required); for those the proof is the static analysis above.

### The `sitter ?` / `sitter &&` partition (applied to the 70)

Enumerated across the five components:

- **`ScanForm.tsx`, `Disclaimer.tsx`, `carePlanCards.tsx`, `ConcernFlow.tsx`**: no `sitter ?`/`sitter &&` branches. `ConcernFlow.tsx:105` hardcodes `audience="sitter"` to `PathDetail`, and its header (`:7-9`) states it is "Rendered by BOTH the token sitter route and the authenticated **covering-member** … copy as a sitter-link account." The owner route `birds/$birdId.concern.tsx` is gated to a **covering household caregiver** (`:8-13` comment; `:42` `if (ctx && !ctx.covering) navigate away`) — not the bird's owner. So `concernFlow`'s sitter framing is **correct for its audience**, not an owner-addressee bug.
- **`PassingGuidance.tsx` is already audience-aware.** `PathDetail`'s docstring (`:57-63`): the owner "sees the same headings, steps, callouts, and notes **without** the third-person framing." The sitter-framed intros/reassurance are `sitter &&`-gated (`:78, :107, :117, :130`) and the disclaimer branches owner/sitter (`:122`, with `burialDisclaimerOwner` already present). `farewell.tsx:179` passes `audience="owner"`.

### Rework count: **1 string**

The only owner-visible string that reads wrong is **`passingGuidance.stepFreezer`** — it is *not* gated (`PassingGuidance.tsx:114`, inside the burial `Steps`) so it renders to the owner, and it embeds `{{ownerName}}`. In the owner farewell flow `ownerName = display_name || "you"` (`farewell.tsx:52`), so it renders "Put them in the freezer until **you** is ready" (self-reference + broken grammar). Fix: gate it like the intros, or add an owner variant ("…until you're ready.").

Everything else in the 70 is either neutral utility copy (`scanForm`, `careCards`, `disclaimer`), correct for a caregiver audience (`concernFlow`), or already owner-branched (`passingGuidance`). So unpinning does **not** dump ~160 unreviewed sitter strings into the owner app — the shared components were built audience-aware.

### Five strings, EN + NL, for you to check my judgment

1. **NEEDS REWORK — `passingGuidance.stepFreezer`**
   EN "Put them in the freezer until {{ownerName}} is ready." · NL "Leg ze in de vriezer tot {{ownerName}} er klaar voor is."
   Why: renders to the owner with `ownerName` = their own name/"you" → self-reference; "you is ready" is ungrammatical.
2. **FINE — `concernFlow.pathsTitle`** EN "Thank you for caring for {{name}}." · NL "Bedankt dat je voor {{name}} zorgt."
   Why: `concern.tsx` audience is a covering caregiver, not the owner; thanking the carer is correct.
3. **FINE — `concernFlow.callOwner`** EN "Call {{ownerName}}" · NL "Bel {{ownerName}}"
   Why: same caregiver audience — calling the owner is the intended action.
4. **FINE — `passingGuidance.burialIntro`** EN "{{ownerName}} would like to bury {{name}}… when she's back." · NL "{{ownerName}} wil {{name}} begraven… als zij terug is."
   Why: `sitter &&`-gated (`PassingGuidance.tsx:107`) — never rendered to the owner.
5. **FINE — `passingGuidance.burialReassure`** EN "{{ownerName}} will take it from here… You've done the hard part." · NL "{{ownerName}} neemt het over… Jij hebt het moeilijkste gedaan."
   Why: `sitter &&`-gated (`:117`) — owner never sees it; and `burialDisclaimerOwner` already exists as the owner-facing variant (`:122`).

**Where item-1 rework belongs in the batch order:** trivial (1 string). Fold into the batch that touches the farewell/passing flow (Batch 3 below), or do it as a 5-minute standalone.

---

## Item 2 — Owner string inventory

**Method (repeatable).** Node script over `.tsx` files, counting **distinct** user-visible English string candidates in four categories, deduped globally (a string counts once):
- **A** JSX text nodes containing ≥2 consecutive letters (excludes pure `{expr}` and comments)
- **B** user-facing string attributes: `placeholder|title|aria-label|alt|label|submitLabel|cta|description|subtitle|eyebrow|headline|empty*|confirm*|cancel*|subject|toName = "…"`
- **C** `toast.*("…")`, `new Error("…")`, `throw new Error("…")`
- **D** `head/meta title: "…"`

Scope run: all `src/routes/_authenticated/**/*.tsx` + `/` `index.tsx`, `auth.tsx`, `privacy.tsx`, `terms.tsx`, `confirm-email.tsx`; and `src/components/**/*.tsx` excluding `components/ui/**` (shadcn primitives) and the 10 already-`useTranslation` components. Script: `scratchpad/i18n2/count2.mjs` / `count3.mjs`.

**Determinism verified** (per the Verify requirement — two early files, run twice):
- `birds/$birdId.setup.tsx`: run1 = 200, run2 = 200 (A137 B58 C4 D1)
- `birds/$birdId.index.tsx`: run1 = 112, run2 = 112 (A84 B25 C2 D1)

**Results (distinct candidates):**
| Surface | Files | Distinct | A (jsx) | B (attr) | C (toast/err) | D (docTitle) |
|---|---|---|---|---|---|---|
| Owner routes (`_authenticated/**` + 5 public) | 48 | **1200** | 922 | 193 | 46 | 39 |
| Owner components (excl `ui/`, no `useTranslation`) | 39 | **827** | 675 | 116 | 23 | 13 |
| **Combined** | 87 | **2027** | 1597 | 309 | 69 | 52 |

Top route files: `setup.tsx` 222 raw / 200 distinct, `birds/$birdId.index.tsx` 119/112, `birds/$birdId.identity.tsx` 65, `dashboard.tsx` 63, `account.index.tsx` 59, `moments.tsx` 55, `plan.editor.tsx` 54. Top owner components: `CarePlanView.tsx` 99, `SitForm.tsx` 71, `ClipRecorder.tsx` 60, `careEditors/FoodItemsEditor.tsx` 54, `SitListCards.tsx` 48, `careEditors/FoodEditor.tsx` 42.

**Caveats (why this is a grounded band, not a hard count):** category A over-counts — a sentence split by an inline `<b>`/`<Link>` yields two fragments; near-duplicate copy across files collapses to fewer keys; A also catches the occasional non-copy token. Categories B/C/D are clean (309+69+52 = **430** high-confidence keys). Applying a conservative 45–55% true-positive rate to the 1597 A-candidates gives ≈ **720–880** real copy strings from A, so a realistic **distinct translatable-string total ≈ 1,150–1,300** across owner routes + owner components.

**Conclusion:** the 600–700 estimate is **low by roughly 2×**. Real Phase-2 scope is ~**1,150–1,300** distinct strings (vs the 360 Phase-1 baseline). The authoritative number should come from `npm run i18n:extract` (i18next-parser) once extraction begins — the batch plan will surface it exactly, batch by batch.

**New category you flagged — English literals passed as props into already-translated components.** These are invisible to a per-file literal count of the component itself. Swept the five shared components' owner callers: the only instance is `birds/$birdId.scan.tsx:152` `submitLabel="Log health check"` (the sitter caller passes `t("sitter.scan.submit", …)` at `sitter/$token/scan.tsx:139`). The other four take no user-facing string-literal props from their owner callers. So this class is small (1) but real; extraction must catch it by auditing props at each shared-component owner call site, not just the component body.

---

## Item 3 — Unpinning `globalI18n`

Two ways to let the owner app speak Dutch:

- **(a) Make `globalI18n` switchable** — keep it as react-i18next's default instance and call `globalI18n.changeLanguage(locale)` at owner-locale resolution. **Recommend.**
- **(b) Add a third instance** for the owner app, provided via its own `<I18nextProvider>`, leaving `globalI18n` pinned. **Rejected**: the owner app *is* the default instance (every owner component reads it through the root provider at `__root.tsx:238`, including components that never import i18n — see the comment at `__root.tsx:232-236`); a third instance means threading a provider around the entire owner tree and re-proving hydration for it, for no benefit the switchable default doesn't already give. It also can't co-exist with `initReactI18next` being on the default without the same "steal the default" hazard the sitter instance avoids.

**What else must change with (a), and the #418 guarantee.** The pin is load-bearing only for **server-rendered** owner-context markup. Owner *app* routes are `ssr:false` (`_authenticated/route.tsx:11`), so the server emits no translated owner-app markup and a client-side `changeLanguage` before first owner paint cannot cause a server/client divergence — same reasoning the sitter instance relies on (`i18n.ts:19-29`). **But** the owner-context surfaces that *are* SSR'd — `/` (`index.tsx`, renders `<Disclaimer>`), `/auth`, `/privacy`, `/terms`, `/confirm-email` — server-render `globalI18n` text at `en`. If `globalI18n` becomes locale-switched from a *client* signal (navigator/localStorage), those surfaces reintroduce the exact Accept-Language-vs-navigator mismatch #418 is about (`i18n.ts:99-101`, `__root.tsx:179` hardcodes `<html lang="en">`). **So switching must be scoped to client-rendered (`ssr:false`) owner surfaces; the SSR'd surfaces stay `en`** (see Item 6). Concretely: resolve+`changeLanguage` inside the `_authenticated` client tree, never in `__root` SSR.

---

## Item 4 — Owner locale resolution (synchronous, no flash)

**Precedence (highest → lowest):**
1. **Manual toggle** — `localStorage` (synchronous, per-device), the account-settings control (Item 5).
2. **`profiles.locale`** — authoritative across devices, but an **async** fetch; cache it to `localStorage` on each successful read so it is available synchronously on the *next* launch.
3. **`navigator.language`** via `pickLocale`.
4. **`en`**.

**Avoiding a flash of English on cold launch.** First paint must not wait on the `profiles.locale` network read. Resolve synchronously from `localStorage` (toggle, else cached `profiles.locale`, else `navigator.language`) and `globalI18n.changeLanguage(locale)` **before** the `_authenticated` subtree renders — the same pre-paint, synchronous-`localStorage` pattern the cold-launch redirect already uses (`__root.tsx:105-134`, delivered via `head().scripts`). The async `profiles.locale` fetch runs after and only updates the cache for the next launch (and calls `changeLanguage` if it disagrees, an in-place swap, not a first-paint blocker). First launch ever (no cache): fall to `navigator.language` → worst case a Dutch-browser owner sees Dutch immediately and a same-value confirm later; an English-browser owner sees English. No English flash for a returning Dutch owner because the cache seeds the synchronous read.

**Do not** put owner locale resolution in a `beforeLoad` on an SSR'd route: `/` is SSR'd and its `beforeLoad` match is reused on hydration without re-running (`__root.tsx:107-109`). `_authenticated` is `ssr:false` so its `beforeLoad` *does* run client-side, but the synchronous module-init read above is simpler and also covers the SSR'd owner surfaces' decision to stay `en`.

**When `profiles.locale` and the toggle disagree:** the toggle wins for the UI (it is the user's explicit, most recent choice) and the toggle write updates `profiles.locale` too (Item 5), so they converge on next fetch. **The `en` ambiguity** (`pickLocale` collapses every non-`nl` → `en`, `config.ts:16-20`): a stored `en` can mean "detected English" or "detected an unsupported language, defaulted to en." **For rendering it does not matter** — both produce the English UI. It matters only for *write* policy: treat stored `en` as a real value (never auto-overwrite it; `ensureProfileLocale.ts:7-8` already does), so the only thing that can change a populated value is the explicit toggle.

---

## Item 5 — The account-settings toggle

**No control exists today.** `ensureProfileLocale` (`src/lib/ensureProfileLocale.ts`) is deliberately write-once: a module-level `ran` guard (`:13,:16-17`) and it writes only when the column is null (`:21-23`). Its comment claims "Overridable later in account settings" (`:4`) but no such UI is present.

**Home:** `_authenticated/account.index.tsx` (401 lines, the account settings page). **Recommend** a language `<select>` (en/nl from `SUPPORTED_LOCALES`) there, next to the other profile controls.

**Two write paths, kept separate:**
- `ensureProfileLocale` stays the **first-touch default**: writes only on null, never fights the user.
- The **toggle** is a distinct handler that:
  1. `supabase.from("profiles").update({ locale }).eq("id", uid)` — **unconditionally overwrites** the populated value (bypasses the write-once rule; it is the user's explicit choice);
  2. writes the synchronous `localStorage` cache and calls `globalI18n.changeLanguage(locale)` immediately, so the UI switches without a reload;
  3. needs no separate email-language write — transactional email renders from `profiles.locale` server-side (`ensureProfileLocale.ts:2-4`), so the single `profiles.locale` update **moves UI and email language together**.

---

## Item 6 — SSR'd `/auth` (and the other SSR'd owner surfaces)

`/auth` is SSR'd (not in the `ssr:false` list), 435 lines, ~35 route-level copy candidates — the only SSR'd surface with substantial copy (`/privacy`, `/terms` are static legal prose; `/`, `/confirm-email` are small).

Localizing an SSR'd surface means the **server** must choose a locale to render. Pre-login there is no `profiles.locale` and no cookie; the only server signal is `Accept-Language`, while the client resolves from `navigator.language` — divergence → React #418, the exact failure the whole two-instance design avoids (`i18n.ts:19-29`). Options:

- **(a) Leave `/auth`, `/`, `/privacy`, `/terms`, `/confirm-email` in English for launch.** **Recommend.** Price: a Dutch owner sees English sign-in/marketing/legal copy (~35 auth strings + legal prose) until they're inside the app. Low cost: signed-out users have no stored locale anyway, and these are low-repeat surfaces. No SSR flip, no #418 risk.
- **(b) Flip `/auth` to `ssr:false`.** **Rejected**: adds a loader/flash on the first meaningful screen and the task forbids turning SSR on/off; also loses SSR's SEO/first-paint value on the marketing/sign-in page.
- **(c) Cookie-based server resolve** (server reads a `locale` cookie, client seeds it): only works *after* a first visit sets the cookie, so pre-login first paint is still a guess, and it adds a server code path. **Defer** as a post-launch enhancement if English sign-in proves a real problem.

So: localize the **client-rendered** (`ssr:false`) owner app; keep the SSR'd surfaces English at launch.

---

## Item 7 — Database-stored English (live queries + output)

**App-composed, user-visible English columns** (translate/localize):
- `routine_tasks.title`, `routine_tasks.instructions` — English for *derived* tasks; owner-typed for manual.
- `daily_logs.triage_reasons` — English prose composed by the triage code.

**User-authored — stay in the owner's own words, never translate:** `birds.name`, `journal_entries.title`/`body`, `moments.title` (custom milestones; auto anchors are derived at render, not stored), `sits.title`.
**Curated content (separate concern, out of owner-i18n scope):** `guide_cards.title` (Explore cards).

**Counts (live):** `routine_tasks` 183 total — **143** carry a Stage-3 `derived` descriptor, **40** do not; **150** have instructions. `daily_logs` 63 total — **4** have `triage_reasons`, of which **2** have Stage-3 `triage_reason_codes`. `profiles` 25 (8 locale=en, 17 null).

**The 40 non-derived routine tasks are a mix** (sampled): app-generated day-routine titles with no backfilled descriptor — "Close curtains", "Open curtains", "Training or play", "Out-of-cage time" — and genuinely **manual owner-typed** rows — "He loves songs or books before he goes to sleep…", "Could do touch train…". The manual ones **stay the owner's words**. The app-generated-without-descriptor ones are a gap: they render English to any reader.

**What Stage 3 covers vs not.** `renderDerivedTask` (`src/lib/routineTaskRender.ts`) is imported **only** by `sitter/$token/index.tsx:11` (used `:223,:329`). Owner surfaces use `isDerivedTask`/`derivedSource` only to *classify* (`birds/$birdId.setup.tsx:657-658`, `CaregiverHome.tsx:296`) and then render `t.title` — **stored English**. So:
- Stage 3 covers the **sitter read path only**; the **owner read path is not covered** — Phase 2 must wire `renderDerivedTask` (with the owner locale + `routine` namespace) into the owner checklist/setup surfaces.
- Also uncovered: the **40 null-derived** tasks (backfill descriptors for the app-generated subset, or accept English; leave manual rows alone), and **2 of 4** `triage_reasons` rows lacking codes (owner concern rendering must localize from codes where present, fall back to stored English otherwise).

Live queries used: `select count(*) … from profiles/routine_tasks/daily_logs …` and a `derived is null` sample — see session transcript; key outputs:
```
profiles_total 25 | locale set 8 (all "en") | null 17
routine_tasks 183 | derived 143 | non_derived 40 | with_instructions 150
daily_logs 63 | triage_reasons 4 | triage_reason_codes 2
non_derived sample: "Close curtains", "Open curtains", "Training or play",
  "Out-of-cage time", "He loves songs or books before he goes to sleep…"
renderDerivedTask importers: sitter/$token/index.tsx only
```

---

## Item 8 — Formatting (dates, times, numbers, weights)

`src/lib/dates.ts` is a **locale-aware hub**: every formatter takes an optional `locale` (default `"en"`), `intlTag` maps `en`→`undefined` (browser default) and `nl`→`"nl-NL"` (`:17-19`); `formatDateUS` renders `DD-MM-YYYY` for nl (`:22-28`); `weekdayMonthDay`/`monthDay` pass the tag into `toLocaleDateString` (`:47-56`). Sitter call-sites pass the resolved locale; **owner call-sites pass nothing → `en`**.

**But dates.ts is under-used on the owner surface.** ~20 owner sites format dates directly with `new Date(...).toLocaleDateString(undefined, {...})` / `toLocaleString(undefined, …)` — e.g. `past-birds.tsx:107`, `dashboard.tsx:366,633`, `sits.$sitId.tsx:335`, `scans.index.tsx:29`, `household.tsx:281`, `birds/$birdId.export.tsx:203`, `birds/$birdId.vet-summary.tsx:353`, plus `moments.tsx` (×4), `birds/$birdId.index.tsx` (×3). Passing `undefined` follows the **browser** locale, which is tied to neither the pin nor the app's chosen locale — so a Dutch-browser owner already sees Dutch-formatted dates inside English UI today (inconsistent).

**Weights/numbers:** grams shown as raw integers plus a literal unit (`scanForm.grams` = "grams"; weight timelines render bare numbers). Few `Intl.NumberFormat` uses.

**Phase 2:** route every owner date/time/number/weight through `dates.ts` (and a small number/weight formatter) fed the resolved **owner** locale; replace the ~20 raw `toLocale*(undefined, …)` call-sites. This is a cross-cutting batch (Item 10, Batch 9).

---

## Item 9 — Pluralization & concatenation that break in Dutch

Manual English pluralization (`x === 1 ? "" : "s"`) and string concatenation / conditional grammar — each breaks in Dutch (different plural rules, word order, and no bare `+"s"`):
- `remembering.tsx:108` `${months} ${months===1?"month":"months"}`, `:111` years
- `dashboard.tsx:330` `${n} ${n===1?"foster":"fosters"}`, `:639` `${hrs} ${hrs===1?"hour":"hours"} ago`
- `sits.tsx:200` `d<=0?"today":d===1?"tomorrow":\`in ${d} days\``
- `birds/$birdId.plan.index.tsx:229` `${clipCount} clip${clipCount===1?"":"s"}`
- `birds/$birdId.identity.tsx:380-383` `${years} year${…}` / month / day
- `birds/$birdId.scans.$scanId.tsx:156` `item${…}`, `:230` `photos.length===1?"Photo":"Photos"`
- `birds/$birdId.moments.tsx:114` `${years} year${…} together`
- `birds/$birdId.setup.tsx:1251` `item${count>1?"s":""}`, `:1256` `diet.length===1?…`
- `birds/$birdId.index.tsx:527` `${n} ${n===1?"check":"checks"} in the last N days`, `:574` `${openFlags.length} open ${…?"flag":"flags"}`
- `birds/$birdId.plan.editor.tsx:490` `need${…?"":"s"} your input`
- `components/SitChecklist.tsx:242` `arrives in … ${d} day${…} — ${itemsLeft} prep item${…} left`
- `components/MemberOnboarding.tsx:48` nested `(and ${n-1} other${…})` inside a sentence
- `components/CaregiverHome.tsx:258` `d===0?"later today":d===1?"tomorrow":\`in ${d} days\``

**Phase 2:** convert to i18next `count` plurals (the `routine.unit.<u>_one/_other` pattern already in the `routine` catalog is the precedent) and `{{var}}` interpolation; never assemble sentences by concatenation. Relative-day phrases ("today/tomorrow/in N days") become keyed plural forms.

---

## Item 10 — Batch plan

Each batch is one review session, ends with: strings extracted to `en`/`nl`, `npm run i18n:check` clean (English byte-identical / fail-on-update passes), owner UI renders `nl` under the kill switch (Item 11), and reviewable in one sitting.

- **Batch 0 — Infrastructure.** Item 3 (switchable `globalI18n`), Item 4 (synchronous resolver + cache), Item 11 (kill switch), Item 5 (account toggle). *Done:* owner can opt into `nl`; default `en`; SSR'd surfaces stay `en`; no cold-launch flash.
- **Batch 1 — Global chrome & primitives.** `OwnerTabBar`, `components/system.tsx`, shared toasts/errors, empty states, `Disclaimer` already-extracted (verify).
- **Batch 2 — Dashboard/home.** `dashboard.tsx`, `homeData.ts`, `HomeChecklist`, `CaregiverHome`.
- **Batch 3 — Bird record + end-of-life.** `birds/$birdId.index.tsx`, `identity.tsx`, `weight.tsx`, `journal.tsx`, `moments.tsx`, `farewell.tsx` — **fold the Item-1 `stepFreezer` rework here**.
- **Batch 4 — Care plan.** `birds/$birdId.care-plan.tsx`, `CarePlanView`, `carePlanCards`, `plan.editor.tsx`, `careEditors/FoodItemsEditor`+`FoodEditor`; **wire `renderDerivedTask` into the owner checklist (Item 7)**.
- **Batch 5 — Sits & household.** `sits.tsx`, `sits.$sitId.tsx`, `household.tsx`, `household-permissions.tsx`, `SitForm`, `SitChecklist`, `SitListCards`, `MemberOnboarding`.
- **Batch 6 — Scans (owner).** `birds/$birdId.scan.tsx` (incl. the `submitLabel` prop-literal), `scans.index.tsx`, `scans.$scanId.tsx`, `scans.settings.tsx` (`ScanForm`/`ConcernFlow`/`PassingGuidance` already extracted).
- **Batch 7 — Account/settings.** `account.index.tsx`, `account.security.tsx`, `notifications.settings.tsx`, `confirm-email.tsx`.
- **Batch 8 — `setup.tsx` (2,713 lines, ~200 strings) in sub-batches**, one wizard step each: 8a food, 8b day/routine, 8c personality/behavior, 8d environment, 8e health, 8f clips, 8g emergency, 8h review + `SetupShell`/`birds/new.tsx`.
- **Batch 9 — Cross-cutting formatting & grammar.** Item 8 (route owner formatting through `dates.ts` + a number/weight formatter) and Item 9 (plural/concat → i18next).
- **Batch 10 — DB-stored English owner read path.** Owner `renderDerivedTask`; decide the 40 null-derived (backfill app-generated, leave manual); owner `triage_reasons` from codes with English fallback.
- **Deferred — SSR'd public surfaces** (`/`, `/auth`, `/privacy`, `/terms`): English at launch (Item 6); a later batch only if the cookie-resolve enhancement is adopted.

Authoritative per-batch string counts come from `npm run i18n:extract` as each batch lands.

---

## Item 11 — Kill switch

**Reassessed on your correction, and I agree with you: a gate is justified.** My earlier "less justified" reasoning was wrong — the risk isn't the fixed 70; it's the **mixed state that grows with every extracted batch**. My own executed evidence shows it: with `globalI18n` at `nl`, `/` rendered a Dutch Disclaimer inside English marketing. Each merged batch adds owner keys, so a Dutch-browser owner sees a worse English/Dutch mixture with every merge, peaking mid-phase — while `main` must stay shippable throughout.

**Recommend:** the owner locale resolver returns `"en"` unless an explicit opt-in is present, and the opt-in is a **`localStorage` flag** (e.g. `kya_owner_i18n = "on"`).
- vs **env var** — rejected: an env var is all-or-nothing per deploy, needs a redeploy to flip, and can't scope to QA/staff on prod.
- vs **query param** — rejected: not sticky across navigations/sessions.
- **`localStorage`** is per-device, **synchronous** (fits the Item-4 first-paint resolver with no extra work), lets you and reviewers opt in on production without exposing users, and costs one branch in the resolver.

**Simpler alternative considered — no flag, ship each batch already reviewed in both languages.** Rejected: until the *whole* owner app is translated, a `nl` owner sees English gaps in every un-extracted area — worse than a coherent all-English app. The flag keeps `main` at zero user-visible change until the phase completes.

**At phase end:** flip the resolver default (opt-in → on-by-default), delete the flag branch, and remove this gate in one commit.
