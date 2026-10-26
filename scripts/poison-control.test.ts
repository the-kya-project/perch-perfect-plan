// The sitter's Emergency screen: which poison line is filled in when the owner
// left it empty, and which units the keep-warm range uses (poisonControl.ts).
import assert from "node:assert/strict";
import {
  defaultPoisonLine, defaultPoisonLines, regionForTimeZone, warmRange,
  ASPCA_POISON_LINE, PET_POISON_HELPLINE, UK_ANIMAL_POISONLINE, AU_ANIMAL_POISONS_HELPLINE,
} from "@/lib/poisonControl";

let failed = 0;
function check(name: string, fn: () => void) {
  try { fn(); console.log(`ok - ${name}`); } catch (e) { failed++; console.error(`not ok - ${name}\n`, e); }
}

check("US zones, including the Indiana and Kentucky ones, are the US", () => {
  for (const tz of ["America/New_York", "America/Los_Angeles", "Pacific/Honolulu", "America/Indiana/Indianapolis", "America/Kentucky/Louisville", "America/Phoenix"]) {
    assert.equal(regionForTimeZone(tz), "us", tz);
  }
});
check("the UK is Great Britain and Northern Ireland only", () => {
  for (const tz of ["Europe/London", "Europe/Belfast", "GB"]) assert.equal(regionForTimeZone(tz), "uk", tz);
  for (const tz of ["Europe/Jersey", "Europe/Isle_of_Man", "Europe/Dublin"]) assert.equal(regionForTimeZone(tz), "elsewhere", tz);
});
check("every Australian zone is Australia", () => {
  for (const tz of ["Australia/Sydney", "Australia/Perth", "Australia/Darwin", "Australia/Lord_Howe"]) {
    assert.equal(regionForTimeZone(tz), "au", tz);
  }
});
check("Canada, Mexico, New Zealand and the Netherlands are elsewhere", () => {
  for (const tz of ["America/Toronto", "America/Vancouver", "America/Mexico_City", "Pacific/Auckland", "Europe/Amsterdam"]) {
    assert.equal(regionForTimeZone(tz), "elsewhere", tz);
  }
});
check("no or bad time zone is unknown", () => {
  assert.equal(regionForTimeZone(null), "unknown");
  assert.equal(regionForTimeZone("Not/AZone"), "unknown");
});
check("US: ASPCA first, Pet Poison Helpline second", () => {
  assert.deepEqual(defaultPoisonLines("America/Chicago"), [ASPCA_POISON_LINE, PET_POISON_HELPLINE]);
  assert.deepEqual(defaultPoisonLine("America/Chicago"), ASPCA_POISON_LINE);
});
check("UK and Australia: their own national line", () => {
  assert.deepEqual(defaultPoisonLines("Europe/London"), [UK_ANIMAL_POISONLINE]);
  assert.deepEqual(defaultPoisonLines("Australia/Melbourne"), [AU_ANIMAL_POISONS_HELPLINE]);
});
check("the Netherlands, elsewhere and unknown: no number", () => {
  for (const tz of ["Europe/Amsterdam", "America/Toronto", "Pacific/Auckland", null]) {
    assert.deepEqual(defaultPoisonLines(tz), [], String(tz));
    assert.equal(defaultPoisonLine(tz), null, String(tz));
  }
});
check("Dutch always gets Celsius, even in the US", () => {
  assert.equal(warmRange("Europe/Amsterdam", "nl"), "29–32 °C");
  assert.equal(warmRange("America/New_York", "nl"), "29–32 °C");
  assert.equal(warmRange(null, "nl-NL"), "29–32 °C");
});
check("English: Fahrenheit in the US, Celsius elsewhere, both when unknown", () => {
  assert.equal(warmRange("America/New_York", "en"), "85–90 °F");
  assert.equal(warmRange("Europe/London", "en"), "29–32 °C");
  assert.equal(warmRange("Australia/Sydney", "en"), "29–32 °C");
  assert.equal(warmRange(null, "en"), "29–32 °C (85–90 °F)");
});

if (failed) process.exit(1);
