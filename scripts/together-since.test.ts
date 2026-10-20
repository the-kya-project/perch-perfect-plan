/**
 * "[n] years together" counts full years since the came-home date.
 *
 *   npm run test:together-since
 *
 * The moments card used to count to the NEXT anniversary, so a bird home since
 * Sep 13, 2024 read "3 years together" on Oct 20, 2026. This pins the
 * birthday-style count in src/lib/togetherSince.ts.
 *
 * Plain asserts, since the repo carries no test runner. Exits non-zero on
 * failure so it can gate a merge.
 */
import assert from "node:assert/strict";
import { togetherSince, occurredYears } from "@/lib/togetherSince";

let passed = 0;
function check(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ok   ${name}`); }
  catch (e) {
    console.log(`  FAIL ${name}\n       ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`);
    process.exitCode = 1;
  }
}

const day = (iso: string) => { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d, 12); };

check("Sep 13, 2024 → Oct 20, 2026 is 2 years, not 3", () => {
  assert.deepEqual(togetherSince("2024-09-13", day("2026-10-20")), { unit: "years", count: 2 });
});
check("the day before the anniversary is still the lower count", () => {
  assert.deepEqual(togetherSince("2024-09-13", day("2026-09-12")), { unit: "years", count: 1 });
});
check("the anniversary itself counts", () => {
  assert.deepEqual(togetherSince("2024-09-13", day("2026-09-13")), { unit: "years", count: 2 });
});
check("exactly one year", () => {
  assert.deepEqual(togetherSince("2025-10-20", day("2026-10-20")), { unit: "years", count: 1 });
});
check("eleven full months stays in months", () => {
  assert.deepEqual(togetherSince("2025-11-01", day("2026-10-20")), { unit: "months", count: 11 });
});
check("one full month", () => {
  assert.deepEqual(togetherSince("2026-09-20", day("2026-10-20")), { unit: "months", count: 1 });
});
check("a month not yet complete is less than a month", () => {
  assert.deepEqual(togetherSince("2026-09-21", day("2026-10-20")), { unit: "lessThanMonth", count: 0 });
});
check("came home today", () => {
  assert.deepEqual(togetherSince("2026-10-20", day("2026-10-20")), { unit: "lessThanMonth", count: 0 });
});
check("a future date never goes negative", () => {
  assert.deepEqual(togetherSince("2027-01-01", day("2026-10-20")), { unit: "lessThanMonth", count: 0 });
});
check("Feb 29 counts on Mar 1 in a non-leap year", () => {
  assert.deepEqual(togetherSince("2024-02-29", day("2025-02-28")), { unit: "months", count: 11 });
  assert.deepEqual(togetherSince("2024-02-29", day("2025-03-01")), { unit: "years", count: 1 });
});
check("across a year boundary", () => {
  assert.deepEqual(togetherSince("2019-12-31", day("2026-01-01")), { unit: "years", count: 6 });
});
check("occurred years include this year once the date has passed", () => {
  assert.deepEqual(occurredYears("2024-09-13", day("2026-10-20")), [2024, 2025, 2026]);
});
check("occurred years leave out this year before the date", () => {
  assert.deepEqual(occurredYears("2024-11-02", day("2026-10-20")), [2024, 2025]);
});

console.log(`\n${passed} passed${process.exitCode ? ", some FAILED" : ""}`);
