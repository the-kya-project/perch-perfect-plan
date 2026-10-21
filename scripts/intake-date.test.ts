/**
 * "Came to you" dates the app set on its own are never shown.
 *
 *   npm run test:intake-date
 *
 * Until 2026-10-21, Add a bird saved today's date as birds.intake_date for
 * every bird, though the field only showed for fosters. The migration
 * 20261021185000_intake_date_source.sql marks those rows 'auto' with the same
 * rule as looksAutoIntake; ownerIntakeDate hides them everywhere.
 *
 * Plain asserts, since the repo carries no test runner. Exits non-zero on
 * failure so it can gate a merge.
 */
import assert from "node:assert/strict";
import { looksAutoIntake, ownerIntakeDate } from "@/lib/intakeDate";

let passed = 0;
function check(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ok   ${name}`); }
  catch (e) {
    console.log(`  FAIL ${name}\n       ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`);
    process.exitCode = 1;
  }
}

check("ownerIntakeDate hides an automatic date", () => {
  assert.equal(ownerIntakeDate({ intake_date: "2026-08-01", intake_date_source: "auto" }), null);
});
check("ownerIntakeDate shows the owner's date", () => {
  assert.equal(ownerIntakeDate({ intake_date: "2026-08-01", intake_date_source: "owner" }), "2026-08-01");
});
check("ownerIntakeDate shows an unmarked (older, non-matching) date", () => {
  assert.equal(ownerIntakeDate({ intake_date: "2024-01-01", intake_date_source: null }), "2024-01-01");
  assert.equal(ownerIntakeDate({ intake_date: "2024-01-01" }), "2024-01-01");
});
check("ownerIntakeDate: nothing → null", () => {
  assert.equal(ownerIntakeDate(null), null);
  assert.equal(ownerIntakeDate({ intake_date: null, intake_date_source: "owner" }), null);
  assert.equal(ownerIntakeDate({ intake_date: "  " }), null);
});

const base = { is_foster: false, became_permanent_on: null };
check("non-foster, intake = creation day (UTC) → auto", () => {
  assert.equal(looksAutoIntake({ ...base, intake_date: "2026-08-01", created_at: "2026-08-01T15:00:00Z" }), true);
});
check("non-foster, local evening in the Americas (UTC already next day) → auto", () => {
  assert.equal(looksAutoIntake({ ...base, intake_date: "2026-10-19", created_at: "2026-10-20T02:00:00Z" }), true);
});
check("non-foster, local morning in Asia/Pacific (UTC still previous day) → auto", () => {
  assert.equal(looksAutoIntake({ ...base, intake_date: "2026-10-20", created_at: "2026-10-19T22:00:00Z" }), true);
});
check("two days off → not auto", () => {
  assert.equal(looksAutoIntake({ ...base, intake_date: "2026-08-03", created_at: "2026-08-01T15:00:00Z" }), false);
});
check("a foster's date was on screen → not auto", () => {
  assert.equal(looksAutoIntake({ ...base, is_foster: true, intake_date: "2026-08-01", created_at: "2026-08-01T15:00:00Z" }), false);
});
check("a foster made permanent keeps its date → not auto", () => {
  assert.equal(looksAutoIntake({ ...base, became_permanent_on: "2026-09-01", intake_date: "2026-08-01", created_at: "2026-08-01T15:00:00Z" }), false);
});
check("created after the fix → not auto", () => {
  assert.equal(looksAutoIntake({ ...base, intake_date: "2026-10-23", created_at: "2026-10-23T15:00:00Z" }), false);
});
check("no date → not auto", () => {
  assert.equal(looksAutoIntake({ ...base, intake_date: null, created_at: "2026-08-01T15:00:00Z" }), false);
});

console.log(`\n${passed} passed${process.exitCode ? ", some FAILED" : ""}`);
