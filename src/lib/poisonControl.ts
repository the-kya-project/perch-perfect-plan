// Poison control and temperature units, by where the bird is.
//
// Where the bird is comes from a time zone: the sit's (the bird's home, where
// the sitter is) or, on the owner's own screens, the owner's home time zone.
// A sitter has no account and their phone's language says little about where
// they are standing, so the time zone is the better signal.
//
// Only one poison line is filled in automatically: ASPCA Animal Poison
// Control, in the US. Everywhere else the default is no number, and the
// sitter is told to call the avian vet. A wrong emergency number is worse
// than none: in the Netherlands, for instance, the national poison centre
// (NVIC) takes calls from vets, not the public. Add a country here only with
// a number that's been checked. Owners can always enter their own.

import { isValidTimeZone } from "./sitTimeZone";

export type PoisonLine = { name: string; display: string; dial: string };

export const ASPCA_POISON_LINE: PoisonLine = {
  name: "ASPCA Animal Poison Control",
  display: "(888) 426-4435",
  dial: "8884264435",
};

// IANA zones in the United States (canonical names plus the common aliases).
const US_ZONES = new Set([
  "America/New_York", "America/Detroit", "America/Chicago", "America/Denver", "America/Phoenix",
  "America/Boise", "America/Los_Angeles", "America/Anchorage", "America/Juneau", "America/Sitka",
  "America/Metlakatla", "America/Yakutat", "America/Nome", "America/Adak", "America/Menominee",
  "Pacific/Honolulu", "America/Puerto_Rico",
  "US/Eastern", "US/Central", "US/Mountain", "US/Pacific", "US/Alaska", "US/Hawaii", "US/Arizona",
  "US/Michigan", "US/East-Indiana", "US/Indiana-Starke", "US/Aleutian", "Navajo",
  "America/Fort_Wayne", "America/Indianapolis", "America/Louisville", "America/Knox_IN", "America/Shiprock",
]);
const US_PREFIXES = ["America/Indiana/", "America/Kentucky/", "America/North_Dakota/"];

/** Where the bird is: "us", "elsewhere", or "unknown" (no usable time zone). */
export type Region = "us" | "elsewhere" | "unknown";

export function regionForTimeZone(tz: string | null | undefined): Region {
  if (!tz || !isValidTimeZone(tz)) return "unknown";
  if (US_ZONES.has(tz) || US_PREFIXES.some((p) => tz.startsWith(p))) return "us";
  return "elsewhere";
}

/** The poison line to show when the owner hasn't entered one, or null. */
export function defaultPoisonLine(tz: string | null | undefined): PoisonLine | null {
  return regionForTimeZone(tz) === "us" ? ASPCA_POISON_LINE : null;
}

/**
 * The "keep warm" range for a sick bird, in the units the reader uses:
 * Fahrenheit in the US, Celsius elsewhere and always in Dutch. When we can't
 * tell where the bird is, both, so nobody has to convert in an emergency.
 * 85–90 °F is 29–32 °C.
 */
export function warmRange(tz: string | null | undefined, language: string | undefined): string {
  const celsius = "29–32 °C";
  const fahrenheit = "85–90 °F";
  if ((language ?? "").toLowerCase().startsWith("nl")) return celsius;
  const region = regionForTimeZone(tz);
  if (region === "us") return fahrenheit;
  if (region === "elsewhere") return celsius;
  return `${celsius} (${fahrenheit})`;
}
