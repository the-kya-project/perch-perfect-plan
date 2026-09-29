/**
 * Boundary tests for the monthly-recap eligibility rule.
 *
 *   npm run test:eligibility
 *
 * Plain asserts rather than a test framework: the repo carries no runner, and
 * adding one the day before a send is not the moment. Exits non-zero on the
 * first failure so it can gate a merge.
 */
import assert from "node:assert/strict";
import { eligibleForRecap, recapCutoff } from "@/lib/monthlyEligibility";

let passed = 0;
function check(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ok   ${name}`);
  } catch (e) {
    console.log(`  FAIL ${name}`);
    console.log(`       ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`);
    process.exitCode = 1;
  }
}

// September 2026 recap — the one going out on 2 October.
const Y = 2026;
const M = 9;

console.log("the cutoff itself");
check("is midnight UTC on the 15th", () =>
  assert.equal(recapCutoff(Y, M).toISOString(), "2026-09-15T00:00:00.000Z"));

console.log("\nthe boundary");
check("2026-09-14T23:59:59Z -> included", () =>
  assert.equal(eligibleForRecap("2026-09-14T23:59:59Z", Y, M), true));
check("2026-09-14T23:59:59.999Z -> included", () =>
  assert.equal(eligibleForRecap("2026-09-14T23:59:59.999Z", Y, M), true));
check("2026-09-15T00:00:00Z -> EXCLUDED (strictly before)", () =>
  assert.equal(eligibleForRecap("2026-09-15T00:00:00Z", Y, M), false));
check("2026-09-15T00:00:00.001Z -> excluded", () =>
  assert.equal(eligibleForRecap("2026-09-15T00:00:00.001Z", Y, M), false));

console.log("\nnormal cases");
check("signed up in July -> included", () =>
  assert.equal(eligibleForRecap("2026-07-15T12:00:00Z", Y, M), true));
check("signed up 2026-09-25 -> excluded", () =>
  assert.equal(eligibleForRecap("2026-09-25T10:00:00Z", Y, M), false));
check("signed up today -> excluded", () =>
  assert.equal(eligibleForRecap(new Date().toISOString(), Y, M), false));
check("signed up after the recap month entirely -> excluded", () =>
  assert.equal(eligibleForRecap("2026-10-01T00:00:00Z", Y, M), false));

console.log("\ntimezone traps");
// A +14:00 local wall-clock of the 15th is still the 14th in UTC, so it is IN.
check("2026-09-15T13:00:00+14:00 (= 09-14T23:00Z) -> included", () =>
  assert.equal(eligibleForRecap("2026-09-15T13:00:00+14:00", Y, M), true));
// A -11:00 wall-clock of the 14th is already the 15th in UTC, so it is OUT.
check("2026-09-14T14:00:00-11:00 (= 09-15T01:00Z) -> excluded", () =>
  assert.equal(eligibleForRecap("2026-09-14T14:00:00-11:00", Y, M), false));
check("a Date object works the same as a string", () =>
  assert.equal(eligibleForRecap(new Date("2026-09-14T23:59:59Z"), Y, M), true));

console.log("\nbad input is never eligible");
check("null -> excluded", () => assert.equal(eligibleForRecap(null, Y, M), false));
check("undefined -> excluded", () => assert.equal(eligibleForRecap(undefined, Y, M), false));
check("unparseable -> excluded", () => assert.equal(eligibleForRecap("not a date", Y, M), false));

console.log("\nother months");
check("January recap cuts at 2026-01-15", () =>
  assert.equal(recapCutoff(2026, 1).toISOString(), "2026-01-15T00:00:00.000Z"));
check("December recap cuts at 2026-12-15", () =>
  assert.equal(recapCutoff(2026, 12).toISOString(), "2026-12-15T00:00:00.000Z"));
check("a December signup is not eligible for the December recap until it is early enough", () =>
  assert.equal(eligibleForRecap("2026-12-20T00:00:00Z", 2026, 12), false));

console.log(`\n${passed} passed${process.exitCode ? ", WITH FAILURES" : ", no failures"}`);
