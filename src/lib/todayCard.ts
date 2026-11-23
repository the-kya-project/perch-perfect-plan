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

export type TodayCard = { card: SeasonalCard; titleKey: string; bodyKey: string };

/** The card for a calendar day ("YYYY-MM-DD") in a time zone, with its
 *  language keys (namespace "seasonal"). Null for an invalid date. */
export function todayCardFor(
  dateISO: string,
  timeZone: string | null | undefined,
): TodayCard | null {
  const card = cardForDate(dateISO, seasonalRegionForTimeZone(timeZone));
  if (!card) return null;
  const keys = seasonalCopyKeys(card);
  return { card, titleKey: keys.title, bodyKey: keys.body };
}
