// Pure helpers for the owner Home — weight pills, stale-weigh-in detection,
// upcoming-Moment anniversaries, and the adaptive Today list. Kept free of React
// /  network so it's trivially testable and the dashboard stays declarative.
//
// i18n: the copy-composing builders take a `t` (react-i18next TFunction) from the
// caller's component so this module stays hook-free. Anchor labels ("Hatch day"…)
// remain STABLE ENGLISH KEYS internally — buildHomeStateCopy branches on them —
// and are translated only at render via `momentLabel(t, label)`.
import type { TFunction } from "i18next";
import { weightTrendPill } from "./weightTrend";

// ---- Tunable thresholds (surfaced as named constants) ----------------------
export const STALE_DAYS_PERMANENT = 5; // permanent birds: nudge a weigh-in after 5 days
export const STALE_DAYS_FOSTER = 3;    // fosters: tighter, you're still learning them
export const SIT_SOON_DAYS = 3;        // a sit starting within ~3 days surfaces in Today
export const MOMENT_SOON_DAYS = 7;     // anniversaries within ~7 days surface in Today
export const STEADY_PCT = 2.5;         // weight within ±2.5% over 30 days reads as "steady"
const DAY_MS = 86_400_000;

export type WeightEntry = { bird_id: string; grams: number; measured_at: string };
export type HomeBird = {
  id: string;
  name: string;
  species: string | null;
  photo_url: string | null;
  photo_position: string | null;
  is_foster: boolean | null;
  created_at?: string | null;
  intake_date: string | null;
  birth_date: string | null;
  acquired_on: string | null;
  became_permanent_on: string | null;
};

export type Pill = { tone: "good" | "attention" | "off"; label: string };
export type WeightGlance =
  | { state: "none" }                                  // never weighed → "No weights yet", no pill
  | { state: "stale"; current: number; days: number; pill: Pill }
  | { state: "trend"; current: number; pill: Pill };

function midnight(d: Date) { return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12); }
export function daysSince(iso: string, now = new Date()): number {
  return Math.floor((+midnight(now) - +midnight(new Date(iso))) / DAY_MS);
}
export function staleThreshold(isFoster: boolean | null): number {
  return isFoster ? STALE_DAYS_FOSTER : STALE_DAYS_PERMANENT;
}

// Stable anchor labels are English keys; map to a translated, display string.
function momentLabel(t: TFunction, label: string): string {
  if (label === "Hatch day") return t("home.anchor.hatchDay", "Hatch day");
  if (label === "Gotcha day") return t("home.anchor.gotchaDay", "Gotcha day");
  if (label === "Joined the flock") return t("home.anchor.joinedFlock", "Joined the flock");
  return label;
}

// Newest-first entries for ONE bird → the Home weight glance + pill.
export function weightGlance(entriesDesc: WeightEntry[], isFoster: boolean | null, t: TFunction): WeightGlance {
  if (!entriesDesc.length) return { state: "none" };
  const current = entriesDesc[0].grams;
  const days = daysSince(entriesDesc[0].measured_at);
  if (days > staleThreshold(isFoster)) {
    return { state: "stale", current, days, pill: { tone: "attention", label: t("home.staleDays", "{{count}} days", { count: days }) } };
  }
  // Trend = latest entry vs the immediately previous one — the ONE canonical
  // computation shared with the bird-record pill (weightTrendPill), so the two
  // surfaces can never disagree.
  return { state: "trend", current, pill: weightTrendPill(entriesDesc) };
}

// Group newest-first entries by bird.
export function groupWeights(entriesDesc: WeightEntry[]): Map<string, WeightEntry[]> {
  const m = new Map<string, WeightEntry[]>();
  for (const e of entriesDesc) (m.get(e.bird_id) ?? m.set(e.bird_id, []).get(e.bird_id)!).push(e);
  return m;
}

// ---- Upcoming Moments (anniversaries) --------------------------------------
export type MomentAnchor = { birdId: string; birdName: string; label: string; baseISO: string };
export type UpcomingMoment = MomentAnchor & { date: Date; days: number; years: number };

function nextOccurrence(baseISO: string, now = new Date()) {
  const base = new Date(`${baseISO.slice(0, 10)}T12:00:00`);
  const t = midnight(now);
  let d = new Date(t.getFullYear(), base.getMonth(), base.getDate(), 12);
  if (d < t) d = new Date(t.getFullYear() + 1, base.getMonth(), base.getDate(), 12);
  return { date: d, years: d.getFullYear() - base.getFullYear() };
}

// Build anniversary anchors from a bird's dates (hatch, gotcha, foster-fail).
export function anchorsForBird(b: HomeBird): MomentAnchor[] {
  const out: MomentAnchor[] = [];
  if (b.birth_date) out.push({ birdId: b.id, birdName: b.name, label: "Hatch day", baseISO: b.birth_date });
  if (b.acquired_on) out.push({ birdId: b.id, birdName: b.name, label: "Gotcha day", baseISO: b.acquired_on });
  if (b.became_permanent_on) out.push({ birdId: b.id, birdName: b.name, label: "Joined the flock", baseISO: b.became_permanent_on });
  return out;
}

export function upcomingMoments(birds: HomeBird[], now = new Date()): UpcomingMoment[] {
  return birds
    .flatMap(anchorsForBird)
    .map((a) => { const occ = nextOccurrence(a.baseISO, now); return { ...a, date: occ.date, years: occ.years, days: daysSince(occ.date.toISOString(), now) * -1 }; })
    .filter((m) => m.days >= 0 && m.days <= MOMENT_SOON_DAYS)
    .sort((a, b) => a.days - b.days);
}

// ---- Today panel -----------------------------------------------------------
export type TodayItem = {
  id: string;
  tone: "amber" | "pale";
  title: string;
  meta: string;
  to: { kind: "weight" | "moments"; birdId: string } | { kind: "sits" } | { kind: "scan"; birdId: string; scanId: string };
  rank: number; // lower = higher priority
};

// A bird's active concern, surfaced at the very top of Today.
export type TodayConcern = { birdId: string; birdName: string; scanId: string; daysAgo: number; runByName: string };

export type UpcomingSit = { id: string; sitterName: string | null; startDate: string; daysUntil: number };

export function buildTodayItems(
  birds: HomeBird[],
  weightsByBird: Map<string, WeightEntry[]>,
  sits: UpcomingSit[],
  moments: UpcomingMoment[],
  concerns: TodayConcern[] = [],
  t: TFunction,
): TodayItem[] {
  // Health concerns sit ABOVE everything else and never get capped away.
  const concernItems: TodayItem[] = concerns.map((c, i) => ({
    id: `concern-${c.birdId}`,
    tone: "amber",
    title: t("home.today.concernTitle", "{{name}} — concern flagged", { name: c.birdName }),
    meta: c.daysAgo === 0
      ? t("home.today.concernMetaToday", "Today · Run by {{by}}", { by: c.runByName })
      : t("home.today.concernMetaAgo", { count: c.daysAgo, by: c.runByName, defaultValue_one: "{{count}} day ago · Run by {{by}}", defaultValue_other: "{{count}} days ago · Run by {{by}}" }),
    to: { kind: "scan", birdId: c.birdId, scanId: c.scanId },
    rank: -1000 + i,
  }));

  const items: TodayItem[] = [];

  // a. Stale weigh-ins (most urgent). Rank by how overdue.
  for (const b of birds) {
    const entries = weightsByBird.get(b.id) ?? [];
    if (!entries.length) continue; // a bird never weighed isn't "stale" — it's new
    const days = daysSince(entries[0].measured_at);
    if (days > staleThreshold(b.is_foster)) {
      items.push({
        id: `stale-${b.id}`, tone: "amber", title: t("home.today.staleTitle", "{{name}} needs a weigh-in", { name: b.name }),
        meta: t("home.today.staleMeta", "Last weighed {{count}} days ago", { count: days }), to: { kind: "weight", birdId: b.id }, rank: 100 - Math.min(days, 99),
      });
    }
  }

  // b. Upcoming sits within the window.
  for (const s of sits) {
    if (s.daysUntil < 0 || s.daysUntil > SIT_SOON_DAYS) continue;
    const when = s.daysUntil === 0
      ? t("home.today.sitStartsToday", "starts today")
      : s.daysUntil === 1
        ? t("home.today.sitStartsTomorrow", "starts tomorrow")
        : t("home.today.sitStartsInDays", "starts in {{count}} days", { count: s.daysUntil });
    items.push({
      id: `sit-${s.id}`, tone: "pale", title: s.sitterName ? t("home.today.sitArrives", "{{name}} arrives soon", { name: s.sitterName }) : t("home.today.sitComingUp", "A sit is coming up"),
      meta: t("home.today.sitMeta", "Sit {{when}}", { when }), to: { kind: "sits" }, rank: 200 + s.daysUntil,
    });
  }

  // c. Upcoming Moments within the window.
  for (const m of moments) {
    const when = m.days === 0
      ? t("home.when.today", "today")
      : m.days === 1
        ? t("home.when.tomorrow", "tomorrow")
        : t("home.when.inDays", "in {{count}} days", { count: m.days });
    const yr = m.years > 0 ? t("home.today.momentYears", { count: m.years, defaultValue_one: " · {{count}} year", defaultValue_other: " · {{count}} years" }) : "";
    const label = momentLabel(t, m.label);
    items.push({
      id: `moment-${m.birdId}-${m.label}`, tone: "pale", title: t("home.today.momentTitle", "{{namePoss}} {{label}} {{when}}", { namePoss: possessive(m.birdName), label: label.toLowerCase(), when }),
      meta: `${label}${yr}`, to: { kind: "moments", birdId: m.birdId }, rank: 300 + m.days,
    });
  }

  // Concerns always show; other items fill the remaining slots (min 4 total).
  const rest = items.sort((a, b) => a.rank - b.rank).slice(0, Math.max(0, 4 - concernItems.length));
  return [...concernItems, ...rest];
}

// "Sarah" -> "Sarah's", "Chris" -> "Chris'". English possessive; Dutch renders a
// "van {{name}}" structure in the catalog, so the possessive form is English-only.
function possessive(name: string): string {
  const n = name.trim();
  return /s$/i.test(n) ? `${n}'` : `${n}'s`;
}

// ---- Home greeting body line (state-aware) --------------------------------
// Returns the body line that sits under the "Good morning, X" greeting on Home.
// Priority order — first match wins:
//   1) Stale weigh-in:  "[Bird] is due for a weigh-in."
//   2) Sit imminent:    "[Caregiver] arrives [day]." (≤ SIT_SOON_DAYS)
//   3) Celebration:     hatch / foster-fail anniversary within MOMENT_SOON_DAYS
//   4) New bird:        bird.created_at within last 7 days — "[Bird] is settling in."
//   5) Weekend, calm:   "Hope it's a slow one."
//   6) Default:         "A quiet day across the flock."

export function buildHomeStateCopy(
  birds: HomeBird[],
  weightsByBird: Map<string, WeightEntry[]>,
  sits: { sitterName: string | null; caregiverName: string | null; startDate: string; daysUntil: number }[],
  moments: UpcomingMoment[],
  t: TFunction,
  now = new Date(),
): string | undefined {
  if (!birds.length) return undefined;

  // 1) Stale weigh-in — first bird overdue.
  for (const b of birds) {
    const entries = weightsByBird.get(b.id) ?? [];
    if (!entries.length) continue;
    if (daysSince(entries[0].measured_at, now) > staleThreshold(b.is_foster)) {
      return t("home.state.dueWeighIn", "{{name}} is due for a weigh-in.", { name: b.name });
    }
  }

  // 2) Sit imminent — within SIT_SOON_DAYS.
  const sitSoon = sits.find((s) => s.daysUntil >= 0 && s.daysUntil <= SIT_SOON_DAYS);
  if (sitSoon) {
    const who = sitSoon.caregiverName?.trim() || sitSoon.sitterName?.trim() || t("home.state.yourCaregiver", "Your caregiver");
    const when = sitSoon.daysUntil === 0 ? t("home.when.today", "today") : sitSoon.daysUntil === 1 ? t("home.when.tomorrow", "tomorrow") : dayName(sitSoon.startDate, t, now);
    return t("home.state.arrives", "{{who}} arrives {{when}}.", { who, when });
  }

  // 3) Celebration — soonest hatch / foster-fail anniversary within window.
  const m = moments.find((x) => x.days >= 0 && x.days <= MOMENT_SOON_DAYS);
  if (m) {
    const when = m.days === 0 ? t("home.when.today", "today") : m.days === 1 ? t("home.when.tomorrow", "tomorrow") : t("home.when.onDay", "on {{day}}", { day: dayName(m.date.toISOString(), t, now) });
    if (m.label === "Hatch day" && m.years > 0) return t("home.state.turnsAge", "{{name}} turns {{years}} {{when}}.", { name: m.birdName, years: m.years, when });
    if (m.label === "Joined the flock" && m.years === 1) return t("home.state.joinedOneYear", "One year since {{name}} joined the flock.", { name: m.birdName });
    if (m.label === "Joined the flock" && m.years > 1) return t("home.state.joinedYears", "{{years}} years since {{name}} joined the flock.", { years: m.years, name: m.birdName });
    if (m.label === "Gotcha day" && m.years > 0) return t("home.state.gotchaYears", { count: m.years, name: m.birdName, when, defaultValue_one: "{{count}} year with {{name}} {{when}}.", defaultValue_other: "{{count}} years with {{name}} {{when}}." });
    // Fallback for any anchor without a tailored line.
    return t("home.state.momentFallback", "{{namePoss}} {{label}} is {{when}}.", { namePoss: possessive(m.birdName), label: momentLabel(t, m.label).toLowerCase(), when });
  }

  // 4) New bird this week — most recently added within 7 days.
  const newOne = birds
    .filter((b) => b.created_at && daysSince(b.created_at, now) <= 7)
    .sort((a, b) => +new Date(b.created_at!) - +new Date(a.created_at!))[0];
  if (newOne) return t("home.state.settlingIn", "{{name}} is settling in.", { name: newOne.name });

  // 5) Weekend with nothing pressing.
  const wd = now.getDay();
  if (wd === 0 || wd === 6) return t("home.state.weekend", "Hope it's a slow one.");

  // 6) Default.
  return t("home.state.default", "A quiet day across the flock.");
}

function dayName(iso: string, t: TFunction, now = new Date()): string {
  const d = new Date(iso.slice(0, 10) + "T12:00:00");
  const days = Math.round((+midnight(d) - +midnight(now)) / DAY_MS);
  if (days === 0) return t("home.when.today", "today");
  if (days === 1) return t("home.when.tomorrow", "tomorrow");
  if (days > 1 && days < 7) return d.toLocaleDateString(undefined, { weekday: "long" });
  return d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}
