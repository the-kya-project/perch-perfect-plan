/**
 * A sit's days are the OWNER's days.
 *
 *   npm run test:sit-time-zone
 *
 * The sitter link now ends at the end of the last day in the sit's saved time
 * zone (sits.time_zone, see the 20261021160000_sit_time_zone migration), and the
 * sitter view's "Day 2 of 3" / "Last day" line counts days in that same zone.
 * This pins src/lib/sitTimeZone.ts: the date in a zone, and where a day falls in
 * a sit — "Last day" only on the end date, never after it.
 *
 * Plain asserts, since the repo carries no test runner. Exits non-zero on
 * failure so it can gate a merge.
 */
import assert from "node:assert/strict";
import { dateInTimeZone, isValidTimeZone, sitPhase } from "@/lib/sitTimeZone";
import { allTimeZones, pickSitTimeZone, searchTimeZones, timeZoneCity, timeZoneParts, timeZoneRowLabel } from "@/lib/sitTimeZoneNames";

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

check("a California evening is still the same day in the owner's zone", () => {
  // 7:30pm Oct 25 in Los Angeles is already Oct 26 in UTC.
  const at = new Date("2026-10-26T02:30:00Z");
  assert.equal(dateInTimeZone("America/Los_Angeles", at), "2026-10-25");
  assert.equal(dateInTimeZone("UTC", at), "2026-10-26");
});

check("the sit's zone wins over the device's", () => {
  const at = new Date("2026-10-26T02:30:00Z");
  // A sitter's phone in Amsterdam still counts the owner's Los Angeles day.
  assert.equal(inZone("Europe/Amsterdam", () => dateInTimeZone("America/Los_Angeles", at)), "2026-10-25");
});

check("no zone, or an unknown one, falls back to the device's date", () => {
  const at = new Date("2026-10-26T02:30:00Z");
  assert.equal(inZone("America/New_York", () => dateInTimeZone(null, at)), "2026-10-25");
  assert.equal(inZone("America/New_York", () => dateInTimeZone("Not/AZone", at)), "2026-10-25");
  assert.equal(inZone("Asia/Tokyo", () => dateInTimeZone(undefined, at)), "2026-10-26");
});

check("zones across the date line and DST", () => {
  assert.equal(dateInTimeZone("Pacific/Kiritimati", new Date("2026-12-31T10:30:00Z")), "2027-01-01");
  assert.equal(dateInTimeZone("Pacific/Pago_Pago", new Date("2026-12-31T10:30:00Z")), "2026-12-30");
  // US DST ends Nov 1 2026: 11:30pm EST on Nov 1 is 04:30Z Nov 2.
  assert.equal(dateInTimeZone("America/New_York", new Date("2026-11-02T04:30:00Z")), "2026-11-01");
});

check("isValidTimeZone", () => {
  assert.equal(isValidTimeZone("America/Los_Angeles"), true);
  assert.equal(isValidTimeZone("UTC"), true);
  assert.equal(isValidTimeZone(""), false);
  assert.equal(isValidTimeZone(null), false);
  assert.equal(isValidTimeZone("Mars/Olympus_Mons"), false);
});

check("before the sit", () => {
  assert.deepEqual(sitPhase("2026-10-22", "2026-10-23", "2026-10-25"), { kind: "before", daysUntilStart: 1 });
});

check("during the sit counts days and days left", () => {
  assert.deepEqual(sitPhase("2026-10-23", "2026-10-23", "2026-10-25"), { kind: "during", day: 1, total: 3, daysLeft: 2 });
  assert.deepEqual(sitPhase("2026-10-24", "2026-10-23", "2026-10-25"), { kind: "during", day: 2, total: 3, daysLeft: 1 });
});

check("last day only on the end date", () => {
  assert.deepEqual(sitPhase("2026-10-25", "2026-10-23", "2026-10-25"), { kind: "lastDay", day: 3, total: 3 });
  // A one-day sit is its own last day.
  assert.deepEqual(sitPhase("2026-10-25", "2026-10-25", "2026-10-25"), { kind: "lastDay", day: 1, total: 1 });
});

check("never 'last day' after the sit has ended", () => {
  assert.deepEqual(sitPhase("2026-10-26", "2026-10-23", "2026-10-25"), { kind: "after" });
  assert.deepEqual(sitPhase("2026-11-30", "2026-10-23", "2026-10-25"), { kind: "after" });
});

check("month and DST boundaries count calendar days", () => {
  assert.deepEqual(sitPhase("2026-11-01", "2026-10-30", "2026-11-03"), { kind: "during", day: 3, total: 5, daysLeft: 2 });
  assert.equal(inZone("America/New_York", () => sitPhase("2026-11-02", "2026-10-31", "2026-11-02").kind), "lastDay");
});

check("missing or broken dates are unknown", () => {
  assert.deepEqual(sitPhase("2026-10-24", null, "2026-10-25"), { kind: "unknown" });
  assert.deepEqual(sitPhase("2026-10-24", "2026-10-23", ""), { kind: "unknown" });
  assert.deepEqual(sitPhase("2026-10-24", "2026-10-26", "2026-10-25"), { kind: "unknown" });
});

check("the owner's zone moves the last day for a late-evening sitter", () => {
  // Sit ends Oct 25. At 8pm Oct 25 in Los Angeles (03:00Z Oct 26) the sitter is
  // on the last day, not past it.
  const at = new Date("2026-10-26T03:00:00Z");
  assert.equal(sitPhase(dateInTimeZone("America/Los_Angeles", at), "2026-10-23", "2026-10-25").kind, "lastDay");
  assert.equal(sitPhase(dateInTimeZone("UTC", at), "2026-10-23", "2026-10-25").kind, "after");
});

// ---- The account's home zone (profiles.time_zone, 20261021180000) ----------

check("a sit uses the account zone, not the travelling device's", () => {
  assert.deepEqual(pickSitTimeZone("America/Los_Angeles", "Europe/Paris"), { zone: "America/Los_Angeles", saveToAccount: false });
});

check("before the account has a zone, the device's is used and saved to it", () => {
  assert.deepEqual(pickSitTimeZone(null, "Europe/Paris"), { zone: "Europe/Paris", saveToAccount: true });
  assert.deepEqual(pickSitTimeZone("Not/AZone", "Europe/Paris"), { zone: "Europe/Paris", saveToAccount: true });
  assert.deepEqual(pickSitTimeZone(null, null), { zone: null, saveToAccount: false });
});

check("a zone reads as region and city, with the offset now", () => {
  const winter = new Date("2026-01-15T12:00:00Z");
  const p = timeZoneParts("America/Los_Angeles", "en-US", winter);
  assert.equal(p.city, "Los Angeles");
  assert.equal(p.label, "Pacific Time — Los Angeles");
  assert.equal(p.offset, "GMT-8");
  assert.equal(timeZoneParts("America/Los_Angeles", "en-US", new Date("2026-07-15T12:00:00Z")).offset, "GMT-7");
  assert.equal(timeZoneRowLabel("America/Los_Angeles", "en-US", winter), "Pacific Time — Los Angeles (GMT-8)");
});

check("nested and underscored ids give a plain city", () => {
  assert.equal(timeZoneCity("America/Argentina/Buenos_Aires"), "Buenos Aires");
  assert.equal(timeZoneCity("UTC"), "UTC");
  const utc = timeZoneParts("UTC", "en-US");
  assert.ok(utc.label.includes("UTC") || utc.label.includes("Coordinated"), utc.label);
});

check("the zone list is never empty and keeps the saved alias", () => {
  const zones = allTimeZones(["Asia/Calcutta", "Not/AZone", null]);
  assert.ok(zones.length > 50);
  assert.ok(zones.includes("UTC"));
  assert.ok(zones.includes("America/New_York"));
  assert.ok(zones.includes("Asia/Calcutta") || zones.includes("Asia/Kolkata"));
  assert.ok(!zones.includes("Not/AZone"));
  assert.equal(new Set(zones).size, zones.length);
});

check("search finds a zone by city, region, offset or id", () => {
  const at = new Date("2026-01-15T12:00:00Z");
  const zones = allTimeZones().map((z) => timeZoneParts(z, "en-US", at));
  const ids = (q: string) => searchTimeZones(zones, q).map((z) => z.id);
  assert.ok(ids("los ang").includes("America/Los_Angeles"));
  assert.ok(ids("Pacific time").includes("America/Los_Angeles"));
  assert.ok(ids("new_york").includes("America/New_York"));
  // ICU lists it as America/Buenos_Aires or America/Argentina/Buenos_Aires.
  assert.ok(searchTimeZones(zones, "buenos aires").some((z) => z.city === "Buenos Aires"));
  assert.ok(ids("gmt-8").includes("America/Los_Angeles"));
  assert.ok(ids("amsterdam").includes("Europe/Amsterdam"));
  assert.equal(searchTimeZones(zones, "  ").length, zones.length);
  assert.equal(ids("zzzz nowhere").length, 0);
});

console.log(`\n${passed} passed${process.exitCode ? ", some FAILED" : ""}`);
