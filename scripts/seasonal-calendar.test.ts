// The seasonal calendar (src/lib/seasonalCalendar.ts, backlog D3): every rule
// resolves to real dates in every year, every day has a card in every region,
// the moving holidays land on the right days, and every card has its title and
// body in English and Dutch.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { parseJsonc } from "@/lib/i18n/jsonc";
import {
  SEASONAL_CARDS,
  SEASONAL_REGIONS,
  cardForDate,
  cardsForDate,
  easterSunday,
  ruleWindow,
  seasonalCopyKeys,
  type SeasonalRegion,
  type SeasonalTopic,
} from "@/lib/seasonalCalendar";

let failed = 0;
function check(name: string, fn: () => void) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (e) {
    failed++;
    console.error(`not ok - ${name}\n`, e);
  }
}

const YEARS = Array.from({ length: 50 }, (_, i) => 2026 + i);
const REGIONS: (SeasonalRegion | undefined)[] = [undefined, ...SEASONAL_REGIONS];
const isoDay = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / 86_400_000;
function* everyDay(fromYear: number, toYear: number) {
  for (let t = Date.UTC(fromYear, 0, 1); t <= Date.UTC(toYear, 11, 31); t += 86_400_000) {
    yield new Date(t).toISOString().slice(0, 10);
  }
}
const pick = (date: string, region?: SeasonalRegion) => cardForDate(date, region)?.id;

check("card ids are unique and every card has a rule", () => {
  const ids = SEASONAL_CARDS.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const c of SEASONAL_CARDS) {
    assert.ok(/^[a-z][A-Za-z]+$/.test(c.id), c.id);
    assert.ok(c.rules.length > 0, c.id);
    assert.ok(c.topics.length > 0, c.id);
  }
});

check("every rule resolves to real dates in every year from 2026 to 2075", () => {
  for (const card of SEASONAL_CARDS) {
    for (const rule of card.rules) {
      for (const year of YEARS) {
        const { start, end } = ruleWindow(rule, year);
        assert.match(start, /^\d{4}-\d{2}-\d{2}$/, `${card.id} ${year}`);
        assert.match(end, /^\d{4}-\d{2}-\d{2}$/, `${card.id} ${year}`);
        assert.ok(start.startsWith(String(year)), `${card.id} ${year} starts in its year`);
        const length = isoDay(end) - isoDay(start) + 1;
        assert.ok(length >= 1, `${card.id} ${year}: ${start}..${end}`);
        if (card.kind === "holiday") {
          assert.ok(length <= 14, `${card.id} ${year} is a short window: ${start}..${end}`);
        }
      }
    }
  }
});

check("every day has a card, in every region and with none", () => {
  for (const region of REGIONS) {
    for (const date of everyDay(2026, 2075)) {
      assert.ok(cardForDate(date, region), `${date} ${region ?? "no region"}`);
    }
  }
});

check("exactly one season card covers each day", () => {
  for (const date of everyDay(2026, 2032)) {
    const seasons = cardsForDate(date).filter((c) => c.kind === "season");
    assert.equal(seasons.length, 1, `${date}: ${seasons.map((c) => c.id).join(", ")}`);
  }
});

check("a holiday wins over its season", () => {
  for (const region of REGIONS) {
    for (const date of everyDay(2026, 2032)) {
      const all = cardsForDate(date, region);
      if (all.some((c) => c.kind === "holiday")) assert.equal(all[0].kind, "holiday", date);
    }
  }
});

check("Easter lands on the right Sundays", () => {
  const known: Record<number, string> = {
    2024: "2024-03-31",
    2025: "2025-04-20",
    2026: "2026-04-05",
    2027: "2027-03-28",
    2028: "2028-04-16",
    2038: "2038-04-25",
    2285: "2285-03-22",
  };
  for (const [year, date] of Object.entries(known)) assert.equal(easterSunday(Number(year)), date);
  for (const year of YEARS)
    assert.equal(new Date(`${easterSunday(year)}T00:00:00Z`).getUTCDay(), 0);
});

check("the moving days fall where they should", () => {
  const card = (id: string) => SEASONAL_CARDS.find((c) => c.id === id)!;
  const rule = (id: string, region?: SeasonalRegion) =>
    card(id).rules.find((r) => r.region === region)!;
  // Thanksgiving 2026 is Thursday Nov 26; its card starts two days before.
  assert.deepEqual(ruleWindow(rule("thanksgiving", "us"), 2026), {
    start: "2026-11-24",
    end: "2026-11-26",
  });
  assert.deepEqual(ruleWindow(rule("thanksgiving", "us"), 2027), {
    start: "2027-11-23",
    end: "2027-11-25",
  });
  // Clocks in 2026: US Mar 8 and Nov 1, Europe Mar 29 and Oct 25.
  assert.equal(ruleWindow(rule("clocksForward", "us"), 2026).end, "2026-03-08");
  assert.equal(ruleWindow(rule("clocksForward", "nl"), 2026).end, "2026-03-29");
  assert.equal(ruleWindow(rule("clocksBack", "us"), 2026).end, "2026-11-01");
  assert.equal(ruleWindow(rule("clocksBack", "nl"), 2026).end, "2026-10-25");
  // A November card can start in October (US clocks, Nov 1 a Sunday).
  assert.equal(ruleWindow(rule("clocksBack", "us"), 2026).start, "2026-10-29");
  // King's Day moves to the 26th when the 27th is a Sunday (2025, 2031).
  assert.equal(ruleWindow(rule("kingsDay", "nl"), 2025).end, "2025-04-26");
  assert.equal(ruleWindow(rule("kingsDay", "nl"), 2026).end, "2026-04-27");
  assert.equal(ruleWindow(rule("kingsDay", "nl"), 2031).end, "2031-04-26");
  // February's season card ends on the 28th, or the 29th in a leap year.
  assert.equal(ruleWindow(card("winterDrafts").rules[0], 2027).end, "2027-02-28");
  assert.equal(ruleWindow(card("winterDrafts").rules[0], 2028).end, "2028-02-29");
});

check("the card for a day", () => {
  assert.equal(pick("2026-12-31"), "newYearFireworks");
  assert.equal(pick("2027-01-01", "nl"), "newYearFireworks");
  assert.equal(pick("2027-01-02"), "winterDryAir");
  assert.equal(pick("2026-07-04", "us"), "julyFourth");
  assert.equal(pick("2026-07-04", "nl"), "summerHeat");
  assert.equal(pick("2026-07-04"), "summerHeat");
  assert.equal(pick("2026-11-26", "us"), "thanksgiving");
  assert.equal(pick("2026-11-26", "nl"), "autumnHeating");
  assert.equal(pick("2026-12-05", "nl"), "sinterklaas");
  assert.equal(pick("2026-12-05", "us"), "winterDryAir");
  assert.equal(pick("2026-04-27", "nl"), "kingsDay");
  assert.equal(pick("2026-04-04"), "easter");
  assert.equal(pick("2026-12-24"), "holidayMeals");
  assert.equal(pick("2027-02-28"), "winterDrafts");
  assert.equal(pick("2028-02-29"), "winterDrafts");
  // Overlaps: the shorter window wins (Halloween over US clocks, 2026).
  assert.equal(pick("2026-10-30", "us"), "halloween");
  assert.equal(pick("2026-11-01", "us"), "clocksBack");
});

check("region cards stay in their region", () => {
  for (const date of everyDay(2026, 2030)) {
    for (const c of cardsForDate(date))
      assert.ok(
        c.rules.some((r) => !r.region),
        `${date} ${c.id}`,
      );
  }
});

check("an invalid date gives no card", () => {
  for (const bad of ["2026-02-30", "2027-02-29", "2026-13-01", "26-01-01", "", "2026-1-1"]) {
    assert.equal(cardForDate(bad), null, bad);
    assert.deepEqual(cardsForDate(bad), [], bad);
  }
});

check("the backlog's topics are all covered", () => {
  const topics = new Set<SeasonalTopic>(SEASONAL_CARDS.flatMap((c) => c.topics));
  for (const t of ["heat", "cold", "fireworks", "candles", "holiday-food", "travel"] as const) {
    assert.ok(topics.has(t), t);
  }
});

// ---- words ------------------------------------------------------------------
const en = parseJsonc(readFileSync("src/locales/seasonal.en.jsonc", "utf8")) as Record<
  string,
  string
>;
const nl = parseJsonc(readFileSync("src/locales/seasonal.nl.jsonc", "utf8")) as Record<
  string,
  string
>;
const expectedKeys = SEASONAL_CARDS.flatMap((c) => Object.values(seasonalCopyKeys(c))).sort();

check("every card has a title and body in English and Dutch, and nothing else", () => {
  assert.deepEqual(Object.keys(en).sort(), expectedKeys);
  assert.deepEqual(Object.keys(nl).sort(), expectedKeys);
  for (const key of expectedKeys) {
    for (const [lang, cat] of [
      ["en", en],
      ["nl", nl],
    ] as const) {
      assert.equal(typeof cat[key], "string", `${lang} ${key}`);
      assert.ok(cat[key].trim().length > 0, `${lang} ${key}`);
      assert.ok(!/\{\{/.test(cat[key]), `${lang} ${key} has no placeholders`);
      if (key.endsWith(".title")) {
        assert.ok(cat[key].length <= 45, `${lang} ${key} is short`);
        assert.ok(!cat[key].endsWith("."), `${lang} ${key} has no full stop`);
      } else {
        assert.ok(cat[key].length <= 200, `${lang} ${key} fits a card`);
      }
    }
  }
});

check("the Dutch is stamped against today's English, so the translate step keeps it", () => {
  const config = parseJsonc(readFileSync("src/locales/i18n.config.json", "utf8")) as {
    register: string;
    glossaryVersion: number;
  };
  const stamp = (v: string) =>
    createHash("sha256")
      .update(`${v} ${config.register} ${config.glossaryVersion}`)
      .digest("hex")
      .slice(0, 16);
  const expected = {
    keys: Object.fromEntries(Object.keys(en).map((k) => [k, { stamp: stamp(en[k]) }])),
  };
  const meta = JSON.parse(readFileSync("src/locales/.i18n-meta.seasonal.json", "utf8"));
  assert.deepEqual(meta, expected, `expected:\n${JSON.stringify(expected, null, 2)}`);
  assert.ok(
    readFileSync("scripts/i18n-translate.mjs", "utf8").includes('"seasonal.en.jsonc"'),
    "the translate step lists the seasonal catalog",
  );
});

if (failed) process.exit(1);
