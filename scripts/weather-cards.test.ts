/**
 * Home's heat and cold cards (backlog D2.2).
 *
 *   npm run test:weather-cards
 *
 * Pins src/lib/weatherCards.ts (the ZIP and postcode rules, the thresholds in
 * both units, which card a forecast gives), the WeatherKit reading, that the
 * seasonal card stays exactly as it was when there's no weather card, that the
 * switch starts off everywhere, and that the ZIP never leaves the server.
 *
 * Plain asserts, since the repo carries no test runner. Exits non-zero on
 * failure so it can gate a merge.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  WEATHER_THRESHOLDS,
  areaKey,
  forecastDaysFromWeatherKit,
  forecastTimeZone,
  formatTemp,
  parseHomePostcode,
  toUnit,
  unitFor,
  weatherCardFor,
  type ForecastDay,
} from "@/lib/weatherCards";
import { CARE_FEATURES } from "@/lib/careFeatures";

let passed = 0;
function check(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ok   ${name}`); }
  catch (e) {
    console.log(`  FAIL ${name}\n       ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`);
    process.exitCode = 1;
  }
}

const US = { country: "US", postcode: "85004" } as const;
const NL = { country: "NL", postcode: "1012" } as const;
const day = (date: string, high_c: number, low_c: number): ForecastDay => ({ date, high_c, low_c });
const fToC = (f: number) => ((f - 32) * 5) / 9;

console.log("ZIP and postcode rules");
check("a 5-digit US ZIP, with or without its +4", () => {
  assert.deepEqual(parseHomePostcode("10001"), { country: "US", postcode: "10001" });
  assert.deepEqual(parseHomePostcode(" 10001-1234 "), { country: "US", postcode: "10001" });
  assert.deepEqual(parseHomePostcode("100011234"), { country: "US", postcode: "10001" });
  assert.deepEqual(parseHomePostcode("02134"), { country: "US", postcode: "02134" });
});
check("a Dutch postcode is kept as its 4 digits", () => {
  for (const s of ["1012", "1012AB", "1012 ab", "1012  AB"]) {
    assert.deepEqual(parseHomePostcode(s), { country: "NL", postcode: "1012" }, s);
  }
});
check("anything else is refused", () => {
  for (const s of ["", "abcde", "0123", "0123 AB", "00000", "1012 A", "1012 ABC", "SW1A 1AA", "H0H 0H0", "123456", "10115-", "12 345"]) {
    assert.equal(parseHomePostcode(s), null, JSON.stringify(s));
  }
});
check("the parser and the database agree on the shape", () => {
  const sql = readFileSync("supabase/migrations/20261128190000_weather_cards.sql", "utf8");
  assert.match(sql, /country = 'US' and postcode ~ '\^\[0-9\]\{5\}\$' and postcode <> '00000'/);
  assert.match(sql, /country = 'NL' and postcode ~ '\^\[1-9\]\[0-9\]\{3\}\$'/);
  assert.equal(areaKey(US), "US:85004");
  assert.equal(areaKey(NL), "NL:1012");
  assert.match(sql, /area ~ '\^\(US:\[0-9\]\{5\}\|NL:\[1-9\]\[0-9\]\{3\}\)\$'/);
});

console.log("Thresholds, in both units");
check("one place, in both units", () => {
  assert.deepEqual(WEATHER_THRESHOLDS, { heat: { F: 90, C: 32 }, cold: { F: 32, C: 0 } });
  assert.equal(unitFor("US"), "F");
  assert.equal(unitFor("NL"), "C");
  assert.equal(toUnit(32, "F"), 90);
  assert.equal(toUnit(0, "F"), 32);
  assert.equal(toUnit(-0.4, "C"), -0);
});
check("heat: today's high of 90°F or more in the US", () => {
  assert.equal(weatherCardFor([day("2026-07-01", fToC(89.4), 20)], "2026-07-01", US), null);
  const c = weatherCardFor([day("2026-07-01", fToC(89.6), 20)], "2026-07-01", US);
  assert.deepEqual(c, { kind: "heat", temp: 90, unit: "F", postcode: "85004" });
  assert.equal(formatTemp(c!), "90°F");
  assert.equal(weatherCardFor([day("2026-07-01", fToC(104), 28)], "2026-07-01", US)?.temp, 104);
});
check("heat: 32°C or more elsewhere", () => {
  assert.equal(weatherCardFor([day("2026-07-01", 31.4, 18)], "2026-07-01", NL), null);
  assert.deepEqual(weatherCardFor([day("2026-07-01", 31.5, 18)], "2026-07-01", NL), { kind: "heat", temp: 32, unit: "C", postcode: "1012" });
});
check("cold: tonight's low of 32°F or less in the US, 0°C or less elsewhere", () => {
  assert.equal(weatherCardFor([day("2026-01-10", 5, fToC(32.6))], "2026-01-10", US), null);
  assert.deepEqual(weatherCardFor([day("2026-01-10", 5, fToC(32.4))], "2026-01-10", US), { kind: "cold", temp: 32, unit: "F", postcode: "85004" });
  assert.equal(weatherCardFor([day("2026-01-10", 5, 0.6)], "2026-01-10", NL), null);
  assert.deepEqual(weatherCardFor([day("2026-01-10", 5, -3.2)], "2026-01-10", NL), { kind: "cold", temp: -3, unit: "C", postcode: "1012" });
  assert.equal(formatTemp({ temp: -3, unit: "C" }), "-3°C");
});
check("a day that is both shows heat", () => {
  assert.equal(weatherCardFor([day("2026-04-01", 33, -1)], "2026-04-01", NL)?.kind, "heat");
});
check("an ordinary day, another day's forecast, or no forecast: no card", () => {
  assert.equal(weatherCardFor([day("2026-05-01", 20, 10)], "2026-05-01", NL), null);
  assert.equal(weatherCardFor([day("2026-07-02", 40, 25)], "2026-07-01", NL), null);
  assert.equal(weatherCardFor([], "2026-07-01", NL), null);
  assert.equal(weatherCardFor(null, "2026-07-01", NL), null);
});

console.log("WeatherKit");
const dateOfNY = (iso: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
check("days come from forecastDaily; tonight's low is the overnight part's", () => {
  const json = {
    forecastDaily: {
      days: [
        { forecastStart: "2026-07-01T04:00:00Z", temperatureMax: 33.1, temperatureMin: 21.0, overnightForecast: { temperatureMin: 23.5 } },
        { forecastStart: "2026-07-02T04:00:00Z", temperatureMax: 30.0, temperatureMin: 19.0 },
        { forecastStart: "2026-07-03T04:00:00Z", temperatureMax: 29.0, temperatureMin: 18.0 },
      ],
    },
  };
  assert.deepEqual(forecastDaysFromWeatherKit(json, dateOfNY), [
    { date: "2026-07-01", high_c: 33.1, low_c: 23.5 },
    { date: "2026-07-02", high_c: 30.0, low_c: 18.0 },
    { date: "2026-07-03", high_c: 29.0, low_c: 18.0 },
  ]);
});
check("anything unexpected gives no days, never an error", () => {
  assert.deepEqual(forecastDaysFromWeatherKit(null, dateOfNY), []);
  assert.deepEqual(forecastDaysFromWeatherKit({}, dateOfNY), []);
  assert.deepEqual(forecastDaysFromWeatherKit({ forecastDaily: { days: [{ temperatureMax: 1 }, { forecastStart: "2026-07-01T04:00:00Z" }] } }, dateOfNY), []);
});
check("the forecast's time zone: Amsterdam for NL, the account's for the US", () => {
  assert.equal(forecastTimeZone("NL", "America/Chicago"), "Europe/Amsterdam");
  assert.equal(forecastTimeZone("US", "America/Phoenix"), "America/Phoenix");
  assert.equal(forecastTimeZone("US", null), "America/New_York");
});

console.log("Privacy and the switch");
const fn = readFileSync("src/lib/weather.functions.ts", "utf8");
const kit = readFileSync("src/lib/weatherKit.server.ts", "utf8");
check("WeatherKit gets the area's coordinates only, never the ZIP or the account", () => {
  assert.match(kit, /\$\{BASE\}\/\$\{lat\.toFixed\(2\)\}\/\$\{lon\.toFixed\(2\)\}\?dataSets=forecastDaily&timezone=/);
  assert.ok(!/postcode|userId|email/.test(kit.replace(/^\s*(\/\/|\*).*$/gm, "")), "weatherKit.server.ts mentions a postcode or account");
  assert.match(fn, /fetchDailyForecast\(place\.lat, place\.lon, timeZone\)/);
});
check("previews never call WeatherKit", () => {
  assert.match(kit, /process\.env\.VERCEL_ENV !== "preview"/);
});
check("the server asks the switch first, as the caller", () => {
  const sw = fn.indexOf('rpc("care_feature_enabled", { p_feature: "weather_cards" })');
  const row = fn.indexOf('.from("home_postcodes")');
  assert.ok(sw > 0 && row > sw, "the switch is read before the postcode");
});
check("the centroid files are server only", () => {
  const card = readFileSync("src/components/WeatherTodayCard.tsx", "utf8");
  const home = readFileSync("src/lib/homePostcode.ts", "utf8");
  for (const src of [card, home]) assert.ok(!/postcode-centroids|postcodeCentroids/.test(src));
  assert.match(fn, /await import\("@\/lib\/postcodeCentroids\.server"\)/);
});
check("weather_cards starts off in the code, the migration and the database check", () => {
  assert.deepEqual(CARE_FEATURES.find((f) => f.feature === "weather_cards"), { feature: "weather_cards", startsAt: "off" });
  const sql = readFileSync("supabase/migrations/20261128190000_weather_cards.sql", "utf8");
  assert.match(sql, /\('weather_cards', 'off',/);
  const checks = readFileSync("supabase/checks/care_features_checks.sql", "utf8");
  assert.match(checks, /"weather_cards": "off"/);
});
check("off, Home and Account read nothing about weather", () => {
  const seasonal = readFileSync("src/components/SeasonalTodayCard.tsx", "utf8");
  assert.match(seasonal, /useWeatherCard\(userId, [^)]*, weatherOn === true\)/);
  assert.match(seasonal, /const w = weatherOn === true \? weather\.data : undefined;/);
  const account = readFileSync("src/routes/_authenticated/account.index.tsx", "utf8");
  assert.match(account, /useHomePostcode\(userId, weatherOn\)/);
  assert.match(account, /\{weatherOn && row\(<MapPin/);
  const hooks = readFileSync("src/lib/homePostcode.ts", "utf8");
  assert.equal((hooks.match(/enabled: enabled && !!userId/g) ?? []).length, 2);
});
check("the weather card's Got it never touches the seasonal card's", () => {
  const hooks = readFileSync("src/lib/homePostcode.ts", "utf8");
  assert.ok(!/today_card_dismissals/.test(hooks));
  assert.match(hooks, /update\(\{ weather_dismissed_on: date \}\)/);
});

console.log(`\n${passed} passed${process.exitCode ? ", some FAILED" : ""}`);
