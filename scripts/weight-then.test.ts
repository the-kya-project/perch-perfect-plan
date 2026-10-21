/**
 * The weight page's "30 days / 90 days / 1 year ago" uses a weight logged near
 * that date, or none.
 *
 *   npm run test:weight-then
 *
 * It used to take the entry nearest the start of the range from every entry,
 * so a bird first weighed last week showed last week's weight as "1 year ago".
 * This pins src/lib/weightThen.ts: ±7 days for 30 days, ±14 for 90 days and
 * ±30 for a year.
 *
 * Plain asserts, since the repo carries no test runner. Exits non-zero on
 * failure so it can gate a merge.
 */
import assert from "node:assert/strict";
import { weightThen, weightNear, thenToleranceDays } from "@/lib/weightThen";

let passed = 0;
function check(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ok   ${name}`); }
  catch (e) {
    console.log(`  FAIL ${name}\n       ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`);
    process.exitCode = 1;
  }
}

const DAY = 86_400_000;
const NOW = Date.parse("2026-10-21T12:00:00Z");
const at = (daysAgo: number, grams: number) => ({ grams, measured_at: new Date(NOW - daysAgo * DAY).toISOString() });

check("tolerances per range", () => {
  assert.equal(thenToleranceDays(30), 7);
  assert.equal(thenToleranceDays(90), 14);
  assert.equal(thenToleranceDays(365), 30);
});

check("a bird first weighed last week has no weight a year ago", () => {
  const entries = [at(1, 400), at(6, 398)];
  assert.equal(weightThen(entries, 365, NOW), null);
  assert.equal(weightThen(entries, 90, NOW), null);
  assert.equal(weightThen(entries, 30, NOW), null);
});

check("picks the entry nearest the target inside the window", () => {
  const entries = [at(0, 400), at(25, 390), at(31, 385), at(40, 380)];
  assert.equal(weightThen(entries, 30, NOW)?.grams, 385);
});

check("the window edge counts, one day past it does not", () => {
  assert.equal(weightThen([at(37, 380)], 30, NOW)?.grams, 380);
  assert.equal(weightThen([at(38, 380)], 30, NOW), null);
  assert.equal(weightThen([at(104, 380)], 90, NOW)?.grams, 380);
  assert.equal(weightThen([at(105, 380)], 90, NOW), null);
  assert.equal(weightThen([at(335, 380)], 365, NOW)?.grams, 380);
  assert.equal(weightThen([at(334, 380)], 365, NOW), null);
});

check("no entries, or unparseable dates, give none", () => {
  assert.equal(weightThen([], 30, NOW), null);
  assert.equal(weightNear([{ measured_at: "not a date" }], NOW, 7), null);
});

console.log(`\n${passed} passed${process.exitCode ? " — WITH FAILURES" : ""}`);
