/**
 * Home's seasonal and holiday Today card (backlog D2.1).
 *
 *   npm run test:today-card
 *
 * Pins src/lib/todayCard.ts (which card, for which day and country), that the
 * app loads the card words in both languages, that the card is read only after
 * the page loads (the iPhone hydration check), that it never calls the Flock's
 * Today's idea, and that the `today_cards` switch starts off in the code, the
 * migration and the database check alike.
 *
 * Plain asserts, since the repo carries no test runner. Exits non-zero on
 * failure so it can gate a merge.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { seasonalRegionForTimeZone, todayCardFor } from "@/lib/todayCard";
import { SEASONAL_CARDS } from "@/lib/seasonalCalendar";
import { localDateISO } from "@/lib/localDay";
import { CARE_FEATURES } from "@/lib/careFeatures";
import { resources } from "@/lib/i18n/catalogs";

let passed = 0;
function check(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ok   ${name}`); }
  catch (e) {
    console.log(`  FAIL ${name}\n       ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`);
    process.exitCode = 1;
  }
}

function inZone<T>(tz: string, fn: () => T): T {
  const prev = process.env.TZ;
  process.env.TZ = tz;
  try { return fn(); } finally { process.env.TZ = prev; }
}

const id = (date: string, tz: string | null) => todayCardFor(date, tz)?.card.id ?? null;

console.log("Country from the time zone");
check("US zones are us", () => {
  for (const tz of ["America/New_York", "America/Chicago", "America/Denver", "America/Phoenix", "America/Los_Angeles", "America/Anchorage", "Pacific/Honolulu", "America/Indiana/Indianapolis", "US/Eastern"]) {
    assert.equal(seasonalRegionForTimeZone(tz), "us", tz);
  }
});
check("Amsterdam is nl", () => assert.equal(seasonalRegionForTimeZone("Europe/Amsterdam"), "nl"));
check("anywhere else, blank or missing is neither", () => {
  for (const tz of ["America/Toronto", "America/Mexico_City", "Europe/Brussels", "Europe/London", "Asia/Tokyo", "UTC", "", "  ", null, undefined]) {
    assert.equal(seasonalRegionForTimeZone(tz as string | null | undefined), null, String(tz));
  }
});

console.log("Which card");
check("Thanksgiving week in the US, the heating card elsewhere", () => {
  // Thanksgiving 2026 is Thursday Nov 26; the card runs Nov 24–26.
  assert.equal(id("2026-11-24", "America/Chicago"), "thanksgiving");
  assert.equal(id("2026-11-26", "America/Los_Angeles"), "thanksgiving");
  assert.equal(id("2026-11-26", "Europe/Amsterdam"), "autumnHeating");
  assert.equal(id("2026-11-26", null), "autumnHeating");
});
check("Fourth of July for the US only", () => {
  assert.equal(id("2026-07-04", "America/New_York"), "julyFourth");
  assert.equal(id("2026-07-04", "Europe/Amsterdam"), "summerHeat");
});
check("King's Day and Sinterklaas for the Netherlands only", () => {
  assert.equal(id("2026-04-27", "Europe/Amsterdam"), "kingsDay");
  assert.equal(id("2026-04-27", "America/New_York"), "springCleaning");
  assert.equal(id("2026-12-05", "Europe/Amsterdam"), "sinterklaas");
  assert.equal(id("2026-12-05", "America/New_York"), "winterDryAir");
});
check("cards for everyone show everywhere", () => {
  for (const tz of ["America/New_York", "Europe/Amsterdam", "Asia/Tokyo", null]) {
    assert.equal(id("2026-12-31", tz), "newYearFireworks", String(tz));
    assert.equal(id("2027-01-01", tz), "newYearFireworks", String(tz));
  }
});
check("every day of a year has a card in every country", () => {
  for (const tz of ["America/New_York", "Europe/Amsterdam", null]) {
    for (let d = new Date(Date.UTC(2027, 0, 1)); d.getUTCFullYear() === 2027; d.setUTCDate(d.getUTCDate() + 1)) {
      const iso = d.toISOString().slice(0, 10);
      assert.ok(todayCardFor(iso, tz), `${iso} ${tz}`);
    }
  }
});
check("an invalid date shows nothing", () => {
  assert.equal(todayCardFor("2026-02-30", "America/New_York"), null);
  assert.equal(todayCardFor("", null), null);
});

console.log("The reader's own date");
check("the evening of Nov 23 in California is still Nov 23 (not UTC's Nov 24)", () => {
  // 2026-11-24 03:30 UTC = Nov 23, 7:30 PM in Los Angeles.
  const at = new Date(Date.UTC(2026, 10, 24, 3, 30));
  inZone("America/Los_Angeles", () => {
    const date = localDateISO(at);
    assert.equal(date, "2026-11-23");
    assert.equal(id(date, "America/Los_Angeles"), "autumnHeating");
  });
  inZone("Europe/Amsterdam", () => assert.equal(localDateISO(at), "2026-11-24"));
});
check("late on Thanksgiving in Hawaii (already Friday in UTC) still shows Thanksgiving", () => {
  // 2026-11-27 08:00 UTC = Nov 26, 10 PM in Honolulu.
  inZone("Pacific/Honolulu", () => {
    const date = localDateISO(new Date(Date.UTC(2026, 10, 27, 8, 0)));
    assert.equal(id(date, "Pacific/Honolulu"), "thanksgiving");
  });
});

console.log("Words in both languages");
check("the app loads every card's title and body in English and Dutch", () => {
  for (const lng of ["en", "nl"] as const) {
    const ns = resources[lng].seasonal as Record<string, string>;
    for (const card of SEASONAL_CARDS) {
      for (const key of [`seasonal.${card.id}.title`, `seasonal.${card.id}.body`]) {
        assert.ok(typeof ns[key] === "string" && ns[key].trim().length > 0, `${lng} ${key}`);
      }
    }
  }
});
check("the i18n runtime lists the seasonal namespace", () => {
  const src = readFileSync("src/lib/i18n/i18n.ts", "utf8");
  assert.match(src, /ns:\s*\[[^\]]*"seasonal"/);
});

console.log("Home and the switch");
const card = readFileSync("src/components/SeasonalTodayCard.tsx", "utf8");
check("the date is read in an effect, never during render", () => {
  const effect = card.indexOf("useEffect(");
  assert.ok(effect > 0, "no useEffect");
  const firstDateRead = card.indexOf("localDateISO()");
  assert.ok(firstDateRead > effect, "localDateISO() is called before the effect");
  assert.ok(!/new Date\(/.test(card), "the card reads the clock outside localDateISO");
  assert.match(card, /if \(enabled !== true \|\| !day\) return null;/);
});
check("the card reads its own switch and never the Flock's Today's idea", () => {
  assert.match(card, /useCareFeature\("today_cards"\)/);
  assert.ok(!/flock_todays_idea|flock_enabled|@\/lib\/flock/.test(card));
});
check("Home shows the card outside the onboarding tour's demo", () => {
  const home = readFileSync("src/routes/_authenticated/dashboard.tsx", "utf8");
  assert.match(home, /\{!demo && <SeasonalTodayCard homeTimeZone=\{me\?\.timeZone\} \/>\}/);
});
check("today_cards starts off in the code, the migration and the database check", () => {
  const expected = Object.fromEntries(CARE_FEATURES.map((f) => [f.feature, f.startsAt]));
  assert.deepEqual(expected, { today_cards: "off" });
  const migration = readFileSync("supabase/migrations/20261123100000_care_features.sql", "utf8");
  for (const f of CARE_FEATURES) {
    assert.match(migration, new RegExp(`\\('${f.feature}', '${f.startsAt}',`), `migration seeds ${f.feature}`);
  }
  const seeded = [...migration.matchAll(/^\s*\('([a-z_]+)', '(off|admins|everyone)',/gm)].map((m) => m[1]);
  assert.deepEqual(seeded.sort(), CARE_FEATURES.map((f) => f.feature).sort(), "migration seeds exactly CARE_FEATURES");
  const sqlCheck = readFileSync("supabase/checks/care_features_checks.sql", "utf8");
  const m = /expected_features jsonb := '([^']+)'/.exec(sqlCheck);
  assert.ok(m, "no expected_features in the check");
  assert.deepEqual(JSON.parse(m![1]), expected);
});

console.log(`\n${passed} passed${process.exitCode ? ", some FAILED" : ""}`);
