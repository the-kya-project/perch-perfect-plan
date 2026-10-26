// The sitter's Emergency screen: which poison line is filled in when the owner
// left it empty, and which units the keep-warm range uses (poisonControl.ts).
import assert from "node:assert/strict";
import { defaultPoisonLine, regionForTimeZone, warmRange, ASPCA_POISON_LINE } from "@/lib/poisonControl";

let failed = 0;
function check(name: string, fn: () => void) {
  try { fn(); console.log(`ok - ${name}`); } catch (e) { failed++; console.error(`not ok - ${name}\n`, e); }
}

check("US zones, including the Indiana and Kentucky ones, are the US", () => {
  for (const tz of ["America/New_York", "America/Los_Angeles", "Pacific/Honolulu", "America/Indiana/Indianapolis", "America/Kentucky/Louisville", "America/Phoenix"]) {
    assert.equal(regionForTimeZone(tz), "us", tz);
  }
});
check("Canada, Mexico and Europe are not the US", () => {
  for (const tz of ["America/Toronto", "America/Vancouver", "America/Mexico_City", "Europe/Amsterdam", "Europe/London"]) {
    assert.equal(regionForTimeZone(tz), "elsewhere", tz);
  }
});
check("no or bad time zone is unknown", () => {
  assert.equal(regionForTimeZone(null), "unknown");
  assert.equal(regionForTimeZone("Not/AZone"), "unknown");
});
check("ASPCA is filled in only in the US", () => {
  assert.deepEqual(defaultPoisonLine("America/Chicago"), ASPCA_POISON_LINE);
  assert.equal(defaultPoisonLine("Europe/Amsterdam"), null);
  assert.equal(defaultPoisonLine("America/Toronto"), null);
  assert.equal(defaultPoisonLine(null), null);
});
check("Dutch always gets Celsius, even in the US", () => {
  assert.equal(warmRange("Europe/Amsterdam", "nl"), "29–32 °C");
  assert.equal(warmRange("America/New_York", "nl"), "29–32 °C");
  assert.equal(warmRange(null, "nl-NL"), "29–32 °C");
});
check("English: Fahrenheit in the US, Celsius elsewhere, both when unknown", () => {
  assert.equal(warmRange("America/New_York", "en"), "85–90 °F");
  assert.equal(warmRange("Europe/London", "en"), "29–32 °C");
  assert.equal(warmRange(null, "en"), "29–32 °C (85–90 °F)");
});

if (failed) process.exit(1);
