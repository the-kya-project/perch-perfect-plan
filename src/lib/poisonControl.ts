// Poison control and temperature units, by where the bird is.
//
// Where the bird is comes from a time zone: the sit's (the bird's home, where
// the sitter is) or, on the owner's own screens, the owner's home time zone.
// A sitter has no account and their phone's language says little about where
// they are standing, so the time zone is the better signal.
//
// Lines filled in when the owner left poison control empty, each checked on
// the service's own website (Oct 2026):
//   US: ASPCA Animal Poison Control, then Pet Poison Helpline as a second
//       option. Both charge a consultation fee.
//   UK: Animal PoisonLine (run by the Veterinary Poisons Information Service).
//       Charges per call.
//   Australia: Animal Poisons Helpline. Charges a consultation fee.
// Everywhere else the default is no number, and the sitter is told to call
// the owner's vet or an emergency vet. A wrong emergency number is worse than
// none: in the Netherlands, for instance, the national poison centre (NVIC)
// takes calls from vets, not the public. Add a country here only with a
// number checked on the service's own site. Owners can always enter their own.

import { isValidTimeZone } from "./sitTimeZone";

export type PoisonLine = { name: string; display: string; dial: string };

export const ASPCA_POISON_LINE: PoisonLine = {
  name: "ASPCA Animal Poison Control",
  display: "(888) 426-4435",
  dial: "8884264435",
};

export const PET_POISON_HELPLINE: PoisonLine = {
  name: "Pet Poison Helpline",
  display: "(855) 764-7661",
  dial: "8557647661",
};

export const UK_ANIMAL_POISONLINE: PoisonLine = {
  name: "Animal PoisonLine",
  display: "01202 509000",
  dial: "01202509000",
};

export const AU_ANIMAL_POISONS_HELPLINE: PoisonLine = {
  name: "Animal Poisons Helpline",
  display: "1300 869 738",
  dial: "1300869738",
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
// Great Britain and Northern Ireland. The Crown Dependencies (Jersey,
// Guernsey, Isle of Man) are left out: Animal PoisonLine is a UK service.
const UK_ZONES = new Set(["Europe/London", "Europe/Belfast", "GB", "GB-Eire"]);

/** Where the bird is, or "unknown" when there's no usable time zone. */
export type Region = "us" | "uk" | "au" | "elsewhere" | "unknown";

export function regionForTimeZone(tz: string | null | undefined): Region {
  if (!tz || !isValidTimeZone(tz)) return "unknown";
  if (US_ZONES.has(tz) || US_PREFIXES.some((p) => tz.startsWith(p))) return "us";
  if (UK_ZONES.has(tz)) return "uk";
  if (tz.startsWith("Australia/")) return "au";
  return "elsewhere";
}

/** Every poison line to offer when the owner hasn't entered one, main line
 *  first. Empty where there's no public line we've checked. All of them
 *  charge a consultation fee. */
export function defaultPoisonLines(tz: string | null | undefined): PoisonLine[] {
  switch (regionForTimeZone(tz)) {
    case "us": return [ASPCA_POISON_LINE, PET_POISON_HELPLINE];
    case "uk": return [UK_ANIMAL_POISONLINE];
    case "au": return [AU_ANIMAL_POISONS_HELPLINE];
    default: return [];
  }
}

/** The main poison line to show when the owner hasn't entered one, or null. */
export function defaultPoisonLine(tz: string | null | undefined): PoisonLine | null {
  return defaultPoisonLines(tz)[0] ?? null;
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
  if (region === "unknown") return `${celsius} (${fahrenheit})`;
  return celsius;
}
