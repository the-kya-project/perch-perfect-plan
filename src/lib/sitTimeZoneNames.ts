// Friendly names and search for IANA time zones (Account → Time zone).
// Imports only sitTimeZone (itself import-free), so it is safe in tests.
import { isValidTimeZone } from "./sitTimeZone";

// Used when the runtime can't list its zones (Intl.supportedValuesOf is
// missing on older Safari / WebViews). The common home zones, west to east.
const FALLBACK_ZONES = [
  "Pacific/Honolulu", "America/Anchorage", "America/Los_Angeles", "America/Vancouver", "America/Phoenix",
  "America/Denver", "America/Edmonton", "America/Chicago", "America/Mexico_City", "America/Winnipeg",
  "America/New_York", "America/Toronto", "America/Halifax", "America/Puerto_Rico", "America/St_Johns",
  "America/Bogota", "America/Lima", "America/Santiago", "America/Sao_Paulo", "America/Argentina/Buenos_Aires",
  "Atlantic/Azores", "Atlantic/Reykjavik", "UTC", "Europe/London", "Europe/Dublin", "Europe/Lisbon",
  "Europe/Amsterdam", "Europe/Brussels", "Europe/Paris", "Europe/Berlin", "Europe/Madrid", "Europe/Rome",
  "Europe/Zurich", "Europe/Vienna", "Europe/Stockholm", "Europe/Oslo", "Europe/Copenhagen", "Europe/Warsaw",
  "Europe/Prague", "Europe/Athens", "Europe/Helsinki", "Europe/Istanbul", "Europe/Kyiv", "Europe/Moscow",
  "Africa/Casablanca", "Africa/Lagos", "Africa/Cairo", "Africa/Johannesburg", "Africa/Nairobi",
  "Asia/Jerusalem", "Asia/Dubai", "Asia/Karachi", "Asia/Kolkata", "Asia/Dhaka", "Asia/Bangkok",
  "Asia/Jakarta", "Asia/Singapore", "Asia/Kuala_Lumpur", "Asia/Manila", "Asia/Hong_Kong", "Asia/Shanghai",
  "Asia/Taipei", "Asia/Seoul", "Asia/Tokyo", "Australia/Perth", "Australia/Adelaide", "Australia/Darwin",
  "Australia/Brisbane", "Australia/Sydney", "Australia/Melbourne", "Australia/Hobart", "Pacific/Auckland",
];

/** Every zone this runtime knows, plus any `extra` (the saved or device zone,
 *  which can be an alias such as "Asia/Calcutta" that the list leaves out). */
export function allTimeZones(extra: (string | null | undefined)[] = []): string[] {
  let zones: string[] = [];
  try {
    const list = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone");
    if (Array.isArray(list) && list.length) zones = list.slice();
  } catch {
    zones = [];
  }
  if (!zones.length) zones = FALLBACK_ZONES.filter((z) => isValidTimeZone(z));
  const seen = new Set(zones);
  for (const z of ["UTC", ...extra]) {
    if (z && !seen.has(z) && isValidTimeZone(z)) { zones.push(z); seen.add(z); }
  }
  return zones;
}

/** "America/Argentina/Buenos_Aires" → "Buenos Aires"; "UTC" → "UTC". */
export function timeZoneCity(tz: string): string {
  const last = tz.split("/").pop() ?? tz;
  return last.replace(/_/g, " ");
}

function zoneNamePart(tz: string, style: "longGeneric" | "shortOffset", locale: string, now: Date): string {
  try {
    const parts = new Intl.DateTimeFormat(locale, { timeZone: tz, timeZoneName: style }).formatToParts(now);
    return parts.find((p) => p.type === "timeZoneName")?.value ?? "";
  } catch {
    return "";
  }
}

export type TimeZoneParts = {
  /** The IANA id, e.g. "America/Los_Angeles". */
  id: string;
  /** "Los Angeles". */
  city: string;
  /** "Pacific Time", or "" when the runtime only knows an offset for it. */
  region: string;
  /** "GMT-7" (now, so it follows daylight saving). */
  offset: string;
  /** "Pacific Time — Los Angeles", or just the city. */
  label: string;
};

/** Friendly pieces for a zone, in `locale`. */
export function timeZoneParts(tz: string, locale = "en-US", now: Date = new Date()): TimeZoneParts {
  const city = timeZoneCity(tz);
  const offset = zoneNamePart(tz, "shortOffset", locale, now);
  let region = zoneNamePart(tz, "longGeneric", locale, now);
  // Zones without a named region come back as an offset ("GMT+05:45") or as
  // the city again ("Kathmandu Time" is fine; "GMT+5:45" is not).
  if (!region || /^(GMT|UTC)([+-−]|$)/.test(region) || region === offset) region = "";
  const label = region && region.toLowerCase() !== city.toLowerCase() ? `${region} — ${city}` : city;
  return { id: tz, city, region, offset, label };
}

/** "Pacific Time — Los Angeles (GMT-7)", for the Account row. */
export function timeZoneRowLabel(tz: string, locale = "en-US", now: Date = new Date()): string {
  const p = timeZoneParts(tz, locale, now);
  return p.offset ? `${p.label} (${p.offset})` : p.label;
}

function norm(s: string): string {
  return s.toLowerCase().replace(/[_/]+/g, " ").replace(/−/g, "-").replace(/\s+/g, " ").trim();
}

/** Zones matching every word of `query` (city, region name, offset or id).
 *  An empty query returns them all. Order is kept. */
export function searchTimeZones(zones: TimeZoneParts[], query: string): TimeZoneParts[] {
  const words = norm(query).split(" ").filter(Boolean);
  if (!words.length) return zones;
  return zones.filter((z) => {
    const hay = norm(`${z.city} ${z.region} ${z.offset} ${z.id}`);
    return words.every((w) => hay.includes(w));
  });
}

/** Which zone a new sit uses: the account's home zone, else this device's
 *  (and then that device zone should be saved as the account's). */
export function pickSitTimeZone(accountTz: string | null | undefined, deviceTz: string | null | undefined): { zone: string | null; saveToAccount: boolean } {
  if (isValidTimeZone(accountTz)) return { zone: accountTz, saveToAccount: false };
  if (isValidTimeZone(deviceTz)) return { zone: deviceTz, saveToAccount: true };
  return { zone: null, saveToAccount: false };
}
