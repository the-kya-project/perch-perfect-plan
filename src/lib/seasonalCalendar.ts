// Seasonal calendar: the dated cards for Home's Today card (backlog D3; shown
// by D2.1). Every day of the year has at least one card: a season card covers
// each day, and holiday cards take over for a few days around their date.
//
// Plain care reminders only, never health advice: nothing here tells an owner
// something about their bird's health, so none of it waits for the avian vet.
// Seasons are the northern hemisphere's (our readers are in the US and the
// Netherlands).
//
// The words live in src/locales/seasonal.en.jsonc and seasonal.nl.jsonc, one
// title and one body per card (`seasonal.<id>.title`, `seasonal.<id>.body`).
// `npm run test:seasonal-calendar` checks every card has both, in both
// languages, and that every rule resolves to real dates.
//
// No imports and no clock: callers pass the reader's own local date
// (`localDateISO()` in src/lib/localDay.ts, read after the page loads), so
// this is safe in browser and server code alike.

/** Where a card applies. A card with no region applies everywhere. */
export type SeasonalRegion = "us" | "nl";
export const SEASONAL_REGIONS: readonly SeasonalRegion[] = ["us", "nl"];

export type SeasonalTopic =
  | "heat"
  | "cold"
  | "fireworks"
  | "candles"
  | "holiday-food"
  | "travel"
  | "fumes"
  | "windows"
  | "decorations"
  | "noise"
  | "routine";

/** Months are 1–12, weekdays 0 (Sunday) – 6 (Saturday). */
export type DayRule = { region?: SeasonalRegion } & (
  | {
      /** From one calendar day to another, both included. May run over New
       *  Year (Dec 29 – Jan 1). A day past the month's end (Feb 29 in a
       *  common year) means the month's last day. */
      type: "fixed";
      from: [month: number, day: number];
      to: [month: number, day: number];
    }
  | {
      /** The nth weekday of a month (n = -1 for the last), widened by
       *  `before` and `after` days. */
      type: "nthWeekday";
      month: number;
      weekday: number;
      n: 1 | 2 | 3 | 4 | -1;
      before: number;
      after: number;
    }
  | {
      /** Easter Sunday (Western), widened by `before` and `after` days. */
      type: "easter";
      before: number;
      after: number;
    }
  | {
      /** King's Day: April 27, or April 26 when the 27th is a Sunday. */
      type: "kingsDay";
      before: number;
      after: number;
    }
);

export type SeasonalCard = {
  id: string;
  /** A holiday card wins over a season card on the days they share. */
  kind: "season" | "holiday";
  topics: readonly SeasonalTopic[];
  rules: readonly DayRule[];
};

export const SEASONAL_CARDS: readonly SeasonalCard[] = [
  // Seasons: together they cover every day of the year.
  {
    id: "winterDryAir",
    kind: "season",
    topics: ["cold"],
    rules: [{ type: "fixed", from: [12, 1], to: [1, 31] }],
  },
  {
    id: "winterDrafts",
    kind: "season",
    topics: ["cold"],
    rules: [{ type: "fixed", from: [2, 1], to: [2, 29] }],
  },
  {
    id: "springCleaning",
    kind: "season",
    topics: ["fumes"],
    rules: [{ type: "fixed", from: [3, 1], to: [4, 30] }],
  },
  {
    id: "springWindows",
    kind: "season",
    topics: ["windows"],
    rules: [{ type: "fixed", from: [5, 1], to: [5, 31] }],
  },
  {
    id: "summerHeat",
    kind: "season",
    topics: ["heat"],
    rules: [{ type: "fixed", from: [6, 1], to: [8, 31] }],
  },
  {
    id: "autumnRoutine",
    kind: "season",
    topics: ["routine"],
    rules: [{ type: "fixed", from: [9, 1], to: [9, 30] }],
  },
  {
    id: "autumnHeating",
    kind: "season",
    topics: ["cold", "fumes"],
    rules: [{ type: "fixed", from: [10, 1], to: [11, 30] }],
  },

  // Holidays, in calendar order.
  {
    id: "valentines",
    kind: "holiday",
    topics: ["holiday-food"],
    rules: [{ type: "fixed", from: [2, 12], to: [2, 14] }],
  },
  {
    id: "clocksForward",
    kind: "holiday",
    topics: ["routine"],
    rules: [
      // US: second Sunday in March. EU: last Sunday in March.
      { region: "us", type: "nthWeekday", month: 3, weekday: 0, n: 2, before: 3, after: 0 },
      { region: "nl", type: "nthWeekday", month: 3, weekday: 0, n: -1, before: 3, after: 0 },
    ],
  },
  {
    id: "easter",
    kind: "holiday",
    topics: ["holiday-food"],
    rules: [{ type: "easter", before: 3, after: 1 }],
  },
  {
    id: "kingsDay",
    kind: "holiday",
    topics: ["noise"],
    rules: [{ region: "nl", type: "kingsDay", before: 1, after: 0 }],
  },
  {
    id: "summerTravel",
    kind: "holiday",
    topics: ["travel"],
    rules: [{ type: "fixed", from: [6, 20], to: [6, 26] }],
  },
  {
    id: "julyFourth",
    kind: "holiday",
    topics: ["fireworks", "noise"],
    rules: [{ region: "us", type: "fixed", from: [7, 1], to: [7, 5] }],
  },
  {
    id: "clocksBack",
    kind: "holiday",
    topics: ["routine"],
    rules: [
      // US: first Sunday in November. EU: last Sunday in October.
      { region: "us", type: "nthWeekday", month: 11, weekday: 0, n: 1, before: 3, after: 0 },
      { region: "nl", type: "nthWeekday", month: 10, weekday: 0, n: -1, before: 3, after: 0 },
    ],
  },
  {
    id: "halloween",
    kind: "holiday",
    topics: ["candles", "noise"],
    rules: [{ region: "us", type: "fixed", from: [10, 29], to: [10, 31] }],
  },
  {
    id: "thanksgiving",
    kind: "holiday",
    topics: ["holiday-food", "fumes"],
    // Fourth Thursday in November, and the two days of cooking before it.
    rules: [{ region: "us", type: "nthWeekday", month: 11, weekday: 4, n: 4, before: 2, after: 0 }],
  },
  {
    id: "sinterklaas",
    kind: "holiday",
    topics: ["holiday-food"],
    rules: [{ region: "nl", type: "fixed", from: [12, 3], to: [12, 5] }],
  },
  {
    id: "holidayDecorations",
    kind: "holiday",
    topics: ["decorations"],
    rules: [{ type: "fixed", from: [12, 6], to: [12, 14] }],
  },
  {
    id: "holidayCandles",
    kind: "holiday",
    topics: ["candles", "fumes"],
    rules: [{ type: "fixed", from: [12, 15], to: [12, 20] }],
  },
  {
    id: "holidayTravel",
    kind: "holiday",
    topics: ["travel"],
    rules: [{ type: "fixed", from: [12, 21], to: [12, 23] }],
  },
  {
    id: "holidayMeals",
    kind: "holiday",
    topics: ["holiday-food"],
    rules: [{ type: "fixed", from: [12, 24], to: [12, 26] }],
  },
  {
    id: "newYearFireworks",
    kind: "holiday",
    topics: ["fireworks", "noise"],
    rules: [{ type: "fixed", from: [12, 29], to: [1, 1] }],
  },
];

/** The language keys for a card's words. */
export function seasonalCopyKeys(card: Pick<SeasonalCard, "id">): {
  title: string;
  body: string;
} {
  return { title: `seasonal.${card.id}.title`, body: `seasonal.${card.id}.body` };
}

// ---------------------------------------------------------------------------
// Dates. Plain UTC day numbers, so no time zone or daylight saving can shift
// a day: the caller has already decided which calendar day it is.
// ---------------------------------------------------------------------------

const DAY_MS = 86_400_000;
const pad = (n: number) => String(n).padStart(2, "0");

function dayNumber(year: number, month: number, day: number): number {
  return Math.floor(Date.UTC(year, month - 1, day) / DAY_MS);
}

function isoFromDayNumber(n: number): string {
  const d = new Date(n * DAY_MS);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Parses "YYYY-MM-DD" into a day number, or null when it isn't a real date. */
function parseISODate(iso: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (mo < 1 || mo > 12 || d < 1 || d > daysInMonth(y, mo)) return null;
  return dayNumber(y, mo, d);
}

/** Western Easter Sunday (the anonymous Gregorian algorithm). */
export function easterSunday(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${pad(month)}-${pad(day)}`;
}

function nthWeekday(year: number, month: number, weekday: number, n: number): number {
  if (n === -1) {
    const last = dayNumber(year, month, daysInMonth(year, month));
    const lastWeekday = new Date(last * DAY_MS).getUTCDay();
    return last - ((lastWeekday - weekday + 7) % 7);
  }
  const first = dayNumber(year, month, 1);
  const firstWeekday = new Date(first * DAY_MS).getUTCDay();
  return first + ((weekday - firstWeekday + 7) % 7) + (n - 1) * 7;
}

function clampedDay(year: number, [month, day]: [number, number]): number {
  return dayNumber(year, month, Math.min(day, daysInMonth(year, month)));
}

/** The days a rule covers in the occurrence that starts in `year`, as day
 *  numbers (both ends included). */
function windowFor(rule: DayRule, year: number): [number, number] {
  switch (rule.type) {
    case "fixed": {
      const start = clampedDay(year, rule.from);
      const wraps =
        rule.to[0] < rule.from[0] || (rule.to[0] === rule.from[0] && rule.to[1] < rule.from[1]);
      return [start, clampedDay(wraps ? year + 1 : year, rule.to)];
    }
    case "nthWeekday": {
      const anchor = nthWeekday(year, rule.month, rule.weekday, rule.n);
      return [anchor - rule.before, anchor + rule.after];
    }
    case "easter": {
      const anchor = parseISODate(easterSunday(year))!;
      return [anchor - rule.before, anchor + rule.after];
    }
    case "kingsDay": {
      const the27th = dayNumber(year, 4, 27);
      const anchor = new Date(the27th * DAY_MS).getUTCDay() === 0 ? the27th - 1 : the27th;
      return [anchor - rule.before, anchor + rule.after];
    }
  }
}

/** The dates a rule covers in the occurrence that starts in `year`. */
export function ruleWindow(rule: DayRule, year: number): { start: string; end: string } {
  const [start, end] = windowFor(rule, year);
  return { start: isoFromDayNumber(start), end: isoFromDayNumber(end) };
}

function appliesTo(rule: DayRule, region: SeasonalRegion | null | undefined): boolean {
  return !rule.region || rule.region === region;
}

/** How many days the shortest of the card's matching windows around `day` is,
 *  or null when the card doesn't cover that day. */
function coverage(
  card: SeasonalCard,
  day: number,
  region: SeasonalRegion | null | undefined,
): number | null {
  const year = new Date(day * DAY_MS).getUTCFullYear();
  let best: number | null = null;
  for (const rule of card.rules) {
    if (!appliesTo(rule, region)) continue;
    // A window that starts last year can reach into this one (New Year's).
    for (const y of [year - 1, year]) {
      const [start, end] = windowFor(rule, y);
      if (day >= start && day <= end) {
        const length = end - start + 1;
        if (best === null || length < best) best = length;
      }
    }
  }
  return best;
}

/**
 * Every card for a calendar day ("YYYY-MM-DD", the reader's own date), in the
 * order to prefer them: holidays before seasons, then the shorter window, then
 * this file's order. Cards with a region show only when `region` matches;
 * with no region, only the cards for everyone. An invalid date gives [].
 */
export function cardsForDate(dateISO: string, region?: SeasonalRegion | null): SeasonalCard[] {
  const day = parseISODate(dateISO);
  if (day === null) return [];
  const hits: { card: SeasonalCard; length: number; index: number }[] = [];
  SEASONAL_CARDS.forEach((card, index) => {
    const length = coverage(card, day, region);
    if (length !== null) hits.push({ card, length, index });
  });
  const rank = (k: SeasonalCard["kind"]) => (k === "holiday" ? 0 : 1);
  hits.sort(
    (a, b) => rank(a.card.kind) - rank(b.card.kind) || a.length - b.length || a.index - b.index,
  );
  return hits.map((h) => h.card);
}

/** The one card to show on a calendar day, or null for an invalid date. */
export function cardForDate(dateISO: string, region?: SeasonalRegion | null): SeasonalCard | null {
  return cardsForDate(dateISO, region)[0] ?? null;
}
