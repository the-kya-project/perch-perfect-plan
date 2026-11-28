// Home's heat and cold cards (backlog D2.2), behind the `weather_cards` care
// switch (src/lib/careFeatures.ts). The rules, with no I/O:
//   - which ZIPs and postcodes we accept (US and the Netherlands only),
//   - the heat and cold thresholds, in both units, in one place,
//   - which card a day's forecast gives, if any.
// The forecast itself comes from src/lib/weather.functions.ts (server only,
// Apple WeatherKit, cached per area in public.weather_forecasts); the ZIP or
// postcode is turned into a place by src/lib/postcodeCentroids.server.ts, so
// no outside service ever sees it.
//
// Pinned by `npm run test:weather-cards`.

export type HomeCountry = "US" | "NL";

export type HomePostcode = { country: HomeCountry; postcode: string };

/** "12345", "12345-6789" → US 12345; "1234", "1234AB", "1234 ab" → NL 1234.
 *  Anything else is null ("That doesn't look like a ZIP or postcode."). */
export function parseHomePostcode(input: string): HomePostcode | null {
  const s = input.trim().toUpperCase().replace(/\s+/g, " ");
  const us = /^(\d{5})(?:-?\d{4})?$/.exec(s);
  if (us) return us[1] === "00000" ? null : { country: "US", postcode: us[1] };
  const nl = /^([1-9]\d{3}) ?(?:[A-Z]{2})?$/.exec(s);
  if (nl) return { country: "NL", postcode: nl[1] };
  return null;
}

/** The forecast cache's key for an area: "US:12345", "NL:1234". */
export function areaKey(p: HomePostcode): string {
  return `${p.country}:${p.postcode}`;
}

export type TempUnit = "F" | "C";

/** °F for US accounts, °C for everyone else. */
export function unitFor(country: HomeCountry): TempUnit {
  return country === "US" ? "F" : "C";
}

/** The thresholds, in both units. Heat: today's high at or above. Cold:
 *  tonight's low at or below. Compared on the rounded number the card shows,
 *  so the card and its temperature always agree. */
export const WEATHER_THRESHOLDS = {
  heat: { F: 90, C: 32 },
  cold: { F: 32, C: 0 },
} as const;

export function toUnit(celsius: number, unit: TempUnit): number {
  return Math.round(unit === "F" ? (celsius * 9) / 5 + 32 : celsius);
}

/** One day of the cached forecast, in °C as WeatherKit sends it. `low_c` is
 *  tonight's low (the overnight part of the day, 7 PM to 7 AM). */
export type ForecastDay = { date: string; high_c: number; low_c: number };

export type WeatherCard = {
  kind: "heat" | "cold";
  /** Rounded, in `unit`. */
  temp: number;
  unit: TempUnit;
  postcode: string;
};

/** The card for `dateISO`, or null for an ordinary day or a missing forecast.
 *  On a day that is both (it can happen in the desert), heat comes first:
 *  it's the one the day's care steps are about. */
export function weatherCardFor(
  days: readonly ForecastDay[] | null | undefined,
  dateISO: string,
  home: HomePostcode,
): WeatherCard | null {
  const day = days?.find((d) => d.date === dateISO);
  if (!day) return null;
  const unit = unitFor(home.country);
  const high = Number.isFinite(day.high_c) ? toUnit(day.high_c, unit) : null;
  const low = Number.isFinite(day.low_c) ? toUnit(day.low_c, unit) : null;
  if (high !== null && high >= WEATHER_THRESHOLDS.heat[unit]) {
    return { kind: "heat", temp: high, unit, postcode: home.postcode };
  }
  if (low !== null && low <= WEATHER_THRESHOLDS.cold[unit]) {
    return { kind: "cold", temp: low, unit, postcode: home.postcode };
  }
  return null;
}

/** "95°F", "-3°C". */
export function formatTemp(card: Pick<WeatherCard, "temp" | "unit">): string {
  return `${card.temp}°${card.unit}`;
}

/** A Dutch area is all one time zone; a US one uses the asking account's
 *  (profiles.time_zone, else the phone's), else Eastern. */
export function forecastTimeZone(country: HomeCountry, accountZone: string | null | undefined): string {
  if (country === "NL") return "Europe/Amsterdam";
  return accountZone?.trim() || "America/New_York";
}

/** WeatherKit's forecastDaily → our cached days. Tonight's low is the
 *  overnight part's low when WeatherKit sends one, else tomorrow's low, else
 *  the day's own. `dateOf` turns a forecastStart instant into a local date. */
export function forecastDaysFromWeatherKit(
  json: unknown,
  dateOf: (iso: string) => string,
): ForecastDay[] {
  const days = (json as { forecastDaily?: { days?: unknown[] } } | null)?.forecastDaily?.days;
  if (!Array.isArray(days)) return [];
  const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const out: ForecastDay[] = [];
  days.forEach((raw, i) => {
    const d = raw as {
      forecastStart?: string;
      temperatureMax?: number;
      temperatureMin?: number;
      overnightForecast?: { temperatureMin?: number };
    };
    if (typeof d?.forecastStart !== "string") return;
    const high = num(d.temperatureMax);
    const next = days[i + 1] as { temperatureMin?: number } | undefined;
    const low = num(d.overnightForecast?.temperatureMin) ?? num(next?.temperatureMin) ?? num(d.temperatureMin);
    if (high === null || low === null) return;
    out.push({ date: dateOf(d.forecastStart), high_c: high, low_c: low });
  });
  return out;
}
