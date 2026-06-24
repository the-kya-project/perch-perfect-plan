// Pure helpers for the owner Home — weight pills, stale-weigh-in detection,
// upcoming-Moment anniversaries, and the adaptive Today list. Kept free of React
// /  network so it's trivially testable and the dashboard stays declarative.

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

export type Pill = { tone: "good" | "attention"; label: string };
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

// Newest-first entries for ONE bird → the Home weight glance + pill.
export function weightGlance(entriesDesc: WeightEntry[], isFoster: boolean | null): WeightGlance {
  if (!entriesDesc.length) return { state: "none" };
  const current = entriesDesc[0].grams;
  const days = daysSince(entriesDesc[0].measured_at);
  if (days > staleThreshold(isFoster)) {
    return { state: "stale", current, days, pill: { tone: "attention", label: `${days} days` } };
  }
  // Trend over the last 30 days: compare current to the oldest reading still in
  // the window (the baseline). One reading in-window → steady.
  const cutoff = +new Date() - 30 * DAY_MS;
  const inWindow = entriesDesc.filter((e) => +new Date(e.measured_at) >= cutoff);
  const baseline = inWindow.length > 1 ? inWindow[inWindow.length - 1].grams : current;
  const delta = current - baseline;
  const pct = baseline > 0 ? (Math.abs(delta) / baseline) * 100 : 0;
  if (pct <= STEADY_PCT) return { state: "trend", current, pill: { tone: "good", label: "Steady" } };
  if (delta > 0) return { state: "trend", current, pill: { tone: "good", label: `Up ${Math.round(delta)} g` } };
  return { state: "trend", current, pill: { tone: "attention", label: `Down ${Math.round(-delta)} g — watch` } };
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
  to: { kind: "weight" | "moments"; birdId: string } | { kind: "sits" };
  rank: number; // lower = higher priority
};

export type UpcomingSit = { id: string; sitterName: string | null; startDate: string; daysUntil: number };

export function buildTodayItems(
  birds: HomeBird[],
  weightsByBird: Map<string, WeightEntry[]>,
  sits: UpcomingSit[],
  moments: UpcomingMoment[],
): TodayItem[] {
  const items: TodayItem[] = [];

  // a. Stale weigh-ins (most urgent). Rank by how overdue.
  for (const b of birds) {
    const entries = weightsByBird.get(b.id) ?? [];
    if (!entries.length) continue; // a bird never weighed isn't "stale" — it's new
    const days = daysSince(entries[0].measured_at);
    if (days > staleThreshold(b.is_foster)) {
      items.push({
        id: `stale-${b.id}`, tone: "amber", title: `${b.name} needs a weigh-in`,
        meta: `Last weighed ${days} days ago`, to: { kind: "weight", birdId: b.id }, rank: 100 - Math.min(days, 99),
      });
    }
  }

  // b. Upcoming sits within the window.
  for (const s of sits) {
    if (s.daysUntil < 0 || s.daysUntil > SIT_SOON_DAYS) continue;
    const when = s.daysUntil === 0 ? "starts today" : s.daysUntil === 1 ? "starts tomorrow" : `starts in ${s.daysUntil} days`;
    items.push({
      id: `sit-${s.id}`, tone: "pale", title: s.sitterName ? `${s.sitterName} arrives soon` : "A sit is coming up",
      meta: `Sit ${when}`, to: { kind: "sits" }, rank: 200 + s.daysUntil,
    });
  }

  // c. Upcoming Moments within the window.
  for (const m of moments) {
    const when = m.days === 0 ? "today" : m.days === 1 ? "tomorrow" : `in ${m.days} days`;
    const yr = m.years > 0 ? ` · ${m.years} ${m.years === 1 ? "year" : "years"}` : "";
    items.push({
      id: `moment-${m.birdId}-${m.label}`, tone: "pale", title: `${m.birdName}'s ${m.label.toLowerCase()} ${when}`,
      meta: `${m.label}${yr}`, to: { kind: "moments", birdId: m.birdId }, rank: 300 + m.days,
    });
  }

  return items.sort((a, b) => a.rank - b.rank).slice(0, 4);
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
  now = new Date(),
): string | undefined {
  if (!birds.length) return undefined;

  // 1) Stale weigh-in — first bird overdue.
  for (const b of birds) {
    const entries = weightsByBird.get(b.id) ?? [];
    if (!entries.length) continue;
    if (daysSince(entries[0].measured_at, now) > staleThreshold(b.is_foster)) {
      return `${b.name} is due for a weigh-in.`;
    }
  }

  // 2) Sit imminent — within SIT_SOON_DAYS.
  const sitSoon = sits.find((s) => s.daysUntil >= 0 && s.daysUntil <= SIT_SOON_DAYS);
  if (sitSoon) {
    const who = sitSoon.caregiverName?.trim() || sitSoon.sitterName?.trim() || "Your caregiver";
    const when = sitSoon.daysUntil === 0 ? "today" : sitSoon.daysUntil === 1 ? "tomorrow" : dayName(sitSoon.startDate, now);
    return `${who} arrives ${when}.`;
  }

  // 3) Celebration — soonest hatch / foster-fail anniversary within window.
  const m = moments.find((x) => x.days >= 0 && x.days <= MOMENT_SOON_DAYS);
  if (m) {
    const when = m.days === 0 ? "today" : m.days === 1 ? "tomorrow" : `on ${dayName(m.date.toISOString(), now)}`;
    if (m.label === "Hatch day" && m.years > 0) return `${m.birdName} turns ${m.years} ${when}.`;
    if (m.label === "Joined the flock" && m.years === 1) return `One year since ${m.birdName} joined the flock.`;
    if (m.label === "Joined the flock" && m.years > 1) return `${m.years} years since ${m.birdName} joined the flock.`;
    if (m.label === "Gotcha day" && m.years > 0) return `${m.years} ${m.years === 1 ? "year" : "years"} with ${m.birdName} ${when}.`;
    // Fallback for any anchor without a tailored line.
    return `${m.birdName}'s ${m.label.toLowerCase()} is ${when}.`;
  }

  // 4) New bird this week — most recently added within 7 days.
  const newOne = birds
    .filter((b) => b.created_at && daysSince(b.created_at, now) <= 7)
    .sort((a, b) => +new Date(b.created_at!) - +new Date(a.created_at!))[0];
  if (newOne) return `${newOne.name} is settling in.`;

  // 5) Weekend with nothing pressing.
  const wd = now.getDay();
  if (wd === 0 || wd === 6) return "Hope it's a slow one.";

  // 6) Default.
  return "A quiet day across the flock.";
}

function dayName(iso: string, now = new Date()): string {
  const d = new Date(iso.slice(0, 10) + "T12:00:00");
  const days = Math.round((+midnight(d) - +midnight(now)) / DAY_MS);
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days > 1 && days < 7) return d.toLocaleDateString(undefined, { weekday: "long" });
  return d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}
