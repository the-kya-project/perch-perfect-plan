// Which seasonal or holiday card Home shows today (backlog D2.1). The cards and
// their dates are src/lib/seasonalCalendar.ts (D3); this decides the day and
// the country.
//
// The day is the reader's own calendar date (`localDateISO()`, read after the
// page loads so the server render never has a date in it). The country comes
// from the account's home time zone (profiles.time_zone), or the device's when
// the account has none yet: a US zone gets the US-only cards (Fourth of July,
// Thanksgiving, the US clock changes), Amsterdam gets the Netherlands-only
// ones (King's Day, Sinterklaas, the European clock changes), and anywhere
// else gets only the cards for everyone. The app's language isn't used: an
// English reader in Amsterdam still has King's Day outside.
//
// No imports beyond the calendar and no clock, so it's testable on its own
// (npm run test:today-card).

import {
  cardForDate,
  seasonalCopyKeys,
  type SeasonalCard,
  type SeasonalRegion,
} from "./seasonalCalendar";

// The IANA zones for the 50 states and DC (tzdata's zone1970.tab for US), plus
// the old "US/..." aliases.
const US_ZONES = new Set([
  "America/New_York",
  "America/Detroit",
  "America/Kentucky/Louisville",
  "America/Kentucky/Monticello",
  "America/Indiana/Indianapolis",
  "America/Indiana/Vincennes",
  "America/Indiana/Winamac",
  "America/Indiana/Marengo",
  "America/Indiana/Petersburg",
  "America/Indiana/Vevay",
  "America/Indiana/Tell_City",
  "America/Indiana/Knox",
  "America/Chicago",
  "America/Menominee",
  "America/North_Dakota/Center",
  "America/North_Dakota/New_Salem",
  "America/North_Dakota/Beulah",
  "America/Denver",
  "America/Boise",
  "America/Phoenix",
  "America/Los_Angeles",
  "America/Anchorage",
  "America/Juneau",
  "America/Sitka",
  "America/Metlakatla",
  "America/Yakutat",
  "America/Nome",
  "America/Adak",
  "Pacific/Honolulu",
  // Older names some devices still report.
  "America/Indianapolis",
  "America/Louisville",
  "America/Fort_Wayne",
  "Navajo",
]);

const NL_ZONES = new Set(["Europe/Amsterdam"]);

/** The country whose cards apply in a time zone, or null for anywhere else. */
export function seasonalRegionForTimeZone(
  timeZone: string | null | undefined,
): SeasonalRegion | null {
  const tz = (timeZone ?? "").trim();
  if (!tz) return null;
  if (US_ZONES.has(tz) || tz.startsWith("US/")) return "us";
  if (NL_ZONES.has(tz)) return "nl";
  return null;
}

export type TodayCard = {
  card: SeasonalCard;
  titleKey: string;
  bodyKey: string;
  /** The last day this reader sees this card before a different one comes up. */
  endsOn: string;
};

/** "Got it": this card is hidden through this day. */
export type TodayCardDismissal = { cardId: string; through: string };

const addDay = (iso: string): string => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
};

/** The last day of the unbroken run of this card, for this reader's country.
 *  A holiday can cut a season card short: in the US, the heating card's run
 *  ends the day before Thanksgiving's starts. */
export function todayCardEndDate(
  dateISO: string,
  cardId: string,
  region: SeasonalRegion | null,
): string {
  let end = dateISO;
  for (let i = 0; i < 366; i++) {
    const next = addDay(end);
    if (cardForDate(next, region)?.id !== cardId) break;
    end = next;
  }
  return end;
}

/** True while the card on screen is the run the reader said "Got it" to. ISO
 *  dates compare correctly as text. */
export function isTodayCardDismissed(
  today: Pick<TodayCard, "card">,
  dateISO: string,
  dismissal: TodayCardDismissal | null | undefined,
): boolean {
  return !!dismissal && dismissal.cardId === today.card.id && dateISO <= dismissal.through;
}

/** "Nov 26" in English, "26 nov." in Dutch. Read as a plain calendar day, so
 *  no time zone can move it. */
export function formatTodayCardEnd(dateISO: string, language: string): string {
  const [y, m, d] = dateISO.split("-").map(Number);
  return new Intl.DateTimeFormat(language, { month: "short", day: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(y, m - 1, d)),
  );
}

/** The card for a calendar day ("YYYY-MM-DD") in a time zone, with its
 *  language keys (namespace "seasonal"). Null for an invalid date. */
export function todayCardFor(
  dateISO: string,
  timeZone: string | null | undefined,
): TodayCard | null {
  const region = seasonalRegionForTimeZone(timeZone);
  const card = cardForDate(dateISO, region);
  if (!card) return null;
  const keys = seasonalCopyKeys(card);
  return {
    card,
    titleKey: keys.title,
    bodyKey: keys.body,
    endsOn: todayCardEndDate(dateISO, card.id, region),
  };
}
